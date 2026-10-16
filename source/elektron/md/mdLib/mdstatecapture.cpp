#include "mdstatecapture.h"

#include "mddevice.h"
#include "mdfactorybaseline.h"

namespace md
{
	// md::Device's hook (mddevice.h), defined here with the capture it makes
	std::unique_ptr<synthLib::Device::StateCapture> Device::beginStateCapture(const synthLib::StateType _type)
	{
		return beginDeviceStateCapture(_type);
	}

	std::unique_ptr<DeviceStateCapture> Device::beginDeviceStateCapture(const synthLib::StateType _type)
	{
		auto capture = std::make_unique<DeviceStateCapture>(m_model, _type);
		capture->device = this;
		startStateCapture(*capture);
		return capture;
	}

	Device::StateMark Device::stateMark() const
	{
		StateMark mark;
		const auto* stateHardware = m_hardware.get();
		mark.candidate = m_deferredPreparedState && m_deferredPreparedState->m_hardware;
		if(mark.candidate)
			stateHardware = m_deferredPreparedState->m_hardware.get();
		mark.epoch = m_hardwareEpoch;
		mark.generation = m_deferredStateGeneration;
		mark.flashWrites = stateHardware->flashWrites();
		mark.restoreStatus = m_restoreStatus;
		mark.restorePending = isProjectStateRestorePending();
		mark.factoryBaseline = stateHardware->hasFactoryFlashBaseline();
		return mark;
	}

	Hardware& Device::stateCaptureHardware()
	{
		if(m_deferredPreparedState && m_deferredPreparedState->m_hardware)
			return *m_deferredPreparedState->m_hardware;
		return *m_hardware;
	}

	void Device::startStateCapture(DeviceStateCapture& _capture)
	{
		_capture.requestedState.reset();
		_capture.patchRam.clear();
		_capture.userFlash.clear();
		_capture.flash.clear();
		_capture.pendingOverlay = {};
		_capture.factoryBaseline.reset();
		_capture.rom.reset();
		_capture.romFingerprint = 0;
		_capture.copying = false;
		_capture.flashAt = 0;
		if(isProjectStateRestorePending() && _capture.type == m_requestedStateType && m_requestedState)
		{
			_capture.requestedState = m_requestedState;
			return;
		}

		auto& stateHardware = stateCaptureHardware();
		if(m_model == MachineModel::Monomachine)
		{
			// 1 MiB and 2 MiB: one hold (0.2 ms measured)
			_capture.patchRam = stateHardware.copyPatchRam();
			_capture.userFlash = stateHardware.copyUserFlash();
			return;
		}
		_capture.rom = stateHardware.sharedRom();
		_capture.romFingerprint = stateHardware.firmwareFingerprint();
		_capture.factoryBaseline = stateHardware.factoryFlashBaseline();
		const bool pending = stateHardware.copyPendingFlashOverlay(_capture.pendingOverlay);
		// A pending restore without a factory baseline saves its overlay alone; every other case saves the flash
		if(!_capture.factoryBaseline && pending)
		{
			_capture.patchRam = stateHardware.copyPatchRam();
			return;
		}
		_capture.flash.reserve(stateHardware.getUC().flashSize());
		_capture.hardware = &stateHardware;
		_capture.epoch = m_hardwareEpoch;
		_capture.generation = m_deferredStateGeneration;
		_capture.flashWritesAtStart = stateHardware.flashWrites();
		_capture.copying = true;
	}

	bool Device::continueStateCapture(DeviceStateCapture& _capture)
	{
		if(!_capture.copying)
			return false;
		auto& stateHardware = stateCaptureHardware();
		if(&stateHardware != _capture.hardware || _capture.epoch != m_hardwareEpoch
			|| _capture.generation != m_deferredStateGeneration)
		{
			// another Hardware (a restore committed, a candidate finished): the capture begins again on it
			++_capture.restarts;
			startStateCapture(_capture);
			return _capture.copying;
		}
		auto& uc = stateHardware.getUC();
		const auto size = uc.flashSize();
		const bool whole = _capture.flashAt == 0 && _capture.restarts >= DeviceStateCapture::g_restarts;
		const auto part = whole ? size : std::min(DeviceStateCapture::g_partSize, size - _capture.flashAt);
		_capture.flash.resize(_capture.flashAt + part);
		if(!uc.copyFlashDataRangeRealtime(_capture.flash.data() + _capture.flashAt, _capture.flashAt, part))
			_capture.flash = stateHardware.copyFlashData();
		_capture.flashAt = _capture.flash.size();
		if(_capture.flashAt < size)
			return true;
		if(!whole && stateHardware.flashWrites() != _capture.flashWritesAtStart)
		{
			// the firmware wrote the flash while it was copied: the parts may not be of one moment
			++_capture.restarts;
			startStateCapture(_capture);
			return _capture.copying;
		}
		// the flash is now what was copied: the patch RAM of this moment completes the save of one moment
		_capture.patchRam = stateHardware.copyPatchRam();
		_capture.copying = false;
		return false;
	}

	bool DeviceStateCapture::captureMore()
	{
		return device && device->continueStateCapture(*this);
	}

	bool DeviceStateCapture::encode(std::vector<uint8_t>& _state)
	{
		if(requestedState)
		{
			_state.insert(_state.end(), requestedState->begin(), requestedState->end());
			return true;
		}
		if(model == MachineModel::Monomachine)
			return encodeState(_state, patchRam, model, type, userFlash);

		// B-034: the ROM's and the baseline's fingerprints as md::Hardware keeps them; the baseline is decoded
		// once per cache, by the first save that needs it
		FlashFingerprints known;
		known.rom = romFingerprint;
		std::shared_ptr<const std::vector<uint8_t>> baseline;
		if(factoryBaseline && factoryBaseline->get(baseline, known.baseline))
			return encodeStateWithFactoryBaseline(_state, patchRam, flash, *baseline, rom->data(), model, type, &known);
		if(pendingOverlay.valid)
			return encodeState(_state, patchRam, pendingOverlay, rom->data(), model, type, &known.rom);
		// If interaction happened before the first machine-local baseline was
		// captured, preserve a complete flash image. An absolute sector set records
		// ROM-equal deletions and lets the replacement boot coherently without waiting
		// for another factory-initialization pass.
		return encodeState(_state, patchRam, flash, rom->data(), rom->data(), model, type);
	}
}
