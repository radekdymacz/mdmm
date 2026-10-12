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
#ifndef _WIN32
#include <sys/stat.h>
#endif
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
					// a DAW's automation: CCs 16-63 on channels 1-6, a value that moves every block
					if(m_automate)
					{
						++m_autoStep;
						for(int k = 0; k < 4; ++k)
						{
							const int n = static_cast<int>((m_autoStep * 4 + static_cast<uint32_t>(k)) % (6 * 48));
							midi.addEvent(juce::MidiMessage::controllerEvent(1 + n / 48, 16 + n % 48, static_cast<int>((m_autoStep * 7 + static_cast<uint32_t>(k) * 13) % 128)), k);
						}
					}
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
			return ready && until([&] { return processor->machineMemoryCost().looks >= looks + 8; }, 90000);
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

		// Name the kit that plays (an unsaved edit: no save)
		void nameWorkingKit(const std::string& _name)
		{
			send(g_model == md::MachineModel::Machinedrum ? elektronData::mdSetKitName(_name) : elektronData::mmSetKitName(_name));
			pump(500);
		}

		// The working kit's name as the patch RAM holds it (MD 0x0a, MM 0x28: the probe's "kit name")
		std::string workingName()
		{
			const auto p = patch();
			const size_t at = g_model == md::MachineModel::Machinedrum ? 0x0a : 0x28;
			const size_t n = g_model == md::MachineModel::Machinedrum ? 16 : 11;
			std::string out;
			for(size_t i = 0; i < n && p[at + i]; ++i)
				out += static_cast<char>(p[at + i]);
			return out;
		}

		// Name the kit that plays, then SAVE KIT into _slot (what the panel's SAVE KIT does)
		// (again when the machine was busy and the slot does not hold it: the Monomachine drops a SysEx now and then
		// under load)
		void saveKit(const uint8_t _slot, const std::string& _name)
		{
			for(int attempt = 0; attempt < 3; ++attempt)
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
				if(kitName(_slot) == _name)
					return;
			}
		}

		Bytes patch()
		{
			return processor->getPlugin().withDeviceLocked([](synthLib::Device* _d) { auto* d = dynamic_cast<md::DeskDevice*>(_d); return d->getHardware().copyPatchRam(); });
		}
		static std::string diff(const Bytes& _a, const Bytes& _b)
		{
			std::string out;
			size_t i = 0;
			int ranges = 0;
			while(i < _a.size() && ranges < 40)
			{
				if(_a[i] == _b[i]) { ++i; continue; }
				size_t j = i;
				size_t last = i;
				while(j < _a.size() && j < last + 256) { if(_a[j] != _b[j]) last = j; ++j; }
				j = last + 1;
				char b[48]; std::snprintf(b, sizeof b, " %06zx-%06zx", i, j); out += b; ++ranges;
				i = j;
			}
			return out.empty() ? " none" : out;
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
	public:
		std::atomic<bool> m_automate{false};
	private:
		uint32_t m_autoStep = 0;
		std::thread m_audio;
		std::mutex m_mutex;
		std::vector<Bytes> m_in;
		std::unique_ptr<baseLib::EventListener<pluginLib::SysEx>> m_listener;
	};

	// a folder no file can be made in (the write's temporary file fails), and back
	void setWritable(const juce::File& _folder, const bool _on)
	{
#ifdef _WIN32
		_folder.setReadOnly(!_on, false);
#else
		::chmod(_folder.getFullPathName().toRawUTF8(), _on ? 0755 : 0555);
#endif
	}

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
		if(std::getenv("MDMM_MEMORY_PROBE"))
		{
			auto p0 = s.patch(); pump(3000); auto p1 = s.patch(); std::printf("  probe idle 3 s:%s\n", Session::diff(p0, p1).c_str());
			s.transport(true); s.m_automate = true; pump(12000); s.m_automate = false; s.transport(false); pump(1500);
			auto p2 = s.patch(); std::printf("  probe play + automation 12 s:%s\n", Session::diff(p1, p2).c_str());
			if(md) s.send(elektronData::mdSetKitName("PROBE")); else s.send(elektronData::mmSetKitName("PROBE"));
			pump(1500); auto p3 = s.patch(); std::printf("  probe kit name:%s\n", Session::diff(p2, p3).c_str());
			if(md) s.send(elektronData::mdSaveKit(9)); else s.send(elektronData::mmSaveKit(9));
			pump(1500); auto p4 = s.patch(); std::printf("  probe SAVE KIT 10:%s\n", Session::diff(p3, p4).c_str());
			if(md) s.send(elektronData::mdLoadPattern(3)); else s.send(elektronData::mmLoadPattern(3));
			pump(1500); auto p5 = s.patch(); std::printf("  probe load pattern 4:%s\n", Session::diff(p4, p5).c_str());
			if(md) s.send(elektronData::mdLoadKit(2)); else s.send(elektronData::mmLoadKit(2));
			pump(1500); auto p6 = s.patch(); std::printf("  probe load kit 3:%s\n", Session::diff(p5, p6).c_str());
			// a kit dump into slot 20: the stored slot only
			if(md) { s.send(elektronData::mdKitRequest(0)); pump(1500); }
			s.saveKit(19, "DUMPED");
			pump(1500); auto p7 = s.patch(); std::printf("  probe name + SAVE KIT 20:%s\n", Session::diff(p6, p7).c_str());
			if(md) s.send(elektronData::mdLoadPattern(0)); else s.send(elektronData::mmLoadPattern(0));
			pump(1500); auto p8 = s.patch(); std::printf("  probe load pattern 1:%s\n", Session::diff(p7, p8).c_str());
			s.saveKit(0, "SLOTONE");
			pump(1500); auto p9 = s.patch(); std::printf("  probe name + SAVE KIT 1:%s\n", Session::diff(p8, p9).c_str());
			s.saveKit(1, "SLOTTWO");
			pump(1500); auto p10 = s.patch(); std::printf("  probe name + SAVE KIT 2:%s\n", Session::diff(p9, p10).c_str());
			return 0;
		}
		factoryName = s.kitName(slot);
		check(!factoryName.empty() && factoryName != name, "kit " + std::to_string(slot + 1) + " is the factory's: '" + factoryName + "'");
		pump(1500);
		check(s.processor->machineMemoryCost().writes == 0 && !memoryFile().existsAsFile(), "a start writes nothing (" + std::to_string(s.processor->machineMemoryCost().looks) + " looks)");
		factoryProject = s.projectState();
		// a DAW project playing with automation (CCs on every track's parameters) for 12 s, then a kit name edited: no save
		s.transport(true);
		s.m_automate = true;
		pump(12500);
		s.m_automate = false;
		s.transport(false);
		pump(1500);
		check(s.processor->machineMemoryCost().writes == 0 && !memoryFile().existsAsFile(), "12 s of play with automation write nothing");
		s.nameWorkingKit("UNSAVED");
		pump(1500);
		check(s.processor->machineMemoryCost().writes == 0 && !memoryFile().existsAsFile(), "an unsaved edit of the kit that plays writes nothing");
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
		std::puts(" session 3c: a DAW project's state that comes after the file was applied still wins");
		Session s;
		check(s.waitWatching(), "the machine starts from the file");
		check(s.kitName(slot) == name, "kit " + std::to_string(slot + 1) + " is the saved one");
		static_cast<juce::AudioProcessor&>(*s.processor).setStateInformation(factoryProject.data(), static_cast<int>(factoryProject.size()));
		pump(500);
		check(s.waitWatching(), "the machine starts again with the project");
		check(s.kitName(slot) == factoryName, "kit " + std::to_string(slot + 1) + " is the project's");
		pump(1500);
		check(readFile(memoryFile()) == savedFile, "and the file is as it was");
	}
	const uint8_t slotClose = 6, slotKeep = 7, slotFail = 8;
	{
		std::puts(" session 3d: a save, then the instance closes at once (before the watch's next look)");
		Session s;
		check(s.waitWatching(), "the machine starts");
		s.processor->setMachineMemoryLookMs(600000);
		pump(300);
		s.saveKit(slotClose, "CLOSED");
		check(s.processor->machineMemoryCost().writes == 0, "no look since the save");
	}
	{
		std::puts(" session 3e: the save made just before closing is there; KEEP MEMORY off, a save, on again");
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slotClose) == "CLOSED", "kit " + std::to_string(slotClose + 1) + " is the one saved before the close");
		s.processor->setKeepMachineMemory(false);
		s.saveKit(slotKeep, "OFFON");
		pump(2000);
		check(s.processor->machineMemoryCost().writes == 0, "KEEP MEMORY off: the save is not written");
		s.processor->setKeepMachineMemory(true);
		check(until([&] { return s.processor->machineMemoryCost().writes >= 1; }, 5000), "on again: the memory is written at once");
		if(md)
		{
			// the page's sample transfer ended (the desk's sampleLoad "done"): written once the flash is still (here no
			// store follows, so at the latest after 30 s)
			const auto writes = s.processor->machineMemoryCost().writes;
			s.processor->machineMemorySampleStored();
			pump(3000);
			check(s.processor->machineMemoryCost().writes == writes, "a sample sent: no write while its store may still run");
			check(until([&] { return s.processor->machineMemoryCost().writes > writes; }, 40000), "a sample sent is written");
		}
	}
	Bytes standaloneState;
	{
		std::puts(" session 3f: the standalone, an unsaved edit of the kit that plays");
		Session s(std::nullopt, true);
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slotKeep) == "OFFON", "kit " + std::to_string(slotKeep + 1) + " (saved while KEEP MEMORY was off) is in the file");
		s.nameWorkingKit("WORKING");
		pump(1500);
		check(s.workingName() == "WORKING" && s.processor->machineMemoryCost().writes == 0, "the edit is no save");
		standaloneState = s.projectState();
		check(s.processor->machineMemoryMark().stamp != 0 && !s.processor->machineMemoryMark().unsaved, "its state knows the file");
	}
	{
		std::puts(" session 3g: the standalone starts again: its own state holds every save of the file, so it stays");
		Session s(standaloneState, true);
		check(s.waitWatching(), "the machine starts");
		check(s.workingName() == "WORKING", "the unsaved edit is still there ('" + s.workingName() + "')");
		check(s.kitName(slotKeep) == "OFFON", "and the saves");
	}
	{
		std::puts(" session 3h: a write that fails (a read-only folder): the stale file does not win at the next start");
		const auto before = readFile(memoryFile());
		{
			Session s(std::nullopt, true);
			check(s.waitWatching(), "the machine starts");
			setWritable(g_memory, false);
			s.saveKit(slotFail, "ROFAIL");
			check(s.kitName(slotFail) == "ROFAIL", "SAVE KIT stored it ('" + s.kitName(slotFail) + "')");
			check(until([&] { return s.processor->machineMemoryCost().failedWrites >= 1; }, 10000), "the write failed");
			standaloneState = s.projectState();	// as the standalone saves its state when it quits
			check(s.processor->machineMemoryMark().unsaved, "the state says it holds saves the file lacks");
		}	// the instance goes away with the folder still read-only: its last write fails too
		setWritable(g_memory, true);
		check(readFile(memoryFile()) == before, "the file is the stale one");
	}
	{
		Session s(standaloneState, true);
		check(s.waitWatching(), "the standalone starts again");
		check(s.kitName(slotFail) == "ROFAIL", "its own state won: the save is there ('" + s.kitName(slotFail) + "')");
		check(until([&] { return s.processor->machineMemoryCost().writes >= 1; }, 5000), "and it is written to the file at once");
	}
	{
		Session s;
		check(s.waitWatching(), "a new plug-in instance");
		check(s.kitName(slotFail) == "ROFAIL", "has the save that failed to write at first ('" + s.kitName(slotFail) + "')");
	}
	savedFile = readFile(memoryFile());
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
		const auto file = mdJucePlugin::machineMemory::encode(g_model, 99, payload);
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
