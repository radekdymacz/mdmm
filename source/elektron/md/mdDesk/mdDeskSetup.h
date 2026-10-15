#pragma once

#include "deskCore/deskMod.h"
#include "deskCore/deskSetup.h"
#include "deskCore/deskSolo.h"

#include "elektronData/json.h"

#include <string>
#include <vector>

namespace mdDesk
{
	// The app modulators are deskCore's (shared with the Monomachine); the MD's links address the
	// 16 tracks' 24 kit parameters.
	using deskCore::ModSetup;
	using deskCore::ModSource;
	using deskCore::ModLink;
	using deskCore::ModEngine;
	using deskCore::g_modCcPerSecond;
	using deskCore::modSetupFromJson;
	using deskCore::modSetupToJson;
	constexpr deskCore::ModLimits g_mdModLimits{"md-desk/modulators", 15, 23};

	// The editor's setup kept with the project (deskCore::DeskSetup): the app modulators, the Control workspace's eight
	// knob-row CCs and the solo, as the "md-desk/setup" document.
	using deskCore::DeskSetup;
	using deskCore::validateKnobCcs;
	constexpr deskCore::SetupSpec g_mdSetupSpec{"md-desk/setup", g_mdModLimits, 16, true};

	// A project's setup: what this version can use (deskCore::setupFromJson); errors carry JSON paths.
	inline DeskSetup deskSetupFromJson(const elektronData::json::Value& _doc, std::vector<std::string>& _errors)
	{
		return deskCore::setupFromJson(_doc, g_mdSetupSpec, _errors);
	}
	inline elektronData::json::Value deskSetupToJson(const DeskSetup& _setup) { return deskCore::setupToJson(_setup, g_mdSetupSpec); }
}
