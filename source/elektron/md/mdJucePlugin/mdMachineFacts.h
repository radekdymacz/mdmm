#pragma once

// DESIGN-audio-lock.md step 2: what the editor reads about the machine, as one plain value. Made under the plug-in's
// device lock at the end of every audio block and of every locked call (synthLib::Plugin::setFactsCallback), kept in
// a synthLib::Seqlock, read by any thread without the lock: the desk's probe and telemetry, the processor's timers,
// the controller, the machine memory. The processor owns it (AudioPluginAudioProcessor::machineFacts).

#include "elektronData/mdAudition.h"

#include <cstdint>

namespace synthLib
{
	class Device;
}

namespace mdJucePlugin
{
	struct MachineFacts
	{
		enum class Kind : uint8_t
		{
			None,		// no device (before the processor made one)
			NoRom,		// the stand-in without a ROM (mdDeskHost.h, makeNoRomDevice)
			Other,		// a device that is not the machine
			Machine		// md::Device (a DeskDevice: desk)
		};
		Kind kind = Kind::None;
		bool desk = false;
		bool valid = false;
		uint8_t model = 0;							// md::MachineModel of the machine's Hardware
		uint64_t firmwareFingerprint = 0;
		uint64_t deviceId = 0;						// md::Device::deviceId: another device, another number
		uint64_t hardwareEpoch = 0;					// md::Device::hardwareEpoch: another Hardware, another number
		// restores (md::Device): the state restore, its generation and status, a deferred candidate ready to commit
		bool restorePending = false;
		bool deferredFinished = false;
		uint8_t restoreStatus = 0;					// md::Device::ProjectStateRestoreStatus
		uint64_t restoreGeneration = 0;
		// the Machinedrum's first start (md::Hardware): the factory flash
		bool factoryFlashInitializationExpected = false;
		bool factoryFlashReadyForReboot = false;
		bool factoryFlashBaseline = false;			// md::Hardware::hasFactoryFlashBaseline
		// the firmware and the emulation
		bool firmwareMidiReady = false;
		bool stalled = false;
		uint8_t dspBooted = 0;
		uint64_t cycles = 0;
		uint64_t flashWrites = 0;					// B-195: the firmware's writes to its flash (md::Hardware::flashWrites)
		uint64_t midiRxConsumed = 0;
		// panel events the machine's panel queue dropped (overflow, dropped pulses, rejected), this Hardware's count
		uint64_t panelDropped = 0;
		// MIDI events the scheduled-MIDI ring could not take (md::Hardware::scheduledMidiOverflowCount; the MIDI monitor)
		uint64_t scheduledMidiOverflow = 0;
		// the tester switches
		bool speedUps = true;
		bool exactEssi = false;
		bool ramRecordingAvailable = false;
		uint32_t speedUpLeversOff = 0;
		elektronData::AuditionStatus audition;
		// panel packets the desk device still has queued (md::DeskDevice::SequencerTelemetry::panelPending: the packets
		// not sent yet, plus one while the last is held; 0 when none)
		uint32_t panelPending = 0;
	};

	// The facts of _device. Under the plug-in's device lock (any thread holding it, the audio thread at block end).
	MachineFacts machineFactsOf(synthLib::Device* _device);
}
