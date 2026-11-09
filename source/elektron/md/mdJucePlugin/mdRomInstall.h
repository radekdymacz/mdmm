#pragma once

#include "mdLib/mdtypes.h"

#include "juce_core/juce_core.h"

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace mdJucePlugin
{
	// P7: install a user's firmware from a file they chose or dropped, on this computer only (nothing is sent
	// anywhere). A .bin, or a .zip that holds exactly one 8 MiB .bin; checked (md::checkRom) before it is
	// copied into the ROM folder, never over another file. A file already in the ROM folder is used where it is. Several
	// images may sit in the folder; the user picks the one an instance runs (AudioPluginAudioProcessor::useRom).
	struct RomInstall
	{
		bool ok = false;
		std::string text;			// for the page's card: "✓ Machinedrum OS 1.63 found", or why not
		juce::File installed;		// the file in the ROM folder (ok only)
	};

	// The image a file holds: the .bin itself, or the one 8 MiB .bin in a .zip. Empty, with the reason, if none.
	std::optional<std::vector<uint8_t>> readRomImage(const juce::File& _file, std::string& _why);

	RomInstall installRom(const juce::File& _file, md::MachineModel _model, const juce::File& _romFolder);

	// The firmware images of this machine directly inside the ROM folder (any name; judged by their contents). A
	// subfolder is not searched: the engine's own search does not look there either, and REMOVE puts images there.
	std::vector<juce::File> romsInFolder(md::MachineModel _model, const juce::File& _romFolder);

	// The image the user chose by its file name (no path), if it is in the folder and is this machine's. A name
	// with a folder part is never one.
	std::optional<juce::File> findRomByName(md::MachineModel _model, const juce::File& _romFolder, const std::string& _name);

	// REMOVE: the named image leaves the ROM folder for its subfolder "removed" (g_removedFolder). Nothing is ever
	// deleted: the user's file stays on the disk and can be moved back.
	constexpr const char* g_removedFolder = "removed";
	struct RomRemoval
	{
		int removed = 0;
		std::string text;
		juce::File movedTo;
	};
	RomRemoval removeRom(md::MachineModel _model, const juce::File& _romFolder, const std::string& _name);
}
