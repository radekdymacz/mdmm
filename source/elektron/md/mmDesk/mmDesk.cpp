#include "mmDesk.h"

#include "mmDeskMachine.h"

#include "elektronData/mmValidate.h"

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
	//
	// A table of definitions, built once, in a fixed order: the id of a target is its index and a saved project names it, so
	// the order is append-only (part 1: 0-7; part 2: pattern and track transpose, arpeggiator, ASSIGN, MIDI tracks).

	namespace
	{
		using Value = elektronData::json::Value;
		constexpr int g_menvCount = 5;
		constexpr std::array<const char*, g_menvCount> g_menvNames{"ATK", "DEC", "SUS", "REL", "PORT"};

		enum class GKind
		{
			Tempo, Tune, MultiEnv, Swing, PatternTranspose, Transpose, Arp, Assign, AssignFlag, MidiValue, MidiCc, MidiChannel
		};
		struct Def
		{
			deskCore::LearnGlobalSpec spec;
			GKind kind;
			int t = 0;	// the track (0-11 for the transposes and the arpeggiator, 0-5 for ASSIGN and the MIDI tracks)
			int a = 0;	// the field / the value / the multi envelope value
			int src = 0, row = 0;
		};

		const char* const g_arpFields[] = {"PLAY", "OJMP", "MODE", "RANGE", "SPEED", "TRIGS", "LENGTH"};
		constexpr int g_arpMax[] = {4, 15, 3, 8, 127, 7, 16};
		constexpr int g_arpMin[] = {0, 0, 0, 0, 0, 0, 1};
		const char* const g_arpCommand[] = {"play", "ojmp", "mode", "range", "speed", "trigs", "length"};
		constexpr int g_assignSources[] = {0, 2, 3, 4, 5};		// the page's tabs: JOY RL (the right joystick), JOY U, JOY D, VEL, KEY
		const char* const g_assignNames[] = {"JOY R", "", "JOY U", "JOY D", "VEL", "KEY"};
		const char* const g_midiNames[] = {"LEN", "VEL", "PB", "PCHG", "CC1", "CC2", "CC3", "CC4"};

		std::string trackWord(const int _t)
		{
			return (_t < 6 ? "T" : "M") + std::to_string(_t < 6 ? _t + 1 : _t - 5);
		}

		const std::vector<Def>& defs()
		{
			static const std::vector<Def> list = []
			{
				std::vector<Def> v;
				const auto add = [&](std::string _name, std::string _group, const int _min, const int _max, const GKind _kind, const int _t = 0,
					const int _a = 0, const int _src = 0, const int _row = 0)
				{ v.push_back({{std::move(_name), std::move(_group), _min, _max}, _kind, _t, _a, _src, _row}); };
				add("TEMPO", "TEMPO", 30, 300, GKind::Tempo);
				add("MASTER TUNE", "GLOBAL", 4000, 4999, GKind::Tune);
				for(int i = 0; i < g_menvCount; ++i)
					add(std::string("MULTI ENV ") + g_menvNames[static_cast<size_t>(i)], "MULTI ENV", 0, 127, GKind::MultiEnv, 0, i);
				add("SWING", "PATTERN", 50, 80, GKind::Swing);
				// part 2
				add("PATTERN TRANSPOSE", "TRANSPOSE", -64, 63, GKind::PatternTranspose);
				for(int t = 0; t < 12; ++t)
				{
					const auto w = trackWord(t);
					add(w + " TRANSPOSE", "TRANSPOSE " + w, -64, 63, GKind::Transpose, t, 0);
					add(w + " SCALE", "TRANSPOSE " + w, 0, 3, GKind::Transpose, t, 1);
					add(w + " KEY", "TRANSPOSE " + w, 0, 11, GKind::Transpose, t, 2);
				}
				for(int t = 0; t < 12; ++t)
				{
					const auto w = trackWord(t);
					for(int f = 0; f < 7; ++f)
						if(!(t >= 6 && f == 5))
							add(w + " ARP " + g_arpFields[f], "ARP " + w, g_arpMin[f], g_arpMax[f], GKind::Arp, t, f);
					for(int i = 0; i < 16; ++i)
						add(w + " ARP STEP " + std::to_string(i + 1), "ARP " + w, 0, 128, GKind::Arp, t, 7 + i);	// 128: the step is muted
				}
				for(int t = 0; t < 6; ++t)
				{
					const auto w = trackWord(t);
					for(const int src : g_assignSources)
						for(int row = 0; row < 2; ++row)
						{
							const auto base = w + " ASSIGN " + g_assignNames[src] + " " + std::to_string(row + 1) + " ";
							add(base + "PAGE", "ASSIGN " + w, 0, 8, GKind::Assign, t, 0, src, row);
							add(base + "DEST", "ASSIGN " + w, 0, 7, GKind::Assign, t, 1, src, row);
							add(base + "ADD", "ASSIGN " + w, -64, 63, GKind::Assign, t, 2, src, row);
						}
					add(w + " ASSIGN MIRROR", "ASSIGN " + w, 0, 1, GKind::AssignFlag, t, 0);
					add(w + " ASSIGN HPF", "ASSIGN " + w, 0, 1, GKind::AssignFlag, t, 1);
					add(w + " ASSIGN LPF", "ASSIGN " + w, 0, 1, GKind::AssignFlag, t, 2);
				}
				for(int t = 0; t < 6; ++t)
				{
					const auto w = trackWord(t + 6);
					for(int i = 0; i < 8; ++i)
						add(w + " MIDI " + g_midiNames[i], "MIDI " + w, 0, 127, GKind::MidiValue, t, i);
					for(int i = 0; i < 4; ++i)
						add(w + " CC" + std::to_string(i + 1) + " NUMBER", "MIDI " + w, 0, 128, GKind::MidiCc, t, i);	// 128: AFT
					add(w + " CHANNEL", "MIDI " + w, 0, 15, GKind::MidiChannel, t);
				}
				return v;
			}();
			return list;
		}
	}

	const std::vector<deskCore::LearnGlobalSpec>& Desk::learnGlobals()
	{
		static const std::vector<deskCore::LearnGlobalSpec> list = []
		{
			std::vector<deskCore::LearnGlobalSpec> v;
			for(const auto& d : defs())
				v.push_back(d.spec);
			return v;
		}();
		return list;
	}

	std::optional<int> Desk::learnGlobalValue(const int _id, const Value& _state) const
	{
		if(_id < 0 || static_cast<size_t>(_id) >= defs().size())
			return std::nullopt;
		const auto& d = defs()[static_cast<size_t>(_id)];
		const auto kitNow = [&]() -> const elektronData::MmKit*
		{
			const int kit = stateInt(_state, "kit", "current");
			const auto* k = kit >= 0 && kit <= 255 ? documents().workingKitOf(static_cast<uint8_t>(kit)) : nullptr;
			if(!k)
			{
				const auto it = kit >= 0 && kit <= 255 ? documents().kits.find(static_cast<uint8_t>(kit)) : documents().kits.end();
				if(it == documents().kits.end())
					return nullptr;
				k = &it->second;
			}
			return k;
		};
		const auto patternNow = [&]() -> const elektronData::MmPattern*
		{
			const int pattern = stateInt(_state, "pattern", "current");
			const auto it = pattern >= 0 && pattern <= 255 ? documents().patterns.find(static_cast<uint8_t>(pattern)) : documents().patterns.end();
			return it == documents().patterns.end() ? nullptr : &it->second;
		};
		const auto globalNow = [&]() -> const elektronData::MmGlobal*
		{
			const int slot = stateInt(_state, "global", "current");
			const auto it = slot >= 0 && slot <= 255 ? documents().globals.find(static_cast<uint8_t>(slot)) : documents().globals.end();
			return it == documents().globals.end() ? nullptr : &it->second;
		};
		switch(d.kind)
		{
		case GKind::Tempo:
		{
			const auto* t = _state.find("tempo");
			return t && t->isNumber() ? std::optional<int>(static_cast<int>(std::lround(t->asNumber()))) : std::nullopt;
		}
		case GKind::Tune:
		{
			const auto* g = globalNow();
			return g ? std::optional<int>(g->masterTune) : std::nullopt;
		}
		case GKind::MultiEnv:
		{
			const auto* k = kitNow();
			return k ? std::optional<int>(k->tracks[0].multiEnv[static_cast<size_t>(d.a)]) : std::nullopt;
		}
		case GKind::Swing:
		{
			const auto* p = patternNow();
			return p ? std::optional<int>(50 + p->swingAmount) : std::nullopt;
		}
		case GKind::PatternTranspose:
		{
			const auto* p = patternNow();
			return p ? std::optional<int>(p->patternTranspose) : std::nullopt;
		}
		case GKind::Transpose:
		{
			const auto* p = patternNow();
			if(!p)
				return std::nullopt;
			const auto& x = d.t >= 6 ? p->midiTranspose : p->transpose;
			const auto i = static_cast<size_t>(d.t % 6);
			return d.a == 0 ? x.track[i] : d.a == 1 ? x.scale[i] : x.key[i];
		}
		case GKind::Arp:
		{
			const auto* p = patternNow();
			if(!p)
				return std::nullopt;
			const auto& a = d.t >= 6 ? p->midiArp : p->arp;
			const auto i = static_cast<size_t>(d.t % 6);
			switch(d.a)
			{
			case 0: return a.playOjmp[i] & 7;
			case 1: return a.playOjmp[i] >> 4;
			case 2: return a.mode[i];
			case 3: return a.range[i];
			case 4: return a.speed[i];
			case 5: return a.trigs[i];
			case 6: return a.length[i];
			default:
			{
				const int v = a.steps[i][static_cast<size_t>(d.a - 7)];
				return v == elektronData::g_mmArpStepMuted ? 128 : std::min(v, 127);
			}
			}
		}
		case GKind::Assign:
		{
			const auto* k = kitNow();
			if(!k)
				return std::nullopt;
			const auto t = static_cast<size_t>(d.t), at = static_cast<size_t>(d.src * 2 + d.row);
			return d.a == 0 ? k->assignPage[t][at] : d.a == 1 ? k->assignDest[t][at] : k->assignAdd[t][at];
		}
		case GKind::AssignFlag:
		{
			const auto* k = kitNow();
			if(!k)
				return std::nullopt;
			const uint8_t mask = d.a == 0 ? k->mirrorMask : d.a == 1 ? k->hpfMask : k->lpfMask;
			return (mask >> d.t) & 1;
		}
		case GKind::MidiValue:
		{
			const auto* k = kitNow();
			return k ? std::optional<int>(k->tracks[static_cast<size_t>(d.t)].midi[static_cast<size_t>(d.a)]) : std::nullopt;
		}
		case GKind::MidiCc:
		{
			const auto* g = globalNow();
			return g ? std::optional<int>(g->midiSeqCcs[static_cast<size_t>(d.t)][static_cast<size_t>(d.a)]) : std::nullopt;
		}
		case GKind::MidiChannel:
		{
			const auto* g = globalNow();
			return g ? std::optional<int>(g->midiSeqChannels[static_cast<size_t>(d.t)] & 15) : std::nullopt;
		}
		}
		return std::nullopt;
	}

	Value Desk::learnGlobalMessage(const int _id, const int _value, const Value& _state) const
	{
		if(_id < 0 || static_cast<size_t>(_id) >= defs().size())
			return Value();
		const auto& d = defs()[static_cast<size_t>(_id)];
		Value m = Value::object();
		const int kit = stateInt(_state, "kit", "current"), pattern = stateInt(_state, "pattern", "current");
		switch(d.kind)
		{
		case GKind::Tempo:
			m.set("op", "tempo");
			m.set("bpm", _value);
			break;
		case GKind::Tune:
			m.set("op", "masterTune");
			m.set("v", _value);
			break;
		case GKind::MultiEnv:
			m.set("op", "multiEnv");
			m.set("k", kit);
			m.set("i", d.a);
			m.set("v", _value);
			break;
		case GKind::Swing:
			m.set("op", "swing");
			m.set("p", pattern);
			m.set("v", _value);
			break;
		case GKind::PatternTranspose:
			m.set("op", "transpose");
			m.set("p", pattern);
			m.set("v", _value);
			break;
		case GKind::Transpose:
			m.set("op", "transpose");
			m.set("p", pattern);
			m.set("t", d.t);
			m.set(d.a == 0 ? "v" : d.a == 1 ? "scale" : "key", _value);
			break;
		case GKind::Arp:
			m.set("op", "arp");
			m.set("p", pattern);
			m.set("t", d.t);
			if(d.a < 7)
			{
				m.set("field", g_arpCommand[d.a]);
				m.set("v", _value);
			}
			else
			{
				m.set("field", "step");
				m.set("i", d.a - 7);
				m.set("v", _value >= 128 ? static_cast<int>(elektronData::g_mmArpStepMuted) : _value);
			}
			break;
		case GKind::Assign:
			m.set("op", "assign");
			m.set("k", kit);
			m.set("t", d.t);
			m.set("src", d.src);
			m.set("row", d.row);
			m.set(d.a == 0 ? "page" : d.a == 1 ? "dest" : "add", _value);
			break;
		case GKind::AssignFlag:
			m.set("op", "assign");
			m.set("k", kit);
			m.set("t", d.t);
			m.set(d.a == 0 ? "mirror" : d.a == 1 ? "hpf" : "lpf", _value != 0);
			break;
		case GKind::MidiValue:
			m.set("op", "param");
			m.set("k", kit);
			m.set("t", d.t + 6);
			m.set("page", 7);
			m.set("i", d.a);
			m.set("v", _value);
			break;
		case GKind::MidiCc:
		{
			const int slot = stateInt(_state, "global", "current");
			const auto it = slot >= 0 && slot <= 255 ? documents().globals.find(static_cast<uint8_t>(slot)) : documents().globals.end();
			if(it == documents().globals.end())
				return Value();
			Value cc = Value::array();
			for(int i = 0; i < 4; ++i)
				cc.push(static_cast<int>(i == d.a ? _value : it->second.midiSeqCcs[static_cast<size_t>(d.t)][static_cast<size_t>(i)]));
			m.set("op", "midiTrack");
			m.set("t", d.t);
			m.set("cc", std::move(cc));
			break;
		}
		case GKind::MidiChannel:
			m.set("op", "midiTrack");
			m.set("t", d.t);
			m.set("ch", _value);
			break;
		}
		return m;
	}
}
