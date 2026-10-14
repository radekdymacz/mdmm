#pragma once

#include "mdNativeMasterEq.h"

namespace mdNative
{
	struct CompressorControls
	{
		// Original DSP1 Y:$17a..$184: attack/release, makeup, sidechain highpass, dry blend, transfer curve.
		std::array<int32_t, 11> words{};
	};
	struct CompressorState
	{
		std::array<std::array<int64_t, 2>, 48> lookahead{};
		size_t write = 0;
		std::array<int32_t, 2> low{}, high{}, previousInput{};
		int64_t envelope = 0;
		int32_t previousEnvelope = 0, envelopeRate = 0, root = 0x266666, gain = 0x266666;
	};
	void renderCompressor(const CompressorControls &_controls, CompressorState &_state, const WideStereoBlock &_input,
						  StereoBlock &_output);
} // namespace mdNative
