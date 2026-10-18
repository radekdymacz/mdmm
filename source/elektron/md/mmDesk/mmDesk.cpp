#include "mmDesk.h"

#include "mmDeskMachine.h"

#include <array>
#include <cmath>

namespace mmDesk
{
	namespace ed = elektronData;
	using Value = ed::json::Value;

	Desk::Desk(Port _port, const Profile& _profile) : Desk(defaultAdapter(_profile, _port.device), _port)
	{
	}

	Desk::Desk(std::unique_ptr<MmAdapter> _adapter, Port _port)
		: deskCore::Desk<MmModel, MmAdapter>(std::move(_adapter), _port.toPage, _port.device.nowMs, _port.ready)
		, m_saveSetup(std::move(_port.saveSetup))
	{
	}

	namespace
	{
		template<typename F>
		int ofMachine(const MmAdapter& _a, F _f)
		{
			const auto* m = dynamic_cast<const MmMachine*>(&_a);
			return m ? _f(*m) : -1;
		}
	}

	int Desk::currentPattern() const { return ofMachine(machine(), [](const MmMachine& _m) { return _m.currentPattern(); }); }
	int Desk::currentKit() const { return ofMachine(machine(), [](const MmMachine& _m) { return _m.currentKit(); }); }
	int Desk::currentSong() const { return ofMachine(machine(), [](const MmMachine& _m) { return _m.currentSong(); }); }
	int Desk::currentGlobal() const { return ofMachine(machine(), [](const MmMachine& _m) { return _m.currentGlobal(); }); }

	std::unique_ptr<MmAdapter> Desk::defaultAdapter(const Profile& _profile, const DevicePort& _device)
	{
		return std::make_unique<MmMachine>(_profile, _device);
	}

	std::optional<ed::MmKit> Desk::kit(const uint8_t _slot) const
	{
		const auto& k = documents().kits;
		const auto it = k.find(_slot & 127);
		return it == k.end() ? std::nullopt : std::optional<ed::MmKit>(it->second);
	}

	std::optional<ed::MmKit> Desk::workingKit() const
	{
		const auto& w = documents().working;
		return w ? std::optional<ed::MmKit>(w->kit) : std::nullopt;
	}

	// ---- the app modulators (the same engine as the Machinedrum's) ----

	std::vector<std::string> Desk::setupOps() { return {"modSet", "soloSet", "followSet"}; }

	// The table's Owner::Setup rows: modSet and soloSet.
	void Desk::onSetup(const Value& _message)
	{
		const auto op = deskCore::opOf(_message);
		if(op == "soloSet")
		{
			setSolo(_message);
			return;
		}
		if(op == "followSet")
		{
			const auto* on = _message.find("on");
			const bool follow = on && on->isBool() && on->asBool();
			if(m_follow != follow)
			{
				m_follow = follow;
				if(m_saveSetup)
					m_saveSetup(setupDoc());
			}
			result(_message, {}, {});
			return;
		}
		if(op != "modSet")
		{
			result(_message, {"no such setup"}, {});
			return;
		}
		std::vector<std::string> errors;
		if(const auto setup = deskCore::modSetupFromJson(*_message.find("doc"), errors, g_mmModLimits))
		{
			m_mods.setSetup(*setup);
			if(m_saveSetup)
				m_saveSetup(setupDoc());
		}
		result(_message, errors, {});
		publishModulators();
	}

	Desk::Value Desk::setupDoc() const
	{
		deskCore::DeskSetup s;
		s.modulators = m_mods.setup();
		s.solo = m_solo;
		s.followPlayed = m_follow;
		s.mappings = m_mappings;
		s.mappingsKept = m_mappingsKept;
		return deskCore::setupToJson(s, g_mmSetupSpec);
	}

	// The page's solo and the mutes the person had before it: kept with the project (B-123). Not echoed: the page
	// knows what it sent; publishSolo says it again when a project is opened, after a reset and when the page is made.
	void Desk::setSolo(const Value& _message)
	{
		std::vector<std::string> errors;
		if(const auto solo = deskCore::solo::fromJson(_message.find("tracks"), _message.find("mutes"), 12, errors, "$"))
		{
			if(m_solo != *solo)
			{
				m_solo = *solo;
				if(m_saveSetup)
					m_saveSetup(setupDoc());
			}
		}
		result(_message, errors, {});
	}

	void Desk::publishSolo()
	{
		publish(deskCore::solo::message(m_solo));
		Value f = Value::object();
		f.set("type", "follow");
		f.set("on", m_follow);
		publish(f);
	}

	void Desk::setMappings(std::vector<deskCore::LearnMapping> _mappings)
	{
		if(_mappings == m_mappings)
			return;
		const bool had = !m_mappings.empty();
		m_mappings = std::move(_mappings);
		m_mappingsKept = m_mappings.empty() && (m_mappingsKept || had);
		if(m_saveSetup)
			m_saveSetup(setupDoc());
	}

	std::vector<std::string> Desk::loadSetup(const Value& _setup)
	{
		// never the previous project's setup: what this one holds that can be used, else the default (errors say what not)
		std::vector<std::string> errors;
		const auto s = deskCore::setupFromJson(_setup, g_mmSetupSpec, errors);
		m_mods.setSetup(s.modulators);
		m_solo = s.solo;
		m_follow = s.followPlayed;
		m_mappings = s.mappings;
		m_mappingsKept = s.mappingsKept;
		publishModulators();
		publishSolo();
		flush();
		return errors;
	}

