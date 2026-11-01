#pragma once

#include "mmDeskTelemetry.h"

#include <cstdint>
#include <deque>
#include <string>
#include <vector>

namespace mmDesk
{
	// On SYSEX RECV and taking dumps: the screen word says GLOBAL EDIT and the
	// receive flag is set (MM-P2-RESULT §2).
	inline bool onSysexRecv(const Telemetry& _t) { return _t.screen == Screen::GlobalEdit && _t.recvActive; }

	// The SYSEX RECV session. The Monomachine takes a dump only on GLOBAL > FILE >
	// SYSEX RECV. The session drives the panel there when there is something to
	// send, sends while parked (the machine keeps playing, MM-P0 §3), and leaves
	// after an idle time. A screen that never comes is retried after a pause, maxFailures
	// times; then (or once the oldest dump waited maxWaitMs, telemetry or not) the session
	// gives up what it holds and says whose it was (Out::gaveUp), so the caller can fail
	// those pushes and the panel is left alone. Its times are the machine's: they move only
	// with Telemetry::machineMs, so a slow runner gets the same time to press its keys and a host that stops
	// processing fails nothing that would go out on resume. Without that clock, blocks gate the caller's time.
	// Pure: feed it the time and
	// the telemetry, it returns the keys to press and the dumps to send.
	class RecvSession
	{
	public:
		// the session's machine time (Telemetry::machineMs, or the caller's time while blocks move)
		double machineClock() const { return m_clock; }
		enum class State
		{
			Idle,		// not on SYSEX RECV, nothing to send
			ToMain,		// EXIT until the main screen, then the macro
			Entering,	// the macro runs
			Parked,		// on SYSEX RECV: dumps go out
			Leaving,	// EXIT back to the main screen
			Failed		// the screen never came; retried after a pause (or given up: see maxFailures)
		};

		// A dump to send and whose it is (the caller's tag: which push it answers).
		struct Send
		{
			std::vector<uint8_t> bytes;
			uint32_t tag = 0;
			double queuedMs = -1;	// machine time it was first seen in the queue (-1: not yet)
		};

		struct Out
		{
			std::vector<Key> keys;
			std::vector<Send> sends;
			std::vector<uint32_t> gaveUp;	// the tags of the dumps given up (never sent): the screen never came
		};

		// The path: GLOBAL, the SLOT screen's cursor to the active global, ENTER (its EDIT menu), cursor to a known
		// place, FILE, SYSEX RECV, ORIG. ENTER on another slot would make that one active (B-067).
		static std::vector<Key> enterMacro(uint8_t _activeGlobal = 0);
		// _keys are the macro for one of the eight slots (the fakes' check)
		static bool isEnterMacro(const std::vector<Key>& _keys);
		static std::vector<Key> exitKeys();

		void want(std::vector<uint8_t> _dump, const uint32_t _tag = 0) { m_queue.push_back({std::move(_dump), _tag, -1}); }
		// Keeps the session parked a while longer (an edit is coming).
		void touch() { m_lastActivity = m_clock; }
		Out tick(double _now, const Telemetry& _t);

		State state() const { return m_state; }
		const char* stateName() const;
		size_t queued() const { return m_queue.size(); }
		bool parked() const { return m_state == State::Parked; }
		// Parked and a dump sent is not taken yet (the machine's RECV count, messages and errors, has not caught up), or
		// one waits to go out on the next tick (B-099: a key pressed in the tick the session parked went to the machine
		// before the dump and was lost): a panel key pressed now is lost (measured, mmDeskFirmwareTest parked, undoplay);
		// once taken, keys work on SYSEX RECV.
		// The count moves as the dump arrives; a key the machine gets within a few ms after is still lost (measured: 10 ms
		// lost, 20 ms taken), so the session says taking for settleMs more.
		bool taking() const { return parked() && (!m_queue.empty() || m_taken - m_recvBase < m_sentParked || m_clock - m_takenMs < settleMs); }

		int activeGlobal = 0;		// the GLOBAL slot that is active (0-7): the macro's cursor goes there (B-067)
		double idleMs = 3000;		// parked and quiet this long -> leave
		double timeoutMs = 3000;	// a screen that does not come -> retry
		int maxFailures = 2;		// failed tries (each three attempts, then a pause) before the queue is given up
		double maxWaitMs = 45000;	// a dump queued this long and not sent is given up, whatever the screen says
		double settleMs = 60;		// after the machine's RECV count moved, keys wait this long (B-099)

	private:
		void go(State _s, double _now) { m_state = _s; m_since = _now; }
		void park(double _now, const Telemetry& _t);
		void failed(Out& _out, double _now);
		void giveUp(Out& _out, double _now);

		std::deque<Send> m_queue;
		State m_state = State::Idle;
		double m_since = 0;
		double m_lastActivity = 0;
		int m_attempts = 0;
		int m_failures = 0;			// failed tries since the screen last came
		double m_clock = 0;			// machine time: moves with the caller's clock only while the emulator runs
		double m_lastNowMs = -1;
		double m_lastMachineMs = -1;
		uint64_t m_lastBlocks = 0;
		double m_keysDone = 0;	// the keys pressed last are through by then
		uint32_t m_recvBase = 0;	// the machine's RECV count (messages and errors) when the session parked
		uint32_t m_taken = 0;		// that count now
		uint32_t m_sentParked = 0;	// dumps sent since the session parked
		double m_takenMs = -1e9;	// machine time the RECV count last moved while parked
	};
}
