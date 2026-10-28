#include "deskHost.h"

#include <array>

namespace deskHost
{
	namespace
	{
		constexpr std::array<const char*, static_cast<size_t>(AudioSetting::Count)> g_settings{
			"driver", "output", "input", "mute", "outputChannel", "sampleRate", "bufferSize", "midiInput", "midiOutput"};
		constexpr std::array<const char*, static_cast<size_t>(AudioAction::Count)> g_actions{"test", "bluetooth"};

		template<size_t N>
		std::vector<const char*> names(const std::array<const char*, N>& _a)
		{
			return {_a.begin(), _a.end()};
		}

		template<typename E, size_t N>
		std::optional<E> find(const std::array<const char*, N>& _a, const std::string& _name)
		{
			for(size_t i = 0; i < N; ++i)
				if(_name == _a[i])
					return static_cast<E>(i);
			return std::nullopt;
		}
	}

	const char* audioSettingName(const AudioSetting _s) { return g_settings[static_cast<size_t>(_s)]; }
	const char* audioActionName(const AudioAction _a) { return g_actions[static_cast<size_t>(_a)]; }
	std::optional<AudioSetting> audioSettingOf(const std::string& _name) { return find<AudioSetting>(g_settings, _name); }
	std::optional<AudioAction> audioActionOf(const std::string& _name) { return find<AudioAction>(g_actions, _name); }

