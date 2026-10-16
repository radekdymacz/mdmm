#pragma once

#include "mdMidiIn.h"
#include "mdMidiLearnCommands.h"
#include "mdPageSpec.h"
#include "mdSyxWork.h"

#include "deskCore/deskCapabilities.h"
#include "deskCore/deskCommands.h"
#include "deskCore/deskLcd.h"
#include "deskCore/deskLifecycle.h"

#include "deskHost/deskHost.h"

#include "deskWire/deskWire.h"

#include "elektronData/json.h"

#include "juce_events/juce_events.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <type_traits>
#include <vector>

namespace mdJucePlugin
{
	class AudioPluginAudioProcessor;
	pluginLib::Processor& pluginProcessorOf(AudioPluginAudioProcessor& _processor);
	double sessionNowMs();

	// The session's pace. One step every 8 ms while a page is up (or a .syx import runs): the playhead (the app
	// modulators move on its steps) is looked at faster than the fastest step (300 BPM at 2X: 25 ms). With no page
	// (an editor closed: the usual case for most instances of a DAW project) one step every g_idleStepMs, standing
	// for that many 8 ms steps (its span), so every period below keeps its length in ms (1.0 review: 125 wake-ups a
	// second per closed instance were the message thread's for nothing). The host's automation and MIDI reach the
	// machine on the audio thread either way; the session only mirrors them into its documents, a little later.
	// The rest is periods in ms.
	constexpr double g_stepMs = 8;
	constexpr double g_idleStepMs = 64;
	constexpr double g_deskTickMs = 32;			// the desk's own work, about 30 Hz
	constexpr double g_lcdMs = 64;				// the machine's screen while it starts, about 15 Hz
	constexpr double g_engineChoicesMs = 1000;	// whether the engines are available (a MIDI out appeared)
	constexpr double g_followHostMs = 2000;		// in a DAW: the machine's global follows the host (followHost)
	constexpr double g_hostTempoMs = 100;		// B-030: the host's tempo, published to the page when it changed

	// B-030: the host's tempo for the page (a "host" message: {bpm, follows}), when the host reports one and it
	// moved, or the page is new. Pure: the decision only (mdDeskSetupStateTest checks it).
	struct HostTempo
	{
		double published = -1;	// the last bpm sent, -1 none (a new page)

		// The message to send now, or nothing: _bpm 0 = no host reports a tempo.
		std::optional<double> next(const double _bpm)
		{
			if(_bpm <= 0 || !(_bpm < 1000))
				return std::nullopt;
			const double rounded = std::round(_bpm * 100) / 100;
			if(published >= 0 && std::abs(rounded - published) < 0.005)
				return std::nullopt;
			published = rounded;
			return rounded;
		}
	};

	bool followsHost(AudioPluginAudioProcessor& _processor);
	double hostBpmOf(AudioPluginAudioProcessor& _processor);
	// B-035: how the host runs the plug-in's audio, for the start-up card ({"type":"audioRun", ...}), once the
	// processor has a second's sample; nothing before.
	std::optional<elektronData::json::Value> audioRunOf(AudioPluginAudioProcessor& _processor);
	constexpr double g_audioRunMs = 1000;
	// I-018: the CPU meter's reading for the top bar ({"type":"cpuLoad", ...}): the share of the audio blocks'
	// budget processBlock spends, smoothed, the worst block of the last seconds, and the details the meter's popover
	// shows (realtime ratio, rate and block size, the speed-ups, Rosetta). A few times a second while the page is up.
	elektronData::json::Value cpuLoadOf(AudioPluginAudioProcessor& _processor);
	constexpr double g_cpuLoadMs = 250;
	// I-021: the LCD's output meter and volume ({"type":"outputLevel","peakL","peakR","clip","gainDb"}): the main
	// output's left and right peaks since the last one, after the output gain, whether any output clipped, and the gain
	// in dB (null: off). As often as cpuLoad.
	elektronData::json::Value outputLevelOf(AudioPluginAudioProcessor& _processor);
	// I-024: {"type":"machineMemory", keep, available, saved, note} for the engine menu's KEEP MEMORY and START FROM
	// FACTORY MEMORY (doc/modern-ux/DESIGN-machine-memory.md)
	elektronData::json::Value machineMemoryOf(AudioPluginAudioProcessor& _processor);
	void machineMemorySampleStoredOf(AudioPluginAudioProcessor& _processor);
	// I-021: the page's volume (outputGain {db}): the processor's output gain (mdOutputLevel.h's range)
	void setOutputGainDb(AudioPluginAudioProcessor& _processor, double _db);
	constexpr double g_outputLevelMs = 250;
	// 0.6 (GLOBAL › Map editor › LEARN, I-002): a note on that reached the plug-in from outside, as the page's
	// {"type":"midiIn","ch","note","vel"} (ch 0-15). Every step, at most g_midiInPerStep of them (a full queue drops the
	// rest: they are hints).
	elektronData::json::Value midiInOf(const midiIn::Note& _note);
	constexpr int g_midiInPerStep = 16;
	// I-002, B-062: the notes held from outside, as the page's {"type":"midiHeld","notes":[{ch, note}...]} (by channel,
	// low to high; the page lights those on the channels the machine plays): when they changed, looked at every g_midiHeldMs (a burst is one message), and once for a new page.
	elektronData::json::Value midiHeldOf(const midiIn::Notes& _notes);
	midiIn::Notes heldMidiNotesOf(AudioPluginAudioProcessor& _processor);
	constexpr double g_midiHeldMs = 32;
	// 0.8 (WP3): the MIDI monitor's counts ({"type":"midiStats","directions":{inHost, inFirmware, outMachine, outHost:
	// {total, types, channels}},"dropped":{scheduled, external, allocation}}), once a second while the page is up (no lock:
	// relaxed atomics, mdMidiMonitor.h). The pages do not read it yet (the monitor panel is WP4's).
	elektronData::json::Value midiStatsOf(AudioPluginAudioProcessor& _processor);
	constexpr double g_midiStatsMs = 1000;

