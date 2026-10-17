#pragma once

#include "mdMidiLoop.h"
#include "mdMidiHotplug.h"

#include "deskHost/deskHost.h"

#include "elektronData/json.h"

#include "juce_audio_devices/juce_audio_devices.h"

#include <functional>
#include <string>
#include <vector>

namespace juce
{
	class AudioProcessor;
	class StandalonePluginHolder;
}

namespace mdJucePlugin
{
	// AUDIO / MIDI (P6), shared by the Machinedrum and Monomachine Editors: the standalone's
	// devices as one document for the page, and the page's commands applied to JUCE's
	// AudioDeviceManager, which stays the engine behind it. The page only renders the
	// document (schema "gm-audio/devices", version 1; doc/modern-ux/data-contract.md, Audio/MIDI).
	// In a plug-in the host owns audio and MIDI: the document says standalone false and the
	// page offers no panel.
	//
	// Page -> plug-in:  {"op":"audio"}                            publish the document
	//                   {"op":"audioSet", "set":..., "device"|"value"|"on"|"index"}   change one thing
	//                   {"op":"audioSet", "do":"test"|"bluetooth"}
	//                   (the names are deskHost::AudioSetting / AudioAction, the row's oneOf)
	//                   {"op":"audioMeter", "on":bool}            the input level while the panel is open
	// Plug-in -> page:  {"type":"audio", "doc":{...}}, {"type":"audioLevel", "in":0..1},
	//                   {"type":"result", "op":"audioSet", ...}   its errors are the only report of a failure
	//                   (B-037: also a MIDI port the system did not open, mdMidiPortRefusal.h)
	// The document also says (0.8, WP4): setupError (the device setup's error, B-155), inputPermission (the microphone:
	// granted, denied, notAsked, unknown), inputNote (why the input is on NONE) and midiLoop (an input that is also the
	// output, B-154), each "" when there is nothing to say.
	// MIDI hot-plug (0.8, I-053; mdMidiHotplug.h): JUCE's MidiDeviceListConnection calls on the message thread when a MIDI
	// device is plugged in or out. The link then publishes the document again, switches back on the inputs the user had
	// on (matched by identifier, then by name) and the chosen output when they return, and logs each plug and unplug.
	// The remembered ports (identifier and name) are also written into the saved audio device state.
	// The start-up log (B-036, B-037): the standalone's devices as one line when the link starts and whenever they
	// change (summary), and each MIDI port that did not open.
	class AudioMidiLink final : juce::ChangeListener
	{
	public:
		using ToPage = std::function<void(elektronData::json::Value)>;
		using Log = std::function<void(const std::string&)>;

		AudioMidiLink(juce::AudioProcessor& _processor, ToPage _toPage, Log _log = {});
		~AudioMidiLink() override;

		AudioMidiLink(const AudioMidiLink&) = delete;
		AudioMidiLink& operator=(const AudioMidiLink&) = delete;

		// True when the message was one of the ops above (handled, replied).
		bool handle(deskHost::Action _action, const elektronData::json::Value& _message);
		// The editor's timer: the input level, a few times a second, while the page asks.
		void tick();
		void publish();
		// The system's MIDI devices changed (the hot-plug callback; public so a test can call it): reconcile, publish, log.
		void midiDevicesChanged();
		// The saved audio device state with the remembered MIDI ports: the inputs the user has on (also those whose device
		// is away) and the output, nothing else (public so a test can check the round trip).
		// At quit: the standalone holder saves JUCE's own state last, after the link is gone. The link keeps its memory when it
		// goes; the app calls this with its settings after the window closed, and the saved state is the user's again.
		// False when there was no standalone link or no saved state.
		static bool patchSavedSettings(juce::PropertySet& _settings);
		static bool patchSettings(juce::PropertySet& _settings, const midiHotplug::Memory& _memory);
		static void patchStateXml(juce::XmlElement& _xml, const std::vector<midiHotplug::Port>& _inputs, const midiHotplug::Port& _output);
		// What the system offers (the hot-plug test replaces it with a fake list).
		using PortList = std::function<std::vector<midiHotplug::Port>()>;
		void setPortLists(PortList _inputs, PortList _outputs);

		bool standalone() const { return holder() != nullptr; }
		// The standalone's audio and MIDI devices in one line: the driver, the device, its rate and buffer, running or
		// not, the MIDI inputs (on or off) and the output. Empty in a plug-in (the host owns them).
		std::string summary() const;
		// 0.8 (WP4): the MIDI loop warning (B-154: an input that is also the output; "" = none), the text for an input that
		// stays on NONE (B-155; "" = none) and the microphone permission the system holds.
		std::string midiLoopWarning() const;
		std::string inputNote() const;

	private:
		void changeListenerCallback(juce::ChangeBroadcaster*) override;
		juce::StandalonePluginHolder* holder() const;
		elektronData::json::Value document() const;
		// "" when applied, otherwise why not (the command's arguments were checked by deskHost's table).
		std::string apply(const elektronData::json::Value& _command);
		// The summary into the start-up log when it changed.
		void logDevices();
		// Switch the remembered inputs and the output back on, the vanished ones off (standalone only).
		void reconcileMidi();
		// The plugs and unplugs since the last look, into the log.
		void logPlugs();
		// The device state into the settings, with the remembered MIDI ports that are not plugged in.
		void saveState();
		void rememberFromState();
		void syncFromManager();

		juce::AudioProcessor& m_processor;
		ToPage m_toPage;
		Log m_log;
		std::string m_logged;	// the summary last logged
		std::string m_loopLogged;	// the loop warning last logged
		std::string m_setupError;	// what the last audio device setup returned ("" = it applied)
		juce::AudioDeviceManager* m_listening = nullptr;
		juce::MidiDeviceListConnection m_midiConnection;
		PortList m_listInputs, m_listOutputs;
		midiHotplug::Memory m_memory;	// the inputs the user had on (identifier and name) and the chosen output
		std::vector<midiHotplug::Port> m_seenInputs, m_seenOutputs;	// what the last look at the system listed
		juce::AudioDeviceManager::LevelMeter::Ptr m_inputLevel;
		bool m_meter = false;
		int m_meterTicks = 0;
	};
}
