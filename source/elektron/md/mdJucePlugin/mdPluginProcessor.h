#pragma once

#include "jucePluginEditorLib/pluginProcessor.h"
#include "mdBootDiagnostics.h"
#include "mdCpuLoad.h"
#include "mdMidiIn.h"
#include "mdOutputLevel.h"
#include "mdMachineMemory.h"
#include "mdLib/mdtypes.h"
#include "synthLib/performanceReport.h"

#include <atomic>
#include <optional>
#include <string>
#include <string_view>
#include <mutex>
#include <vector>

namespace mdJucePlugin
{
	class AudioPluginAudioProcessor : public jucePluginEditorLib::Processor,
		private juce::Timer
	{
	public:
		struct EphemeralConfig final
		{
			// Tests may explicitly isolate the emulated machine from persistent
			// factory/storage caches. A disengaged value preserves normal discovery;
			// an engaged empty value disables the device home path entirely.
			std::optional<std::string> deviceHomePath;
			// I-024: the folder of the machine memory file (mdMachineMemory.h). Disengaged: none (an isolated test
			// keeps no memory between sessions); an engaged path: that folder.
			std::optional<std::string> machineMemoryFolder;
			// I-024: take the state given at the start as the standalone's own (the memory file wins over it)
			bool standaloneState = false;
		};

	    AudioPluginAudioProcessor();
		explicit AudioPluginAudioProcessor(md::MachineModel _model);
		AudioPluginAudioProcessor(md::MachineModel _model, EphemeralConfig);
		AudioPluginAudioProcessor(md::MachineModel _model, std::vector<uint8_t> _initialPatchRam);
	    ~AudioPluginAudioProcessor() override;

		md::MachineModel getModel() const { return m_model; }
		static md::MachineModel getCompiledProductModel();
		static bool hasEmbeddedProductResource(std::string_view _filename);
		juce::File getInstalledFactoryStorageImage() const;
		juce::File getStorageRecoveryImage() const;
		bool loadStorageImage(const juce::File& _source, juce::String& _result);
		bool serviceFactoryInitialization();
		bool serviceProjectStateRestore();
		std::string getProjectStateRestoreError();
		void setPerformanceDiagnosticsEnabled(bool _enabled);
		bool performanceDiagnosticsActive() const;
		std::string performanceDiagnosticsStatus() const;
		juce::File performanceDiagnosticsFolder() const;
		juce::File performanceDiagnosticsFile() const { return m_performanceReportFile; }
		void setRamRecordingMode(md::RamRecordingMode _mode);
		md::RamRecordingMode getRamRecordingMode() const
		{
			return static_cast<md::RamRecordingMode>(
				m_ramRecordingMode.load(std::memory_order_relaxed));
		}
		bool isRamRecordingModeAvailable();
		// B-030: the host's tempo as its playhead reports it (also while its transport is stopped), 0 when no
		// host reports one (the standalone app). Any thread.
		double getHostBpm() const { return m_hostBpm.load(std::memory_order_relaxed); }
		void processBpm(float _bpm) override { m_hostBpm.store(_bpm, std::memory_order_relaxed); }
		// B-035: the host's audio calls counted, the start-up log's lines and the rates (mdBootDiagnostics.h)
		void processBlockStarted(int _frames, bool _bypassed) override;
		BootDiagnostics& bootDiagnostics() { return m_boot; }
		// I-018: the CPU meter (mdCpuLoad.h): processBlock timed on the audio thread, read and smoothed here (message
		// thread, a few times a second: the session's cpuLoad message)
		void processBlockEnded(int _frames) override;
		cpuLoad::Reading cpuLoadReading();
		// I-021: the output meter in the LCD (mdOutputLevel.h): the main output's left and right peaks after the output
		// gain (and every output's, for the clip mark), raised on the audio thread, taken here (message thread: the
		// session's outputLevel message)
		void processBlockOutput(const synthLib::TAudioOutputs& _outputs, size_t _frames) override;
		outputLevel::Peaks takeOutputPeaks() { return m_outputMeter.take(); }
		// 0.6 (LEARN, I-002): each note on from the host's MIDI in or a port, kept for the session's midiIn message
		// (mdMidiIn.h); taken on the message thread
		void midiInReceived(const synthLib::SMidiEvent& _ev) override;
		std::optional<midiIn::Note> takeMidiIn() { midiIn::Note n; if(m_midiIn.tryPop(n)) return n; return {}; }
		// Tester switch (doc/md_mm_performance_diagnostics.md): run the emulation as before the step 1
		// speed-ups (md::Device::setSpeedUps). Identical audio, more host CPU. Kept in the plug-in's config.
		void setLegacyEmulation(bool _legacy);
		bool isLegacyEmulation();
		// The speed-ups one by one (md::Device::setSpeedUpLeversOff, md::SpeedUpLever bits): the levers kept off
		// while the speed-ups are on. Same audio. Kept in the plug-in's config (key speedUpLeversOff).
		void setSpeedUpLeversOff(uint32_t _off);
		uint32_t getSpeedUpLeversOff();
		// L3's opt-in (md::Device::setExactEssiTiming): exact serial-port timing on the Machinedrum, which changes
		// its sound; acts only with the speed-ups on. Off by default; kept in the plug-in's config.
		void setExactEssiTiming(bool _on);
		bool isExactEssiTiming();
		// I-018: the speed-up switches as saved in the plug-in's settings (what the next session starts with)
		bool savedLegacyEmulation();
		// I-018: one line in the start-up log for every speed-up switch change: the machine's state, why (_via: menu,
		// settings at start, env) and what the settings file holds now
		void logSpeedUps(const char* _via);
		uint32_t savedSpeedUpLeversOff();
		// I-024: the machine's memory that stays for every new session (doc/modern-ux/DESIGN-machine-memory.md,
		// mdMachineMemory.h). A session with no project state starts from the file; a background thread writes each
		// save on the machine to it. Message thread unless said otherwise.
		struct MachineMemoryStatus
		{
			bool keep = false;			// the setting (KEEP MEMORY), default on
			bool available = false;		// a folder for the file (none in an isolated test)
			bool saved = false;			// the file is there
			std::string note;			// the last thing to say (a write that failed, a file that could not be used)
		};
		MachineMemoryStatus machineMemoryStatus() const;
		// Changes whenever the status may have changed (any thread): the session republishes it to the page.
		uint32_t machineMemoryVersion() const { return m_memoryVersion.load(std::memory_order_acquire); }
		bool keepMachineMemory() const { return m_memoryKeep.load(std::memory_order_acquire); }
		// The start's decision is made (the file's slots laid over, or not needed): tests wait for it
		bool machineMemoryStarted() const { return m_memoryStartDone.load(); }
		void setKeepMachineMemory(bool _keep);
		// RESET MACHINE… > Start from factory memory: the file goes and the machine restarts from factory memory (a fresh machine's
		// state, as on a new install). The page asked the user first. False with the reason in _note.
		bool startFromFactoryMemory(std::string& _note);
		juce::File machineMemoryFile() const;
		// What the watch measured (tests and the design note): the look's time under the plug-in's lock (the worst
		// and the last), a look's whole time with its hash, the last write's time, how many looks and writes.
		struct MachineMemoryCost
		{
			double lookLockMaxMs = 0, lookLockLastMs = 0, lookMs = 0, writeMs = 0;
			uint32_t looks = 0, writes = 0, failedWrites = 0;
			size_t lastSlots = 0;		// how many slots the last write merged in
			size_t fileBytes = 0;
		};
		MachineMemoryCost machineMemoryCost() const;
		// The saves this memory holds that the file lacks (the "MMEM" chunk of the standalone's state)
		machineMemory::Mark machineMemoryMark() const;
		// One last look now and a write when a save is not in the file yet (the instance going away, a state save)
		void flushMachineMemory(bool _closing);
		// MD: the page's sample transfer ended; the machine stores it into a ROM slot (a save, written once stored)
		void machineMemorySampleStored();
		// The watch's thread runs once a second; a test may run it faster (milliseconds between looks).
		void setMachineMemoryLookMs(int _ms);
		// The thread's one look and maybe a write (any thread but the audio thread; the thread calls it).
		void lookAtMachineMemory();
		// The Machinedrum/Monomachine Editors' setup and session (mdDeskHost.h, doc/modern-ux/UPSTREAM.md).
		class DeskHost* getDeskHost() const { return m_desk.get(); }

	    jucePluginEditorLib::PluginEditorState* createEditorState() override;
	    synthLib::Device* createDevice() override;

	    pluginLib::Controller* createController() override;
		// MIDI mapping switched off (deskHost::midiMappingEnabled): no translator, so no learn code on the MIDI threads
		bool usesMidiLearn() const override;
		void saveChunkData(baseLib::BinaryStream& _stream) override;
		void loadChunkData(baseLib::ChunkReader& _reader) override;
		bool loadCustomData(const std::vector<uint8_t>& _sourceBuffer) override;
		// No ROM: the project stays as it was (DeskHost::holdState, UPSTREAM.md); the ROM's arrival restores it.
		void getStateInformation(juce::MemoryBlock& _dest) override;
		void setStateInformation(const void* _data, int _size) override;
		void restoreHeldState();

	private:
		static BusesProperties createBusesProperties();
		bool isBusesLayoutSupported(const BusesLayout& _layout) const override;
		AudioPluginAudioProcessor(md::MachineModel _model,
			std::vector<uint8_t> _initialPatchRam, bool _ephemeralConfig,
			std::optional<std::string> _deviceHomePath = std::nullopt,
			std::optional<std::string> _memoryFolder = std::nullopt, bool _standaloneState = false);
		bool serviceDeferredStateRestore();
		bool serviceStateRestoreFailure();
		void recordStandaloneStartupDiagnostics();
		void reportProjectStateRestoreFailure(const std::string& _error);
		void timerCallback() override;
		// I-024 (mdPluginProcessor.cpp, "machine memory")
		void serviceMachineMemoryStart();
		void startMachineMemoryThread();
		void stopMachineMemoryThread();
		bool writeMachineMemory(const std::vector<machineMemory::Key>& _keys, const std::vector<uint8_t>& _base, const std::vector<uint8_t>& _patch,
			const std::vector<uint8_t>& _sectors);
		bool writeChanges(bool _withForced);
		bool lookMachineMemory(uint64_t& _signature, uint64_t& _epoch);
		bool rebaseMachineMemory(uint64_t _signature, uint64_t _epoch);
		void serviceSampleStore();
		void takeSampleSectors();
		bool copyMachineFlash(std::vector<uint8_t>& _flash);
		machineMemory::StoreFile readMemoryStore(bool& _ok, std::string& _note);
		static bool writeMemoryFile(const juce::File& _file, const std::vector<uint8_t>& _bytes, std::string& _error);
		std::string moveMemoryFileAside(std::string _text);
		void showMachineMemoryNotice(const std::string& _text);
		void factoryMemoryRefused();
		void machineMemoryWillBeReplaced();
		void machineMemoryUnusable(const std::string& _why);
		void setMachineMemoryNote(std::string _note);
		bool machineDeviceReady();

		std::unique_ptr<synthLib::PerformanceReport> m_performanceReport;
		juce::File m_performanceReportFile;
		bool m_performanceFolderError = false;
		const md::MachineModel m_model;
		const std::vector<uint8_t> m_initialPatchRam;
		const std::optional<std::string> m_deviceHomePath;
		std::mutex m_storageLoadMutex;
		uint64_t m_reportedRestoreFailureGeneration = 0;
		juce::File m_startupDiagnosticsFile;
		double m_startupDiagnosticsStartMilliseconds = 0.0;
		bool m_startupDiagnosticsEnabled = false;
		std::atomic<uint8_t> m_ramRecordingMode{
			static_cast<uint8_t>(md::RamRecordingMode::Original)};
		bool m_ramRecordingModeChunkSeen = false;
		std::atomic<double> m_hostBpm{0.0};
		BootDiagnostics m_boot;
		cpuLoad::Meter m_cpuMeter;
		cpuLoad::Smoother m_cpuSmoother;	// message thread
		outputLevel::Meter m_outputMeter;
		midiIn::Queue m_midiIn;
		uint64_t m_blockStartNs = 0;		// audio thread
		static uint64_t cpuClockNs();
		void recordBoot();
		double m_lastBootRecordMs = 0;	// when recordBoot last ran
		const double m_bootStartMs = juce::Time::getMillisecondCounterHiRes();
		std::string m_bootRom;
		// the speed-ups as last written to the log (logSpeedUps): -1 none yet; else on | levers << 1 | L3 << 31
		int64_t m_loggedSpeedUps = -1;
		std::unique_ptr<class DeskHost> m_desk;
		// I-024: machine memory. m_memoryFolder empty: off (an isolated test, or a processor no plug-in wrapper made)
		std::string m_memoryFolder;
		std::atomic<bool> m_projectStateSeen{false};	// a DAW project's state came this session (any thread)
		std::optional<machineMemory::Mark> m_loadedMark;	// the last state's "MMEM" chunk, version 2 (m_memoryMutex)
		bool m_standaloneState = false;		// the state at the start is the standalone's own: the file's slots are laid over it
		std::atomic<bool> m_ownStateSeen{false};	// the standalone's own state came
		std::atomic<uint64_t> m_memoryRomFingerprint{0};	// MD: the ROM's (the file's flash sectors belong to it)
		std::atomic<uint64_t> m_factoryRestoreGeneration{0};	// Start from factory memory's restore, 0: none
		std::atomic<bool> m_memoryStartDone{false};
		std::atomic<uint64_t> m_memoryRestoreGeneration{0};	// the device's restore generation of the file's payload, 0: none
		std::atomic<uint32_t> m_memoryVersion{1};
		std::atomic<bool> m_memorySampleStored{false};	// machineMemorySampleStored, for the thread's next look
		std::atomic<bool> m_memoryKeep{true};	// the setting, cached for the thread (the config is the message thread's)
		std::atomic<int> m_memoryLookMs{1000};
		std::atomic<bool> m_memoryWriteWarned{false};	// a failed write was said this session
		std::atomic<bool> m_memoryWriteFailed{false};	// a failed write for the timer to say
		mutable std::mutex m_memoryMutex;		// the file, the note, the watch, the cost
		std::string m_memoryNote;
		struct MemoryWatchState;
		std::unique_ptr<MemoryWatchState> m_memoryWatch;
		std::unique_ptr<class MachineMemoryThread> m_memoryThread;
		JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AudioPluginAudioProcessor)
	};
}
