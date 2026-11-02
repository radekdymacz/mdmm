#include "mdDeskErase.h"

#include <algorithm>
#include <cstdio>
#include <utility>

namespace mdDesk::erase
{
	namespace
	{
		bool lit(const std::vector<uint8_t>& _lcd, const uint32_t _x, const uint32_t _y)
		{
			return (_lcd[_y * 16 + _x / 8] & (0x80u >> (_x & 7))) != 0;
		}

		// FNV-1a over the pixels (1 lit, 0 not) of a region in row-major order: the probe's hash (mdSampleManagerProbeFirmwareTest).
		template<typename Inside>
		uint64_t hashOf(const std::vector<uint8_t>& _lcd, const Inside& _inside)
		{
			uint64_t h = 1469598103934665603ull;
			for(uint32_t y = 0; y < g_lcdHeight; ++y)
				for(uint32_t x = 0; x < g_lcdWidth; ++x)
					if(_inside(x, y))
						h = (h ^ (lit(_lcd, x, y) ? 1u : 0u)) * 1099511628211ull;
			return h;
		}

		bool unchecked(const Expect& _e)
		{
			return !_e.full && !_e.header && !_e.mode && !_e.window && !_e.lastLine && _e.prompt == Expect::Prompt::Any && !_e.changes;
		}

		Expect keyed(const uint64_t _full)
		{
			Expect e;
			e.full = _full;
			return e;
		}

		Expect windowed(const uint64_t _window)
		{
			Expect e;
			e.window = _window;
			return e;
		}

		std::string hex(const uint64_t _v)
		{
			char t[20];
			std::snprintf(t, sizeof(t), "%016llx", static_cast<unsigned long long>(_v));
			return t;
		}

		std::string describeExpect(const Expect& _e)
		{
			std::string s;
			if(_e.full)
				s += " full " + hex(_e.full);
			if(_e.header)
				s += " header " + hex(_e.header);
			if(_e.mode)
				s += " mode " + hex(_e.mode);
			if(_e.window)
				s += " window " + hex(_e.window);
			if(_e.lastLine)
				s += " lastLine " + hex(_e.lastLine);
			for(const auto f : _e.alsoFull)
				s += " or full " + hex(f);
			for(const auto m : _e.alsoMode)
				s += " or mode " + hex(m);
			for(const auto m : _e.notMode)
				s += " not mode " + hex(m);
			if(_e.prompt != Expect::Prompt::Any)
				s += _e.prompt == Expect::Prompt::Asked ? " prompt asked" : " prompt list";
			if(_e.changes)
				s += " changed";
			return s;
		}

		Expect inSampleMgr(const uint64_t _mode, const Expect::Prompt _prompt = Expect::Prompt::Any, const bool _changes = false)
		{
			Expect e;
			e.header = g_sampleMgrHeader;
			e.mode = _mode;
			e.prompt = _prompt;
			e.changes = _changes;
			return e;
		}
	}

	Screen screenOf(const std::vector<uint8_t>& _lcd)
	{
		Screen s;
		if(_lcd.size() < g_lcdBytes)
			return s;
		s.valid = true;
		s.full = hashOf(_lcd, [](uint32_t, uint32_t) { return true; });
		s.header = hashOf(_lcd, [](uint32_t, const uint32_t _y) { return _y < 20; });
		s.mode = hashOf(_lcd, [](const uint32_t _x, const uint32_t _y) { return _y >= 20 && _x < 33; });
		s.window = hashOf(_lcd, [](const uint32_t _x, const uint32_t _y) { return _x >= 18 && _x <= 107 && _y >= 7 && _y <= 56; });
		s.lastLine = hashOf(_lcd, [](const uint32_t _x, const uint32_t _y) { return _x >= 34 && _x <= 82 && _y >= 53 && _y <= 59; });
		for(uint32_t y = 34; y < 62; ++y)
			for(uint32_t x = 90; x < 122; ++x)
				s.prompt += lit(_lcd, x, y) ? 1u : 0u;
		return s;
	}

	std::string describe(const Screen& _screen)
	{
		if(!_screen.valid)
			return "no screen";
		return "full " + hex(_screen.full) + " header " + hex(_screen.header) + " mode " + hex(_screen.mode) + " window " + hex(_screen.window)
			+ " lastLine " + hex(_screen.lastLine) + " prompt " + std::to_string(_screen.prompt);
	}

	std::vector<std::string> textOf(const std::vector<uint8_t>& _lcd)
	{
		std::vector<std::string> rows;
		if(_lcd.size() < g_lcdBytes)
			return rows;
		for(uint32_t y = 0; y < g_lcdHeight; y += 2)
		{
			std::string row;
			for(uint32_t x = 0; x < g_lcdWidth; ++x)
			{
				const bool up = lit(_lcd, x, y), down = lit(_lcd, x, y + 1);
				row += up ? (down ? '#' : '\'') : (down ? ',' : ' ');
			}
			while(!row.empty() && row.back() == ' ')
				row.pop_back();
			rows.push_back(row);
		}
		return rows;
	}