	// I-032 (0.8, WP9): the Mix page's output meters ({"type":"mixLevels","pairs":[{"on","clip","peak":[L,R],"rms":[L,R]} x3]},
	// pairs A/B, C/D, E/F; dBFS to 0.1 dB, -96 for silence; the largest |sample| and the RMS since the last message), sent
	// every g_mixLevelsMs only between the page's mixMeters on and off. Relaxed atomics (mdMixMeters.h), no lock.
	elektronData::json::Value mixLevelsOf(AudioPluginAudioProcessor& _processor);
	constexpr double g_mixLevelsMs = 40;

	// P7: whether the machine follows the host's tempo and transport: in a DAW's plug-in only.

	// Due on the session's first step, then once every _periodMs (_tick counts 8 ms steps from 1). _span: the 8 ms
	// steps this one stands for (1 with a page up, g_idleStepMs / g_stepMs without one): due when the period fell on
	// any of them.
	constexpr bool due(const uint64_t _tick, const double _periodMs, const uint64_t _span = 1)
	{
		const auto n = std::max<uint64_t>(1, static_cast<uint64_t>(_periodMs / g_stepMs + 0.5));
		if(_tick == 0)
			return false;
		const uint64_t last = _tick - 1;								// the steps from 0: (last - span, last]
		const uint64_t first = last + 1 > _span ? last + 1 - _span : 0;
		return first == 0 || last / n != (first - 1) / n;
	}

	// The editor's session (P6), owned by the processor: the desk (core, Machine adapter, the
	// editor's setup), the engine that feeds it (the device edge and its facts: the emulator, or a
	// machine over the plug-in's MIDI) and the plug-in's own commands (deskHost's table: MIDI learn,
	// the engine map, the ROM folder, the page's MIDI). It lives as long as the plug-in instance, so
	// documents, undo, the clipboard, pushes in flight, the engine choice and the app modulators
	// survive the editor window. A page view attaches to it and detaches when the window closes.
	// Message thread only.
	class DeskSession : juce::Timer
	{
	public:
		using Value = elektronData::json::Value;
		using ToPage = std::function<void(const Value&)>;

		explicit DeskSession(AudioPluginAudioProcessor& _processor);
		~DeskSession() override;

		DeskSession(const DeskSession&) = delete;
		DeskSession& operator=(const DeskSession&) = delete;

		// The Machinedrum or Monomachine session for the processor's model, built and then started
		// (its steps begin once it is whole).
		static std::unique_ptr<DeskSession> create(AudioPluginAudioProcessor& _processor);

		void attach(ToPage _toPage);
		void detach();

		// A page message: the desk's commands (the model's table) and the plug-in's session rows
		// (deskHost's table, actor Session).
		virtual void onPageMessage(const Value& _message) = 0;
		// The page started again without saying so in a message (Linux: WebPageHost's restart): everything once more,
		// as on its ready.
		void republish();
		// One step of the session: the engine's facts in, the desk's work, the page's messages out.
		// The timer calls it; tests call it directly.
		virtual void step() = 0;
		// One line of state for the diagnostics log.
		virtual std::string status() const = 0;
		// B-035: the desk's lifecycle ("booting", "ready", ...), for the start-up log.
		virtual std::string lifecycleName() const = 0;
		// The page the editor window shows for this session (data: the file, its log, its self-tests).
		virtual const PageSpec& pageSpec() const = 0;

