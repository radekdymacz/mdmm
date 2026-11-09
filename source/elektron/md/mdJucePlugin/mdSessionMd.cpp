#include "mdDeskSession.h"
#include "mdFactoryReset.h"
#include "mdSessions.h"

#include "mdController.h"
#include "mdPluginProcessor.h"
#include "mdStudioLink.h"

#include "mdDesk/mdDesk.h"
#include "mdDesk/mdDeskWirePort.h"

#include "deskWire/mdWire.h"

#include "mdLib/mdromloader.h"

#include "elektronData/mdJson.h"
#include "elektronData/mdValidate.h"

#include <deque>

namespace mdJucePlugin
{
	using MdEngine = Engine<mdDesk::Desk>;

	namespace
	{
		double nowMs() { return sessionNowMs(); }

		// How often the emulator engine asks the device whether the firmware runs.
		constexpr double g_probeMs = 96;
		// P9: how often it looks for a new UW sample bank (the device reads it only when its memory changed).
		constexpr double g_samplesMs = 250;

		// StudioLink's parameter index of a track's mute (after the 24 kit parameters and the level).
		constexpr uint8_t g_muteParam = 25;
	}

	// The emulated MD OS 1.63 (StudioLink): SysEx into the device, kit values through the parameter
	// layer, panel keys, and the device's facts: telemetry, the working kit from memory, the probe,
	// host parameter changes and, while it starts, its own LCD. What the device says is queued and
	// handed to the desk in step().
	class MdEmuEngine final : public MdEngine
	{
	public:
		explicit MdEmuEngine(DeskSession& _session)
			: m_link(_session.processor(), dynamic_cast<Controller&>(_session.processor().getController()))
		{
			m_link.onSysex = [this](const std::vector<uint8_t>& _m) { m_in.push_back(_m); };
		}

		mdDesk::DevicePort device() override
		{
			mdDesk::DevicePort p;
			p.sendSysex = [this](const std::vector<uint8_t>& _m) { m_link.sendSysex(_m); };
			p.sendKitParam = [this](const uint8_t _t, const uint8_t _i, const uint8_t _v) { m_link.setKitParam(_t, _i, _v); };
			p.sendMute = [this](const uint8_t _t, const bool _on) { m_link.setMute(_t, _on); };
			p.sendNote = [this](const uint8_t _ch, const uint8_t _n, const uint8_t _v) { m_link.sendNote(_ch, _n, _v); };
			// The keyboard's held PTCH as the machine's CC, not the plug-in's parameter: no DAW sees it.
			p.sendHeldParam = [this](const uint8_t _t, const uint8_t _i, const uint8_t _v)
			{
				if(const auto cc = deskWire::md::kitParam(m_channel, _t, _i, _v))
					m_link.sendChannel(*cc);
			};
			p.baseChannel = [this](const uint8_t _ch) { m_channel = _ch; };
			p.pressKey = [this](const std::string& _key) { return m_link.pressKey(_key); };
			p.lcd = [this](std::vector<uint8_t>& _bits) { return m_link.readLcd(_bits); };
			p.sendMidi = [this](const std::vector<uint8_t>& _m) { m_link.sendChannel(_m); };
			p.turnKnob = [this](const uint8_t _e, const int _s) { return m_link.turnKnob(_e, _s); };
			p.nowMs = [] { return nowMs(); };
			p.audition = [this](const elektronData::AuditionClip& _clip) { return m_link.audition(_clip); };
			p.auditionStatus = [this] { return m_link.auditionStatus(); };
			return p;
		}

		deskCore::LifeFacts::Probe probe() override { return m_link.probe(); }
		int baseChannel() const override { return m_channel; }

		void step(mdDesk::Desk& _desk, const uint64_t _tick, const uint64_t _span) override
		{
			while(!m_in.empty())
			{
				const auto m = std::move(m_in.front());
				m_in.pop_front();
				_desk.onDeviceSysex(m);
			}
			if(due(_tick, g_probeMs, _span))
				_desk.setProbe(m_link.probe());
			_desk.onTelemetry(m_link.readTelemetry());
			m_lcd.step(_desk, _tick, _span, [this](std::vector<uint8_t>& _bits) { return m_link.readLcd(_bits); });
			std::vector<uint8_t> region;
			if(m_link.readWorkingKit(region))
				_desk.onWorkingKitMemory(region);
			std::shared_ptr<const elektronData::MdSampleBank> bank;
			// A desk without a bank (none yet, or a reset forgot it) gets the device's current one again (B-012).
			if(_desk.pageSeen() && due(_tick, g_samplesMs, _span) && m_link.readSampleBank(bank, !_desk.hasSamples()))
				_desk.onSampleBank(*bank);
			m_link.drainParameterChanges([&_desk](const uint8_t _t, const uint8_t _i, const uint8_t _v)
			{
				if(_i == g_muteParam)
					_desk.onHostMute(_t, _v != 0);
				else
					_desk.onHostKitParam(_t, _i, _v);
			});
		}

