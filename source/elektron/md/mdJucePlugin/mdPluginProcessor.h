#pragma once

#include "jucePluginEditorLib/pluginProcessor.h"
#include "mdBootDiagnostics.h"
#include "mdCpuLoad.h"
#include "mdLearnRouter.h"
#include "mdMidiIn.h"
#include "mdMidiMonitor.h"
#include "mdOutputLevel.h"
#include "mdMachineMemory.h"
#include "mdMachineMemoryService.h"
#include "mdMachineFacts.h"

#include <functional>
#include "mdLib/mdtypes.h"
#include "synthLib/performanceReport.h"
#include "synthLib/seqlock.h"

#include <atomic>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <mutex>
#include <vector>

namespace md
{
	class FrontPanelPublisher;
}

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
		// The machine's facts as the audio thread (or the last locked call) published them, without the device lock
		// (mdMachineFacts.h, DESIGN-audio-lock.md step 2). Any thread.
		MachineFacts machineFacts() const { return m_facts->read(); }
		// Commands for the machine's desk device (md::DeskDevice::panelSequenceCommands, panelEventCommand), queued
		// for the audio thread without the device lock (DESIGN-audio-lock.md step 3). _panelPackets: the packets of a
		// panel sequence among them. Refused (false) when it can be known now: no desk device or not a valid one, an
		// empty or too long sequence, or one that does not fit beside what the device still has queued (as the facts
		// last said). What only the audio thread can know (the queue filled meanwhile, the device replaced) is not a
		// refusal here: the plug-in counts it (synthLib::Plugin::getDroppedCommandCount).
		bool sendDeskCommands(const std::vector<synthLib::DeviceCommand>& _commands, size_t _panelPackets = 0);
		static md::MachineModel getCompiledProductModel();
		static bool hasEmbeddedProductResource(std::string_view _filename);
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
		// 0.8 (WP3): the MIDI monitor (mdMidiMonitor.h). The hooks count on the audio thread; the rest is the message
		// thread's, and takes no lock.
		void midiTraffic(MidiTraffic _where, const synthLib::SMidiEvent& _ev) override;
		// 0.8 (MIDI Learn L1, doc/midilearn/DESIGN-learn-0.8.md): the realtime router (mdLearnRouter.h). With MIDI
		// mapping on (deskHost::midiMappingEnabled) the host's MIDI goes through it: a mapped CC moves its parameter
		// and never reaches the firmware; while learning, CCs are captured for the session. Other sources are the base's.
		bool consumeMidiIn(const synthLib::SMidiEvent& _ev) override;
		LearnRouter& learnRouter() { return m_learnRouter; }
		// The router's applier: a learned CC value onto its parameter through Parameter::setValue (the realtime
		// host-automation entry). Audio thread; no lock, no allocation.
		static bool applyLearnedCc(pluginLib::Parameter& _param, const LearnTarget& _target, uint8_t _value);
		midiMonitor::Counts midiMonitorCounts();			// the counts and the drops
		void logMidiMonitor(double _nowMs);						// the 10 s log line, when due (timerCallback)
		const std::string& lastMidiLogLine() const { return m_midiLogLine; }
		std::optional<midiIn::Note> takeMidiIn() { midiIn::Note n; if(m_midiIn.tryPop(n)) return n; return {}; }
		// I-002, B-062: the notes held from outside (any channel), for the session's midiHeld message (mdMidiIn.h)
		midiIn::Notes heldMidiNotes() const { return m_midiHeld.notes(); }
		// I-002, B-062: every held note let go (a MIDI input opened, closed or switched; the HW MIDI engine on or off;
		// released by the host; bypassed: processBlockStarted). A note off that never comes cannot leave a key lit.
		void midiInputsChanged() override { m_midiHeld.clear(); }
		void releaseResources() override { m_midiHeld.clear(); }	// the base does nothing here
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
		// mdMachineMemoryService.h): the processor owns it and forwards. Message thread unless said otherwise.
		using MachineMemoryStatus = MachineMemoryService::Status;
		using MachineMemoryCost = MachineMemoryService::Cost;
		using FlushMode = MachineMemoryService::FlushMode;
		MachineMemoryStatus machineMemoryStatus() const { return m_memory.status(); }
		// Changes whenever the status may have changed (any thread): the session republishes it to the page.
		uint32_t machineMemoryVersion() const { return m_memory.version(); }
		bool keepMachineMemory() const { return m_memory.keep(); }
		void setKeepMachineMemory(bool _keep);
		// The start's decision is made (the file's slots laid over, or not needed): tests wait for it
		bool machineMemoryStarted() const { return m_memory.started(); }
		// Tests: the next restore the machine memory asks for (the start's overlay, factory memory) is refused at once
		void refuseNextMachineMemoryRestoreForTest() { m_memory.refuseNextRestoreForTest(); }
		// Tests: the machine follows the host (a plug-in in a DAW: tempo and sync are the host's, never saved)
		void setMachineMemoryFollowsHostForTest(bool _follows) { m_memory.setFollowsHostForTest(_follows); }
		// Review 1 (I-026): in a DAW, the machine follows the host's clock (the active global's TEMPO IN says EXT) or runs
		// on its own (INT): the host's clock and transport go to the machine, and the global's host bytes are left out of
		// the machine memory file, only while it follows (the session sets it from the desk's status)
		void setHostClock(bool _on);
		bool projectStateSeen() const { return m_memory.projectStateSeen(); }
		// Tests: called by the watch's thread after each piece of a look (the offset of the piece it copied)
		void setMachineMemoryLookHookForTest(std::function<void(size_t)> _hook) { m_memory.setLookHookForTest(std::move(_hook)); }
		// RESET MACHINE… > Start from factory memory: the file goes and the machine restarts from factory memory (a fresh machine's
		// state, as on a new install). The page asked the user first. False with the reason in _note.
		bool startFromFactoryMemory(std::string& _note) { return m_memory.startFromFactoryMemory(_note); }
		juce::File machineMemoryFile() const { return m_memory.file(); }
		MachineMemoryCost machineMemoryCost() const { return m_memory.cost(); }
		// The saves this memory holds that the file lacks (the "MMEM" chunk of the standalone's state)
		machineMemory::Mark machineMemoryMark() const { return m_memory.mark(); }
		void flushMachineMemory(FlushMode _mode) { m_memory.flush(_mode); }
		// MD: the page's sample transfer ended; the machine stores it into a ROM slot (a save, written once stored)
		void machineMemorySampleStored() { m_memory.sampleStored(); }
		// The watch's thread runs once a second; a test may run it faster (milliseconds between looks).
		void setMachineMemoryLookMs(int _ms) { m_memory.setLookMs(_ms); }
		// The Machinedrum/Monomachine Editors' setup and session (mdDeskHost.h, doc/modern-ux/UPSTREAM.md).
		class DeskHost* getDeskHost() const { return m_desk.get(); }

	    jucePluginEditorLib::PluginEditorState* createEditorState() override;
	    synthLib::Device* createDevice() override;

	    pluginLib::Controller* createController() override;
		// Always false: the pluginLib translator is never made (MIDI Learn is the session's and the LearnRouter's)
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

		const std::shared_ptr<synthLib::Seqlock<MachineFacts>> m_facts = std::make_shared<synthLib::Seqlock<MachineFacts>>();
		uint64_t m_startupPanelDevice = 0;	// the device m_startupPanel belongs to (recordStandaloneStartupDiagnostics)
		std::shared_ptr<md::FrontPanelPublisher> m_startupPanel;
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
		midiMonitor::Monitor m_midiMonitor;
		midiMonitor::LogPacer m_midiLogPacer;	// message thread
		std::string m_midiLogLine;				// the last line logged, message thread
		midiIn::Held m_midiHeld;
		LearnRouter m_learnRouter{&applyLearnedCc};
		uint64_t m_blockStartNs = 0;		// audio thread
		static uint64_t cpuClockNs();
		void recordBoot();
		double m_lastBootRecordMs = 0;	// when recordBoot last ran
		const double m_bootStartMs = juce::Time::getMillisecondCounterHiRes();
		std::string m_bootRom;
		bool m_stallLogged = false;	// the watchdog's stall was logged (recordBoot)
		// the speed-ups as last written to the log (logSpeedUps): -1 none yet; else on | levers << 1 | L3 << 31
		int64_t m_loggedSpeedUps = -1;
		std::unique_ptr<class DeskHost> m_desk;
		// I-024: the machine memory and its port to this machine (the port first: the service talks to it)
		std::unique_ptr<class MachineMemoryDevice> m_memoryDevice;
		MachineMemoryService m_memory;
		JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AudioPluginAudioProcessor)
	};
}
