#pragma once

#include "mdFactorySource.h"
#include "mdSyxWork.h"

#include "mdLib/mdromloader.h"
#include "mdLib/mdtypes.h"

#include "deskCore/deskLifecycle.h"
#include "elektronData/json.h"

#include <functional>
#include <string>
#include <utility>
#include <vector>

namespace mdJucePlugin
{
	// Reset machine… > Factory reset, both models (the Machinedrum: P6; the Monomachine: doc/release/0.9.1/
	// mm-factory-reset.md): the factory kits, patterns and songs come from a second machine started from the user's own
	// ROM with no patch RAM (mdFactorySource.h), read once a session; then they go to the machine as an import of every
	// slot (SyxWork::reset: read back, reported, one undo step, B-130). Globals stay (and the Machinedrum's samples, the
	// Monomachine's user waveforms). Over a cable the same dumps go to the real machine. A session holds one and hands
	// it machineReset {how: "factory"} and its step.
	template<typename DeskT>
	class FactoryReset
	{
	public:
		using Value = elektronData::json::Value;
		using Reply = std::function<void(const Value& _message, bool _ok, const std::string& _note)>;
		using ToPage = std::function<void(const Value&)>;

		// _name: the machine ("Monomachine"); _os: its ROM as the page names it ("MM OS 1.32B")
		FactoryReset(const md::MachineModel _model, std::string _name, std::string _os)
			: m_model(_model), m_name(std::move(_name)), m_os(std::move(_os))
		{
		}

		void request(DeskT& _desk, SyxWork<DeskT>& _syx, const Value& _message, const Reply& _reply, const ToPage& _toPage)
		{
			const auto* how = _message.find("how");
			if(!how || !how->isString() || how->asString() != "factory")
			{
				_reply(_message, false, "machineReset: empty or factory");
				return;
			}
			if(m_source.running() || m_wanted)
			{
				_reply(_message, false, "The factory data is being prepared: the reset follows by itself.");
				return;
			}
			if(_syx.running())
			{
				_reply(_message, false, "An import or export is running: try again when it is done.");
				return;
			}
			if(!m_dumps.empty())
			{
				const auto why = _syx.reset(_desk, m_dumps, "Factory reset", "restored", _toPage);
				_reply(_message, why.empty(), why);
				return;
			}
			const auto rom = md::RomLoader::findROM(m_model);
			if(!rom.isValid())
			{
				_reply(_message, false, "No " + m_os + " ROM found: the factory data comes from it.");
				return;
			}
			m_source.start(rom.data(), rom.getFilename(), m_model);
			m_wanted = true;
			m_newsMs = -1e9;
			_reply(_message, true, "Preparing the factory data: a second " + m_name + " starts from your ROM, unheard, and is read "
				"(seconds). Nothing on your machine changes until then.");
		}

		// The session's step: the preparation's news once a second, then the reset when the dumps are in
		void step(DeskT& _desk, SyxWork<DeskT>& _syx, const double _nowMs, const ToPage& _toPage)
		{
			if(!m_wanted)
				return;
			const int total = MdFactorySource::total(m_model);
			if(m_source.running())
			{
				if(_nowMs - m_newsMs < 1000)
					return;
				m_newsMs = _nowMs;
				const auto n = m_source.progress();
				Value m = Value::object();
				m.set("type", "syxReset");
				m.set("phase", "prepare");
				m.set("done", n);
				m.set("total", total);
				m.set("text", n ? "Reading the factory data: " + std::to_string(n) + " of " + std::to_string(total)
					: "Starting a second " + m_name + " from your ROM for the factory data");
				_toPage(m);
				return;
			}
			auto r = m_source.take();
			if(!r)
				return;
			m_wanted = false;
			std::string why = r->error;
			if(why.empty())
			{
				m_dumps = std::move(r->dumps);
				if(_desk.lifecycle() != deskCore::Lifecycle::Ready)
					why = "The machine is not ready: choose Factory reset again when it is.";
				else
					why = _syx.reset(_desk, m_dumps, "Factory reset", "restored", _toPage);
			}
			if(!why.empty())
			{
				Value m = Value::object();
				m.set("type", "syxReset");
				m.set("phase", "failed");
				m.set("done", 0);
				m.set("total", total);
				m.set("text", "Factory reset: " + why);
				_toPage(m);
			}
		}

	private:
		md::MachineModel m_model;
		std::string m_name;
		std::string m_os;
		MdFactorySource m_source;
		bool m_wanted = false;
		double m_newsMs = -1e9;
		std::vector<std::vector<uint8_t>> m_dumps;	// read once a session: the same at every start (P6)
	};
}