		void toPage(const Value& _message) const;
		AudioPluginAudioProcessor& processor() const { return m_processor; }
		// P7: a firmware file the user chose or dropped on the window: checked (md::checkRom), copied into
		// the ROM folder (never over another file), and the machine started again with it. The page hears
		// {"type":"romInstall", ok, text}. Nothing leaves this computer.
		void installRom(const juce::File& _file);
		// P7: a .syx the user chose or dropped: its preview for the page (syxPreview); and the documents the
		// editor holds written to a .syx (syxExport; 0.6: _request is the page's syxExport command, its kinds and
		// ranges, the Monomachine's waveforms read from the machine first). The model's session does both.
		virtual void openSyx(const juce::File& _file) = 0;
		virtual void exportSyx(const juce::File& _file, const elektronData::json::Value& _request) = 0;
		// P9: a sample file (WAV, AIFF) the user chose for UW ROM slot _slot. The Machinedrum's session
		// sends it (sampleLoad messages follow); a model without a sampler ignores it.
		virtual void loadSampleFile(uint8_t _slot, const juce::File& _file) { (void)_slot; (void)_file; }

	protected:
		void reply(const Value& _message, bool _ok, const std::string& _note) const;
		void revealRomFolder(const Value& _message) const;
		// LOAD ROM: {"type":"romInfo", installed, name, os, size, file, folder, inFolder} for the page's firmware
		// dialog; REMOVE deletes the images in the ROM folder and starts the stand-in (the start-up card asks again).
		void romInfo(const Value& _message) const;
		void removeRom(const Value& _message);
	public:
		// A line for the editor's log (diagnostics builds); set by the window while it is open.
		void setLog(std::function<void(const std::string&)> _log) { m_log = std::move(_log); }
	protected:
		void log(const std::string& _line) const { if(m_log) m_log(_line); }
		virtual void onAttach() {}
		virtual void onDetach() {}

		AudioPluginAudioProcessor& m_processor;

		// The 8 ms steps one step stands for now (its timer's interval): 1 while a page is up.
		uint64_t stepSpan() const
		{
			const auto ms = getTimerInterval();
			return ms > 0 ? std::max<uint64_t>(1, static_cast<uint64_t>(ms / static_cast<int>(g_stepMs))) : 1;
		}
		// Something runs that needs the fast pace without a page (a .syx import, messages waiting for a real machine's
		// wire): the model's session says.
		virtual bool needsPace() const { return false; }
	public:
		// The step interval the session wants now: 8 ms with a page or work that needs it, g_idleStepMs without.
		int paceMs() const { return static_cast<int>(m_toPage || needsPace() ? g_stepMs : g_idleStepMs); }
	protected:

	private:
		void timerCallback() override
		{
			step();
			pace();
		}
		// 8 ms with a page (or work that needs it), g_idleStepMs without
		void pace()
		{
			const auto want = paceMs();
			if(getTimerInterval() != want)
				startTimer(want);
		}

		ToPage m_toPage;
		std::function<void(const std::string&)> m_log;
	};

	// The editor's setup kept with the project (the processor's setup chunk), for either model: the
	// session saves into it and hears when a project restore replaced it. Its own saves are not
	// restores.
	class SetupStore
	{
	public:
		using Value = elektronData::json::Value;

		explicit SetupStore(AudioPluginAudioProcessor& _processor) : m_processor(_processor) {}

		void save(const Value& _setup);
		// The project's setup text when it changed outside the session since the last call (the first
		// call: the project's); "" when the project keeps none.
		std::optional<std::string> restored();

	private:
		AudioPluginAudioProcessor& m_processor;
		std::optional<uint32_t> m_seen;
	};

	// The plug-in's MIDI in and out as a wire, for as long as it lives: while it does, the
	// processor's MIDI goes to the wire (external MIDI on), not to the emulated device. An engine
	// on a wire owns one, so the routing follows the engine and no one else decides it.
	class PluginWire
	{
	public:
		explicit PluginWire(AudioPluginAudioProcessor& _processor);
		~PluginWire();

		PluginWire(const PluginWire&) = delete;
		PluginWire& operator=(const PluginWire&) = delete;

