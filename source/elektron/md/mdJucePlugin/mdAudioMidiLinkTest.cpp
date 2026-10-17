// 0.8 (I-053): the hot-plug callback of the AUDIO / MIDI link republishes the document and logs each plug and unplug.
// JUCE cannot plug a device in a test, so the link's lists of ports are replaced by a fake. A plug-in (no standalone
// holder) has nothing to reconcile: the document says standalone false.

#include "mdAudioMidiLink.h"

#include "juce_audio_processors/juce_audio_processors.h"
#include "juce_events/juce_events.h"

#include <cstdio>
#include <string>
#include <vector>

namespace
{
	int g_failed = 0;
	void check(const bool _ok, const char* _what)
	{
		std::printf("%s %s\n", _ok ? "ok  " : "FAIL", _what);
		if(!_ok)
			++g_failed;
	}

	class Dummy final : public juce::AudioProcessor
	{
	public:
		Dummy() : AudioProcessor(BusesProperties().withOutput("Out", juce::AudioChannelSet::stereo())) {}
		const juce::String getName() const override { return "Dummy"; }
		void prepareToPlay(double, int) override {}
		void releaseResources() override {}
		void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override {}
		double getTailLengthSeconds() const override { return 0; }
		bool acceptsMidi() const override { return true; }
		bool producesMidi() const override { return false; }
		juce::AudioProcessorEditor* createEditor() override { return nullptr; }
		bool hasEditor() const override { return false; }
		int getNumPrograms() override { return 1; }
		int getCurrentProgram() override { return 0; }
		void setCurrentProgram(int) override {}
		const juce::String getProgramName(int) override { return {}; }
		void changeProgramName(int, const juce::String&) override {}
		void getStateInformation(juce::MemoryBlock&) override {}
		void setStateInformation(const void*, int) override {}
	};

	bool has(const std::vector<std::string>& _lines, const std::string& _part)
	{
		for(const auto& l : _lines)
			if(l.find(_part) != std::string::npos)
				return true;
		return false;
	}
}

int main()
{
	using namespace mdJucePlugin;
	using Ports = std::vector<midiHotplug::Port>;

	juce::ScopedJuceInitialiser_GUI juce;
	Dummy processor;
	int published = 0;
	std::string lastType, lastStandalone;
	std::vector<std::string> log;
	AudioMidiLink link(processor,
		[&](elektronData::json::Value _m)
		{
			++published;
			if(const auto* t = _m.find("type"); t && t->isString())
				lastType = t->asString();
			if(const auto* d = _m.find("doc"))
				if(const auto* s = d->find("standalone"); s && s->isBool())
					lastStandalone = s->asBool() ? "true" : "false";
		},
		[&](const std::string& _l) { log.push_back(_l); });

	Ports inputs{{"kbd", "USB Keyboard"}};
	Ports outputs{{"tm1", "Elektron TM-1"}};
	link.setPortLists([&] { return inputs; }, [&] { return outputs; });
	check(!link.standalone(), "a plug-in has no standalone holder");

	published = 0;
	link.midiDevicesChanged();
	check(published == 1 && lastType == "audio", "a device change republishes the document once");
	check(lastStandalone == "false", "the document of a plug-in says standalone false");
	check(log.empty() || !has(log, "plugged"), "no plug or unplug line when the list did not change");

	inputs.clear();
	link.midiDevicesChanged();
	check(published == 2 && lastType == "audio", "an unplug republishes the document");
	check(has(log, "input unplugged: USB Keyboard"), "an unplug is in the log with the port's name");

	inputs.push_back({"kbd2", "USB Keyboard"});
	outputs.clear();
	link.midiDevicesChanged();
	check(published == 3, "a plug republishes the document");
	check(has(log, "input plugged in: USB Keyboard"), "a plug is in the log");
	check(has(log, "output unplugged: Elektron TM-1"), "an output unplug is in the log");

	std::printf("mdAudioMidiLinkTest: %s (%d failure(s))\n", g_failed ? "FAIL" : "PASS", g_failed);
	return g_failed ? 1 : 0;
}
