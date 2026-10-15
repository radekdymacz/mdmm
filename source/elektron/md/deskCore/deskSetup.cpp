#include "deskSetup.h"

#include <cmath>
#include <set>

namespace deskCore
{
	namespace json = elektronData::json;

	namespace
	{
		void addPrefixed(std::vector<std::string>& _errors, const std::vector<std::string>& _more, const std::string& _path)
		{
			for(const auto& e : _more)
				_errors.push_back(_path + (e.rfind("$", 0) == 0 ? e.substr(1) : ": " + e));
		}

		void readSolo(const json::Value& _doc, const SetupSpec& _spec, DeskSetup& _s, std::vector<std::string>& _errors)
		{
			if(const auto* sl = _doc.find("solo"))
				if(const auto solo = solo::fromJson(*sl, _spec.tracks, _errors))
					_s.solo = *solo;
		}
	}

	std::vector<std::string> validateKnobCcs(const std::vector<int>& _ccs)
	{
		std::vector<std::string> errors;
		if(_ccs.size() != 8)
			errors.emplace_back("$.knobCcs: expected 8 CC numbers");
		std::set<int> seen;
		for(size_t i = 0; i < _ccs.size(); ++i)
		{
			if(_ccs[i] < 0 || _ccs[i] > 127)
				errors.push_back("$.knobCcs[" + std::to_string(i) + "]: " + std::to_string(_ccs[i]) + " is outside 0..127");
			else if(!seen.insert(_ccs[i]).second)
				errors.push_back("$.knobCcs[" + std::to_string(i) + "]: CC " + std::to_string(_ccs[i]) + " is used by another knob row");
		}
		return errors;
	}

	DeskSetup setupFromJson(const json::Value& _doc, const SetupSpec& _spec, std::vector<std::string>& _errors)
	{
		DeskSetup s;
		const auto* schema = _doc.find("schema");
		const std::string name = schema && schema->isString() ? schema->asString() : std::string();
		if(name == _spec.modulators.schema)
		{
			// the bare modulators with the solo beside them (the MM's setup)
			s.modulators = modSetupRead(_doc, _errors, _spec.modulators);
			readSolo(_doc, _spec, s, _errors);
			return s;
		}
		if(name != _spec.schema)
		{
			_errors.emplace_back(std::string("$.schema: expected ") + _spec.schema + "; the default setup is used");
			return s;
		}
		if(!readsMajor(_doc, g_setupVersion))
		{
			_errors.emplace_back("$.version: expected " + std::to_string(g_setupVersion) + " (a newer editor's setup); the default setup is used");
			return s;
		}
		if(const auto* m = _doc.find("modulators"))
		{
			std::vector<std::string> modErrors;
			s.modulators = modSetupRead(*m, modErrors, _spec.modulators);
			addPrefixed(_errors, modErrors, "$.modulators");
		}
		if(const auto* k = _spec.knobCcs ? _doc.find("knobCcs") : nullptr)
		{
			// the first eight rows (a newer editor may keep more)
			std::vector<int> ccs;
			if(k->isArray())
				for(size_t i = 0; i < k->asArray().size() && i < s.knobCcs.size(); ++i)
				{
					const auto& v = k->asArray()[i];
					const bool ok = v.isNumber() && v.asNumber() >= 0 && v.asNumber() <= 127 && v.asNumber() == std::floor(v.asNumber());
					ccs.push_back(ok ? static_cast<int>(v.asNumber()) : -1);
				}
			const auto errors = validateKnobCcs(ccs);
			_errors.insert(_errors.end(), errors.begin(), errors.end());
			if(errors.empty())
				for(size_t i = 0; i < s.knobCcs.size(); ++i)
					s.knobCcs[i] = static_cast<uint8_t>(ccs[i]);
		}
		readSolo(_doc, _spec, s, _errors);
		return s;
	}

	json::Value setupToJson(const DeskSetup& _setup, const SetupSpec& _spec)
	{
		if(_spec.writesBare)
		{
			auto d = modSetupToJson(_setup.modulators, _spec.modulators);
			if(!_setup.solo.empty())
				d.set("solo", solo::toJson(_setup.solo));
			return d;
		}
		json::Value d = json::Value::object();
		d.set("schema", _spec.schema);
		d.set("version", g_setupVersion);
		d.set("modulators", modSetupToJson(_setup.modulators, _spec.modulators));
		if(_spec.knobCcs)
		{
			json::Value k = json::Value::array();
			for(const auto cc : _setup.knobCcs)
				k.push(static_cast<int>(cc));
			d.set("knobCcs", std::move(k));
		}
		if(!_setup.solo.empty())
			d.set("solo", solo::toJson(_setup.solo));
		return d;
	}
}