		deskWire::MidiWire& wire() { return m_wire; }

	private:
		AudioPluginAudioProcessor& m_processor;
		deskWire::MidiWire m_wire;
	};

	// Whether an engine can be chosen now, and why not.
	struct Availability
	{
		bool available = true;
		std::string reason;
	};

	// An engine on the plug-in's MIDI: the host or the plug-in's own ports must give a MIDI out.
	Availability midiOutAvailability(const DeskSession& _session);

	// An engine of the engine map, for a model (P6): the device edge its desk's adapter talks to and
	// the facts it feeds the desk. Engines queue what the device says and hand it over in step():
	// nothing reaches the desk outside the session's step. A third engine is one class implementing
	// this plus one record; an engine with its own protocol also gives its own adapter.
	template<typename DeskT>
	class Engine
	{
	public:
		using DevicePort = typename DeskT::DevicePort;
		using Adapter = typename DeskT::Adapter;
		using Profile = typename DeskT::Profile;
		virtual ~Engine() = default;

		virtual DevicePort device() = 0;
		// The adapter for this engine: the model's own over device() unless the engine speaks another
		// protocol.
		virtual std::unique_ptr<Adapter> adapter(const Profile& _profile) { return DeskT::defaultAdapter(_profile, device()); }
		// Feed the desk what the device said since the last step (sysex, telemetry, memory, probes,
		// its screen). _tick counts the session's 8 ms steps (g_stepMs) from 1, _span the ones this step stands for;
		// due() makes periods of them.
		virtual void step(DeskT& _desk, uint64_t _tick, uint64_t _span) = 0;
		// What the device says about the firmware now (Running for a wire: its replies decide).
		virtual deskCore::LifeFacts::Probe probe() = 0;
		// Messages still wait for a real machine's wire (DinPacer: one leaves a step once the wire is free, so the
		// session keeps its 8 ms pace without a page until they are out). The emulator: never.
		virtual bool wireBusy() { return false; }
	};

	// One engine of the engine map: its profile (id, label, what it offers), how to make it and
	// whether it can be chosen now (none: always). EngineT is what make() returns, typed: a
	// SessionOf<DeskT, EngineT> holds these, so currentEngine() needs no cast (below).
	template<typename DeskT, typename EngineT = Engine<DeskT>>
	struct EngineRecord
	{
		static_assert(std::is_base_of_v<Engine<DeskT>, EngineT>, "EngineRecord's EngineT must derive from Engine<DeskT>");
		using Profile = typename DeskT::Profile;
		Profile profile;
		std::function<std::unique_ptr<EngineT>(DeskSession&)> make;
		std::function<Availability(const DeskSession&)> available;
	};

	// The session for one model (P6: one class for both editors). The engine map, the plug-in's
	// commands, the setup store and the step are here; a model gives its engines, its learnable
	// parameters, its page and its default setup, and adds what is its own (the page's MIDI).
	// EngineT is the model's own engine base (Engine<DeskT> unless the model adds to it, e.g. the
	// MM's MmEngine for its page MIDI): currentEngine() returns it typed, so a model that needs
	// more than device()/step()/probe() casts once here rather than at every call site.
	template<typename DeskT, typename EngineT = Engine<DeskT>>
	class SessionOf : public DeskSession
	{
	public:
		static_assert(std::is_base_of_v<Engine<DeskT>, EngineT>, "SessionOf's EngineT must derive from Engine<DeskT>");

		using Record = EngineRecord<DeskT, EngineT>;
		using Action = deskHost::Action;

		// _defaultSetup: what a project without a setup gets (none: the desk keeps its own).
		SessionOf(AudioPluginAudioProcessor& _processor, std::vector<Record> _engines, MidiLearnCommands::Model _learn,
			PageSpec _page, std::optional<Value> _defaultSetup)
			: DeskSession(_processor)
			, m_engines(std::move(_engines))
			, m_setup(_processor)
			, m_defaultSetup(std::move(_defaultSetup))
			, m_learn(pluginProcessorOf(_processor), std::move(_learn), [this](const Value& _m) { toPage(_m); })
			, m_page(std::move(_page))
			, m_followHost(followsHost(_processor))
		{
			m_engine = m_record->make(*this);
			m_desk = std::make_unique<DeskT>(m_engine->adapter(m_record->profile), port());
			// What the machine does now, before the page's first document: a machine still being prepared is
			// "loading" from the start, never addressed as a running one (B-003).
			m_desk->setProbe(m_engine->probe());
			// B-019: a .syx import reads back what the machine took from the dumps it sends
			m_desk->setSysexTap([this](const std::vector<uint8_t>& _m) { m_syx.onMachineSysex(_m); });
			m_choices = choices();
			m_desk->setEngines(m_choices);
			restoreSetup();
		}

