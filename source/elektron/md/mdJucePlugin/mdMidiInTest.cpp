// 0.6 (LEARN, I-002): which MIDI messages become the page's midiIn notes (mdMidiIn.h), and the queue drops, never
// blocks, when it is full. Pure: no JUCE.
#include "mdMidiIn.h"

#include <cstdio>
#include <string>
#include <vector>

namespace
{
	int g_failures = 0;
	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}
	using namespace mdJucePlugin::midiIn;
}

int main()
{
	std::printf("mdMidiInTest\n");
	const auto n = noteOn(0x93, 60, 100);
	check(n && n->channel == 3 && n->note == 60 && n->velocity == 100, "a note on: its channel, note and velocity");
	check(!noteOn(0x93, 60, 0), "a note on of velocity 0 is a note off: none");
	check(!noteOn(0x83, 60, 64), "a note off: none");
	check(!noteOn(0xb0, 7, 100) && !noteOn(0xf8, 0, 0) && !noteOn(0xe0, 0, 64), "a CC, the clock, a pitch bend: none");
	Queue q;
	int taken = 0;
	for(int i = 0; i < 100; ++i)
		taken += q.tryPush(Note{0, static_cast<uint8_t>(i), 1});
	check(taken == 64, "the queue keeps 64 and drops the rest (" + std::to_string(taken) + ")");
	Note out;
	check(q.tryPop(out) && out.note == 0, "first in, first out");
	// I-002, B-062: the notes held, as a state (the Perform keyboard's lit keys)
	{
		Held h;
		const auto has = [&](const int _n) { return (h.notes()[_n >> 6] >> (_n & 63)) & 1; };
		h.onMidi(0x90, 60, 100);
		h.onMidi(0x93, 127, 1);
		h.onMidi(0x90, 0, 64);
		check(list(h.notes()) == std::vector<int>{0, 60, 127}, "note ons on any channel are held: 0, 60, 127");
		h.onMidi(0x80, 60, 64);
		check(!has(60) && has(0), "a note off lets go of its note only");
		h.onMidi(0x90, 0, 0);
		check(!has(0), "a note on of velocity 0 lets go too");
		h.onMidi(0x90, 64, 100);
		h.onMidi(0x91, 64, 100);
		h.onMidi(0x80, 64, 0);
		check(has(64), "a note held on two channels stays held until both let go");
		h.onMidi(0x81, 64, 0);
		check(!has(64), "and goes when the second lets go");
		h.onMidi(0x92, 40, 100);
		h.onMidi(0x92, 41, 100);
		h.onMidi(0xb2, 7, 100);
		check(has(40) && has(41), "a CC other than the all-notes ones changes nothing");
		h.onMidi(0xb2, 123, 0);
		check(!has(40) && !has(41) && has(127), "all notes off (CC 123) clears its channel only");
		h.onMidi(0x95, 50, 100);
		h.onMidi(0xb5, 120, 0);
		check(!has(50), "all sound off (CC 120) too");
		h.onMidi(0xff, 0, 0);
		check(list(h.notes()).empty(), "a system reset clears every channel");
		h.onMidi(0x90, 200, 100);
		h.onMidi(0xe0, 60, 64);
		check(list(h.notes()).empty(), "a note above 127 and a pitch bend hold nothing");

		HeldFeed f;
		const Notes none{};
		check(f.next(none).has_value(), "a new page is told, even of no notes");
		check(!f.next(none), "the same notes again: nothing");
		check(f.next(Notes{uint64_t{1} << 60, 0}).has_value() && !f.next(Notes{uint64_t{1} << 60, 0}), "a change is told once");
		for(int i = 0; i < 1000; ++i)
			h.onMidi(static_cast<uint8_t>(i & 1 ? 0x80 : 0x90), static_cast<uint8_t>((i / 2) % 128), 100);
		check(list(h.notes()).empty(), "a burst of 1000 notes on and off leaves none held (nothing queued, nothing lost)");
	}
	std::printf("mdMidiInTest: %s (%d failure(s))\n", g_failures ? "FAIL" : "PASS", g_failures);
	return g_failures ? 1 : 0;
}
