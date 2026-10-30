#include "mdMachineFacts.h"

#include "mdDeskHost.h"

#include "mdLib/mddeskdevice.h"

#include <algorithm>

namespace mdJucePlugin
{
	MachineFacts machineFactsOf(synthLib::Device* const _device)
	{
		MachineFacts f;
		if(!_device)
			return f;
		auto* const device = dynamic_cast<md::Device*>(_device);
		if(!device)
		{
			f.kind = isNoRomDevice(_device) ? MachineFacts::Kind::NoRom : MachineFacts::Kind::Other;
			return f;
		}
		f.kind = MachineFacts::Kind::Machine;
		const auto* const desk = dynamic_cast<const md::DeskDevice*>(device);
		f.desk = desk != nullptr;
		f.valid = device->isValid();
		f.deviceId = device->deviceId();
		f.hardwareEpoch = device->hardwareEpoch();
		f.restorePending = device->isProjectStateRestorePending();
		f.deferredFinished = device->isDeferredStateFinished();
		f.restoreStatus = static_cast<uint8_t>(device->projectStateRestoreStatus());
		f.restoreGeneration = device->deferredStateGeneration();
		f.speedUps = device->speedUps();
		f.exactEssi = device->exactEssiTiming();
		f.speedUpLeversOff = device->speedUpLeversOff();
		f.ramRecordingAvailable = device->supportsRamRecordingMode();
		auto& hw = device->getHardware();
		f.model = static_cast<uint8_t>(hw.getModel());
		f.firmwareFingerprint = hw.firmwareFingerprint();
		f.factoryFlashInitializationExpected = hw.isFactoryFlashInitializationExpected();
		f.factoryFlashReadyForReboot = hw.isFactoryFlashReadyForReboot();
		f.factoryFlashBaseline = hw.hasFactoryFlashBaselineRealtime();	// never waits: on the audio thread
		f.firmwareMidiReady = hw.isFirmwareMidiReady();
		f.stalled = hw.schedulerStalled();
		f.cycles = hw.hostCurrentCycle();
		f.flashWrites = hw.flashWrites();
		f.midiRxConsumed = hw.midiRxConsumedCount();
		const auto panel = hw.getPanelInputStatus();
		f.panelDropped = panel.overflowCount + panel.droppedPulsePackets + panel.rejectedPackets;
		f.scheduledMidiOverflow = hw.scheduledMidiOverflowCount();
		if(f.valid)
			f.dspBooted = static_cast<uint8_t>((hw.getDspMixer().booted() ? 1 : 0) + (hw.getDspProducer().booted() ? 1 : 0));
		if(desk)
		{
			f.audition = desk->auditionStatus();
			if(const auto* const telemetry = desk->sequencerTelemetryPtr())
				f.panelPending = static_cast<uint32_t>(std::max(0, telemetry->panelPending.load(std::memory_order_relaxed)));
		}
		return f;
	}
}
