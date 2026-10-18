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
#include "mdMachineMemoryLock.h"
#include "mdDeskHost.h"
#include "mdDeskSession.h"
#include "elektronData/json.h"

#include "mdLib/mddeskdevice.h"

#include "elektronData/mdCommands.h"
#include "elektronData/mdKit.h"
#include "elektronData/mmCommands.h"
#include "elektronData/mmKit.h"
#include "elektronData/mdPattern.h"
#include "elektronData/mdSong.h"
#include "elektronData/mdGlobal.h"
#include "elektronData/mmPattern.h"
#include "elektronData/mmSong.h"
#include "elektronData/mmGlobal.h"
#include "elektronData/mmDump.h"

#include "juce_audio_utils/juce_audio_utils.h"
#include "synthLib/romLoader.h"

#include <algorithm>
#include <atomic>
#if JUCE_MAC
#include <CoreFoundation/CoreFoundation.h>
#endif
#include <cstdio>
#include <cmath>
#include <set>
#include <cstring>
#ifndef _WIN32
#include <sys/stat.h>
#endif
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <chrono>
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
			// JUCE's own step of the message loop (runDispatchLoopUntil needs JUCE_MODAL_LOOPS_PERMITTED)
			if(!juce::detail::dispatchNextMessageOnSystemQueue(true))
				std::this_thread::sleep_for(std::chrono::milliseconds(1));
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
		// The plug-in's holds of the device lock off the audio thread while audio ran, by site. The work done under the
		// lock (the holder's CPU time) must be under 1 ms in every hold; the wall time is reported beside it, as it also
		// counts the holder preempted while holding (a busy Mac; DESIGN-audio-lock.md, what steps 4-5 would remove).
		// The test's own probes (this file) are not the product's.
		void reportLockHolds() const
		{
			const auto snap = processor->getPlugin().getRealtimeInstrumentation().snapshot();
			double worstCpu = 0, worstWall = 0;
			std::string worstSite = "none";
			for(size_t i = 0; i < snap.lockHoldCount; ++i)
			{
				const auto& h = snap.lockHolds[i];
				std::string file = h.file ? h.file : "?";
				const auto slash = file.find_last_of("/\\");
				if(slash != std::string::npos)
					file = file.substr(slash + 1);
				if(file == "mdMachineMemoryFirmwareTest.cpp")
					continue;
				const double wallMs = static_cast<double>(h.maxNanoseconds) / 1e6;
				const double cpuMs = static_cast<double>(h.maxCpuNanoseconds) / 1e6;
				std::printf("    lock hold %s:%u: %llu holds, mean %.4f ms, max %.3f ms (work %.3f ms)\n", file.c_str(), h.line,
					static_cast<unsigned long long>(h.waits), h.waits ? static_cast<double>(h.nanoseconds) / 1e6 / static_cast<double>(h.waits) : 0.0,
					wallMs, cpuMs);
				worstWall = std::max(worstWall, wallMs);
				if(cpuMs > worstCpu)
				{
					worstCpu = cpuMs;
					worstSite = file + ":" + std::to_string(h.line);
				}
			}
			char text[200];
			std::snprintf(text, sizeof(text), "the work under the device lock off the audio thread under 1 ms a hold (worst %.3f ms, %s; wall time %.3f ms at most)",
				worstCpu, worstSite.c_str(), worstWall);
			// 1 ms on a Mac of our own; MDMM_LOCK_HOLD_BUDGET_MS widens it on a shared CI VM (doc/release/CI.md)
			const auto* const budgetText = std::getenv("MDMM_LOCK_HOLD_BUDGET_MS");
			const double budget = budgetText && *budgetText ? std::max(1.0, std::atof(budgetText)) : 1.0;
			check(worstCpu < budget, text);
		}

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
			// every hold of the device lock off the audio thread from here on (DESIGN-audio-lock.md "done when")
			processor->getPlugin().getRealtimeInstrumentation().setEnabled(true);
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
					{
						const std::lock_guard lock(m_ccMutex);
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

		~Session()
		{
			if(m_attached)
				processor->getDeskHost()->session()->detach();
			m_run = false;
			m_audio.join();
			reportLockHolds();
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
			// the start's decision (the file's slots laid over, a restore begun) comes first
			if(!until([this] { return processor->machineMemoryStarted(); }, _ms))
				return false;
			pump(300);
			const bool ready = until([this] { return firmwareReady(); }, _ms);
			const auto looks = processor->machineMemoryCost().looks;
			return ready && until([&] { return processor->machineMemoryCost().looks >= looks + 8; }, 90000);
		}


		void send(const Bytes& _sysex)
		{
			synthLib::SMidiEvent e(synthLib::MidiEventSource::Editor);
			e.sysex = synthLib::SysexBuffer(_sysex.begin(), _sysex.end());
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

		// A dump the machine answers to _request: the first message _match accepts
		Bytes dump(const Bytes& _request, const std::function<bool(const Bytes&)>& _match)
		{
			for(int attempt = 0; attempt < 3; ++attempt)
			{
				{
					const std::lock_guard lock(m_mutex);
					m_in.clear();
				}
				send(_request);
				Bytes got;
				until([&]
				{
					const std::lock_guard lock(m_mutex);
					for(const auto& m : m_in)
						if(_match(m)) { got = m; return true; }
					return false;
				}, 4000);
				if(!got.empty())
					return got;
			}
			return {};
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
		// A CC from the host on channel _ch (1-16), sent with the next block
		void cc(const int _ch, const int _cc, const int _v)
		{
			const std::lock_guard lock(m_ccMutex);
			m_cc.push_back(juce::MidiMessage::controllerEvent(_ch, _cc, _v));
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

		// The sequencer's step (MD, MM), -1 unknown
		int step()
		{
			return processor->getPlugin().withDeviceLocked([](synthLib::Device* _d)
			{
				auto* d = dynamic_cast<md::DeskDevice*>(_d);
				if(!d)
					return -1;
				return d->getModel() == md::MachineModel::Machinedrum ? d->getSequencerTelemetry()->step.load() : d->getMmTelemetry()->step.load();
			});
		}

		// The page: the editor's session driven as the page drives it (its messages), the answers kept
		void page(const std::string& _json)
		{
			auto* session = processor->getDeskHost()->session();
			if(!m_attached)
			{
				m_attached = true;
				session->attach([this](const elektronData::json::Value& _m) { m_pageIn.push_back(elektronData::json::write(_m)); });
				session->onPageMessage(*elektronData::json::parse(R"({"op":"ready"})"));
				pump(500);
			}
			const auto v = elektronData::json::parse(_json);
			if(!v) { std::printf("  page: bad json %s\n", _json.c_str()); return; }
			session->onPageMessage(*v);
			pump(300);
		}

		// The desk has read the machine (its lifecycle says ready)
		bool deskReady(const int _ms = 120000)
		{
			return until([&] { return processor->getDeskHost()->session()->lifecycleName() == "ready"; }, _ms);
		}

		// A page message sent until the desk takes it (it reads a slot first when asked for one it has not read)
		bool pageOk(const std::string& _json, const int _ms = 60000)
		{
			const auto end = juce::Time::getMillisecondCounterHiRes() + _ms;
			while(juce::Time::getMillisecondCounterHiRes() < end)
			{
				m_pageIn.clear();
				page(_json);
				pump(700);
				const auto r = lastPageResult();
				if(r.find("\"ok\":true") != std::string::npos)
					return true;
				pump(1500);
			}
			return false;
		}

		std::string lastPageResult()
		{
			for(auto it = m_pageIn.rbegin(); it != m_pageIn.rend(); ++it)
				if(it->find("\"result\"") != std::string::npos)
					return it->substr(0, 300);
			return {};
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
		bool m_attached = false;
		std::mutex m_ccMutex;
		std::vector<juce::MidiMessage> m_cc;
		std::vector<std::string> m_pageIn;
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

	int unusableFiles() { return g_memory.findChildFiles(juce::File::findFiles, false, "machine-memory.unusable-*.bin").size(); }

	using Key = mdJucePlugin::machineMemory::Key;
	using Kind = mdJucePlugin::machineMemory::Kind;

	mdJucePlugin::machineMemory::Store fileStore();
	bool fileHas(const Key& _k) { const auto st = fileStore(); return st.count(_k) != 0; }
	bool fileHasKind(const Kind _k) { for(const auto& [k, e] : fileStore()) if(k.kind == _k) return true; return false; }
	std::string fileKeys()
	{
		std::string out;
		for(const auto& [k, e] : fileStore())
			out += (out.empty() ? "" : ", ") + mdJucePlugin::machineMemory::describe(k);
		return out.size() > 300 ? out.substr(0, 300) + "..." : out;
	}

	// Every slot of _before is in _after with the same bytes, but a pattern's link byte (its kit, which SAVE KIT sets
	// in the pattern that plays)
	bool keptExceptLinks(const mdJucePlugin::machineMemory::Store& _before, const mdJucePlugin::machineMemory::Store& _after)
	{
		for(const auto& [k, e] : _before)
		{
			if(!_after.count(k))
				return false;
			const auto& a = _after.at(k).bytes;
			const auto* slot = mdJucePlugin::machineMemory::findSlot(g_model, k);
			for(size_t i = 0; i < e.bytes.size(); ++i)
				if(e.bytes[i] != a[i] && !(slot && std::find(slot->links.begin(), slot->links.end(), static_cast<uint32_t>(i)) != slot->links.end()))
					return false;
		}
		return true;
	}

	// A state with its MMEM chunk made version 1: a standalone state from before the slot store (no marks)
	Bytes oldState(Bytes _state)
	{
		for(size_t i = 0; i + 8 <= _state.size(); ++i)
			if(std::memcmp(_state.data() + i, "MMEM", 4) == 0 && _state[i + 4] == 2 && !_state[i + 5] && !_state[i + 6] && !_state[i + 7])
			{
				_state[i + 4] = 1;
				return _state;
			}
		return {};
	}

	// A short sine as a WAV file (a sample the page loads)
	juce::File sineWav()
	{
		const auto f = juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("mdMachineMemoryFirmwareTest-sine.wav");
		f.deleteFile();
		juce::WavAudioFormat wav;
		std::unique_ptr<juce::OutputStream> out(f.createOutputStream().release());
		std::unique_ptr<juce::AudioFormatWriter> w(wav.createWriterFor(out.get(), 44100.0, 1, 16, {}, 0));
		if(!w)
			return {};
		out.release();
		juce::AudioBuffer<float> b(1, 8820);
		for(int i = 0; i < b.getNumSamples(); ++i)
			b.setSample(0, i, 0.5f * std::sin(static_cast<float>(i) * 0.0627f));
		w->writeFromAudioSampleBuffer(b, 0, b.getNumSamples());
		return f;
	}

	Bytes readFile(const juce::File& _f)
	{
		juce::MemoryBlock mb;
		if(!_f.loadFileAsData(mb))
			return {};
		const auto* b = static_cast<const uint8_t*>(mb.getData());
		return Bytes(b, b + mb.getSize());
	}

	mdJucePlugin::machineMemory::Store fileStore()
	{
		return mdJucePlugin::machineMemory::decode(readFile(memoryFile()), g_model).file.slots;
	}
	// The file holds the slot as this session's memory has it
	bool fileSlotIs(Session& _s, const Key& _k)
	{
		const auto st = fileStore();
		const auto it = st.find(_k);
		const auto* slot = mdJucePlugin::machineMemory::findSlot(g_model, _k);
		return it != st.end() && slot && it->second.bytes == mdJucePlugin::machineMemory::slotBytes(*slot, _s.patch());
	}

}

int main(const int _argc, char** _argv)
{
	// the second process of the cross-process lock test: holds the file's lock for a while
	if(_argc > 3 && std::string(_argv[1]) == "holdlock")
	{
		const mdJucePlugin::machineMemory::FileLock lock(juce::File(juce::String::fromUTF8(_argv[2])));
		std::printf("holding %d\n", lock.held() ? 1 : 0);
		std::fflush(stdout);
		if(_argc > 4 && lock.held() && !lock.unlocked())	// the parent waits for this file (reading the pipe would block until the end)
			(void)juce::File(juce::String::fromUTF8(_argv[4])).replaceWithText("holding");
		std::this_thread::sleep_for(std::chrono::milliseconds(std::atoi(_argv[3])));
		return 0;
	}
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
		if(std::getenv("MDMM_MEMORY_OTHER"))
		{
			// Which "other" blocks (watched bytes in no known slot) move without a save: tempo, mutes, track, song mode,
			// the active global, the lock mode, play
			using namespace elektronData;
			auto other = [&](const Bytes& _a, const Bytes& _b)
			{
				std::string out;
				for(const auto& sl : mdJucePlugin::machineMemory::patchSlots(g_model))
				{
					if(sl.key.kind != Kind::Other || !mdJucePlugin::machineMemory::slotDiffers(sl, _a, _b))
						continue;
					for(const auto& r : sl.ranges)
						for(uint32_t i = r.begin; i < r.end; ++i)
							if(_a[i] != _b[i]) { char b[16]; std::snprintf(b, sizeof b, " %06x", i); out += b; }
				}
				return out.empty() ? std::string(" none") : out;
			};
			auto step = [&](const char* _what, const std::function<void()>& _do)
			{
				const auto a = s.patch();
				_do();
				pump(1500);
				const auto b = s.patch();
				std::printf("  other %s:%s (slots:", _what, other(a, b).c_str());
				for(const auto& k : mdJucePlugin::machineMemory::changedSlots(g_model, a, b))
				{
					if(k.kind == Kind::Other)
						continue;
					std::printf(" %s at", mdJucePlugin::machineMemory::describe(k).c_str());
					const auto* sl = mdJucePlugin::machineMemory::findSlot(g_model, k);
					const auto x = mdJucePlugin::machineMemory::slotBytes(*sl, a), y = mdJucePlugin::machineMemory::slotBytes(*sl, b);
					int n = 0;
					for(size_t i = 0; i < x.size() && n < 8; ++i)
						if(x[i] != y[i]) { std::printf(" +%zx", i); ++n; }
				}
				std::printf(")\n");
			};
			step("idle", [] {});
			step("tempo 133", [&] { s.send(md ? mdSetTempo(133 * 24) : mmSetTempo(133.0)); });
			step("tempo 120", [&] { s.send(md ? mdSetTempo(120 * 24) : mmSetTempo(120.0)); });
			step("track 5", [&] { s.send(md ? mdSetStatus(MdStatus::Track, 4) : mmSetStatus(MmStatus::MidiTrack, 2)); });
			step("song mode", [&] { s.send(md ? mdSetStatus(MdStatus::SequencerMode, 1) : mmSetStatus(MmStatus::SongMode, 1)); });
			step("pattern mode", [&] { s.send(md ? mdSetStatus(MdStatus::SequencerMode, 0) : mmSetStatus(MmStatus::SongMode, 0)); });
			step("global 2", [&] { s.send(md ? mdSetActiveGlobal(1) : mmSetActiveGlobal(1)); });
			step("global 1", [&] { s.send(md ? mdSetActiveGlobal(0) : mmSetActiveGlobal(0)); });
			if(md)
				step("lock mode", [&] { s.send(mdSetStatus(MdStatus::LockMode, 0)); });
			else
				step("poly", [&] { s.send(mmSetStatus(MmStatus::Poly, 1)); });
			step("mute CCs", [&]
			{
				juce::MidiBuffer m;	// level/mute CCs on the tracks' channels
				for(int ch = 1; ch <= 4; ++ch) { s.cc(ch, 12, 127); s.cc(ch, 13, 0); }
			});
			step("play 6 s", [&] { if(md) s.transport(true); else s.page(R"({"op":"play"})"); pump(4500); });
			step("stop", [&] { if(md) s.transport(false); else s.page(R"({"op":"stop"})"); });
			check(s.deskReady(), "the editor read the machine");
			step("page ready + reads", [&] { pump(3000); });
			if(md)
			{
				step("globalSet tempoIn on", [&] { s.page(R"({"op":"globalSet","field":"tempoIn","on":true})"); });
				step("globalSet ctrlIn off", [&] { s.page(R"({"op":"globalSet","field":"ctrlIn","on":false})"); });
				step("globalSet tempoIn off", [&] { s.page(R"({"op":"globalSet","field":"tempoIn","on":false})"); });
				step("globalSet baseChannel 1", [&] { s.page(R"({"op":"globalSet","field":"baseChannel","v":1})"); });
				step("globalSet baseChannel 0", [&] { s.page(R"({"op":"globalSet","field":"baseChannel","v":0})"); });
			}
			else
			{
				step("globalMidi base 1", [&] { s.page(R"({"op":"globalMidi","base":1})"); });
				step("globalMidi clockIn", [&] { s.page(R"({"op":"globalMidi","clockIn":true})"); });
				step("globalMidi transportIn", [&] { s.page(R"({"op":"globalMidi","transportIn":true})"); });
				step("tempo 140", [&] { s.send(mmSetTempo(140.0)); });
			}
			return 0;
		}
		if(std::getenv("MDMM_MEMORY_LAYOUT"))
		{
			// Where each slot sits in the patch RAM: a changed dump sent to slots 0, 1 and the last, the bytes it changed
			using namespace elektronData;
			auto probe = [&](const char* _what, const int _slot, const std::function<Bytes()>& _send)
			{
				const auto before = s.patch();
				const auto msg = _send();
				if(msg.empty()) { std::printf("  layout %s %d: no dump\n", _what, _slot); return; }
				s.send(msg);
				pump(1500);
				const auto after = s.patch();
				size_t lo = SIZE_MAX, hi = 0, n = 0;
				for(size_t i = 0x1000; i < after.size(); ++i)
					if(before[i] != after[i]) { lo = std::min(lo, i); hi = i; ++n; }
				std::printf("  layout %s %d: %zu bytes changed, %06zx-%06zx;%s\n", _what, _slot, n, lo, hi, Session::diff(before, after).c_str());
			};
			auto mmRaw = [&](const uint8_t _cmd, const Bytes& _req, const int _slot) -> Bytes
			{
				const auto d = s.dump(_req, [&](const Bytes& m) { const auto u = unpackMmDump(m); return u && u->command == _cmd && u->position == _slot; });
				auto u = unpackMmDump(d);
				if(!u) return {};
				for(size_t i = 0; i < u->raw.size(); i += 97)
					u->raw[i] = static_cast<uint8_t>((u->raw[i] + 1 + _slot) & 0x7f);
				u->raw.front() = static_cast<uint8_t>('A' + _slot);
				u->raw.back() = static_cast<uint8_t>(u->raw.back() ^ 1);
				return packMmDump(*u);
			};
			if(md)
			{
				for(const int k : {0, 1, 63})
					probe("kit", k, [&] {
						auto d = decodeMdKit(s.dump(mdKitRequest(static_cast<uint8_t>(k)), [&](const Bytes& m) { const auto x = decodeMdKit(m); return x && x->position == k; }));
						if(!d) return Bytes{};
						d->name = {}; d->name[0] = 'K'; d->name[1] = static_cast<uint8_t>('A' + k);
						for(auto& g : d->muteGroups) g = static_cast<uint8_t>((g + 1) & 0x0f);
						return encodeMdKit(*d); });
				for(const int k : {0, 1, 127})
					probe("pattern", k, [&] {
						auto d = decodeMdPattern(s.dump(mdPatternRequest(static_cast<uint8_t>(k)), [&](const Bytes& m) { const auto x = decodeMdPattern(m); return x && x->position == k; }));
						if(!d) return Bytes{};
						d->trigs[0] ^= 0x0101010101010101ull * static_cast<uint64_t>(k + 1);
						d->trackSwing[15] ^= 0x8000000000000001ull;
						d->length = 64;
						return encodeMdPattern(*d); });
				for(const int k : {0, 1, 31})
					probe("song", k, [&] {
						auto d = decodeMdSong(s.dump(mdSongRequest(static_cast<uint8_t>(k)), [&](const Bytes& m) { const auto x = decodeMdSong(m); return x && x->position == k; }));
						if(!d) return Bytes{};
						d->name = {}; d->name[0] = 'S'; d->name[1] = static_cast<uint8_t>('A' + k);
						MdSongRow r; r.pattern = 3; r.repeats = 1;
						d->rows.insert(d->rows.begin(), r);
						return encodeMdSong(*d); });
				for(const int k : {0, 1, 7})
					probe("global", k, [&] {
						auto d = decodeMdGlobal(s.dump(mdGlobalRequest(static_cast<uint8_t>(k)), [&](const Bytes& m) { const auto x = decodeMdGlobal(m); return x && x->position == k; }));
						if(!d) return Bytes{};
						d->routing[0] = static_cast<uint8_t>((d->routing[0] + 1) % 6);
						d->keymap[5] = static_cast<uint8_t>(20 + k);
						d->trigMode = static_cast<uint8_t>((d->trigMode + 1) % 3);
						return encodeMdGlobal(*d); });
			}
			else
			{
				// where each dump's raw payload sits in the patch RAM (all places it matches, whole or its first 64 bytes)
				auto find = [&](const char* _what, const uint8_t _cmd, const Bytes& _req, const int _slot)
				{
					const auto d = s.dump(_req, [&](const Bytes& m) { const auto u = unpackMmDump(m); return u && u->command == _cmd && u->position == _slot; });
					const auto u = unpackMmDump(d);
					if(!u) { std::printf("  find %s %d: no dump\n", _what, _slot); return; }
					const auto ram = s.patch();
					std::string whole, head;
					const size_t h = std::min<size_t>(64, u->raw.size());
					for(size_t i = 0; i + u->raw.size() <= ram.size(); ++i)
					{
						if(std::memcmp(ram.data() + i, u->raw.data(), h) != 0) continue;
						char b[24]; std::snprintf(b, sizeof b, " %06zx", i);
						head += b;
						if(std::memcmp(ram.data() + i, u->raw.data(), u->raw.size()) == 0) whole += b;
					}
					size_t best = 0, bestAt = 0;
					for(size_t i = 0; i + 16 <= ram.size(); i += 1)
					{
						size_t n = 0;
						while(n < u->raw.size() && i + n < ram.size() && ram[i + n] == u->raw[n]) ++n;
						if(n > best) { best = n; bestAt = i; }
					}
					std::printf("  find %s %d (%zu bytes): whole at%s; head at%s; longest prefix %zu at %06zx\n", _what, _slot, u->raw.size(), whole.c_str(), head.substr(0, 200).c_str(), best, bestAt);
				};
				for(const int k : {0, 1, 2, 127}) find("kit", g_mmKitDump, mmKitRequest(static_cast<uint8_t>(k)), k);
				for(const int k : {0, 1, 2, 127}) find("pattern", g_mmPatternDump, mmPatternRequest(static_cast<uint8_t>(k)), k);
				for(const int k : {0, 1, 2, 23}) find("song", g_mmSongDump, mmSongRequest(static_cast<uint8_t>(k)), k);
				for(const int k : {0, 1, 2, 7}) find("global", g_mmGlobalDump, mmGlobalRequest(static_cast<uint8_t>(k)), k);
				for(const int k : {0, 1, 127})
					probe("kit", k, [&] { return mmRaw(g_mmKitDump, mmKitRequest(static_cast<uint8_t>(k)), k); });
				for(const int k : {0, 1, 127})
					probe("pattern", k, [&] { return mmRaw(g_mmPatternDump, mmPatternRequest(static_cast<uint8_t>(k)), k); });
				for(const int k : {0, 1, 23})
					probe("song", k, [&] { return mmRaw(g_mmSongDump, mmSongRequest(static_cast<uint8_t>(k)), k); });
				for(const int k : {0, 1, 7})
					probe("global", k, [&] { return mmRaw(g_mmGlobalDump, mmGlobalRequest(static_cast<uint8_t>(k)), k); });
			}
			return 0;
		}
		factoryName = s.kitName(slot);
		check(!factoryName.empty() && factoryName != name, "kit " + std::to_string(slot + 1) + " is the factory's: '" + factoryName + "'");
		pump(1500);
		check(s.processor->machineMemoryCost().writes == 0 && !memoryFile().existsAsFile(), "a start writes nothing (" + std::to_string(s.processor->machineMemoryCost().looks) + " looks)");
		factoryProject = s.projectState();
		// a DAW project playing with automation (CCs on every track's parameters) for 12 s: the pattern really plays
		// (the Monomachine takes no MIDI Start by default, TRANSPORT ACCEPT off: PLAY from the page)
		if(md)
			s.transport(true);
		else
		{
			check(s.deskReady(), "the editor has read the machine");
			s.page(R"({"op":"play"})");
		}
		check(until([&] { return s.playing(); }, 5000), "the pattern plays");
		std::set<int> steps;
		s.m_automate = true;
		const auto t0 = juce::Time::getMillisecondCounterHiRes();
		while(juce::Time::getMillisecondCounterHiRes() - t0 < 12500)
		{
			pump(100);
			steps.insert(s.step());
		}
		s.m_automate = false;
		check(s.playing() && steps.size() >= 8, "it played all along (" + std::to_string(steps.size()) + " steps seen)");
		if(md)
			s.transport(false);
		else
			s.page(R"({"op":"stop"})");
		pump(1500);
		check(s.processor->machineMemoryCost().writes == 0 && !memoryFile().existsAsFile(), "12 s of play with automation write nothing");
		s.nameWorkingKit("UNSAVED");
		pump(1500);
		check(s.processor->machineMemoryCost().writes == 0 && !memoryFile().existsAsFile(), "an unsaved edit of the kit that plays writes nothing");
		s.saveKit(slot, name);
		check(s.kitName(slot) == name, "SAVE KIT stored '" + name + "'");
		check(until([] { return memoryFile().existsAsFile(); }, 15000), "the save wrote the memory file");
		pump(2500);
		// SAVE KIT also sets the kit of the pattern that plays (stored in that pattern's slot, as on the machine)
		check(fileHas({Kind::Kit, slot}) && fileStore().size() <= 2 && (fileStore().size() == 1 || fileHas({Kind::Pattern, 0})),
			"the file holds that kit's slot (and the playing pattern's, whose kit it is) only: " + fileKeys());
		const auto c = s.processor->machineMemoryCost();
		std::printf("  cost: %u looks, look under the lock %.3f ms (worst %.3f), look with hash %.3f ms; %u writes, last %.2f ms, %zu bytes\n",
			c.looks, c.lookLockLastMs, c.lookLockMaxMs, c.lookMs, c.writes, c.writeMs, c.fileBytes);
		const auto status = s.processor->machineMemoryStatus();
		check(status.keep && status.available && status.saved && status.note.empty(), "the status says keep, saved, no note");
	}
	const uint8_t patSlot = 2, songSlot = 4;
	{
		std::puts(" session 2: no project state, the file's slots over factory memory; page edits of a pattern, a song, a global");
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slot) == name, "kit " + std::to_string(slot + 1) + " is the saved '" + name + "'");
		pump(1500);
		check(s.processor->machineMemoryCost().writes == 0, "starting from the file writes nothing");
		check(s.deskReady(), "the editor has read the machine");
		s.page(R"({"op":"select","p":2,"now":true})");
		if(md)
			check(s.pageOk(R"({"op":"trig","p":2,"t":0,"s":3,"on":true})"), "a trig set from the page: " + s.lastPageResult());
		else
			check(s.pageOk(R"({"op":"step","p":2,"t":0,"s":3,"v":{"n":[60]}})"), "a step set from the page: " + s.lastPageResult());
		check(s.pageOk(md ? R"({"op":"lock","p":2,"t":0,"i":0,"s":3,"v":77})" : R"({"op":"lock","p":2,"t":0,"page":1,"i":0,"s":3,"v":77})"),
			"a lock set from the page: " + s.lastPageResult());
		check(until([&] { return fileHas({Kind::Pattern, patSlot}); }, 60000), "a step and a lock of pattern 3 reach the file: " + fileKeys() + " (" + s.lastPageResult() + ")");
		s.page(md ? R"({"op":"selectSong","s":4})" : R"({"op":"loadSong","s":4})");
		check(s.pageOk(R"({"op":"songRename","s":4,"name":"MEMSONG"})"), "a song renamed from the page: " + s.lastPageResult());
		check(until([&] { return fileHas({Kind::Song, songSlot}); }, 60000), "a song saved reaches the file: " + fileKeys() + " (" + s.lastPageResult() + ")");
		if(md)
			s.page(R"({"op":"globalSet","field":"tempoOut","on":true})");
		else
			s.page(R"({"op":"masterTune","v":4410})");
		check(until([&] { return fileHasKind(Kind::Global); }, 60000), "a global edit reaches the file: " + fileKeys() + " (" + s.lastPageResult() + ")");
		check(fileHas({Kind::Kit, slot}), "and the kit is still there");
		if(md)
		{
			// a sample the page sends: written once the machine stored it (the flash held still)
			const auto wav = sineWav();
			s.processor->getDeskHost()->session()->loadSampleFile(5, wav);
			check(until([&] { return fileHasKind(Kind::Sector); }, 90000), "a sample loaded reaches the file: " + fileKeys());
			const auto c = s.processor->machineMemoryCost();
			std::printf("  cost: the sample flash copy held the plug-in's lock %.3f ms at most (one hold at a new base: 6 MiB), %.3f ms the last copy\n",
				c.flashHoldMaxMs, c.flashHoldLastMs);
		}
		// the sequencer playing is no save
		const auto writes = s.processor->machineMemoryCost().writes;
		s.page(R"({"op":"play"})");
		check(until([&] { return s.playing(); }, 5000), "it plays");
		pump(12000);
		check(s.processor->machineMemoryCost().writes == writes, "12 s of play write nothing");
		s.page(R"({"op":"stop"})");
	}
	savedFile = readFile(memoryFile());
	{
		std::puts(" session 3: a project state wins over the file; a save in it writes only its slot (D)");
		Session s(factoryProject);
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slot) == factoryName, "kit " + std::to_string(slot + 1) + " is the project's '" + factoryName + "'");
		pump(1500);
		check(readFile(memoryFile()) == savedFile, "opening the project leaves the file as it was");
		const auto before = fileStore();
		s.saveKit(7, "PROJKIT");
		check(until([&] { return fileHas({Kind::Kit, 7}); }, 15000), "the project's save reached the file");
		const auto after = fileStore();
		check(keptExceptLinks(before, after) && after.size() <= before.size() + 1,
			"every other slot of the file is as it was (the playing pattern's kit aside): " + fileKeys());
	}
	{
		std::puts(" session 3b: the standalone's own state gets the file's slots laid over it");
		Session s(factoryProject, true);
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slot) == name, "kit " + std::to_string(slot + 1) + " is the saved '" + name + "'");
		check(s.kitName(7) == "PROJKIT", "and kit 8, saved in a project");
	}
	savedFile = readFile(memoryFile());
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
	const uint8_t slotClose = 6, slotKeep = 9, slotFail = 10, slotReboot = 11;
	{
		std::puts(" session 3d: a save, then the instance closes at once (before the watch's next look)");
		Session s;
		check(s.waitWatching(), "the machine starts");
		s.processor->setMachineMemoryLookMs(600000);
		pump(300);
		const auto writes = s.processor->machineMemoryCost().writes;
		s.saveKit(slotClose, "CLOSED");
		check(s.processor->machineMemoryCost().writes == writes, "no look since the save");
	}
	{
		std::puts(" session 3e: the save made just before closing is there; a save, then a reboot at once (E)");
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slotClose) == "CLOSED", "kit " + std::to_string(slotClose + 1) + " is the one saved before the close");
		s.processor->setMachineMemoryLookMs(600000);
		pump(300);
		s.saveKit(slotReboot, "REBOOTED");
		check(s.processor->rebootDevice(), "the machine reboots (as MIDI panic, a ROM installed)");
		s.processor->setMachineMemoryLookMs(100);
		check(s.waitWatching(), "it runs again");
		check(until([&] { return fileHas({Kind::Kit, slotReboot}); }, 15000), "the save made just before the reboot reached the file");
	}
	{
		std::puts(" session 3f: KEEP MEMORY off from the start, a save, on again: merged, nothing replaced (A)");
		Session s;
		s.processor->setKeepMachineMemory(false);
		check(s.waitWatching(), "the machine starts (no file read)");
		check(s.kitName(slot) == factoryName, "KEEP MEMORY off: factory memory");
		const auto before = fileStore();
		s.saveKit(slotKeep, "OFFON");
		pump(2000);
		check(fileStore().size() == before.size() && !fileHas({Kind::Kit, slotKeep}), "KEEP MEMORY off: the save is not written");
		s.processor->setKeepMachineMemory(true);
		check(until([&] { return fileHas({Kind::Kit, slotKeep}); }, 5000), "on again: the save is merged at once");
		const auto after = fileStore();
		check(keptExceptLinks(before, after) && after.size() >= before.size() + 1,
			"every slot saved before is still there (the file was not replaced): " + fileKeys());
	}
	Bytes standaloneState;
	{
		std::puts(" session 3g: the standalone, an unsaved edit of the kit that plays");
		Session s(std::nullopt, true);
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slotKeep) == "OFFON", "kit " + std::to_string(slotKeep + 1) + " is in the file");
		s.nameWorkingKit("WORKING");
		pump(1500);
		const auto writes = s.processor->machineMemoryCost().writes;
		check(s.workingName() == "WORKING", "the edit is there");
		standaloneState = s.projectState();
		check(s.processor->machineMemoryMark().pending.empty() && s.processor->machineMemoryCost().writes == writes, "the edit is no save: nothing pending, nothing written");
	}
	{
		std::puts(" session 3h: the standalone starts again: its unsaved edit stays, the saved slots come from the file");
		Session s(standaloneState, true);
		check(s.waitWatching(), "the machine starts");
		check(s.workingName() == "WORKING", "the unsaved edit is still there ('" + s.workingName() + "')");
		check(s.kitName(slotKeep) == "OFFON", "and the saves");
	}
	Bytes failedProject;
	{
		std::puts(" session 3i: a write that fails (a read-only folder): the stale file does not win at the next start");
		const auto before = readFile(memoryFile());
		{
			Session s(std::nullopt, true);
			check(s.waitWatching(), "the machine starts");
			setWritable(g_memory, false);
			s.saveKit(slotFail, "ROFAIL");
			check(s.kitName(slotFail) == "ROFAIL", "SAVE KIT stored it ('" + s.kitName(slotFail) + "')");
			check(until([&] { return s.processor->machineMemoryCost().failedWrites >= 1; }, 10000), "the write failed");
			standaloneState = s.projectState();	// as the standalone saves its state when it quits
			const auto mark = s.processor->machineMemoryMark();
			const bool named = std::find(mark.pending.begin(), mark.pending.end(), Key{Kind::Kit, slotFail}) != mark.pending.end();
			check(named && mark.pending.size() <= 2, "the state names the slot the file lacks (and the playing pattern, whose kit it set): "
				+ std::to_string(mark.pending.size()));
		}	// the instance goes away with the folder still read-only: its last write fails too
		setWritable(g_memory, true);
		check(readFile(memoryFile()) == before, "the file is the stale one");
	}
	{
		Session s(standaloneState, true);
		check(s.waitWatching(), "the standalone starts again");
		check(s.kitName(slotFail) == "ROFAIL", "its own save won over the file's slot ('" + s.kitName(slotFail) + "')");
		check(until([&] { return fileHas({Kind::Kit, slotFail}); }, 10000), "and it is written to the file at once");
		check(s.kitName(slot) == name, "the file's other slots are there");
	}
	{
		std::puts(" session 3j: a DAW project with a mark (a write had failed in it): the mark drives no write (B)");
		{
			Session s;
			check(s.waitWatching(), "the machine starts");
			setWritable(g_memory, false);
			s.saveKit(12, "PROJFAIL");
			check(until([&] { return s.processor->machineMemoryCost().failedWrites >= 1; }, 10000), "the write failed");
			failedProject = s.projectState();
			check(!s.processor->machineMemoryMark().pending.empty(), "the project names it");
		}
		setWritable(g_memory, true);
		const auto before = readFile(memoryFile());
		Session s(failedProject);
		check(s.waitWatching(), "the project opens");
		pump(3000);
		check(s.processor->machineMemoryCost().writes == 0 && readFile(memoryFile()) == before, "nothing is written for the project's mark");
	}
	{
		std::puts(" session 3k: a standalone state from before the slot store (C)");
		Bytes old;
		{
			Session s(std::nullopt, true);
			s.processor->setKeepMachineMemory(false);
			check(s.waitWatching(), "the machine starts");
			s.saveKit(slot, "OWNOLD");	// a slot the file has too
			s.saveKit(13, "OWNONLY");	// a slot the file lacks
			old = oldState(s.projectState());
		}
		check(!old.empty(), "an old state made");
		g_memory.getChildFile(mdJucePlugin::machineMemory::g_keptName).deleteFile();
		Session s(old, true);
		check(s.waitWatching(), "the standalone starts with it");
		check(s.kitName(slot) == name, "the file's slot replaced its own");
		check(g_memory.getChildFile(mdJucePlugin::machineMemory::g_keptName).existsAsFile(), "its own slot was kept aside, not thrown away");
		check(s.kitName(13) == "OWNONLY", "its slot the file lacks stays");
		check(until([&] { return fileHas({Kind::Kit, 13}); }, 15000), "and is seeded into the file");
	}
	if(!md)
	{
		std::puts(" session 3l: a storage image loaded is a set of saves (E)");
		Session s;
		check(s.waitWatching(), "the machine starts");
		auto image = s.patch();
		const auto* kit = mdJucePlugin::machineMemory::findSlot(g_model, {Kind::Kit, 20});
		image[kit->ranges.front().begin] = 'I';
		image[kit->ranges.front().begin + 1] = 'M';
		const auto f = juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("mdMachineMemoryFirmwareTest-image.bin");
		f.replaceWithData(image.data(), image.size());
		juce::String result;
		check(s.processor->loadStorageImage(f, result), "the image loads: " + result.toStdString());
		check(until([&] { return fileHas({Kind::Kit, 20}); }, 30000), "its changed kit reached the file: " + fileKeys());
	}
	{
		std::puts(" session 3m: two instances at once, saving other slots again and again: every save is in the file");
		Session a, b;
		check(a.waitWatching() && b.waitWatching(), "both machines start");
		a.processor->setMachineMemoryLookMs(10);
		b.processor->setMachineMemoryLookMs(10);
		for(int i = 0; i < 6; ++i)
		{
			a.saveKit(static_cast<uint8_t>(30 + i), "A" + std::to_string(i));
			b.saveKit(static_cast<uint8_t>(40 + i), "B" + std::to_string(i));
		}
		bool all = until([&]
		{
			for(int i = 0; i < 6; ++i)
				if(!fileHas({Kind::Kit, static_cast<uint32_t>(30 + i)}) || !fileHas({Kind::Kit, static_cast<uint32_t>(40 + i)}))
					return false;
			return true;
		}, 30000);
		check(all, "the twelve kits of both instances are in the file: " + fileKeys());
		check(fileHas({Kind::Kit, slot}), "and the slots saved before");
	}
	{
		std::puts(" session 3n: the start's overlay refused at once: the file stays, the base stays (a failed save is still written)");
		const auto before = readFile(memoryFile());
		Session s;
		s.processor->refuseNextMachineMemoryRestoreForTest();
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slot) == factoryName, "the overlay was refused: factory memory");
		check(!s.processor->machineMemoryStatus().note.empty(), "the note says so: " + s.processor->machineMemoryStatus().note);
		check(readFile(memoryFile()) == before, "the file is as it was");
		// the overlay's refusal left no rebase behind: a save that fails, then a restart (still read-only), then the
		// folder writable again: the save is still pending (not taken into a new base) and is written
		setWritable(g_memory, false);
		s.saveKit(51, "OVERLAYP");
		check(until([&] { return s.processor->machineMemoryCost().failedWrites >= 1; }, 10000), "the write failed");
		check(s.processor->rebootDevice(), "a restart, the folder still read-only");
		check(s.waitWatching(), "it runs again");
		setWritable(g_memory, true);
		check(until([&] { return fileHas({Kind::Kit, 51}); }, 15000), "the pending save reached the file (the overlay's refusal took no new base)");
		// F refused, with a save pending from a failed write: the file stays, and the save is written after a restart
		const auto failed = s.processor->machineMemoryCost().failedWrites;
		setWritable(g_memory, false);
		s.saveKit(50, "PENDING");
		check(until([&] { return s.processor->machineMemoryCost().failedWrites > failed; }, 10000), "the write failed");
		s.processor->refuseNextMachineMemoryRestoreForTest();
		std::string note;
		check(!s.processor->startFromFactoryMemory(note), "Start from factory memory refused: " + note);
		check(memoryFile().existsAsFile(), "the file is kept");
		check(s.kitName(50) == "PENDING", "the machine kept its memory");
		check(s.processor->rebootDevice(), "a restart, the folder still read-only");
		check(s.waitWatching(), "it runs again");
		setWritable(g_memory, true);
		check(until([&] { return fileHas({Kind::Kit, 50}); }, 15000), "the pending save reached the file (not taken into a new base)");
		check(fileHas({Kind::Kit, slot}), "the other saves are still there");
	}
	if(md)
	{
		std::puts(" session 3o: samples saved with another ROM are kept when this ROM's are saved");
		auto d = mdJucePlugin::machineMemory::decode(readFile(memoryFile()), g_model);
		check(d.problem == mdJucePlugin::machineMemory::Problem::None && fileHasKind(Kind::Sector), "the file has samples");
		d.file.romFingerprint ^= 0x5555;
		const auto other = mdJucePlugin::machineMemory::encode(g_model, d.file);
		memoryFile().replaceWithData(other.data(), other.size());
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(s.deskReady(), "the editor has read the machine");
		s.page(R"({"op":"ready"})");
		s.processor->getDeskHost()->session()->loadSampleFile(7, sineWav());
		check(until([&] { return mdJucePlugin::machineMemory::decode(readFile(memoryFile()), g_model).file.romFingerprint != d.file.romFingerprint; }, 90000),
			"the new sample was saved with this ROM");
		const auto kept = g_memory.findChildFiles(juce::File::findFiles, false, "machine-memory.samples-*.bin");
		check(kept.size() == 1, "the other ROM's samples were kept in their own file");
		if(kept.size() == 1)
		{
			const auto k = mdJucePlugin::machineMemory::decode(readFile(kept[0]), g_model);
			bool same = k.problem == mdJucePlugin::machineMemory::Problem::None && k.file.romFingerprint == d.file.romFingerprint;
			size_t sectors = 0;
			for(const auto& [key, e] : d.file.slots)
			{
				if(key.kind != Kind::Sector)
					continue;
				++sectors;
				same = same && k.file.slots.count(key) && k.file.slots.at(key).bytes == e.bytes;
			}
			check(same && k.file.slots.size() == sectors, "it holds those samples as they were, with their ROM's fingerprint");
			check(s.processor->machineMemoryStatus().note.find(kept[0].getFullPathName().toStdString()) != std::string::npos,
				"the notice names where: " + s.processor->machineMemoryStatus().note);
		}
	}
	{
		std::puts(" session 3p: a save under way while a look is taken in pieces: no torn slot reaches the file");
		// a slot across the look's 64 KiB pieces: MD pattern 6 (its first part in piece 2, its third in piece 8), MM pattern
		// 6 (across 0x20000); between the pieces the test changes both ends, so every look in pieces sees them disagree
		const auto* pat = mdJucePlugin::machineMemory::findSlot(g_model, {Kind::Pattern, 5});
		const size_t first = pat->ranges.front().begin + 0x20, last = pat->ranges.back().end - 0x20;
		const size_t between = md ? 0x30000 : 0x10000;
		const size_t firstAt = 0x20, lastAt = pat->size - 0x20;	// offsets in the slot's bytes
		std::atomic<int> value{0};
		std::atomic<bool> on{false};
		bool torn = false;
		uint8_t origFirst = 0, origLast = 0;	// the pattern as it was; after that every change sets both ends to one value
		auto tornIn = [&](const Bytes& _file)
		{
			const auto st = mdJucePlugin::machineMemory::decode(_file, g_model).file.slots;
			const auto it = st.find({Kind::Pattern, 5});
			if(it == st.end())
				return false;
			const auto a = it->second.bytes[firstAt], b = it->second.bytes[lastAt];
			return !(a == origFirst && b == origLast) && a != b;
		};
		{
			Session s;
			check(s.waitWatching(), "the machine starts");
			s.processor->setMachineMemoryLookMs(50);
			{
				const auto mem = s.patch();
				origFirst = mem[first];
				origLast = mem[last];
				check(origFirst != origLast, "the two ends differ to start with (a torn copy would show)");
			}
			auto* const proc = s.processor.get();	// (alive until its watch's thread has stopped)
			proc->setMachineMemoryLookHookForTest([&value, &on, proc, first, last, between](const size_t _at)
			{
				if(!on || _at != between)
					return;
				const auto v = static_cast<uint8_t>(++value);
				proc->getPlugin().withDeviceLocked([&](synthLib::Device* _d)
				{
					auto* d = dynamic_cast<md::DeskDevice*>(_d);
					if(!d) return;
					d->getHardware().getUC().pokePatchRamForTest(first, v);
					d->getHardware().getUC().pokePatchRamForTest(last, v);
				});
			});
			on = true;
			s.processor->setKeepMachineMemory(true);	// a write at the next look, changed or not
			const auto end = juce::Time::getMillisecondCounterHiRes() + 12000;
			while(juce::Time::getMillisecondCounterHiRes() < end)
			{
				pump(100);
				torn = torn || tornIn(readFile(memoryFile()));
			}
			check(value > 50, "the save kept landing between the pieces (" + std::to_string(value.load()) + " looks)");
			check(!torn, "no torn pattern reached the file while it kept changing (10 s and more)");
			on = false;
			const auto settled = static_cast<uint8_t>(value.load());
			check(until([&]
			{
				const auto st = fileStore();
				const auto it = st.find({Kind::Pattern, 5});
				return it != st.end() && it->second.bytes[firstAt] == settled && it->second.bytes[lastAt] == settled;
			}, 10000), "once still, the pattern is written as it is");
			{
				const auto mem = s.patch();
				const auto st = mdJucePlugin::machineMemory::decode(readFile(memoryFile()), g_model).file.slots;
				const auto it = st.find({Kind::Pattern, 5});
				std::printf("  memory %02x %02x, file %02x %02x\n", mem[first], mem[last], it != st.end() ? it->second.bytes[firstAt] : 0, it != st.end() ? it->second.bytes[lastAt] : 0);
			}
			check(!tornIn(readFile(memoryFile())), "whole");
			// again, and the instance closes while it changes: the close's look is taken in one hold
			on = true;
			pump(1000);
		}
		check(!tornIn(readFile(memoryFile())), "the close wrote it whole");
	}
	{
		std::puts(" session 3q: tempo: saved with its global; never while the machine follows the host");
		const auto* g = mdJucePlugin::machineMemory::findSlot(g_model, {Kind::Global, 0});
		// a plug-in following its DAW starts first; then a standalone (not following) changes the tempo (MM: its sync)
		Session daw;
		daw.processor->setMachineMemoryFollowsHostForTest(true);
		check(daw.waitWatching(), "a plug-in following its DAW starts");
		check(daw.deskReady(), "its editor has read the machine");
		{
			Session s(std::nullopt, true);
			check(s.waitWatching(), "a standalone starts");
			check(s.deskReady(), "the editor has read the machine");
			if(md)
				s.send(elektronData::mdSetTempo(133 * 24));
			else
				s.page(R"({"op":"globalMidi","clockIn":true})");	// the MM keeps no tempo in a slot: its sync setting
			check(until([&]
			{
				const auto st = fileStore();
				const auto it = st.find({Kind::Global, 0});
				return it != st.end() && it->second.bytes == mdJucePlugin::machineMemory::slotBytes(*g, s.patch());
			}, 15000), md ? "the standalone's tempo change is saved with its global" : "the standalone's sync change is saved with its global");
		}
		const auto before = fileStore().at({Kind::Global, 0}).bytes;
		auto hostKept = [&](const Bytes& _after)
		{
			bool kept = true;
			for(const auto at : g->hostBytes)
				kept = kept && _after[at] == before[at];
			return kept;
		};
		// the plug-in: its DAW's tempo (sync) is never saved; a real global change is, with the tempo the file has
		// (the newer one the standalone saved, not the one this plug-in started with)
		if(md)
			daw.send(elektronData::mdSetTempo(141 * 24));
		else
			daw.page(R"({"op":"globalMidi","clockIn":false,"transportIn":true})");
		pump(3000);
		check(fileStore().at({Kind::Global, 0}).bytes == before, "the host's tempo and sync are not saved");
		daw.page(md ? R"({"op":"globalSet","field":"baseChannel","v":2})" : R"({"op":"globalMidi","base":2})");
		check(until([&] { return fileStore().at({Kind::Global, 0}).bytes != before; }, 15000), "another global change is");
		check(hostKept(fileStore().at({Kind::Global, 0}).bytes), "with the other instance's newer tempo and sync, not this one's");
		// a DAW project opens (a new base, the project's tempo): the same
		daw.processor->setMachineMemoryFollowsHostForTest(true);
		static_cast<juce::AudioProcessor&>(*daw.processor).setStateInformation(factoryProject.data(), static_cast<int>(factoryProject.size()));
		pump(500);
		check(daw.waitWatching(), "a project opens in the plug-in");
		const auto beforeProject = fileStore().at({Kind::Global, 0}).bytes;
		check(daw.deskReady(), "its editor has read the machine again");
		check(daw.pageOk(md ? R"({"op":"globalSet","field":"baseChannel","v":3})" : R"({"op":"globalMidi","base":3})"), "a global change: " + daw.lastPageResult());
		check(until([&] { return fileStore().at({Kind::Global, 0}).bytes != beforeProject; }, 15000), "a global change in the project is saved");
		check(hostKept(fileStore().at({Kind::Global, 0}).bytes), "with the file's tempo and sync, not the project's");
	}
	{
		std::puts(" session 3r: the file's lock held by another bundle in this process, then by another process: the save waits");
		Session s;
		check(s.waitWatching(), "the machine starts");
		{
			// a second handle in this process, without this bundle's mutex: as the AU beside the VST3
			const mdJucePlugin::machineMemory::FileLock other(memoryFile(), 2000, false);
			check(other.held() && !other.unlocked(), "the other bundle holds the file lock");
			s.saveKit(54, "BUNDLE");
			pump(2500);
			check(!fileSlotIs(s, {Kind::Kit, 54}), "not written while it holds it");
		}
		check(until([&] { return fileSlotIs(s, {Kind::Kit, 54}); }, 15000), "written once it let go");
		juce::ChildProcess child;
		const auto self = juce::File::getSpecialLocation(juce::File::currentExecutableFile).getFullPathName();
		const auto childStart = juce::Time::getMillisecondCounterHiRes();
		const auto ready = g_memory.getSiblingFile(g_memory.getFileName() + "-holding");
		(void)ready.deleteFile();
		check(child.start(juce::StringArray{self, "holdlock", memoryFile().getFullPathName(), "12000", ready.getFullPathName()}), "a second process starts");
		check(until([&] { return ready.existsAsFile(); }, 10000), "it holds the lock");
		(void)ready.deleteFile();
		s.saveKit(55, "LOCKED");
		pump(2500);
		const auto bornAgo = juce::Time::getMillisecondCounterHiRes() - childStart;
		check(child.isRunning(), "it still holds it (did not die early; " + std::to_string(int(bornAgo)) + " ms, exit " + std::to_string(child.isRunning() ? -1 : int(child.getExitCode())) + ")");
		check(!fileSlotIs(s, {Kind::Kit, 55}), "not written while it holds it");
		check(until([&] { return fileSlotIs(s, {Kind::Kit, 55}); }, 30000), "written once the other process let go");
		child.waitForProcessToFinish(10000);
	}
	{
		std::puts(" session 3s: a write that fails is tried again every 5 s, not at every look");
		Session s;
		check(s.waitWatching(), "the machine starts");
		s.processor->setMachineMemoryLookMs(100);
		setWritable(g_memory, false);
		s.saveKit(58, "RETRY");
		check(until([&] { return s.processor->machineMemoryCost().failedWrites >= 1; }, 10000), "the write failed");
		const auto first = s.processor->machineMemoryCost().failedWrites;
		pump(11000);
		const auto tries = s.processor->machineMemoryCost().failedWrites - first;
		check(tries >= 1 && tries <= 3, "tried again " + std::to_string(tries) + " times in 11 s (every 5 s, not every 0.1 s look)");
		setWritable(g_memory, true);
		check(until([&] { return fileSlotIs(s, {Kind::Kit, 58}); }, 8000), "written at the next try once it can be");
	}
	savedFile = readFile(memoryFile());
	{
		std::puts(" session 4: start from factory memory (F: the file goes once the machine runs on it)");
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(s.kitName(slot) == name, "kit " + std::to_string(slot + 1) + " is the saved one first");
		std::string note;
		check(s.processor->startFromFactoryMemory(note), "factory memory: " + note);
		check(until([] { return !memoryFile().existsAsFile(); }, 60000), "the file is gone once the machine took it");
		check(s.waitWatching(), "the machine runs again");
		check(s.kitName(slot) == factoryName, "kit " + std::to_string(slot + 1) + " is the factory's again");
		pump(2000);
		check(!memoryFile().existsAsFile(), "and nothing wrote a file since");
	}
	{
		std::puts(" session 4b: Start from factory memory while another editor holds the file and saves: its newer save stays");
		Session a, b;
		check(a.waitWatching() && b.waitWatching(), "two instances start");
		a.saveKit(57, "OLDSAVE");
		check(until([&] { return fileSlotIs(a, {Kind::Kit, 57}); }, 15000), "a save before the reset");
		{
			const mdJucePlugin::machineMemory::FileLock held(memoryFile(), 2000);	// the file busy at the reset
			std::string note;
			check(a.processor->startFromFactoryMemory(note), "Start from factory memory: " + note);
			check(a.waitWatching(), "the machine runs on factory memory");
			b.saveKit(56, "NEWER");
			pump(500);
			check(fileHas({Kind::Kit, 57}), "the file stays while its lock is held");
		}
		check(until([&] { return !fileHas({Kind::Kit, 57}) && fileSlotIs(b, {Kind::Kit, 56}); }, 20000),
			"then the saves from before the reset go and the newer save stays: " + fileKeys());
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
		check(!memoryFile().existsAsFile() && unusableFiles() == 1, "the damaged file was moved aside (time-stamped)");
	}
	{
		std::puts(" session 5b: a second damaged file: moved aside beside the first, none deleted");
		auto broken = savedFile;
		broken[broken.size() / 3] ^= 0x33;
		memoryFile().replaceWithData(broken.data(), broken.size());
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(!memoryFile().existsAsFile() && unusableFiles() == 2, "both moved-aside files are there");
	}
	{
		std::puts(" session 5c: a file of a newer editor: kept, nothing saved over it");
		auto newer = savedFile;
		newer[8] = 3;	// format version 3
		memoryFile().replaceWithData(newer.data(), newer.size());
		Session s;
		check(s.waitWatching(), "the machine starts");
		check(s.processor->machineMemoryStatus().note.find("another version") != std::string::npos, "the note says why: " + s.processor->machineMemoryStatus().note);
		s.saveKit(20, "NOTOVER");
		check(until([&] { return s.processor->machineMemoryCost().failedWrites >= 1; }, 10000), "the save is refused");
		check(readFile(memoryFile()) == newer, "the newer file is as it was");
		memoryFile().deleteFile();
	}
	g_memory.deleteRecursively();
	std::printf("mdMachineMemoryFirmwareTest %s: %s\n", tag, g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
