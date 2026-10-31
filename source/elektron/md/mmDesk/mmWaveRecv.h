#pragma once

#include "mmDeskTelemetry.h"

#include <cstdint>
#include <deque>
#include <optional>
#include <vector>

namespace mmDesk
{
	// The DIGIPRO MGR session (0.9 wave 2, doc/release/0.9/mm-digipro.md 5). The Monomachine MKII takes a waveform dump
	// (0x5D) only on GLOBAL > FILE > DIGIPRO MGR > RECEIVE, and erases a user waveform only on its panel (ERASE: no
	// message does it). On the emulator this session presses the keys, as RecvSession does for SYSEX RECV:
	//   a receive: EXIT to the main screen, the macro to RECEIVE > ORG (each dump lands at the position it carries),
	//     the dumps, [EXIT/NO] once the caller's stream is quiet (WRITING WAVEFORMS), a wait while the flash is written,
	//     EXIT back to the main screen;
	//   an erase: the macro to ERASE > the position (or ALL) > [ENTER] > [ENTER] (the question's yes), a wait, EXIT back.
	// One job at a time, in the order asked. The caller never runs it while SYSEX RECV is busy (and holds SYSEX RECV
	// while this runs). Its times are the machine's (Telemetry::machineMs), as RecvSession's. Pure: feed it the time and
	// the telemetry, it returns the keys to press and the dumps to send.
	class WaveRecv
	{
	public:
		using Bytes = std::vector<uint8_t>;

		enum class State
		{
			Idle,		// nothing to do
			ToMain,		// EXIT until the main screen
			Entering,	// the macro runs
			Parked,		// on RECEIVE: dumps go out
			Writing,	// [EXIT/NO] pressed: the machine writes the waveforms (or erases): wait
			Leaving,	// EXIT back to the main screen
			Failed		// the screen never came: what was asked is given up (Out::gaveUp)
		};

		struct Out
		{
			std::vector<Key> keys;
			std::vector<Bytes> sends;
			bool gaveUp = false;	// the job was dropped: the machine never showed GLOBAL EDIT after the macro
			bool finished = false;	// a job ended this tick (the caller reads the positions again)
		};

		// The path to DIGIPRO MGR: the SYSEX RECV macro's way into GLOBAL > FILE (RecvSession::enterMacro, the cursor to
		// the active global first, B-067), FILE's third row, [ENTER]; then MODE from the top (RECEIVE, SEND, ERASE,
		// RENAME), POS NAME from the top (ORG for RECEIVE, ALL for ERASE, then W01 to W64).
		static std::vector<Key> receiveMacro(uint8_t _activeGlobal = 0);
		// _wave 0-63, or -1 for ALL. Ends with [ENTER] (the question) and [ENTER] (yes).
		static std::vector<Key> eraseMacro(uint8_t _activeGlobal, int _wave);
		// The fakes' check: the macro for one of the eight slots; for an erase, its position (-1 ALL), else nothing.
		static bool isReceiveMacro(const std::vector<Key>& _keys);
		static std::optional<int> eraseMacroWave(const std::vector<Key>& _keys);
		static std::vector<Key> exitKeys();
		static std::vector<Key> writeKeys() { return {Key::Exit}; }	// [EXIT/NO] on WAITING: WRITING WAVEFORMS

		void want(Bytes _dump) { m_jobs.push_back({false, -1, {std::move(_dump)}}); }
		void erase(int _wave) { m_jobs.push_back({true, _wave, {}}); }
		// the stream still carries what was sent: the session stays parked
		void touch() { m_lastActivity = m_clock; }
		Out tick(double _nowMs, const Telemetry& _t);

		State state() const { return m_state; }
		const char* stateName() const;
		bool idle() const { return m_state == State::Idle && m_jobs.empty(); }
		// nothing asked and the panel left alone (idle, or the pause after a failure with nothing left)
		bool quiet() const { return m_jobs.empty() && (m_state == State::Idle || m_state == State::Failed); }
		// on its way to, on or back from DIGIPRO MGR: the panel is this session's (a job only queued is not: B-195)
		bool onPanel() const { return m_state != State::Idle && m_state != State::Failed; }
		size_t queued() const;
		double machineClock() const { return m_clock; }

		int activeGlobal = 0;
		double timeoutMs = 4000;	// a screen that does not come -> EXIT and try again, then give up
		double settleMs = 300;		// on GLOBAL EDIT this long after the macro's keys: RECEIVE waits (no RAM flag known)
		double quietMs = 600;		// parked, the last dump this long ago (and the stream quiet) -> [EXIT/NO]
		double writeMs = 8000;		// WRITING WAVEFORMS (P4 waited 8 s), or the erase's flash work
		int maxAttempts = 2;

	private:
		struct Job
		{
			bool erase = false;
			int wave = -1;
			std::deque<Bytes> dumps;
		};
		void go(State _s) { m_state = _s; m_since = m_clock; }
		void press(Out& _out, std::vector<Key> _keys);
		void merge();	// receives queued back to back go in one RECEIVE

		std::deque<Job> m_jobs;
		State m_state = State::Idle;
		double m_since = 0;
		double m_lastActivity = 0;
		double m_keysDone = 0;
		int m_attempts = 0;
		double m_clock = 0;
		double m_lastNowMs = -1;
		double m_lastMachineMs = -1;
		uint64_t m_lastBlocks = 0;
	};
}
