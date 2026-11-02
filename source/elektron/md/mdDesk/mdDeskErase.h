#pragma once

// 0.9, the sample manager's Erase (MD-194, MD-198; doc/release/0.9/md-sample-manager.md, "Erase"). No SysEx or SDS message frees a
// sample slot, so the editor does what a person does at the machine's panel: SAMPLE MGR > ERASE > the slot > ENTER > ENTER. The
// route and the screens it must pass were measured on the firmware (mdSampleManagerProbeFirmwareTest, CI run 41320779646; the
// hashes below are those runs' screens). This file is pure: the screens as hashes, the key scripts as data, and the job that
// presses a key, looks at the screen and presses the next, or stops and leaves the menu with EXIT. Nothing here knows the device.

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace mdDesk::erase
{
	// The machine's LCD, 128 x 64, one bit a pixel, 16 bytes a row, bit 7 the left pixel (StudioLink::readLcd).
	constexpr uint32_t g_lcdWidth = 128;
	constexpr uint32_t g_lcdHeight = 64;
	constexpr size_t g_lcdBytes = g_lcdWidth * g_lcdHeight / 8;

	// What of a screen the job looks at. A list shows the samples' names and sizes, so its whole picture differs from machine to
	// machine; the header and the MODE column do not, and the prompt's area (right of the list, below the middle) is empty
	// in a list (44 lit pixels of its frame at most) and written on in the question and the progress bar (173 and 204).
	struct Screen
	{
		bool valid = false;
		uint64_t full = 0;		// every pixel
		uint64_t header = 0;	// the top 20 pixel rows
		uint64_t mode = 0;		// the MODE column and what is under it, x < 33, y >= 20
		uint64_t window = 0;	// the GLOBAL SLOT window, x 18..107, y 7..56 (see g_globalSlot)
		uint64_t lastLine = 0;	// the list's bottom line, x 34..82, y 53..59 (see g_allLine)
		uint32_t prompt = 0;	// lit pixels at x 90..121, y 34..61
		bool asked() const { return prompt > 100; }
	};
	Screen screenOf(const std::vector<uint8_t>& _lcd);
	// The hashes of a screen and the screen as text, two pixel rows to a character (' ' none, '\'' upper, ',' lower, '#' both: the
	// probe's LCD dump), for the log when a step did not find the screen it expected.
	std::string describe(const Screen& _screen);
	std::vector<std::string> textOf(const std::vector<uint8_t>& _lcd);

	// The screen a key must lead to; zero (or Any) is not looked at.
	struct Expect
	{
		enum class Prompt { Any, List, Asked };
		uint64_t full = 0;
		uint64_t header = 0;
		uint64_t mode = 0;
		uint64_t window = 0;
		uint64_t lastLine = 0;
		std::vector<uint64_t> alsoFull;	// other whole pictures that will do (full set)
		std::vector<uint64_t> alsoMode;	// other MODE columns that will do (mode set)
		std::vector<uint64_t> notMode;	// MODE columns that will not do (any mode)
		Prompt prompt = Prompt::Any;
		bool changes = false;	// the screen is not the one before the key
		bool matches(const Screen& _screen, const Screen& _before) const;
	};
	struct Step
	{
		std::string key;	// md::panelKeySequence's names
		Expect expect;
		// The machine keeps its menus' cursors from the last visit (CI run 41351441000: after an erase, ENTER on GLOBAL SLOT went
		// straight back to SAMPLE MGR in the third icon's list). A skippable step is not pressed when the screen already shows what it,
		// or a skippable step right after it, leads to: the job goes on after the furthest one shown.
		bool skippable = false;
		// > 0: the key is pressed until the screen shows until (looked at before the first press too), each press checked against
		// expect, at most repeat times; then the job stops.
		int repeat = 0;
		Expect until;
		double timeoutMs = 0;	// > 0: how long its screen is waited for (else g_timeoutMs)
	};

	// The screens (CI run 41320779646). ROM-01's list is the first line; the list has 53 lines (48 ROM slots, four RAM, ALL) and wraps.
	// FUNCTION + PATTERN/SONG opens GLOBAL SLOT as a window over the main screen: around it the main screen stays (the kit, the
	// pattern, the tempo, the knobs), so the whole picture is the probe's (8f0127d987a97ffe) only on a machine in the probe's state
	// (CI run 41336239454: the editor's machine after 200 journeys never showed it). The window itself (opaque, x 18..107, y 7..56:
	// its title, the picture, SLOT and the eight slots, the model and OS 1.63) is looked at. The screens after ENTER fill the LCD.
	constexpr uint64_t g_globalSlot = 0x81b5251c69b0fea3ull;	// the window of FUNCTION + PATTERN/SONG
	constexpr uint64_t g_sampleMgrHeader = 0x80e88139dbf35073ull;	// FILE / SAMPLE MGR, whatever the list holds
	constexpr uint64_t g_modeReceive = 0x0d177bc64aa2bbdfull;	// the MODE column's cursor on RECEIVE, SEND, RENAME, ERASE ...
	constexpr uint64_t g_modeSend = 0xa73cfcb9e7a04a1dull;
	constexpr uint64_t g_modeRename = 0x079f66ca4b909da7ull;
	constexpr uint64_t g_modeErase = 0x49bec92e1e8394b5ull;
	constexpr uint64_t g_modeList = 0xdd6517ab81991727ull;	// ... and with the cursor in the NAME/SIZE list
	// SAMPLE MGR with its header drawn and nothing under it yet (CI run 41362123236: still so 2.5 s after ENTER on the runner).
	constexpr uint64_t g_modeBlank = 0xe163beea609062e6ull;
	constexpr double g_sampleMgrMs = 15000;	// how long SAMPLE MGR's body is waited for
	// The list's bottom line with the cursor on ALL (the probe's 703dd3e87cc7b997: the inverted bar reads ALL). ALL is the last line,
	// and the cursor reaches it only by UP from ROM-01 (the list wraps), so it is shown at the bottom then. Any other line there
	// (a RAM slot, a ROM slot's number, name and size, or no cursor) gives another hash.
	constexpr uint64_t g_allLine = 0x745627c74dd742d3ull;
	constexpr int g_listLines = 53;

	// From the main screen to the list of ERASE, the cursor on ALL: EXIT x3, FUNCTION + PATTERN/SONG (GLOBAL SLOT), ENTER (GLOBAL 1 EDIT),
	// DOWN x2 (the third icon), RIGHT (its list), DOWN x2 (SAMPLE MGR), ENTER (its body drawn), LEFT (the cursor into the MODE column:
	// SAMPLE MGR may open with it in the list, CI run 41362123236; LEFT in the column does nothing), DOWN x3 in the MODE column (DOWN
	// stays on ERASE), RIGHT, UP until ALL. The steps after the first ENTER of GLOBAL 1 EDIT and of SAMPLE MGR are skipped when the machine shows their screen
	// already (it keeps its cursors); the list's cursor is wherever the last visit left it, so it is brought to ALL, never assumed.
	std::vector<Step> routeToList();
	// ... then DOWN (the list wraps to ROM-01), DOWN to ROM slot _slot (0-47), ENTER (the question), ENTER (erases).
	std::vector<Step> scriptOne(uint8_t _slot);
	// ... then ENTER, ENTER on ALL. Proven on the firmware (CI run 41321610226: every ROM slot 0, samples used 0; the RAM slots were
	// empty in that run, so whether ALL touches them is not known). No undo: 32 slots are more than the 16 steps the editor keeps, so
	// the person is told before.
	std::vector<Step> scriptAll();
	constexpr bool g_eraseAllProven = true;

	// The keys a stopped or finished job ends with. FUNCTION is let go first when a stop found it held; never an ENTER.
	constexpr int g_leaveExits = 6;

	// Times, in the clock the job is given (milliseconds). A key is pressed and held in machine time (two 40 ms packets), the LCD
	// follows within a frame; a checked step is looked at from g_lookMs on until it shows what it must or g_timeoutMs ends it.
	constexpr double g_lookMs = 120;
	constexpr double g_quietMs = 250;	// a step with nothing to look at
	constexpr double g_timeoutMs = 2500;
	constexpr double g_settleMs = 1500;	// after the last ENTER: the machine writes its flash
	constexpr double g_leaveMs = 200;	// between the leaving keys

	class Job
	{
	public:
		enum class State { Running, Finished, Stopped };
		using Press = std::function<bool(const std::string& _key)>;

		explicit Job(std::vector<Step> _script);

		// Called every tick with the clock and the screen as it is now (not valid: it cannot be read). Presses at most one key.
		State step(double _nowMs, const Screen& _screen, const Press& _press);

		State state() const { return m_state; }
		// Why it stopped, in words for the person ("" while it runs or after it finished).
		const std::string& why() const { return m_why; }
		// When a step did not find its screen: what it saw and what it expected (hashes), for the log; "" otherwise.
		const std::string& seen() const { return m_seen; }
		// The last key of the script (the one that erases) has been pressed: the bank must be looked at, whatever the job says.
		bool erasing() const { return m_erasing; }
		size_t position() const { return m_next; }
		size_t size() const { return m_script.size(); }

	private:
		void stop(std::string _why);
		bool pressKey(const std::string& _key, const Press& _press);

		std::vector<Step> m_script;
		size_t m_next = 0;				// the next step to press
		bool m_waiting = false;			// its key is pressed, the screen is being looked at
		double m_pressedAt = 0;
		Screen m_before;
		bool m_functionHeld = false;
		bool m_erasing = false;
		bool m_settled = false;			// the script is through, the leaving keys follow after g_settleMs
		State m_state = State::Running;
		std::string m_why;
		std::string m_seen;
		int m_repeated = 0;				// presses of the repeat step under way
		bool m_leaving = false;
		std::vector<std::string> m_leave;
		size_t m_leaveNext = 0;
		double m_leaveAt = 0;
		State m_after = State::Finished;	// what the job is when the leaving keys are through
	};
}
