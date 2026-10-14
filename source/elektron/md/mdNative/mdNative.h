#pragma once

// Experimental MD OS 1.63 kernels. These consume DSP-domain parameters, not MIDI knob values.
// No ROM data, emulator, JIT, platform API or allocation is part of this interface.
#include <array>
#include <cstddef>
#include <cstdint>

namespace mdNative
{
	constexpr size_t blockSize = 32;
	using Block = std::array<int32_t, blockSize>;

	struct SineParameters
	{
		int32_t pitch = 0, decay = 0, ramp = 0, rampDecay = 0;
	};
	struct SineState
	{
		uint64_t phase = 0, gain = 0;
		int32_t ramp = 0;
	};
	void trigger(SineState &_state);
	// _wave: 32768 signed 24-bit entries, supplied by the caller from its own firmware session.
	void renderSine(const SineParameters &_parameters, SineState &_state, const int32_t *_wave, Block &_out);

} // namespace mdNative
