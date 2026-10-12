// I-024 (wave 11 of 0.6): the machine memory that stays for every new session, on the real firmware
// (doc/modern-ux/DESIGN-machine-memory.md). Session 1 saves a kit (its name set, then SAVE KIT, as the panel does) and the
// memory file is written; a new session with no project state starts with that kit; a DAW project state wins over the
// file, the standalone's own state does not; Start from factory memory deletes the file and the kit is the factory's again; a damaged file starts from
// factory memory, is moved aside and says so. It also measures the watch's look and a write.
//   GEARMULATOR_MD_FIRMWARE_BIN=<ROM> mdMachineMemoryFirmwareTest md
//   GEARMULATOR_MM_FIRMWARE_BIN=<ROM> mdMachineMemoryFirmwareTest mm
// Exits 77 without the ROM. The configs are isolated (EphemeralConfig) and the memory folder is a temporary one.

#include "mdPluginProcessor.h"
#include "mdController.h"
#include "mdMachineMemory.h"

#include "mdLib/mddeskdevice.h"

#include "elektronData/mdCommands.h"
#include "elektronData/mdKit.h"
#include "elektronData/mmCommands.h"
#include "elektronData/mmKit.h"

#include "juce_audio_utils/juce_audio_utils.h"
#include "synthLib/romLoader.h"