	private:
		StudioLink m_link;
		std::deque<std::vector<uint8_t>> m_in;
		LcdFeed m_lcd;
		uint8_t m_channel = 0;	// the machine's base channel (the adapter's fact, baseChannel)
	};

	// A real Machinedrum on the plug-in's MIDI in and out at DIN speed (deskWire): SysEx and CCs out
	// on the machine's base channel (a fact the adapter gives), PLAY/STOP as MIDI Start/Stop, SysEx
	// in. The plug-in's MIDI is the wire's while this engine lives. No panel, telemetry or memory.
	class MdWireEngine final : public MdEngine
	{
	public:
		explicit MdWireEngine(DeskSession& _session) : m_wire(_session.processor()) {}

		mdDesk::DevicePort device() override
		{
			return mdDesk::wirePort(m_wire.wire(), m_channel, [] { return nowMs(); });
		}

		deskCore::LifeFacts::Probe probe() override { return deskCore::LifeFacts::Probe::Running; }
		bool wireBusy() override { return !m_wire.wire().idle(nowMs()); }
		int baseChannel() const override { return m_channel; }

		// What came in, to the desk. No telemetry: the adapter's own is "none" from the start.
		void step(mdDesk::Desk& _desk, uint64_t, uint64_t) override
		{
			m_wire.wire().pump(nowMs(), [&_desk](const std::vector<uint8_t>& _m) { _desk.onDeviceSysex(_m); });
		}

	private:
		PluginWire m_wire;
		uint8_t m_channel = 0;
	};

	// The Machinedrum Editor's session: the engine map, the learnable parameters, its page and the
	// editor's setup kept with the project.
	class MdSession final : public SessionOf<mdDesk::Desk>
	{
	public:
		explicit MdSession(AudioPluginAudioProcessor& _processor)
			: SessionOf<mdDesk::Desk>(_processor, engines(), learnModel(), page(), mdDesk::deskSetupToJson({}))
		{
		}

	private:
		static std::vector<Record> engines()
		{
			return {
				{mdDesk::emulatorProfile(), [](DeskSession& _s) { return std::make_unique<MdEmuEngine>(_s); }, {}},
				{mdDesk::wireProfile(), [](DeskSession& _s) { return std::make_unique<MdWireEngine>(_s); }, midiOutAvailability}};
		}

		static PageSpec page()
		{
			return {"mdStudio.html", "gearmulator-mdStudio.log", "GEARMULATOR_MDSTUDIO_SELFTEST", {"1", "p4", "p5", "p6", "p7", "journey", "demo"}, 1440};
		}

		// Every kit parameter and the level of any of the 16 tracks.
		static MidiLearnCommands::Model learnModel()
		{
			MidiLearnCommands::Model m;
			m.pages = false;
			m.tracks = 16;
			m.limits = mdDesk::g_mdSetupSpec.learn;
			m.span = 4;		// the Machinedrum's CCs: four channels from the base channel
			m.globals = mdDesk::Desk::learnGlobals();	// B-169: the master effects, the tempo, the pattern's swing and accent
			for(uint8_t i = 0; i <= deskWire::md::g_levelIndex; ++i)
				if(const std::string name = StudioLink::parameterName(i); !name.empty())
					m.params.push_back({{-1, -1, i}, name});
			return m;
		}

