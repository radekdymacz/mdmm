#include "mdDeskSession.h"
#include "synthLib/romLoader.h"
#include "mdLib/mdromcheck.h"

#include "mdSessions.h"
#include "mdRomInstall.h"

#include "mdPluginProcessor.h"
#include "mdDeskHost.h"
#include "mdProcessArch.h"
#include "mdLib/mdSpeedUpLevers.h"

#include "synthLib/midiTypes.h"

#include "juce_core/juce_core.h"
#include <algorithm>
#include <cmath>
#include <array>

namespace mdJucePlugin
{
	bool followsHost(AudioPluginAudioProcessor& _processor)
	{
		const juce::AudioProcessor& p = pluginProcessorOf(_processor);
		return p.wrapperType != juce::AudioProcessor::wrapperType_Undefined && p.wrapperType != juce::AudioProcessor::wrapperType_Standalone;
	}

	double hostBpmOf(AudioPluginAudioProcessor& _processor)
	{
		return _processor.getHostBpm();
	}

	std::optional<elektronData::json::Value> audioRunOf(AudioPluginAudioProcessor& _processor)
	{
		using Value = elektronData::json::Value;
		const auto& b = _processor.bootDiagnostics();
		if(!b.sampled())
			return std::nullopt;
		auto m = Value::object();
		m.set("type", "audioRun");
		m.set("plugin", !juce::JUCEApplicationBase::isStandaloneApp());
		m.set("seconds", static_cast<int>(b.last().wallMs / 1000.0));
		m.set("blocks", static_cast<double>(b.last().blocks));
		m.set("bypassed", static_cast<double>(b.last().bypassed));
		m.set("blocksPerSecond", b.rate().known ? b.rate().blocksPerSecond : 0.0);
		m.set("realtime", b.rate().known && b.last().blocks > 0 ? Value(b.rate().realtime) : Value());
		return m;
	}

	elektronData::json::Value cpuLoadOf(AudioPluginAudioProcessor& _processor)
	{
		using Value = elektronData::json::Value;
		const auto r = _processor.cpuLoadReading();
		const auto& b = _processor.bootDiagnostics();
		const auto& s = b.last();
		const auto round3 = [](const double _v) { return std::round(_v * 1000.0) / 1000.0; };
		const bool running = r.state == cpuLoad::State::Running;
		auto m = Value::object();
		m.set("type", "cpuLoad");
		m.set("state", cpuLoad::stateName(r.state));
		m.set("load", running ? Value(round3(r.load)) : Value());
		m.set("worst", running ? Value(round3(r.worst)) : Value());
		m.set("realtime", b.sampled() && b.rate().known && s.blocks > 0 ? Value(round3(b.rate().realtime)) : Value());
		m.set("sampleRate", s.sampleRate > 0 ? s.sampleRate : 0.0);
		m.set("blockSize", s.blockSize > 0 ? s.blockSize : 0);
		m.set("plugin", !juce::JUCEApplicationBase::isStandaloneApp());
		// the machine stopped moving and is muted (the scheduler's watchdog, mdschedwatchdog.h): the meter says so
		m.set("stalled", s.machine && s.stalled);
		// the speed-ups as the machine runs them (the boot sample reads them under its lock once a second)
		auto off = Value::array();
		if(s.machine && s.speedUps)
			for(const auto& l : md::speedUpLevers())
				if(s.leversOff & md::bit(l.lever))
					off.push(l.key);
		m.set("speedUps", !s.machine ? "unknown" : !s.speedUps ? "off" : off.asArray().empty() ? "on" : "some");
		m.set("leversOff", std::move(off));
		m.set("exactEssi", s.machine && s.speedUps && s.exactEssi);
		// what the next session starts with (the settings file; the menu's switches write it)
		auto saved = Value::object();
		saved.set("legacyEmulation", _processor.savedLegacyEmulation());
		auto savedOff = Value::array();
		for(const auto& l : md::speedUpLevers())
			if(_processor.savedSpeedUpLeversOff() & md::bit(l.lever))
				savedOff.push(l.key);
		saved.set("leversOff", std::move(savedOff));
		m.set("saved", std::move(saved));
		const auto& arch = processArch::current();
		m.set("translated", arch.translated);
		m.set("arch", processArch::describe(arch));
		return m;
	}