	const Table& commands()
	{
		using deskCore::Arg;
		using deskCore::ArgType;
		using deskCore::CoreOp;
		using deskCore::Gate;
		using deskCore::Owner;
		const Arg t{"t", ArgType::Integer, 0, 15, true};	// optional: a global target has none (g)
		const Arg g{"g", ArgType::Integer, 0, 255, true};	// B-169: a global target's id (learn.doc.limits.globals)
		const Arg pg{"pg", ArgType::Integer, 0, 7, true};
		const Arg i{"i", ArgType::Integer, 0, 24, true};
		// An entry of the learn document's mappings; the handler checks it against the list.
		const Arg index{"index", ArgType::Integer, 0, 65535};
		const Arg on{"on", ArgType::Bool, 0, 0, true};
		// A MIDI channel message: status 0x80-0xef, then two data bytes.
		Arg bytes{"b", ArgType::Bytes, 0, 0xef};
		bytes.length = 3;
		// "device" names a device (the request's own "id" is the result's).
		Arg set{"set", ArgType::Text, 0, 0, true, names(g_settings)};
		Arg act{"do", ArgType::Text, 0, 0, true, names(g_actions)};
		const Arg device{"device", ArgType::Text, 0, 0, true};
		const Arg channel{"index", ArgType::Integer, 0, 255, true};	// an output channel of the device
		const Arg value{"value", ArgType::Number, 0, 1e6, true};		// a sample rate or a buffer size
		const Arg dropNumber{"drop", ArgType::Integer, 1, 1e9};	// a drop message's number
		const Arg dropFile{"n", ArgType::Integer, 0, 65535};		// a file's number in that drop
		const auto row = [](const char* _op, std::vector<Arg> _args, const char* _help, const Action _a, const Actor _who = Actor::Session)
		{
			return deskCore::Command<Handler>{_op, Owner::Host, Gate::None, -1, std::move(_args), _help, CoreOp::Edit, 0, {_a, _who}};
		};
		static const Table table({
			row("engine", {{"kind", ArgType::Text}}, "an entry of the engine map (machine.engines)", Action::Engine),
			row("recheckFirmware", {}, "look for the ROM again", Action::RecheckFirmware),
			row("revealRomFolder", {}, "", Action::RevealRomFolder),
			row("chooseRom", {}, "choose the firmware file (.bin, or a .zip with it): the window's native file chooser; the file stays on this computer",
				Action::ChooseRom, Actor::Window),
			row("romInfo", {}, "which firmware is installed (answered with a romInfo message): the LOAD ROM dialog", Action::RomInfo),
			row("removeRom", {}, "delete the firmware from the editor's ROM folder (never outside it); the machine stops and the start-up card asks for a ROM again",
				Action::RemoveRom),
			// "notice" names the notice (its message's id); the request's own "id" is the result's, as for
			// every command (the page's bridge numbers every request, so a notice number sent as "id" never arrived)
			row("noticeAnswer", {{"notice", ArgType::Integer, 1, 1e9}, {"button", ArgType::Integer, 0, 8}},
				"the button pressed on the notice numbered notice (a notice message's id: the plug-in's own question "
				"or warning, shown by the page); "
				"refused when that notice waits for no answer (answered already, or replaced) or has no such button",
				Action::NoticeAnswer, Actor::Window),
			row("chooseSyx", {}, "choose a .syx to import: the window's native file chooser; a preview follows (syxPreview)", Action::ChooseSyx, Actor::Window),
			row("chooseSample", {{"slot", ArgType::Integer, 0, 47}},
				"choose a sample (WAV or AIFF) for UW ROM slot slot: the window's native file chooser; the plug-in reads the file, "
				"converts it and sends it as SDS (sampleLoad messages follow); the file never passes through the page",
				Action::ChooseSample, Actor::Window),
			row("sampleExport", {{"bank", ArgType::Text, 0, 0, false, {"rom", "ram"}}, {"slot", ArgType::Integer, 0, 47, true}, {"all", ArgType::Bool, 0, 0, true}},
				"export UW samples as WAV files (16-bit mono at the slot's own rate, the samples the machine holds): the slot of bank "
				"through the window's save dialog, or with all every slot of the bank that holds one into a folder the window asks for; "
				"a sampleExport message follows",
				Action::SampleExport, Actor::Window),
			row("syxImport", {{"kinds", ArgType::Array}, {"skip", ArgType::Array, 0, 0, true}, {"placeAt", ArgType::Object, 0, 0, true},
					{"checkOnly", ArgType::Bool, 0, 0, true}, {"readBack", ArgType::Bool, 0, 0, true}},
				"import the previewed .syx: the kinds chosen (global, kit, pattern, song, other) but the items in skip (\"kind:slot\", the slot "
				"an item lands in), sent to the machine as they are (the firmware decides what it takes), then read back and reported "
				"(syxProgress); no undo step. placeAt (SPECIFIC, 0.6): per kind the first slot its items land in, in slot order "
				"({\"kit\": 4}; the dumps go with that position byte and checksum); checkOnly (VERIFY ONLY): nothing is sent, each item's "
				"slot is read and compared with the file; readBack (I-038, default true): false ends the import after the messages are sent, "
				"without reading the slots back, and the report says the items were sent, not read back",
				Action::SyxImport),
			row("syxCancel", {}, "stop an import: nothing more is sent, what went is read back and reported", Action::SyxCancel),
			row("syxPlace", {{"placeAt", ArgType::Object}},
				"the open .syx's preview again (syxPreview) with its items placed: per kind the first slot ({\"kit\": 4, \"pattern\": 16}), "
				"a kind not named in its own slots; each item says where it lands (slot), where it came from (from), whether it "
				"overwrites data there; an item past the last slot does not land",
				Action::SyxPlace),
			row("syxExport", {{"kinds", ArgType::Array, 0, 0, true}, {"ranges", ArgType::Object, 0, 0, true}},
				"the documents the editor holds as one .syx, through the window's native save dialog: every one (no kinds), or the kinds "
				"named (global, kit, pattern, song; the Monomachine's DigiPRO waveforms as wave, read from the machine) with their "
				"ranges ({\"kit\": [0, 11]}, from 0, inclusive; a kind without one: all its slots); syxExport messages follow",
				Action::SyxExport, Actor::Window),
			row("syxExportInfo", {}, "the export panel's facts (a syxExportInfo message): per kind its slots, how many the editor holds, "
				"how many hold data and the first and last of those", Action::SyxExportInfo),
			row("machineReset", {{"how", ArgType::Text, 0, 0, false, {"empty", "factory"}}},
				"Reset machine: empty clears every kit, pattern and song (the library's Clear in each slot, sent as dumps; globals "
				"and samples stay), factory (the Machinedrum) brings back the factory kits, patterns and songs read from a second "
				"machine started from the user's own ROM; both read back and reported as an import (syxPreview with reset, then "
				"syxProgress); no undo step: the page asks first",
				Action::MachineReset),
			row("midi", {bytes}, "a channel message from the page: [status 0x80-0xef, data, data]", Action::Midi),
			row("openMenu", {}, "the editor's menu: the window answers with an editorMenu message (its entries as data), the page draws it (I-008)",
				Action::Menu, Actor::Window),
			row("menuPick", {{"menu", ArgType::Integer, 0, 1e9}, {"n", ArgType::Integer, 0, 65535}},
				"the entry n the user chose in the editor's menu numbered menu (the editorMenu message): the window runs it", Action::MenuPick, Actor::Window),
			row("pageZoom", {{"step", ArgType::Integer, -1, 1}},
				"the page's zoom one step smaller (-1), larger (1) or back to 100 % (0); the window remembers it", Action::PageZoom, Actor::Window),
			// Files dropped on the window (macOS; mdDroppedFiles.h): the window keeps them and sends the drop message;
			// the page names a file by drop and n, never by a path. Each file serves once, as the kind it was dropped
			// as, until the next drop or 10 minutes without use.
			row("dropRom", {dropNumber, dropFile},
				"install the ROM (.bin, or a .zip with it) numbered n in the drop message numbered drop: checked and "
				"copied like a chosen one, "
				"then the machine starts again with it (romInstall follows); refused when the window no longer holds "
				"that file",
				Action::DropRom, Actor::Window),
			row("dropSyx", {dropNumber, dropFile},
				"open the .syx numbered n in the drop message numbered drop: its import preview follows (syxPreview), "
				"as for Import SysEx "
				"after its chooser; refused when the window no longer holds that file",
				Action::DropSyx, Actor::Window),
			row("dropSample", {dropNumber, dropFile, {"slot", ArgType::Integer, 0, 47}},
				"load the sample (WAV or AIFF) numbered n in the drop message numbered drop into UW ROM slot slot, as "
				"a chosen one "
				"(sampleLoad messages follow; one sample at a time); refused when the window no longer holds that file",
				Action::DropSample, Actor::Window),
			row("learnStart", {t, pg, i, g}, "MIDI learn a track's parameter, or a global one with g (learn.doc.limits: which)", Action::LearnStart),
			row("learnAdd", {{"cc", ArgType::Integer, 0, 127}, t, pg, i, g, {"ch", ArgType::Integer, 0, 15, true}},
				"a CC mapping without learning, on channel ch (none: all channels)", Action::LearnAdd),
			row("learnCancel", {}, "", Action::LearnCancel),
			row("learnRemove", {index}, "", Action::LearnRemove),
			row("learnInvert", {index}, "", Action::LearnInvert),
			row("audio", {}, "the standalone's audio and MIDI devices", Action::AudioPublish, Actor::Window),
			row("audioSet", {set, act, device, on, channel, value}, "change one audio or MIDI setting (set), or do something (do)",
				Action::AudioSet, Actor::Window),
			row("audioMeter", {on}, "", Action::AudioMeter, Actor::Window),
			row("outputGain", {{"db", ArgType::Number, -60, 6}},
				"the editor's volume in dB (I-021: the LCD's output meter): the plug-in's output gain on every output, after the "
				"emulation (the machine's own volume is untouched); -60 is off; saved with the project and the standalone's state",
				Action::OutputGain),
			row("mixMeters", {{"on", ArgType::Bool}},
				"I-032: the Mix page's output meters: on while the page shows Mix, off when it leaves; the plug-in then sends mixLevels "
				"messages (about 25 a second) and the audio thread measures the outputs, or neither",
				Action::MixMeters),
			// I-024 (doc/modern-ux/DESIGN-machine-memory.md): the machine memory that stays for new sessions
			row("memoryKeep", {{"on", ArgType::Bool}},
				"KEEP MEMORY: on, a session without a project state starts from the machine memory file and every save on the "
				"machine writes it; off, neither (the file stays); kept in the editor's settings; a machineMemory message follows",
				Action::MemoryKeep),
			row("memoryFactory", {},
				"RESET MACHINE… > Start from factory memory: the machine memory file is deleted and the machine restarts from factory memory (the "
				"page asked the user first); a machineMemory message follows",
				Action::MemoryFactory),
		});
		return table;
	}

	elektronData::json::Value contractCommands(const elektronData::json::Value& _modelSchema)
	{
		auto out = _modelSchema;
		auto* one = out.find("oneOf");
		if(!one)
			return out;
		const auto host = commands().schema();
		auto merged = elektronData::json::Value::array();
		for(const auto& c : one->asArray())
			merged.push(c);
		for(const auto& c : host.find("oneOf")->asArray())
			merged.push(c);
		*one = std::move(merged);
		out.put("description", "Generated from the model's command table and the plug-in's (deskHost), P6: every command the page may send.");
		return out;
	}
}
