#include "deskLearn.h"

#include <algorithm>
#include <cmath>

namespace deskCore
{
	namespace json = elektronData::json;

	namespace
	{
		bool isWhole(const json::Value* _v, const int _min, const int _max, int& _out)
		{
			if(!_v || !_v->isNumber())
				return false;
			const double d = _v->asNumber();
			if(d != std::floor(d) || d < _min || d > _max)
				return false;
			_out = static_cast<int>(d);
			return true;
		}

		std::string at(const std::string& _path, const size_t _i)
		{
			return _path + "[" + std::to_string(_i) + "]";
		}

		bool hasKey(const std::vector<LearnMapping>& _list, const LearnMapping& _m)
		{
			return std::any_of(_list.begin(), _list.end(), [&](const LearnMapping& _x) { return _x.sameKey(_m); });
		}
	}

	bool inLimits(const LearnRef& _at, const LearnLimits& _limits)
	{
		if(_at.isGlobal())
			return _at.pg == -1 && _at.i >= 0 && _at.i < _limits.globals;
		if(_at.t < 0 || _at.t >= _limits.tracks || _at.i < 0 || _at.i >= _limits.params)
			return false;
		if(_limits.pages > 0)
			return _at.pg >= 0 && _at.pg < _limits.pages;
		return _at.pg == -1;
	}

	const char* learnModeName(const LearnMode _mode)
	{
		switch(_mode)
		{
		case LearnMode::RelativeSigned: return "relative-signed";
		case LearnMode::RelativeOffset: return "relative-offset";
		default: return "absolute";
		}
	}

	LearnMode learnModeFromName(const std::string& _name, bool* _known)
	{
		if(_known)
			*_known = true;
		if(_name == "absolute")
			return LearnMode::Absolute;
		if(_name == "relative-signed")
			return LearnMode::RelativeSigned;
		if(_name == "relative-offset")
			return LearnMode::RelativeOffset;
		if(_known)
			*_known = false;
		return LearnMode::Absolute;
	}

	LearnEdit addMapping(const std::vector<LearnMapping>& _list, const LearnMapping& _m)
	{
		LearnEdit r;
		r.list = _list;
		if(_m.cc > 127)
			r.refusal = "CC " + std::to_string(_m.cc) + " is outside 0..127";
		else if(_m.ch > 15 && _m.ch != g_learnAnyChannel)
			r.refusal = "channel " + std::to_string(_m.ch + 1) + " is outside 1..16";
		else if(_m.at.t < 0 || _m.at.i < 0)
			r.refusal = "no target";
		else
		{
			for(auto& x : r.list)
			{
				if(!x.sameKey(_m))
					continue;
				if(x == _m)
					r.refusal = "already mapped";
				else
					x = _m;
				return r;
			}
			if(r.list.size() >= g_learnMaxMappings)
				r.refusal = std::to_string(g_learnMaxMappings) + " mappings at most";
			else
				r.list.push_back(_m);
		}
		return r;
	}

	std::vector<LearnMapping> removeMapping(const std::vector<LearnMapping>& _list, const size_t _index)
	{
		auto l = _list;
		if(_index < l.size())
			l.erase(l.begin() + static_cast<std::ptrdiff_t>(_index));
		return l;
	}

	std::vector<LearnMapping> invertMapping(const std::vector<LearnMapping>& _list, const size_t _index)
	{
		auto l = _list;
		if(_index < l.size())
			l[_index].invert = !l[_index].invert;
		return l;
	}

	std::vector<LearnMapping> moveKnobCc(const std::vector<LearnMapping>& _list, const uint8_t _from, const uint8_t _to)
	{
		if(_from == _to || _to > 127)
			return _list;
		std::vector<LearnMapping> out;
		out.reserve(_list.size());
		for(const auto& m : _list)
		{
			if(m.ch != g_learnAnyChannel || m.cc != _from)
			{
				out.push_back(m);
				continue;
			}
			auto moved = m;
			moved.cc = _to;
			// the row already drives that target on _to: one mapping
			if(!hasKey(_list, moved) && !hasKey(out, moved))
				out.push_back(moved);
		}
		return out;
	}