		// What the Machinedrum's firmware drives with CC _cc on the channel _offset from its base channel (mdLib's pure map):
		// a kit parameter or the level of a track (the mute has no learn target)
		std::optional<deskCore::LearnRef> firmwareCc(const int _offset, const int _cc) const override
		{
			namespace a = ::md::automation;
			if(_offset < 0 || _offset > 15 || _cc < 0 || _cc > 127)
				return std::nullopt;
			const auto c = a::decodeParameterChange(::md::MachineModel::Machinedrum,
				{static_cast<uint8_t>(0xb0 | _offset), static_cast<uint8_t>(_cc), 0}, 0);
			if(!c)
				return std::nullopt;
			if(c->page == a::machinedrum::Level)
				return deskCore::LearnRef{c->track, -1, deskWire::md::g_levelIndex};
			if(c->page <= a::machinedrum::Routing)
				return deskCore::LearnRef{c->track, -1, c->page * 8 + c->index};
			return std::nullopt;
		}

		const char* missingText() const override { return "No MD OS 1.63 ROM is running yet. After adding it, reopen the plug-in."; }

		// Reset machine… > Factory reset (P6): from a second Machinedrum started from the user's own ROM (mdFactoryReset.h).
		void machineReset(const Value& _message) override
		{
			m_factory.request(desk(), syx(), _message, [this](const Value& _m, const bool _ok, const std::string& _n) { reply(_m, _ok, _n); },
				[this](const Value& _m) { toPage(_m); });
		}

		void stepModel() override
		{
			m_factory.step(desk(), syx(), sessionNowMs(), [this](const Value& _m) { toPage(_m); });
		}

		FactoryReset<mdDesk::Desk> m_factory{md::MachineModel::Machinedrum, "Machinedrum", "MD OS 1.63"};

		// P9: a sample file the user chose for a UW ROM slot: read here (never through the page), then the
		// desk converts it and sends it as SDS; the page hears sampleLoad messages.
		void loadSampleFile(const uint8_t _slot, const juce::File& _file) override
		{
			juce::MemoryBlock mb;
			if(_file.getSize() > 512 * 1024 * 1024 || !_file.loadFileAsData(mb))
			{
				desk().loadSample(_slot, _file.getFileName().toStdString(), {});
				return;
			}
			const auto* d = static_cast<const uint8_t*>(mb.getData());
			desk().loadSample(_slot, _file.getFileName().toStdString(), std::vector<uint8_t>(d, d + mb.getSize()));
		}

		// 0.9: the samples of a slot (a file) or of a bank (a folder) as WAV files, written here; the desk makes the bytes
		void exportSamples(const juce::File& _target, const Value& _request) override
		{
			const auto* slot = _request.find("slot");
			const auto* every = _request.find("all");
			const bool all = every && every->isBool() && every->asBool();
			const auto* fmt = _request.find("format");
			const std::string format = fmt && fmt->isString() ? fmt->asString() : "wav";
			const juce::String ext = format == "syx" ? "syx" : "wav";
			std::string why;
			const auto files = desk().exportSamples(_request.find("bank")->asString(), slot ? static_cast<int>(slot->asNumber()) : 0, all, format, why);
			size_t written = 0, bytes = 0;
			if(!files.empty() && (!all || _target.createDirectory().wasOk()))
				for(const auto& f : files)
				{
					const auto out = all ? _target.getNonexistentChildFile(juce::String::fromUTF8(f.name.c_str()).upToLastOccurrenceOf(".wav", false, false).upToLastOccurrenceOf(".syx", false, false), "." + ext, false)
						: _target.withFileExtension(ext);
					if(out.replaceWithData(f.data.data(), f.data.size()))
					{
						++written;
						bytes += f.data.size();
					}
				}
			Value m = Value::object();
			m.set("type", "sampleExport");
			m.set("ok", !files.empty() && written == files.size());
			m.set("count", static_cast<int>(written));
			m.set("bytes", static_cast<int>(bytes));
			std::string text = why;
			if(!files.empty() && written != files.size())
				text = "Could not write " + std::to_string(files.size() - written) + " of " + std::to_string(files.size()) + " files to " + _target.getFullPathName().toStdString() + ".";
			else if(!files.empty() && all)
				text = "Saved " + std::to_string(written) + (format == "syx" ? " SysEx file" : " WAV file") + (written == 1 ? "" : "s") + " to " + _target.getFullPathName().toStdString() + ".";
			else if(!files.empty())
				text = "Saved " + _target.withFileExtension(ext).getFileName().toStdString() + ".";
			m.set("text", text);
			toPage(m);
		}
	};

	std::unique_ptr<DeskSession> makeMdSession(AudioPluginAudioProcessor& _processor)
	{
		return std::make_unique<MdSession>(_processor);
	}
}
