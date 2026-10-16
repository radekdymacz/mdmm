// 0.8 (WP4): mdMidiLoop.h, the MIDI loop warning (B-154) and the input note (B-155). No JUCE, no ROM, no ports.

#include "mdMidiLoop.h"

#include <cstdio>
#include <string>

namespace
{
	int g_failed = 0;
	void check(const bool _ok, const char* _what)
	{
		std::printf("%s %s\n", _ok ? "ok  " : "FAIL", _what);
		if(!_ok)
			++g_failed;
	}
	bool has(const std::string& _s, const char* _part) { return _s.find(_part) != std::string::npos; }
}

int main()
{
	using namespace mdJucePlugin;

	// the same port as input and output warns, with the port's name and what to do
	const auto iac = midiLoop::warning({"IAC Driver Bus 1"}, "IAC Driver Bus 1");
	check(!iac.empty(), "IAC Bus 1 as input and output warns");
	check(has(iac, "IAC Driver Bus 1") && has(iac, "IAC bus"), "the warning names the port and says IAC bus");
	check(has(iac, "Switch the input off"), "the warning says what to do");
	const auto loop = midiLoop::warning({"loopMIDI Port"}, "loopMIDI Port");
	check(has(loop, "loopMIDI port"), "loopMIDI as input and output warns");
	check(!midiLoop::warning({"Midi Through Port-0"}, "Midi Through Port-0").empty(), "Linux Midi Through in and out warns");
	// a real port in and out is two cables, not a loop: the main use case never sees the warning
	check(midiLoop::warning({"Elektron TM-1"}, "Elektron TM-1").empty(), "a hardware port in and out does not warn");
	check(midiLoop::warning({"USB MIDI Interface"}, "USB MIDI Interface").empty(), "a USB interface in and out does not warn");
	check(midiLoop::warning({"USB MIDI Interface", "USB MIDI Interface"}, "USB MIDI Interface").empty(), "two identical interfaces do not warn");

	// two buses, or an input that is off, or no output: no loop
	check(midiLoop::warning({"IAC Driver Bus 1"}, "IAC Driver Bus 2").empty(), "two buses do not warn");
	check(midiLoop::warning({"IAC Driver Bus 1", "Elektron TM-1"}, "IAC Driver Bus 2").empty(), "two inputs on, other output: none");
	check(midiLoop::warning({}, "IAC Driver Bus 1").empty(), "no input on: none");
	check(midiLoop::warning({"IAC Driver Bus 1"}, "").empty(), "no output: none");
	check(midiLoop::warning({}, "").empty(), "nothing: none");
	// one of several inputs is the output
	check(!midiLoop::warning({"Elektron TM-1", "IAC Driver Bus 1"}, "IAC Driver Bus 1").empty(), "one of two inputs loops");

	// the names compare the way a person reads them
	check(!midiLoop::warning({"  iac driver   bus 1 "}, "IAC Driver Bus 1").empty(), "case and spaces do not matter");
	check(midiLoop::warning({"IAC Driver Bus 1"}, "IAC Driver Bus 10").empty(), "Bus 1 is not Bus 10");
	check(midiLoop::normalised("  A   B ") == "a b", "normalised: trimmed, single spaces, lower case");
	check(midiLoop::familyOf("IAC Driver Bus 1") == midiLoop::Family::Iac, "family: IAC");
	check(midiLoop::familyOf("loopMIDI Port 2") == midiLoop::Family::LoopMidi, "family: loopMIDI");
	check(midiLoop::familyOf("Elektron TM-1") == midiLoop::Family::Hardware, "family: hardware");
	check(midiLoop::familyOf("Midi Through Port-0") == midiLoop::Family::Through, "family: Midi Through");

	// the input note (B-155)
	using audioInput::Permission;
	check(audioInput::note(Permission::Denied, true, false, "").find("Microphone") != std::string::npos,
		"denied microphone: the note names the Microphone setting");
	check(has(audioInput::note(Permission::Granted, true, false, "Device is busy"), "Device is busy"),
		"the setup error is shown");
	check(has(audioInput::note(Permission::NotAsked, true, false, ""), "asks for microphone access"),
		"not asked yet: macOS will ask");
	check(has(audioInput::note(Permission::Granted, true, false, ""), "no input channels"), "no channels: said so");
	check(audioInput::note(Permission::Granted, true, true, "").empty(), "an input that works has no note");
	check(audioInput::note(Permission::Denied, false, false, "").empty(), "nothing chosen: no note, even if denied");
	check(audioInput::note(Permission::Unknown, false, false, "").empty(), "unknown, nothing chosen: none");
	check(std::string(audioInput::name(Permission::Denied)) == "denied" && std::string(audioInput::name(Permission::Unknown)) == "unknown",
		"permission names");

	std::printf(g_failed ? "FAILED %d\n" : "PASS\n", g_failed);
	return g_failed ? 1 : 0;
}
