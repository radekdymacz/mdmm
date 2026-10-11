#pragma once

#include "elektronData/mmSong.h"

#include <cstddef>
#include <string>

namespace mmDesk
{
	// Wave 2, play from a song row: the Song Position Pointer that starts row _row of _song, in sixteenths. The
	// Monomachine counts each row's length times its plays (repeats + 1) and starts the row that holds the pointer at its
	// first step (doc/modern-ux/PROBES-manual-gaps.md P1: TRANSPORT IN = ACCEPT, SONG mode). A row it cannot reach that way
	// gives the reason instead: a LOOP, JUMP or HALT before it, a row that is no pattern, a position past what the
	// pointer holds. Pure.
	struct SongPosition
	{
		int sixteenths = 0;
		std::string refused;	// empty: the position is good
	};

	SongPosition songPositionOf(const elektronData::MmSong& _song, size_t _row);

	// Why the transport's extras are not here (the capabilities' reasons and the refusals).
	inline constexpr const char* g_noPanic = "Panic sends All Notes Off (CC 123) and STOP into the machine; this engine sends no MIDI.";
	inline constexpr const char* g_noPlayFrom = "Playing from a song row needs MIDI Stop, the song position and Continue into the machine; "
		"this engine sends none.";
}