#include <atomic>
#if JUCE_MAC
#include <CoreFoundation/CoreFoundation.h>
#endif
#include <cstdio>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace
{
	using Processor = mdJucePlugin::AudioPluginAudioProcessor;
	using Bytes = std::vector<uint8_t>;

	md::MachineModel g_model = md::MachineModel::Machinedrum;
	juce::File g_home;		// the factory caches, shared by the sessions (as a person's data folder)
	juce::File g_memory;	// the memory folder
	int g_failures = 0;

	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s: %s\n", _ok ? "ok" : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}

	// The message thread's queued work (JUCE on macOS posts to the CFRunLoop): the processor's timer, the events.
	void pump(const int _ms)
	{
		const auto end = juce::Time::getMillisecondCounterHiRes() + _ms;
		while(juce::Time::getMillisecondCounterHiRes() < end)
		{
#if JUCE_MAC
			CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.008, false);
#else
			juce::MessageManager::getInstance()->runDispatchLoopUntil(8);
#endif
		}
	}

	bool until(const std::function<bool()>& _done, const int _ms)
	{
		const auto end = juce::Time::getMillisecondCounterHiRes() + _ms;
		while(juce::Time::getMillisecondCounterHiRes() < end)
		{
			if(_done())
				return true;
			pump(20);
		}
		return _done();
	}

	// One session: a plug-in instance with its audio running about real time, and the machine's SysEx answers.
	class Session
	{
	public:
		explicit Session(const std::optional<Bytes>& _projectState = std::nullopt, const bool _standalone = false)
		{
			Processor::EphemeralConfig config;
			config.standaloneState = _standalone;
			config.deviceHomePath = g_home.getFullPathName().toStdString() + "/";
			config.machineMemoryFolder = g_memory.getFullPathName().toStdString() + "/";
			processor = std::make_unique<Processor>(g_model, config);
			processor->setMachineMemoryLookMs(100);
			juce::AudioProcessor& ap = *processor;
			if(_projectState)
				ap.setStateInformation(_projectState->data(), static_cast<int>(_projectState->size()));
			auto& controller = dynamic_cast<mdJucePlugin::Controller&>(processor->getController());
			m_listener = std::make_unique<baseLib::EventListener<pluginLib::SysEx>>(controller.evDeviceSysex, [this](const pluginLib::SysEx& _m)
			{
				const std::lock_guard lock(m_mutex);
				m_in.emplace_back(_m.begin(), _m.end());
			});
			ap.prepareToPlay(44100.0, 128);
			m_audio = std::thread([this, &ap]
			{
				juce::AudioBuffer<float> buf(ap.getTotalNumOutputChannels(), 128);
				juce::MidiBuffer midi;
				while(m_run)
				{
					midi.clear();
					if(const int t = m_transport.exchange(0))
						midi.addEvent(t > 0 ? juce::MidiMessage::midiStart() : juce::MidiMessage::midiStop(), 0);
					buf.clear();
					ap.processBlock(buf, midi);
					std::this_thread::sleep_for(std::chrono::microseconds(1500));	// about real time
				}
			});
		}

		~Session()
		{
			m_run = false;
			m_audio.join();
			static_cast<juce::AudioProcessor&>(*processor).releaseResources();
			m_listener.reset();
			processor.reset();
		}

		bool firmwareReady()
		{
			return processor->getPlugin().withDeviceLocked([](synthLib::Device* _d)
			{
				auto* d = dynamic_cast<md::DeskDevice*>(_d);
				return d && d->isValid() && !d->isProjectStateRestorePending() && d->getHardware().isFirmwareMidiReady();
			});
		}

		// The firmware takes MIDI and the watch has its base (a few looks after it holds still)
		bool waitWatching(const int _ms = 120000)
		{
			const bool ready = until([this] { return firmwareReady(); }, _ms);
			const auto looks = processor->machineMemoryCost().looks;
			return ready && until([&] { return processor->machineMemoryCost().looks >= looks + 8; }, 20000);
		}

		void send(const Bytes& _sysex)
		{
			synthLib::SMidiEvent e(synthLib::MidiEventSource::Editor);
			e.sysex = _sysex;
			processor->addMidiEvent(e);
		}

		// The name of stored kit _slot, as the machine dumps it ("" when it did not answer)
		std::string kitName(const uint8_t _slot)
		{
			{
				const std::lock_guard lock(m_mutex);
				m_in.clear();
			}
			std::string name;
			for(int attempt = 0; attempt < 3 && name.empty(); ++attempt)
			{
				send(g_model == md::MachineModel::Machinedrum ? elektronData::mdKitRequest(_slot) : elektronData::mmKitRequest(_slot));
				until([&]
				{
					const std::lock_guard lock(m_mutex);
					for(const auto& m : m_in)
					{
						if(g_model == md::MachineModel::Machinedrum)
						{
							if(const auto k = elektronData::decodeMdKit(m); k && k->position == _slot)
								name = std::string(reinterpret_cast<const char*>(k->name.data()), strnlen(reinterpret_cast<const char*>(k->name.data()), k->name.size()));
						}
						else if(const auto k = elektronData::decodeMmKit(m); k && k->position == _slot)
							name = std::string(reinterpret_cast<const char*>(k->name.data()), strnlen(reinterpret_cast<const char*>(k->name.data()), k->name.size()));
					}
					return !name.empty();
				}, 4000);
			}
			return name;
		}

		// Name the kit that plays, then SAVE KIT into _slot (what the panel's SAVE KIT does)
		void saveKit(const uint8_t _slot, const std::string& _name)
		{
			if(g_model == md::MachineModel::Machinedrum)
			{
				send(elektronData::mdSetKitName(_name));
				pump(300);
				send(elektronData::mdSaveKit(_slot));
			}
			else
			{
				send(elektronData::mmSetKitName(_name));
				pump(300);
				send(elektronData::mmSaveKit(_slot));
			}
			pump(500);
		}

		// MIDI Start or Stop from the host, as a DAW's transport
		void transport(const bool _play) { m_transport = _play ? 1 : -1; }

		bool playing()
		{
			return processor->getPlugin().withDeviceLocked([](synthLib::Device* _d)
			{
				auto* d = dynamic_cast<md::DeskDevice*>(_d);
				if(!d)
					return false;
				return d->getModel() == md::MachineModel::Machinedrum ? d->getSequencerTelemetry()->playing.load() == 1
					: d->getMmTelemetry()->running.load() == 1;
			});
		}

		Bytes projectState()
		{
			juce::MemoryBlock block;
			static_cast<juce::AudioProcessor&>(*processor).getStateInformation(block);
			const auto* b = static_cast<const uint8_t*>(block.getData());
			return Bytes(b, b + block.getSize());
		}

		std::unique_ptr<Processor> processor;

	private:
		std::atomic<bool> m_run{true};
		std::atomic<int> m_transport{0};
		std::thread m_audio;
		std::mutex m_mutex;
		std::vector<Bytes> m_in;
		std::unique_ptr<baseLib::EventListener<pluginLib::SysEx>> m_listener;
	};

	juce::File memoryFile() { return g_memory.getChildFile(mdJucePlugin::machineMemory::g_fileName); }

	Bytes readFile(const juce::File& _f)
	{
		juce::MemoryBlock mb;
		if(!_f.loadFileAsData(mb))
			return {};
		const auto* b = static_cast<const uint8_t*>(mb.getData());
		return Bytes(b, b + mb.getSize());
	}
}