	elektronData::json::Value outputLevelOf(AudioPluginAudioProcessor& _processor)
	{
		using Value = elektronData::json::Value;
		const auto p = _processor.takeOutputPeaks();
		const auto db = outputLevel::dbOfGain(_processor.getOutputGain());
		const auto round4 = [](const float _v) { return std::round(static_cast<double>(_v) * 10000.0) / 10000.0; };
		auto m = Value::object();
		m.set("type", "outputLevel");
		m.set("peakL", round4(p.left));
		m.set("peakR", round4(p.right));
		m.set("clip", outputLevel::clipped(p.all));
		m.set("gainDb", db ? Value(*db) : Value());
		return m;
	}

	elektronData::json::Value mixLevelsOf(AudioPluginAudioProcessor& _processor)
	{
		using Value = elektronData::json::Value;
		namespace mm = mixMeters;
		const auto l = _processor.takeMixLevels();
		auto pairs = Value::array();
		for(size_t p = 0; p < mm::g_pairs; ++p)
		{
			auto peak = Value::array();
			auto rms = Value::array();
			for(size_t ch = p * 2; ch < p * 2 + 2; ++ch)
			{
				peak.push(mm::toDb(l.peak[ch]));
				rms.push(mm::toDb(l.rms[ch]));
			}
			auto o = Value::object();
			o.set("on", l.on[p]);
			o.set("clip", mm::clipped(std::max(l.peak[p * 2], l.peak[p * 2 + 1])));
			o.set("peak", std::move(peak));
			o.set("rms", std::move(rms));
			pairs.push(std::move(o));
		}
		auto m = Value::object();
		m.set("type", "mixLevels");
		m.set("pairs", std::move(pairs));
		return m;
	}

	elektronData::json::Value midiInOf(const midiIn::Note& _note)
	{
		auto m = elektronData::json::Value::object();
		m.set("type", "midiIn");
		m.set("ch", static_cast<int>(_note.channel));
		m.set("note", static_cast<int>(_note.note));
		m.set("vel", static_cast<int>(_note.velocity));
		return m;
	}

	void machineMemorySampleStoredOf(AudioPluginAudioProcessor& _processor)
	{
		_processor.machineMemorySampleStored();
	}

	elektronData::json::Value machineMemoryOf(AudioPluginAudioProcessor& _processor)
	{
		const auto s = _processor.machineMemoryStatus();
		auto m = elektronData::json::Value::object();
		m.set("type", "machineMemory");
		m.set("keep", s.keep);
		m.set("available", s.available);
		m.set("saved", s.saved);
		m.set("note", s.note);
		return m;
	}

	elektronData::json::Value midiStatsOf(AudioPluginAudioProcessor& _processor)
	{
		using Value = elektronData::json::Value;
		namespace mon = midiMonitor;
		const auto c = _processor.midiMonitorCounts();
		auto dirs = Value::object();
		for(size_t d = 0; d < mon::g_directions; ++d)
		{
			auto types = Value::object();
			for(size_t t = 0; t < mon::g_types; ++t)
				types.set(mon::typeName(static_cast<mon::Type>(t)), static_cast<double>(c.type[d][t]));
			auto channels = Value::array();
			for(const auto n : c.channel[d])
				channels.push(static_cast<double>(n));
			auto o = Value::object();
			o.set("total", static_cast<double>(c.total(static_cast<mon::Direction>(d))));
			o.set("types", std::move(types));
			o.set("channels", std::move(channels));
			dirs.set(mon::directionName(static_cast<mon::Direction>(d)), std::move(o));
		}
		auto dropped = Value::object();
		dropped.set("scheduled", static_cast<double>(c.dropped.scheduledOverflow));
		dropped.set("external", static_cast<double>(c.dropped.externalIn));
		dropped.set("allocation", static_cast<double>(c.dropped.allocationFallback));
		auto m = Value::object();
		m.set("type", "midiStats");
		m.set("directions", std::move(dirs));
		m.set("dropped", std::move(dropped));
		return m;
	}

	elektronData::json::Value midiHeldOf(const midiIn::Notes& _notes)
	{
		auto m = elektronData::json::Value::object();
		m.set("type", "midiHeld");
		auto notes = elektronData::json::Value::array();
		for(const auto& n : midiIn::list(_notes))
		{
			auto o = elektronData::json::Value::object();
			o.set("ch", n.ch);
			o.set("note", n.note);
			notes.push(std::move(o));
		}
		m.set("notes", std::move(notes));
		return m;
	}

