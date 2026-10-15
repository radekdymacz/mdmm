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
#include "mdMachineMemoryLock.h"

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

#include <map>
#include <memory>
#include <set>
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
	// restart is a new machine, with a new base), the memory at the base and at the last look, the cost measured.
	struct AudioPluginAudioProcessor::MemoryWatchState
	{
		machineMemory::Watch watch;
		std::optional<uint64_t> epoch;		// the machine the base is of
		std::optional<uint64_t> settling;	// a new machine's first signature: the base once a look sees it again
		uint32_t settleLooks = 0;
		MachineMemoryCost cost;
		// the patch RAM (and the MM's user flash) at the base, at the last look of this machine, and the look being taken
		std::vector<uint8_t> base, patch, scratch;
		std::vector<uint8_t> baseUserFlash, userFlash, scratchUserFlash;
		// MD: the flash at the base and at the last sample store (the sample sectors; sector n at n x 64 KiB)
		std::vector<uint8_t> baseFlash, flash;
		std::set<machineMemory::Key> forced;	// written at the next look whatever changed (the standalone's own saves, a seed)
		bool rebaseNext = false;			// the next machine's memory replaces this one (a project, the file's slots, factory)
		bool clearFileOnBase = false;		// Start from factory memory: the file goes once the new machine runs
		bool lastWriteFailed = false;
		double retryAtMs = 0;				// a failed write is tried again from then (every 5 s)
		bool prevValid = false;				// scratch holds the previous look of this machine (two looks to compare)
		bool clearFilePending = false;		// Start from factory memory: the file's slots saved before it go, once its lock is had
		uint64_t factoryAtMs = 0;			// when Start from factory memory was asked for (ms since 1970)
		// MD: a sample the page sent was stored (machineMemorySampleStored): written once the flash is still
		uint64_t flashMark = 0;				// the cycle of the last flash write (0: none since the start)
		double flashChangedMs = 0;			// when that mark last moved
		std::optional<double> sampleArmedMs;	// a sample sent, its flash store not written yet
		uint64_t sampleArmMark = 0;
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

	void AudioPluginAudioProcessor::setHostClock(const bool _on)
	{
		getPlugin().setHostClock(_on);
		const bool daw = !m_standaloneState && wrapperType != wrapperType_Undefined;
		m_memoryFollowsHost = daw && _on;
	}

	void AudioPluginAudioProcessor::setStateInformation(const void* _data, const int _size)
	{
		if(_size > 0 && machineMemory::stateIsProject(m_standaloneState))
			m_projectStateSeen = true;	// I-024: a DAW project's memory wins over the machine memory file (also a late one)
		else if(_size > 0)
			m_ownStateSeen = true;		// the standalone's own state: the file's slots are laid over it
		if(_size > 0 && m_memoryWatch)
			machineMemoryWillBeReplaced();
		if(!m_desk->holdState(_data, _size)) Processor::setStateInformation(_data, _size);
	}

	void AudioPluginAudioProcessor::restoreHeldState()
	{
		std::vector<uint8_t> held;
		if(!m_desk->takeHeldState(held))
			return;
		machineMemoryWillBeReplaced();
		Processor::setStateInformation(held.data(), static_cast<int>(held.size()));
	}

	void AudioPluginAudioProcessor::saveChunkData(baseLib::BinaryStream& _stream)
	{
		// I-024: a save not yet in the machine memory file is written first; what still is not (a write failed, KEEP
		// MEMORY off) is named in the state, so the standalone's next start keeps it over the file's slots
		flushMachineMemory(FlushMode::HostSave);
		jucePluginEditorLib::Processor::saveChunkData(_stream);
		{
			const auto mark = machineMemoryMark();
			baseLib::ChunkWriter chunk(_stream, "MMEM", 2);
			_stream.write(static_cast<uint32_t>(mark.pending.size()));
			for(const auto& k : mark.pending)
			{
				_stream.write(static_cast<uint8_t>(k.kind));
				_stream.write(k.index);
			}
		}
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
		_reader.add("MMEM", 2, [this](baseLib::BinaryStream& _stream, const uint32_t _version)
		{
			// version 1 (the 0.6 previews: a whole-memory stamp) names no slots: read as a state from before I-024
			if(_version < 2)
				return;
			machineMemory::Mark mark;
			const auto n = _stream.read<uint32_t>();
			for(uint32_t i = 0; i < n && i < 100000; ++i)
			{
				machineMemory::Key k;
				k.kind = static_cast<machineMemory::Kind>(_stream.read<uint8_t>());
				k.index = _stream.read<uint32_t>();
				if(machineMemory::sizeOf(m_model, k))
					mark.pending.push_back(k);
			}
			const std::lock_guard lock(m_memoryMutex);
			m_loadedMark = std::move(mark);
		});
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
		{
			const std::lock_guard lock(m_memoryMutex);
			m_loadedMark.reset();	// a state from before I-024 knows nothing of the file
		}
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
		// I-024: a storage image is the machine's battery memory replaced, as on the real machine: the watch keeps its
		// base across this restart, so its slots that differ are saves (written as a save is)
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
		// B-121: the Monomachine holds notes (and arpeggiates them): the host's Stop lets them go too
		getPlugin().setNotesOffOnHostStop(m_model == md::MachineModel::Monomachine);
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
		// a plug-in in a DAW: the machine follows the host's tempo and transport (mdDeskSession.h, followHost)
		m_memoryFollowsHost = !m_standaloneState && wrapperType != wrapperType_Undefined;
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
		{
			// a refused restore changed nothing: the memory there is still the base
			const std::lock_guard lock(m_memoryMutex);
			if(m_memoryWatch)
				m_memoryWatch->rebaseNext = false;
		}
		if(m_memoryRestoreGeneration != 0 && generation == m_memoryRestoreGeneration)
		{
			m_memoryRestoreGeneration = 0;
			machineMemoryUnusable("The machine could not use it: " + error);
			return true;
		}
		if(m_factoryRestoreGeneration != 0 && generation == m_factoryRestoreGeneration)
		{
			m_factoryRestoreGeneration = 0;
			factoryMemoryRefused();
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
			m_midiHeld.clear();	// I-002: a bypassed plug-in hears no note off
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

	// 0.6: a note on from outside, for the page (LEARN, I-002), and the notes held (the lit keys); SysEx and the rest
	// pass by
	void AudioPluginAudioProcessor::midiInReceived(const synthLib::SMidiEvent& _ev)
	{
		if(!_ev.sysex.empty())
			return;
		// HW MIDI: what comes in is (also) the real machine's own MIDI OUT, never a key held by a player
		if(!getExternalMidi().isOn())
			m_midiHeld.onMidi(_ev.a, _ev.b, _ev.c);
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
				std::string(productName(m_model)) + " machine memory", note + " Your saves stay in this session; the editor tries again every few seconds and when it closes.");
		}
		if(m_memoryNoticePending.exchange(false))
			showMachineMemoryNotice(machineMemoryStatus().note);
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
	// The file is a store of saved slots: a save writes only the slots it changed (read, merge, write), a session with
	// no project state lays the file's slots over the memory it starts with.

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

	// The thread is told to stop and waited for (never killed: it may hold the file or the plug-in's lock), then one last
	// look writes a save it has not written yet.
	void AudioPluginAudioProcessor::stopMachineMemoryThread()
	{
		if(!m_memoryThread)
			return;
		m_memoryThread->signalThreadShouldExit();
		m_memoryThread->notify();
		(void)m_memoryThread->waitForThreadToExit(-1);
		m_memoryThread.reset();
		flushMachineMemory(FlushMode::Close);
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

	// A machine whose memory can be read and restored: valid, booted, no restore under way, and (MD) its factory flash known,
	// so its flash is the user's samples over the factory's
	bool AudioPluginAudioProcessor::machineDeviceReady()
	{
		return getPlugin().withDeviceLocked([this](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || !device->isValid() || device->isProjectStateRestorePending())
				return false;
			auto& hw = device->getHardware();
			// the firmware has booted: a first start's memory is formatted by then (before, the patch RAM is not yet the
			// factory memory the slots are laid over, and the firmware would format it again)
			if(!hw.isFirmwareMidiReady())
				return false;
			if(m_model == md::MachineModel::Machinedrum)
				return hw.factoryFlashBaseline() != nullptr && !hw.isFactoryFlashInitializationExpected();
			return true;
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

	// The saves this memory holds that the file lacks (the last look against the base, and what is still forced)
	machineMemory::Mark AudioPluginAudioProcessor::machineMemoryMark() const
	{
		const std::lock_guard lock(m_memoryMutex);
		machineMemory::Mark mark;
		if(!m_memoryWatch || !m_memoryWatch->watch.based())
			return mark;
		auto& w = *m_memoryWatch;
		std::set<machineMemory::Key> keys(w.forced.begin(), w.forced.end());
		for(const auto& k : machineMemory::changedSlots(m_model, w.base, w.patch))
			keys.insert(k);
		if(m_model == md::MachineModel::Monomachine)
			for(const auto& k : machineMemory::changedSectors(m_model, w.baseUserFlash, w.userFlash))
				keys.insert(k);
		mark.pending.assign(keys.begin(), keys.end());
		return mark;
	}

	void AudioPluginAudioProcessor::setKeepMachineMemory(const bool _keep)
	{
		getConfig().setValue(machineMemory::g_keepKey, _keep);
		getConfig().saveIfNeeded();
		{
			const std::lock_guard lock(m_memoryMutex);
			m_memoryKeep.store(_keep, std::memory_order_release);
			// on again: the saves made while it was off (the watch kept its base) are merged into the file at once
			if(_keep && m_memoryWatch)
				m_memoryWatch->watch.writeSoon();
		}
		if(m_memoryThread)
			m_memoryThread->notify();
		m_memoryVersion.fetch_add(1, std::memory_order_acq_rel);
	}

	// The machine refused the file's slots (a restore that failed): the file stays as it is (its slots are fine for a
	// later session: a refusal is this machine's), the session goes on with the memory it has, the notice says why.
	void AudioPluginAudioProcessor::machineMemoryUnusable(const std::string& _why)
	{
		const std::string text = _why + " The saved machine memory was kept as it is; this session goes on without it.";
		setMachineMemoryNote(text);
		std::fprintf(stderr, "[MD] machine memory: %s\n", text.c_str());
		showMachineMemoryNotice(text);
	}

	// A file the editor may replace (damaged, not ours, the previews' version 1): renamed to
	// machine-memory.unusable-<date-time>.bin beside it (never deleted, never over another), with the file lock held.
	std::string AudioPluginAudioProcessor::moveMemoryFileAside(std::string _text)
	{
		const auto file = machineMemoryFile();
		if(file.existsAsFile())
		{
			const auto stamp = juce::Time::getCurrentTime().formatted("%Y%m%d-%H%M%S");
			const auto aside = file.getParentDirectory().getChildFile(juce::String(machineMemory::g_unusableName) + "-" + stamp + ".bin")
				.getNonexistentSibling(false);
			if(file.moveFileTo(aside))
				_text += " The old file was kept as " + aside.getFullPathName().toStdString() + ".";
		}
		return _text;
	}

	void AudioPluginAudioProcessor::showMachineMemoryNotice(const std::string& _text)
	{
		const genericUI::messageRoute::OwnerScope owner(static_cast<const void*>(this));	// this instance's window shows it
		genericUI::MessageBox::showOk(genericUI::MessageBox::Icon::Warning,	// the page shows it (messageRoute.h)
			std::string(productName(m_model)) + " machine memory", _text);
	}

	// The file's saved slots (m_memoryMutex held). An unusable file is moved aside (the note says why) and counts as
	// none, so the next save starts a new one; a file that cannot be read stays and the write is refused (_ok false).
	machineMemory::StoreFile AudioPluginAudioProcessor::readMemoryStore(bool& _ok, std::string& _note)
	{
		_ok = true;
		const auto file = machineMemoryFile();
		if(!file.existsAsFile())
			return {};
		juce::MemoryBlock raw;
		if(!file.loadFileAsData(raw))
		{
			_ok = false;
			_note = "The saved machine memory could not be read (" + file.getFullPathName().toStdString() + ").";
			return {};
		}
		const auto* bytes = static_cast<const uint8_t*>(raw.getData());
		auto decoded = machineMemory::decode(std::vector<uint8_t>(bytes, bytes + raw.getSize()), m_model);
		if(decoded.problem == machineMemory::Problem::None)
			return std::move(decoded.file);
		if(!machineMemory::replaceable(decoded))
		{
			// a newer editor's file, another layout, the other machine's: never written over
			_ok = false;
			_note = machineMemory::describe(decoded.problem) + " It is kept as it is and nothing is saved over it; move "
				+ file.getFullPathName().toStdString() + " away (or use that editor) to keep saving here.";
			return {};
		}
		_note = moveMemoryFileAside(machineMemory::describe(decoded.problem) + " Its saves are not used; the next save starts a new memory file.");
		return {};
	}

	// The whole store written to a temporary file in the folder, flushed to the disk (FileOutputStream::flush: fsync on
	// POSIX, FlushFileBuffers on Windows) and renamed over the old one: a crash leaves the old file or the new one.
	bool AudioPluginAudioProcessor::writeMemoryFile(const juce::File& _file, const std::vector<uint8_t>& _bytes, std::string& _error)
	{
		const auto folder = _file.getParentDirectory().createDirectory();
		if(folder.failed())
		{
			_error = "The machine memory folder could not be made: " + folder.getErrorMessage().toStdString();
			return false;
		}
		juce::TemporaryFile temporary(_file, juce::TemporaryFile::useHiddenFile);
		auto out = temporary.getFile().createOutputStream();
		const bool wrote = out && out->openedOk() && out->write(_bytes.data(), _bytes.size());
		if(out)
			out->flush();
		const bool streamOk = out && out->getStatus().wasOk();
		out.reset();
		if(!wrote || !streamOk || temporary.getFile().getSize() != static_cast<juce::int64>(_bytes.size()))
		{
			_error = "The machine memory could not be written (disk full, or no permission?): " + _file.getFullPathName().toStdString();
			return false;
		}
		if(!temporary.overwriteTargetFileWithTemporary())
		{
			_error = "The machine memory file could not be replaced: " + _file.getFullPathName().toStdString();
			return false;
		}
		return true;
	}

	// A save (m_memoryMutex held): the file read, the slots _keys merged in from _patch and _sectors, written back.
	bool AudioPluginAudioProcessor::writeMachineMemory(const std::vector<machineMemory::Key>& _keys, const std::vector<uint8_t>& _base,
		const std::vector<uint8_t>& _patch, const std::vector<uint8_t>& _sectors)
	{
		const auto begin = std::chrono::steady_clock::now();
		auto& w = *m_memoryWatch;
		bool readOk = true;
		std::string error;
		const machineMemory::FileLock fileLock(machineMemoryFile());	// read, merge and rename: one at a time
		if(!fileLock.held())
		{
			readOk = false;
			error = "The machine memory file is busy (another editor holds it); the save is tried again.";
		}
		auto store = readOk ? readMemoryStore(readOk, error) : machineMemory::StoreFile{};
		const bool clearing = readOk && w.clearFilePending;
		if(clearing)
		{
			// Start from factory memory not done yet: its clear goes first, in this same hold of the lock (the slots
			// saved before it go; a newer save another editor made stays)
			machineMemory::dropSavedBefore(store, w.factoryAtMs);
		}
		std::vector<uint8_t> bytes;
		if(readOk)
		{
			const bool hasSector = std::any_of(_keys.begin(), _keys.end(), [](const machineMemory::Key& _k) { return _k.kind == machineMemory::Kind::Sector; });
			if(hasSector && m_model == md::MachineModel::Machinedrum && store.romFingerprint != m_memoryRomFingerprint)
			{
				// the file's samples belong to another ROM: they are kept in a file of their own before this ROM's go in
				machineMemory::StoreFile other;
				other.romFingerprint = store.romFingerprint;
				for(auto it = store.slots.begin(); it != store.slots.end();)
				{
					if(it->first.kind != machineMemory::Kind::Sector) { ++it; continue; }
					other.slots.insert(*it);
					it = store.slots.erase(it);
				}
				if(!other.slots.empty())
				{
					const auto keep = machineMemoryFile().getSiblingFile(juce::String("machine-memory.samples-")
						+ juce::String::toHexString(static_cast<juce::int64>(other.romFingerprint)) + ".bin").getNonexistentSibling(false);
					std::string keepError;
					if(writeMemoryFile(keep, machineMemory::encode(m_model, other), keepError))
					{
						m_memoryNote = "The samples saved with another ROM were kept in " + keep.getFullPathName().toStdString() + ".";
						m_memoryNoticePending.store(true, std::memory_order_release);	// the timer shows it (message thread)
					}
					else
					{
						readOk = false;
						error = keepError + " (the samples saved with another ROM could not be kept, so none were replaced)";
					}
				}
				store.romFingerprint = m_memoryRomFingerprint;
			}
		}
		if(readOk)
		{
			machineMemory::mergeSaved(store.slots, m_model, _keys, _base, _patch, _sectors, static_cast<uint64_t>(juce::Time::currentTimeMillis()),
				m_memoryFollowsHost.load());
			bytes = machineMemory::encode(m_model, store);
			if(writeMemoryFile(machineMemoryFile(), bytes, error))
				error.clear();
			else if(error.empty())
				error = "The machine memory could not be written.";
		}
		const auto ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count();
		w.cost.writeMs = ms;
		const bool ok = readOk && error.empty();
		if(ok)
		{
			if(clearing)
				w.clearFilePending = false;
			++w.cost.writes;
			w.cost.fileBytes = bytes.size();
			w.cost.lastSlots = _keys.size();
		}
		else
			++w.cost.failedWrites;
		w.lastWriteFailed = !ok;
		const bool hadNote = !m_memoryNote.empty();
		if(!ok)
			m_memoryNote = error;
		else if(m_memoryNote.find("another ROM were kept") == std::string::npos)
			m_memoryNote.clear();
		if(!ok && !m_memoryWriteWarned.exchange(true))
			m_memoryWriteFailed.store(true, std::memory_order_release);	// the timer's notice, once a session
		if(!ok || hadNote || w.cost.writes == 1)
			m_memoryVersion.fetch_add(1, std::memory_order_acq_rel);
		std::string names;
		for(size_t i = 0; i < _keys.size() && i < 6; ++i)
			names += (i ? ", " : "") + machineMemory::describe(_keys[i]);
		if(_keys.size() > 6)
			names += ", ...";
		std::fprintf(stderr, "[MD] machine memory: %s (%zu slots: %s; %zu bytes, %.2f ms)\n", ok ? "written" : error.c_str(), _keys.size(),
			names.c_str(), bytes.size(), ms);
		return ok;
	}

	// The slots that changed since the base (and the forced ones) merged into the file; the base takes them on (m_memoryMutex
	// held, w.patch the last look). A failed write leaves the base, so they stay pending: tried again with the next
	// The slots that changed since the base (and the forced ones) merged into the file; the base takes them on (m_memoryMutex
	// held, w.patch the last look). _consistent: w.patch was read whole (one hold of the plug-in's lock); else only a slot
	// whose bytes were the same in the last two looks is written (a look taken in pieces can see a save half done), the
	// others are held back for the next look. A failed write leaves the base, so its slots stay pending: tried again
	// 5 s later (w.retryAtMs), with the next save and when the instance closes.
	AudioPluginAudioProcessor::WriteResult AudioPluginAudioProcessor::writeChanges(const bool _withForced, const bool _consistent)
	{
		auto& w = *m_memoryWatch;
		const bool mm = m_model == md::MachineModel::Monomachine;
		const bool host = m_memoryFollowsHost.load();
		std::set<machineMemory::Key> keys;
		if(_withForced)
			keys.insert(w.forced.begin(), w.forced.end());
		for(const auto& k : machineMemory::changedSlots(m_model, w.base, w.patch, host))
			keys.insert(k);
		if(mm)
			for(const auto& k : machineMemory::changedSectors(m_model, w.baseUserFlash, w.userFlash))
				keys.insert(k);
		if(keys.empty())
			return WriteResult::Done;
		// MD sample sectors: copied twice now (or once in one hold), only sectors the same in both are taken
		const bool mdSectors = !mm && std::any_of(keys.begin(), keys.end(), [](const machineMemory::Key& _k) { return _k.kind == machineMemory::Kind::Sector; });
		std::vector<uint8_t> flashAgain;
		bool flashOk = true;
		if(mdSectors)
			flashOk = copyMachineFlash(w.flash, _consistent) && (_consistent || copyMachineFlash(flashAgain, false));
		std::vector<machineMemory::Key> list;
		bool heldBack = false;
		for(const auto& k : keys)
		{
			bool whole = _consistent;
			if(k.kind == machineMemory::Kind::Sector && !mm)
			{
				const size_t at = size_t{k.index} * machineMemory::g_sectorSize;
				whole = flashOk && (_consistent || (flashAgain.size() >= at + machineMemory::g_sectorSize
					&& std::memcmp(w.flash.data() + at, flashAgain.data() + at, machineMemory::g_sectorSize) == 0));
			}
			else if(!whole && w.prevValid)
			{
				if(k.kind != machineMemory::Kind::Sector)
					whole = machineMemory::slotSame(m_model, k, w.patch, w.scratch, host);
				else
				{
					const size_t at = size_t{k.index} * machineMemory::g_sectorSize;
					whole = w.scratchUserFlash.size() >= at + machineMemory::g_sectorSize
						&& std::memcmp(w.userFlash.data() + at, w.scratchUserFlash.data() + at, machineMemory::g_sectorSize) == 0;
				}
			}
			if(whole)
				list.push_back(k);
			else
				heldBack = true;
		}
		if(list.empty())
			return WriteResult::HeldBack;
		const auto& sectors = mm ? w.userFlash : w.flash;
		// (while the machine follows the host, mergeSaved keeps the host bytes as the file has them)
		if(!writeMachineMemory(list, w.base, w.patch, sectors))
		{
			w.retryAtMs = juce::Time::getMillisecondCounterHiRes() + 5000.0;
			return WriteResult::Failed;
		}
		for(const auto& k : list)
		{
			if(k.kind == machineMemory::Kind::Sector)
			{
				auto& base = mm ? w.baseUserFlash : w.baseFlash;
				const size_t at = size_t{k.index} * machineMemory::g_sectorSize;
				if(base.size() >= at + machineMemory::g_sectorSize && sectors.size() >= at + machineMemory::g_sectorSize)
					std::copy_n(sectors.begin() + static_cast<std::ptrdiff_t>(at), machineMemory::g_sectorSize, base.begin() + static_cast<std::ptrdiff_t>(at));
			}
			else if(const auto* slot = machineMemory::findSlot(m_model, k))
				machineMemory::putSlot(*slot, w.base, machineMemory::slotBytes(*slot, w.patch));
			w.forced.erase(k);
		}
		return heldBack ? WriteResult::HeldBack : WriteResult::Done;
	}

	// At the start of a session (the timer, message thread), once the machine runs with its ROM: a DAW project's state
	// wins; else the file's saved slots are laid over the memory the session starts with (factory memory, or the
	// standalone's own state), restored the way a project is.
	void AudioPluginAudioProcessor::serviceMachineMemoryStart()
	{
		if(m_memoryStartDone)
			return;
		machineMemory::StartFacts facts;
		facts.projectState = m_projectStateSeen.load();
		facts.keep = keepMachineMemory();
		facts.folder = !m_memoryFolder.empty();
		facts.machineReady = !facts.projectState && facts.keep && facts.folder && machineDeviceReady();
		const auto start = machineMemory::startOf(facts);
		if(start == machineMemory::Start::Wait)
			return;
		m_memoryStartDone = true;
		if(start != machineMemory::Start::Overlay)
			return;

		// the memory the session starts with, and (MD) what its flash is made of
		std::vector<uint8_t> patch, sectors, factory, rom;
		const bool mm = m_model == md::MachineModel::Monomachine;
		const bool captured = getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || !device->isValid() || device->isProjectStateRestorePending())
				return false;
			auto& hw = device->getHardware();
			patch = hw.copyPatchRam();
			if(mm)
				sectors = hw.copyUserFlash();
			else
			{
				sectors = hw.copyFlashData();
				rom = hw.flashBaseline();
				if(!hw.copyFactoryFlashBaseline(factory))
					return false;
			}
			return patch.size() == md::g_patchRamStateSize;
		});
		if(!captured)
		{
			m_memoryStartDone = false;	// the machine is changing: the next tick tries again
			return;
		}
		if(!mm)
			m_memoryRomFingerprint = machineMemory::hash(rom.data(), rom.size());

		std::string note;
		machineMemory::StoreFile store;
		std::optional<machineMemory::Mark> mark;
		{
			const std::lock_guard lock(m_memoryMutex);
			bool readOk = true;
			const machineMemory::FileLock fileLock(machineMemoryFile(), 2000);
			if(!fileLock.held())
			{
				m_memoryStartDone = false;	// another editor holds the file: the next tick tries again
				return;
			}
			store = readMemoryStore(readOk, note);
			if(m_standaloneState)
				mark = m_loadedMark;
		}
		if(!mm && store.romFingerprint != 0 && store.romFingerprint != m_memoryRomFingerprint)
		{
			// the samples were saved with another ROM: its sectors are not laid over this one's flash
			for(auto it = store.slots.begin(); it != store.slots.end();)
				it = it->first.kind == machineMemory::Kind::Sector ? store.slots.erase(it) : std::next(it);
			note += std::string(note.empty() ? "" : " ") + "The saved samples belong to another ROM; they are not used.";
		}

		// the standalone's own saves the file lacks win over its slots and are written now
		std::set<machineMemory::Key> skip, forced;
		if(mark)
			skip.insert(mark->pending.begin(), mark->pending.end());
		forced = skip;
		const bool oldOwnState = m_standaloneState && m_ownStateSeen && !mark;
		if(oldOwnState)
		{
			// a standalone state from before I-024 (or the 0.6 previews): its slots that the file has too and differ are
			// replaced by the file's (the file was written later, by this editor) but kept aside first; every slot the
			// file lacks is seeded into it from the state
			const auto clash = machineMemory::conflicts(store.slots, m_model, patch, sectors);
			if(!clash.empty())
			{
				machineMemory::StoreFile kept;
				kept.romFingerprint = mm ? uint64_t{0} : m_memoryRomFingerprint.load();
				machineMemory::merge(kept.slots, m_model, clash, patch, sectors, static_cast<uint64_t>(juce::Time::currentTimeMillis()));
				const auto keptFile = machineMemoryFile().getSiblingFile(machineMemory::g_keptName);
				std::string error;
				if(writeMemoryFile(keptFile, machineMemory::encode(m_model, kept), error))
					note += std::string(note.empty() ? "" : " ") + "The standalone's own " + std::to_string(clash.size())
						+ " slots that differ from the saved machine memory were replaced by the saved ones and kept in " + keptFile.getFullPathName().toStdString() + ".";
				else
					note += std::string(note.empty() ? "" : " ") + error;
			}
			for(const auto& s : machineMemory::patchSlots(m_model))
				if(!store.slots.count(s.key))
					forced.insert(s.key);
			const uint32_t first = mm ? 0 : machineMemory::g_mdFirstSector, last = mm ? machineMemory::g_mmSectors : machineMemory::g_mdSectors;
			for(uint32_t i = first; i < last; ++i)
			{
				const machineMemory::Key k{machineMemory::Kind::Sector, i};
				const size_t at = size_t{i} * machineMemory::g_sectorSize;
				// MD: only the sectors the user's samples changed (not the factory's)
				const bool user = mm || (factory.size() >= at + machineMemory::g_sectorSize
					&& std::memcmp(factory.data() + at, sectors.data() + at, machineMemory::g_sectorSize) != 0);
				if(user && !store.slots.count(k))
					forced.insert(k);
			}
		}

		const bool changed = machineMemory::overlay(store.slots, m_model, patch, &sectors, skip);
		{
			const std::lock_guard lock(m_memoryMutex);
			m_memoryWatch->forced = forced;
			if(!forced.empty())
				m_memoryWatch->watch.writeSoon();
		}
		if(!note.empty())
		{
			setMachineMemoryNote(note);
			showMachineMemoryNotice(note);
		}
		if(!changed)
		{
			std::fprintf(stderr, "[MD] machine memory: %zu saved slots, the memory already holds them\n", store.slots.size());
			return;
		}
		std::vector<uint8_t> state{synthLib::g_stateVersion, synthLib::StateTypeGlobal};
		const bool encoded = mm ? md::encodeState(state, patch, m_model, synthLib::StateTypeGlobal, sectors)
			: md::encodeStateWithFactoryBaseline(state, patch, sectors, factory, rom, m_model, synthLib::StateTypeGlobal);
		if(!encoded)
		{
			machineMemoryUnusable("The saved machine memory could not be laid over the memory.");
			return;
		}
		bool restored = false, began = false;
		machineMemoryWillBeReplaced();
		{
			const std::lock_guard lock(m_memoryMutex);	// no write while the machine changes to it
			const auto generation = [this]
			{
				return getPlugin().withDeviceLocked([](synthLib::Device* const _device)
				{
					const auto* const device = dynamic_cast<const md::Device*>(_device);
					return device ? device->deferredStateGeneration() : uint64_t{0};
				});
			};
			const auto before = generation();
			restored = !m_refuseNextRestoreForTest.exchange(false) && getPlugin().setState(state);
			const auto after = generation();
			// a refusal is reported by serviceStateRestoreFailure, by this generation (only when the restore began one)
			m_memoryRestoreGeneration = after != before ? after : 0;
			began = after != before;
			// refused at once: the memory there stays the base (a pending save is never taken into a new base)
			if(!restored)
				m_memoryWatch->rebaseNext = false;
		}
		if(!restored && !began)	// (a restore that began and failed is reported by serviceStateRestoreFailure)
			machineMemoryUnusable("The machine did not take the saved machine memory.");
		std::fprintf(stderr, "[MD] machine memory: %zu saved slots laid over the memory%s\n", store.slots.size(), restored ? "" : ", refused");
		if(hasController())
			getController().onStateLoaded();
		updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withNonParameterStateChanged(true));
	}

	// RESET MACHINE… > Start from factory memory: a fresh machine's state; the file goes only once the machine runs on
	// it (the thread's next base), so a machine that refuses it leaves the file as it was.
	bool AudioPluginAudioProcessor::startFromFactoryMemory(std::string& _note)
	{
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
		auto* const freshMachine = dynamic_cast<md::Device*>(fresh.get());
		if(!freshMachine || !freshMachine->isValid())
		{
			_note = "The machine needs its ROM to start from factory memory. Nothing was changed.";
			return false;
		}
		std::vector<uint8_t> state{synthLib::g_stateVersion, synthLib::StateTypeGlobal};
		if(!freshMachine->getState(state, synthLib::StateTypeGlobal))
		{
			_note = "The factory memory could not be read. Nothing was changed.";
			return false;
		}
		machineMemoryWillBeReplaced();
		{
			const std::lock_guard lock(m_memoryMutex);
			m_memoryWatch->factoryAtMs = static_cast<uint64_t>(juce::Time::currentTimeMillis());
			const auto generation = [this]
			{
				return getPlugin().withDeviceLocked([](synthLib::Device* const _device)
				{
					const auto* const device = dynamic_cast<const md::Device*>(_device);
					return device ? device->deferredStateGeneration() : uint64_t{0};
				});
			};
			const auto before = generation();
			if(m_refuseNextRestoreForTest.exchange(false) || !getPlugin().setState(state))
			{
				m_memoryWatch->rebaseNext = false;
				_note = "The machine did not take the factory memory. Nothing was changed.";
				return false;
			}
			const auto after = generation();
			m_factoryRestoreGeneration = after != before ? after : 0;
			// the saves made before it are written first (the new machine's first look), then the file goes
			m_memoryWatch->clearFileOnBase = true;
			m_memoryWatch->forced.clear();
			m_memoryNote.clear();
		}
		fresh.reset();
		m_memoryRestoreGeneration = 0;
		if(m_memoryThread)
			m_memoryThread->notify();
		if(hasController())
			getController().onStateLoaded();
		updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withNonParameterStateChanged(true));
		m_memoryVersion.fetch_add(1, std::memory_order_acq_rel);
		std::fprintf(stderr, "[MD] machine memory: starting from factory memory\n");
		_note = "The machine starts from factory memory.";
		return true;
	}

	// The machine refused the factory state (serviceStateRestoreFailure): the file stays.
	void AudioPluginAudioProcessor::factoryMemoryRefused()
	{
		{
			const std::lock_guard lock(m_memoryMutex);
			m_memoryWatch->clearFileOnBase = false;
			m_memoryWatch->rebaseNext = false;
		}
		setMachineMemoryNote("The machine did not take the factory memory; the saved machine memory was kept.");
	}

	// MD (any thread but the audio thread): the flash's sample sectors copied, one 64 KiB sector at a time under the
	// plug-in's lock (released between), every one checked to be of the same machine
	bool AudioPluginAudioProcessor::copyMachineFlash(std::vector<uint8_t>& _flash, const bool _atomic)
	{
		_flash.resize(md::g_romSize);
		double holdMax = 0;
		struct Measure
		{
			AudioPluginAudioProcessor& p; double& max;
			~Measure() { if(p.m_memoryWatch) { p.m_memoryWatch->cost.flashHoldLastMs = max; p.m_memoryWatch->cost.flashHoldMaxMs = std::max(p.m_memoryWatch->cost.flashHoldMaxMs, max); } }
		} measure{*this, holdMax};
		std::optional<uint64_t> epoch;
		const size_t step = _atomic ? _flash.size() - md::g_mdFirmwareFlashEnd : machineMemory::g_sectorSize;
		for(size_t at = md::g_mdFirmwareFlashEnd; at < _flash.size(); at += step)
		{
			const bool ok = getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
			{
				auto* const device = dynamic_cast<md::Device*>(_device);
				if(!device || !device->isValid())
					return false;
				const auto e = device->deviceId() << 40 ^ device->hardwareEpoch();
				if(epoch && *epoch != e)
					return false;
				epoch = e;
				const auto t0 = std::chrono::steady_clock::now();
				const bool copied = device->getHardware().getUC().copyFlashDataRangeRealtime(_flash.data() + at, at, step);
				holdMax = std::max(holdMax, std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count());
				return copied;
			});
			if(!ok)
				return false;
		}
		return true;
	}

	// One look, with m_memoryMutex held: a copy of the memory a save changes (the patch RAM, the Monomachine's user
	// flash) into the scratch buffers, then its signature (machineMemory::signature: the working areas, knobs and
	// automation left out). The copy is taken in 64 KiB chunks, the plug-in's lock taken for each and released between,
	// so the audio thread never waits for more than one chunk; every chunk checks it is still the same machine. A save
	// that lands while the chunks are taken changes the next look too, and a write waits for two looks that agree.
	// False: no machine to look at (none, starting, restoring, changed while it was looked at).
	bool AudioPluginAudioProcessor::lookMachineMemory(uint64_t& _signature, uint64_t& _epoch, const bool _atomic)
	{
		const size_t chunk = _atomic ? md::g_mmUserFlashStateSize : 0x10000;
		uint64_t flashMark = 0;
		auto& w = *m_memoryWatch;
		auto& patch = w.scratch;
		auto& userFlash = w.scratchUserFlash;
		const bool mm = m_model == md::MachineModel::Monomachine;
		patch.resize(md::g_patchRamStateSize);	// no allocation under the lock
		if(mm)
			userFlash.resize(md::g_mmUserFlashStateSize);
		const auto begin = std::chrono::steady_clock::now();
		double lockMax = 0;
		std::optional<uint64_t> epoch;
		// one piece under the lock: _what(hw) after the checks
		const auto piece = [&](const std::function<bool(md::Hardware&)>& _what)
		{
			bool ok = false;
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
				const auto e = device->deviceId() << 40 ^ device->hardwareEpoch();	// a rebooted machine is another one
				if(epoch && *epoch != e)
					return;
				epoch = e;
				ok = _what(hw);
			});
			lockMax = std::max(lockMax, std::chrono::duration<double, std::milli>(released - held).count());
			return ok;
		};
		// the state checks and (MD) the last flash write
		if(!piece([&](md::Hardware& _hw)
		{
			if(mm)
				return true;
			// only once the factory flash is known (a first start that prepares it writes flash itself and is
			// replaced by the processor: no save). The flash is not watched (OS 1.63 writes it by itself while the
			// factory patterns play); a sample the page sends is (serviceSampleStore).
			if(!_hw.factoryFlashBaseline() || _hw.isFactoryFlashInitializationExpected())
				return false;
			auto& uc = _hw.getUC();
			flashMark = uc.flashDirty() ? uc.getCycles() - uc.flashIdleCycles() : 0;
			return true;
		}))
			return false;
		const auto userBase = md::memorymap::g_flashFull.offset(md::memorymap::g_mmUserFlash.begin);
		if(_atomic)
		{
			// one hold: the patch RAM and the user flash as they are at one moment
			if(!piece([&](md::Hardware& _hw)
			{
				return _hw.copyPatchRamRange(patch.data(), 0, patch.size())
					&& (!mm || _hw.getUC().copyFlashDataRangeRealtime(userFlash.data(), userBase, userFlash.size()));
			}))
				return false;
		}
		else
		{
			for(size_t at = 0; at < patch.size(); at += chunk)
			{
				if(!piece([&](md::Hardware& _hw) { return _hw.copyPatchRamRange(patch.data() + at, at, std::min(chunk, patch.size() - at)); }))
					return false;
				if(m_hasLookHookForTest.load(std::memory_order_acquire))
				{
					std::function<void(size_t)> hook;
					{
						const std::lock_guard hookLock(m_lookHookMutex);
						hook = m_lookPieceHookForTest;
					}
					if(hook)
						hook(at);
				}
			}
			if(mm)
				for(size_t at = 0; at < userFlash.size(); at += chunk)
					if(!piece([&](md::Hardware& _hw) { return _hw.getUC().copyFlashDataRangeRealtime(userFlash.data() + at, userBase + at, std::min(chunk, userFlash.size() - at)); }))
						return false;
		}
		_epoch = *epoch;
		const auto now = juce::Time::getMillisecondCounterHiRes();
		if(flashMark != w.flashMark)
		{
			w.flashMark = flashMark;
			w.flashChangedMs = now;
		}
		_signature = machineMemory::signature(m_model, patch, mm ? userFlash.data() : nullptr, mm ? userFlash.size() : 0);
		// the longest time the audio thread could wait: one piece, from taking the lock to releasing it
		w.cost.lookLockLastMs = lockMax;
		w.cost.lookLockMaxMs = std::max(w.cost.lookLockMaxMs, lockMax);
		w.cost.lookMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count();
		++w.cost.looks;
		return true;
	}

	// A look of a new machine (another epoch), m_memoryMutex held. A machine that took over the same memory (a reboot,
	// a ROM reinstalled, the MD's factory flash prepared) or a storage image keeps the base: what differs from it is a
	// save, written as one. A memory replaced on purpose (machineMemoryWillBeReplaced: a project, the file's slots,
	// factory memory) is the new base once it holds still for a look. False: not yet (still settling).
	bool AudioPluginAudioProcessor::rebaseMachineMemory(const uint64_t _signature, const uint64_t _epoch)
	{
		auto& w = *m_memoryWatch;
		const bool mm = m_model == md::MachineModel::Monomachine;
		if(w.watch.based() && !w.rebaseNext)
		{
			w.epoch = _epoch;
			std::swap(w.patch, w.scratch);
			std::swap(w.userFlash, w.scratchUserFlash);
			w.prevValid = false;
			return true;
		}
		if(w.settling != _signature && w.settleLooks < 2)
		{
			w.settling = _signature;
			++w.settleLooks;
			return false;
		}
		// the base is read whole (one hold of the plug-in's lock), so no half-done save is taken into it
		uint64_t signature = 0, epoch = 0;
		if(!lookMachineMemory(signature, epoch, true) || epoch != _epoch)
			return false;
		w.rebaseNext = false;
		w.prevValid = false;
		w.base = w.scratch;
		std::swap(w.patch, w.scratch);
		if(mm)
		{
			w.baseUserFlash = w.scratchUserFlash;
			std::swap(w.userFlash, w.scratchUserFlash);
		}
		else if(copyMachineFlash(w.baseFlash, true))
			w.flash = w.baseFlash;
		const bool soon = w.watch.wantsWrite() || !w.forced.empty();
		w.watch.base(signature);
		if(soon)
			w.watch.writeSoon();
		w.epoch = _epoch;
		w.settling.reset();
		w.settleLooks = 0;
		w.sampleArmedMs.reset();
		if(w.clearFileOnBase)
		{
			// Start from factory memory: the machine runs on it now, so the file goes (once its lock is had)
			w.clearFileOnBase = false;
			w.forced.clear();
			w.clearFilePending = true;
			clearMemoryFile();
		}
		return true;
	}

	// Start from factory memory's end (m_memoryMutex held), inside the file's lock: the slots saved before it was asked
	// for go; a slot another instance saved since stays (the file is written back with it, or deleted when nothing is
	// left). A file this editor may not replace (a newer editor's, another layout's) is moved aside with a time stamp,
	// never deleted. Not had the lock: tried again at the next look and at the close.
	void AudioPluginAudioProcessor::clearMemoryFile()
	{
		auto& w = *m_memoryWatch;
		const auto file = machineMemoryFile();
		const machineMemory::FileLock fileLock(file, 200);
		if(!fileLock.held())
			return;
		w.clearFilePending = false;
		if(!file.existsAsFile())
			return;
		juce::MemoryBlock raw;
		const bool read = file.loadFileAsData(raw);
		const auto* bytes = static_cast<const uint8_t*>(raw.getData());
		auto decoded = machineMemory::decode(read ? std::vector<uint8_t>(bytes, bytes + raw.getSize()) : std::vector<uint8_t>{}, m_model);
		std::string error;
		if(read && decoded.problem != machineMemory::Problem::None && !machineMemory::replaceable(decoded))
			m_memoryNote = moveMemoryFileAside("The saved machine memory was written by another editor; it was not deleted.");
		else if(decoded.problem == machineMemory::Problem::None)
		{
			machineMemory::dropSavedBefore(decoded.file, w.factoryAtMs);
			const bool empty = decoded.file.slots.empty() && decoded.file.foreign.empty();
			const bool gone = empty ? file.deleteFile() : writeMemoryFile(file, machineMemory::encode(m_model, decoded.file), error);
			if(!gone && !writeMemoryFile(file, machineMemory::encode(m_model, {}), error))
				m_memoryNote = "The machine memory file could not be cleared: " + file.getFullPathName().toStdString();
		}
		else if(!file.deleteFile())	// damaged: nothing in it to keep
			m_memoryNote = "The machine memory file could not be deleted: " + file.getFullPathName().toStdString();
		m_memoryVersion.fetch_add(1, std::memory_order_acq_rel);
	}

	void AudioPluginAudioProcessor::lookAtMachineMemory()
	{
		const std::lock_guard lock(m_memoryMutex);
		auto& w = *m_memoryWatch;
		uint64_t signature = 0, epoch = 0;
		if(!lookMachineMemory(signature, epoch, false))
			return;	// starting or restoring: the base and the last look of the old machine stay for its rebase
		if(w.epoch != epoch)
		{
			if(!rebaseMachineMemory(signature, epoch))
				return;
		}
		else
		{
			std::swap(w.patch, w.scratch);
			std::swap(w.userFlash, w.scratchUserFlash);
			w.prevValid = true;
		}
		if(w.clearFilePending)
			clearMemoryFile();
		serviceSampleStore();
		// KEEP MEMORY off: nothing is written; the base stays, so turning it on writes the saves made meanwhile
		if(!keepMachineMemory())
			return;
		const auto now = juce::Time::getMillisecondCounterHiRes();
		const bool retryDue = w.lastWriteFailed && now >= w.retryAtMs;
		const bool wants = w.watch.look(signature, now);
		// after a failed write: nothing before its 5 s are up (a new save waits for them too)
		if(w.lastWriteFailed && !retryDue)
			return;
		if(!wants && !retryDue)
			return;
		switch(writeChanges(true, false))
		{
		case WriteResult::Done: w.watch.written(signature); break;
		case WriteResult::HeldBack: w.watch.writeSoon(); break;	// slots seen changing: the next look tries again
		case WriteResult::Failed: w.watch.written(signature); break;	// the 5 s retry takes it (the base keeps it pending)
		}
	}

	// MD (m_memoryMutex held, after a look): a sample the page sent is a save of a slot (ROM-xx), stored by the machine
	// into its flash after the transfer ends. The flash itself is not watched (the OS writes it by itself while the
	// factory patterns play); a sample sent from the page is written once the flash has been still for a second after
	// its store began, or 30 s after the transfer at the latest: the sectors that differ from the base. A sample sent by
	// another program (SDS over MIDI) is written with the next sample the page sends.
	void AudioPluginAudioProcessor::serviceSampleStore()
	{
		auto& w = *m_memoryWatch;
		const auto now = juce::Time::getMillisecondCounterHiRes();
		if(m_memorySampleStored.exchange(false))
		{
			w.sampleArmedMs = now;
			w.sampleArmMark = w.flashMark;
		}
		if(!w.sampleArmedMs)
			return;
		const bool stored = w.flashMark != w.sampleArmMark && now - w.flashChangedMs >= 1000.0;
		if(!stored && now - *w.sampleArmedMs < 30000.0)
			return;
		w.sampleArmedMs.reset();
		takeSampleSectors(false);
	}

	// The sample sectors that differ from the base become forced (written at the next write, and named in the state
	// The sample sectors that differ from the base become forced (written at the next write, and named in the state
	// until then; writeChanges takes a sector only when two copies of it agree, or from one copy in one hold).
	void AudioPluginAudioProcessor::takeSampleSectors(const bool _atomic)
	{
		auto& w = *m_memoryWatch;
		if(m_model != md::MachineModel::Machinedrum || !copyMachineFlash(w.flash, _atomic))
			return;
		for(const auto& k : machineMemory::changedSectors(m_model, w.baseFlash, w.flash))
			w.forced.insert(k);
		w.watch.writeSoon();
	}

	void AudioPluginAudioProcessor::machineMemorySampleStored()
	{
		m_memorySampleStored.store(true);
		if(m_memoryThread)
			m_memoryThread->notify();
	}

	// The memory is about to be replaced by another (a project's, the file's slots, factory memory): the saves of this
	// one are written now, and the next machine's memory is the new base, not a save.
	void AudioPluginAudioProcessor::machineMemoryWillBeReplaced()
	{
		flushMachineMemory(FlushMode::Replace);
		const std::lock_guard lock(m_memoryMutex);
		if(m_memoryWatch)
			m_memoryWatch->rebaseNext = true;
	}

	// Saves not written yet are written now. FlushMode::Close (the instance going away) and Replace (a memory about to be
	// replaced: a project, the file's slots, factory memory) take one last look whole, in one hold of the plug-in's lock
	// (about 0.1 ms, 0.3 ms with the MM's user flash); HostSave (the host saving its state, often while it plays, at 32
	// sample buffers) takes no look: it writes what the last two looks agree on, as the thread would.
	void AudioPluginAudioProcessor::flushMachineMemory(const FlushMode _mode)
	{
		if(m_memoryFolder.empty() || !m_memoryWatch)
			return;
		const std::lock_guard lock(m_memoryMutex);
		auto& w = *m_memoryWatch;
		if(w.clearFilePending)
			clearMemoryFile();
		if(_mode == FlushMode::HostSave)
		{
			if(keepMachineMemory() && w.watch.based() && w.epoch)
				(void)writeChanges(true, false);
			return;
		}
		uint64_t signature = 0, epoch = 0;
		if(!lookMachineMemory(signature, epoch, true))
			return;
		if(w.epoch != epoch)
		{
			// a new machine: as the thread's look would take it (a memory replaced on purpose waits for its base)
			if(!w.watch.based() || w.rebaseNext)
				return;
			w.epoch = epoch;
		}
		std::swap(w.patch, w.scratch);
		std::swap(w.userFlash, w.scratchUserFlash);
		w.prevValid = false;	// scratch: a look of another kind; the thread's next look compares again
		// closing: a sample sent and maybe not stored yet is written as it is (the close itself ends its store)
		if(_mode == FlushMode::Close && (w.sampleArmedMs || m_memorySampleStored.exchange(false)))
		{
			w.sampleArmedMs.reset();
			takeSampleSectors(true);
		}
		if(!keepMachineMemory() || !w.watch.based())
			return;
		if(writeChanges(true, true) == WriteResult::Done)
			w.watch.written(signature);
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
