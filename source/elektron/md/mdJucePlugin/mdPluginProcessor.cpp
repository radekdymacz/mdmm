#ifdef __APPLE__
#include "mdBackgroundRun.h"	// first: the JUCE plug-in headers define Component as a macro
#endif
#include "mdPluginProcessor.h"

#include <chrono>
#include <cstdlib>
#include "juceUiLib/messageBox.h"
#include "juceUiLib/messageRoute.h"
#include "mdDeskHost.h"
#include "mdDeskSession.h"
#include "deskHost/deskHost.h"
#include "mdRomInstall.h"

#include "mdController.h"
#include "mdMachineMidiOut.h"
#include "mdPluginEditorState.h"
#include "mdProcessArch.h"
#include "mdSettingsMigration.h"
#include "mdStorageImage.h"
#include "mdMachineMemory.h"

// ReSharper disable once CppUnusedIncludeDirective
#include "BinaryData.h"
#include "jucePluginLib/processorPropertiesInit.h"
#include "jucePluginLib/tools.h"

#include "mdLib/mddevice.h"
#include "mdLib/mdromloader.h"
#include "mdLib/mdstate.h"
#include "mdLib/mdmemorymap.h"
#include "mdLib/mdpanel.h"

#include "synthLib/deviceException.h"

#include "baseLib/binarystream.h"
#include "baseLib/filesystem.h"

#include "juce_audio_utils/juce_audio_utils.h"
#include "juce_audio_plugin_client/Standalone/juce_StandaloneFilterWindow.h"

#include <memory>
#include <utility>

namespace
{
	synthLib::PerformanceReport::Context panelEventDetails(const synthLib::RealtimeEvent& _event)
	{
		using Kind = synthLib::RealtimeEventKind;
		if(_event.kind == Kind::HostTransport) return {};
		const auto model = static_cast<md::MachineModel>(_event.model);
		if(_event.command >= 0x20 && _event.command <= 0x25)
		{
			std::string down, up;
			for(unsigned i = 0; i <= static_cast<unsigned>(md::PanelControl::ClassicExtended); ++i)
			{
				const auto control = static_cast<md::PanelControl>(i);
				const auto packet = md::panelPacket(model, control);
				if(!packet || packet->row != _event.command) continue;
				auto& names = (_event.argument & packet->mask) ? down : up;
				if(!names.empty()) names += '|';
				names += md::panelControlName(control);
			}
			return {{"panelKind", "row_state"}, {"buttonsDown", down}, {"buttonsUp", up}};
		}
		for(unsigned i = 0; i <= static_cast<unsigned>(md::PanelEncoder::SoundSelection); ++i)
		{
			const auto encoder = static_cast<md::PanelEncoder>(i);
			const auto command = md::panelEncoderCommand(model, encoder);
			if(command && *command == _event.command)
				return {{"panelKind", "encoder"}, {"encoder", md::panelEncoderName(encoder)},
					{"steps", std::to_string(_event.argument < 128 ? static_cast<int>(_event.argument)
						: static_cast<int>(_event.argument) - 256)}};
		}
		return {{"panelKind", "unmapped_packet"}};
	}

	#if defined(MD_JUCEPLUGIN_MONOMACHINE)
	constexpr auto g_defaultModel = md::MachineModel::Monomachine;
	#else
	constexpr auto g_defaultModel = md::MachineModel::Machinedrum;
	#endif

	// The tester switch for the step 1 speed-ups (setLegacyEmulation): true runs the code they replaced.
	constexpr auto g_legacyEmulationKey = "legacyEmulation";
	// L3's opt-in (setExactEssiTiming): true runs the Machinedrum's serial ports on exact cycle deadlines.
	constexpr auto g_exactEssiTimingKey = "exactEssiTiming";
	// The speed-ups kept off one by one (setSpeedUpLeversOff): md::SpeedUpLever bits, 0 by default.
	constexpr auto g_speedUpLeversOffKey = "speedUpLeversOff";

	const char* productName(const md::MachineModel _model)
	{
		return _model == md::MachineModel::Monomachine ? MDMM_PRODUCT_NAME_MM : MDMM_PRODUCT_NAME_MD;	// scripts/mdmm-product.env
	}

	// The data folder's parent, ~/Documents/Gearmulator Preview: upstream's vendor name, kept when the editors
	// took their own (Future Native Audio, scripts/mdmm-product.env), so the ROMs and settings stay where they are.
	constexpr auto g_dataFolderVendor = "Gearmulator Preview";

	const char* dataFolderName(const md::MachineModel _model)
	{
		return _model == md::MachineModel::Monomachine ? "Monomachine" : "Machinedrum";
	}

	juce::PropertiesFile::Options getOptions(const md::MachineModel _model,
		const bool _ephemeral)
	{
		juce::PropertiesFile::Options opts;
		const auto suffix = _model == md::MachineModel::Monomachine
			? "Monomachine" : "Machinedrum";
		opts.applicationName = _ephemeral
			? juce::String("DSP56300EmulatorMachineRackEditorIdentityTest_") + suffix
				+ "_" + juce::Uuid().toString()
			: juce::String("DSP56300Emulator") + suffix;
		opts.filenameSuffix = ".settings";
		opts.folderName = opts.applicationName;
		opts.osxLibrarySubFolder = "Application Support/" + opts.applicationName;
		opts.doNotSave = _ephemeral;
		if(_ephemeral)
			opts.millisecondsBeforeSaving = -1;
		return opts;
	}

	pluginLib::Processor::Properties makeProcessorProperties(const md::MachineModel _model)
	{
		const auto compiled = pluginLib::initProcessorProperties();
		return {
			productName(_model), g_dataFolderVendor, compiled.isSynth,
			compiled.wantsMidiInput, compiled.producesMidiOut, compiled.isMidiEffect,
			_model == md::MachineModel::Monomachine ? MDMM_AU_SUBTYPE_MM : MDMM_AU_SUBTYPE_MD,	// scripts/mdmm-product.env
			compiled.lv2Uri, compiled.binaryData, dataFolderName(_model),
			{0}, {0, 2, 4}, mdJucePlugin::editorConfigFileName(_model)
		};
	}

	// The config options, after the one-time copy of the settings the editor kept in upstream's config file
	// up to 0.3.0 into its own (mdSettingsMigration.h). Before the processor is made: it reads the file.
	juce::PropertiesFile::Options prepareConfig(const md::MachineModel _model, const bool _ephemeral)
	{
		if(!_ephemeral)
		{
			const juce::File configFolder(juce::String::fromUTF8(
				(pluginLib::Tools::getPublicDataFolder(g_dataFolderVendor, dataFolderName(_model)) + "config/").c_str()));
			const auto result = mdJucePlugin::copySettingsOnce(
				configFolder.getChildFile(mdJucePlugin::legacyConfigFileName(_model)),
				configFolder.getChildFile(mdJucePlugin::editorConfigFileName(_model)));
			if(result == mdJucePlugin::SettingsCopy::Failed)
				DBG("could not copy the editor's settings from " << mdJucePlugin::legacyConfigFileName(_model));
		}
		return getOptions(_model, _ephemeral);
	}

}

namespace mdJucePlugin
{
	// The watch's state, behind m_memoryMutex: the policy, the machine it watches (its hardware epoch: a restore or a
	// restart is a new machine, with a new base), the cost measured.
	struct AudioPluginAudioProcessor::MemoryWatchState
	{
		machineMemory::Watch watch;
		std::optional<uint64_t> epoch;		// the machine the base is of
		std::optional<uint64_t> settling;	// a new machine's first signature: the base once a look sees it again
		uint32_t settleLooks = 0;
		MachineMemoryCost cost;
		std::vector<uint8_t> patch, userFlash;	// the look's copies
	};

	// The "machine memory" thread: one look a second (lookAtMachineMemory), never on the audio thread.
	class MachineMemoryThread final : public juce::Thread
	{
	public:
		explicit MachineMemoryThread(AudioPluginAudioProcessor& _processor)
			: juce::Thread("machine memory"), m_processor(_processor) {}

		void run() override
		{
			while(!threadShouldExit())
			{
				m_processor.lookAtMachineMemory();
				wait(m_ms.load(std::memory_order_relaxed));
			}
		}

		std::atomic<int> m_ms{1000};

	private:
		AudioPluginAudioProcessor& m_processor;
	};

