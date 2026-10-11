#include "mdDeskSession.h"
#include "mdFactorySource.h"
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
			p.sendMidi = [this](const std::vector<uint8_t>& _m) { m_link.sendChannel(_m); };
			p.turnKnob = [this](const uint8_t _e, const int _s) { return m_link.turnKnob(_e, _s); };
			p.nowMs = [] { return nowMs(); };
			p.audition = [this](const elektronData::AuditionClip& _clip) { return m_link.audition(_clip); };
			p.auditionStatus = [this] { return m_link.auditionStatus(); };
			return p;
		}

		deskCore::LifeFacts::Probe probe() override { return m_link.probe(); }

		void step(mdDesk::Desk& _desk, const uint64_t _tick) override
		{
			while(!m_in.empty())
			{
				const auto m = std::move(m_in.front());
				m_in.pop_front();
				_desk.onDeviceSysex(m);
			}
			if(due(_tick, g_probeMs))
				_desk.setProbe(m_link.probe());
			_desk.onTelemetry(m_link.readTelemetry());
			m_lcd.step(_desk, _tick, [this](std::vector<uint8_t>& _bits) { return m_link.readLcd(_bits); });
			std::vector<uint8_t> region;
			if(m_link.readWorkingKit(region))
				_desk.onWorkingKitMemory(region);
			std::shared_ptr<const elektronData::MdSampleBank> bank;
			// A desk without a bank (none yet, or a reset forgot it) gets the device's current one again (B-012).
			if(_desk.pageSeen() && due(_tick, g_samplesMs) && m_link.readSampleBank(bank, !_desk.hasSamples()))
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

		// What came in, to the desk. No telemetry: the adapter's own is "none" from the start.
		void step(mdDesk::Desk& _desk, uint64_t) override
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
			for(uint8_t i = 0; i <= deskWire::md::g_levelIndex; ++i)
				if(const std::string name = StudioLink::parameterName(i); !name.empty())
					m.params.push_back({{-1, -1, i}, name});
			return m;
		}

		const char* missingText() const override { return "No MD OS 1.63 ROM is running yet. After adding it, reopen the plug-in."; }

		// Reset machine… > Factory reset (P6): the factory kits, patterns and songs come from a second Machinedrum
		// started from the user's own ROM with no patch RAM (mdFactorySource.h), read once a session; then they go to
		// the machine as an import of every slot (mdSyxWork.h), read back and reported. Globals and samples stay.
		void machineReset(const Value& _message) override
		{
			const auto* how = _message.find("how");
			if(!how || !how->isString() || how->asString() != "factory")
			{
				reply(_message, false, "machineReset: empty or factory");
				return;
			}
			if(m_factory.running() || m_factoryWanted)
			{
				reply(_message, false, "The factory data is being prepared: the reset follows by itself.");
				return;
			}
			if(syx().running())
			{
				reply(_message, false, "An import or export is running: try again when it is done.");
				return;
			}
			if(!m_factoryDumps.empty())
			{
				const auto why = syx().reset(desk(), m_factoryDumps, "Factory reset", "restored", [this](const Value& _m) { toPage(_m); });
				reply(_message, why.empty(), why);
				return;
			}
			const auto rom = md::RomLoader::findROM(md::MachineModel::Machinedrum);
			if(!rom.isValid())
			{
				reply(_message, false, "No MD OS 1.63 ROM found: the factory data comes from it.");
				return;
			}
			m_factory.start(rom.data(), rom.getFilename());
			m_factoryWanted = true;
			m_factoryNewsMs = -1e9;
			reply(_message, true, "Preparing the factory data: a second Machinedrum starts from your ROM, unheard, and is read "
				"(about a minute). Nothing on your machine changes until then.");
		}

		void stepModel() override
		{
			if(!m_factoryWanted)
				return;
			const auto now = sessionNowMs();
			if(m_factory.running())
			{
				if(now - m_factoryNewsMs < 1000)
					return;
				m_factoryNewsMs = now;
				const auto n = m_factory.progress();
				Value m = Value::object();
				m.set("type", "syxReset");
				m.set("phase", "prepare");
				m.set("done", n);
				m.set("total", MdFactorySource::g_total);
				m.set("text", n ? "Reading the factory data: " + std::to_string(n) + " of " + std::to_string(MdFactorySource::g_total)
					: std::string("Starting a second Machinedrum from your ROM for the factory data"));
				toPage(m);
				return;
			}
			auto r = m_factory.take();
			if(!r)
				return;
			m_factoryWanted = false;
			std::string why = r->error;
			if(why.empty())
			{
				m_factoryDumps = std::move(r->dumps);
				if(desk().lifecycle() != deskCore::Lifecycle::Ready)
					why = "The machine is not ready: choose Factory reset again when it is.";
				else
					why = syx().reset(desk(), m_factoryDumps, "Factory reset", "restored", [this](const Value& _m) { toPage(_m); });
			}
			if(!why.empty())
			{
				Value m = Value::object();
				m.set("type", "syxReset");
				m.set("phase", "failed");
				m.set("done", 0);
				m.set("total", MdFactorySource::g_total);
				m.set("text", "Factory reset: " + why);
				toPage(m);
			}
		}

		MdFactorySource m_factory;
		bool m_factoryWanted = false;
		double m_factoryNewsMs = -1e9;
		std::vector<std::vector<uint8_t>> m_factoryDumps;	// read once a session: the same at every start (P6)

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
	};

	std::unique_ptr<DeskSession> makeMdSession(AudioPluginAudioProcessor& _processor)
	{
		return std::make_unique<MdSession>(_processor);
	}
}