	midiIn::Notes heldMidiNotesOf(AudioPluginAudioProcessor& _processor)
	{
		return _processor.heldMidiNotes();
	}

	void setOutputGainDb(AudioPluginAudioProcessor& _processor, const double _db)
	{
		_processor.setOutputGain(outputLevel::gainOfDb(_db));
	}

	pluginLib::Processor& pluginProcessorOf(AudioPluginAudioProcessor& _processor)
	{
		return _processor;
	}

	double sessionNowMs()
	{
		return juce::Time::getMillisecondCounterHiRes();
	}

	DeskSession::DeskSession(AudioPluginAudioProcessor& _processor) : m_processor(_processor)
	{
		// notes that came before this session are old: a page that opens later does not get them
		while(processor().takeMidiIn()) {}
	}

	DeskSession::~DeskSession()
	{
		stopTimer();
	}

	std::unique_ptr<DeskSession> DeskSession::create(AudioPluginAudioProcessor& _processor)
	{
		auto session = _processor.getModel() == md::MachineModel::Monomachine ? makeMmSession(_processor) : makeMdSession(_processor);
		// Steps start once the whole session exists, at the pace for no page (attach makes it 8 ms).
		session->pace();
		return session;
	}

	void DeskSession::attach(ToPage _toPage)
	{
		m_toPage = std::move(_toPage);
		onAttach();
		pace();
	}

	void DeskSession::detach()
	{
		onDetach();
		m_toPage = nullptr;
		pace();
	}

	void DeskSession::republish()
	{
		Value ready = Value::object();
		ready.set("op", "ready");	// no id: nobody waits for its result
		onPageMessage(ready);
	}

	void DeskSession::toPage(const Value& _message) const
	{
		// I-024: a sample the page sent is a save once the machine stores it (written by the machine memory's watch)
		if(const auto* type = _message.find("type"); type && type->isString() && type->asString() == "sampleLoad")
			if(const auto* state = _message.find("state"); state && state->isString() && state->asString() == "done")
				machineMemorySampleStoredOf(m_processor);
		if(m_toPage)
			m_toPage(_message);
	}

	void DeskSession::reply(const Value& _message, const bool _ok, const std::string& _note) const
	{
		toPage(deskCore::resultMessage(_message, _ok ? std::vector<std::string>{} : std::vector<std::string>{_note}, _note));
	}

	void DeskSession::installRom(const juce::File& _file)
	{
		const juce::File folder(juce::String::fromUTF8(m_processor.getPublicRomFolder().c_str()));
		const auto r = mdJucePlugin::replaceRom(_file, m_processor.getModel(), folder);
		Value m = Value::object();
		m.set("type", "romInstall");
		m.set("ok", r.ok);
		m.set("text", r.text);
		toPage(m);
		log(std::string("rom install ") + (r.ok ? "ok: " : "failed: ") + r.text);
		if(!r.ok)
			return;
		// The machine starts again with the new firmware, without reopening the plug-in; the page's boot
		// card shows its start-up.
		const bool restarted = pluginProcessorOf(m_processor).rebootDevice();
		if(restarted)
			m_processor.restoreHeldState();	// the project the app was opened with (no ROM held it)
		if(!restarted)
		{
			Value e = Value::object();
			e.set("type", "romInstall");
			e.set("ok", false);
			e.set("text", r.text + ". The machine did not start with it: close and reopen the plug-in.");
			toPage(e);
		}
	}

	void DeskSession::romInfo(const Value& _message) const
	{
		const auto model = m_processor.getModel();
		const juce::File folder(juce::String::fromUTF8(m_processor.getPublicRomFolder().c_str()));
		// The image the machine would start with: the first valid one along the same search paths.
		juce::File found;
		for(const auto& path : synthLib::RomLoader::findFiles(".bin", md::g_romSize, md::g_romSize))
		{
			const juce::File f(juce::String::fromUTF8(path.c_str()));
			juce::MemoryBlock mb;
			if(!f.loadFileAsData(mb))
				continue;
			const std::vector<uint8_t> bytes(static_cast<const uint8_t*>(mb.getData()), static_cast<const uint8_t*>(mb.getData()) + mb.getSize());
			if(md::checkRom(bytes, model).ok)
			{
				found = f;
				break;
			}
		}
		Value m = Value::object();
		m.set("type", "romInfo");
		m.set("installed", found != juce::File());
		m.set("os", std::string(md::firmwareName(model)));
		m.set("name", found.getFileName().toStdString());
		m.set("size", static_cast<double>(found.getSize()));
		m.set("folder", folder.getFullPathName().toStdString());
		m.set("inFolder", found != juce::File() && found.isAChildOf(folder));
		toPage(m);
		reply(_message, true, {});
	}

