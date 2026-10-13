// P4: the Machinedrum Editor's setup (md-desk/setup: app modulators, knob-row CCs)
// travels with the plug-in state as the "MDSK" chunk, and a project without it
// starts from the default setup. No firmware needed; isolated config.

#include "mdPluginProcessor.h"
#include "mdDeskHost.h"
#include "mdPageEditor.h"
#include "mdDeskSession.h"

#include "jucePluginEditorLib/pluginEditorState.h"

#include "juce_audio_processors/juce_audio_processors.h"

#include <cstdio>
#include <memory>
#include <string>

namespace
{
	int g_failures = 0;

	void check(const bool _ok, const char* _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what);
		if(!_ok)
			++g_failures;
	}

	mdJucePlugin::AudioPluginAudioProcessor::EphemeralConfig isolated()
	{
		mdJucePlugin::AudioPluginAudioProcessor::EphemeralConfig c;
		c.deviceHomePath = std::string{};
		return c;
	}
}

namespace
{
	using Value = elektronData::json::Value;

	// B-123: the page's solo (and the mutes the person had before it) are saved with the project and come back, in
	// either editor: the page says soloSet, the setup in the plug-in state holds it, a new instance restores it and
	// tells its page ({"type":"solo"}); a project saved without a solo starts without one.
	void soloState(const md::MachineModel _model, const char* _name)
	{
		std::printf("%s: solo saved with the project\n", _name);
		const auto say = [](mdJucePlugin::DeskSession& _s, const char* _json) { _s.onPageMessage(*elektronData::json::parse(_json)); };
		const auto solo = [](const std::vector<Value>& _page) -> const Value*
		{
			for(auto it = _page.rbegin(); it != _page.rend(); ++it)
				if(const auto* t = it->find("type"); t && t->isString() && t->asString() == "solo")
					return &*it;
			return nullptr;
		};
		const auto list = [](const Value* _m, const char* _key)
		{
			std::vector<int> out;
			if(_m)
				for(const auto& v : _m->find(_key)->asArray())
					out.push_back(static_cast<int>(v.asNumber()));
			return out;
		};
		juce::MemoryBlock withSolo, without;
		std::string setupText;
		{
			mdJucePlugin::AudioPluginAudioProcessor a(_model, isolated());
			juce::AudioProcessor& ja = a;
			auto* session = a.getDeskHost()->session();
			check(session != nullptr, "the session exists without a ROM");
			if(!session)
				return;
			std::vector<Value> page;
			session->attach([&page](const Value& _m) { page.push_back(_m); });
			say(*session, R"({"op":"ready"})");
			say(*session, R"({"op":"soloSet","id":1,"tracks":[4,1],"mutes":[0,7]})");
			setupText = a.getDeskHost()->setup();
			check(setupText.find("\"solo\"") != std::string::npos, "soloSet: the solo is in the setup the project keeps");
			ja.getStateInformation(withSolo);
			say(*session, R"({"op":"soloSet","id":2,"tracks":[],"mutes":[]})");
			check(a.getDeskHost()->setup().find("\"solo\"") == std::string::npos, "no solo: the setup keeps none");
			// (without a ROM an untouched instance saves nothing: the project without the solo is the one just saved, given back, saved again)
			ja.getStateInformation(without);
			session->detach();
		}
		check(!withSolo.isEmpty() && !without.isEmpty() && withSolo != without, "both projects are saved, one with the solo");
		mdJucePlugin::AudioPluginAudioProcessor b(_model, isolated());
		juce::AudioProcessor& jb = b;
		jb.setStateInformation(withSolo.getData(), static_cast<int>(withSolo.getSize()));
		check(b.getDeskHost()->setup() == setupText, "the setup, solo included, comes back with the project, byte for byte");
		auto* session = b.getDeskHost()->session();
		std::vector<Value> page;
		session->attach([&page](const Value& _m) { page.push_back(_m); });
		say(*session, R"({"op":"ready"})");
		session->step();
		say(*session, R"({"op":"ready"})");
		check(list(solo(page), "tracks") == std::vector<int>{1, 4} && list(solo(page), "mutes") == std::vector<int>{0, 7},
			"the restored project says its solo and mutes to the page");
		page.clear();
		jb.setStateInformation(without.getData(), static_cast<int>(without.getSize()));
		session->step();
		say(*session, R"({"op":"ready"})");
		check(solo(page) && list(solo(page), "tracks").empty() && list(solo(page), "mutes").empty(), "a project saved without a solo starts without one");
		session->detach();
	}
}

