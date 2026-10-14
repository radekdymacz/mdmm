#pragma once

#include "mdNativeChain.h"
#include "mdNativeMixer.h"

#include <vector>

namespace mdNative
{
	struct ReverbLine
	{
		std::vector<int32_t> data;
		size_t write = 0, read = 0;
		int64_t filter = 0;
		int32_t previous = 0;
	};
	struct ReverbState
	{
		ReverbState();
		std::array<ReverbLine, 5> diffusion;
		std::array<ReverbLine, 6> tank;
		std::vector<int32_t> predelay = std::vector<int32_t>(16384);
		size_t predelayWrite = 0;
		uint32_t modulation = 0;
		int32_t envelope = 0, peak = 0, gateAge = 0, gate = 0;
		std::array<int64_t, 2> high{}, low{};
		std::array<int32_t, 2> previousInput{};
	};
	struct ReverbControls
	{
		int32_t highpass = 0x347, lowpass = 0x7fdf3b;
		int32_t decay = 33, damping = 24;
		int32_t level = 0x80000, gateBlocks = 1000000, delaySend = 0, predelayWords = 0;
	};
	// Original DSP1 topology P:$43c..$66b: predelay, five allpasses, six feedback lines,
	// modulation, gate, return filtering and level. Private numeric tables are supplied by the caller.
	void renderReverb(const ReverbControls &_controls, ReverbState &_state, const TrackTables &_tables,
					  const StereoBlock &_input, const StereoBlock &_delay, StereoBlock &_output);
} // namespace mdNative
