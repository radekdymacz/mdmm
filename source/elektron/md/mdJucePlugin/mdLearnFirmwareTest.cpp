// 0.8 (MIDI Learn L2, doc/midilearn/DESIGN-learn-0.8.md "Tests" 4, firmware half) on the real firmware, MIDI mapping on. A
// learned CC that is also on the firmware's CC map is the mapping's: it moves the learned parameter, and the machine's own
// target of that (channel, CC) does not move. The plug-in runs with its audio about real time and no editor; the page is
// the session's message interface. Steps:
//   1. before any mapping, the host's CC reaches the firmware's own target (so the CC does arrive)
//   2. learnAdd that (channel, CC) to another parameter: the CC moves that parameter (the plug-in's and the machine's
//      working kit), and the firmware's own target stays where it was
//   3. learnStart, two values from a controller (consumed: nothing of them reaches the machine), the step learns the
//      mapping, and the learned CC moves its parameter in the machine, not the firmware's target of that CC
//   4. learnRemove: the machine has the CC back
//   5. project round trip: the project is saved (getStateInformation) with the learned mapping, a new processor loads it
//      (setStateInformation), starts the firmware again, and the mapping is in the document, its CC still moves the
//      parameter and the machine, and the firmware's own target of that CC still does not move
//   6. B-169, a value that belongs to no track: a learned CC drives the Machinedrum's RHYTHM ECHO MOD (global 1) / the
//      Monomachine's MULTI ENV ATK (global 2) through the page's own edit path, and the machine's working kit shows it
//   GEARMULATOR_MD_FIRMWARE_BIN=<ROM> mdLearnFirmwareTest md
//   GEARMULATOR_MM_FIRMWARE_BIN=<ROM> mdLearnFirmwareTest mm
// Exits 77 without the ROM. The config is isolated (EphemeralConfig).

#include "mdPluginProcessor.h"
#include "mdController.h"
#include "mdDeskHost.h"
#include "mdDeskSession.h"
#include "mdStudioLink.h"
#include "mmStudioLink.h"

#include "mdLib/mddeskdevice.h"

#include "elektronData/json.h"
#include "elektronData/mdKit.h"
#include "elektronData/mdNames.h"
#include "elektronData/mdWorkingKit.h"
#include "elektronData/mmKit.h"

#include "juce_audio_utils/juce_audio_utils.h"
#include "jucePluginLib/controller.h"
#include "jucePluginLib/parameter.h"
#include "synthLib/romLoader.h"

#include <atomic>
#if JUCE_MAC
#include <CoreFoundation/CoreFoundation.h>
#endif
#include <chrono>
#include <cstdio>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

#if !JUCE_MAC
namespace juce::detail
{
	bool dispatchNextMessageOnSystemQueue(bool _returnIfNoPendingMessages);
}
#endif

namespace
{
	using Value = elektronData::json::Value;
	using Processor = mdJucePlugin::AudioPluginAudioProcessor;

	int g_failures = 0;
	bool g_mm = false;

	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s: %s\n", _ok ? "ok" : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}