int main()
{
	juce::ScopedJuceInitialiser_GUI juce;
	soloState(md::MachineModel::Machinedrum, "Machinedrum");
	soloState(md::MachineModel::Monomachine, "Monomachine");
	const std::string setup = R"({"schema":"md-desk/setup","version":1,"modulators":{"schema":"md-desk/modulators","version":1,)"
		R"("sources":[{"id":"lfo1","label":"LFO A","kind":"lfo","shape":2,"rate":"1/4","depth":80,"smooth":30}],)"
		R"("links":[{"source":"lfo1","track":3,"param":12,"min":5,"max":90,"curve":"exp","invert":true}]},"knobCcs":[30,31,32,33,34,35,36,37]})";
	juce::MemoryBlock withSetup, without;
	{
		mdJucePlugin::AudioPluginAudioProcessor a(md::MachineModel::Machinedrum, isolated());
		juce::AudioProcessor& ja = a;
		a.getDeskHost()->setSetup(setup);
		ja.getStateInformation(withSetup);
		// Without a ROM an untouched instance saves nothing (mdDeskHost.h, DeskHost::holdState): the project
		// without the setup is the one just saved, given back and saved again with the setup cleared.
		ja.setStateInformation(withSetup.getData(), static_cast<int>(withSetup.getSize()));
		a.getDeskHost()->setSetup({});
		ja.getStateInformation(without);
	}
	check(!withSetup.isEmpty() && !without.isEmpty() && withSetup != without, "both projects are saved, one with the setup");
	mdJucePlugin::AudioPluginAudioProcessor b(md::MachineModel::Machinedrum, isolated());
	juce::AudioProcessor& jb = b;
	const auto g0 = b.getDeskHost()->setupVersion();
	jb.setStateInformation(withSetup.getData(), static_cast<int>(withSetup.getSize()));
	check(b.getDeskHost()->setup() == setup, "the setup comes back with the project, byte for byte");
	check(b.getDeskHost()->setupVersion() != g0, "the session sees a new version");
	const auto g1 = b.getDeskHost()->setupVersion();
	jb.setStateInformation(without.getData(), static_cast<int>(without.getSize()));
	check(b.getDeskHost()->setup().empty(), "a project without it starts from the default setup");
	check(b.getDeskHost()->setupVersion() != g1, "and says so");
	// P4 HW MIDI: the plug-in's MIDI in/out carry the editor's traffic to external hardware.
	{
		jb.prepareToPlay(44100.0, 256);
		b.getExternalMidi().set(true);
		synthLib::SMidiEvent out(synthLib::MidiEventSource::Editor);
		out.sysex = {0xf0, 0x00, 0x20, 0x3c, 0x02, 0x00, 0x70, 0x04, 0xf7};
		b.getExternalMidi().send(out);
		juce::AudioBuffer<float> audio(jb.getTotalNumOutputChannels(), 256);
		juce::MidiBuffer midi;
		const uint8_t reply[] = {0xf0, 0x00, 0x20, 0x3c, 0x02, 0x00, 0x72, 0x04, 0x05, 0xf7};
		midi.addEvent(juce::MidiMessage::createSysExMessage(reply + 1, sizeof(reply) - 2), 0);
		jb.processBlock(audio, midi);
		bool sent = false;
		for(const auto m : midi)
			sent |= m.numBytes == 9 && m.data[6] == 0x70;
		check(sent, "external MIDI: the editor's SysEx leaves through the plug-in's MIDI out");
		std::vector<synthLib::SMidiEvent> in;
		b.getExternalMidi().drainIn(in);
		check(in.size() == 1 && in[0].sysex.size() == sizeof(reply) && in[0].sysex[6] == 0x72, "and the hardware's SysEx comes to the editor, not the device");
		b.getExternalMidi().set(false);
		jb.releaseResources();
	}
#if JUCE_MAC
	// Teardown with the editor page made (v0.2.0 crashed on quit): the page detaches from the session
	// when it goes, so the processor destroys its editor state before the session. The page outlives
	// its window (the processor's editor state owns it): made through the editor window and the
	// window closed first, as a plug-in host and the standalone do on quit, and made without a
	// window. Freed memory is scribbled (MallocScribble in ctest), so a detach from a freed session
	// crashes here rather than passing by luck. macOS only: it opens a real editor (a web view).
	for(const bool withWindow : {true, false})
	{
		auto c = std::make_unique<mdJucePlugin::AudioPluginAudioProcessor>(md::MachineModel::Machinedrum, isolated());
		std::unique_ptr<juce::AudioProcessorEditor> window;
		if(withWindow)
			window.reset(static_cast<juce::AudioProcessor&>(*c).createEditorIfNeeded());
		const auto& state = c->getOrCreateEditorState();
		check(dynamic_cast<mdJucePlugin::PageEditor*>(state.getEditor()) && c->getDeskHost()->session() && (window || !withWindow),
			withWindow ? "teardown: the editor page is made through its window" : "teardown: the editor page is made without a window");
		window.reset();
		c.reset();
		check(true, "teardown: the processor goes after its editor page, no use of a freed session");
	}
#endif
	std::printf("mdDeskSetupStateTest: %s\n", g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
