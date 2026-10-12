#pragma once

#include "elektronData/mdSong.h"

#include <cstddef>
#include <string>

namespace mdDesk
{
	// Wave 2, play from a song row: the Song Position Pointer that starts row _row of _song, in sixteenths (one step at
	// 1X). The Machinedrum counts the steps of the rows before it, each row's steps (end - start) times its plays
	// (repeats + 1), and lands on the row and the step (doc/modern-ux/PROBES-manual-gaps.md P1, SONG mode, CTRL IN on).
	// A row it cannot reach that way gives the reason instead: a LOOP or JUMP before it (the count would not say where
	// the song is), a row that is no pattern, a position past what the pointer holds. Pure.
	struct SongPosition
	{
		int sixteenths = 0;
		std::string refused;	// empty: the position is good
	};

	SongPosition songPositionOf(const elektronData::MdSong& _song, size_t _row);

	// Why the transport's extras are not here (the capabilities' reasons and the refusals).
	inline constexpr const char* g_noPanic = "The Machinedrum has no MIDI message that silences its voices (measured: Stop, CC 120 and "
		"123, reset, note offs): only its own STOP pressed twice does. Press STOP twice on the machine.";
	inline constexpr const char* g_noPlayFrom = "Playing from a song row needs MIDI Stop, the song position and Continue into the machine; "
		"this engine sends none.";
}