	void pump(const int _ms)
	{
		const auto end = juce::Time::getMillisecondCounterHiRes() + _ms;
		while(juce::Time::getMillisecondCounterHiRes() < end)
		{
#if JUCE_MAC
			CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.008, false);
#else
			if(!juce::detail::dispatchNextMessageOnSystemQueue(true))
				std::this_thread::sleep_for(std::chrono::milliseconds(1));
#endif
		}
	}

	struct Target
	{
		int t = 0, pg = -1, i = 0;
	};

	std::string json(const Target& _at)
	{
		return "\"t\":" + std::to_string(_at.t) + (g_mm ? ",\"pg\":" + std::to_string(_at.pg) : std::string()) + ",\"i\":" + std::to_string(_at.i);
	}

	class Rig
	{
	public:
		// _state: a project to load before the audio starts (nullptr: a fresh instance)
		explicit Rig(const std::string& _home, const juce::MemoryBlock* _state = nullptr)
		{
			Processor::EphemeralConfig config;
			config.deviceHomePath = _home + "/";
			processor = std::make_unique<Processor>(g_mm ? md::MachineModel::Monomachine : md::MachineModel::Machinedrum, config);
			juce::AudioProcessor& ap = *processor;
			if(_state)
				ap.setStateInformation(_state->getData(), static_cast<int>(_state->getSize()));
			ap.prepareToPlay(44100.0, 128);
			m_audio = std::thread([this, &ap]
			{
				juce::AudioBuffer<float> buf(ap.getTotalNumOutputChannels(), 128);
				juce::MidiBuffer midi;
				while(m_run)
				{
					midi.clear();
					{
						const std::lock_guard lock(m_mutex);
						for(const auto& m : m_cc)
							midi.addEvent(m, 0);
						m_cc.clear();
					}
					buf.clear();
					ap.processBlock(buf, midi);
					std::this_thread::sleep_for(std::chrono::microseconds(1500));	// about real time
				}
			});
		}

		~Rig()
		{
			if(m_attached)
				processor->getDeskHost()->session()->detach();
			m_run = false;
			m_audio.join();
			static_cast<juce::AudioProcessor&>(*processor).releaseResources();
			processor.reset();
		}

		// A CC from the host, channel _ch 0-15, with the next block
		void cc(const int _ch, const int _cc, const int _v)
		{
			const std::lock_guard lock(m_mutex);
			m_cc.push_back(juce::MidiMessage::controllerEvent(1 + _ch, _cc, _v));
		}

		bool firmwareReady(const void** _hardware = nullptr)
		{
			return processor->getPlugin().withDeviceLocked([&](synthLib::Device* _d)
			{
				auto* d = dynamic_cast<md::DeskDevice*>(_d);
				if(_hardware)
					*_hardware = d ? &d->getHardware() : nullptr;
				return d && d->getHardware().isFirmwareMidiReady();
			});
		}

		// The firmware takes MIDI on one stable device for a while (the start-up animation is over, the processor's own
		// services are done)
		bool waitStarted()
		{
			const void* hw = nullptr;
			int stable = 0;
			for(int n = 0; n < 1500 && stable < 170; ++n)
			{
				const void* now = nullptr;
				const bool ready = firmwareReady(&now);
				stable = ready && now == hw ? stable + 1 : 0;
				hw = now;
				pump(96);
			}
			return stable >= 170;
		}

		// The value the machine's working kit holds for a target (nullopt: not read)
		std::optional<int> machine(const Target& _at)
		{
			std::vector<uint8_t> region;
			uint32_t sequence = 0;
			const bool read = processor->getPlugin().withDeviceLocked([&](synthLib::Device* _d)
			{
				auto* d = dynamic_cast<md::DeskDevice*>(_d);
				if(!d)
					return false;
				if(g_mm)
				{
					const auto t = d->getMmTelemetry();
					return t && t->readWorkingKit(region, sequence);
				}
				const auto t = d->getSequencerTelemetry();
				return t && t->readWorkingKit(region, sequence);
			});
			if(!read)
				return std::nullopt;
			if(!g_mm)
			{
				const auto kit = elektronData::mdWorkingKitFromMemory(region);
				return kit ? std::optional<int>(kit->params[static_cast<size_t>(_at.t)][static_cast<size_t>(_at.i)]) : std::nullopt;
			}
			if(region.size() < 5 + elektronData::MmKit::g_rawSize)
				return std::nullopt;
			const std::vector<uint8_t> raw(region.begin() + 5, region.begin() + 5 + elektronData::MmKit::g_rawSize);
			const auto kit = elektronData::mmKitFromRaw(raw, static_cast<uint8_t>(region[0] & 127));
			return kit ? std::optional<int>(kit->tracks[static_cast<size_t>(_at.t)].pages[static_cast<size_t>(_at.pg)][static_cast<size_t>(_at.i)]) : std::nullopt;
		}

		// The value the machine's working kit holds for the global target tested here: the Machinedrum's RHYTHM ECHO MOD (master
		// effect "rhythmEcho", value 1), the Monomachine's MULTI ENV ATK (track 1, value 0)
		std::optional<int> machineGlobal()
		{
			std::vector<uint8_t> region;
			uint32_t sequence = 0;
			const bool read = processor->getPlugin().withDeviceLocked([&](synthLib::Device* _d)
			{
				auto* d = dynamic_cast<md::DeskDevice*>(_d);
				if(!d)
					return false;
				if(g_mm)
				{
					const auto t = d->getMmTelemetry();
					return t && t->readWorkingKit(region, sequence);
				}
				const auto t = d->getSequencerTelemetry();
				return t && t->readWorkingKit(region, sequence);
			});
			if(!read)
				return std::nullopt;
			if(!g_mm)
			{
				const auto kit = elektronData::mdWorkingKitFromMemory(region);
				if(!kit)
					return std::nullopt;
				for(size_t f = 0; f < elektronData::g_mdMasterFx.size(); ++f)
					if(std::string(elektronData::g_mdMasterFx[f]) == "rhythmEcho")
						return static_cast<int>(kit->masterFx[f][1]);
				return std::nullopt;
			}
			if(region.size() < 5 + elektronData::MmKit::g_rawSize)
				return std::nullopt;
			const std::vector<uint8_t> raw(region.begin() + 5, region.begin() + 5 + elektronData::MmKit::g_rawSize);
			const auto kit = elektronData::mmKitFromRaw(raw, static_cast<uint8_t>(region[0] & 127));
			return kit ? std::optional<int>(kit->tracks[0].multiEnv[0]) : std::nullopt;
		}

		pluginLib::Parameter* parameter(const Target& _at)
		{
			const std::string name = g_mm ? mdJucePlugin::MmStudioLink::parameterName(static_cast<uint8_t>(_at.pg), static_cast<uint8_t>(_at.i))
				: mdJucePlugin::StudioLink::parameterName(static_cast<uint8_t>(_at.i));
			return processor->getController().getParameter(name, static_cast<uint8_t>(_at.t));
		}

		bool until(const std::function<bool()>& _done, const int _ms)
		{
			const auto end = juce::Time::getMillisecondCounterHiRes() + _ms;
			while(juce::Time::getMillisecondCounterHiRes() < end)
			{
				if(_done())
					return true;
				pump(40);
				session()->step();
			}
			return _done();
		}

		mdJucePlugin::DeskSession* session() { return processor->getDeskHost()->session(); }

		void attach()
		{
			session()->attach([this](const Value& _m) { page.push_back(_m); });
			m_attached = true;
			say(R"({"op":"ready"})");
		}

		void say(const std::string& _json)
		{
			session()->onPageMessage(*elektronData::json::parse(_json));
		}

		const Value* learnDoc() const
		{
			for(auto it = page.rbegin(); it != page.rend(); ++it)
				if(const auto* t = it->find("type"); t && t->isString() && t->asString() == "learn")
					return it->find("doc");
			return nullptr;
		}

		size_t mappings() const
		{
			const auto* d = learnDoc();
			return d && d->find("mappings") ? d->find("mappings")->asArray().size() : 0;
		}

		std::unique_ptr<Processor> processor;
		std::vector<Value> page;

	private:
		std::thread m_audio;
		std::atomic<bool> m_run{true};
		std::mutex m_mutex;
		std::vector<juce::MidiMessage> m_cc;
		bool m_attached = false;
	};
}

