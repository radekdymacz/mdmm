#pragma once

// 0.6 (GLOBAL › Map editor › LEARN, I-002): the notes that reach the plug-in from outside (the host's MIDI in, a
// physical port), for the page's "midiIn" message ({"type":"midiIn","ch","note","vel"}: mdDeskSession.h). The
// processor keeps each note on in a bounded queue on the thread it arrives on (no lock, no allocation; a full queue
// drops it: a hint, not data), the session takes them on the message thread and sends them to the page. Pure: no JUCE.

#include "mdRealtimeQueue.h"

#include <cstdint>
#include <optional>

namespace mdJucePlugin::midiIn
{
	struct Note
	{
		uint8_t channel = 0;	// 0-15
		uint8_t note = 0;
		uint8_t velocity = 0;	// 1-127
	};

	// A note on (status 0x9n with a velocity above 0) as a Note; anything else (a note on of velocity 0 is a note off)
	// is none.
	inline std::optional<Note> noteOn(const uint8_t _status, const uint8_t _data1, const uint8_t _data2)
	{
		if((_status & 0xf0) != 0x90 || _data2 == 0 || _data1 > 127 || _data2 > 127)
			return {};
		return Note{static_cast<uint8_t>(_status & 0x0f), _data1, _data2};
	}

	using Queue = RealtimeQueue<Note, 64>;
}
