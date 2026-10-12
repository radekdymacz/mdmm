#pragma once

#include "jucePluginEditorLib/pluginProcessor.h"
#include "mdBootDiagnostics.h"
#include "mdCpuLoad.h"
#include "mdMidiIn.h"
#include "mdOutputLevel.h"
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
			std::optional<std::string> _deviceHomePath = std::nullopt);
		bool serviceDeferredStateRestore();
		bool serviceStateRestoreFailure();
		void recordStandaloneStartupDiagnostics();
		void reportProjectStateRestoreFailure(const std::string& _error);
		void timerCallback() override;

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
		midiIn::Held m_midiHeld;
		uint64_t m_blockStartNs = 0;		// audio thread
		static uint64_t cpuClockNs();
		void recordBoot();
		double m_lastBootRecordMs = 0;	// when recordBoot last ran
		const double m_bootStartMs = juce::Time::getMillisecondCounterHiRes();
		std::string m_bootRom;
		// the speed-ups as last written to the log (logSpeedUps): -1 none yet; else on | levers << 1 | L3 << 31
		int64_t m_loggedSpeedUps = -1;
		std::unique_ptr<class DeskHost> m_desk;
		JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AudioPluginAudioProcessor)
	};
}
