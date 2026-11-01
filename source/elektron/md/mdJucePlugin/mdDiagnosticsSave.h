#pragma once

#include "juce_core/juce_core.h"

namespace mdJucePlugin
{
	class AudioPluginAudioProcessor;

	// 1.0 review M5: the editor menu's "Save Diagnostics...". Asks where to save (a file chooser, by default
	// <editor>-diagnostics-<date>.zip on the desktop), then writes the zip (mdDiagnosticsZip.h) and shows it. It needs
	// the processor only, not the page, so it works when the page failed to start (the native menu, B-201). Message
	// thread.
	namespace diagnosticsSave
	{
		void run(AudioPluginAudioProcessor& _processor);

		// info.txt: the versions, the system and the web view (what a bug report asks first). Message thread.
		juce::String infoText(AudioPluginAudioProcessor& _processor);
		// audio-midi.txt: the audio and MIDI setup (standalone: the devices; plug-in: what the host gave). Message thread.
		juce::String audioMidiText(AudioPluginAudioProcessor& _processor);
		// The default file name: machinedrum-editor-diagnostics-2026-11-01.zip
		juce::String defaultFileName(bool _monomachine, const juce::Time& _now);
	}
}
