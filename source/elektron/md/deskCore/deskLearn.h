#pragma once

#include "elektronData/json.h"

#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <vector>

namespace deskCore
{
	// MIDI Learn as data (doc/midilearn/DESIGN-learn-0.8.md, slice L0). The mappings are part of the editor's setup
	// (DeskSetup::mappings, saved with the project in "MDSK"); everything here is pure: no JUCE, no device, no thread.
	// The realtime table the audio thread reads is derived from this list elsewhere (L1/L2).
	//
	// A mapping says: this CC on this channel drives that parameter of the learn model. Only CCs are learned.

	enum class LearnMode : uint8_t
	{
		Absolute,
		RelativeSigned,		// 1 = up, 127 = down
		RelativeOffset		// 65 = up, 63 = down
	};

	constexpr size_t g_learnMaxMappings = 128;
	constexpr uint8_t g_learnAnyChannel = 255;

	// The target: track t, for a model with DATA pages the page pg (else -1), the parameter index i of the learn model.
	struct LearnRef
	{
		int t = -1, pg = -1, i = -1;

		bool operator==(const LearnRef& _o) const { return t == _o.t && pg == _o.pg && i == _o.i; }
		bool operator!=(const LearnRef& _o) const { return !(*this == _o); }
	};

	struct LearnMapping
	{
		uint8_t ch = g_learnAnyChannel;	// 0-15 or g_learnAnyChannel
		uint8_t cc = 0;
		LearnRef at;
		LearnMode mode = LearnMode::Absolute;
		bool invert = false;

		// the message and the target: what makes a mapping the same mapping
		bool sameKey(const LearnMapping& _o) const { return ch == _o.ch && cc == _o.cc && at == _o.at; }
		bool operator==(const LearnMapping& _o) const { return sameKey(_o) && mode == _o.mode && invert == _o.invert; }
		bool operator!=(const LearnMapping& _o) const { return !(*this == _o); }
	};

	// What a model's learn targets are: tracks 0..tracks-1, pages 0..pages-1 (0: the model has none, pg is -1), and
	// parameter indices 0..params-1.
	struct LearnLimits
	{
		int tracks = 16;
		int pages = 0;
		int params = 24;
	};

	bool inLimits(const LearnRef& _at, const LearnLimits& _limits);

	const char* learnModeName(LearnMode _mode);			// "absolute", "relative-signed", "relative-offset"
	LearnMode learnModeFromName(const std::string& _name, bool* _known = nullptr);	// unknown: Absolute

	// ---- edits: each returns the new list (the old one when refused, with the reason) ----

	struct LearnEdit
	{
		std::vector<LearnMapping> list;
		std::string refusal;	// empty: done

		bool ok() const { return refusal.empty(); }
	};

	// Adds a mapping. The same message to the same target (ch, cc, target) is one mapping: identical is refused
	// ("already mapped"), a different mode or inversion replaces it where it stands. A different target on the same
	// message is a second target of that CC. The 129th is refused ("128 mappings at most"), as is a cc over 127, a
	// channel that is neither 0-15 nor any, or a target with a negative track or parameter.
	LearnEdit addMapping(const std::vector<LearnMapping>& _list, const LearnMapping& _m);

	// Out of range: the list unchanged.
	std::vector<LearnMapping> removeMapping(const std::vector<LearnMapping>& _list, size_t _index);
	std::vector<LearnMapping> invertMapping(const std::vector<LearnMapping>& _list, size_t _index);

	// The knob row of CC _from becomes CC _to: its any-channel mappings follow (channel-specific ones are the person's
	// own and stay). One that would become another mapping's duplicate is dropped (the row already drives it).
	std::vector<LearnMapping> moveKnobCc(const std::vector<LearnMapping>& _list, uint8_t _from, uint8_t _to);

	// All knob rows changed at once (their CCs _from[i] became _to[i]): each any-channel mapping follows the row whose old CC it
	// has, decided from the original list in one pass, so a swap or a rotation of the rows does not merge their mappings.
	// Duplicates that result are dropped (the first stays).
	std::vector<LearnMapping> moveKnobCcs(const std::vector<LearnMapping>& _list, const std::vector<uint8_t>& _from, const std::vector<uint8_t>& _to);