	void AudioPluginAudioProcessor::getStateInformation(juce::MemoryBlock& _dest)
	{
		if(!m_desk->heldState(_dest)) Processor::getStateInformation(_dest);	// no ROM: the project as it was (mdDeskHost.h)
	}

	void AudioPluginAudioProcessor::setStateInformation(const void* _data, const int _size)
	{
		if(_size > 0 && machineMemory::stateIsProject(m_standaloneState))
			m_projectStateSeen = true;	// I-024: a DAW project's memory wins over the machine memory file
		if(!m_desk->holdState(_data, _size)) Processor::setStateInformation(_data, _size);
	}

	void AudioPluginAudioProcessor::restoreHeldState()
	{
		std::vector<uint8_t> held;
		if(m_desk->takeHeldState(held)) Processor::setStateInformation(held.data(), static_cast<int>(held.size()));
	}

	void AudioPluginAudioProcessor::saveChunkData(baseLib::BinaryStream& _stream)
	{
		jucePluginEditorLib::Processor::saveChunkData(_stream);
		if(m_model == md::MachineModel::Machinedrum)
		{
			baseLib::ChunkWriter chunk(_stream, "RAMF", 1);
			_stream.write(static_cast<uint8_t>(getRamRecordingMode()));
		}
		m_desk->saveChunks(_stream);
		const auto& controller = dynamic_cast<const Controller&>(getController());
		const auto snapshot = controller.createAutomationSnapshot();
		if(!snapshot.empty())
		{
			baseLib::ChunkWriter chunk(_stream, "AUTO", 1);
			_stream.write(snapshot);
		}
	}

	void AudioPluginAudioProcessor::loadChunkData(baseLib::ChunkReader& _reader)
	{
		jucePluginEditorLib::Processor::loadChunkData(_reader);
		_reader.add("AUTO", 1, [this](baseLib::BinaryStream& _stream, uint32_t)
		{
			std::vector<uint8_t> snapshot;
			_stream.read(snapshot);
			auto& controller = dynamic_cast<Controller&>(getController());
			(void)controller.restoreAutomationSnapshot(snapshot);
		});
		m_desk->addChunkReaders(_reader);
		_reader.add("RAMF", 1, [this](baseLib::BinaryStream& _stream, uint32_t)
		{
			m_ramRecordingModeChunkSeen = true;
			const auto mode = static_cast<md::RamRecordingMode>(_stream.read<uint8_t>());
			if(mode == md::RamRecordingMode::Original
				|| mode == md::RamRecordingMode::CompleteTail)
				setRamRecordingMode(mode);
		});
	}

	bool AudioPluginAudioProcessor::loadCustomData(const std::vector<uint8_t>& _sourceBuffer)
	{
		// B-037: a state carries the whole matrix
		const machineMidiOut::RouteAfterLoad machineMidiRoute(getMidiRoutingMatrix());
		const auto previous = getRamRecordingMode();
		m_ramRecordingModeChunkSeen = false;
		m_desk->beginProjectLoad();
		const bool result = jucePluginEditorLib::Processor::loadCustomData(_sourceBuffer);
		if(!result)
		{
			setRamRecordingMode(previous);
			return false;
		}
		if(m_model == md::MachineModel::Machinedrum && !m_ramRecordingModeChunkSeen)
			setRamRecordingMode(md::RamRecordingMode::Original);
		return true;
	}

	AudioPluginAudioProcessor::AudioPluginAudioProcessor()
		: AudioPluginAudioProcessor(g_defaultModel)
	{
	}

	md::MachineModel AudioPluginAudioProcessor::getCompiledProductModel()
	{
		return g_defaultModel;
	}

	bool AudioPluginAudioProcessor::hasEmbeddedProductResource(const std::string_view _filename)
	{
		return pluginLib::Processor::findResource(
			makeProcessorProperties(g_defaultModel).binaryData, std::string(_filename)).has_value();
	}

	juce::File AudioPluginAudioProcessor::getInstalledFactoryStorageImage() const
	{
		return juce::File(juce::String::fromUTF8(getDataFolder().c_str()))
			.getChildFile("nvram").getChildFile("mm-factory-live3-be.bin");
	}

	juce::File AudioPluginAudioProcessor::getStorageRecoveryImage() const
	{
		return juce::File(juce::String::fromUTF8(getDataFolder().c_str()))
			.getChildFile("nvram").getChildFile("mm-storage-recovery.bin");
	}