	bool Expect::matches(const Screen& _screen, const Screen& _before) const
	{
		if(!_screen.valid)
			return false;
		const auto either = [](const uint64_t _v, const uint64_t _want, const std::vector<uint64_t>& _also)
		{
			return _v == _want || std::find(_also.begin(), _also.end(), _v) != _also.end();
		};
		if(full && !either(_screen.full, full, alsoFull))
			return false;
		if(header && _screen.header != header)
			return false;
		if(mode && !either(_screen.mode, mode, alsoMode))
			return false;
		if(std::find(notMode.begin(), notMode.end(), _screen.mode) != notMode.end())
			return false;
		if(window && _screen.window != window)
			return false;
		if(lastLine && _screen.lastLine != lastLine)
			return false;
		if(prompt == Prompt::List && _screen.asked())
			return false;
		if(prompt == Prompt::Asked && !_screen.asked())
			return false;
		if(changes && _screen.full == _before.full)
			return false;
		return true;
	}

	std::vector<Step> routeToList()
	{
		std::vector<Step> s;
		for(int i = 0; i < 3; ++i)
			s.push_back({"exit", {}});
		s.push_back({"hold:function", {}});
		s.push_back({"patternSong", windowed(g_globalSlot)});
		s.push_back({"release:function", windowed(g_globalSlot)});
		// GLOBAL 1 EDIT, on its first icon on a fresh machine, else where the last visit left it (one of the route's screens)
		const std::vector<uint64_t> global = {0x3b2b98d365761c6cull, 0x30d97f2d652ec45full, 0xdc8b47903cd13bc3ull, 0x14660a6e19a622f1ull,
			0x05db12553f74517dull, 0xb035a8f846ff3715ull};
		Expect edit = keyed(global[0]);
		edit.alsoFull.assign(global.begin() + 1, global.end());
		s.push_back({"enter", edit});
		const char* keys[] = {"down", "down", "right", "down", "down"};	// the third icon, its list, SAMPLE MGR
		for(size_t i = 0; i < 5; ++i)
		{
			Step k{keys[i], keyed(global[i + 1])};
			k.skippable = true;
			s.push_back(k);
		}
		// SAMPLE MGR, its body drawn: the MODE column's cursor on RECEIVE on a fresh machine, else where it was left, maybe in the list
		// (CI run 41362123236: SEND picked, the cursor on the list's second line). LEFT puts it in the MODE column, on the mode picked
		Expect body;
		body.header = g_sampleMgrHeader;
		body.notMode = {g_modeBlank};
		Step enter{"enter", body};
		enter.timeoutMs = g_sampleMgrMs;
		s.push_back(enter);
		Expect sampleMgr = inSampleMgr(g_modeReceive);
		sampleMgr.alsoMode = {g_modeSend, g_modeRename, g_modeErase};
		s.push_back({"left", sampleMgr});
		for(const auto m : {g_modeSend, g_modeRename, g_modeErase})
		{
			Step k{"down", inSampleMgr(m)};
			k.skippable = true;
			s.push_back(k);
		}
		s.push_back({"right", inSampleMgr(g_modeList, Expect::Prompt::List)});	// the list, on the line last left (ROM-01 when fresh)
		Step all{"up", inSampleMgr(g_modeList, Expect::Prompt::List, true)};
		all.repeat = g_listLines;
		all.until = inSampleMgr(g_modeList, Expect::Prompt::List);
		all.until.lastLine = g_allLine;
		s.push_back(all);	// UP until ALL (the list wraps from ROM-01 to ALL)
		return s;
	}

	std::vector<Step> scriptOne(const uint8_t _slot)
	{
		auto s = routeToList();
		s.push_back({"down", inSampleMgr(g_modeList, Expect::Prompt::List, true)});	// from ALL round to ROM-01
		for(uint8_t i = 0; i < _slot; ++i)
			s.push_back({"down", inSampleMgr(g_modeList, Expect::Prompt::List, true)});
		s.push_back({"enter", inSampleMgr(g_modeList, Expect::Prompt::Asked, true)});	// the question
		s.push_back({"enter", inSampleMgr(g_modeList, Expect::Prompt::Asked, true)});	// the progress bar
		return s;
	}

	std::vector<Step> scriptAll()
	{
		auto s = routeToList();	// the cursor on ALL
		s.push_back({"enter", inSampleMgr(g_modeList, Expect::Prompt::Asked, true)});
		s.push_back({"enter", inSampleMgr(g_modeList, Expect::Prompt::Asked, true)});
		return s;
	}

