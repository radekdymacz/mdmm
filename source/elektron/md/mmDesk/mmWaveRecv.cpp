#include "mmWaveRecv.h"

#include "mmRecv.h"

#include <algorithm>

namespace mmDesk
{
	namespace
	{
		// The rows of POS NAME: ORG or ALL, then the 64 positions. [UP] this often reaches the top from anywhere.
		constexpr int g_toTop = 66;

		// The SYSEX RECV macro up to the FILE menu's top row (RecvSession::enterMacro without its last four keys:
		// [DOWN] to SYSEX RECV, [ENTER], [RIGHT], [ENTER] on ORIG), then FILE's third row, DIGIPRO MGR, and MODE's top.
		std::vector<Key> toManager(const uint8_t _activeGlobal)
		{
			auto k = RecvSession::enterMacro(_activeGlobal);
			k.resize(k.size() - 4);
			k.insert(k.end(), {Key::Down, Key::Down, Key::Enter, Key::Left});
			for(int i = 0; i < 4; ++i)
				k.push_back(Key::Up);
			return k;
		}
	}

	std::vector<Key> WaveRecv::receiveMacro(const uint8_t _activeGlobal)
	{
		auto k = toManager(_activeGlobal);
		k.push_back(Key::Right);
		for(int i = 0; i < g_toTop; ++i)
			k.push_back(Key::Up);
		k.push_back(Key::Enter);	// ORG: WAITING
		return k;
	}

	std::vector<Key> WaveRecv::eraseMacro(const uint8_t _activeGlobal, const int _wave)
	{
		auto k = toManager(_activeGlobal);
		k.insert(k.end(), {Key::Down, Key::Down, Key::Right});	// MODE: ERASE
		for(int i = 0; i < g_toTop; ++i)
			k.push_back(Key::Up);
		for(int i = 0; i <= _wave && i < 64; ++i)	// ALL, then W01 ...
			k.push_back(Key::Down);
		k.insert(k.end(), {Key::Enter, Key::Enter});
		return k;
	}

	bool WaveRecv::isReceiveMacro(const std::vector<Key>& _keys)
	{
		for(uint8_t g = 0; g < 8; ++g)
			if(_keys == receiveMacro(g))
				return true;
		return false;
	}

	std::optional<int> WaveRecv::eraseMacroWave(const std::vector<Key>& _keys)
	{
		for(uint8_t g = 0; g < 8; ++g)
		{
			const auto prefix = toManager(g);
			if(_keys.size() < prefix.size() || !std::equal(prefix.begin(), prefix.end(), _keys.begin()))
				continue;
			for(int w = -1; w < 64; ++w)
				if(_keys == eraseMacro(g, w))
					return w;
		}
		return std::nullopt;
	}

	std::vector<Key> WaveRecv::exitKeys()
	{
		return RecvSession::exitKeys();
	}

	const char* WaveRecv::stateName() const
	{
		switch(m_state)
		{
		case State::Idle: return "idle";
		case State::ToMain: return "toMain";
		case State::Entering: return "entering";
		case State::Parked: return "parked";
		case State::Writing: return "writing";
		case State::Leaving: return "leaving";
		case State::Failed: return "failed";
		}
		return "?";
	}

	size_t WaveRecv::queued() const
	{
		size_t n = 0;
		for(const auto& j : m_jobs)
			n += j.erase ? 1 : j.dumps.size();
		return n;
	}

	void WaveRecv::press(Out& _out, std::vector<Key> _keys)
	{
		size_t states = 0;
		for(const auto k : _keys)
			states += static_cast<size_t>(keyStates(k));
		// each panel state is held 10 ms (the edge's timing), plus a margin
		m_keysDone = m_clock + 10.0 * static_cast<double>(states) + 100.0;
		_out.keys = std::move(_keys);
	}

	void WaveRecv::merge()
	{
		if(m_jobs.empty() || m_jobs.front().erase)
			return;
		while(m_jobs.size() > 1 && !m_jobs[1].erase)
		{
			for(auto& d : m_jobs[1].dumps)
				m_jobs.front().dumps.push_back(std::move(d));
			m_jobs.erase(m_jobs.begin() + 1);
		}
	}

