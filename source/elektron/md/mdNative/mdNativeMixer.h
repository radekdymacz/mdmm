#pragma once

#include "mdNative.h"

namespace mdNative
{
	struct StereoBlock
	{
		Block left{}, right{};
	};
	struct MixerBuses
	{
		StereoBlock main, delay, reverb;
	};
	struct MixerControls
	{
		// Original DSP Q23 controls. Level 0x100000 compensates the mixer's x8 output scaling.
		int32_t level = 0x100000;
		int32_t pan = 0x400000;
		int32_t delay = 0;
		int32_t reverb = 0;
	};
	// Recovered DSP1 P:$2de..$2fa coefficients and P:$9de generated summation loop.
	// Main-output tracks only; individual hardware output routing is outside this stereo engine.
	void mixTracks(const Block *_tracks, const MixerControls *_controls, size_t _count, const int32_t *_sineTable,
				   MixerBuses &_output);
} // namespace mdNative