int main(const int _argc, char** _argv)
{
	g_model = _argc > 1 && std::string(_argv[1]) == "mm" ? md::MachineModel::Monomachine : md::MachineModel::Machinedrum;
	const bool md = g_model == md::MachineModel::Machinedrum;
	const char* tag = md ? "md" : "mm";
	const auto* rom = std::getenv(md ? "GEARMULATOR_MD_FIRMWARE_BIN" : "GEARMULATOR_MM_FIRMWARE_BIN");
	if(!rom || !*rom)
	{
		std::printf("mdMachineMemoryFirmwareTest %s: SKIP (%s not set)\n", tag, md ? "GEARMULATOR_MD_FIRMWARE_BIN" : "GEARMULATOR_MM_FIRMWARE_BIN");
		return 77;
	}
	juce::ScopedJuceInitialiser_GUI juce;
	synthLib::RomLoader::addSearchPath(juce::File(rom).getParentDirectory().getFullPathName().toStdString());
	const auto temp = juce::File::getSpecialLocation(juce::File::tempDirectory);
	g_home = temp.getChildFile(std::string("mdMachineMemoryFirmwareTest-home-") + tag);
	g_home.createDirectory();
	g_memory = temp.getChildFile(std::string("mdMachineMemoryFirmwareTest-memory-") + tag + "-" + juce::Uuid().toString().toStdString());
	g_memory.deleteRecursively();
	g_memory.createDirectory();
	const uint8_t slot = 5;
	const std::string name = md ? "MEMTEST" : "MEMTEST";
	std::printf("mdMachineMemoryFirmwareTest %s (memory in %s)\n", tag, g_memory.getFullPathName().toRawUTF8());

	Bytes factoryProject, savedFile;
	std::string factoryName;
	{
		std::puts(" session 1: no file, a kit saved");
		Session s;
		check(s.waitWatching(), "the machine starts and the watch has its base");
		factoryName = s.kitName(slot);
		check(!factoryName.empty() && factoryName != name, "kit " + std::to_string(slot + 1) + " is the factory's: '" + factoryName + "'");
		pump(1500);
		check(s.processor->machineMemoryCost().writes == 0 && !memoryFile().existsAsFile(), "a start writes nothing (" + std::to_string(s.processor->machineMemoryCost().looks) + " looks)");
		factoryProject = s.projectState();
		s.saveKit(slot, name);
		check(s.kitName(slot) == name, "SAVE KIT stored '" + name + "'");
		check(until([] { return memoryFile().existsAsFile(); }, 15000), "the save wrote the memory file");
		pump(2500);
		const auto c = s.processor->machineMemoryCost();
		std::printf("  cost: %u looks, look under the lock %.3f ms (worst %.3f), look with hash %.3f ms; %u writes, last %.2f ms, %zu bytes\n",
			c.looks, c.lookLockLastMs, c.lookLockMaxMs, c.lookMs, c.writes, c.writeMs, c.fileBytes);
		savedFile = readFile(memoryFile());
		check(mdJucePlugin::machineMemory::decode(savedFile, g_model).problem == mdJucePlugin::machineMemory::Problem::None, "the file reads back");
		const auto status = s.processor->machineMemoryStatus();
		check(status.keep && status.available && status.saved && status.note.empty(), "the status says keep, saved, no note");
	}
	{
		std::puts(" session 2: no project state, starts from the file");
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slot) == name, "kit " + std::to_string(slot + 1) + " is the saved '" + name + "'");
		pump(1500);
		check(s.processor->machineMemoryCost().writes == 0, "starting from the file writes nothing");
		// the sequencer playing is no save: the memory holds still (the Monomachine's stack aside, mdMachineMemory.h)
		s.transport(true);
		const bool played = until([&] { return s.playing(); }, 5000);
		pump(12000);
		std::printf("  played %d: %u writes in 12 s\n", played, s.processor->machineMemoryCost().writes);
		check(!played || s.processor->machineMemoryCost().writes == 0, "12 s of play write nothing");
		s.transport(false);
	}
	{
		std::puts(" session 3: a project state wins over the file");
		Session s(factoryProject);
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slot) == factoryName, "kit " + std::to_string(slot + 1) + " is the project's '" + factoryName + "'");
		pump(1500);
		check(readFile(memoryFile()) == savedFile, "opening the project leaves the file as it was");
	}
	{
		std::puts(" session 3b: the standalone's own state (saved when it quit) does not win over the file");
		Session s(factoryProject, true);
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slot) == name, "kit " + std::to_string(slot + 1) + " is the saved '" + name + "'");
	}
	{
		std::puts(" session 4: start from factory memory");
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slot) == name, "kit " + std::to_string(slot + 1) + " is the saved one first");
		std::string note;
		check(s.processor->startFromFactoryMemory(note), "factory memory: " + note);
		check(!memoryFile().existsAsFile(), "the file is gone");
		check(s.waitWatching(), "the machine starts again");
		check(s.kitName(slot) == factoryName, "kit " + std::to_string(slot + 1) + " is the factory's again");
		pump(2000);
		check(!memoryFile().existsAsFile(), "and nothing wrote a file since");
	}
	{
		std::puts(" session 5: a damaged file");
		auto broken = savedFile;
		broken[broken.size() / 2] ^= 0x5a;
		memoryFile().replaceWithData(broken.data(), broken.size());
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slot) == factoryName, "kit " + std::to_string(slot + 1) + " is the factory's");
		const auto status = s.processor->machineMemoryStatus();
		check(status.note.find("damaged") != std::string::npos, "the note says why: " + status.note);
		check(!memoryFile().existsAsFile() && g_memory.getChildFile(mdJucePlugin::machineMemory::g_unusableName).existsAsFile(),
			"the damaged file was moved aside");
	}
	if(md)
	{
		std::puts(" session 6: the payload the machine refuses (another ROM's fingerprint)");
		auto payload = mdJucePlugin::machineMemory::decode(savedFile, g_model).payload;
		// the MD state's ROM fingerprint (md::encodeState, version 3/4: 8 bytes at 20 of the state, after the 2-byte envelope)
		payload[2 + 20] ^= 0xff;
		const auto file = mdJucePlugin::machineMemory::encode(g_model, payload);
		memoryFile().replaceWithData(file.data(), file.size());
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(until([&] { return !s.processor->machineMemoryStatus().note.empty(); }, 20000), "the note says why: " + s.processor->machineMemoryStatus().note);
		check(s.kitName(slot) == factoryName, "kit " + std::to_string(slot + 1) + " is the factory's");
		check(!memoryFile().existsAsFile(), "the refused file was moved aside");
	}
	g_memory.deleteRecursively();
	std::printf("mdMachineMemoryFirmwareTest %s: %s\n", tag, g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
