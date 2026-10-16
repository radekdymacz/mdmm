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
#include "mdMachineMemoryDevice.h"

// ReSharper disable once CppUnusedIncludeDirective
#include "BinaryData.h"
#include "jucePluginLib/processorPropertiesInit.h"
#include "jucePluginLib/tools.h"

#include "mdLib/mddevice.h"
#include "mdLib/mddeskdevice.h"
#include "mdLib/mdstatecapture.h"
#include "mdLib/mdromloader.h"
#include "mdLib/mdstate.h"
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

namespace
{
	// The live machine's state captured a part per device-lock hold (md::DeviceStateCapture::captureMore), every part
	// of _live at _epoch; _mark: the machine's state mark when the capture completed. False: the machine changed.
	bool captureLiveState(synthLib::Plugin& _plugin, md::Device* const _live, const uint64_t _epoch,
		std::unique_ptr<md::DeviceStateCapture>& _capture, md::Device::StateMark& _mark)
	{
		bool more = true;
		while(more)
		{
			const bool same = _plugin.withDeviceLocked([&](synthLib::Device* const _device)
			{
				auto* const device = dynamic_cast<md::Device*>(_device);
				if(!device || device != _live || device->hardwareEpoch() != _epoch)
					return false;
				if(!_capture)
					_capture = device->beginDeviceStateCapture(synthLib::StateTypeGlobal);
				more = _capture->captureMore();
				if(!more)
					_mark = device->stateMark();
				return true;
			});
			if(!same)
				return false;
		}
		return true;
	}
}

namespace mdJucePlugin
{
	void AudioPluginAudioProcessor::getStateInformation(juce::MemoryBlock& _dest)
	{
		if(!m_desk->heldState(_dest)) Processor::getStateInformation(_dest);	// no ROM: the project as it was (mdDeskHost.h)
	}

	void AudioPluginAudioProcessor::setHostClock(const bool _on)
	{
		getPlugin().setHostClock(_on);
		m_memory.setHostClock(_on);
	}

	void AudioPluginAudioProcessor::setStateInformation(const void* _data, const int _size)
	{
		// I-024: a DAW project's memory wins over the machine memory file (also a late one); the standalone's own state
		// does not (the file's slots are laid over it)
		if(_size > 0)
			m_memory.stateComes();
		if(!m_desk->holdState(_data, _size)) Processor::setStateInformation(_data, _size);
	}

	void AudioPluginAudioProcessor::restoreHeldState()
	{
		std::vector<uint8_t> held;
		if(!m_desk->takeHeldState(held))
			return;
		m_memory.willBeReplaced();
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
		m_desk->saveChunks(_stream);	// the editor's setup and the automation parameters (they live without a machine)
	}

