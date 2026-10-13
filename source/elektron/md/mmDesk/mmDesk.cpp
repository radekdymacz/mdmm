#include "mmDesk.h"

#include "mmDeskMachine.h"

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

	std::vector<std::string> Desk::setupOps() { return {"modSet", "soloSet"}; }

	// The table's Owner::Setup rows: modSet and soloSet.
	void Desk::onSetup(const Value& _message)
	{
		const auto op = deskCore::opOf(_message);
		if(op == "soloSet")
		{
			setSolo(_message);
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
		auto doc = deskCore::modSetupToJson(m_mods.setup(), g_mmModLimits);
		if(!m_solo.empty())
			doc.set("solo", deskCore::solo::toJson(m_solo));
		return doc;
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
	}

	std::vector<std::string> Desk::loadSetup(const Value& _setup)
	{
		std::vector<std::string> errors;
		if(const auto setup = deskCore::modSetupFromJson(_setup, errors, g_mmModLimits))
			m_mods.setSetup(*setup);
		m_solo = {};
		if(const auto* s = _setup.find("solo"))
			if(const auto solo = deskCore::solo::fromJson(*s, 12, errors))
				m_solo = *solo;
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
