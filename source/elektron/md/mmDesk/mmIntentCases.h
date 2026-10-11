#pragma once

// DESIGN-UNIFY.md 4.2: the edit intents as data (doc/modern-ux/intent-cases.json). The one reading of the file for
// everything that runs the cases: the core (mmDeskTest: apply), the firmware (mmDeskFirmwareTest intentcases: the same
// commands through the desk to the emulated machine, read back) and the page (mmViewTest.js, its own reading in JS).
// A case: command (or commands, in order), then after: [name, path, value] on the base documents that make the
// documents after (a path [] is the whole document; everything else unchanged), or refused: a part of the error.
// Header only, for the tests.

#include "mmDeskModel.h"

#include "elektronData/json.h"
#include "elektronData/mmJson.h"
#include "elektronData/mmValidate.h"

#include <fstream>
#include <iterator>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace mmDesk::intentCases
{
	using Value = elektronData::json::Value;

	struct Cases
	{
		std::map<std::string, Value> base;	// the base documents by name, the given values set
		EditContext context;				// the kit that plays, the active global
		std::vector<Value> cases;
	};

	// _root's member at _path (object keys and array indices), made where it is missing; nullptr when the path crosses a value
	inline Value* at(Value& _root, const Value& _path)
	{
		Value* v = &_root;
		for(const auto& k : _path.asArray())
		{
			if(k.isString())
			{
				if(!v->isObject())
					return nullptr;
				auto* next = v->find(k.asString());
				v = next ? next : &v->set(k.asString(), Value());
			}
			else
			{
				const auto i = static_cast<size_t>(k.asNumber());
				if(!v->isArray() || i >= v->asArray().size())
					return nullptr;
				v = &v->asArray()[i];
			}
		}
		return v;
	}

	// [name, path, value] entries set on the documents by name
	inline bool patch(std::map<std::string, Value>& _docs, const Value& _entries)
	{
		for(const auto& e : _entries.asArray())
		{
			const auto& a = e.asArray();
			auto* v = at(_docs[a[0].asString()], a[1]);
			if(!v)
				return false;
			*v = a[2];
		}
		return true;
	}

	// A document's kind for the page's "set" command: its name for the working kit, else its schema's
	inline std::string kindOf(const std::string& _name, const Value& _doc)
	{
		if(_name == "workingKit")
			return "workingKit";
		const auto* s = _doc.find("schema");
		const auto schema = s && s->isString() ? s->asString() : std::string();
		return schema.rfind("mm-desk/", 0) == 0 ? schema.substr(8) : std::string();
	}

	// the documents as the core holds them (and, back to JSON, in the contract's one form). A document's name in the
	// cases is its kind ("pattern", "workingKit", "global", "song") or, for another slot of the library, any name
	// ("kit5"); its schema says what it is.
	inline std::optional<Documents> documents(const std::map<std::string, Value>& _json, std::vector<std::string>& _errors)
	{
		namespace ed = elektronData;
		Documents d;
		for(const auto& [name, doc] : _json)
		{
			const auto kind = kindOf(name, doc);
			if(kind == "workingKit")
			{
				if(auto k = ed::mmKitFromJson(doc, _errors))
					d.working = WorkingKit{*k};
			}
			else if(kind == "pattern")
			{
				if(auto p = ed::mmPatternFromJson(doc, _errors))
				{
					for(const auto& problem : ed::validate(*p))
						_errors.push_back(name + ": " + problem);
					d.patterns[p->position] = *p;
				}
			}
			else if(kind == "kit")
			{
				if(auto k = ed::mmKitFromJson(doc, _errors))
					d.kits[k->position] = *k;
			}
			else if(kind == "song")
			{
				if(auto x = ed::mmSongFromJson(doc, _errors))
					d.songs[x->position] = *x;
			}
			else if(kind == "global")
			{
				if(auto g = ed::mmGlobalFromJson(doc, _errors))
					d.globals[g->position] = *g;
			}
			else
				_errors.push_back(name + ": no schema");
		}
		return _errors.empty() ? std::optional<Documents>(d) : std::nullopt;
	}

	// each document as JSON text, by "<kind> <slot>" (the working kit: "workingKit")
	inline std::map<std::string, std::string> written(const Documents& _d)
	{
		namespace ed = elektronData;
		std::map<std::string, std::string> out;
		for(const auto& [slot, p] : _d.patterns)
			out["pattern " + std::to_string(slot)] = ed::json::write(ed::mmPatternToJson(p));
		for(const auto& [slot, k] : _d.kits)
			out["kit " + std::to_string(slot)] = ed::json::write(ed::mmKitToJson(k));
		for(const auto& [slot, x] : _d.songs)
			out["song " + std::to_string(slot)] = ed::json::write(ed::mmSongToJson(x));
		for(const auto& [slot, g] : _d.globals)
			out["global " + std::to_string(slot)] = ed::json::write(ed::mmGlobalToJson(g));
		if(_d.working)
			out["workingKit"] = ed::json::write(ed::mmKitToJson(_d.working->kit));
		return out;
	}

	// the first place two JSON texts differ, for the failure line
	inline std::string firstDiff(const std::string& _a, const std::string& _b)
	{
		size_t i = 0;
		while(i < _a.size() && i < _b.size() && _a[i] == _b[i])
			++i;
		const auto from = i > 60 ? i - 60 : 0;
		return "..." + _a.substr(from, 100) + "\n       expected ..." + _b.substr(from, 100);
	}

	// what differs in _got from _want (only the documents _want has), one line per document; empty: the same
	inline std::string differences(const std::map<std::string, std::string>& _got, const std::map<std::string, std::string>& _want)
	{
		std::string diff;
		for(const auto& [kind, text] : _want)
			if(!_got.count(kind) || _got.at(kind) != text)
				diff += "\n       " + kind + ": " + (_got.count(kind) ? firstDiff(_got.at(kind), text) : std::string("missing"));
		return diff;
	}

	// a case's commands, in order
	inline std::vector<Value> commandsOf(const Value& _case)
	{
		if(const auto* one = _case.find("command"))
			return {*one};
		return _case.find("commands")->asArray();
	}

	// the documents after a case that is not refused: the base with its after values; nullopt with the problem
	inline std::optional<Documents> expected(const Cases& _c, const Value& _case, std::string& _problem)
	{
		auto json = _c.base;
		std::vector<std::string> errors;
		const auto d = patch(json, *_case.find("after")) ? documents(json, errors) : std::nullopt;
		if(!d)
			_problem = "its after values make no valid documents" + (errors.empty() ? std::string() : ": " + errors.front());
		return d;
	}

	// the file's MM cases; nullopt with the problem when they do not load
	inline std::optional<Cases> load(const std::string& _path, std::string& _problem)
	{
		std::ifstream in(_path);
		const auto file = elektronData::json::parse(std::string{std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()});
		if(!file || !file->find("mm"))
		{
			_problem = "the intent cases do not load: " + _path;
			return std::nullopt;
		}
		const auto& mm = *file->find("mm");
		Cases c;
		for(const auto& [name, doc] : mm.find("docs")->asObject())
			c.base[name] = doc;
		if(!patch(c.base, *mm.find("given")))
		{
			_problem = "the cases' given values do not fit the documents";
			return std::nullopt;
		}
		c.context.currentKit = static_cast<int>(mm.find("context")->find("kit")->asNumber());
		c.context.currentGlobal = static_cast<int>(mm.find("context")->find("global")->asNumber());
		c.cases = mm.find("cases")->asArray();
		return c;
	}
}
