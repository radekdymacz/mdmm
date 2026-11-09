#include "mdFactorySource.h"

#include "mdLib/mdhardware.h"

#include "synthLib/audioTypes.h"
#include "synthLib/midiTypes.h"

#include <array>
#include <memory>

namespace mdJucePlugin
{
	namespace
	{
		constexpr uint32_t g_block = 64;
		constexpr uint32_t g_rate = 44100;

		// A model's dumps: its SysEx product id, the seconds its start-up animation runs on after it takes MIDI (the
		// dumps need not wait for it on the Machinedrum; the Monomachine's ends 9.2 s after power-on, MM-P0-RESULT
		// section 6), and per kind the dump id (the request is id + 1) and the slots.
		struct Kind
		{
			uint8_t reply;
			uint8_t slots;
		};
		struct Spec
		{
			uint8_t product;
			uint32_t settleSeconds;
			Kind kinds[3];
			const char* name;
		};
		constexpr Spec g_md{0x02, 2, {{0x52, 64}, {0x67, 128}, {0x69, 32}}, "Machinedrum"};
		constexpr Spec g_mm{0x03, 9, {{0x52, 128}, {0x67, 128}, {0x69, 24}}, "Monomachine"};
		const Spec& specOf(const md::MachineModel _model) { return _model == md::MachineModel::Monomachine ? g_mm : g_md; }

		// The headless machine: blocks of audio rendered and dropped, its SysEx kept.
		class Machine
		{
		public:
			Machine(const std::vector<uint8_t>& _rom, const std::string& _name, const md::MachineModel _model) : m_hw(_rom, _name, _model, {})
			{
				for(auto& o : m_out)
					o.resize(g_block);
				for(size_t c = 0; c < m_out.size(); ++c)
					m_outputs[c] = m_out[c].data();
			}
			bool valid() const { return m_hw.isValid(); }
			bool midiReady() const { return m_hw.isFirmwareMidiReady(); }

			void step()
			{
				m_hw.processAudio(m_outputs, g_block, 0);
				m_events.clear();
				m_hw.readMidiOut(m_events);
				for(const auto& e : m_events)
					if(!e.sysex.empty())
						m_rx.emplace_back(e.sysex.begin(), e.sysex.end());
				m_frames += g_block;
			}
			uint64_t frames() const { return m_frames; }

			// A request, then the first reply with _reply as its command, within _ms of machine time ({} if none, or
			// when _stop is set: the owner's destructor waits for this thread)
			std::vector<uint8_t> request(const std::vector<uint8_t>& _request, const uint8_t _reply, const double _ms,
				const std::atomic<bool>* _stop)
			{
				m_rx.clear();
				synthLib::SMidiEvent e(synthLib::MidiEventSource::Host);
				e.sysex.assign(_request.begin(), _request.end());
				m_hw.sendMidi(e);
				const auto end = m_frames + static_cast<uint64_t>(_ms * g_rate / 1000.0);
				while(m_frames < end)
				{
					if(_stop && _stop->load())
						return {};
					for(const auto& m : m_rx)
						if(m.size() > 10 && m[6] == _reply && m.back() == 0xf7)
							return m;
					step();
				}
				return {};
			}

		private:
			md::Hardware m_hw;
			std::array<std::vector<float>, 6> m_out;
			synthLib::TAudioOutputs m_outputs{};
			std::vector<synthLib::SMidiEvent> m_events;
			std::vector<std::vector<uint8_t>> m_rx;
			uint64_t m_frames = 0;
		};
	}

	MdFactorySource::~MdFactorySource()
	{
		m_stop = true;
		if(m_thread.joinable())
			m_thread.join();
	}

	int MdFactorySource::total(const md::MachineModel _model)
	{
		int n = 0;
		for(const auto& k : specOf(_model).kinds)
			n += k.slots;
		return n;
	}

	bool MdFactorySource::start(Bytes _rom, std::string _romName, const md::MachineModel _model)
	{
		if(m_running)
			return false;
		if(m_thread.joinable())
			m_thread.join();
		m_stop = false;
		m_progress = 0;
		m_running = true;
		m_thread = std::thread([this, rom = std::move(_rom), name = std::move(_romName), _model]
		{
			auto r = read(rom, name, _model, &m_progress, &m_stop);
			{
				const std::lock_guard l(m_mutex);
				m_result = std::move(r);
			}
			m_running = false;
		});
		return true;
	}

	std::optional<MdFactorySource::Result> MdFactorySource::take()
	{
		if(m_running)
			return std::nullopt;
		const std::lock_guard l(m_mutex);
		auto r = std::move(m_result);
		m_result.reset();
		return r;
	}

	MdFactorySource::Result MdFactorySource::read(const Bytes& _rom, const std::string& _romName, const md::MachineModel _model,
		std::atomic<int>* _progress, const std::atomic<bool>* _stop)
	{
		Result r;
		const auto& spec = specOf(_model);
		const std::string second = std::string("The second ") + spec.name;
		const auto stopped = [_stop] { return _stop && _stop->load(); };
		// on the heap: md::Hardware is far larger than a std::thread's stack (512 KB on macOS; the stack overflowed there)
		const auto machine = std::make_unique<Machine>(_rom, _romName, _model);
		auto& m = *machine;
		if(!m.valid())
		{
			r.error = std::string("The ROM did not start a second ") + spec.name + ".";
			return r;
		}
		// it takes MIDI after a few seconds of its start; then its start-up animation runs on (the Machinedrum's about
		// 20 s, which the dumps do not wait for; the Monomachine's a few seconds, waited for)
		while(!m.midiReady())
		{
			if(stopped())
				return {{}, "Stopped."};
			m.step();
			if(m.frames() > static_cast<uint64_t>(g_rate) * 60)
			{
				r.error = second + " did not start (60 s).";
				return r;
			}
		}
		for(uint32_t i = 0; i < spec.settleSeconds * (g_rate / g_block); ++i)
		{
			if(stopped())
				return {{}, "Stopped."};
			m.step();
		}
		for(const auto& [reply, slots] : spec.kinds)
			for(uint8_t s = 0; s < slots; ++s)
			{
				if(stopped())
					return {{}, "Stopped."};
				const std::vector<uint8_t> request{0xf0, 0x00, 0x20, 0x3c, spec.product, 0x00, static_cast<uint8_t>(reply + 1), s, 0xf7};
				std::vector<uint8_t> d;
				for(int tries = 0; tries < 3 && d.empty() && !stopped(); ++tries)
					d = m.request(request, reply, 3000, _stop);
				if(stopped())
					return {{}, "Stopped."};
				if(d.empty())
				{
					r.error = second + " did not answer a dump request (" + std::to_string(reply) + " slot "
						+ std::to_string(s + 1) + ").";
					r.dumps.clear();
					return r;
				}
				r.dumps.push_back(std::move(d));
				if(_progress)
					++*_progress;
			}
		return r;
	}
}
