#pragma once

#include "mdNativeTrack.h"

namespace mdNative
{
	// Reference proof of DSP1 P:$a4..$25d. The nine controls are the DSP's 14-bit values, not MIDI knobs.
	// The caller owns the original tables (X:$140000..$14ffff); no firmware instructions execute here.
	// This is before track panning/sends/master effects, not a complete instrument or master output.
	// Preconditions: non-null table of trackTableSize signed 24-bit words; controls in [0, 16383].
	using TrackControls = std::array<int32_t, 9>;
	struct TrackState
	{
		std::array<int32_t, 64> words{};
	};
	struct TrackTables
	{
		const int32_t *words = nullptr;
	};
	constexpr size_t trackTableSize = 0x10000;
	void renderTrack(const TrackControls &_controls, TrackState &_state, const TrackTables &_tables,
					 const Block &_input, Block &_output);
} // namespace mdNative