	Job::Job(std::vector<Step> _script) : m_script(std::move(_script))
	{
	}

	bool Job::pressKey(const std::string& _key, const Press& _press)
	{
		if(!_press || !_press(_key))
			return false;
		if(_key == "hold:function")
			m_functionHeld = true;
		else if(_key == "release:function")
			m_functionHeld = false;
		return true;
	}

	void Job::stop(std::string _why)
	{
		if(m_leaving)
			return;
		m_why = std::move(_why);
		m_leaving = true;
		m_after = State::Stopped;
		m_leave.clear();
		if(m_functionHeld)
			m_leave.emplace_back("release:function");
		for(int i = 0; i < g_leaveExits; ++i)
			m_leave.emplace_back("exit");
		m_leaveNext = 0;
		m_leaveAt = -1e12;
	}

	Job::State Job::step(const double _nowMs, const Screen& _screen, const Press& _press)
	{
		if(m_state != State::Running)
			return m_state;

		if(m_leaving)
		{
			if(_nowMs - m_leaveAt < g_leaveMs)
				return m_state;
			if(m_leaveNext >= m_leave.size())
			{
				m_state = m_after;
				return m_state;
			}
			if(!pressKey(m_leave[m_leaveNext], _press))
			{
				m_state = m_after;	// the panel is gone: nothing more to press
				return m_state;
			}
			++m_leaveNext;
			m_leaveAt = _nowMs;
			return m_state;
		}

		if(!_screen.valid)
		{
			stop("The machine's screen cannot be read.");
			return m_state;
		}

		if(m_settled)
		{
			if(_nowMs - m_pressedAt < g_settleMs)
				return m_state;
			m_leaving = true;
			m_after = State::Finished;
			m_leave.assign(static_cast<size_t>(g_leaveExits), "exit");
			m_leaveNext = 0;
			m_leaveAt = -1e12;
			return m_state;
		}

		if(m_waiting)
		{
			const auto& done = m_script[m_next - 1];
			const double since = _nowMs - m_pressedAt;
			if(unchecked(done.expect))
			{
				if(since < g_quietMs)
					return m_state;
			}
			else
			{
				if(since < g_lookMs)
					return m_state;
				if(!done.expect.matches(_screen, m_before))
				{
					if(since < (done.timeoutMs > 0 ? done.timeoutMs : g_timeoutMs))
						return m_state;
					m_seen = "step " + std::to_string(m_next) + " " + done.key + ": saw " + describe(_screen) + "; expected" + describeExpect(done.expect);
					stop("The machine's screen was not the one expected after the key " + done.key + " (step " + std::to_string(m_next) + " of "
						+ std::to_string(m_script.size()) + ").");
					return m_state;
				}
			}
			m_waiting = false;
			if(done.repeat > 0)
			{
				if(!done.until.matches(_screen, m_before))
				{
					if(m_repeated >= done.repeat)
					{
						m_seen = "step " + std::to_string(m_next) + " " + done.key + " x" + std::to_string(m_repeated) + ": saw " + describe(_screen)
							+ "; expected" + describeExpect(done.until);
						stop("The machine's screen did not show what " + std::to_string(m_repeated) + " presses of " + done.key + " lead to (step "
							+ std::to_string(m_next) + " of " + std::to_string(m_script.size()) + ").");
						return m_state;
					}
					--m_next;	// the same key again
				}
				else
					m_repeated = 0;
			}
			if(m_next >= m_script.size())
			{
				m_settled = true;
				m_pressedAt = _nowMs;
				return m_state;
			}
		}

		// the machine already shows what the next skippable steps lead to: on after the furthest one shown
		if(m_next < m_script.size() && m_script[m_next].skippable)
		{
			size_t shown = m_script.size();
			for(size_t k = m_next; k < m_script.size() && m_script[k].skippable; ++k)
				if(m_script[k].expect.matches(_screen, _screen))
					shown = k;
			if(shown < m_script.size())
				m_next = shown + 1;
		}
		// a repeat step whose screen is there before its first press is done
		if(m_next < m_script.size() && m_script[m_next].repeat > 0 && m_repeated == 0 && m_script[m_next].until.matches(_screen, _screen))
			++m_next;

		if(m_next >= m_script.size())
		{
			m_settled = true;
			m_pressedAt = _nowMs;
			return m_state;
		}
		const auto& next = m_script[m_next];
		m_before = _screen;	// the screen the key leaves (a key may change what _screen refers to)
		if(!pressKey(next.key, _press))
		{
			stop("The machine took no panel key (" + next.key + ").");
			return m_state;
		}
		m_erasing = m_next + 1 >= m_script.size();
		if(next.repeat > 0)
			++m_repeated;
		++m_next;
		m_waiting = true;
		m_pressedAt = _nowMs;
		return m_state;
	}
}
