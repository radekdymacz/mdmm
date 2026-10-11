#pragma once

#include <array>
#include <cstdint>

namespace elektronData
{
	// The Machinedrum's named values, once (P6): the codec's JSON, the editor's command table
	// (its oneOf), its pure edits and the page's catalogue all read these.
	constexpr std::array<const char*, 4> g_mdTempoMultipliers{"1X", "2X", "3/4X", "3/2X"};
	constexpr std::array<const char*, 4> g_mdMasterFx{"gateBox", "rhythmEcho", "eq", "dynamix"};
	constexpr std::array<const char*, 7> g_mdOutputs{"A", "B", "C", "D", "E", "F", "MAIN"};
	// An LFO's settings in the kit and their largest values.
	constexpr std::array<const char*, 5> g_mdLfoFields{"track", "param", "shape1", "shape2", "update"};
	constexpr std::array<int, 5> g_mdLfoFieldMax{15, 23, 5, 5, 2};
	constexpr std::array<const char*, 3> g_mdLfoUpdates{"FREE", "TRIG", "HOLD"};
	// The routing page's LFO parameters, as kit parameter indices (speed, depth, shape mix).
	struct MdNamedParam
	{
		const char* name;
		uint8_t index;
	};
	constexpr std::array<MdNamedParam, 3> g_mdLfoParams{{{"SPD", 21}, {"DEPTH", 22}, {"SHMIX", 23}}};
	// A track's level is kit parameter index 24 in the editor's commands (after the 24 values).
	constexpr uint8_t g_mdLevelIndex = 24;
	// The GLOBAL settings the editor sets by name (globalSet).
	// trigIn: TRIG IN A or B (input 0, 1), one of g_mdTrigInParams (0.6, PROBES-manual-gaps.md P3); resetMap: the map
	// editor back to Elektron's note map (the factory global's, as SysEx 0x64 leaves it).
	constexpr std::array<const char*, 13> g_mdGlobalFields{"baseChannel", "tempoIn", "ctrlIn", "tempoOut", "ctrlOut",
		"programChangeIn", "programChangeOut", "localControl", "programChangeChannel", "trigMode", "keymap", "trigIn", "resetMap"};
	// TRIG IN A / B's five settings, in the order of the global's interleaved inputSettings bytes (A at 2i, B at 2i + 1).
	constexpr std::array<const char*, 5> g_mdTrigInParams{"dest", "gate", "sens", "vmin", "vmax"};
}
