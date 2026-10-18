// B-037: the emulated machine's own MIDI out reaches the host's MIDI out (the standalone's MIDI output port, a DAW's
// plug-in MIDI out): its notes, CCs, program changes, pitch bend, pressure, clock and transport; never its SysEx
// (the answers to the editor's own requests). mdMachineMidiOut.h.
//   mdMachineMidiOutTest          the route as plain values: which kinds go, which do not, a loaded project's matrix
//   mdMachineMidiOutTest <md|mm>  the processor with the machine's firmware (GEARMULATOR_MD_FIRMWARE_BIN /
//                                 GEARMULATOR_MM_FIRMWARE_BIN; exits 77 without it): while the machine plays, its
//                                 notes (MD) or clock and transport (MM) come out of processBlock's MIDI buffer, and
//                                 none of the SysEx it sends the editor does; without the route nothing comes out; a
//                                 project saved without the route gets it back when loaded
//   mdMachineMidiOutTest <md|mm> transport   WP2 (PLAN-0.8, B-121, B-154): the plug-in in a DAW with a scripted play head:
//                                 Play, Stop, loop jump, seek, Tempo INT/EXT, host Program Change, notes, no SysEx out,
//                                 and the machine's out fed back into its in for 10 s with an external clock
#include "mdMachineMidiOut.h"

#include "mdController.h"
#include "mdDeskHost.h"
#include "mdDeskSession.h"
#include "mdPluginProcessor.h"

#include "mdLib/mddeskdevice.h"

#include "elektronData/json.h"

#include "juce_audio_utils/juce_audio_utils.h"
#include "synthLib/midiClock.h"
#include "synthLib/plugin.h"
#include "synthLib/romLoader.h"

#include <array>
#include <atomic>
#if JUCE_MAC
#include <CoreFoundation/CoreFoundation.h>
#endif
#include <chrono>
#include <cstdio>
#include <cmath>
#include <cstdlib>
#include <functional>
#include <cstring>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#if !JUCE_MAC
namespace juce::detail
{
	// JUCE's own step of the message loop (juce_Messaging_linux.cpp, _windows.cpp), as mdSessionNoRomTest uses it.
	bool dispatchNextMessageOnSystemQueue(bool _returnIfNoPendingMessages);
}
#endif

namespace
{
	namespace route = mdJucePlugin::machineMidiOut;
	using Source = synthLib::MidiEventSource;
	using Value = elektronData::json::Value;

	int g_failures = 0;
	bool g_long = false;	// transport: every window at the plan's full length (--long)

	void setDataRoot(const juce::File& _folder)
	{
#if defined(_WIN32)
		_putenv_s("GEARMULATOR_DATA_ROOT", _folder.getFullPathName().toRawUTF8());
#else
		setenv("GEARMULATOR_DATA_ROOT", _folder.getFullPathName().toRawUTF8(), 1);
#endif
	}

	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s: %s\n", _ok ? "ok" : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}

	synthLib::SMidiEvent event(const Source _source, const uint8_t _a, const uint8_t _b = 0, const uint8_t _c = 0)
	{
		return synthLib::SMidiEvent(_source, _a, _b, _c);
	}

	synthLib::SMidiEvent sysex(const Source _source, const std::vector<uint8_t>& _bytes)
	{
		synthLib::SMidiEvent e(_source);
		e.sysex.assign(_bytes.begin(), _bytes.end());
		return e;
	}

	// ---- the route as plain values ----

	int values()
	{
		std::puts("the route (mdMachineMidiOut.h)");
		synthLib::MidiRoutingMatrix upstream;
		check(!route::toHost(upstream, event(Source::Device, 0x90, 36, 100)),
			"upstream's default matrix: the machine's notes never reach the host (B-037)");

		synthLib::MidiRoutingMatrix m;
		route::route(m);
		struct Kind { synthLib::SMidiEvent e; const char* name; };
		const std::array<Kind, 12> go{{
			{event(Source::Device, 0x90, 36, 100), "note on (channel 1)"},
			{event(Source::Device, 0x8f, 60, 0), "note off (channel 16)"},
			{event(Source::Device, 0xb3, 74, 64), "CC"},
			{event(Source::Device, 0xc0, 9), "program change"},
			{event(Source::Device, 0xe5, 0, 64), "pitch bend"},
			{event(Source::Device, 0xd0, 80), "channel pressure"},
			{event(Source::Device, 0xa0, 60, 80), "poly pressure"},
			{event(Source::Device, 0xf8), "clock"},
			{event(Source::Device, 0xfa), "start"},
			{event(Source::Device, 0xfb), "continue"},
			{event(Source::Device, 0xfc), "stop"},
			{event(Source::Device, 0xf2, 0, 0),
				"song position (the matrix's bucket for system messages; neither firmware sends one)"},
		}};
		for(const auto& k : go)
			check(route::toHost(m, k.e), std::string("the machine's ") + k.name + " goes to the host");

		// The machine's SysEx: what it answers the desk (a Monomachine status reply, a Machinedrum kit dump's head, the
		// TurboMIDI speed answer); none of it may reach a real Elektron on the port
		const std::array<Kind, 3> stay{{
			{sysex(Source::Device, {0xf0, 0x00, 0x20, 0x3c, 0x03, 0x00, 0x72, 0x01, 0x05, 0xf7}), "status reply"},
			{sysex(Source::Device, {0xf0, 0x00, 0x20, 0x3c, 0x02, 0x00, 0x52, 0x04, 0x01, 0x00, 0xf7}), "kit dump"},
			{sysex(Source::Device, {0xf0, 0x00, 0x20, 0x3c, 0x00, 0x00, 0x11, 0x02, 0x02, 0xf7}), "TurboMIDI answer"},
		}};
		for(const auto& k : stay)
			check(!route::toHost(m, k.e), std::string("the machine's SysEx (") + k.name + ") never goes to the host");
		// The desk's own traffic is the editor's (the requests, its edits): not the device's output
		check(!route::toHost(m, sysex(Source::Editor, {0xf0, 0x00, 0x20, 0x3c, 0x03, 0x00, 0x70, 0x01, 0xf7})),
			"the desk's own SysEx request never goes to the host");
		check(!route::toHost(m, event(Source::Editor, 0xb0, 16, 64)), "the desk's own CC edit never goes to the host");
		check(!route::toHost(m, event(Source::Internal, 0xf8)),
			"the plug-in's internal clock to the machine never goes to the host");
		// The editor still gets all of the machine's MIDI, its SysEx too
		check(m.enabled(sysex(Source::Device, {0xf0, 0x7e, 0xf7}), Source::Editor),
			"the editor still gets the machine's SysEx");

		// A project's state carries the whole matrix: one saved before 0.4.0 has no route, a hand-edited
		// one may send SysEx
		{
			const route::RouteAfterLoad r(m);
			m = synthLib::MidiRoutingMatrix();	// what loading an old project's "MiRM" chunk does
		}
		check(route::toHost(m, event(Source::Device, 0xf8)),
			"after loading a project saved without the route, it is there again");
		m.setEnabled(Source::Device, Source::Host, synthLib::MidiRoutingMatrix::EventType::SysEx, true);
		try
		{
			const route::RouteAfterLoad r(m);
			throw std::range_error("a malformed chunk after MiRM");
		}
		catch(const std::range_error&)
		{
		}
		check(!route::toHost(m, stay[1].e) && route::toHost(m, go[0].e),
			"a load that throws still ends with the route, SysEx off");
		return g_failures;
	}

