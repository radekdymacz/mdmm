#include "mdMidiLearnCommands.h"

#include "deskCore/deskCommands.h"

#include "jucePluginLib/controller.h"
#include "jucePluginLib/parameter.h"

namespace mdJucePlugin
{
	namespace json = elektronData::json;

	namespace
	{
		int intOf(const json::Value& _m, const char* _key, const int _default = -1)
		{
			const auto* v = _m.find(_key);
			return v && v->isNumber() ? static_cast<int>(v->asNumber()) : _default;
		}

		// the words the pages show (the pluginLib mapping's, which the pages were written against)
		const char* modeWord(const deskCore::LearnMode _mode)
		{
			switch(_mode)
			{
			case deskCore::LearnMode::RelativeSigned: return "RelativeSigned";
			case deskCore::LearnMode::RelativeOffset: return "RelativeOffset";
			default: return "Absolute";
			}
		}
	}

	MidiLearnCommands::MidiLearnCommands(LearnRouter& _router, Model _model, Host _host, std::function<void(const Value&)> _publish)
		: m_router(_router), m_model(std::move(_model)), m_host(std::move(_host)), m_publish(std::move(_publish))
	{
	}

	MidiLearnCommands::~MidiLearnCommands()
	{
		// the parameters outlive this (the controller goes after the session): the host's gestures are closed
		closeGestures();
		if(learning())
			m_router.setLearning(false);
	}

	MidiLearnCommands::Model MidiLearnCommands::onlyRealtime(Model _model, const RealtimeCheck& _realtime)
	{
		std::vector<Param> kept;
		for(const auto& p : _model.params)
		{
			bool all = true;
			for(int t = 0; t < _model.tracks && all; ++t)
				all = _realtime && _realtime(p.name, t);
			if(all)
				kept.push_back(p);
		}
		_model.params = std::move(kept);
		return _model;
	}

	MidiLearnCommands::Model MidiLearnCommands::onlyRealtime(Model _model, const pluginLib::Controller& _controller)
	{
		return onlyRealtime(std::move(_model), [&_controller](const std::string& _name, const int _track)
		{
			const auto* p = _controller.getParameter(_name, static_cast<uint8_t>(_track));
			return p && p->takesRealtimeHostValues();
		});
	}

	MidiLearnCommands::Ref MidiLearnCommands::targetOf(const Value& _message) const
	{
		return {intOf(_message, "t"), m_model.pages ? intOf(_message, "pg") : -1, intOf(_message, "i", m_model.pages ? 0 : -1)};
	}

	std::string MidiLearnCommands::parameterOf(const Ref& _t) const
	{
		if(_t.t < 0 || _t.t >= m_model.tracks)
			return {};
		for(const auto& p : m_model.params)
			if(p.at.pg == _t.pg && p.at.i == _t.i)
				return p.name;
		return {};
	}

	MidiLearnCommands::Value MidiLearnCommands::limits() const
	{
		json::Value params = json::Value::array();
		for(const auto& p : m_model.params)
		{
			json::Value v = json::Value::object();
			if(m_model.pages)
				v.set("pg", p.at.pg);
			v.set("i", p.at.i);
			v.set("name", p.name);
			params.push(std::move(v));
		}
		json::Value l = json::Value::object();
		l.set("tracks", m_model.tracks);
		l.set("params", std::move(params));
		l.set("max", static_cast<int>(deskCore::g_learnMaxMappings));
		return l;
	}

	MidiLearnCommands::Value MidiLearnCommands::targetJson(const Ref& _at) const
	{
		json::Value v = json::Value::object();
		v.set("t", _at.t);
		if(m_model.pages)
			v.set("pg", _at.pg);
		v.set("i", _at.i);
		return v;
	}

	void MidiLearnCommands::reply(const Value& _message, const bool _ok, const std::string& _note) const
	{
		m_publish(deskCore::resultMessage(_message, _ok ? std::vector<std::string>{} : std::vector<std::string>{_note}, _note));
	}

	void MidiLearnCommands::closeGestures()
	{
		for(size_t n = 0; n < m_touch.size(); ++n)
		{
			if(!m_touch[n].open)
				continue;
			m_touch[n].open = false;
			if(n < m_params.size() && m_params[n])
				m_params[n]->popChangeGesture();
		}
	}

