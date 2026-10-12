// 0.6 (LEARN, I-002): which MIDI messages become the page's midiIn notes (mdMidiIn.h), and the queue drops, never
// blocks, when it is full. Pure: no JUCE.
#include "mdMidiIn.h"

#include <cstdio>
#include <string>

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
	std::printf("mdMidiInTest: %s (%d failure(s))\n", g_failures ? "FAIL" : "PASS", g_failures);
	return g_failures ? 1 : 0;
}
