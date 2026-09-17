#include "mdLcdInteractionModel.h"

#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace
{
	using Row = std::unordered_map<std::string, std::string>;
	const std::string corpusRoot{MD_LCD_TEST_CORPUS_DIR};
	const auto generatedRoot = corpusRoot + "/generated";

	void require(const bool _condition, const std::string& _message)
	{
		if(!_condition)
			throw std::runtime_error(_message);
	}

	std::vector<std::string> split(const std::string& _text,
		const char _separator)
	{
		std::vector<std::string> result;
		std::string field;
		std::istringstream stream(_text);
		while(std::getline(stream, field, _separator))
			result.push_back(field);
		if(!_text.empty() && _text.back() == _separator)
			result.emplace_back();
		return result;
	}

	std::vector<Row> readTsv(const std::string& _path)
	{
		std::ifstream input(_path);
		require(input.good(), "cannot read " + _path);
		std::string line;
		require(static_cast<bool>(std::getline(input, line)),
			"empty TSV " + _path);
		const auto columns = split(line, '\t');
		std::vector<Row> result;
		while(std::getline(input, line))
		{
			const auto fields = split(line, '\t');
			require(fields.size() == columns.size(),
				"malformed TSV row in " + _path);
			Row row;
			for(size_t index = 0; index < columns.size(); ++index)
				row.emplace(columns[index], fields[index]);
			result.push_back(std::move(row));
		}
		return result;
	}

	std::vector<uint8_t> readPgm(const std::string& _path)
	{
		std::ifstream input(_path, std::ios::binary);
		require(input.good(), "cannot read " + _path);
		std::string magic;
		unsigned width = 0;
		unsigned height = 0;
		unsigned maximum = 0;
		input >> magic >> width >> height >> maximum;
		input.get();
		require(magic == "P5" && width == 128 && height == 64 && maximum == 255,
			"unexpected PGM header in " + _path);
		std::vector<uint8_t> pixels(width * height);
		input.read(reinterpret_cast<char*>(pixels.data()),
			static_cast<std::streamsize>(pixels.size()));
		require(input.gcount() == static_cast<std::streamsize>(pixels.size()),
			"truncated PGM " + _path);
		return pixels;
	}

	md::FrontPanel loadPanel(const Row& _row)
	{
		const auto pixels = readPgm(generatedRoot + "/" + _row.at("artifact"));
		md::FrontPanel panel;
		for(unsigned half = 0; half < 2; ++half)
			for(unsigned page = 0; page < 8; ++page)
				for(unsigned base = 0; base < 64; base += 8)
				{
					panel.processByte(static_cast<uint8_t>(0x10 | (half << 3) | page));
					panel.processByte(static_cast<uint8_t>(base));
					for(unsigned column = base; column < base + 8; ++column)
					{
						uint8_t value = 0;
						for(unsigned bit = 0; bit < 8; ++bit)
						{
							const auto x = half * 64 + column;
							const auto y = page * 8 + bit;
							if(pixels[y * 128 + x] == 0)
								value |= static_cast<uint8_t>(1u << bit);
						}
						panel.processByte(value);
					}
				}

		const auto banks = split(_row.at("led_banks_20_2d"), ':');
		require(banks.size() == md::FrontPanel::g_ledBankCount,
			"wrong LED bank count");
		for(size_t index = 0; index < banks.size(); ++index)
		{
			panel.processByte(static_cast<uint8_t>(
				md::FrontPanel::g_firstLedBank + index));
			panel.processByte(static_cast<uint8_t>(
				std::stoul(banks[index], nullptr, 16)));
		}
		return panel;
	}

	md::MachineModel model(const std::string& _name)
	{
		return _name == "mm" ? md::MachineModel::Monomachine
			: md::MachineModel::Machinedrum;
	}

	uint8_t hexByte(const std::string& _text)
	{
		return static_cast<uint8_t>(std::stoul(_text, nullptr, 16));
	}

	void testEveryEngine()
	{
		unsigned count = 0;
		for(const auto* name : {"md", "mm"})
		{
			const auto rows = readTsv(generatedRoot + "/" + name
				+ "-engine-capture-ledger.tsv");
			for(const auto& row : rows)
			{
				const auto state = mdJucePlugin::lcdInteraction::classify(
					loadPanel(row), model(name));
				const auto expected = std::string(name) == "md"
					&& row.at("machine") == "CTR-8P"
					? uint8_t{0} : hexByte(row.at("action_mask"));
				if(expected == 0)
					require(!state, std::string(name) + " " + row.at("machine")
						+ " unexpectedly interactive");
				else
					require(state && state->surface
						== mdJucePlugin::lcdInteraction::SurfaceKind::EditGrid
						&& state->activeEncoderMask == expected,
						std::string(name) + " " + row.at("machine")
							+ " classifier mismatch");
				++count;
			}
		}
		require(count == 156, "expected the complete 156-engine corpus");
	}

	void testDirectPagesAndHeldOverlays()
	{
		using mdJucePlugin::lcdInteraction::SurfaceKind;
		const std::unordered_map<std::string, SurfaceKind> direct{
			{"lfo-edit", SurfaceKind::Lfo},
			{"master-fx-echo", SurfaceKind::MasterFxEcho},
			{"master-fx-reverb", SurfaceKind::MasterFxReverb},
			{"master-fx-eq", SurfaceKind::MasterFxEq},
			{"master-fx-dynamics", SurfaceKind::MasterFxDynamics},
		};
		unsigned directCount = 0;
		for(const auto* name : {"md", "mm"})
		{
			bool heldFound = false;
			for(const auto& row : readTsv(generatedRoot + "/" + name
				+ "-capture-ledger.tsv"))
			{
				const auto panel = loadPanel(row);
				if(std::string(name) == "md")
					if(const auto found = direct.find(row.at("id"));
						found != direct.end())
					{
						const auto state = mdJucePlugin::lcdInteraction::classify(
							panel, md::MachineModel::Machinedrum);
						require(state && state->surface == found->second
							&& state->activeEncoderMask == 0xff,
							row.at("id") + " was not recognized exactly");
						++directCount;
					}
				if(row.at("id") == "parameter-value")
				{
					require(mdJucePlugin::lcdInteraction::classify(
						panel, model(name)).has_value(),
						std::string(name) + " held overlay lost its base surface");
					require(!mdJucePlugin::lcdInteraction::classify(
						panel, model(name), true),
						std::string(name) + " held overlay was not suppressed");
					heldFound = true;
				}
			}
			require(heldFound, std::string(name) + " held overlay capture missing");
		}
		require(directCount == direct.size(), "missing direct rotary page capture");
	}

	void testMonomachineEditPages()
	{
		const std::unordered_map<std::string, uint8_t> expected{
			{"working-synthesis", 0xf7}, {"working-amplification", 0xff},
			{"working-filter", 0xff}, {"working-effects", 0xff},
			{"working-lfo1", 0xff}, {"working-lfo2", 0xff},
			{"working-lfo3", 0xff}, {"midi-sequencer", 0xff},
			{"poly", 0xf7}, {"multi-envelope", 0x0f},
		};
		unsigned found = 0;
		for(const auto& row : readTsv(generatedRoot + "/mm-capture-ledger.tsv"))
		{
			const auto match = expected.find(row.at("id"));
			if(match == expected.end())
				continue;
			const auto state = mdJucePlugin::lcdInteraction::classify(
				loadPanel(row), md::MachineModel::Monomachine);
			require(state && state->layout == mdJucePlugin::lcdInteraction::LayoutKind::Standard
				&& state->activeEncoderMask == match->second,
				"MM EDIT page was not interactive: " + row.at("id"));
			++found;
		}
		require(found == expected.size(), "missing MM EDIT page capture");
	}

	void testMachinedrumEditPages()
	{
		const std::unordered_map<std::string, uint8_t> expected{
			{"working-synthesis", 0xff}, {"working-effects", 0xff},
			{"working-routing", 0xff},
		};
		unsigned found = 0;
		for(const auto& row : readTsv(generatedRoot + "/md-capture-ledger.tsv"))
		{
			const auto match = expected.find(row.at("id"));
			if(match == expected.end())
				continue;
			const auto state = mdJucePlugin::lcdInteraction::classify(
				loadPanel(row), md::MachineModel::Machinedrum);
			require(state && state->layout == mdJucePlugin::lcdInteraction::LayoutKind::Standard
				&& state->activeEncoderMask == match->second,
				"MD EDIT page was not interactive: " + row.at("id"));
			++found;
		}
		require(found == expected.size(), "missing MD EDIT page capture");
	}

	void testKnownNegativeRoutes()
	{
		const std::unordered_map<std::string, std::vector<std::string>> negatives{
			{"md", {"kit-root", "kit-load-list", "kit-save-list", "kit-name-editor",
				"kit-name-palette", "kit-edit-track", "song-root", "song-mode",
				"song-load-list", "song-save-list", "song-name-editor",
				"song-name-palette", "tempo",
				"tap-tempo", "tap-tempo-measured", "operation-copy",
				"pattern-bank-sticky", "scale-setup", "mute", "mute-minimized",
				"accent", "swing", "slide", "global-root", "global-slots",
				"global-mechanical", "global-turbo", "global-local-control",
				"global-program-change", "global-map-editor", "global-base-channel",
				"global-routing-output", "global-trig-in-a", "global-trig-in-b",
				"global-sysex-send", "global-sysex-receive", "global-sample-manager",
				"global-sync-tempo-in", "global-sync-control-in",
				"global-sync-tempo-out", "global-sync-control-out",
				"song-pattern-row", "song-mute-mask", "grid-record",
				"parameter-lock"}},
			{"mm", {"tempo", "tap-tempo",
				"tap-tempo-measured", "kit-root", "kit-load-list", "kit-save-list",
				"kit-name-editor", "kit-name-palette", "operation-copy", "mute",
				"mute-minimized", "grid-record", "trig-keyboard",
				"trig-chord-list", "parameter-lock", "step-record",
				"global-master-tune", "global-midi-channels", "global-turbo",
				"song-track-transpose", "song-edit-scroll-row"}},
		};

		for(const auto& [name, ids] : negatives)
		{
			std::unordered_map<std::string, Row> rows;
			for(const auto& row : readTsv(generatedRoot + "/" + name
				+ "-capture-ledger.tsv"))
				rows.emplace(row.at("id"), row);
			for(const auto& id : ids)
			{
				const auto found = rows.find(id);
				require(found != rows.end(), name + " negative route missing: " + id);
				require(!mdJucePlugin::lcdInteraction::classify(
					loadPanel(found->second), model(name)),
					name + " negative route was interactive: " + id);
			}
		}
	}
}

int main()
{
	try
	{
		testEveryEngine();
		testDirectPagesAndHeldOverlays();
		testMachinedrumEditPages();
		testMonomachineEditPages();
		testKnownNegativeRoutes();
		std::cout << "PASS: private corpus replayed 156 engines, direct pages, overlays, and negative routes\n";
		return 0;
	}
	catch(const std::exception& error)
	{
		std::cerr << "FAIL: " << error.what() << '\n';
		return 1;
	}
}