		void onPageMessage(const Value& _message) override
		{
			// a page that starts says again whether it shows Mix (mixMeters), so the meters stop until it does
			if(deskCore::opOf(_message) == "ready")
				stopMixMeters();
			if(m_desk->onPageMessage(_message))
				return;
			const auto* row = deskHost::commands().find(deskCore::opOf(_message));
			if(!row)
			{
				reply(_message, false, "unknown command " + deskCore::opOf(_message));
				return;
			}
			if(row->handler.actor != deskHost::Actor::Session)
			{
				reply(_message, false, "the editor window acts on " + deskCore::opOf(_message));
				return;
			}
			if(const auto errors = deskHost::Table::check(*row, _message); !errors.empty())
			{
				reply(_message, false, errors.front());
				return;
			}
			// 0.6 (wave 6): the SysEx rows the session runs (mdSyxWork.h); a factory reset is the model's
			if(m_syx.handle(*m_desk, _message, [this](const Value& _m, const bool _ok, const std::string& _n) { reply(_m, _ok, _n); },
				[this](const Value& _m) { toPage(_m); }))
				return;
			switch(row->handler.action)
			{
			case Action::Engine: setEngine(_message); break;
			case Action::RecheckFirmware: recheckFirmware(_message); break;
			case Action::RevealRomFolder: revealRomFolder(_message); break;
			case Action::RomInfo: romInfo(_message); break;
			case Action::RemoveRom: removeRom(_message); break;
			case Action::MachineReset: machineReset(_message); break;
			case Action::Midi: onMidi(_message); break;
			case Action::OutputGain:
				// the next outputLevel message (within g_outputLevelMs) brings the gain back to the page
				setOutputGainDb(processor(), _message.find("db")->asNumber());
				reply(_message, true, "");
				break;
			case Action::MixMeters:
				m_mixMeters = _message.find("on")->asBool();
				processor().setMixMeterWanted(m_mixMeters);
				reply(_message, true, "");
				break;
			case Action::MemoryKeep:
				processor().setKeepMachineMemory(_message.find("on")->asBool());
				reply(_message, true, "");
				break;
			case Action::MemoryFactory:
			{
				std::string note;
				const bool ok = processor().startFromFactoryMemory(note);
				reply(_message, ok, note);
				break;
			}
			case Action::LearnStart:
			case Action::LearnAdd:
			case Action::LearnSetCc:
			case Action::LearnCancel:
			case Action::LearnRemove:
			case Action::LearnInvert: m_learn.handle(row->handler.action, _message); break;
			default: break;	// the window's rows (actor Window, above)
			}
		}

