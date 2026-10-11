#pragma once

// The Machinedrum's edit intents as data (doc/modern-ux/intent-cases.json, its "md" part; the MM's: mmDesk/mmIntentCases.h).
// The one reading of the cases for what runs them: the core (mdDeskTest: apply) and the firmware (mdDeskFirmwareTest,
// to come). The file's form is the MM's: docs by name (a kind, or another slot of the library: kit5, pattern3), given
// values set on them for every case, then per case command (or commands) and after [name, path, value], or refused.
// Header only, for the tests.

#include "mdDeskEdit.h"

#include "elektronData/json.h"
#include "elektronData/mdJson.h"

#include <fstream>
#include <iterator>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace mdDesk::intentCases
{
	using Value = elektronData::json::Value;

	struct Cases
	{
		std::map<std::string, Value> base;	// the base documents by name, the given values set
		EditContext context;				// the kit that plays
		std::vector<Value> cases;
	};

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

	// the page's "set" kind of a named document: the working kit by its name, else its schema's
	inline std::string kindOf(const std::string& _name, const Value& _doc)
	{
		if(_name == "workingKit")
			return "workingKit";
		const auto* s = _doc.find("schema");
		const auto schema = s && s->isString() ? s->asString() : std::string();
		return schema.rfind("md-desk/", 0) == 0 ? schema.substr(8) : std::string();
	}

	inline std::optional<Documents> documents(const std::map<std::string, Value>& _json, std::vector<std::string>& _errors)
	{
		namespace ed = elektronData;
		Documents d;
		for(const auto& [name, doc] : _json)
		{
			const auto kind = kindOf(name, doc);
			if(kind == "workingKit")
			{
				if(auto k = ed::kitFromJson(doc, _errors))
					d.working = WorkingKit{*k};
			}
			else if(kind == "pattern")
			{
				if(auto p = ed::patternFromJson(doc, _errors))
					d.patterns[p->position] = *p;
			}
			else if(kind == "kit")
			{
				if(auto k = ed::kitFromJson(doc, _errors))
					d.kits[k->position] = *k;
			}
			else if(kind == "song")
			{
				if(auto x = ed::songFromJson(doc, _errors))
					d.songs[x->position] = *x;
			}
			else if(kind == "global")
			{
				if(auto g = ed::globalFromJson(doc, _errors))
					d.global = *g;
			}
			else
				_errors.push_back(name + ": no schema");
		}
		return _errors.empty() ? std::optional<Documents>(d) : std::nullopt;
	}

	inline std::map<std::string, std::string> written(const Documents& _d)
	{
		namespace ed = elektronData;
		std::map<std::string, std::string> out;
		for(const auto& [slot, p] : _d.patterns)
			out["pattern " + std::to_string(slot)] = ed::json::write(ed::patternToJson(p));
		for(const auto& [slot, k] : _d.kits)
			out["kit " + std::to_string(slot)] = ed::json::write(ed::kitToJson(k));
		for(const auto& [slot, x] : _d.songs)
			out["song " + std::to_string(slot)] = ed::json::write(ed::songToJson(x));
		if(_d.global)
			out["global"] = ed::json::write(ed::globalToJson(*_d.global));
		if(_d.working)
			out["workingKit"] = ed::json::write(ed::kitToJson(_d.working->kit));
		return out;
	}

	inline std::string firstDiff(const std::string& _a, const std::string& _b)
	{
		size_t i = 0;
		while(i < _a.size() && i < _b.size() && _a[i] == _b[i])
			++i;
		const auto from = i > 60 ? i - 60 : 0;
		return "..." + _a.substr(from, 100) + "\n       expected ..." + _b.substr(from, 100);
	}

	inline std::string differences(const std::map<std::string, std::string>& _got, const std::map<std::string, std::string>& _want)
	{
		std::string diff;
		for(const auto& [kind, text] : _want)
			if(!_got.count(kind) || _got.at(kind) != text)
				diff += "\n       " + kind + ": " + (_got.count(kind) ? firstDiff(_got.at(kind), text) : std::string("missing"));
		return diff;
	}

	inline std::vector<Value> commandsOf(const Value& _case)
	{
		if(const auto* one = _case.find("command"))
			return {*one};
		return _case.find("commands")->asArray();
	}

	inline std::optional<Documents> expected(const Cases& _c, const Value& _case, std::string& _problem)
	{
		auto json = _c.base;
		std::vector<std::string> errors;
		const auto d = patch(json, *_case.find("after")) ? documents(json, errors) : std::nullopt;
		if(!d)
			_problem = "its after values make no valid documents" + (errors.empty() ? std::string() : ": " + errors.front());
		return d;
	}

	inline std::optional<Cases> load(const std::string& _path, std::string& _problem)
	{
		std::ifstream in(_path);
		const auto file = elektronData::json::parse(std::string{std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()});
		if(!file || !file->find("md"))
		{
			_problem = "the Machinedrum's intent cases do not load: " + _path;
			return std::nullopt;
		}
		const auto& md = *file->find("md");
		Cases c;
		for(const auto& [name, doc] : md.find("docs")->asObject())
			c.base[name] = doc;
		if(!patch(c.base, *md.find("given")))
		{
			_problem = "the cases' given values do not fit the documents";
			return std::nullopt;
		}
		c.context.currentKit = static_cast<uint8_t>(md.find("context")->find("kit")->asNumber());
		c.cases = md.find("cases")->asArray();
		return c;
	}
}