	void Desk::publishModulators()
	{
		publish(m_mods.message(g_mmModLimits, now()));
	}


	void Desk::onTelemetry(const Telemetry& _t)
	{
		// App modulators move on the machine's own steps (the adapter's step edge).
		if(machine().onTelemetry(_t))
			runModulators();
	}

	void Desk::runModulators()
	{
		if(auto m = m_mods.step(machine(), documents(), g_mmModLimits, machine().telemetry().step, machine().playing(), now()))
			publish(*m);
		flush();
	}

	std::optional<ed::MmPattern> Desk::pattern(const uint8_t _slot) const
	{
		const auto& p = documents().patterns;
		const auto it = p.find(_slot & 127);
		return it == p.end() ? std::nullopt : std::optional<ed::MmPattern>(it->second);
	}

	std::optional<ed::MmSong> Desk::song(const uint8_t _slot) const
	{
		const auto& s = documents().songs;
		const auto it = s.find(_slot % 24);
		return it == s.end() ? std::nullopt : std::optional<ed::MmSong>(it->second);
	}

	std::optional<ed::MmGlobal> Desk::global(const uint8_t _slot) const
	{
		const auto& g = documents().globals;
		const auto it = g.find(_slot & 7);
		return it == g.end() ? std::nullopt : std::optional<ed::MmGlobal>(it->second);
	}

}

namespace mmDesk
{
	// ---- MIDI Learn's global targets (B-169) ----

	namespace
	{
		using Value = elektronData::json::Value;
		constexpr int g_tempoTarget = 0, g_tuneTarget = 1, g_menvFirst = 2, g_menvCount = 5, g_swingTarget = 7;
		constexpr std::array<const char*, g_menvCount> g_menvNames{"ATK", "DEC", "SUS", "REL", "PORT"};
	}

	const std::vector<deskCore::LearnGlobalSpec>& Desk::learnGlobals()
	{
		static const std::vector<deskCore::LearnGlobalSpec> list = []
		{
			std::vector<deskCore::LearnGlobalSpec> v;
			v.push_back({"TEMPO", "TEMPO", 30, 300});
			v.push_back({"MASTER TUNE", "GLOBAL", 4000, 4999});
			for(const auto* n : g_menvNames)
				v.push_back({std::string("MULTI ENV ") + n, "MULTI ENV", 0, 127});
			v.push_back({"SWING", "PATTERN", 50, 80});
			return v;
		}();
		return list;
	}

	std::optional<int> Desk::learnGlobalValue(const int _id, const Value& _state) const
	{
		if(_id == g_tempoTarget)
		{
			const auto* t = _state.find("tempo");
			return t && t->isNumber() ? std::optional<int>(static_cast<int>(std::lround(t->asNumber()))) : std::nullopt;
		}
		if(_id == g_tuneTarget)
		{
			const int slot = stateInt(_state, "global", "current");
			const auto it = slot >= 0 && slot <= 255 ? documents().globals.find(static_cast<uint8_t>(slot)) : documents().globals.end();
			return it == documents().globals.end() ? std::nullopt : std::optional<int>(it->second.masterTune);
		}
		if(_id >= g_menvFirst && _id < g_menvFirst + g_menvCount)
		{
			const int kit = stateInt(_state, "kit", "current");
			const auto* k = kit >= 0 ? documents().workingKitOf(kit) : nullptr;
			if(!k)
			{
				const auto it = kit >= 0 && kit <= 255 ? documents().kits.find(static_cast<uint8_t>(kit)) : documents().kits.end();
				if(it == documents().kits.end())
					return std::nullopt;
				k = &it->second;
			}
			return k->tracks[0].multiEnv[static_cast<size_t>(_id - g_menvFirst)];
		}
		if(_id == g_swingTarget)
		{
			const int pattern = stateInt(_state, "pattern", "current");
			const auto it = pattern >= 0 && pattern <= 255 ? documents().patterns.find(static_cast<uint8_t>(pattern)) : documents().patterns.end();
			return it == documents().patterns.end() ? std::nullopt : std::optional<int>(50 + it->second.swingAmount);
		}
		return std::nullopt;
	}

	Value Desk::learnGlobalMessage(const int _id, const int _value, const Value& _state) const
	{
		Value m = Value::object();
		if(_id == g_tempoTarget)
		{
			m.set("op", "tempo");
			m.set("bpm", _value);
		}
		else if(_id == g_tuneTarget)
		{
			m.set("op", "masterTune");
			m.set("v", _value);
		}
		else if(_id >= g_menvFirst && _id < g_menvFirst + g_menvCount)
		{
			m.set("op", "multiEnv");
			m.set("k", stateInt(_state, "kit", "current"));
			m.set("i", _id - g_menvFirst);
			m.set("v", _value);
		}
		else if(_id == g_swingTarget)
		{
			m.set("op", "swing");
			m.set("p", stateInt(_state, "pattern", "current"));
			m.set("v", _value);
		}
		else
			return Value();
		return m;
	}
}
