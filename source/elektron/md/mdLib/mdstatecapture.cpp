#include "mdstatecapture.h"

#include "mddevice.h"
#include "mdfactorybaseline.h"
#include "mdmemorymap.h"

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
		if(isProjectStateRestorePending() && _capture.type == m_requestedStateType && m_requestedState)
		{
			_capture.requestedState = m_requestedState;
			return;
		}

		auto& stateHardware = stateCaptureHardware();
		std::vector<OneMomentCopy::Area> areas;
		const auto patchSize = g_patchRamStateSize;
		if(m_model == MachineModel::Monomachine)
		{
			// the patch RAM and the user flash (when the flash has one), a part per hold
			areas.push_back({false, &_capture.patchRam, 0, patchSize});
			const auto userAt = memorymap::g_flashFull.offset(memorymap::g_mmUserFlash.begin);
			if(stateHardware.getUC().flashSize() >= memorymap::g_flashFull.offset(memorymap::g_mmUserFlash.end))
				areas.push_back({true, &_capture.userFlash, userAt, memorymap::g_mmUserFlash.size()});
		}
		else
		{
			_capture.rom = stateHardware.sharedRom();
			_capture.romFingerprint = stateHardware.firmwareFingerprint();
			_capture.factoryBaseline = stateHardware.factoryFlashBaseline();
			const bool pending = stateHardware.copyPendingFlashOverlay(_capture.pendingOverlay);
			// A pending restore without a factory baseline saves its overlay alone; every other case saves the flash
			if(_capture.factoryBaseline || !pending)
				areas.push_back({true, &_capture.flash, 0, stateHardware.getUC().flashSize()});
			areas.push_back({false, &_capture.patchRam, 0, patchSize});
		}
		_capture.hardware = &stateHardware;
		_capture.epoch = m_hardwareEpoch;
		_capture.generation = m_deferredStateGeneration;
		_capture.copy.begin(std::move(areas));
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
		switch(_capture.copy.step(stateHardware))
		{
		case OneMomentCopy::Step::More:
			return true;
		case OneMomentCopy::Step::Done:
			break;
		case OneMomentCopy::Step::Busy:
			// written faster than it is copied: begin again (the hold stays one part); after a few tries the rest is
			// copied in this one hold, however large: a state save is never given up (a lost save is a lost project)
			if(++_capture.restarts <= DeviceStateCapture::g_restarts)
			{
				startStateCapture(_capture);
				return _capture.copying;
			}
			if(_capture.copy.finishWhole(stateHardware) == OneMomentCopy::Step::Done)
				break;
			[[fallthrough]];
		case OneMomentCopy::Step::Failed:
			// a range the memory does not have: the whole memories, in this hold, as before the copy in parts
			_capture.patchRam = stateHardware.copyPatchRam();
			if(m_model == MachineModel::Monomachine)
				_capture.userFlash = stateHardware.copyUserFlash();
			else if(_capture.factoryBaseline || !_capture.pendingOverlay.valid)
				_capture.flash = stateHardware.copyFlashData();
			break;
		}
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
