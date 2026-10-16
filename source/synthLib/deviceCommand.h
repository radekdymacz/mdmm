#pragma once

// DESIGN-audio-lock.md step 3: a value handed to the device by another thread (a panel key, a knob step), applied
// on the audio thread at the start of the next block (synthLib::Plugin::sendCommands), so the sender never takes the
// device lock the audio thread needs. The kinds and the meaning of the operands are the device's own
// (Device::applyCommand); the plug-in only carries them, in order.

#include <array>
#include <cstddef>
#include <cstdint>

namespace synthLib
{
	struct DeviceCommand
	{
		static constexpr size_t DataSize = 128;

		uint32_t kind = 0;					// the device's command kind
		uint32_t a = 0, b = 0;				// small operands
		uint64_t deviceGeneration = 0;		// stamped by Plugin::sendCommands: a command for a replaced device is dropped
		uint32_t size = 0;					// bytes of data used
		std::array<uint8_t, DataSize> data{};
	};
}