int main(const int _argc, char** _argv)
{
	g_mm = _argc > 1 && std::string(_argv[1]) == "mm";
	const auto* rom = std::getenv(g_mm ? "GEARMULATOR_MM_FIRMWARE_BIN" : "GEARMULATOR_MD_FIRMWARE_BIN");
	if(!rom || !*rom)
	{
		std::printf("mdLearnFirmwareTest %s: SKIP (%s not set)\n", g_mm ? "mm" : "md", g_mm ? "GEARMULATOR_MM_FIRMWARE_BIN" : "GEARMULATOR_MD_FIRMWARE_BIN");
		return 77;
	}
	juce::ScopedJuceInitialiser_GUI juce;
	synthLib::RomLoader::addSearchPath(juce::File(rom).getParentDirectory().getFullPathName().toStdString());
	const auto home = juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile(std::string("mdLearnFirmwareTest-") + (g_mm ? "mm" : "md"));
	home.createDirectory();
	std::printf("mdLearnFirmwareTest %s\n", g_mm ? "mm" : "md");

	auto rigOwner = std::make_unique<Rig>(home.getFullPathName().toStdString());
	Rig& rig = *rigOwner;
	if(!rig.waitStarted())
	{
		std::puts("  FAIL: the firmware did not start");
		return 1;
	}
	std::puts("  firmware takes MIDI");
	check(rig.session() != nullptr, "the plug-in has its session");
	rig.attach();
	check(rig.learnDoc() && rig.learnDoc()->find("enabled")->asBool(), "MIDI mapping is on");

	// The firmware's own CC map (base channel 0): the Machinedrum's CC 21 is track 1's synthesis value 6 (CC 16 + 5), CC 31
	// the effects value 8 (CC 16 + 15); the Monomachine's CC 60 is track 1's page 2 value 5 (CC 56 + 4), CC 61 value 6.
	const int ccA = g_mm ? 60 : 21, ccB = g_mm ? 61 : 31;
	const Target fwA = g_mm ? Target{0, 1, 4} : Target{0, -1, 5};
	const Target fwB = g_mm ? Target{0, 1, 5} : Target{0, -1, 15};
	const Target mapA = g_mm ? Target{1, 0, 3} : Target{1, -1, 3};		// what the first mapping drives
	const Target mapB = g_mm ? Target{2, 0, 4} : Target{2, -1, 4};		// what is learned

	const auto machineIs = [&](const Target& _at, const int _v) { const auto v = rig.machine(_at); return v && *v == _v; };

	// The first CC after the start can be lost (the machine is still settling): the working kit is waited for, and a CC is sent
	// again until it lands (the checks are about where it goes, not about the delivery of the first try)
	check(rig.until([&] { return rig.machine(fwA).has_value(); }, 30000), "the machine's working kit is readable");
	const auto land = [&](const std::function<void()>& _send, const std::function<bool()>& _landed)
	{
		for(int attempt = 0; attempt < 6; ++attempt)
		{
			_send();
			if(rig.until(_landed, 2500))
				return true;
		}
		return false;
	};

	// 1. no mapping: the host's CC reaches the firmware's own target
	check(land([&] { rig.cc(0, ccA, 90); }, [&] { return machineIs(fwA, 90); }), "no mapping: the host's CC reaches the firmware's own target");

	// 2. a mapping on that (channel, CC): the learned parameter follows, the firmware's target stays
	const auto mapABefore = rig.machine(mapA);
	const int vA = mapABefore && *mapABefore == 41 ? 43 : 41;
	rig.say(R"({"op":"learnAdd","id":1,"cc":)" + std::to_string(ccA) + R"(,"ch":0,)" + json(mapA) + "}");
	check(rig.mappings() == 1, "learnAdd: the mapping is in the document");
	const auto* doc = rig.learnDoc();
	check(doc && doc->find("mappings")->asArray()[0].find("overrides")->asArray().size() == 1, "and it says which firmware target it overrides (one: channel 1)");
	rig.session()->step();
	auto* pa = rig.parameter(mapA);
	check(land([&] { rig.cc(0, ccA, vA); }, [&] { return pa && pa->getUnnormalizedValue() == vA; }), "the mapped CC moves the plug-in's parameter");
	const int expectA = pa ? pa->getUnnormalizedValue() : -1;
	check(rig.until([&] { return machineIs(mapA, expectA); }, 8000), "and the machine's working kit follows it");
	pump(1000);
	check(machineIs(fwA, 90), "the firmware's own target of that CC did not move (the CC never reached the machine)");

	// 3. learning: two values from one controller, consumed; the step learns the mapping
	const auto fwBBefore = rig.machine(fwB);
	rig.say(R"({"op":"learnStart","id":2,)" + json(mapB) + "}");
	rig.session()->step();
	check(land([&] { rig.cc(0, ccB, 12); rig.cc(0, ccB, 117); }, [&] { return rig.mappings() == 2; }), "learning: two values make the mapping on the message thread");
	pump(1000);
	check(fwBBefore && machineIs(fwB, *fwBBefore), "the learning CCs were consumed: the firmware's target of that CC did not move");
	const auto mapBBefore = rig.machine(mapB);
	const int vB = mapBBefore && *mapBBefore == 77 ? 79 : 77;
	auto* pb = rig.parameter(mapB);
	check(land([&] { rig.cc(0, ccB, vB); }, [&] { return pb && pb->getUnnormalizedValue() == vB; }), "the learned CC moves its parameter");
	const int expectB = pb ? pb->getUnnormalizedValue() : -1;
	check(rig.until([&] { return machineIs(mapB, expectB); }, 8000), "and the machine follows");
	pump(1000);
	check(fwBBefore && machineIs(fwB, *fwBBefore), "the firmware's target of the learned CC stays where it was");

	// 4. the mapping removed: the machine has the CC back
	rig.say(R"({"op":"learnRemove","id":3,"index":0})");
	rig.session()->step();
	check(rig.mappings() == 1, "learnRemove: one mapping left");
	check(land([&] { rig.cc(0, ccA, 20); }, [&] { return machineIs(fwA, 20); }), "the CC without its mapping reaches the firmware's own target again");

	// 5. the project round trip: save with the one mapping left (ccB -> mapB), load into a new processor
	rig.session()->step();
	juce::MemoryBlock project;
	static_cast<juce::AudioProcessor&>(*rig.processor).getStateInformation(project);
	check(project.getSize() > 0, "the project is saved");
	rigOwner.reset();

	Rig again(home.getFullPathName().toStdString(), &project);
	check(again.waitStarted(), "the loaded project starts the firmware");
	again.attach();
	again.session()->step();
	check(again.mappings() == 1, "the loaded project has its mapping in the document");
	const auto* loadedDoc = again.learnDoc();
	const auto* loaded = loadedDoc && loadedDoc->find("mappings") && !loadedDoc->find("mappings")->asArray().empty()
		? &loadedDoc->find("mappings")->asArray()[0] : nullptr;
	check(loaded && loaded->find("cc")->asNumber() == ccB && loaded->find("t")->asNumber() == mapB.t && loaded->find("i")->asNumber() == mapB.i,
		"and it is the learned one: the CC and the target it was saved with");
	check(again.until([&] { return again.machine(fwB).has_value(); }, 30000), "the machine's working kit is readable again");
	const auto fwBLoaded = again.machine(fwB);
	const auto mapBLoaded = again.machine(mapB);
	const int vB2 = mapBLoaded && *mapBLoaded == 101 ? 103 : 101;
	auto* pb2 = again.parameter(mapB);
	const auto land2 = [&](const std::function<void()>& _send, const std::function<bool()>& _landed)
	{
		for(int attempt = 0; attempt < 6; ++attempt)
		{
			_send();
			if(again.until(_landed, 2500))
				return true;
		}
		return false;
	};
	check(land2([&] { again.cc(0, ccB, vB2); }, [&] { return pb2 && pb2->getUnnormalizedValue() == vB2; }), "the loaded mapping moves its parameter");
	const int expectB2 = pb2 ? pb2->getUnnormalizedValue() : -1;
	check(again.until([&] { const auto v = again.machine(mapB); return v && *v == expectB2; }, 8000), "and the machine follows");
	pump(1000);
	const auto fwBNow = again.machine(fwB);
	check(fwBLoaded && fwBNow && *fwBLoaded == *fwBNow, "the firmware's own target of that CC did not move (the mapping owns it again)");

	// 6. B-169: a global target. CC 70 is on no firmware map (the MD's run 16-39, 40-63, 72-95, 96-119; the MM's 48-63, 72-95, 104-119)
	{
		const int ccG = 70, global = g_mm ? 2 : 1;
		again.say(R"({"op":"learnAdd","id":20,"cc":)" + std::to_string(ccG) + R"(,"ch":0,"g":)" + std::to_string(global) + "}");
		again.session()->step();
		const auto* gd = again.learnDoc();
		bool inDoc = false;
		if(gd && gd->find("mappings"))
			for(const auto& m : gd->find("mappings")->asArray())
				if(const auto* g = m.find("g"); g && g->isNumber() && static_cast<int>(g->asNumber()) == global && m.find("t") == nullptr)
					inDoc = true;
		check(inDoc, "learnAdd {g}: the global mapping is in the document, with no track");
		check(again.until([&] { return again.machineGlobal().has_value(); }, 30000), "the machine's working kit shows the global value");
		const auto before = again.machineGlobal();
		const int vG = before && *before == 99 ? 20 : 99;
		// the desk applies a learned CC as a kit edit that reaches the machine through its write queue: a loaded CI runner needs far
		// longer than 2.5 s (a resend of the same value finds the desk already there and changes nothing), so wait on one CC
		bool landedG = false;
		for(int attempt = 0; attempt < 3 && !landedG; ++attempt)
		{
			again.cc(0, ccG, vG);
			landedG = again.until([&] { const auto v = again.machineGlobal(); return v && *v == vG; }, 30000);
		}
		check(landedG,
			g_mm ? "a learned CC moves the multi envelope's ATK in the machine, through the page's own multiEnv command"
				: "a learned CC moves the rhythm echo's MOD in the machine, through the page's own masterFx command");
	}

	std::printf("mdLearnFirmwareTest %s: %s\n", g_mm ? "mm" : "md", g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