	void AudioPluginAudioProcessor::loadChunkData(baseLib::ChunkReader& _reader)
	{
		jucePluginEditorLib::Processor::loadChunkData(_reader);
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
			m_memory.setLoadedMark(std::move(mark));
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
		m_memory.setLoadedMark(std::nullopt);	// a state from before I-024 knows nothing of the file
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
						if(!device->getHardware().patchRamEquals(previousBytes))
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
		, m_memoryDevice(std::make_unique<MachineMemoryDevice>(*this, _model, productName(_model)))
		, m_memory(*m_memoryDevice, _model)
	{
		// DESIGN-audio-lock.md step 2: the machine's facts, published under the device lock by whoever holds it (the
		// audio thread at each block's end), read by every thread without it. The callback owns the store it writes.
		getPlugin().setFactsCallback([facts = m_facts](synthLib::Device* const _device)
		{
			facts->write(machineFactsOf(_device));
		});
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
		MachineMemoryService::Setup memory;
		if(_memoryFolder)
			memory.folder = *_memoryFolder;
		else if(!_ephemeralConfig && wrapperType != wrapperType_Undefined)
			memory.folder = baseLib::filesystem::validatePath(getDataFolder()) + machineMemory::g_folder + "/";
		memory.keep = getConfig().getBoolValue(machineMemory::g_keepKey, true);
		memory.standaloneState = _standaloneState || wrapperType == wrapperType_Standalone;
		memory.plugIn = wrapperType != wrapperType_Undefined;
		m_memory.start(std::move(memory));
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
		m_memory.stop();	// and writes a save it has not written yet
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
		// The facts first (DESIGN-audio-lock.md step 2): the lock only once they say the machine is ready for its reboot
		const auto facts = machineFacts();
		if(facts.kind == MachineFacts::Kind::Machine && facts.valid
			&& facts.model == static_cast<uint8_t>(md::MachineModel::Machinedrum))
		{
			if(facts.restorePending)
				state = State::Waiting;
			else if(facts.factoryFlashInitializationExpected)
				state = facts.factoryFlashReadyForReboot ? State::Ready : State::Waiting;
		}
		if(state == State::Ready)
		{
			state = State::NotNeeded;
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
			});
		}
		// The machine's state taken a part per hold (DESIGN-audio-lock.md step 1), encoded after the lock, with the
		// mark and the patch RAM of the moment it was complete: the commit checks against those
		std::unique_ptr<md::DeviceStateCapture> capture;
		md::Device::StateMark mark;
		if(state == State::Ready && !captureLiveState(getPlugin(), liveDevice, liveEpoch, capture, mark))
			state = State::Waiting;
		if(capture && state == State::Ready && !capture->encode(originalState))
			state = State::Waiting;

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
				// unchanged since the capture: the same marks and patch RAM give the same state (no getState here)
				if(device->stateMark() != mark || !device->getHardware().patchRamEquals(capture->patchRam))
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
		// the timer's poll reads the facts; the lock only when a candidate is there to take (DESIGN-audio-lock.md step 2)
		if(!machineFacts().deferredFinished)
			return false;
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
		// the facts first: the lock (for the error's text) only for a failure not reported yet
		const auto facts = machineFacts();
		if(facts.restoreStatus != static_cast<uint8_t>(md::Device::ProjectStateRestoreStatus::Failed)
			|| facts.restoreGeneration == m_reportedRestoreFailureGeneration)
			return false;
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
		// in a good frame): the machine stays on factory memory, the notice says why
		if(m_memory.restoreFailed(generation, error))
			return true;
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
		// the error is there only while the restore failed (md::Device::failProjectStateRestore)
		if(machineFacts().restoreStatus != static_cast<uint8_t>(md::Device::ProjectStateRestoreStatus::Failed))
			return {};
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
		// the facts and the panel the device publishes, without the device lock (DESIGN-audio-lock.md step 2); the
		// panel's handle is looked up again only for another device
		const auto facts = machineFacts();
		if(facts.kind == MachineFacts::Kind::Machine)
		{
			if(facts.deviceId != m_startupPanelDevice)
			{
				m_startupPanelDevice = facts.deviceId;
				m_startupPanel = getPlugin().withDeviceLocked([](synthLib::Device* const _device)
				{
					auto* const device = dynamic_cast<md::Device*>(_device);
					return device ? device->getFrontPanelPublisher() : nullptr;
				});
			}
			cycles = facts.cycles;
			epoch = facts.hardwareEpoch;
			if(m_startupPanel)
			{
				const auto panel = m_startupPanel->read();
				pixels = panel.countLitPixels();
				panelBytes = panel.getByteCount();
				tileWrites = panel.getTileWriteCount();
			}
		}

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
		if(m_mixMeterWanted.load(std::memory_order_relaxed))
			m_mixMeter.onBlock(_outputs, _frames);	// I-032: per output pair, for the Mix page while it is shown
	}

	// 0.6: a note on from outside, for the page (LEARN, I-002), and the notes held (the lit keys); SysEx and the rest
	// pass by
	void AudioPluginAudioProcessor::midiInReceived(const synthLib::SMidiEvent& _ev)
	{
		m_midiMonitor.onEvent(midiMonitor::Direction::InHost, _ev.a, !_ev.sysex.empty());
		if(!_ev.sysex.empty())
			return;
		// HW MIDI: what comes in is (also) the real machine's own MIDI OUT, never a key held by a player
		if(!getExternalMidi().isOn())
			m_midiHeld.onMidi(_ev.a, _ev.b, _ev.c);
		if(const auto n = midiIn::noteOn(_ev.a, _ev.b, _ev.c))
			m_midiIn.tryPush(*n);
	}

	// 0.8 (WP3): the MIDI monitor's other three counting places (jucePluginLib/processor.cpp calls this)
	void AudioPluginAudioProcessor::midiTraffic(const MidiTraffic _where, const synthLib::SMidiEvent& _ev)
	{
		using midiMonitor::Direction;
		const auto d = _where == MidiTraffic::ToFirmware ? Direction::InFirmware
			: _where == MidiTraffic::FromMachine ? Direction::OutMachine : Direction::OutHost;
		m_midiMonitor.onEvent(d, _ev.a, !_ev.sysex.empty());
	}

	midiMonitor::Counts AudioPluginAudioProcessor::midiMonitorCounts()
	{
		auto c = m_midiMonitor.take();
		c.dropped.scheduledOverflow = machineFacts().scheduledMidiOverflow;
		c.dropped.externalIn = getExternalMidi().inDropped();
		c.dropped.allocationFallback = getRealtimeMidiAllocationFallbackCount();
		return c;
	}

	// at most every 10 s, and only while the counts changed (mdMidiMonitor.h)
	void AudioPluginAudioProcessor::logMidiMonitor(const double _nowMs)
	{
		const auto c = midiMonitorCounts();
		if(!m_midiLogPacer.due(_nowMs, c.fingerprint()))
			return;
		m_midiLogLine = midiMonitor::logLine(c);
		m_boot.note(m_midiLogLine);
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
		// the facts the audio thread published (DESIGN-audio-lock.md step 2): no device lock once a second
		if(const auto f = machineFacts(); f.kind == MachineFacts::Kind::Machine && f.valid)
		{
			s.cycles = f.cycles;
			s.dspBooted = f.dspBooted;
			s.firmwareMidiReady = f.firmwareMidiReady;
			s.machine = true;
			s.speedUps = f.speedUps;
			s.leversOff = f.speedUpLeversOff;
			s.exactEssi = f.exactEssi;
			s.stalled = f.stalled;
		}
		// the scheduler's watchdog (mdschedwatchdog.h) muted the machine: said once, here on the message thread
		if(s.stalled && !m_stallLogged)
			std::fprintf(stderr, "[md] the machine stopped moving (the scheduler's step budget ran out) and is muted until "
				"the project is loaded again or the plug-in is added again\n");
		m_stallLogged = s.stalled;
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
		logMidiMonitor(juce::Time::getMillisecondCounterHiRes());
		recordStandaloneStartupDiagnostics();
		m_memory.serviceTimer();	// I-024: the start's overlay, and the notices the memory's thread left
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
		if(const auto f = machineFacts(); f.kind == MachineFacts::Kind::Machine)
		{
			known = true;
			on = f.speedUps;
			off = f.speedUpLeversOff;
			essi = f.exactEssi;
		}
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
		const auto f = machineFacts();
		return f.kind == MachineFacts::Kind::Machine && f.exactEssi;
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
		const auto f = machineFacts();
		return f.kind == MachineFacts::Kind::Machine ? f.speedUpLeversOff : 0u;
	}

	bool AudioPluginAudioProcessor::isLegacyEmulation()
	{
		const auto f = machineFacts();
		return f.kind == MachineFacts::Kind::Machine && !f.speedUps;
	}

	bool AudioPluginAudioProcessor::isRamRecordingModeAvailable()
	{
		if(m_model != md::MachineModel::Machinedrum)
			return false;
		const auto f = machineFacts();
		return f.kind == MachineFacts::Kind::Machine && f.ramRecordingAvailable;
	}

	void AudioPluginAudioProcessor::setKeepMachineMemory(const bool _keep)
	{
		getConfig().setValue(machineMemory::g_keepKey, _keep);
		getConfig().saveIfNeeded();
		m_memory.setKeep(_keep);
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

	bool AudioPluginAudioProcessor::sendDeskCommands(const std::vector<synthLib::DeviceCommand>& _commands, const size_t _panelPackets)
	{
		const auto f = machineFacts();
		if(!f.desk || !f.valid || _commands.empty())
			return false;
		if(_panelPackets)
		{
			// pending counts the held last packet as one more; it is sent already
			const size_t queued = f.panelPending ? f.panelPending - 1 : 0;
			if(_panelPackets > md::DeskDevice::PanelSequenceCapacity - std::min(queued, md::DeskDevice::PanelSequenceCapacity))
				return false;
		}
		return getPlugin().sendCommands(_commands.data(), _commands.size());
	}
}