		void step() override
		{
			// the 8 ms steps this one stands for (more than one without a page: g_idleStepMs)
			const auto span = stepSpan();
			const auto t = m_tick += span;
			const auto due = [t, span](const double _periodMs) { return mdJucePlugin::due(t, _periodMs, span); };
			m_learn.enforce();	// MIDI mapping off: none applied, whatever the disk or the project brought
			m_engine->step(*m_desk, t, span);
			if(const auto text = m_setup.restored())
				loadSetup(*text);
			if(due(g_engineChoicesMs))
				publishChoices();
			if(m_desk->pageSeen() && due(g_deskTickMs))
				m_desk->tick();
			// P7: in a DAW the host's tempo and transport reach the machine as MIDI clock, Start and Stop
			// (synthLib::MidiClock); the machine follows them only with its global set for it. The model
			// says how (hostFollowing), the adapter sets it without an undo step; ready machines only.
			// P7, B-019: a .syx import goes to the machine as it is, a few messages at a time while the machine takes
			// input, then each document is read back (mdSyxSession.h)
			if(m_syx.running() && m_desk->lifecycle() == deskCore::Lifecycle::Ready)
			{
				m_syx.step(*m_desk, sessionNowMs(), m_record->profile.wire, [this](const Value& _m) { toPage(_m); });
				m_desk->flush();
			}
			stepModel();
			// B-030: at once when the machine becomes ready (not up to 2 s later), then on the cadence. A refusal is a
			// result (op followHost) the page shows and logs.
			const bool ready = m_desk->lifecycle() == deskCore::Lifecycle::Ready;
			if(m_followHost && ready && (!m_followReady || due(g_followHostMs)))
			{
				Value m = Value::object();
				m.set("op", "followHost");
				m.set("project", processor().projectStateSeen());
				m_desk->onPageMessage(m);
				// review 1 (I-026): the global's TEMPO IN is the switch: the host's clock goes to the machine only while it
				// follows
				const auto st = m_desk->status();
				const auto* hc = st.find("hostClock");
				const bool on = !hc || !hc->isBool() || hc->asBool();
				if(on != m_hostClockOn)
				{
					m_hostClockOn = on;
					processor().setHostClock(on);
					m_hostTempo = {};	// the page hears "follows" again at once
				}
			}
			m_followReady = ready;
			// B-035: while the machine starts (and for the first minute): the host's audio calls and the machine's
			// speed, for the start-up card
			if(m_desk->pageSeen() && due(g_audioRunMs) && (static_cast<double>(t) * g_stepMs < 60000 || !ready))
				if(auto a = audioRunOf(processor()))
					toPage(*a);
			// I-018: the CPU meter in the top bar (no lock: atomics read on this thread, mdCpuLoad.h)
			if(m_desk->pageSeen() && due(g_cpuLoadMs))
				toPage(cpuLoadOf(processor()));
			// 0.6: the notes from outside (LEARN; no lock: mdMidiIn.h). Taken also while no page is up, so a page that opens
			// later does not get old ones (the queue is emptied when the session starts, too).
			for(uint64_t n = 0; n < g_midiInPerStep * span; ++n)
			{
				const auto note = processor().takeMidiIn();
				if(!note)
					break;
				if(m_desk->pageSeen())
					toPage(midiInOf(*note));
			}
			// I-024: the machine memory's state (KEEP MEMORY, a file saved, what went wrong) when it changed
			if(m_desk->pageSeen() && processor().machineMemoryVersion() != m_memorySeen)
			{
				m_memorySeen = processor().machineMemoryVersion();
				toPage(machineMemoryOf(processor()));
			}
			// I-002, B-062: the notes held from outside, as a state (the Perform keyboard's lit keys; no lock)
			if(m_desk->pageSeen() && due(g_midiHeldMs))
				if(const auto held = m_midiHeld.next(heldMidiNotesOf(processor())))
					toPage(midiHeldOf(*held));
			// 0.8 (WP3): the MIDI monitor's counts (no lock: relaxed atomics, mdMidiMonitor.h)
			if(m_desk->pageSeen() && due(g_midiStatsMs))
				toPage(midiStatsOf(processor()));
			// I-032: the Mix page's output pair meters, while it is shown (no lock: relaxed atomics, mdMixMeters.h)
			if(m_mixMeters && m_desk->pageSeen() && due(g_mixLevelsMs))
				toPage(mixLevelsOf(processor()));
			// I-021: the LCD's output meter and volume (no lock: one atomic swap, mdOutputLevel.h)
			if(m_desk->pageSeen() && due(g_outputLevelMs))
				toPage(outputLevelOf(processor()));
			// B-030: the host's tempo (a DAW's playhead, also while it is stopped) for the LCD's TEMPO
			if(m_desk->pageSeen() && due(g_hostTempoMs))
				if(const auto bpm = m_hostTempo.next(hostBpmOf(processor())))
				{
					Value h = Value::object();
					h.set("type", "host");
					h.set("bpm", *bpm);
					h.set("follows", m_followHost && m_hostClockOn);
					toPage(h);
				}
		}

		std::string status() const override
		{
			return "desk: engine " + m_record->profile.id + " " + deskCore::lifecycleName(m_desk->lifecycle()) + " "
				+ elektronData::json::write(m_desk->status());
		}

		std::string lifecycleName() const override { return deskCore::lifecycleName(m_desk->lifecycle()); }
		// a .syx import paces its messages on the session's steps: 8 ms also with no page up
		// and a real machine's wire with messages waiting (one leaves per step: at 64 ms a kit would crawl)
		bool needsPace() const override { return m_syx.running() || m_engine->wireBusy(); }

		const PageSpec& pageSpec() const override { return m_page; }

		DeskT& desk() { return *m_desk; }
		const DeskT& desk() const { return *m_desk; }
		const Record& record() const { return *m_record; }

	protected:
		virtual void onMidi(const Value& _message) { reply(_message, false, "midi: this editor's page has no keyboard"); }
		// machineReset {how} that SyxWork does not run (the Machinedrum's factory reset): the model's
		virtual void machineReset(const Value& _message) { reply(_message, false, "This machine has no such reset in the editor."); }
		// The model's own step work (the factory data being prepared).
		virtual void stepModel() {}
		SyxWork<DeskT>& syx() { return m_syx; }
		virtual const char* missingText() const = 0;
		EngineT& currentEngine() { return *m_engine; }
		void onDetach() override
		{
			stopMixMeters();
			m_desk->detachPage();
		}

