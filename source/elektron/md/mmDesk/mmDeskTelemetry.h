#pragma once

#include "elektronData/mmScreen.h"

#include <cstdint>
#include <vector>

namespace mmDesk
{
	// What a Monomachine device reports and takes (P6: the adapter interface's vocabulary, apart
	// from the SYSEX RECV state machine that one adapter uses).

	// Front-panel keys the desk presses (the edge maps them to md::PanelControl).
	enum class Key : uint8_t
	{
		Exit,
		Enter,
		Up,
		Down,
		Left,
		Right,
		Global,		// FUNCTION + KIT/SONG: the GLOBAL menu
		Play,
		Stop,
		Record,			// [RECORD] (MM-P4)
		MuteWindow,		// FUNCTION + BANK GROUP: the MUTE window
		Trig9, Trig10, Trig11, Trig12, Trig13, Trig14,	// TRIG 9-14: the MIDI tracks in the MUTE window
		LiveRecord,		// hold RECORD, press PLAY: LIVE RECORDING
		BankGroup,		// [BANK GROUP]: A-D / E-H (MM-P8, before a chain or pick in the other half)
		Transpose,		// FUNCTION + BANK B: the TRANSPOSE screen (B-060)
		Track1, Track2, Track3, Track4, Track5, Track6,	// [TRACK 1-6]: the track in focus (B-060)
		KnobUp, KnobDown,	// DATA ENTRY A one value step up or down: four pulses, as the menus take them (MM-P1, B-060)
		StepRecord,		// hold STOP, press RECORD: STEP RECORDING (0.6 wave 7, manual 1-50)
		ExitDown, ExitUp	// [EXIT/NO] held down, and let go later: LIVE RECORDING erases while it is held (manual 1-49)
	};

	// Keys pressed with another held: FUNCTION for Global, MuteWindow and Transpose, RECORD for LiveRecord, STOP for
	// StepRecord.
	constexpr bool isChord(const Key _k)
	{
		return _k == Key::Global || _k == Key::MuteWindow || _k == Key::LiveRecord || _k == Key::Transpose || _k == Key::StepRecord;
	}
	// DATA ENTRY A turned, not a key: g_knobPulses encoder pulses, each its own panel state.
	constexpr bool isKnob(const Key _k) { return _k == Key::KnobUp || _k == Key::KnobDown; }
	constexpr int g_knobPulses = 4;
	// Half a press: the key goes down (and stays) or comes up, one panel state.
	constexpr bool isHalf(const Key _k) { return _k == Key::ExitDown || _k == Key::ExitUp; }
	constexpr bool isRelease(const Key _k) { return _k == Key::ExitUp; }
	// The panel states a key takes (each held 10 ms): down and up, a chord's four, a knob's pulses, half a press's one.
	constexpr int keyStates(const Key _k) { return isChord(_k) ? 4 : isKnob(_k) ? g_knobPulses : isHalf(_k) ? 1 : 2; }
	// The key held for a chord: RECORD, STOP, else FUNCTION.
	constexpr bool heldIsRecord(const Key _k) { return _k == Key::LiveRecord; }
	constexpr bool heldIsStop(const Key _k) { return _k == Key::StepRecord; }

	using Screen = elektronData::MmScreen;

	// The firmware's pattern chain (MM-P8, md::MmTelemetry): hold BANK, press the TRIG keys (manual
	// 1-46). One bank, each pattern once, loops.
	struct Chain
	{
		bool active = false;
		int next = -1;						// the entry the firmware queues next, -1 unknown
		std::vector<uint8_t> patterns;		// 0-127, play order

		bool operator==(const Chain& _o) const { return active == _o.active && next == _o.next && patterns == _o.patterns; }
		bool operator!=(const Chain& _o) const { return !(*this == _o); }
	};

	// The machine as the desk sees it, from the audio thread (md::MmTelemetry).
	struct Telemetry
	{
		bool valid = false;
		uint64_t blocks = 0;		// audio blocks the emulator has run (it stands still while this does not move); 0 = unknown
		int step = -1;
		bool running = false;
		Screen screen = Screen::Unknown;
		uint32_t recvCount = 0;
		uint32_t recvErrors = 0;
		bool recvActive = false;	// SYSEX RECV takes dumps (RAM 0x26a3c3)
		int tempo = 0;				// BPM x 24 (RAM 0x2bc2a6), 0 = unknown
		int mutes = -1;				// bit t: synth track t, bit 6 + t: MIDI track t (RAM, MM-P4); -1 = unknown
		int recording = -1;			// 0 off, 1 GRID RECORDING (RAM 0x26bbb3), 2 LIVE RECORDING (0x2bff01), 3 STEP RECORDING
									// (0x2bff05); -1 = unknown
		int stepCursor = -1;		// STEP RECORDING: the step a note writes next (RAM 0x2bff09, 0-based); -1 = unknown
		int bankGroup = -1;			// MM-P8: BANK GROUP, 0 A-D, 1 E-H (RAM 0x70000b); -1 = unknown
		int songRow = -1;			// 0.3.5: the song row that plays (RAM 0x2bdba1, SONG mode); -1 = unknown
		bool chainKnown = false;	// MM-P8: the chain is readable (RAM 0x2bc2c4)
		Chain chain;
	};
}
