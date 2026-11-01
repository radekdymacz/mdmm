#pragma once

#include "juce_core/juce_core.h"

#include <cstdint>
#include <utility>
#include <vector>

namespace mdJucePlugin::diagnosticsZip
{
	// 1.0 review M5 (Save Diagnostics): the one zip a user sends with a report. Pure over juce_core: what goes in is
	// decided here and by name, from a closed list, never by "everything in the folder":
	//   logs/         the newest editor-*.log and the newest editor-*-previous.log (the page's start-up log, B-022),
	//                 and standalone-startup-last.log
	//   performance/  the newest performance-*.jsonl (the last performance capture), when there is one
	//   settings/     the editor's settings file (a few keys)
	//   info.txt, audio-midi.txt  the text the caller gives (versions, the system, the audio and MIDI setup)
	// Never a ROM or firmware image, the machine's memory (RAM, flash, patch RAM), a project or a sample: those live in
	// other folders, and a file in the logs folder that is not on the list above is not read. mdDiagnosticsZipTest.
	struct Input
	{
		juce::File logsFolder;
		juce::File settingsFile;		// optional (an unset File is skipped)
		juce::String info;				// info.txt
		juce::String audioMidi;			// audio-midi.txt
	};

	// Each file is read only up to this size (a bigger one is left out).
	constexpr int64_t g_maxFileBytes = 16 * 1024 * 1024;

	// A file the zip may take from the logs folder, by its name.
	bool isLogName(const juce::String& _name);
	bool isPerformanceName(const juce::String& _name);

	// The files the zip takes (the name inside the zip, the file), without writing anything.
	std::vector<std::pair<juce::String, juce::File>> selectFiles(const Input& _input);

	// Writes the zip (replacing the file). Fails with a message when the file cannot be written.
	juce::Result write(const Input& _input, const juce::File& _zip);
}