	bool AudioPluginAudioProcessor::loadStorageImage(const juce::File& _source,
		juce::String& _result)
	{
		_result.clear();
		if(m_model != md::MachineModel::Monomachine)
		{
			_result = juce::String("Storage images are only supported by ") + MDMM_PRODUCT_NAME_MM;
			return false;
		}

		std::unique_lock operationLock(m_storageLoadMutex, std::try_to_lock);
		if(!operationLock.owns_lock())
		{
			_result = "Another storage image is already being loaded";
			return false;
		}

		const auto recovery = getStorageRecoveryImage();
		const auto sourceTarget = _source.isSymbolicLink()
			? _source.getLinkedTarget() : _source;
		const auto recoveryTarget = recovery.isSymbolicLink()
			? recovery.getLinkedTarget() : recovery;
		// Reading the complete source before touching recovery intentionally permits
		// selecting the recovery image itself. That operation becomes an A/B swap:
		// the saved bytes are activated and the previously live bytes become recovery.
		// A symlink to recovery has the same deliberate swap semantics. A hard link
		// remains immutable because atomic promotion replaces only recovery's name.
		const bool restoringRecovery = _source == recovery || sourceTarget == recoveryTarget;

		std::vector<uint8_t> replacementBytes;
		juce::String ioError;
		if(!storageImage::readExact(_source, replacementBytes, ioError))
		{
			_result = "Storage was not changed. " + ioError;
			return false;
		}

		std::vector<uint8_t> replacementState;
		if(!md::encodeState(replacementState, replacementBytes,
			md::MachineModel::Monomachine, synthLib::StateTypeGlobal))
		{
			_result = "Storage was not changed. The image could not be prepared";
			return false;
		}

		std::shared_ptr<const md::Device::PreparationContext> preparationContext;
		bool stateRestorePending = false;
		getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			if(auto* const device = dynamic_cast<md::Device*>(_device);
				device && device->getModel() == md::MachineModel::Monomachine)
			{
				stateRestorePending = device->isProjectStateRestorePending();
				if(!stateRestorePending)
					preparationContext = device->getPreparationContext();
			}
		});
		if(!preparationContext)
		{
			_result = stateRestorePending
				? "Storage was not changed. Finish loading the project state first"
				: "Storage was not changed. The machine is not using a local device";
			return false;
		}

		// Hardware construction is intentionally outside the Plugin lock. The live
		// machine continues processing while the replacement validates and boots.
		auto prepared = md::Device::prepareState(preparationContext, replacementState,
			synthLib::StateTypeGlobal);
		if(!prepared)
		{
			_result = "Storage was not changed. The machine rejected the image";
			return false;
		}

		// Capture the recovery point as late as possible, but perform all file I/O
		// after releasing the realtime Plugin lock.
		std::vector<uint8_t> previousBytes;
		const bool captured = getPlugin().withDeviceLocked(
			[&](synthLib::Device* const _device)
			{
				auto* const device = dynamic_cast<md::Device*>(_device);
				if(!device || device->getPreparationContext() != preparationContext
					|| device->isProjectStateRestorePending())
					return false;
				previousBytes = device->getHardware().copyPatchRam();
				return previousBytes.size() == md::g_patchRamStateSize;
			});
		if(!captured)
		{
			_result = "Storage was not changed. The machine changed while the image was preparing";
			return false;
		}

		// Always replace the recovery directory entry itself. Following a recovery
		// symlink for writes could modify an otherwise read-only source image outside
		// the product data folder, contrary to the storage selector's safety promise.
		juce::String commitError;
		const bool committed = storageImage::installRecoveryThenCommit(
			recovery, previousBytes,
			[&]
			{
				return getPlugin().withDeviceLocked(
					[&](synthLib::Device* const _device)
					{
						auto* const device = dynamic_cast<md::Device*>(_device);
						if(!device
							|| device->getPreparationContext() != preparationContext
							|| device->isProjectStateRestorePending())
						{
							commitError = "The machine changed before the final reboot.";
							return false;
						}

						// File I/O deliberately happens outside this lock. Refuse the
						// exchange if firmware or panel input changed battery-backed
						// storage in that interval; otherwise those newer bytes would
						// exist in neither the replacement nor its recovery image.
						if(device->getHardware().copyPatchRam() != previousBytes)
						{
							commitError = "Live storage was edited while the replacement was preparing; try again.";
							return false;
						}
						return device->commitPreparedState(*prepared);
					});
			}, ioError);
		if(!committed)
		{
			_result = "Storage was not changed. ";
			if(commitError.isNotEmpty())
				_result += commitError + " ";
			_result += ioError;
			return false;
		}

		// Successful commit leaves the retired Hardware in prepared. Destroy it only
		// after releasing the Plugin lock, then refresh every controller view.
		prepared.reset();
		if(hasController())
			getController().onStateLoaded();

		_result = restoringRecovery
			? "Previous storage restored; the machine rebooted. The storage that was active is now the recovery image at "
				+ recovery.getFullPathName()
			: "Storage image loaded; the machine rebooted. Previous storage was saved to "
				+ recovery.getFullPathName();
		return true;
	}

	AudioPluginAudioProcessor::AudioPluginAudioProcessor(const md::MachineModel _model)
		: AudioPluginAudioProcessor(_model, std::vector<uint8_t>{})
	{
	}

	AudioPluginAudioProcessor::AudioPluginAudioProcessor(const md::MachineModel _model,
		std::vector<uint8_t> _initialPatchRam) :
		AudioPluginAudioProcessor(_model, std::move(_initialPatchRam), false)
	{
	}

	AudioPluginAudioProcessor::AudioPluginAudioProcessor(const md::MachineModel _model,
		EphemeralConfig _config) :
		AudioPluginAudioProcessor(_model, std::vector<uint8_t>{}, true,
			std::move(_config.deviceHomePath), std::move(_config.machineMemoryFolder), _config.standaloneState)
	{
	}

	AudioPluginAudioProcessor::AudioPluginAudioProcessor(const md::MachineModel _model,
		std::vector<uint8_t> _initialPatchRam, const bool _ephemeralConfig,
		std::optional<std::string> _deviceHomePath, std::optional<std::string> _memoryFolder, const bool _standaloneState) :
		Processor(createBusesProperties(),
			prepareConfig(_model, _ephemeralConfig), makeProcessorProperties(_model),
			_ephemeralConfig
				? jucePluginEditorLib::Processor::ConfigMode::Ephemeral
				: jucePluginEditorLib::Processor::ConfigMode::Persistent)
		, m_model(_model)
		, m_initialPatchRam(std::move(_initialPatchRam))
		, m_deviceHomePath(std::move(_deviceHomePath))
	{
		if(m_model == md::MachineModel::Machinedrum)
			m_ramRecordingMode.store(
				static_cast<uint8_t>(md::RamRecordingMode::CompleteTail),
				std::memory_order_relaxed);
		// The hardware-width skins need more than the generic 100% default. Keep
		// the migration within a laptop desktop; the editor window restores this
		// configured scale after the standalone host's placeholder-size pass.
		constexpr auto scaleMigrationKey = "hardwarePanelScaleV4";
		constexpr auto readablePanelScale = 130;
		constexpr auto undersizedPanelScale = 120;
		if (!getConfig().getBoolValue(scaleMigrationKey, false))
		{
			if (!getConfig().containsKey("scale")
				|| getConfig().getDoubleValue("scale", 100) < undersizedPanelScale)
				getConfig().setValue("scale", readablePanelScale);

			getConfig().setValue(scaleMigrationKey, true);
			getConfig().saveIfNeeded();
		}

		getController();
		// B-037: the machine's own MIDI out to the host (mdMachineMidiOut.h)
		machineMidiOut::route(getMidiRoutingMatrix());
		setRamRecordingMode(getRamRecordingMode());
		const auto latencyBlocks = getConfig().getIntValue("latencyBlocks", static_cast<int>(getPlugin().getLatencyBlocks()));
		Processor::setLatencyBlocks(latencyBlocks);
		m_startupDiagnosticsEnabled = !_ephemeralConfig
			&& juce::JUCEApplicationBase::isStandaloneApp();
		if(m_startupDiagnosticsEnabled)
		{
			const auto folder = performanceDiagnosticsFolder();
			if(folder.createDirectory().wasOk())
			{
				m_startupDiagnosticsFile = folder.getChildFile("standalone-startup-last.log");
				m_startupDiagnosticsFile.deleteFile();
				m_startupDiagnosticsStartMilliseconds
					= juce::Time::getMillisecondCounterHiRes();
				m_startupDiagnosticsFile.appendText(
					"time=" + juce::Time::getCurrentTime().toISO8601(true)
					+ " model=" + productName(m_model)
					+ " revision=" + juce::String(MDMM_DIAGNOSTICS_REVISION) + "\n");
			}
			else
				m_startupDiagnosticsEnabled = false;
		}
		startTimer(250);	// B-035: the start-up log's line every second, in the plug-in too (recordBoot)
		m_desk = std::make_unique<DeskHost>(*this);
		m_desk->startSession();
		// I-024: the machine memory's folder: the test's, or the data folder's for a plug-in or the standalone (a
		// processor that no plug-in wrapper made, a test's, keeps none: it never reads or writes the person's memory)
		if(_memoryFolder)
			m_memoryFolder = *_memoryFolder;
		else if(!_ephemeralConfig && wrapperType != wrapperType_Undefined)
			m_memoryFolder = baseLib::filesystem::validatePath(getDataFolder()) + machineMemory::g_folder + "/";
		m_memoryKeep.store(getConfig().getBoolValue(machineMemory::g_keepKey, true), std::memory_order_release);
		// Radek, 2026-10-12: one memory for everything, like a real machine. The standalone's own state (JUCE's, saved when
		// it quits) does not win over the file; a DAW project's does.
		m_standaloneState = _standaloneState || wrapperType == wrapperType_Standalone;
		startMachineMemoryThread();
		m_performanceReport = std::make_unique<synthLib::PerformanceReport>(
			getPlugin().getRealtimeInstrumentation(), panelEventDetails);
		// The environment switch is also useful in hosts without an open editor.
		if(getPlugin().getRealtimeInstrumentation().isEnabled())
			setPerformanceDiagnosticsEnabled(true);
	}

	juce::AudioProcessor::BusesProperties AudioPluginAudioProcessor::createBusesProperties()
	{
		// Match the established Gearmulator bus model: plug-in hosts may enable the
		// two auxiliary stereo buses, while JUCE Standalone deliberately disables
		// non-main buses and opens the physical device as stereo. Keeping one stable
		// topology also removes wrapper-dependent construction from the processor.
		return BusesProperties()
			.withInput("Input A/B", juce::AudioChannelSet::stereo(), true)
			.withOutput("Main A/B", juce::AudioChannelSet::stereo(), true)
			.withOutput("Out C/D", juce::AudioChannelSet::stereo(), false)
			.withOutput("Out E/F", juce::AudioChannelSet::stereo(), false);
	}

	AudioPluginAudioProcessor::~AudioPluginAudioProcessor()
	{
		stopTimer();
		stopMachineMemoryThread();	// and writes a save it has not written yet
		m_performanceReport.reset();
		// The editor is a view over the session and keeps a pointer to it (PageEditor detaches on
		// destruction): the view goes first, then the desk host and its session.
		destroyEditorState();
		m_desk.reset();
	}

	juce::File AudioPluginAudioProcessor::performanceDiagnosticsFolder() const
	{
		return juce::File(getDataFolder()).getChildFile("logs");
	}

	bool AudioPluginAudioProcessor::performanceDiagnosticsActive() const
	{
		if(!m_performanceReport) return false;
		const auto status = m_performanceReport->status();
		return status == synthLib::PerformanceReport::Status::Starting
			|| status == synthLib::PerformanceReport::Status::Recording;
	}

	std::string AudioPluginAudioProcessor::performanceDiagnosticsStatus() const
	{
		if(m_performanceFolderError) return "Could not create the logs folder.";
		if(!m_performanceReport) return "Off";
		using Status = synthLib::PerformanceReport::Status;
		switch(m_performanceReport->status())
		{
		case Status::Starting: return "Starting performance capture...";
		case Status::Recording: return "Recording performance diagnostics (maximum 10 minutes / 8 MiB).";
		case Status::Stopped: return "Capture saved. Open the logs folder to share the report.";
		case Status::LimitReached: return "Capture limit reached. Report saved; recording is off.";
		case Status::Error: return "Could not write the performance report. Check free space and folder permissions.";
		case Status::Idle: return "Off";
		}
		return "Off";
	}

	void AudioPluginAudioProcessor::setPerformanceDiagnosticsEnabled(const bool _enabled)
	{
		if(!m_performanceReport) return;
		if(!_enabled) { m_performanceReport->stop(); return; }
		if(performanceDiagnosticsActive()) return;
		m_performanceFolderError = performanceDiagnosticsFolder().createDirectory().failed();
		if(m_performanceFolderError)
		{
			getPlugin().getRealtimeInstrumentation().setEnabled(false);
			return;
		}
		m_performanceReportFile = performanceDiagnosticsFolder().getChildFile(
			"performance-" + juce::Time::getCurrentTime().formatted("%Y%m%d-%H%M%S")
			+ "-" + juce::Uuid().toString() + ".jsonl");
		synthLib::PerformanceReport::Context context{
			{"product", getProductName()},
			{"version", JucePlugin_VersionString},
			{"revision", MDMM_DIAGNOSTICS_REVISION},
			{"started", juce::Time::getCurrentTime().toISO8601(true).toStdString()},
			{"host", juce::PluginHostType().getHostDescription()},
			{"format", juce::AudioProcessor::getWrapperTypeDescription(wrapperType)},
			{"os", juce::SystemStats::getOperatingSystemName().toStdString()},
			{"cpu", juce::SystemStats::getCpuModel().toStdString()},
			{"cpu_vendor", juce::SystemStats::getCpuVendor().toStdString()},
			{"logical_cpus", std::to_string(juce::SystemStats::getNumCpus())},
			{"cpu_mhz", std::to_string(juce::SystemStats::getCpuSpeedInMegahertz())},
			#if JUCE_ARM
			{"architecture", "arm"},
#else
			{"architecture", "x86"},
#endif
			{"pointer_bits", std::to_string(sizeof(void*) * 8)},
			{"resampler_modes", "0=Legacy,1=MameHq,2=MameLofi"},
			{"notes", "Nested timings are inclusive. JIT values are counts, not compilation durations. Deadline overruns are estimates, not host xrun reports. MIDI counts contain no payload."}
		};
		processArch::addSessionFields(context);	// whether the editor runs translated (Rosetta): mdProcessArch.h
		m_performanceReport->start(m_performanceReportFile.getFullPathName().toStdString(), std::move(context));
	}

	bool AudioPluginAudioProcessor::isBusesLayoutSupported(
		const BusesLayout& _layout) const
	{
		if(_layout.inputBuses.size() != 1)
			return false;
		const auto input = _layout.getMainInputChannelSet();
		if(input != juce::AudioChannelSet::disabled()
			&& input != juce::AudioChannelSet::stereo())
			return false;

		if(_layout.outputBuses.size() != 3
			|| _layout.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
			return false;

		for(int bus = 1; bus < _layout.outputBuses.size(); ++bus)
		{
			const auto channels = _layout.getChannelSet(false, bus);
			if(channels != juce::AudioChannelSet::disabled()
				&& channels != juce::AudioChannelSet::stereo())
				return false;
		}
		return true;
	}
	bool AudioPluginAudioProcessor::serviceFactoryInitialization()
	{
		if(m_model != md::MachineModel::Machinedrum)
			return false;

		enum class State { Waiting, Ready, NotNeeded };
		auto state = State::NotNeeded;
		md::Device* liveDevice = nullptr;
		uint64_t liveEpoch = 0;
		std::vector<uint8_t> originalState;
		std::string cacheFilename;
		md::FactoryFlashSnapshot factoryFlash;
		std::string cacheError;
		std::shared_ptr<const md::Device::PreparationContext> preparationContext;
		getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || device->getModel() != md::MachineModel::Machinedrum
				|| !device->isValid())
				return;
			if(device->isProjectStateRestorePending())
			{
				state = State::Waiting;
				return;
			}
			auto& hardware = device->getHardware();
			if(!hardware.isFactoryFlashInitializationExpected())
				return;
			state = hardware.isFactoryFlashReadyForReboot()
				? State::Ready : State::Waiting;
			if(state != State::Ready)
				return;

			liveDevice = device;
			liveEpoch = device->hardwareEpoch();
			preparationContext = device->getPreparationContext();
			if(hardware.isFactoryFlashCacheReady())
				(void)device->captureFactoryFlashCachePersistence(cacheFilename,
					factoryFlash, cacheError);
			if(!device->getState(originalState, synthLib::StateTypeGlobal))
				state = State::Waiting;
		});

		if(state == State::NotNeeded)
		{
			startTimer(1000);
			return false;
		}
		if(state != State::Ready || !preparationContext || !liveDevice)
		{
			startTimer(250);
			return false;
		}

		// Full-image cache encoding, filesystem promotion, and replacement
		// construction stay outside synthLib::Plugin's process/device lock.
		if(!md::Device::materializeFactoryFlashCache(factoryFlash,
			preparationContext, cacheError))
			std::fprintf(stderr, "[MD] %s\n", cacheError.c_str());
		else if(!factoryFlash.cache.empty()
			&& !md::Device::writeFactoryFlashCachePersistence(cacheFilename,
				factoryFlash.cache, cacheError))
			std::fprintf(stderr, "[MD] %s\n", cacheError.c_str());

		auto prepared = md::Device::prepareState(preparationContext, originalState,
			synthLib::StateTypeGlobal, factoryFlash);
		if(!prepared)
		{
			startTimer(2000);
			return false;
		}

		const bool committed = getPlugin().withDeviceLocked(
			[&](synthLib::Device* const _device)
			{
				auto* const device = dynamic_cast<md::Device*>(_device);
				if(device != liveDevice || !device
					|| device->hardwareEpoch() != liveEpoch)
					return false;
				std::vector<uint8_t> currentState;
				if(!device->getState(currentState, synthLib::StateTypeGlobal)
					|| currentState != originalState)
					return false;
				return device->commitPreparedState(*prepared);
			});
		// A successful commit leaves the retired Hardware here. Release it only
		// after the process/device lock has been dropped.
		prepared.reset();
		if(!committed)
		{
			startTimer(2000);
			return false;
		}
		if(hasController())
			getController().onStateLoaded();
		updateHostDisplay(juce::AudioProcessorListener::ChangeDetails()
			.withNonParameterStateChanged(true));
		std::fprintf(stderr,
			"[MD] factory flash preparation complete; rebooted in process\n");
		startTimer(1000);
		return true;
	}

	bool AudioPluginAudioProcessor::serviceDeferredStateRestore()
	{
		if(m_model != md::MachineModel::Machinedrum)
			return false;
		md::Device* liveDevice = nullptr;
		uint64_t liveEpoch = 0;
		uint64_t generation = 0;
		std::unique_ptr<md::Device::PreparedState> validated;
		getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || device->getModel() != md::MachineModel::Machinedrum)
				return;
			liveDevice = device;
			liveEpoch = device->hardwareEpoch();
			validated = device->takeFinishedDeferredState(generation);
		});
		if(!validated)
			return false;

		// A failed baseline check never touched the live Hardware. Drop only the
		// isolated candidate and leave the current machine running.
		auto prepared = md::Device::makeDeferredStateReboot(*validated);
		if(!prepared)
		{
			const std::string error =
				"The deferred project state failed validation; the live machine was not changed.";
			getPlugin().withDeviceLocked(
				[&](synthLib::Device* const _device)
				{
					auto* const device = dynamic_cast<md::Device*>(_device);
					if(device == liveDevice && device
						&& device->hardwareEpoch() == liveEpoch)
						(void)device->rejectDeferredStateRestore(generation, error);
				});
			validated.reset();
			return false;
		}

		std::string cacheFilename;
		md::FactoryFlashSnapshot factoryFlash;
		std::string cacheError;
		std::shared_ptr<const md::Device::PreparationContext> preparationContext;
		const bool committed = getPlugin().withDeviceLocked(
			[&](synthLib::Device* const _device)
			{
				auto* const device = dynamic_cast<md::Device*>(_device);
				if(device != liveDevice || !device
					|| device->hardwareEpoch() != liveEpoch
					|| device->deferredStateGeneration() != generation)
					return false;
				if(!device->commitDeferredStateRestore(*prepared, generation))
					return false;
				preparationContext = device->getPreparationContext();
				(void)device->captureFactoryFlashCachePersistence(cacheFilename,
					factoryFlash, cacheError);
				return true;
			});
		prepared.reset();
		validated.reset();
		if(!committed)
			return false;
		if(!md::Device::materializeFactoryFlashCache(factoryFlash,
			preparationContext, cacheError))
			std::fprintf(stderr, "[MD] %s\n", cacheError.c_str());
		else if(!factoryFlash.cache.empty()
			&& !md::Device::writeFactoryFlashCachePersistence(cacheFilename,
				factoryFlash.cache, cacheError))
			std::fprintf(stderr, "[MD] %s\n", cacheError.c_str());
		if(hasController())
			getController().onStateLoaded();
		updateHostDisplay(juce::AudioProcessorListener::ChangeDetails()
			.withNonParameterStateChanged(true));
		std::fprintf(stderr,
			"[MD] deferred project state validated and rebooted in process\n");
		return true;
	}

	bool AudioPluginAudioProcessor::serviceStateRestoreFailure()
	{
		uint64_t generation = 0;
		std::string error;
		getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || device->projectStateRestoreStatus()
				!= md::Device::ProjectStateRestoreStatus::Failed)
				return;
			generation = device->deferredStateGeneration();
			error = device->projectStateRestoreError();
		});
		if(error.empty() || generation == m_reportedRestoreFailureGeneration)
			return false;
		m_reportedRestoreFailureGeneration = generation;
		// I-024: the machine refused the machine memory file's payload (the Machinedrum's ROM changed, a bad state
		// in a good frame): the machine stays on factory memory, the file is moved aside, the notice says why
		if(m_memoryRestoreGeneration != 0 && generation == m_memoryRestoreGeneration)
		{
			m_memoryRestoreGeneration = 0;
			machineMemoryUnusable("The machine could not use it: " + error);
			return true;
		}
		reportProjectStateRestoreFailure(error);
		return true;
	}

	bool AudioPluginAudioProcessor::serviceProjectStateRestore()
	{
		if(serviceDeferredStateRestore())
			return true;
		return serviceStateRestoreFailure();
	}

	std::string AudioPluginAudioProcessor::getProjectStateRestoreError()
	{
		return getPlugin().withDeviceLocked([](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			return device ? device->projectStateRestoreError() : std::string{};
		});
	}

	void AudioPluginAudioProcessor::reportProjectStateRestoreFailure(
		const std::string& _error)
	{
		std::fprintf(stderr, "[MD] %s\n", _error.c_str());
		updateHostDisplay(juce::AudioProcessorListener::ChangeDetails()
			.withNonParameterStateChanged(true));
		if(getActiveEditor())
		{
			const genericUI::messageRoute::OwnerScope owner(static_cast<const void*>(this));	// this instance's window shows it
			genericUI::MessageBox::showOk(genericUI::MessageBox::Icon::Warning,	// the page shows it (messageRoute.h)
				std::string(productName(m_model)) + " state restore", _error);
		}
	}

	void AudioPluginAudioProcessor::recordStandaloneStartupDiagnostics()
	{
		if(!m_startupDiagnosticsEnabled)
			return;
		const auto elapsed = juce::Time::getMillisecondCounterHiRes()
			- m_startupDiagnosticsStartMilliseconds;
		if(elapsed > 20000.0)
		{
			m_startupDiagnosticsEnabled = false;
			return;
		}

		auto* const holder = juce::StandalonePluginHolder::getInstance();
		auto* const audioDevice = holder
			? holder->deviceManager.getCurrentAudioDevice() : nullptr;
		uint64_t cycles = 0;
		uint64_t epoch = 0;
		uint32_t pixels = 0;
		uint32_t panelBytes = 0;
		uint32_t tileWrites = 0;
		getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device)
				return;
			const auto panel = device->getHardware().getFrontPanelSnapshot();
			cycles = device->getHardware().hostCurrentCycle();
			epoch = device->hardwareEpoch();
			pixels = panel.countLitPixels();
			panelBytes = panel.getByteCount();
			tileWrites = panel.getTileWriteCount();
		});

		juce::String line;
		line << "ms=" << static_cast<int64_t>(elapsed)
			<< " device=" << static_cast<int>(audioDevice != nullptr)
			<< " playing=" << static_cast<int>(audioDevice && audioDevice->isPlaying())
			<< " cycles=" << static_cast<int64_t>(cycles)
			<< " epoch=" << static_cast<int64_t>(epoch)
			<< " pixels=" << static_cast<int64_t>(pixels)
			<< " panelBytes=" << static_cast<int64_t>(panelBytes)
			<< " tileWrites=" << static_cast<int64_t>(tileWrites)
			<< " editor=" << static_cast<int>(getActiveEditor() != nullptr) << "\n";
		m_startupDiagnosticsFile.appendText(line);
	}

	void AudioPluginAudioProcessor::processBlockStarted(const int _frames, const bool _bypassed)
	{
		if(_bypassed)
		{
			m_boot.counters.onBypassed(_frames);
			m_cpuMeter.onBypassed();
			return;
		}
		m_boot.counters.onBlock(_frames, isNonRealtime());
		m_blockStartNs = cpuClockNs();
	}

	// I-018: the block's time against its budget (mdCpuLoad.h): two clock reads and a few relaxed atomic adds
	void AudioPluginAudioProcessor::processBlockEnded(const int _frames)
	{
		// the host's rate (a host that called prepareToPlay alone sets only the plug-in's: a plain member read)
		const double rate = getSampleRate() > 0 ? getSampleRate() : static_cast<double>(getPlugin().getHostSamplerate());
		m_cpuMeter.onBlock(cpuClockNs() - m_blockStartNs, _frames, rate, isNonRealtime());
	}

	// I-021: the output meter: one pass over the enabled outputs a block, three compare-exchanges (mdOutputLevel.h)
	void AudioPluginAudioProcessor::processBlockOutput(const synthLib::TAudioOutputs& _outputs, const size_t _frames)
	{
		m_outputMeter.onBlock(_outputs, _frames);
	}

	// 0.6: a note on from outside, for the page (LEARN, I-002); SysEx and the rest pass by
	void AudioPluginAudioProcessor::midiInReceived(const synthLib::SMidiEvent& _ev)
	{
		if(!_ev.sysex.empty())
			return;
		if(const auto n = midiIn::noteOn(_ev.a, _ev.b, _ev.c))
			m_midiIn.tryPush(*n);
	}

	uint64_t AudioPluginAudioProcessor::cpuClockNs()
	{
		return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(
			std::chrono::steady_clock::now().time_since_epoch()).count());
	}

	cpuLoad::Reading AudioPluginAudioProcessor::cpuLoadReading()
	{
		return m_cpuSmoother.add(m_cpuMeter.take(), juce::Time::getMillisecondCounterHiRes());
	}

	// B-035: once a second, what the host does with the audio and how far the machine got (mdBootDiagnostics.h)
	void AudioPluginAudioProcessor::recordBoot()
	{
		BootSample s;
		s.wallMs = juce::Time::getMillisecondCounterHiRes() - m_bootStartMs;
		s.sampleRate = getSampleRate() > 0 ? getSampleRate() : getPlugin().getHostSamplerate();
		s.blockSize = m_boot.counters.blockSize.load(std::memory_order_relaxed);
		s.blocks = m_boot.counters.blocks.load(std::memory_order_relaxed);
		s.bypassed = m_boot.counters.bypassed.load(std::memory_order_relaxed);
		s.nonRealtime = m_boot.counters.nonRealtime.load(std::memory_order_relaxed);
		getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || !device->isValid())
				return;
			auto& hw = device->getHardware();
			s.cycles = hw.hostCurrentCycle();
			s.dspBooted = (hw.getDspMixer().booted() ? 1 : 0) + (hw.getDspProducer().booted() ? 1 : 0);
			s.firmwareMidiReady = hw.isFirmwareMidiReady();
			s.machine = true;
			s.speedUps = device->speedUps();
			s.leversOff = device->speedUpLeversOff();
			s.exactEssi = device->exactEssiTiming();
		});
		if(m_desk && m_desk->session())
			s.lifecycle = m_desk->session()->lifecycleName();
		if(m_bootRom.empty())
		{
			const auto roms = romsInFolder(m_model, juce::File(juce::String::fromUTF8(getPublicRomFolder().c_str())));
			m_bootRom = roms.empty() ? std::string("none") : roms.front().getFileName().toStdString();
		}
		s.rom = m_bootRom;
		m_boot.record(s);
		// I-018: the speed-ups the machine runs, logged when they differ from the last line: at start (the settings or
		// the environment), and anything that changed them without a menu action
		if(s.machine)
		{
			const auto now = static_cast<int64_t>(s.speedUps ? 1 : 0) | (static_cast<int64_t>(s.leversOff) << 1) | (static_cast<int64_t>(s.exactEssi ? 1 : 0) << 31);
			if(now != m_loggedSpeedUps)
			{
				const auto* env = std::getenv("GEARMULATOR_MDMM_SPEEDUPS");
				logSpeedUps(m_loggedSpeedUps < 0 ? (env && std::string(env) == "0" ? "start, env GEARMULATOR_MDMM_SPEEDUPS=0" : "start, settings") : "changed, not by the menu");
			}
		}
	}

	void AudioPluginAudioProcessor::timerCallback()
	{
		// B-035: a start-up line once a second by the clock, not every 4th tick: serviceFactoryInitialization sets this
		// timer to 250 ms, 1 s or 2 s (the Machinedrum's lines came every 4 s in 0.3.5). A little early still counts.
		if(const auto now = juce::Time::getMillisecondCounterHiRes(); now - m_lastBootRecordMs >= 900.0)
		{
			m_lastBootRecordMs = now;
			recordBoot();
		}
		recordStandaloneStartupDiagnostics();
		serviceMachineMemoryStart();
		// I-024: a write that failed (the thread's) is said once, on the message thread
		if(m_memoryWriteFailed.exchange(false))
		{
			const auto note = machineMemoryStatus().note;
			const genericUI::messageRoute::OwnerScope owner(static_cast<const void*>(this));
			genericUI::MessageBox::showOk(genericUI::MessageBox::Icon::Warning,
				std::string(productName(m_model)) + " machine memory", note + " Your saves stay in this session; the editor tries again at the next save.");
		}
		if(serviceProjectStateRestore())
			return;
		(void)serviceFactoryInitialization();
	}

	jucePluginEditorLib::PluginEditorState* AudioPluginAudioProcessor::createEditorState()
	{
		return new PluginEditorState(*this);
	}

	synthLib::Device* AudioPluginAudioProcessor::createDevice()
	{
		synthLib::DeviceCreateParams params;
		params.customData = md::deviceCustomData(m_model);
		params.homePath = m_deviceHomePath ? *m_deviceHomePath : getDataFolder();
		auto d = std::make_unique<md::DeskDevice>(params, m_initialPatchRam);
		if(!d->isValid())
			return makeNoRomDevice();	// no ROM is the page's to ask for, not an alert (mdDeskHost.h, UPSTREAM.md)
		d->setRamRecordingMode(getRamRecordingMode());
		if(getConfig().getBoolValue(g_legacyEmulationKey, false))
			d->setSpeedUps(false);
		// the levers off in the settings, besides any the environment turned off
		if(const auto off = static_cast<uint32_t>(getConfig().getIntValue(g_speedUpLeversOffKey, 0)) & md::g_allSpeedUpLevers)
			d->setSpeedUpLeversOff(d->speedUpLeversOff() | off);
		if(getConfig().getBoolValue(g_exactEssiTimingKey, false))
			d->setExactEssiTiming(true);
#ifdef __APPLE__
		// a background run of the journeys on a person's Mac (mdBackgroundRun.h): the standalone's audio runs as
		// ever, timing and all, but nothing reaches their speakers
		d->setSilentOutput(juce::JUCEApplicationBase::isStandaloneApp() && backgroundRun::requested());
#endif
		return d.release();
	}

	void AudioPluginAudioProcessor::setRamRecordingMode(md::RamRecordingMode _mode)
	{
		if(m_model != md::MachineModel::Machinedrum)
			_mode = md::RamRecordingMode::Original;
		m_ramRecordingMode.store(static_cast<uint8_t>(_mode), std::memory_order_relaxed);
		getPlugin().withDeviceLocked([_mode](synthLib::Device* const _device)
		{
			if(auto* const device = dynamic_cast<md::Device*>(_device))
				device->setRamRecordingMode(_mode);
		});
	}

	void AudioPluginAudioProcessor::setLegacyEmulation(const bool _legacy)
	{
		getConfig().setValue(g_legacyEmulationKey, _legacy);
		getConfig().saveIfNeeded();
		getPlugin().withDeviceLocked([_legacy](synthLib::Device* const _device)
		{
			if(auto* const device = dynamic_cast<md::Device*>(_device))
				device->setSpeedUps(!_legacy);
		});
		logSpeedUps("menu");
	}

	void AudioPluginAudioProcessor::logSpeedUps(const char* _via)
	{
		bool known = false, on = true, essi = false;
		uint32_t off = 0;
		getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			if(const auto* device = dynamic_cast<const md::Device*>(_device))
			{
				known = true;
				on = device->speedUps();
				off = device->speedUpLeversOff();
				essi = device->exactEssiTiming();
			}
		});
		std::string levers;
		for(const auto& l : md::speedUpLevers())
			if(off & md::bit(l.lever))
				levers += (levers.empty() ? "" : "+") + std::string(l.key);
		m_loggedSpeedUps = known ? (static_cast<int64_t>(on ? 1 : 0) | (static_cast<int64_t>(off) << 1) | (static_cast<int64_t>(essi ? 1 : 0) << 31)) : -1;
		const auto file = juce::File(juce::String::fromUTF8(getConfigFile().c_str()));
		m_boot.note(std::string("speed-ups: ") + (!known ? "no machine" : on ? "on" : "off") + (levers.empty() ? "" : ", levers off " + levers)
			+ (essi ? ", L3 on" : "") + " (" + _via + "), saved legacyEmulation=" + (savedLegacyEmulation() ? "1" : "0")
			+ " speedUpLeversOff=" + std::to_string(savedSpeedUpLeversOff()) + " exactEssiTiming=" + (getConfig().getBoolValue(g_exactEssiTimingKey, false) ? "1" : "0")
			+ " in " + file.getFileName().toStdString() + (file.existsAsFile() ? "" : " (no file)"));
	}

	void AudioPluginAudioProcessor::setExactEssiTiming(const bool _on)
	{
		getConfig().setValue(g_exactEssiTimingKey, _on);
		getConfig().saveIfNeeded();
		getPlugin().withDeviceLocked([_on](synthLib::Device* const _device)
		{
			if(auto* const device = dynamic_cast<md::Device*>(_device))
				device->setExactEssiTiming(_on);
		});
		logSpeedUps("menu");
	}

	bool AudioPluginAudioProcessor::isExactEssiTiming()
	{
		return getPlugin().withDeviceLocked([](synthLib::Device* const _device)
		{
			const auto* const device = dynamic_cast<const md::Device*>(_device);
			return device && device->exactEssiTiming();
		});
	}

	void AudioPluginAudioProcessor::setSpeedUpLeversOff(const uint32_t _off)
	{
		getConfig().setValue(g_speedUpLeversOffKey, static_cast<int>(_off & md::g_allSpeedUpLevers));
		getConfig().saveIfNeeded();
		getPlugin().withDeviceLocked([_off](synthLib::Device* const _device)
		{
			if(auto* const device = dynamic_cast<md::Device*>(_device))
				device->setSpeedUpLeversOff(_off);
		});
		logSpeedUps("menu");
	}

	bool AudioPluginAudioProcessor::savedLegacyEmulation()
	{
		return getConfig().getBoolValue(g_legacyEmulationKey, false);
	}

	uint32_t AudioPluginAudioProcessor::savedSpeedUpLeversOff()
	{
		return static_cast<uint32_t>(getConfig().getIntValue(g_speedUpLeversOffKey, 0)) & md::g_allSpeedUpLevers;
	}

	uint32_t AudioPluginAudioProcessor::getSpeedUpLeversOff()
	{
		return getPlugin().withDeviceLocked([](synthLib::Device* const _device) -> uint32_t
		{
			const auto* const device = dynamic_cast<const md::Device*>(_device);
			return device ? device->speedUpLeversOff() : 0u;
		});
	}

	bool AudioPluginAudioProcessor::isLegacyEmulation()
	{
		return getPlugin().withDeviceLocked([](synthLib::Device* const _device)
		{
			const auto* const device = dynamic_cast<const md::Device*>(_device);
			return device && !device->speedUps();
		});
	}

	bool AudioPluginAudioProcessor::isRamRecordingModeAvailable()
	{
		if(m_model != md::MachineModel::Machinedrum)
			return false;
		return getPlugin().withDeviceLocked([](synthLib::Device* const _device)
		{
			const auto* const device = dynamic_cast<const md::Device*>(_device);
			return device && device->supportsRamRecordingMode();
		});
	}

	// ===== I-024: machine memory (doc/modern-ux/DESIGN-machine-memory.md, mdMachineMemory.h) =====

	juce::File AudioPluginAudioProcessor::machineMemoryFile() const
	{
		if(m_memoryFolder.empty())
			return {};
		return juce::File(juce::String::fromUTF8(m_memoryFolder.c_str())).getChildFile(machineMemory::g_fileName);
	}

	void AudioPluginAudioProcessor::startMachineMemoryThread()
	{
		m_memoryWatch = std::make_unique<MemoryWatchState>();
		if(m_memoryFolder.empty())
			return;
		m_memoryThread = std::make_unique<MachineMemoryThread>(*this);
		m_memoryThread->m_ms = m_memoryLookMs.load();
		m_memoryThread->startThread(juce::Thread::Priority::low);
	}

	void AudioPluginAudioProcessor::stopMachineMemoryThread()
	{
		if(!m_memoryThread)
			return;
		m_memoryThread->signalThreadShouldExit();
		m_memoryThread->notify();
		m_memoryThread->stopThread(10000);
		m_memoryThread.reset();
		// a save seen and not yet written (the debounce's second look had not come): written now
		uint64_t epoch = 0;
		bool pending = false;
		{
			const std::lock_guard lock(m_memoryMutex);
			pending = m_memoryWatch && m_memoryWatch->watch.pending() && m_memoryWatch->epoch && keepMachineMemory();
			if(pending)
				epoch = *m_memoryWatch->epoch;
		}
		if(pending)
		{
			const std::lock_guard lock(m_memoryMutex);
			(void)writeMachineMemory(epoch);
		}
	}

	void AudioPluginAudioProcessor::setMachineMemoryLookMs(const int _ms)
	{
		m_memoryLookMs = std::max(10, _ms);
		if(m_memoryThread)
		{
			m_memoryThread->m_ms = m_memoryLookMs.load();
			m_memoryThread->notify();
		}
	}

	bool AudioPluginAudioProcessor::machineDeviceReady()
	{
		return getPlugin().withDeviceLocked([](synthLib::Device* const _device)
		{
			const auto* const device = dynamic_cast<const md::Device*>(_device);
			return device != nullptr && device->isValid();
		});
	}

	void AudioPluginAudioProcessor::setMachineMemoryNote(std::string _note)
	{
		{
			const std::lock_guard lock(m_memoryMutex);
			m_memoryNote = std::move(_note);
		}
		m_memoryVersion.fetch_add(1, std::memory_order_acq_rel);
	}

	AudioPluginAudioProcessor::MachineMemoryStatus AudioPluginAudioProcessor::machineMemoryStatus() const
	{
		MachineMemoryStatus s;
		s.keep = keepMachineMemory();
		s.available = !m_memoryFolder.empty();
		const std::lock_guard lock(m_memoryMutex);
		s.saved = s.available && machineMemoryFile().existsAsFile();
		s.note = m_memoryNote;
		return s;
	}

	AudioPluginAudioProcessor::MachineMemoryCost AudioPluginAudioProcessor::machineMemoryCost() const
	{
		const std::lock_guard lock(m_memoryMutex);
		return m_memoryWatch ? m_memoryWatch->cost : MachineMemoryCost{};
	}

	void AudioPluginAudioProcessor::setKeepMachineMemory(const bool _keep)
	{
		getConfig().setValue(machineMemory::g_keepKey, _keep);
		getConfig().saveIfNeeded();
		{
			const std::lock_guard lock(m_memoryMutex);
			m_memoryKeep.store(_keep, std::memory_order_release);
			// on again: the memory of that moment is the base (nothing is written for turning it on)
			if(m_memoryWatch)
			{
				m_memoryWatch->watch.reset();
				m_memoryWatch->epoch.reset();
				m_memoryWatch->settling.reset();
			}
		}
		m_memoryVersion.fetch_add(1, std::memory_order_acq_rel);
	}

	// A file that cannot be used: moved aside (one kept), the session goes on with factory memory, the notice says why.
	void AudioPluginAudioProcessor::machineMemoryUnusable(const std::string& _why)
	{
		std::string text = _why + " The machine starts from factory memory; your next save writes a new memory file.";
		{
			const std::lock_guard lock(m_memoryMutex);
			const auto file = machineMemoryFile();
			if(file.existsAsFile())
			{
				const auto aside = file.getSiblingFile(machineMemory::g_unusableName);
				aside.deleteFile();
				if(file.moveFileTo(aside))
					text += " The old file was kept as " + aside.getFullPathName().toStdString() + ".";
			}
		}
		setMachineMemoryNote(text);
		std::fprintf(stderr, "[MD] machine memory: %s\n", text.c_str());
		const genericUI::messageRoute::OwnerScope owner(static_cast<const void*>(this));	// this instance's window shows it
		genericUI::MessageBox::showOk(genericUI::MessageBox::Icon::Warning,	// the page shows it (messageRoute.h)
			std::string(productName(m_model)) + " machine memory", text);
	}

	// At the start of a session (the timer, message thread): a project state wins; else the file, once the machine has
	// its ROM. The file's payload is restored the way a project's is (synthLib::Plugin::setState).
	void AudioPluginAudioProcessor::serviceMachineMemoryStart()
	{
		if(m_memoryStartDone)
			return;
		const auto start = machineMemory::startOf(m_projectStateSeen, machineDeviceReady(), keepMachineMemory(),
			!m_memoryFolder.empty());
		if(start == machineMemory::Start::Wait)
			return;
		m_memoryStartDone = true;
		if(start != machineMemory::Start::File)
			return;
		const auto file = machineMemoryFile();
		if(!file.existsAsFile())
			return;
		juce::MemoryBlock raw;
		if(!file.loadFileAsData(raw))
		{
			machineMemoryUnusable("The saved machine memory could not be read (" + file.getFullPathName().toStdString() + ").");
			return;
		}
		const auto* bytes = static_cast<const uint8_t*>(raw.getData());
		const auto decoded = machineMemory::decode(std::vector<uint8_t>(bytes, bytes + raw.getSize()), m_model);
		if(decoded.problem != machineMemory::Problem::None)
		{
			machineMemoryUnusable(machineMemory::describe(decoded.problem));
			return;
		}
		bool restored = false;
		{
			const std::lock_guard lock(m_memoryMutex);	// no write while the machine changes to it
			restored = getPlugin().setState(decoded.payload);
			m_memoryRestoreGeneration = getPlugin().withDeviceLocked([](synthLib::Device* const _device)
			{
				const auto* const device = dynamic_cast<const md::Device*>(_device);
				return device ? device->deferredStateGeneration() : uint64_t{0};
			});
		}
		std::fprintf(stderr, "[MD] machine memory: started from %s (%zu bytes)%s\n", file.getFullPathName().toRawUTF8(),
			decoded.payload.size(), restored ? "" : ", refused");
		// a refusal is reported by serviceStateRestoreFailure (its generation is the file's)
		if(hasController())
			getController().onStateLoaded();
		updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withNonParameterStateChanged(true));
		m_memoryVersion.fetch_add(1, std::memory_order_acq_rel);
	}

	bool AudioPluginAudioProcessor::startFromFactoryMemory(std::string& _note)
	{
		// a fresh machine's state (its factory memory: the Monomachine's factory image when installed, the Machinedrum's
		// factory flash cache), as a new install starts
		std::unique_ptr<synthLib::Device> fresh;
		try
		{
			fresh.reset(createDevice());
		}
		catch(const std::exception& _e)
		{
			_note = std::string("The machine could not be made again: ") + _e.what();
			return false;
		}
		std::vector<uint8_t> state;
		auto* const freshMachine = dynamic_cast<md::Device*>(fresh.get());
		if(freshMachine && freshMachine->isValid())
		{
			state = {1, synthLib::StateTypeGlobal};	// synthLib::Plugin's envelope (its g_stateVersion)
			if(!freshMachine->getState(state, synthLib::StateTypeGlobal))
			{
				_note = "The factory memory could not be read.";
				return false;
			}
		}
		bool restarted = state.empty();
		{
			const std::lock_guard lock(m_memoryMutex);
			const auto file = machineMemoryFile();
			if(file != juce::File() && file.existsAsFile() && !file.deleteFile())
			{
				_note = "The machine memory file could not be deleted: " + file.getFullPathName().toStdString();
				return false;
			}
			if(!state.empty())
				restarted = getPlugin().setState(state);
			m_memoryWatch->watch.reset();
			m_memoryWatch->epoch.reset();
			m_memoryWatch->settling.reset();
			m_memoryNote.clear();
		}
		fresh.reset();
		m_memoryRestoreGeneration = 0;
		if(hasController())
			getController().onStateLoaded();
		updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withNonParameterStateChanged(true));
		m_memoryVersion.fetch_add(1, std::memory_order_acq_rel);
		std::fprintf(stderr, "[MD] machine memory: started from factory memory%s\n", restarted ? "" : " (the machine refused it)");
		_note = restarted ? "The machine starts from factory memory." : "The machine memory file is gone, but the machine did not restart.";
		return restarted;
	}

	// One look (the thread): under the plug-in's lock a copy of the memory that a save changes (the patch RAM, the
	// Monomachine's user flash, the Machinedrum's last flash write), then its hash; the watch decides on a write.
	void AudioPluginAudioProcessor::lookAtMachineMemory()
	{
		const std::lock_guard lock(m_memoryMutex);
		auto& w = *m_memoryWatch;
		if(!keepMachineMemory())
			return;
		// the buffers stay with the watch: no allocation under the lock after the first look
		auto& patch = w.patch;
		auto& userFlash = w.userFlash;
		patch.reserve(md::g_patchRamStateSize);
		if(m_model == md::MachineModel::Monomachine)
			userFlash.resize(md::g_mmUserFlashStateSize);
		uint64_t flashMark = 0, epoch = 0;
		bool ok = false;
		const auto begin = std::chrono::steady_clock::now();
		std::chrono::steady_clock::time_point held, released;
		getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			held = std::chrono::steady_clock::now();
			struct Released { std::chrono::steady_clock::time_point& at; ~Released() { at = std::chrono::steady_clock::now(); } } done{released};
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || !device->isValid() || device->isProjectStateRestorePending())
				return;
			auto& hw = device->getHardware();
			if(!hw.isFirmwareMidiReady())
				return;
			if(m_model == md::MachineModel::Machinedrum)
			{
				// the file is written only once the factory flash is known, so its flash part is sparse (no ROM bytes)
				if(!hw.factoryFlashBaseline())
					return;
				auto& uc = hw.getUC();
				flashMark = uc.flashDirty() ? uc.getCycles() - uc.flashIdleCycles() : 0;
			}
			else if(!hw.getUC().copyFlashDataRangeRealtime(userFlash.data(),
				md::memorymap::g_flashFull.offset(md::memorymap::g_mmUserFlash.begin), userFlash.size()))
				return;
			hw.copyPatchRamTo(patch);
			epoch = device->hardwareEpoch();
			ok = true;
		});
		if(!ok)
		{
			w.watch.reset();
			w.epoch.reset();
			w.settling.reset();
			w.settleLooks = 0;
			return;
		}
		auto signature = machineMemory::hash(patch.data(), machineMemory::watchedPatchBytes(m_model, patch.size()));
		signature = machineMemory::hash(userFlash.data(), userFlash.size(), signature);
		signature = machineMemory::hash(reinterpret_cast<const uint8_t*>(&flashMark), sizeof(flashMark), signature);
		const auto end = std::chrono::steady_clock::now();
		// the time the audio thread could wait: from taking the lock to releasing it (the wait for a block in progress
		// before it is this thread's, not the audio thread's)
		const auto lockMs = std::chrono::duration<double, std::milli>(released - held).count();
		w.cost.lookLockLastMs = lockMs;
		w.cost.lookLockMaxMs = std::max(w.cost.lookLockMaxMs, lockMs);
		w.cost.lookMs = std::chrono::duration<double, std::milli>(end - begin).count();
		++w.cost.looks;
		// a new machine (the start, a restore, factory memory): its memory once it holds still for a look is the base,
		// so starting or opening a project writes nothing
		if(w.epoch != epoch)
		{
			if(w.settling != signature && w.settleLooks < 5)
			{
				w.settling = signature;
				++w.settleLooks;
				return;
			}
			w.watch.base(signature);
			w.epoch = epoch;
			w.settling.reset();
			w.settleLooks = 0;
			return;
		}
		if(!w.watch.look(signature, juce::Time::getMillisecondCounterHiRes()))
			return;
		if(writeMachineMemory(epoch))
			w.watch.written(signature);
	}

	// The full state, as a DAW save takes it (Plugin::getState: captured under the lock, encoded after it, B-034),
	// framed and written to a temporary file in the folder, then renamed over the old one. Called with m_memoryMutex
	// held by the thread, or alone when the thread has stopped.
	bool AudioPluginAudioProcessor::writeMachineMemory(const uint64_t _epoch)
	{
		const auto begin = std::chrono::steady_clock::now();
		std::vector<uint8_t> state;
		// the machine the watch saw, and no restore under way (else getState gives the requested state, not memory)
		const bool same = getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			const auto* const device = dynamic_cast<const md::Device*>(_device);
			return device && device->hardwareEpoch() == _epoch && !device->isProjectStateRestorePending();
		});
		if(!same || !getPlugin().getState(state, synthLib::StateTypeGlobal) || state.size() <= 2)
			return false;
		const auto bytes = machineMemory::encode(m_model, state);
		const auto file = machineMemoryFile();
		std::string error;
		const auto folder = file.getParentDirectory().createDirectory();
		if(folder.failed())
			error = "The machine memory folder could not be made: " + folder.getErrorMessage().toStdString();
		else
		{
			juce::TemporaryFile temporary(file, juce::TemporaryFile::useHiddenFile);
			auto out = temporary.getFile().createOutputStream();
			const bool wrote = out && out->openedOk() && out->write(bytes.data(), bytes.size());
			if(out)
				out->flush();
			const bool streamOk = out && out->getStatus().wasOk();
			out.reset();
			if(!wrote || !streamOk || temporary.getFile().getSize() != static_cast<juce::int64>(bytes.size()))
				error = "The machine memory could not be written (disk full, or no permission?): " + file.getFullPathName().toStdString();
			else if(!temporary.overwriteTargetFileWithTemporary())
				error = "The machine memory file could not be replaced: " + file.getFullPathName().toStdString();
		}
		const auto ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count();
		if(m_memoryWatch)
		{
			m_memoryWatch->cost.writeMs = ms;
			if(error.empty())
			{
				++m_memoryWatch->cost.writes;
				m_memoryWatch->cost.fileBytes = bytes.size();
			}
		}
		const bool hadNote = !m_memoryNote.empty();
		m_memoryNote = error;
		if(!error.empty() && !m_memoryWriteWarned.exchange(true))
			m_memoryWriteFailed.store(true, std::memory_order_release);	// the timer's notice, once a session
		if(!error.empty() || hadNote)
			m_memoryVersion.fetch_add(1, std::memory_order_acq_rel);
		else if(m_memoryWatch && m_memoryWatch->cost.writes == 1)
			m_memoryVersion.fetch_add(1, std::memory_order_acq_rel);	// "saved" may have changed
		std::fprintf(stderr, "[MD] machine memory: %s (%zu bytes, %.2f ms)\n", error.empty() ? "written" : error.c_str(), bytes.size(), ms);
		return error.empty();
	}

	pluginLib::Controller* AudioPluginAudioProcessor::createController()
	{
		return new mdJucePlugin::Controller(*this);
	}

	bool AudioPluginAudioProcessor::usesMidiLearn() const
	{
		// The translator reads and swaps its mappings on the audio, MIDI-input and message threads without
		// synchronisation (doc/midilearn/THREADING.md); it is made only once that is redesigned and mapping is on.
		return deskHost::midiMappingEnabled;
	}
}