	std::vector<LearnMapping> moveKnobCcs(const std::vector<LearnMapping>& _list, const std::vector<uint8_t>& _from, const std::vector<uint8_t>& _to)
	{
		std::vector<LearnMapping> out;
		out.reserve(_list.size());
		for(const auto& m : _list)
		{
			auto moved = m;
			if(m.ch == g_learnAnyChannel)
				for(size_t i = 0; i < _from.size() && i < _to.size(); ++i)
					if(_from[i] == m.cc && _to[i] != _from[i] && _to[i] <= 127)
					{
						moved.cc = _to[i];
						break;
					}
			if(!hasKey(out, moved))
				out.push_back(moved);
		}
		return out;
	}

	std::vector<LearnOverride> overridesOf(const LearnMapping& _m, const FirmwareChannels& _channels, const FirmwareCcMap& _map)
	{
		std::vector<LearnOverride> out;
		if(!_map || _channels.span <= 0)
			return out;
		const int first = _m.ch == g_learnAnyChannel ? 0 : _m.ch;
		const int last = _m.ch == g_learnAnyChannel ? 15 : _m.ch;
		for(int c = first; c <= last; ++c)
		{
			const int offset = ((c - _channels.base) % 16 + 16) % 16;
			if(offset >= _channels.span)
				continue;
			if(const auto target = _map(offset, _m.cc))
				out.push_back({static_cast<uint8_t>(c), *target});
		}
		return out;
	}

	LearnMode detectMode(const std::vector<uint8_t>& _values)
	{
		if(_values.empty())
			return LearnMode::Absolute;

		// a button: only 0 and 127, pressed and released (an absolute min and max, not an encoder)
		if(std::all_of(_values.begin(), _values.end(), [](const uint8_t _v) { return _v == 0 || _v == 127; }))
			return LearnMode::Absolute;

		bool low = false, high = false, mid = false;
		for(const auto v : _values)
		{
			if(v <= 0x02)
				low = true;
			else if(v >= 0x7D)
				high = true;
			else if(v >= 0x3E && v <= 0x42)
				mid = true;
		}
		if(low && high)
			return LearnMode::RelativeSigned;
		if(mid)
			return LearnMode::RelativeOffset;
		return LearnMode::Absolute;
	}

	LearnStep learnStep(const LearnCapture& _c, const uint8_t _status, const uint8_t _cc, const uint8_t _value)
	{
		LearnStep s;
		s.next = _c;
		if((_status & 0xF0) != 0xB0)
			return s;
		const uint8_t ch = _status & 0x0F;
		if(!_c.started)
		{
			s.next.started = true;
			s.next.ch = ch;
			s.next.cc = _cc;
			s.next.values = {_value};
			return s;
		}
		if(ch != _c.ch || _cc != _c.cc)
			return s;
		if(std::find(s.next.values.begin(), s.next.values.end(), _value) == s.next.values.end())
			s.next.values.push_back(_value);
		if(s.next.values.size() < LearnCapture::need)
			return s;

		LearnMapping m;
		m.ch = _c.ch;
		m.cc = _c.cc;
		m.at = _c.target;
		m.mode = detectMode(s.next.values);
		s.learned = m;
		s.next = LearnCapture{};
		return s;
	}

	int learnedValue(const uint8_t _mode, const bool _invert, const uint8_t _value, const int _current, const int _min, const int _max)
	{
		const int lo = std::min(_min, _max);
		const int hi = std::max(_min, _max);
		const int v = std::min<int>(_value, 127);

		int step = 0;
		if(_mode == static_cast<uint8_t>(LearnMode::RelativeSigned))
			step = v >= 1 && v <= 63 ? 1 : v >= 65 ? -1 : 0;
		else if(_mode == static_cast<uint8_t>(LearnMode::RelativeOffset))
			step = v > 64 ? 1 : v < 64 ? -1 : 0;
		else
		{
			const int a = _invert ? 127 - v : v;
			// rounded to the nearest step of the range
			return lo + static_cast<int>((static_cast<int64_t>(a) * (hi - lo) * 2 + 127) / 254);
		}

		if(_invert)
			step = -step;
		return std::clamp(_current + step, lo, hi);
	}