	// ---- the processor with the machine's firmware ----

	void pump(const int _ms)
	{
		const auto end = std::chrono::steady_clock::now() + std::chrono::milliseconds(_ms);
		while(std::chrono::steady_clock::now() < end)
		{
#if JUCE_MAC
			CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.008, false);
#else
			if(!juce::detail::dispatchNextMessageOnSystemQueue(true))
				std::this_thread::sleep_for(std::chrono::milliseconds(1));
#endif
		}
	}

	std::string str(const Value& _v, const char* _key)
	{
		const auto* f = _v.find(_key);
		return f && f->isString() ? f->asString() : std::string();
	}

	// What came out of processBlock's MIDI buffer: the host's MIDI out
	struct HostOut
	{
		std::atomic<int> notes{0}, ccs{0}, clocks{0}, starts{0}, stops{0}, sysex{0}, others{0};
		void reset() { notes = ccs = clocks = starts = stops = sysex = others = 0; }
		void add(const juce::MidiMessage& _m)
		{
			const auto* d = _m.getRawData();
			if(_m.isSysEx() || (_m.getRawDataSize() > 0 && d[0] == 0xf0)) ++sysex;
			else if(_m.isNoteOn()) ++notes;
			else if(_m.isController()) ++ccs;
			else if(d[0] == 0xf8) ++clocks;
			else if(d[0] == 0xfa || d[0] == 0xfb) ++starts;
			else if(d[0] == 0xfc) ++stops;
			else if(d[0] < 0x80 || d[0] >= 0xf0) ++others;	// not a channel message, not clock or transport
		}
	};

	int firmware(const bool _mm)
	{
		const char* rom = std::getenv(_mm ? "GEARMULATOR_MM_FIRMWARE_BIN" : "GEARMULATOR_MD_FIRMWARE_BIN");
		if(!rom || !juce::File(rom).existsAsFile())
		{
			std::puts("mdMachineMidiOutTest: SKIP (the firmware variable is not set)");
			return 77;
		}
		std::printf("the %s's MIDI out at the host\n", _mm ? "Monomachine" : "Machinedrum");
		// A data root of its own (nothing of the user's is touched) and a home kept between runs (the Machinedrum's
		// factory flash is prepared once, B-003)
		const auto tmp = juce::File::getSpecialLocation(juce::File::tempDirectory);
		const auto root = tmp.getChildFile("mdMachineMidiOut-" + juce::Uuid().toDashedString());
		root.createDirectory();
		setDataRoot(root);
		juce::ScopedJuceInitialiser_GUI juce;
		synthLib::RomLoader::addSearchPath(juce::File(rom).getParentDirectory().getFullPathName().toStdString());
		mdJucePlugin::AudioPluginAudioProcessor::EphemeralConfig config;
		const auto home = tmp.getChildFile(_mm ? "mdMachineMidiOutTest-mm" : "mdMachineMidiOutTest-md");
		home.createDirectory();
		config.deviceHomePath = home.getFullPathName().toStdString() + "/";
		auto processor = std::make_unique<mdJucePlugin::AudioPluginAudioProcessor>(
			_mm ? md::MachineModel::Monomachine : md::MachineModel::Machinedrum, config);
		juce::AudioProcessor& ap = *processor;
		ap.prepareToPlay(44100.0, 128);

		HostOut out;
		std::atomic<bool> run{true};
		std::thread audio([&]
		{
			juce::AudioBuffer<float> buf(ap.getTotalNumOutputChannels(), 128);
			juce::MidiBuffer midi;
			while(run)
			{
				midi.clear();
				buf.clear();
				ap.processBlock(buf, midi);
				for(const auto m : midi)
					out.add(m.getMessage());
				std::this_thread::sleep_for(std::chrono::microseconds(1500));	// about real time
			}
		});

		// Every SysEx the machine sends (the desk's answers), counted where the editor gets it
		std::atomic<int> deviceSysex{0};
		auto& controller = dynamic_cast<mdJucePlugin::Controller&>(processor->getController());
		auto sysexListener = std::make_unique<baseLib::EventListener<pluginLib::SysEx>>(controller.evDeviceSysex,
			[&](const pluginLib::SysEx&) { ++deviceSysex; });

		auto* session = processor->getDeskHost()->session();
		check(session != nullptr, "the desk session exists");
		if(!session)
		{
			run = false;
			audio.join();
			return 1;
		}
		std::vector<Value> published;
		std::mutex publishedLock;
		session->attach([&](const Value& _m) { const std::lock_guard l(publishedLock); published.push_back(_m); });
		session->onPageMessage(*elektronData::json::parse(R"({"op":"ready"})"));
		const auto lifecycle = [&]
		{
			const std::lock_guard l(publishedLock);
			for(auto it = published.rbegin(); it != published.rend(); ++it)
				if(str(*it, "type") == "machine")
					if(const auto* doc = it->find("doc"))
						return str(*doc, "lifecycle");
			return std::string();
		};
		int id = 100;
		const auto op = [&](const char* _op)
		{
			session->onPageMessage(*elektronData::json::parse(
				std::string(R"({"op":")") + _op + R"(","id":)" + std::to_string(++id) + "}"));
		};

		// The machine up (its start-up animation over: the desk takes commands), up to 180 s
		for(int i = 0; i < 1800 && lifecycle() != "ready"; ++i)
			pump(100);
		check(lifecycle() == "ready", "the machine is up (lifecycle " + lifecycle() + ")");

		// PLAY until the machine's MIDI comes out (a machine the processor started again asks for PLAY
		// again), up to 30 s
		const auto played = [&] { return _mm ? out.starts > 0 && out.clocks > 10 : out.notes > 5; };
		out.reset();
		for(int i = 0; i < 15 && !played(); ++i)
		{
			op("play");
			pump(2000);
		}
		pump(3000);
		// a slow machine (a shared CI runner) plays slower than real time: give the clocks until they are enough
		for(int i = 0; i < 300 && _mm && out.clocks <= 50; ++i)
			pump(100);
		op("stop");
		pump(1000);
		std::printf("  at the host: %d notes, %d CCs, %d clocks, %d starts, %d stops, %d SysEx, %d others; the machine "
			"sent the editor %d SysEx\n",
			out.notes.load(), out.ccs.load(), out.clocks.load(), out.starts.load(), out.stops.load(), out.sysex.load(),
			out.others.load(),
			deviceSysex.load());
		if(_mm)
			check(out.clocks > 50 && out.starts > 0 && out.stops > 0,
				"the Monomachine's clock, start and stop come out at the host while it plays");
		else
			check(out.notes > 5, "the Machinedrum's notes come out at the host while it plays");
		check(deviceSysex > 0, "the machine answered the desk in SysEx meanwhile");
		check(out.sysex == 0, "none of its SysEx reached the host");
		check(out.others == 0, "nothing but channel messages, clock and transport reached the host");

		// Without the route (upstream's matrix) the same playing machine sends the host nothing
		processor->getMidiRoutingMatrix() = synthLib::MidiRoutingMatrix();
		op("play");
		pump(1500);
		out.reset();
		pump(1500);
		const int unrouted = out.notes + out.ccs + out.clocks + out.starts + out.stops;
		op("stop");
		pump(500);
		check(unrouted == 0, "without the route nothing reaches the host (" + std::to_string(unrouted)
			+ " messages): processBlock reads it");

		// A project saved without the route (before 0.4.0) gets it back when loaded
		juce::MemoryBlock saved;
		ap.getStateInformation(saved);
		ap.setStateInformation(saved.getData(), static_cast<int>(saved.getSize()));
		check(route::toHost(processor->getMidiRoutingMatrix(), event(Source::Device, 0xf8)),
			"a project saved without the route has it again once loaded");

		run = false;
		audio.join();
		session->detach();
		sysexListener.reset();	// before the controller it listens to
		ap.releaseResources();
		processor.reset();
		root.deleteRecursively();
		return g_failures;
	}

	// ---- WP2 (PLAN-0.8): the host's transport and clock through the processor ----
	//
	// A processor as a plug-in in a DAW (wrapper type VST3: the desk sets TEMPO IN external, the host's clock and
	// transport go to the machine) with a scripted play head. The audio thread plays the host: it moves the position
	// on by the block, sends the injected MIDI, can send an external 24 PPQN clock and can feed the machine's MIDI out
	// back into its MIDI in. The test thread watches the machine (step, playing) and the host's MIDI out.

	struct ScriptedHost : juce::AudioPlayHead
	{
		std::atomic<bool> playing{false};
		std::atomic<double> bpm{120.0}, ppq{0.0}, seekTo{-1.0};

		juce::Optional<PositionInfo> getPosition() const override
		{
			PositionInfo p;
			if(bpm.load() > 0)
				p.setBpm(bpm.load());
			p.setIsPlaying(playing.load());
			p.setPpqPosition(ppq.load());
			return p;
		}
		void beforeBlock()
		{
			const double s = seekTo.exchange(-1.0);
			if(s >= 0)
				ppq = s;
		}
		void afterBlock(const int _frames, const double _rate)
		{
			if(playing.load() && bpm.load() > 0)
				ppq = ppq.load() + _frames * bpm.load() / (60.0 * _rate);
		}
	};

	struct Out
	{
		std::atomic<int> notes{0}, ccs{0}, clocks{0}, fa{0}, fb{0}, fc{0}, pcs{0}, sysex{0}, others{0}, anyTotal{0};
		void add(const juce::MidiMessage& _m)
		{
			const auto* d = _m.getRawData();
			++anyTotal;
			if(_m.isSysEx() || (_m.getRawDataSize() > 0 && d[0] == 0xf0)) ++sysex;
			else if(_m.isNoteOn()) ++notes;
			else if(_m.isController()) ++ccs;
			else if(_m.isProgramChange()) ++pcs;
			else if(d[0] == 0xf8) ++clocks;
			else if(d[0] == 0xfa) ++fa;
			else if(d[0] == 0xfb) ++fb;
			else if(d[0] == 0xfc) ++fc;
			else if(d[0] < 0x80 || d[0] >= 0xf0) ++others;
		}
	};

	struct Meter
	{
		std::mutex lock;
		double sumSqMain = 0, peak = 0;
		uint64_t frames = 0, samples = 0, clipped = 0, nonFinite = 0;
		void add(const juce::AudioBuffer<float>& _b)
		{
			const std::lock_guard l(lock);
			const int n = _b.getNumSamples();
			for(int c = 0; c < _b.getNumChannels(); ++c)
			{
				const float* p = _b.getReadPointer(c);
				for(int i = 0; i < n; ++i)
				{
					const float v = p[i];
					++samples;
					if(!std::isfinite(v)) { ++nonFinite; continue; }
					const double a = std::fabs(static_cast<double>(v));
					if(a > peak) peak = a;
					if(a >= 1.0) ++clipped;
					if(c < 2) sumSqMain += static_cast<double>(v) * v;
				}
			}
			frames += static_cast<uint64_t>(n);
		}
		void reset() { const std::lock_guard l(lock); sumSqMain = peak = 0; frames = samples = clipped = nonFinite = 0; }
		struct Read { double rms, peak; uint64_t samples, clipped, nonFinite; };
		Read read()
		{
			const std::lock_guard l(lock);
			return {frames ? std::sqrt(sumSqMain / (2.0 * double(frames))) : 0.0, peak, samples, clipped, nonFinite};
		}
	};

	int transport(const bool _mm)
	{
		const char* rom = std::getenv(_mm ? "GEARMULATOR_MM_FIRMWARE_BIN" : "GEARMULATOR_MD_FIRMWARE_BIN");
		if(!rom || !juce::File(rom).existsAsFile())
		{
			std::puts("mdMachineMidiOutTest transport: SKIP (the firmware variable is not set)");
			return 77;
		}
		const bool debug = std::getenv("MDMM_TRANSPORT_DEBUG") != nullptr;
		std::printf("the %s's transport and clock through the processor\n", _mm ? "Monomachine" : "Machinedrum");
		const auto tmp = juce::File::getSpecialLocation(juce::File::tempDirectory);
		const auto root = tmp.getChildFile("mdTransport-" + juce::Uuid().toDashedString());
		root.createDirectory();
		setDataRoot(root);
		juce::ScopedJuceInitialiser_GUI juce;
		synthLib::RomLoader::addSearchPath(juce::File(rom).getParentDirectory().getFullPathName().toStdString());
		mdJucePlugin::AudioPluginAudioProcessor::EphemeralConfig config;
		const auto home = tmp.getChildFile(_mm ? "mdTransportTest-mm" : "mdTransportTest-md");
		home.createDirectory();
		config.deviceHomePath = home.getFullPathName().toStdString() + "/";
		// A plug-in in a DAW: the desk sets TEMPO IN external and the host's clock and transport go to the machine
		juce::AudioProcessor::setTypeOfNextNewPlugin(juce::AudioProcessor::wrapperType_VST3);
		auto processor = std::make_unique<mdJucePlugin::AudioPluginAudioProcessor>(
			_mm ? md::MachineModel::Monomachine : md::MachineModel::Machinedrum, config);
		juce::AudioProcessor::setTypeOfNextNewPlugin(juce::AudioProcessor::wrapperType_Undefined);
		juce::AudioProcessor& ap = *processor;
		constexpr double rate = 44100.0;
		constexpr int block = 128;
		ap.prepareToPlay(rate, block);
		ScriptedHost host;
		ap.setPlayHead(&host);

		Out out;
		Meter meter;
		std::atomic<uint64_t> audioSamples{0};
		std::atomic<bool> run{true};
		// audio thread's inputs: injected messages, the external clock, the loopback
		std::mutex inLock;
		std::vector<juce::MidiMessage> injected;
		std::atomic<bool> extClock{false}, loopback{false};
		std::atomic<double> extBpm{120.0};
		std::atomic<int> extBurst{1};	// external clock ticks delivered together, this many at a time (a bus that buffers)
		std::atomic<uint64_t> fedBack{0}, extTicks{0};
		const auto inject = [&](const std::initializer_list<uint8_t> _bytes)
		{
			const std::lock_guard l(inLock);
			injected.emplace_back(_bytes.begin(), static_cast<int>(_bytes.size()), 0.0);
		};
		std::thread audio([&]
		{
			juce::AudioBuffer<float> buf(ap.getTotalNumOutputChannels(), block);
			juce::MidiBuffer midi;
			std::vector<juce::MidiMessage> feedback;
			double nextTick = 0;	// in samples of the audio clock
			bool clockWas = false;
			while(run)
			{
				midi.clear();
				buf.clear();
				host.beforeBlock();
				{
					const std::lock_guard l(inLock);
					for(const auto& m : injected)
						midi.addEvent(m, 0);
					injected.clear();
				}
				for(const auto& m : feedback)
					midi.addEvent(m, 0);
				feedback.clear();
				const auto t0 = audioSamples.load();
				const bool clockOn = extClock.load();
				if(clockOn && !clockWas)
				{
					nextTick = static_cast<double>(t0);
					midi.addEvent(juce::MidiMessage(0xfa), 0);
				}
				if(!clockOn && clockWas)
					midi.addEvent(juce::MidiMessage(0xfc), 0);
				clockWas = clockOn;
				if(clockOn)
				{
					const double perTick = rate * 60.0 / (extBpm.load() * 24.0);
					const int burst = std::max(1, extBurst.load());
					while(nextTick < static_cast<double>(t0 + block))
					{
						// a bus that buffers hands over its ticks together: the burst's first tick time, all at the block's start
						for(int i = 0; i < burst; ++i)
						{
							midi.addEvent(juce::MidiMessage(0xf8), burst > 1 ? 0 : std::max(0, static_cast<int>(nextTick - static_cast<double>(t0))));
							++extTicks;
						}
						nextTick += perTick * burst;
					}
				}
				ap.processBlock(buf, midi);
				host.afterBlock(block, rate);
				meter.add(buf);
				const bool loop = loopback.load();
				for(const auto m : midi)
				{
					const auto mm = m.getMessage();
					out.add(mm);
					if(loop && !(mm.isSysEx() || mm.getRawData()[0] == 0xf0))
					{
						feedback.push_back(mm);
						++fedBack;
					}
				}
				audioSamples += block;
				std::this_thread::sleep_for(std::chrono::microseconds(1500));
			}
		});

		std::atomic<int> deviceSysex{0};
		auto& controller = dynamic_cast<mdJucePlugin::Controller&>(processor->getController());
		auto sysexListener = std::make_unique<baseLib::EventListener<pluginLib::SysEx>>(controller.evDeviceSysex,
			[&](const pluginLib::SysEx&) { ++deviceSysex; });
		auto* session = processor->getDeskHost()->session();
		check(session != nullptr, "the desk session exists");
		if(!session)
		{
			run = false;
			audio.join();
			return 1;
		}
		std::vector<Value> published;
		std::mutex publishedLock;
		session->attach([&](const Value& _m) { const std::lock_guard l(publishedLock); published.push_back(_m); });
		session->onPageMessage(*elektronData::json::parse(R"({"op":"ready"})"));
		const auto lastMachine = [&]() -> Value
		{
			const std::lock_guard l(publishedLock);
			for(auto it = published.rbegin(); it != published.rend(); ++it)
				if(str(*it, "type") == "machine")
					return *it;
			return Value::object();
		};
		const auto lifecycle = [&]
		{
			const auto m = lastMachine();
			if(const auto* doc = m.find("doc"))
				return str(*doc, "lifecycle");
			return std::string();
		};
		int id = 100;
		const auto op = [&](const std::string& _json)
		{
			auto v = elektronData::json::parse(_json);
			v->set("id", ++id);
			session->onPageMessage(*v);
		};

		// The machine: its step and whether it plays, as the processor's device publishes them
		struct Tel { int step = -1, playing = -1; };
		const auto readTel = [&]
		{
			return processor->getPlugin().withDeviceLocked([&](synthLib::Device* _d)
			{
				Tel t;
				auto* d = dynamic_cast<md::DeskDevice*>(_d);
				if(!d)
					return t;
				if(_mm)
				{
					if(const auto tel = d->getMmTelemetry())
					{
						t.step = tel->step.load();
						t.playing = tel->running.load();
					}
				}
				else if(const auto tel = d->getSequencerTelemetry())
				{
					t.step = tel->step.load();
					t.playing = tel->playing.load();
				}
				return t;
			});
		};
		const auto overflows = [&]
		{
			return processor->getPlugin().withDeviceLocked([&](synthLib::Device* _d)
			{
				std::array<uint64_t, 2> o{0, 0};
				if(auto* d = dynamic_cast<md::DeskDevice*>(_d))
				{
					o[0] = d->getHardware().midiRxOverflowCount();
					o[1] = d->getHardware().scheduledMidiOverflowCount();
				}
				return o;
			});
		};
		// The machine's current pattern and global as the desk publishes them (the machine document)
		const auto numberAt = [&](const std::initializer_list<const char*> _path) -> int
		{
			const auto m = lastMachine();
			const Value* v = m.find("doc");
			for(const char* key : _path)
				v = v && v->isObject() ? v->find(key) : nullptr;
			return v && v->isNumber() ? static_cast<int>(v->asNumber()) : -1;
		};
		const auto pattern = [&]() -> int
		{
			const int a = numberAt({"pattern", "current"});
			if(a >= 0)
				return a;
			const int b = numberAt({"pattern"});
			return b >= 0 ? b : numberAt({"status", "pattern"});
		};

		// The step counter and the pattern length (the step the counter wrapped from, seen at least once)
		int steps = 0, lastStep = -1, observedLength = 0;
		const auto poll = [&]
		{
			const auto t = readTel();
			if(t.step >= 0 && t.step != lastStep)
			{
				if(lastStep >= 0)
					++steps;
				if(lastStep >= 8 && t.step < lastStep && t.step <= 1)
					observedLength = lastStep + 1;
				lastStep = t.step;
			}
			return t;
		};
		// Pump the message thread and watch the machine for _ms of audio time (the machine may run slower than real
		// time on a loaded computer: the time the host plays is the audio's)
		const auto pumpOnce = [&]
		{
#if JUCE_MAC
			CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.004, false);
#else
			if(!juce::detail::dispatchNextMessageOnSystemQueue(true))
				std::this_thread::sleep_for(std::chrono::milliseconds(1));
#endif
			poll();
		};
		const auto watch = [&](const int _ms)
		{
			const auto target = audioSamples.load() + static_cast<uint64_t>(_ms * rate / 1000.0);
			const auto wallEnd = std::chrono::steady_clock::now() + std::chrono::milliseconds(_ms * 20 + 2000);
			while(audioSamples.load() < target && std::chrono::steady_clock::now() < wallEnd)
				pumpOnce();
		};
		const auto until = [&](const std::function<bool()>& _cond, const int _ms)
		{
			const auto target = audioSamples.load() + static_cast<uint64_t>(_ms * rate / 1000.0);
			const auto wallEnd = std::chrono::steady_clock::now() + std::chrono::milliseconds(_ms * 8 + 5000);
			while(!_cond() && audioSamples.load() < target && std::chrono::steady_clock::now() < wallEnd)
				pumpOnce();
			return _cond();
		};
		const auto playing = [&] { return poll().playing == 1; };
		const auto stopped = [&] { return poll().playing == 0; };
		// A stretch of machine time: steps the machine took, host quarter notes passed, seconds of audio
		struct Span { int steps0; double ppq0; uint64_t t0; int fc0, fa0, fb0, clocks0; };
		const auto begin = [&] { return Span{steps, host.ppq.load(), audioSamples.load(), out.fc.load(), out.fa.load(), out.fb.load(), out.clocks.load()}; };
		const auto stepsSince = [&](const Span& _s) { return steps - _s.steps0; };
		const auto quartersSince = [&](const Span& _s) { return host.ppq.load() - _s.ppq0; };
		const auto secondsSince = [&](const Span& _s) { return double(audioSamples.load() - _s.t0) / rate; };
		const auto hostPlay = [&](const double _bpm, const double _from)
		{
			host.bpm = _bpm;
			host.seekTo = _from;
			until([&] { return host.seekTo.load() < 0; }, 2000);
			host.playing = true;
		};
		const auto hostStop = [&] { host.playing = false; };
		const auto globalOp = [&](const char* _what, const bool _on) -> std::string
		{
			// TEMPO IN: the Machinedrum's global flag; the Monomachine's CLOCK IN (MIDI SYNC)
			if(!_mm)
				return std::string(R"({"op":"globalSet","field":")") + _what + R"(","on":)" + (_on ? "true" : "false") + "}";
			int g = numberAt({"globalSlot"});
			if(g < 0)
				g = numberAt({"global"});
			if(g < 0)
				g = numberAt({"status", "global"});
			g = std::max(g, 0);
			const std::string key = std::string(_what) == "tempoIn" ? "clockIn" : _what;
			return R"({"op":"globalMidi","g":)" + std::to_string(g) + R"(,")" + key + R"(":)" + (_on ? "true" : "false") + "}";
		};

		// ---- the machine up ----
		until([&] { return lifecycle() == "ready"; }, 180000);
		check(lifecycle() == "ready", "the machine is up (lifecycle " + lifecycle() + ")");
		if(debug)
			std::printf("  machine doc: %s\n", elektronData::json::write(lastMachine()).substr(0, 1500).c_str());
		watch(4000);
		check(processor->getPlugin().hostClock(), "a plug-in in a DAW: the host clock is on (TEMPO IN EXT)");
		check(processor->getPlugin().notesOffOnHostStop() == _mm,
			"All Notes Off with the host's Stop: the Monomachine only");
		// the Stop as the processor sends it: MIDI Stop, then CC 123 on all 16 channels for the Monomachine
		{
			std::vector<std::array<uint8_t, 3>> sent;
			synthLib::hostStopEvents(true, [&](const uint8_t a, const uint8_t b, const uint8_t c) { sent.push_back({a, b, c}); });
			bool all = sent.size() == 17 && sent[0][0] == 0xfc;
			for(uint8_t ch = 0; ch < 16 && all; ++ch)
				all = sent[size_t(ch) + 1][0] == (0xb0 | ch) && sent[size_t(ch) + 1][1] == 123 && sent[size_t(ch) + 1][2] == 0;
			check(all, "hostStopEvents(Monomachine): Stop, then All Notes Off (CC 123) on channels 1 to 16, in order");
			sent.clear();
			synthLib::hostStopEvents(false, [&](const uint8_t a, const uint8_t b, const uint8_t c) { sent.push_back({a, b, c}); });
			check(sent.size() == 1 && sent[0][0] == 0xfc, "hostStopEvents(Machinedrum): MIDI Stop alone");
		}

		// The Monomachine: wait for the whole memory, then T1 a plain voice held to its note off (as mmDeskFirmwareTest
		// hoststop does: GND-SIN, AMP HOLD 0 DEC 127, VOL 60, level 48), so a note into the processor is heard
		const auto setupT1 = [&]
		{
			if(!_mm)
				return;
			const auto k = std::to_string(std::max(0, numberAt({"kit", "current"})));
			op(R"({"op":"clearSound","g":30001,"k":)" + k + R"(,"t":0})");
			watch(800);
			op(R"({"op":"params","g":30002,"k":)" + k + R"(,"values":[[0,1,1,0],[0,1,2,127],[0,1,3,8],[0,1,5,60]]})");
			op(R"({"op":"level","g":30003,"k":)" + k + R"(,"t":0,"v":48})");
			watch(4000);
			if(debug)
			{
				const std::lock_guard l(publishedLock);
				int shown = 0;
				for(auto it = published.rbegin(); it != published.rend() && shown < 6; ++it)
					if(str(*it, "type") == "result")
					{
						std::printf("  result: %s\n", elektronData::json::write(*it).substr(0, 300).c_str());
						++shown;
					}
			}
		};
		if(_mm)
		{
			const auto loaded = [&]
			{
				const auto m = lastMachine();
				if(const auto* doc = m.find("doc"))
					if(const auto* l = doc->find("loading"))
						if(const auto* d = l->find("done"))
							if(const auto* t = l->find("total"))
								return d->isNumber() && t->isNumber() && d->asNumber() >= t->asNumber();
				return false;
			};
			check(until(loaded, 300000), "the Monomachine's memory is read");
			watch(1000);
			// the tracks on channels 1 to 6, so T1 is channel 1 whatever the machine was shipped with
			{
				auto o = elektronData::json::parse(globalOp("tempoIn", true));
				o->set("base", 0);
				o->set("span", 6);
				o->set("clockIn", true);
				session->onPageMessage(*o);
			}
			watch(4000);
			setupT1();
		}

		// ---- 1. Play from 0 at 120 BPM ----
		std::puts("1. Play from 0 at 120 BPM");
		out.fa = out.fb = out.fc = out.clocks = out.notes = 0;
		hostPlay(120, 0.0);
		// the desk sets TEMPO IN external once the machine's global is read (a few seconds, the Monomachine's whole memory first)
		const bool started = until(playing, 150000);
		check(started, "the host's Play starts the machine (the host clock reached the firmware)");
		watch(1500);
		auto sp = begin();
		watch(g_long ? 10000 : 8000);
		const double q1 = quartersSince(sp), s1 = secondsSince(sp);
		const int st1 = stepsSince(sp);
		std::printf("  %.2f quarters (%.2f s of audio): %d steps (%.2f per quarter), \n", q1, s1, st1, q1 > 0 ? st1 / q1 : 0.0);
		check(st1 >= 4 * q1 - 3 && st1 <= 4 * q1 + 3, "the machine runs at the host's tempo: 4 steps per quarter note (position advances)");
		if(_mm)
			check(out.fa + out.fb >= 1, "Play came out of the Monomachine as Start");
		if(_mm)
			check(out.clocks - sp.clocks0 >= 24 * q1 - 4 && out.clocks - sp.clocks0 <= 24 * q1 + 4,
				"the Monomachine's clock out is 24 per quarter of the host's (" + std::to_string(out.clocks - sp.clocks0) + ")");
		else
			check(out.notes > 0, "the Machinedrum's notes come out at the host while the host plays");
		const int patternLen = observedLength > 0 ? observedLength : 16;
		std::printf("  pattern length seen: %d steps\n", observedLength);

		// ---- 2. Stop ----
		std::puts("2. Stop");
		const int stopsBefore = out.fc;
		hostStop();
		check(until(stopped, 5000), "the host's Stop stops the machine");
		if(_mm)
			check(out.fc > stopsBefore, "the Monomachine's Stop came out at the host");
		const int stepAfterStop = steps;
		watch(1200);
		check(steps == stepAfterStop, "and it stays stopped (no step moves)");
		if(_mm)
		{
			// a note whose note off never comes, then the host's Stop: All Notes Off ends it (B-121)
			hostPlay(120, 0.0);
			until(playing, 8000);
			for(uint8_t ch = 0; ch < 8; ++ch)
				inject({static_cast<uint8_t>(0x90 | ch), 60, 110});	// held on every channel: whichever the tracks answer on
			watch(1500);
			meter.reset();
			watch(1000);
			const auto held = meter.read();
			hostStop();
			until(stopped, 5000);
			watch(1500);
			meter.reset();
			watch(1000);
			const auto after = meter.read();
			std::printf("  held note rms %.4f, 1.5 s after the host's Stop %.4f\n", held.rms, after.rms);
			check(held.rms > 0.003, "a held note sounds with the host playing");
			check(after.rms < held.rms * 0.35, "1.5 s after the host's Stop the held note is gone (All Notes Off)");
			for(uint8_t ch = 0; ch < 8; ++ch)
				inject({static_cast<uint8_t>(0x80 | ch), 60, 0});
			watch(300);
		}

		// ---- 3. Loop jump ----
		std::puts("3. Loop jump");
		hostPlay(120, 0.0);
		check(until(playing, 8000), "Play again from 0");
		watch(3000);
		const int fcB = out.fc, fbB = out.fb, faB = out.fa;
		const double ppqBefore = host.ppq.load();
		host.seekTo = 1.0;	// a loop: the host jumps back while it plays
		const auto jumpAt = begin();
		watch(300);
		std::printf("  jumped from %.2f to 1.00; Stop %d, Start %d, Continue %d came out\n", ppqBefore, out.fc - fcB, out.fa - faB, out.fb - fbB);
		if(_mm)
			check(out.fc > fcB && out.fb > fbB, "the jump came out as Stop and Continue (after SPP)");
		const bool playingAfterJump = until(playing, 3000);
		{
			const int s0 = steps;
			watch(1000);
			std::printf("  after the jump: running flag %d, %d steps in 1 s\n", readTel().playing, steps - s0);
			check(playingAfterJump || steps - s0 >= 3, "the machine plays after the jump");
		}
		watch(3000);
		auto sj = begin();
		watch(4000);
		const double qj = quartersSince(sj);
		check(stepsSince(sj) >= 4 * qj - 3 && stepsSince(sj) <= 4 * qj + 3, "and keeps the host's tempo");
		{
			// where the machine is against where the host is, in sixteenths, round the pattern
			const double expected = std::fmod(host.ppq.load() * 4.0, double(patternLen));
			const int now = readTel().step;
			double d = std::fabs(expected - now);
			d = std::min(d, patternLen - d);
			std::printf("  host at step %.1f of %d, machine at step %d (off by %.1f)\n", expected, patternLen, now, d);
			check(d <= 4.0, "the machine re-synced to the host's position (SPP honoured, within 4 steps)");
		}
		(void)jumpAt;

		// ---- 4. Seek while stopped ----
		std::puts("4. Seek while stopped");
		hostStop();
		until(stopped, 5000);
		watch(500);
		const int startsB = out.fa + out.fb, stopsB = out.fc, clocksB = out.clocks, stepsB = steps;
		host.seekTo = 7.25;
		watch(2000);
		check(readTel().playing == 0 && steps == stepsB, "a seek while stopped leaves the machine stopped");
		if(_mm)
			check(out.fa + out.fb == startsB && out.fc == stopsB && out.clocks == clocksB,
				"and sends the machine no Start, Stop or clock");
		hostPlay(120, 7.25);
		check(until(playing, 5000), "Play from the new position starts the machine");
		watch(1200);
		{
			const double expected = std::fmod(host.ppq.load() * 4.0, double(patternLen));
			const int now = readTel().step;
			double d = std::fabs(expected - now);
			d = std::min(d, patternLen - d);
			std::printf("  host at step %.1f of %d, machine at step %d (off by %.1f)\n", expected, patternLen, now, d);
			check(d <= 4.0, "the machine started at the host's position (SPP 29 + Continue, within 4 steps)");
		}
		hostStop();
		until(stopped, 5000);
		host.seekTo = 0.0;
		watch(500);

		// ---- 5. Tempo INT and EXT ----
		std::puts("5. Tempo INT and EXT");
		op(globalOp("tempoIn", false));
		const bool intSet = until([&] { return !processor->getPlugin().hostClock(); }, 180000);
		check(intSet, "Tempo in INT: the plug-in stops sending the host's clock to the firmware");
		hostPlay(90, 0.0);
		watch(3000);
		check(readTel().playing == 0, "INT: the host's Play does not start the machine (no clock, no Start reach the firmware)");
		op(R"({"op":"play"})");
		check(until(playing, 8000), "INT: PLAY on the machine plays it on its own clock");
		watch(1000);
		sp = begin();
		watch(4000);
		const double rate90 = stepsSince(sp) / secondsSince(sp);
		host.bpm = 150;
		watch(500);
		sp = begin();
		watch(4000);
		const double rate150 = stepsSince(sp) / secondsSince(sp);
		std::printf("  INT: %.2f steps/s with the host at 90 BPM, %.2f at 150 (the host's tempo %.2f / %.2f)\n", rate90, rate150, 6.0, 10.0);
		check(rate90 > 1 && std::fabs(rate150 / rate90 - 1.0) < 0.1, "INT: the machine's tempo does not follow the host's");
		op(R"({"op":"stop"})");
		hostStop();
		until(stopped, 5000);
		host.seekTo = 0.0;
		watch(300);
		op(globalOp("tempoIn", true));
		check(until([&] { return processor->getPlugin().hostClock(); }, 180000), "Tempo in EXT again: the host clock is on");
		hostPlay(120, 0.0);
		check(until(playing, 20000), "EXT again: the host's Play starts the machine");
		watch(1500);
		sp = begin();
		watch(4000);
		check(stepsSince(sp) >= 4 * quartersSince(sp) - 3 && stepsSince(sp) <= 4 * quartersSince(sp) + 3, "EXT again: the machine follows the host's tempo");
		hostStop();
		until(stopped, 5000);
		host.seekTo = 0.0;

		// ---- 7. Notes in (before 6: a pattern change loads another kit and the T1 voice built above is gone) ----
		std::puts("7. Notes in");
		op(R"({"op":"stop"})");
		watch(1500);
		meter.reset();
		watch(500);
		const double quiet = meter.read().rms;
		std::printf("  kit %d, pattern %d\n", numberAt({"kit", "current"}), pattern());
		double loud = 0, first = 0;
		int sounding = 0;
		if(_mm)
		{
			// the Monomachine's voices answer with the sequencer running, as mmDeskFirmwareTest hoststop plays them
			hostPlay(120, 0.0);
			until(playing, 20000);
			watch(1000);
		}
		for(int ch = 0; ch < (_mm ? 3 : 1); ++ch)
		{
			const uint8_t note = static_cast<uint8_t>(_mm ? 60 : 36);
			meter.reset();
			watch(300);
			const double pre = meter.read().rms;
			meter.reset();
			inject({static_cast<uint8_t>(0x90 | ch), note, 110});
			watch(1500);
			const double r = meter.read().rms;
			inject({static_cast<uint8_t>(0x80 | ch), note, 0});
			watch(1000);
			std::printf("  note in on channel %d: rms %.5f\n", ch + 1, r);
			loud = std::max(loud, r);
			if(ch == 0)
				first = r;
			const bool heard = r > pre * 2 + 0.002;
			if(heard)
				++sounding;
		}
		std::printf("  note in: rms %.5f quiet, %.5f with the note\n", quiet, loud);
		std::printf("  %d channels answered\n", sounding);
		if(_mm)
		{
			hostStop();
			until(stopped, 5000);
			host.seekTo = 0.0;
			watch(500);
		}
		check(first > quiet * 2 + 0.0005 && first > 0.002, std::string("a note into the processor sounds on the machine (")
			+ (_mm ? "T1 on channel 1, the voice built above)" : "track 1 by the key map)"));

		// ---- 6. Host Program Change selects the pattern ----
		std::puts("6. Host Program Change");
		if(!_mm)
		{
			op(R"({"op":"globalSet","field":"programChangeIn","on":true})");
			watch(3000);
		}
		const auto selects = [&](const int _program, const int _channel)
		{
			inject({static_cast<uint8_t>(0xc0 | _channel), static_cast<uint8_t>(_program)});
			return until([&] { return pattern() == _program; }, 12000);
		};
		if(debug)
			std::printf("  pattern before: %d\n", pattern());
		int pcChannel = -1;
		for(int ch = 0; ch < (_mm ? 16 : 1) && pcChannel < 0; ++ch)
			if(selects(10 + ch, ch))
				pcChannel = ch;
		check(pcChannel >= 0, "a host Program Change selects the pattern (channel " + std::to_string(pcChannel + 1) + ")");
		if(pcChannel >= 0)
		{
			check(selects(33, pcChannel), "and another one moves it (33)");
			selects(0, pcChannel);
		}
		if(!_mm)
		{
			op(R"({"op":"globalSet","field":"programChangeIn","on":false})");
			watch(1000);
		}

		// ---- 7. Notes in and out, no SysEx out ----
		
		hostPlay(120, 0.0);
		check(until(playing, 8000), "Play (notes out)");
		const int notesB = out.notes;
		watch(4000);
		if(_mm)
			check(out.clocks > 0, "the Monomachine's clock and transport come out");
		else
			check(out.notes > notesB, "the Machinedrum's notes come out at the host while it plays");
		hostStop();
		until(stopped, 5000);
		check(out.sysex == 0, "no SysEx came out at the host in the whole run (" + std::to_string(deviceSysex.load()) + " SysEx went to the editor)");
		check(out.others == 0, "nothing but channel messages, clock and transport came out");

		// ---- 8. Loopback (B-154) ----
		const auto loopbackRun = [&](const char* _name, const bool _loop, const int _burst)
		{
			std::printf("8. %s: the machine's out %s its in for %d s of audio, external 24 PPQN clock at 120 BPM%s\n", _name,
				_loop ? "fed into" : "not fed into", g_long ? 10 : 5, _burst > 1 ? ", ticks in bursts" : "");
			extBurst = _burst;
			extTicks = 0;
			hostStop();
			until(stopped, 5000);
			host.playing = false;
			const auto o0 = overflows();
			out.anyTotal = 0;
			const auto n0 = out.notes.load(), c0 = out.clocks.load();
			fedBack = 0;
			meter.reset();
			extClock = true;
			loopback = _loop;
			const auto start = audioSamples.load();
			// 10 s of audio, at most 15 minutes of wall time
			const auto wallEnd = std::chrono::steady_clock::now() + std::chrono::minutes(15);
			while(audioSamples.load() - start < static_cast<uint64_t>((g_long ? 10 : 5) * rate) && std::chrono::steady_clock::now() < wallEnd)
				watch(50);
			const auto m = meter.read();
			loopback = false;
			extClock = false;
			watch(1000);
			const auto o1 = overflows();
			const double secs = double(audioSamples.load() - start) / rate;
			std::printf("  %.1f s of audio: out %d messages (notes %d, clocks %d), %llu fed back, %llu external ticks;\n"
				"  output rms %.4f, peak %.3f, %llu of %llu samples at or over full scale, %llu not finite;\n"
				"  overflow counters: MIDI rx %zu -> %zu, scheduled MIDI %llu -> %llu\n",
				secs, out.anyTotal.load(), out.notes - n0, out.clocks - c0, static_cast<unsigned long long>(fedBack.load()),
				static_cast<unsigned long long>(extTicks.load()), m.rms, m.peak, static_cast<unsigned long long>(m.clipped),
				static_cast<unsigned long long>(m.samples), static_cast<unsigned long long>(m.nonFinite),
				static_cast<size_t>(o0[0]), static_cast<size_t>(o1[0]), static_cast<unsigned long long>(o0[1]),
				static_cast<unsigned long long>(o1[1]));
			check(secs >= (g_long ? 9.9 : 4.9), "ran the whole window");
			check(m.nonFinite == 0, std::string(_name) + ": every output sample is finite");
			check(m.samples > 0 && static_cast<double>(m.clipped) <= 0.001 * static_cast<double>(m.samples),
				std::string(_name) + ": the output stays within the clip budget (at most 0.1 % of samples at full scale)");
			check(m.peak < 8.0, std::string(_name) + ": the output peak is a level, not a blow-up");
			check(out.sysex == 0, std::string(_name) + ": still no SysEx out");
			op(R"({"op":"stop"})");
			watch(1500);
			return std::make_pair(o0, o1);
		};
		// the reporter's set-up: an external clock (and notes) into the machine, nothing fed back
		loopbackRun("external clock only", false, 1);
		loopbackRun("external clock only, ticks delivered in bursts", false, 6);
		loopbackRun("loopback, as set", true, 1);
		// the harsher setting: the machine sends its clock and transport out as well
		if(!_mm)
			op(R"({"op":"globalSet","field":"tempoOut","on":true})");
		else
		{
			// the Monomachine's CLOCK OUT and TRANSPORT OUT: the globalMidi op needs both flags together
			auto o = elektronData::json::parse(globalOp("tempoIn", true));
			o->set("clockOut", true);
			o->set("transportOut", true);
			session->onPageMessage(*o);
		}
		watch(3000);
		loopbackRun(_mm ? "loopback, clock and transport out on" : "loopback, tempo out on", true, 1);
		if(!_mm)
			op(R"({"op":"globalSet","field":"tempoOut","on":false})");
		watch(500);

		run = false;
		audio.join();
		session->detach();
		sysexListener.reset();
		ap.releaseResources();
		processor.reset();
		root.deleteRecursively();
		return g_failures;
	}
}

int main(const int _argc, char** const _argv)
{
	// Every line in a CI log, also when the process dies. Unbuffered, not line-buffered: the MSVC CRT has no line
	// buffering and takes _IOLBF with a size of 0 as an invalid parameter, a fail-fast (0xc0000409) before main's
	// next line (B-047)
	std::setvbuf(stdout, nullptr, _IONBF, 0);
	const bool md = _argc > 1 && std::strcmp(_argv[1], "md") == 0;
	const bool mm = _argc > 1 && std::strcmp(_argv[1], "mm") == 0;
	const bool trans = (md || mm) && _argc > 2 && std::strcmp(_argv[2], "transport") == 0;
	g_long = trans && _argc > 3 && std::strcmp(_argv[3], "--long") == 0;
	const int result = trans ? transport(mm) : md || mm ? firmware(mm) : values();
	if(result == 77)
		return 77;
	std::printf("mdMachineMidiOutTest: %s\n", g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