	WaveRecv::Out WaveRecv::tick(const double _nowMs, const Telemetry& _t)
	{
		Out out;
		// The machine's time, as RecvSession: the keys run in emulator time, a slow runner gets the same time.
		const bool machineClock = _t.machineMs >= 0;
		const bool runs = machineClock ? _t.machineMs != m_lastMachineMs : _t.blocks == 0 || _t.blocks != m_lastBlocks;
		if(machineClock && m_lastMachineMs >= 0 && _t.machineMs > m_lastMachineMs)
			m_clock += _t.machineMs - m_lastMachineMs;
		else if(!machineClock && runs && m_lastNowMs >= 0 && _nowMs > m_lastNowMs)
			m_clock += _nowMs - m_lastNowMs;
		m_lastMachineMs = _t.machineMs;
		m_lastNowMs = _nowMs;
		m_lastBlocks = _t.blocks;
		if(!runs || !_t.valid)
			return out;
		const double now = m_clock;
		const bool keysDone = now >= m_keysDone;
		const bool onMain = _t.screen == Screen::Main;
		const bool onEdit = _t.screen == Screen::GlobalEdit;
		const auto giveUp = [&]
		{
			if(!m_jobs.empty())
				m_jobs.pop_front();
			out.gaveUp = true;
			go(State::Failed);
		};
		// B-195: the flash writes are counted from here: an erase's from its macro (the question's yes may start them),
		// a receive's from [EXIT/NO]
		const auto flashFromNow = [&]
		{
			m_flashWrites = _t.flashWrites;
			m_flashMoved = false;
			m_flashAt = now;
		};
		const auto macro = [&]
		{
			const auto& j = m_jobs.front();
			if(j.erase)
				flashFromNow();
			press(out, j.erase ? eraseMacro(static_cast<uint8_t>(activeGlobal & 7), j.wave) : receiveMacro(static_cast<uint8_t>(activeGlobal & 7)));
			go(State::Entering);
		};
		switch(m_state)
		{
		case State::Failed:
			if(now - m_since < 5000)
				break;
			go(State::Idle);
			[[fallthrough]];
		case State::Idle:
			if(m_jobs.empty())
				break;
			merge();
			m_attempts = 0;
			if(onMain)
				macro();
			else
			{
				press(out, exitKeys());
				go(State::ToMain);
			}
			break;
		case State::ToMain:
			if(!keysDone)
				break;
			if(onMain)
				macro();
			else if(now - m_keysDone > timeoutMs)
				giveUp();
			break;
		case State::Entering:
			if(!keysDone)
				break;
			if(onEdit && now - m_keysDone >= settleMs)
			{
				if(m_jobs.front().erase)
					go(State::Writing);	// the macro ended on the question's yes
				else
				{
					m_lastActivity = now;
					go(State::Parked);
				}
			}
			else if(now - m_keysDone > timeoutMs)
			{
				if(++m_attempts >= maxAttempts)
					giveUp();
				else
				{
					press(out, exitKeys());
					go(State::ToMain);
				}
			}
			break;
		case State::Parked:
			if(!onEdit)
			{
				// someone left the screen (the machine's own panel): what was sent may not be written
				giveUp();
				break;
			}
			merge();
			while(!m_jobs.front().dumps.empty())
			{
				out.sends.push_back(std::move(m_jobs.front().dumps.front()));
				m_jobs.front().dumps.pop_front();
				m_lastActivity = now;
			}
			if(now - m_lastActivity > quietMs)
			{
				press(out, writeKeys());
				flashFromNow();
				go(State::Writing);
			}
			break;
		case State::Writing:
		{
			bool written;
			if(_t.flashKnown)
			{
				// B-195: the firmware decides how long it writes: wait for its flash writes to start and end
				if(_t.flashWrites != m_flashWrites)
				{
					m_flashWrites = _t.flashWrites;
					m_flashMoved = true;
					m_flashAt = now;
				}
				written = (keysDone && m_flashMoved && now - m_flashAt > flashQuietMs) || now - m_since > writeMaxMs;
			}
			else
				written = now - m_since > (m_jobs.front().erase ? writeMs / 2 : writeMs);
			if(written)
			{
				press(out, exitKeys());
				go(State::Leaving);
			}
			break;
		}
		case State::Leaving:
			if(keysDone && (onMain || now - m_since > timeoutMs))
			{
				m_jobs.pop_front();
				out.finished = true;
				go(State::Idle);
			}
			break;
		}
		return out;
	}
}