	std::vector<std::pair<int, int>> foldGlobalEvents(const std::vector<LearnGlobalEvent>& _events, const std::vector<LearnGlobalSpec>& _specs,
		const std::function<std::optional<int>(int)>& _current)
	{
		struct Run
		{
			int id, start, now;
		};
		std::vector<Run> runs;
		for(const auto& e : _events)
		{
			if(e.id >= _specs.size())
				continue;
			auto it = std::find_if(runs.begin(), runs.end(), [&](const Run& _r) { return _r.id == e.id; });
			if(it == runs.end())
			{
				const auto at = _current ? _current(e.id) : std::nullopt;
				if(!at)
					continue;
				runs.push_back({e.id, *at, *at});
				it = runs.end() - 1;
			}
			const auto& spec = _specs[e.id];
			it->now = learnedValue(e.mode, e.invert, e.value, it->now, spec.min, spec.max);
		}
		std::vector<std::pair<int, int>> out;
		for(const auto& r : runs)
			if(r.now != r.start)
				out.emplace_back(r.id, r.now);
		return out;
	}

	std::vector<LearnMapping> mappingsFromJson(const json::Value& _list, const LearnLimits& _limits, std::vector<std::string>& _errors,
		const std::string& _path)
	{
		std::vector<LearnMapping> out;
		if(!_list.isArray())
		{
			_errors.push_back(_path + ": expected a list; no mappings are used");
			return out;
		}
		const auto& items = _list.asArray();
		for(size_t n = 0; n < items.size(); ++n)
		{
			const auto& it = items[n];
			const auto p = at(_path, n);
			if(!it.isObject())
			{
				_errors.push_back(p + ": expected an object; left out");
				continue;
			}
			if(out.size() >= g_learnMaxMappings)
			{
				_errors.push_back(p + ": past " + std::to_string(g_learnMaxMappings) + " mappings; left out");
				continue;
			}
			LearnMapping m;
			int v = 0;
			if(!isWhole(it.find("ch"), 0, 255, v) || (v > 15 && v != g_learnAnyChannel))
			{
				_errors.push_back(p + ".ch: expected 0..15 or 255; left out");
				continue;
			}
			m.ch = static_cast<uint8_t>(v);
			if(!isWhole(it.find("cc"), 0, 127, v))
			{
				_errors.push_back(p + ".cc: expected 0..127; left out");
				continue;
			}
			m.cc = static_cast<uint8_t>(v);
			if(const auto* g = it.find("g"))
			{
				if(!isWhole(g, 0, 1 << 20, v))
				{
					_errors.push_back(p + ".g: expected a global target; left out");
					continue;
				}
				m.at = LearnRef::global(v);
			}
			else
			{
				if(!isWhole(it.find("t"), 0, 1 << 20, v))
				{
					_errors.push_back(p + ".t: expected a track; left out");
					continue;
				}
				m.at.t = v;
				if(_limits.pages > 0)
				{
					if(!isWhole(it.find("pg"), 0, 1 << 20, v))
					{
						_errors.push_back(p + ".pg: expected a page; left out");
						continue;
					}
					m.at.pg = v;
				}
				if(!isWhole(it.find("i"), 0, 1 << 20, v))
				{
					_errors.push_back(p + ".i: expected a parameter index; left out");
					continue;
				}
				m.at.i = v;
			}
			if(!inLimits(m.at, _limits))
			{
				_errors.push_back(p + ": target is outside the model's learn limits; left out");
				continue;
			}
			if(const auto* md = it.find("mode"))
			{
				bool known = false;
				if(md->isString())
					m.mode = learnModeFromName(md->asString(), &known);
				if(!known)
					_errors.push_back(p + ".mode: unknown; absolute is used");
			}
			if(const auto* inv = it.find("invert"))
			{
				if(inv->isBool())
					m.invert = inv->asBool();
				else
					_errors.push_back(p + ".invert: expected true or false; false is used");
			}
			if(hasKey(out, m))
			{
				_errors.push_back(p + ": repeats an earlier mapping; left out");
				continue;
			}
			out.push_back(m);
		}
		return out;
	}

