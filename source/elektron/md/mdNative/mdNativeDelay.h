#pragma once

#include "mdNativeMixer.h"

#include <vector>

namespace mdNative
{
	constexpr size_t delayRingSize = 0x17afc;
	struct DelayState
	{
		// P:$342..$43b state corresponding to DSP1 Y:$150..$165.
		std::array<int32_t, 22> words{};
		std::vector<int32_t> left = std::vector<int32_t>(delayRingSize);
		std::vector<int32_t> right = std::vector<int32_t>(delayRingSize);
	};
	// Input is the stereo delay-send bus; output is the delay return before reverb send/master processing.
	// Parameters are words[0..8]. Allocation belongs to state construction, never rendering.
	void renderDelay(DelayState &_state, const StereoBlock &_input, StereoBlock &_output);
} // namespace mdNative
