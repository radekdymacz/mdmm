#include "mmRecv.h"

namespace mmDesk
{
	// B-067: GLOBAL opens the SLOT screen with its cursor where it was left; ENTER opens the EDIT menu of the active
	// slot only, on any other it makes that slot active (measured, mmEditorProbeFirmwareTest globalactive). So the
	// cursor goes to the active slot first: up to the slot rows (TURBO is below them), left to slot 1, then over
	// (4 a row) and down. The arrows stop at the edges (no wrap: Left from slot 1 stays there).
	std::vector<Key> RecvSession::enterMacro(const uint8_t _activeGlobal)
	{
		const int slot = _activeGlobal & 7;
		std::vector<Key> k{Key::Global};
		for(int i = 0; i < 3; ++i) k.push_back(Key::Up);
		for(int i = 0; i < 4; ++i) k.push_back(Key::Left);
		for(int i = 0; i < slot % 4; ++i) k.push_back(Key::Right);
		for(int i = 0; i < slot / 4; ++i) k.push_back(Key::Down);
		k.push_back(Key::Enter);
		for(int i = 0; i < 4; ++i) k.push_back(Key::Left);
		for(int i = 0; i < 8; ++i) k.push_back(Key::Up);
		k.insert(k.end(), {Key::Down, Key::Down, Key::Right});
		for(int i = 0; i < 8; ++i) k.push_back(Key::Up);
		k.insert(k.end(), {Key::Down, Key::Enter, Key::Right, Key::Enter});
		return k;
	}

	bool RecvSession::isEnterMacro(const std::vector<Key>& _keys)
	{
		for(uint8_t g = 0; g < 8; ++g)
			if(_keys == enterMacro(g))
				return true;
		return false;
	}

	std::vector<Key> RecvSession::exitKeys()
	{
		return std::vector<Key>(6, Key::Exit);
	}

	const char* RecvSession::stateName() const
	{
		switch(m_state)
		{
		case State::Idle: return "idle";
		case State::ToMain: return "toMain";
		case State::Entering: return "entering";
		case State::Parked: return "parked";
		case State::Leaving: return "leaving";
		case State::Failed: return "failed";
		}
		return "?";
	}

	void RecvSession::failed(Out& _out, const double _now)
	{
		go(State::Failed, _now);
		if(++m_failures >= maxFailures)
			giveUp(_out, _now);
	}

	void RecvSession::park(const double _now, const Telemetry& _t)
	{
		m_lastActivity = _now;
		m_recvBase = m_taken = _t.recvCount + _t.recvErrors;
		m_sentParked = 0;
		go(State::Parked, _now);
	}

	void RecvSession::giveUp(Out& _out, const double _now)
	{
		for(const auto& s : m_queue)
			_out.gaveUp.push_back(s.tag);
		m_queue.clear();
		m_failures = 0;
		m_attempts = 0;
		// Stop driving the panel; after the pause, a new dump starts afresh.
		if(m_state != State::Parked && m_state != State::Leaving)
			go(State::Failed, _now);
	}

	RecvSession::Out RecvSession::tick(const double _nowMs, const Telemetry& _t)
	{
		Out out;
		// The machine's time: it stands still while the emulator does (its block count does not move).
		const bool runs = _t.blocks == 0 || _t.blocks != m_lastBlocks;
		if(runs && m_lastNowMs >= 0 && _nowMs > m_lastNowMs)
			m_clock += _nowMs - m_lastNowMs;
		m_lastNowMs = _nowMs;
		m_lastBlocks = _t.blocks;
		if(!runs)
			return out;
		const double now = m_clock;
		for(auto& s : m_queue)
			if(s.queuedMs < 0)
				s.queuedMs = now;
		if(!m_queue.empty() && now - m_queue.front().queuedMs > maxWaitMs)
			giveUp(out, now);
		if(!_t.valid)
			return out;
		m_taken = _t.recvCount + _t.recvErrors;
		const bool onRecv = onSysexRecv(_t);
		const bool keysDone = now >= m_keysDone;
		const bool onMain = _t.screen == Screen::Main;
		switch(m_state)
		{
		case State::Failed:
			if(now - m_since < 5000)
				break;
			m_attempts = 0;
			go(State::Idle, now);
			[[fallthrough]];
		case State::Idle:
			if(m_queue.empty())
				break;
			if(onRecv)
			{
				m_failures = 0;
				park(now, _t);
				break;
			}
			if(onMain)
			{
				out.keys = enterMacro(activeGlobal);
				go(State::Entering, now);
			}
			else
			{
				out.keys = exitKeys();
				go(State::ToMain, now);
			}
			break;
		case State::ToMain:
			if(!keysDone)
				break;
			if(onMain)
			{
				out.keys = enterMacro(activeGlobal);
				go(State::Entering, now);
			}
			else if(now - m_since > timeoutMs)
			{
				if(++m_attempts > 2)
					failed(out, now);
				else
				{
					out.keys = exitKeys();
					go(State::ToMain, now);
				}
			}
			break;
		case State::Entering:
			if(!keysDone)
				break;
			if(onRecv)
			{
				m_attempts = 0;
				m_failures = 0;
				park(now, _t);
			}
			else if(now - m_since > timeoutMs)
			{
				if(++m_attempts > 2)
					failed(out, now);
				else
				{
					out.keys = exitKeys();
					go(State::ToMain, now);
				}
			}
			break;
		case State::Parked:
			if(!onRecv)
			{
				// Someone left the screen (the panel): enter again when needed.
				go(State::Idle, now);
				break;
			}
			while(!m_queue.empty())
			{
				out.sends.push_back(std::move(m_queue.front()));
				m_queue.pop_front();
				m_lastActivity = now;
				++m_sentParked;
			}
			if(now - m_lastActivity > idleMs)
			{
				out.keys = exitKeys();
				go(State::Leaving, now);
			}
			break;
		case State::Leaving:
			if(keysDone && (onMain || now - m_since > timeoutMs))
				go(State::Idle, now);
			break;
		}
		// Each key is held 10 ms and released for 10 ms (the edge's timing), plus a margin.
		if(!out.keys.empty())
			m_keysDone = now + 20.0 * static_cast<double>(out.keys.size() + 1) + 60;
		return out;
	}
}