	void DeskSession::removeRom(const Value& _message)
	{
		const juce::File folder(juce::String::fromUTF8(m_processor.getPublicRomFolder().c_str()));
		const auto r = mdJucePlugin::removeRoms(m_processor.getModel(), folder);
		if(r.removed == 0)
		{
			reply(_message, false, r.text);
			return;
		}
		// The machine stops (the stand-in takes its place) and the page's start-up card asks for a ROM. The
		// project stays with the app meanwhile (DeskHost::holdState): the next ROM gets it back.
		juce::MemoryBlock project;
		m_processor.getStateInformation(project);
		if(!pluginProcessorOf(m_processor).rebootDevice())
		{
			reply(_message, false, r.text + " The machine did not stop: close and reopen the plug-in.");
			return;
		}
		m_processor.getDeskHost()->holdState(project.getData(), static_cast<int>(project.getSize()));
		reply(_message, true, r.text);
	}

	void DeskSession::revealRomFolder(const Value& _message) const
	{
		const juce::File folder(juce::String::fromUTF8(m_processor.getPublicRomFolder().c_str()));
		folder.createDirectory();
		folder.revealToUser();
		reply(_message, true, {});
	}

	void SetupStore::save(const Value& _setup)
	{
		m_processor.getDeskHost()->setSetup(elektronData::json::write(_setup));
		m_seen = m_processor.getDeskHost()->setupVersion();
	}

	std::optional<std::string> SetupStore::restored()
	{
		const auto version = m_processor.getDeskHost()->setupVersion();
		if(m_seen && *m_seen == version)
			return std::nullopt;
		m_seen = version;
		return m_processor.getDeskHost()->setup();
	}

	namespace
	{
		deskWire::MidiWire wireOf(AudioPluginAudioProcessor& _processor)
		{
			auto* p = &_processor;
			return deskWire::MidiWire([p](const deskWire::Bytes& _m)
			{
				synthLib::SMidiEvent e(synthLib::MidiEventSource::Editor);
				if(!_m.empty() && _m[0] == 0xf0)
					e.sysex.assign(_m.begin(), _m.end());
				else
				{
					e.a = _m.size() > 0 ? _m[0] : 0;
					e.b = _m.size() > 1 ? _m[1] : 0;
					e.c = _m.size() > 2 ? _m[2] : 0;
				}
				p->getExternalMidi().send(e);
			}, [p]
			{
				std::vector<synthLib::SMidiEvent> in;
				p->getExternalMidi().drainIn(in);
				std::vector<deskWire::Bytes> out;
				for(const auto& e : in)
					if(!e.sysex.empty())
						out.emplace_back(e.sysex.begin(), e.sysex.end());
				return out;
			});
		}
	}

	PluginWire::PluginWire(AudioPluginAudioProcessor& _processor) : m_processor(_processor), m_wire(wireOf(_processor))
	{
		m_processor.getExternalMidi().set(true);
		m_processor.midiInputsChanged();	// the held notes: from now on the machine's own MIDI comes in
	}

	PluginWire::~PluginWire()
	{
		m_processor.getExternalMidi().set(false);
		m_processor.midiInputsChanged();
	}

	Availability midiOutAvailability(const DeskSession& _session)
	{
		auto& p = _session.processor();
		// The standalone's MIDI output is chosen in its AUDIO / MIDI panel, after the engine. The editors' plug-ins
		// declare a MIDI out to their host (juce.cmake, NEEDS_MIDI_OUTPUT TRUE: producesMidi), where the host routes it
		// (B-037: the emulated machine's own MIDI goes there too, mdMachineMidiOut.h); a plug-in without one reaches a
		// machine only through its own MIDI port.
		if(p.wrapperType == juce::AudioProcessor::wrapperType_Standalone || static_cast<const juce::AudioProcessor&>(p).producesMidi()
			|| p.getMidiPorts().getOutputId().isNotEmpty())
			return {};
		return {false, "The plug-in has no MIDI out in this host: HW MIDI works in the standalone app."};
	}
}
