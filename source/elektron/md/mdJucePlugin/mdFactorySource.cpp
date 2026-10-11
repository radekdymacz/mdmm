#include "mdFactorySource.h"

#include "mdLib/mdhardware.h"

#include "synthLib/audioTypes.h"
#include "synthLib/midiTypes.h"

#include <array>

namespace mdJucePlugin
{
	namespace
	{
		constexpr uint32_t g_block = 64;
		constexpr uint32_t g_rate = 44100;

		// The headless machine: blocks of audio rendered and dropped, its SysEx kept.
		class Machine
		{
		public:
			Machine(const std::vector<uint8_t>& _rom, const std::string& _name) : m_hw(_rom, _name, md::MachineModel::Machinedrum, {})
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

			// A request, then the first reply with _reply as its command, within _ms of machine time ({} if none).
			std::vector<uint8_t> request(const std::vector<uint8_t>& _request, const uint8_t _reply, const double _ms)
			{
				m_rx.clear();
				synthLib::SMidiEvent e(synthLib::MidiEventSource::Host);
				e.sysex.assign(_request.begin(), _request.end());
				m_hw.sendMidi(e);
				const auto end = m_frames + static_cast<uint64_t>(_ms * g_rate / 1000.0);
				while(m_frames < end)
				{
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

	bool MdFactorySource::start(Bytes _rom, std::string _romName)
	{
		if(m_running)
			return false;
		if(m_thread.joinable())
			m_thread.join();
		m_stop = false;
		m_progress = 0;
		m_running = true;
		m_thread = std::thread([this, rom = std::move(_rom), name = std::move(_romName)]
		{
			auto r = read(rom, name, &m_progress, &m_stop);
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

	MdFactorySource::Result MdFactorySource::read(const Bytes& _rom, const std::string& _romName, std::atomic<int>* _progress,
		const std::atomic<bool>* _stop)
	{
		Result r;
		const auto stopped = [_stop] { return _stop && _stop->load(); };
		Machine m(_rom, _romName);
		if(!m.valid())
		{
			r.error = "The ROM did not start a second Machinedrum.";
			return r;
		}
		// it takes MIDI after a few seconds of its start; then its start-up animation runs on (about 20 s), which the
		// dumps do not wait for
		while(!m.midiReady())
		{
			if(stopped())
				return {{}, "Stopped."};
			m.step();
			if(m.frames() > static_cast<uint64_t>(g_rate) * 60)
			{
				r.error = "The second Machinedrum did not start (60 s).";
				return r;
			}
		}
		for(int i = 0; i < 2 * static_cast<int>(g_rate / g_block); ++i)
			m.step();
		const std::pair<uint8_t, uint8_t> kinds[] = {{0x52, 64}, {0x67, 128}, {0x69, 32}};	// dump id, slots (the request is id + 1)
		for(const auto& [reply, slots] : kinds)
			for(uint8_t s = 0; s < slots; ++s)
			{
				if(stopped())
					return {{}, "Stopped."};
				const std::vector<uint8_t> request{0xf0, 0x00, 0x20, 0x3c, 0x02, 0x00, static_cast<uint8_t>(reply + 1), s, 0xf7};
				std::vector<uint8_t> d;
				for(int tries = 0; tries < 3 && d.empty(); ++tries)
					d = m.request(request, reply, 3000);
				if(d.empty())
				{
					r.error = "The second Machinedrum did not answer a dump request (" + std::to_string(reply) + " slot "
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
