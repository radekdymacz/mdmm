#pragma once

#include "mdNativeMixer.h"

namespace mdNative
{
	struct MasterEqControls
	{
		// DSP1 Y:$170..$179: two first-order sections, parametric width/frequency/gain, output level.
		std::array<int32_t, 10> words{};
	};
	struct MasterEqChannel
	{
		int64_t first = 0, second = 0, previousFirst = 0;
		int32_t previousInput = 0;
		std::array<int64_t, 2> input{}, output{};
	};
	struct MasterEqState
	{
		std::array<MasterEqChannel, 2> channels;
	};
	using WideStereoBlock = std::array<std::array<int64_t, blockSize>, 2>;
	void renderMasterEq(const MasterEqControls &_controls, MasterEqState &_state, const StereoBlock &_input,
						WideStereoBlock &_output);
} // namespace mdNative
