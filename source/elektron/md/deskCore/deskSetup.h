#pragma once

#include "deskMod.h"
#include "deskSolo.h"

#include "elektronData/json.h"

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace deskCore
{
	// The editor's own setup that belongs to the project, not to the machine (P4), for either model: the app
	// modulators, the CC numbers of the Control workspace's eight knob rows (a model with them) and the solo (the
	// tracks soloed and the person's mutes, B-123). As the "<model>-desk/setup" document it is stored with the plug-in
	// state (the "MDSK" chunk: the host keeps the text, it never looks inside) and restored with the project.
	struct DeskSetup
	{
		static constexpr std::array<uint8_t, 8> g_defaultKnobCcs{21, 22, 23, 24, 25, 26, 27, 28};

		ModSetup modulators;
		std::array<uint8_t, 8> knobCcs = g_defaultKnobCcs;
		SoloMemo solo;
		// I-003: the selected track follows the last one played from a MIDI controller (off by default; written only when on,
		// read leniently: anything but a boolean is off)
		bool followPlayed = false;

		bool operator==(const DeskSetup& _o) const { return modulators == _o.modulators && knobCcs == _o.knobCcs && solo == _o.solo && followPlayed == _o.followPlayed; }
		bool operator!=(const DeskSetup& _o) const { return !(*this == _o); }
	};

	// What a model's setup document is.
	struct SetupSpec
	{
		const char* schema = "md-desk/setup";
		ModLimits modulators;
		int tracks = 16;
		bool knobCcs = true;	// the model has the knob rows
		// Written as the bare modulators document with "solo" beside it (the MM: the 0.x shape, so 0.7 reads a 1.0
		// project). The schema's wrapper is read already and is written once a member needs it.
		bool writesBare = false;
	};

	constexpr int g_setupVersion = 1;	// the major (readsMajor)

	// A project's setup, as much of it as this version can use; never fails. Members it does not know are ignored, a
	// bad item is left out alone (a source, a link; the knob rows or the solo as a whole fall back to the default), and
	// a document of another schema or a newer major version is the default setup. Errors carry JSON paths. The bare
	// modulators document beside a "solo" member ("<model>-desk/modulators", what the MM writes) is read too.
	DeskSetup setupFromJson(const elektronData::json::Value& _doc, const SetupSpec& _spec, std::vector<std::string>& _errors);
	elektronData::json::Value setupToJson(const DeskSetup& _setup, const SetupSpec& _spec);

	// Knob CCs must be 8, 0-127 and distinct.
	std::vector<std::string> validateKnobCcs(const std::vector<int>& _ccs);
}
