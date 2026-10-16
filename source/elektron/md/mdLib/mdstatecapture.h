#pragma once

// md::Device's state save in two parts (codex review 2026-10, item 3): the capture under synthLib::Plugin's process
// lock (Device::beginStateCapture, then captureMore until it is done) and the encode after it is released
// (DeviceStateCapture::encode). The fork's file (doc/modern-ux/UPSTREAM.md); md::Device keeps the hook, its
// beginStateCapture override.

#include "mdhardware.h"
#include "mdstate.h"
#include "mdtypes.h"

#include "synthLib/device.h"

#include <cstdint>
#include <memory>
#include <vector>

namespace md
{
	class Device;
	class FactoryFlashBaseline;

	// What the save needs, copied or shared under the lock: only what the running machine can still change is copied
	// (the patch RAM, the MD flash or the MM user flash, a pending overlay); the ROM, the factory baseline and a
	// requested state are shared and immutable, alive even when the device swaps its Hardware while this encodes.
	// The encode (CRCs, the sector compare, the first decode of the factory cache) gives the bytes the save under
	// the lock wrote.
	class DeviceStateCapture final : public synthLib::Device::StateCapture
	{
	public:
		DeviceStateCapture(MachineModel _model, synthLib::StateType _type) : model(_model), type(_type) {}

		bool encode(std::vector<uint8_t>& _state) override;
		// DESIGN-audio-lock.md step 1: the Machinedrum's 8 MiB flash is copied g_partSize a hold, the patch RAM with
		// the last part. When the flash was written meanwhile (Microcontroller::flashWrites) or the device's Hardware
		// changed, the capture begins again; after g_restarts the rest is copied in one hold. Same lock as
		// beginStateCapture; the device must still be the plug-in's (synthLib::Plugin::getState checks).
		bool captureMore() override;

		static constexpr size_t g_partSize = 256 * 1024;
		static constexpr uint32_t g_restarts = 4;

		const MachineModel model;
		const synthLib::StateType type;
		// A restore in progress of this state type: saved as it was requested
		std::shared_ptr<const std::vector<uint8_t>> requestedState;
		std::vector<uint8_t> patchRam;
		std::vector<uint8_t> userFlash;		// Monomachine
		std::vector<uint8_t> flash;			// Machinedrum, unless only the pending overlay is saved
		FlashSectorOverlay pendingOverlay;
		std::shared_ptr<FactoryFlashBaseline> factoryBaseline;
		std::shared_ptr<const Rom> rom;
		uint64_t romFingerprint = 0;

		// The copy in parts (Device::continueStateCapture): which Hardware, how far, and the flash's writes at its start
		Device* device = nullptr;
		const Hardware* hardware = nullptr;
		uint64_t epoch = 0;
		uint64_t generation = 0;
		uint64_t flashWritesAtStart = 0;
		size_t flashAt = 0;
		bool copying = false;
		uint32_t restarts = 0;
	};
}
