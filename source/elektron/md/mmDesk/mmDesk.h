#pragma once

#include "mmDeskAdapter.h"
#include "mmDeskModel.h"
#include "mmRecv.h"

#include "deskCore/deskDesk.h"
#include "deskCore/deskMod.h"
#include "deskCore/deskSetup.h"
#include "deskCore/deskSolo.h"

#include "elektronData/json.h"

#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace mmDesk
{
	// The Monomachine Editor behind its page (MM OS 1.32B, P6): deskCore's Desk (the same core,
	// router and adapter seam as the Machinedrum's; here the edits are whole documents) plus what is
	// the Monomachine's own: the app modulators (deskCore's ModEngine, as the MD's) and the device
	// facts it forwards to its adapter. Single-threaded.
	class Desk final : public deskCore::Desk<MmModel, MmAdapter>
	{
	public:
		using Bytes = std::vector<uint8_t>;
		using Value = elektronData::json::Value;
		using Probe = MmAdapter::Probe;
		using Adapter = MmAdapter;
		using Profile = mmDesk::Profile;
		using DevicePort = mmDesk::DevicePort;

		// The device edge (the engine's) plus the page and the project's setup store.
		struct Port
		{
			DevicePort device;
			std::function<void(const Value&)> toPage;
			// The app modulators or the solo changed: keep them with the project (mm-desk/setup).
			std::function<void(const Value& _setup)> saveSetup;
			// After every ready of a page, once the desk has published its own documents.
			std::function<void()> ready;
		};

		// With the Monomachine adapter both engines use (MmMachine), for this profile.
		explicit Desk(Port _port, const Profile& _profile = emulatorProfile());
		Desk(std::unique_ptr<MmAdapter> _adapter, Port _port);

		static std::unique_ptr<MmAdapter> defaultAdapter(const Profile& _profile, const DevicePort& _device);

		void onTelemetry(const Telemetry& _t);
		// md::MmTelemetry's working-kit region: [0] kit number, [5..] the raw kit.
		// Device facts; what they change goes out at once, as with the MD's.
		void onWorkingKit(const Bytes& _region) { machine().onWorkingKit(_region); flush(); }
		void setProbe(Probe _probe) { machine().setProbe(_probe); flush(); }
		// The setup stored with the project (mm-desk/setup, or the bare mm-desk/modulators of 0.x projects): what of it
		// this version can use, the default for the rest (never the previous project's); errors say what was left out.
		std::vector<std::string> loadSetup(const Value& _setup);

		bool isReady() const { return isInputReady(); }
		// The adapter's status line (Machine::status), read for tests and diagnostics.
		std::string recvState() const { const auto s = status(); const auto* v = s.find("recv"); return v && v->isString() ? v->asString() : std::string(); }
		bool recvParked() const { const auto s = status(); const auto* v = s.find("parked"); return v && v->isBool() && v->asBool(); }
		std::optional<elektronData::MmPattern> pattern(uint8_t _slot) const;
		// The stored slot (what a dump holds).
		std::optional<elektronData::MmKit> kit(uint8_t _slot) const;
		// The kit that plays, as the machine holds it (with the live edits it took).
		std::optional<elektronData::MmKit> workingKit() const;
		std::optional<elektronData::MmSong> song(uint8_t _slot) const;
		std::optional<elektronData::MmGlobal> global(uint8_t _slot) const;
		// What the default adapter (MmMachine) knows plays, for tests and diagnostics; -1 for another
		// adapter. Not part of MmAdapter: the machine document and the adapter's context carry it.
		int currentPattern() const;
		int currentKit() const;
		int currentSong() const;
		int currentGlobal() const;
		size_t loaded() const { const auto s = status(); const auto* v = s.find("loaded"); return v && v->isNumber() ? static_cast<size_t>(v->asNumber()) : 0; }
		double lastRoundTripMs() const { const auto s = status(); const auto* v = s.find("roundTripMs"); return v && v->isNumber() ? v->asNumber() : -1; }

		// The Owner::Setup ops the desk has a function for (checked against the table).
		static std::vector<std::string> setupOps();

	private:
		void onSetup(const Value& _message) override;
		void onReadyExtra() override { publishModulators(); publishSolo(); }
		// The page dropped its solo with the rest: the project's is said again (B-123).
		void onStartOver() override { publishSolo(); }
		void publishModulators();
		void setSolo(const Value& _message);
		void publishSolo();
		// The setup the project keeps (mm-desk/setup): the modulators and the page's solo.
		Value setupDoc() const;
		void runModulators();

		std::function<void(const Value&)> m_saveSetup;
		deskCore::ModEngine m_mods;
		deskCore::SoloMemo m_solo;	// the page's solo and the mutes the person had before it
	};

	// The Monomachine's links address its six synth tracks' DATA pages (page * 8 + index) and levels.
	constexpr deskCore::ModLimits g_mmModLimits{"mm-desk/modulators", 5, 63};
	// Its setup document: the modulators and the solo of its 12 tracks (no knob rows).
	constexpr deskCore::SetupSpec g_mmSetupSpec{"mm-desk/setup", g_mmModLimits, 12, false};
}