	json::Value mappingsToJson(const std::vector<LearnMapping>& _list, const bool _pages)
	{
		json::Value a = json::Value::array();
		for(const auto& m : _list)
		{
			json::Value o = json::Value::object();
			o.set("ch", static_cast<int>(m.ch));
			o.set("cc", static_cast<int>(m.cc));
			if(m.at.isGlobal())
				o.set("g", m.at.i);
			else
			{
				o.set("t", m.at.t);
				if(_pages)
					o.set("pg", m.at.pg);
				o.set("i", m.at.i);
			}
			o.set("mode", learnModeName(m.mode));
			o.set("invert", m.invert);
			a.push(std::move(o));
		}
		return a;
	}

	MdlnImport importMdln(const json::Value& _preset, const LearnModelLookup& _model, const LearnLimits& _limits)
	{
		MdlnImport r;
		const auto* list = _preset.isObject() ? _preset.find("mappings") : nullptr;
		if(!list || !list->isArray())
		{
			r.left.emplace_back("$.mappings: not a list");
			return r;
		}
		const auto& items = list->asArray();
		for(size_t n = 0; n < items.size(); ++n)
		{
			const auto& it = items[n];
			const auto p = at("$.mappings", n);
			if(!it.isObject())
			{
				r.left.push_back(p + ": not an object");
				continue;
			}
			const auto* type = it.find("type");
			if(type && type->isString() && type->asString() != "ControlChange")
			{
				r.left.push_back(p + ": " + type->asString() + " is not a CC");
				continue;
			}
			int v = 0;
			LearnMapping m;
			if(!isWhole(it.find("channel"), 0, 255, v) || (v > 15 && v != g_learnAnyChannel))
			{
				r.left.push_back(p + ".channel: bad");
				continue;
			}
			m.ch = static_cast<uint8_t>(v);
			if(!isWhole(it.find("controller"), 0, 127, v))
			{
				r.left.push_back(p + ".controller: bad");
				continue;
			}
			m.cc = static_cast<uint8_t>(v);
			const auto* part = it.find("part");
			if(part && !isWhole(part, 0, 254, v))
			{
				r.left.push_back(p + ": automatic part, no track to map to");
				continue;
			}
			if(!part)
			{
				r.left.push_back(p + ": automatic part, no track to map to");
				continue;
			}
			const int track = v;
			const auto* name = it.find("paramName");
			if(!name || !name->isString())
			{
				r.left.push_back(p + ".paramName: missing");
				continue;
			}
			const auto ref = _model ? _model(name->asString()) : std::nullopt;
			if(!ref)
			{
				r.left.push_back(p + ": parameter \"" + name->asString() + "\" is not in the learn model");
				continue;
			}
			m.at = *ref;
			m.at.t = track;
			if(!inLimits(m.at, _limits))
			{
				r.left.push_back(p + ": target is outside the model's learn limits");
				continue;
			}
			if(const auto* md = it.find("mode"); md && md->isString())
			{
				const auto& s = md->asString();
				m.mode = s == "RelativeSigned" || s == "Relative" ? LearnMode::RelativeSigned
					: s == "RelativeOffset" ? LearnMode::RelativeOffset : LearnMode::Absolute;
			}
			const auto* inv = it.find("invert");
			m.invert = inv && inv->isBool() && inv->asBool();
			if(hasKey(r.mappings, m))
			{
				r.left.push_back(p + ": repeats an earlier mapping");
				continue;
			}
			if(r.mappings.size() >= g_learnMaxMappings)
			{
				r.left.push_back(p + ": past " + std::to_string(g_learnMaxMappings) + " mappings");
				continue;
			}
			r.mappings.push_back(m);
		}
		return r;
	}
}