	private:
		// The desk's edges that are the session's: the page and the project's setup (the device
		// edge is the engine's adapter).
		typename DeskT::Port port()
		{
			typename DeskT::Port p;
			p.device.nowMs = [] { return sessionNowMs(); };
			p.toPage = [this](const Value& _m) { toPage(_m); };
			p.saveSetup = [this](const Value& _setup) { m_setup.save(_setup); };
			// After the page's ready the plug-in publishes its own document too, and the host's tempo and the held notes
			// again, and the machine memory's state.
			p.ready = [this]
			{
				m_learn.publish();
				m_hostTempo = {};
				m_midiHeld = {};
				m_memorySeen = 0;
				if(m_setupNotice)
					toPage(*m_setupNotice);
				m_setupNotice.reset();
			};
			return p;
		}

		void restoreSetup()
		{
			if(const auto text = m_setup.restored())
				loadSetup(*text);
		}

		// The editor's setup from the project, or the model's default when the project has none. The desk takes what it
		// can use (a newer editor's setup, a damaged one) and the default for the rest, never the previous project's; what
		// it left out is logged and said to the page (at once, or when the page is ready).
		void loadSetup(const std::string& _text)
		{
			std::vector<std::string> errors;
			auto doc = _text.empty() ? m_defaultSetup : elektronData::json::parse(_text);
			if(!doc)
			{
				errors.emplace_back("$: not JSON; the default setup is used");
				doc = m_defaultSetup ? *m_defaultSetup : Value::object();
			}
			const auto more = m_desk->loadSetup(*doc);
			errors.insert(errors.end(), more.begin(), more.end());
			m_setupNotice.reset();
			if(errors.empty())
				return;
			std::string text = "The project's editor setup was written by a newer editor or is damaged: what this version cannot read was left out or reset (";
			for(size_t i = 0; i < errors.size() && i < 3; ++i)
				text += (i ? "; " : "") + errors[i];
			text += errors.size() > 3 ? "; ...)." : ").";
			log("setup: " + text);
			Value m = Value::object();
			m.set("type", "error");
			m.set("message", text);
			if(m_desk->pageSeen())
				toPage(m);
			else
				m_setupNotice = std::move(m);
		}

		std::vector<deskCore::EngineChoice> choices() const
		{
			std::vector<deskCore::EngineChoice> out;
			for(const auto& r : m_engines)
			{
				const auto a = r.available ? r.available(*this) : Availability{};
				out.push_back({r.profile.id, r.profile.label, a.available, a.reason});
			}
			return out;
		}

		void publishChoices()
		{
			auto next = choices();
			const auto same = [](const deskCore::EngineChoice& _a, const deskCore::EngineChoice& _b)
			{
				return _a.id == _b.id && _a.label == _b.label && _a.available == _b.available && _a.reason == _b.reason;
			};
			if(std::equal(next.begin(), next.end(), m_choices.begin(), m_choices.end(), same))
				return;
			m_choices = std::move(next);
			m_desk->setEngines(m_choices);
		}

		void setEngine(const Value& _message)
		{
			const auto* kind = _message.find("kind");
			const auto id = kind && kind->isString() ? kind->asString() : std::string();
			const Record* record = nullptr;
			for(const auto& r : m_engines)
				if(r.profile.id == id)
					record = &r;
			if(!record)
			{
				reply(_message, false, "engine: not in the engine map");
				return;
			}
			if(record != m_record)
			{
				if(const auto a = record->available ? record->available(*this) : Availability{}; !a.available)
				{
					reply(_message, false, a.reason);
					return;
				}
				// The new engine first, then the desk takes its adapter (the old adapter goes with it),
				// then the old engine: nothing ever points into an engine that is gone. An engine on a
				// wire routes the plug-in's MIDI for its own lifetime.
				auto engine = record->make(*this);
				m_record = record;
				m_desk->setEngine(engine->adapter(record->profile));
				m_engine = std::move(engine);
				m_choices = choices();
				m_desk->setEngines(m_choices);
			}
			reply(_message, true, "Engine: " + record->profile.label);
		}