	void MidiLearnCommands::rebuild()
	{
		closeGestures();
		m_built = m_host.mappings ? m_host.mappings() : std::vector<deskCore::LearnMapping>{};
		m_builtValid = true;
		// the audio thread's view; every parameter in it belongs to the controller, which outlives the session
		m_router.publishAndSettle(buildLearnTable(m_built, m_host.parameter, ++m_generation, &m_params));
		// the bits the old table set name its mappings, not these: none is carried over
		(void)m_router.takeTouched();
	}

	void MidiLearnCommands::edit(std::vector<deskCore::LearnMapping> _list)
	{
		m_host.setMappings(std::move(_list));
		rebuild();
	}

	std::string MidiLearnCommands::pausedNow() const
	{
		return m_host.pausedReason ? m_host.pausedReason() : std::string();
	}

	void MidiLearnCommands::cancelLearning()
	{
		if(learning())
			stopLearning();
	}

	void MidiLearnCommands::stopLearning()
	{
		m_capture = deskCore::LearnCapture{};
		m_router.setLearning(false);
	}

	// One function per action (deskHost's table); the table checked the arguments' types and ranges, the model says
	// which tracks and parameters can be learned.
	void MidiLearnCommands::handle(const deskHost::Action _action, const Value& _message)
	{
		using A = deskHost::Action;
		if(!m_model.enabled)
		{
			reply(_message, false, "MIDI mapping is not available in this version");
			return;
		}
		const auto target = targetOf(_message);
		const auto name = parameterOf(target);
		if(_action == A::LearnStart && pausedNow() != "")
		{
			reply(_message, false, pausedNow());
			return;
		}
		const auto learnable = [&] { return !name.empty() && m_host.parameter && m_host.parameter(target) != nullptr; };
		switch(_action)
		{
		case A::LearnStart:
		{
			if(!learnable())
			{
				reply(_message, false, m_model.refusal);
				return;
			}
			// a second learnStart while learning moves the target
			m_capture = deskCore::LearnCapture{};
			m_capture.target = target;
			m_router.setLearning(true);
			reply(_message, true, {});
			break;
		}
		case A::LearnAdd:
		{
			// A mapping made without LEARN: a controller row x a track's parameter.
			if(!learnable())
			{
				reply(_message, false, "learnAdd: a learnable parameter of a track (learn.doc.limits)");
				return;
			}
			deskCore::LearnMapping mapping;
			mapping.cc = static_cast<uint8_t>(intOf(_message, "cc"));
			// The table checked ch is 0-15; without it, all channels.
			mapping.ch = static_cast<uint8_t>(intOf(_message, "ch", deskCore::g_learnAnyChannel));
			mapping.at = target;
			const auto r = deskCore::addMapping(m_host.mappings(), mapping);
			if(!r.ok())
			{
				reply(_message, false, r.refusal);
				return;
			}
			edit(r.list);
			reply(_message, true, "CC " + std::to_string(mapping.cc) + " -> track " + std::to_string(target.t + 1));
			break;
		}
		case A::LearnCancel:
			stopLearning();
			reply(_message, true, {});
			break;
		case A::LearnRemove:
		case A::LearnInvert:
		{
			const auto index = intOf(_message, "index");
			const auto& list = m_host.mappings();
			if(index < 0 || static_cast<size_t>(index) >= list.size())
			{
				reply(_message, false, "learn: no such mapping");
				return;
			}
			edit(_action == A::LearnRemove ? deskCore::removeMapping(list, static_cast<size_t>(index))
				: deskCore::invertMapping(list, static_cast<size_t>(index)));
			reply(_message, true, {});
			break;
		}
		default:
			reply(_message, false, "not a MIDI learn command");
			return;
		}
		publish();
	}

	// Learning is pulled: the CCs the audio thread captured, oldest first, through the pure learn step.
	void MidiLearnCommands::takeCaptured()
	{
		if(!learning())
			return;
		const auto before = m_capture.values.size();
		std::optional<deskCore::LearnMapping> learned;
		m_router.drainCaptured([&](const uint8_t _status, const uint8_t _cc, const uint8_t _value)
		{
			if(learned || !learning())
				return;
			auto s = deskCore::learnStep(m_capture, _status, _cc, _value);
			m_capture = std::move(s.next);
			learned = s.learned;
		});
		if(learned)
		{
			stopLearning();
			const auto r = deskCore::addMapping(m_host.mappings(), *learned);
			if(r.ok())
				edit(r.list);
			else
			{
				json::Value m = json::Value::object();
				m.set("type", "error");
				m.set("message", "MIDI learn: " + r.refusal);
				m_publish(m);
			}
			publish();
		}
		else if(m_capture.values.size() != before)
			publish();
	}