	// ---- the firmware's own CC map: what a mapping hides ----

	// The machine's channels: the Global's base channel and how many channels from it carry the machine's CCs (the
	// Machinedrum: four, the Monomachine: six).
	struct FirmwareChannels
	{
		int base = 0;
		int span = 4;
	};

	// What CC _cc on the channel _offset from the base channel (0 to span - 1) drives in the firmware (the model's
	// pure CC map), nothing when it is not on the map.
	using FirmwareCcMap = std::function<std::optional<LearnRef>(int _offset, int _cc)>;

	struct LearnOverride
	{
		uint8_t ch = 0;
		LearnRef at;

		bool operator==(const LearnOverride& _o) const { return ch == _o.ch && at == _o.at; }
	};

	// The firmware targets a mapping hides: its (channel, CC) on the machine's channels (all 16 for an any-channel
	// mapping), ascending by channel. Empty when the CC is not on the map there.
	std::vector<LearnOverride> overridesOf(const LearnMapping& _m, const FirmwareChannels& _channels, const FirmwareCcMap& _map);

	// ---- learning: one captured message at a time, data in, data out ----

	struct LearnCapture
	{
		LearnRef target;			// what waits for a controller
		std::vector<uint8_t> values;	// the distinct values seen from the first controller
		uint8_t ch = 0, cc = 0;
		bool started = false;		// the first CC has fixed ch and cc

		static constexpr size_t need = 2;
	};

	struct LearnStep
	{
		LearnCapture next;
		std::optional<LearnMapping> learned;
	};

	// The first CC fixes channel and controller; a different CC or channel is ignored; two different values
	// complete it (a knob turned both ways, a button pressed and released). Anything but a CC (status 0xB0 to 0xBF)
	// changes nothing: notes stay the machine's. The learned mapping carries the channel it came on. After a learned
	// mapping the capture is empty again (no target).
	LearnStep learnStep(const LearnCapture& _c, uint8_t _status, uint8_t _cc, uint8_t _value);

	// {0, 127} only: a button, Absolute. 1 and 127 (or low values near 1 with high near 127): Relative Signed.
	// Around 63/65: Relative Offset. Anything else Absolute.
	LearnMode detectMode(const std::vector<uint8_t>& _values);

	// ---- the setup member ----

	// "mappings": a list of {ch, cc, t, [pg,] i, mode, invert}. Lenient (FOUNDATION, "What 1.0 promises to read"): an
	// unknown member is ignored, an unknown mode is absolute, an item with a bad or missing ch, cc, t or i (pg for a
	// model with pages), or a target outside the limits, or one that repeats an earlier (ch, cc, target), is left out
	// alone, items past 128 are left out. Errors carry the JSON path (_path is the member's, "$.mappings").
	std::vector<LearnMapping> mappingsFromJson(const elektronData::json::Value& _list, const LearnLimits& _limits,
		std::vector<std::string>& _errors, const std::string& _path = "$.mappings");
	elektronData::json::Value mappingsToJson(const std::vector<LearnMapping>& _list, bool _pages);

	// ---- alpha projects: the "MDLN" chunk's preset (pluginLib JSON) ----

	// The learn model's parameter index for a plug-in parameter name (and its page for a model with pages): t unused.
	using LearnModelLookup = std::function<std::optional<LearnRef>(const std::string& _paramName)>;

	struct MdlnImport
	{
		std::vector<LearnMapping> mappings;
		std::vector<std::string> left;	// what could not be taken over, with the reason
	};

	// Read only. Each ControlChange mapping whose paramName the model knows and whose part is a track becomes a
	// setup mapping; the rest (an automatic part, an unknown name, other message types, a bad item) is left out.
	MdlnImport importMdln(const elektronData::json::Value& _preset, const LearnModelLookup& _model, const LearnLimits& _limits);
}