		void openSyx(const juce::File& _file) override
		{
			juce::MemoryBlock mb;
			if(_file.getSize() > 32 * 1024 * 1024 || !_file.loadFileAsData(mb))
			{
				Value m = Value::object();
				m.set("type", "syxPreview"); m.set("ok", false); m.set("file", _file.getFileName().toStdString());
				m.set("text", "The file could not be read.");
				toPage(m);
				return;
			}
			const auto* d = static_cast<const uint8_t*>(mb.getData());
			toPage(m_syx.open(*m_desk, std::vector<uint8_t>(d, d + mb.getSize()), _file.getFileName().toStdString()));
		}

		// 0.6: the kinds and ranges the page asked for (none: every document the editor holds); the Monomachine's
		// waveforms are read from the machine first, then the file is written.
		void exportSyx(const juce::File& _file, const Value& _request) override
		{
			using Work = SyxWork<DeskT>;
			const auto r = Work::exportRequest(_request);
			const auto write = [this, _file, all = r.all](const std::vector<uint8_t>& _bytes, const std::string& _words)
			{
				Value m = Value::object();
				m.set("type", "syxExport");
				const bool ok = !_bytes.empty() && _file.replaceWithData(_bytes.data(), _bytes.size());
				m.set("ok", ok);
				m.set("running", false);
				m.set("text", ok ? "Wrote " + _file.getFileName().toStdString() + " (" + std::to_string(_bytes.size()) + " bytes): "
					+ (all ? "every document the editor holds (" + _words + ")." : _words + ".")
					: _bytes.empty() ? "Nothing to write: the editor holds none of what was chosen." : "The .syx could not be written.");
				toPage(m);
			};
			if(r.waves)
			{
				if(!m_syx.exportStart(*m_desk, r, write))
				{
					Value m = Value::object();
					m.set("type", "syxExport");
					m.set("ok", false);
					m.set("text", "An import or export is running: try again when it is done.");
					toPage(m);
				}
				return;
			}
			write(Work::exportBytes(*m_desk, r), Work::exportWords(*m_desk, r));
		}

		void recheckFirmware(const Value& _message)
		{
			using P = deskCore::LifeFacts::Probe;
			const auto p = m_engine->probe();
			m_desk->setProbe(p);
			reply(_message, p != P::Missing && p != P::Unsupported, p == P::Missing ? missingText()
				: p == P::Unsupported ? "This ROM is not the firmware the editor knows." : "Firmware found");
		}

		std::vector<Record> m_engines;
		const Record* m_record = &m_engines.front();
		SetupStore m_setup;
		std::optional<Value> m_defaultSetup;
		std::optional<Value> m_setupNotice;	// what the project's setup lacked, for a page that was not up yet
		MidiLearnCommands m_learn;
		PageSpec m_page;
		std::unique_ptr<EngineT> m_engine;
		std::unique_ptr<DeskT> m_desk;
		std::vector<deskCore::EngineChoice> m_choices;
		uint64_t m_tick = 0;
		// A plug-in in a host (a DAW): not the standalone app, which has no host transport, and not a
		// processor without a plug-in wrapper (the tests).
		const bool m_followHost;
		bool m_hostClockOn = true;	// review 1 (I-026): the machine follows the host's clock (its global's TEMPO IN EXT)
		bool m_followReady = false;
		HostTempo m_hostTempo;
		bool m_mixMeters = false;	// I-032: the page shows Mix (its mixMeters command): mixLevels flow, the audio thread measures
		void stopMixMeters()
		{
			m_mixMeters = false;
			processor().setMixMeterWanted(false);
		}
		uint32_t m_memorySeen = 0;	// the machine memory status last published (0: publish again)
		midiIn::HeldFeed m_midiHeld;
		SyxWork<DeskT> m_syx;
	};

	// The machine's own screen while it starts, as the page's LCD (both models): every g_lcdMs, only
	// when it changed, through the desk (so it goes out in order with the rest). Not while the machine is
	// prepared (lifecycle "loading": a restored project or the first start's flash formatting): that run is
	// replaced by the one that follows, and its screen would be a start-up animation before the real one.
	class LcdFeed
	{
	public:
		template<typename DeskT, typename Read>
		void step(DeskT& _desk, const uint64_t _tick, const uint64_t _span, const Read& _read)
		{
			if(_desk.isInputReady() || _desk.lifecycle() == deskCore::Lifecycle::Loading)
			{
				m_last.clear();
				return;
			}
			if(!due(_tick, g_lcdMs, _span))
				return;
			std::vector<uint8_t> bits;
			if(_read(bits) && bits != m_last)
			{
				m_last = bits;
				_desk.showLcd(bits);
			}
		}

	private:
		std::vector<uint8_t> m_last;
	};
}
