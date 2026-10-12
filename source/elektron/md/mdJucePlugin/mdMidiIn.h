#pragma once

// 0.6 (GLOBAL › Map editor › LEARN, I-002): the notes that reach the plug-in from outside (the host's MIDI in, a
// physical port), for the page's "midiIn" message ({"type":"midiIn","ch","note","vel"}: mdDeskSession.h). The
// processor keeps each note on in a bounded queue on the thread it arrives on (no lock, no allocation; a full queue
// drops it: a hint, not data), the session takes them on the message thread and sends them to the page. The notes held
// (Held, below) go as a state instead ("midiHeld"), for the lit keys. Pure: no JUCE.

#include "mdRealtimeQueue.h"

#include <array>
#include <atomic>
#include <cstdint>
#include <optional>
#include <vector>

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

	// I-002, B-062: the notes held down from outside, for the page's "midiHeld" message ({"type":"midiHeld","notes"}):
	// the keys of the Monomachine's Perform keyboard light while a MIDI keyboard holds them. A state, not events: a
	// burst is never queued and a note off can never be lost (the queue above drops notes when it is full; a dropped
	// note off would leave a key lit). One bit a note and channel, set by a note on, cleared by its note off; CC 120
	// (all sound off) and 123 to 127 (all notes off and the mode messages, which end every note) clear the channel,
	// a system reset (0xFF) every channel. Written on the thread the MIDI arrives on, read on the message thread:
	// atomics only, no lock, no allocation.
	using Notes = std::array<uint64_t, 2>;	// bit n of word n / 64: note n held (on any channel)

	class Held
	{
	public:
		void onMidi(const uint8_t _status, const uint8_t _data1, const uint8_t _data2)
		{
			if(_status == 0xff)
			{
				clear();
				return;
			}
			const auto ch = _status & 0x0f;
			switch(_status & 0xf0)
			{
			case 0x90:
				if(_data1 > 127)
					return;
				if(_data2)
					word(ch, _data1).fetch_or(bit(_data1), std::memory_order_relaxed);
				else
					word(ch, _data1).fetch_and(~bit(_data1), std::memory_order_relaxed);
				return;
			case 0x80:
				if(_data1 <= 127)
					word(ch, _data1).fetch_and(~bit(_data1), std::memory_order_relaxed);
				return;
			case 0xb0:
				if(_data1 == 120 || _data1 >= 123)
					for(auto& w : m_bits[ch])
						w.store(0, std::memory_order_relaxed);
				return;
			default:
				return;
			}
		}

		// The notes held on any channel.
		Notes notes() const
		{
			Notes n{};
			for(const auto& ch : m_bits)
				for(size_t i = 0; i < n.size(); ++i)
					n[i] |= ch[i].load(std::memory_order_relaxed);
			return n;
		}

		void clear()
		{
			for(auto& ch : m_bits)
				for(auto& w : ch)
					w.store(0, std::memory_order_relaxed);
		}

	private:
		static uint64_t bit(const uint8_t _note) { return uint64_t{1} << (_note & 63); }
		std::atomic<uint64_t>& word(const int _ch, const uint8_t _note) { return m_bits[_ch][_note >> 6]; }
		std::array<std::array<std::atomic<uint64_t>, 2>, 16> m_bits{};
	};

	// The notes of a set, low to high.
	inline std::vector<int> list(const Notes& _notes)
	{
		std::vector<int> out;
		for(int n = 0; n < 128; ++n)
			if(_notes[n >> 6] & (uint64_t{1} << (n & 63)))
				out.push_back(n);
		return out;
	}

	// When the page is told: when the held notes changed since the last message, or the page is new (none sent yet).
	// Looked at every g_midiHeldMs (mdDeskSession.h), so a burst of notes is one message, never a flood.
	struct HeldFeed
	{
		std::optional<Notes> sent;	// none: a new page

		std::optional<Notes> next(const Notes& _now)
		{
			if(sent && *sent == _now)
				return std::nullopt;
			sent = _now;
			return _now;
		}
	};
}
