#pragma once

// 0.8 (I-053): what the standalone does when a MIDI device is plugged in or out, as plain values: tested by
// mdMidiHotplugTest (no JUCE, no ports).
//   - The editor remembers every MIDI input the user switched on (identifier AND name) and the chosen MIDI output.
//     JUCE's AudioDeviceManager keeps such a list only from the saved state at start, so an input switched on later
//     was not brought back, and an input the user switched off came back with the next plug.
//   - reconcile: the identifiers to switch on (a remembered port is listed again: matched by identifier, then by
//     name, because an identifier can change on replug) and the ones to switch off (a port that has gone, or one
//     that is on but not remembered). The remembered ports learn the new identifier.
//   - outputFor: the available output that is the remembered one (identifier, then name), "" when it is not there.

#include <algorithm>
#include <string>
#include <vector>

namespace mdJucePlugin
{
	namespace midiHotplug
	{
		struct Port
		{
			std::string id;
			std::string name;

			bool operator==(const Port& _o) const { return id == _o.id && name == _o.name; }
		};

		struct Plan
		{
			std::vector<std::string> enable;
			std::vector<std::string> disable;
		};

		inline bool contains(const std::vector<std::string>& _ids, const std::string& _id)
		{
			return std::find(_ids.begin(), _ids.end(), _id) != _ids.end();
		}

		// The available port that is _wanted: the same identifier, else the same name (not one in _taken). nullptr = none.
		inline const Port* find(const std::vector<Port>& _available, const Port& _wanted, const std::vector<std::string>& _taken = {})
		{
			if(!_wanted.id.empty())
				for(const auto& p : _available)
					if(p.id == _wanted.id && !contains(_taken, p.id))
						return &p;
			if(!_wanted.name.empty())
				for(const auto& p : _available)
					if(p.name == _wanted.name && !contains(_taken, p.id))
						return &p;
			return nullptr;
		}

		// The user switched a port on (it is remembered, with its current identifier) or off (it is forgotten).
		inline void remember(std::vector<Port>& _wanted, const Port& _port, const bool _on)
		{
			_wanted.erase(std::remove_if(_wanted.begin(), _wanted.end(), [&](const Port& _w)
			{
				return _w.id == _port.id || (_on && !_port.name.empty() && _w.name == _port.name);
			}), _wanted.end());
			if(_on)
				_wanted.push_back(_port);
		}

		// The devices changed: what to switch on and off. _wanted learns the identifiers the ports have now.
		inline Plan reconcile(std::vector<Port>& _wanted, const std::vector<Port>& _available, const std::vector<std::string>& _enabled)
		{
			Plan plan;
			std::vector<std::string> keep;
			// a remembered port that kept its identifier first, so a second port of the same name cannot take its place
			for(auto& w : _wanted)
				for(const auto& p : _available)
					if(!w.id.empty() && p.id == w.id && !contains(keep, p.id))
					{
						keep.push_back(p.id);
						break;
					}
			for(auto& w : _wanted)
			{
				if(contains(keep, w.id))
					continue;
				if(const auto* p = find(_available, w, keep))
				{
					w.id = p->id;
					keep.push_back(p->id);
				}
			}
			for(const auto& id : keep)
				if(!contains(_enabled, id))
					plan.enable.push_back(id);
			for(const auto& id : _enabled)
				if(!contains(keep, id))
					plan.disable.push_back(id);
			return plan;
		}

		// Ports that appeared and ports that went between two lists of what the system offers (by identifier).
		struct Change
		{
			std::vector<Port> added;
			std::vector<Port> removed;
		};

		inline Change change(const std::vector<Port>& _before, const std::vector<Port>& _after)
		{
			Change c;
			const auto has = [](const std::vector<Port>& _l, const Port& _p)
			{
				return std::any_of(_l.begin(), _l.end(), [&](const Port& _q) { return _q.id == _p.id; });
			};
			for(const auto& p : _after)
				if(!has(_before, p))
					c.added.push_back(p);
			for(const auto& p : _before)
				if(!has(_after, p))
					c.removed.push_back(p);
			return c;
		}

		// The identifier of the available output that is the remembered one, "" when it is not listed.
		inline std::string outputFor(const std::vector<Port>& _available, const Port& _wanted)
		{
			if(_wanted.id.empty() && _wanted.name.empty())
				return {};
			const auto* p = find(_available, _wanted);
			return p ? p->id : std::string();
		}
	}
}