	// What the audio thread moved: the host hears the value, in a change gesture that ends g_gestureMs after the last move.
	void MidiLearnCommands::notifyHost()
	{
		const double now = m_host.nowMs ? m_host.nowMs() : 0;
		const auto touched = m_router.takeTouched();
		for(size_t n = 0; n < m_params.size() && n < m_touch.size(); ++n)
		{
			auto* p = m_params[n];
			if(!p)
				continue;
			auto& t = m_touch[n];
			if(touched[n >> 6] >> (n & 63) & 1)
			{
				if(!t.open)
				{
					p->pushChangeGesture();
					t.open = true;
				}
				p->notifyHostOfValue();
				t.lastMs = now;
			}
			else if(t.open && now - t.lastMs >= g_gestureMs)
			{
				t.open = false;
				p->popChangeGesture();
			}
		}
	}

	void MidiLearnCommands::step()
	{
		if(!m_model.enabled)
			return;
		// the list changed outside the commands (a project load, a knob row's CC): the table follows
		if(!m_builtValid || m_host.mappings() != m_built)
		{
			rebuild();
			publish();
		}
		// Learn off (the HW MIDI engine): a learn in progress ends; the document says so and is made again on any change
		const auto paused = pausedNow();
		if(!paused.empty() && learning())
		{
			stopLearning();
			publish();
		}
		const int base = m_host.baseChannel ? m_host.baseChannel() : 0;
		if(base != m_publishedBase || paused != m_publishedPaused)
			publish();	// the overrides depend on the base channel, the rest on the engine
		takeCaptured();
		notifyHost();
	}

	void MidiLearnCommands::setLeft(std::vector<std::string> _left)
	{
		m_left = std::move(_left);
		if(m_model.enabled)
			publish();
	}

	void MidiLearnCommands::publish()
	{
		m_publishedBase = m_host.baseChannel ? m_host.baseChannel() : 0;
		m_publishedPaused = pausedNow();
		json::Value doc = json::Value::object();
		doc.set("enabled", m_model.enabled);
		json::Value mappings = json::Value::array();
		if(m_model.enabled && m_host.mappings)
		{
			const auto& list = m_host.mappings();
			const deskCore::FirmwareChannels channels{m_host.baseChannel ? m_host.baseChannel() : 0, m_model.span};
			for(size_t n = 0; n < list.size(); ++n)
			{
				const auto& m = list[n];
				json::Value v = json::Value::object();
				v.set("index", static_cast<int>(n));
				v.set("t", m.at.t);
				if(m_model.pages)
					v.set("pg", m.at.pg);
				v.set("i", m.at.i);
				v.set("name", parameterOf(m.at));
				v.set("cc", static_cast<int>(m.cc));
				v.set("ch", static_cast<int>(m.ch));
				v.set("mode", modeWord(m.mode));
				v.set("invert", m.invert);
				// the machine's own targets of this (channel, CC) that the mapping hides
				json::Value overrides = json::Value::array();
				for(const auto& o : deskCore::overridesOf(m, channels, m_host.firmwareCcMap))
				{
					json::Value ov = targetJson(o.at);
					ov.set("ch", static_cast<int>(o.ch));
					overrides.push(std::move(ov));
				}
				v.set("overrides", std::move(overrides));
				mappings.push(std::move(v));
			}
		}
		doc.set("mappings", std::move(mappings));
		if(m_model.enabled && learning())
		{
			json::Value l = targetJson(m_capture.target);
			l.set("name", parameterOf(m_capture.target));
			l.set("got", static_cast<int>(m_capture.values.size()));
			l.set("need", static_cast<int>(deskCore::LearnCapture::need));
			doc.set("learning", std::move(l));
		}
		else
			doc.set("learning", json::Value());
		if(m_model.enabled)
		{
			doc.set("limits", limits());
			if(!m_publishedPaused.empty())
				doc.set("paused", m_publishedPaused);
			if(!m_left.empty())
			{
				json::Value left = json::Value::array();
				for(const auto& s : m_left)
					left.push(json::Value(s));
				doc.set("left", std::move(left));
			}
		}
		json::Value m = json::Value::object();
		m.set("type", "learn");
		m.set("doc", std::move(doc));
		m_publish(m);
	}
}
