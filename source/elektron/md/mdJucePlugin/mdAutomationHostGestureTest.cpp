// What a DAW sees of the editor's values (a user report: an Ableton Rack macro or Push 2 could not be mapped from
// the Control page). Ableton's Configure, a Rack macro's Map and every "touch the control in the plug-in" learn
// take a value only if it is a host parameter and the plug-in announces the move from its UI as a gesture:
// beginChangeGesture, the value, endChangeGesture, on the message thread. No ROM: the processor's stand-in is enough.
//
//   mdAutomationHostGestureTest <md|mm>
//
// 1. The parameter list: the count (MD 16 tracks x 26, MM 6 x 58), every parameter automatable, none a meta
//    parameter, ids and names unique (the AU and VST3 ids are the string ids, so they stay stable).
// 2. A page edit of a kit value: the call the desk session makes for it (StudioLink::setKitParam / setMute,
//    MmStudioLink::setParam, Origin::Ui) reaches the host listener as begin, value, end of that parameter, in that
//    order, on the message thread. A Control page knob row moves its targets through the same call.
// 3. Prints what is not a host parameter (the eight knob rows of the Control page, the values that belong to no
//    track): a DAW cannot map those, by design so far.
#include "mdController.h"
#include "mdPluginProcessor.h"
#include "mdStudioLink.h"
#include "mmStudioLink.h"

#include "jucePluginLib/parameter.h"

#include "juce_audio_utils/juce_audio_utils.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <set>
#include <string>
#include <vector>

namespace
{
	int g_failures = 0;

	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s: %s\n", _ok ? "ok" : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}

	struct Event
	{
		char kind;		// 'b' begin, 'v' value, 'e' end
		int index;
		bool messageThread;
	};

	struct HostListener final : juce::AudioProcessorListener
	{
		std::vector<Event> events;

		void add(const char _kind, const int _index)
		{
			events.push_back({_kind, _index, juce::MessageManager::existsAndIsCurrentThread()});
		}
		void audioProcessorParameterChanged(juce::AudioProcessor*, const int _index, float) override { add('v', _index); }
		void audioProcessorChanged(juce::AudioProcessor*, const ChangeDetails&) override {}
		void audioProcessorParameterChangeGestureBegin(juce::AudioProcessor*, const int _index) override { add('b', _index); }
		void audioProcessorParameterChangeGestureEnd(juce::AudioProcessor*, const int _index) override { add('e', _index); }

		// The events of one parameter, as "bve".
		std::string of(const int _index, bool& _allOnMessageThread) const
		{
			std::string s;
			_allOnMessageThread = true;
			for(const auto& e : events)
			{
				if(e.index != _index)
					continue;
				s += e.kind;
				_allOnMessageThread = _allOnMessageThread && e.messageThread;
			}
			return s;
		}
	};

	// One edit through _send, judged on the parameter _p.
	template<typename Send>
	void expectGesture(HostListener& _host, pluginLib::Parameter* _p, const std::string& _what, Send _send)
	{
		check(_p != nullptr, _what + ": the parameter exists");
		if(!_p)
			return;
		_host.events.clear();
		const bool sent = _send();
		check(sent, _what + ": the link took the edit");
		bool onMessage = false;
		const auto seq = _host.of(_p->getParameterIndex(), onMessage);
		check(seq == "bve", _what + " (" + _p->getName(64).toStdString() + "): begin, value, end; got \"" + seq + "\"");
		check(onMessage, _what + ": every notification on the message thread");
		check(_p->isAutomatable(), _what + ": automatable");
	}
}

int main(const int _argc, char** const _argv)
{
	const bool mm = _argc > 1 && std::strcmp(_argv[1], "mm") == 0;
	const auto model = mm ? md::MachineModel::Monomachine : md::MachineModel::Machinedrum;

	// An empty data root: no ROM anywhere, the processor runs its stand-in.
	const auto root = juce::File::getSpecialLocation(juce::File::tempDirectory)
		.getChildFile(juce::String("mdHostGesture-") + juce::Uuid().toDashedString());
	root.createDirectory();
	setenv("GEARMULATOR_DATA_ROOT", root.getFullPathName().toRawUTF8(), 1);

	{
		juce::ScopedJuceInitialiser_GUI juce;
		mdJucePlugin::AudioPluginAudioProcessor::EphemeralConfig config;
		const auto home = root.getChildFile("home");
		home.createDirectory();
		config.deviceHomePath = home.getFullPathName().toStdString() + "/";
		auto processor = std::make_unique<mdJucePlugin::AudioPluginAudioProcessor>(model, config);
		juce::AudioProcessor& ap = *processor;
		ap.prepareToPlay(48000.0, 128);
		auto& controller = dynamic_cast<mdJucePlugin::Controller&>(processor->getController());

		std::printf("%s: the host parameter list\n", mm ? "mm" : "md");
		const auto& params = ap.getParameters();
		const size_t expected = mm ? 6u * 58u : 16u * 26u;
		check(params.size() == expected, "parameter count " + std::to_string(params.size()) + " (expected " + std::to_string(expected) + ")");
		std::set<juce::String> ids, names;
		size_t automatable = 0, meta = 0;
		for(auto* p : params)
		{
			if(const auto* h = dynamic_cast<juce::HostedAudioProcessorParameter*>(p))
				ids.insert(h->getParameterID());
			names.insert(p->getName(1024));
			automatable += p->isAutomatable() ? 1u : 0u;
			meta += p->isMetaParameter() ? 1u : 0u;
		}
		check(ids.size() == params.size(), "every parameter has its own string id (" + std::to_string(ids.size()) + ")");
		check(names.size() == params.size(), "every parameter has its own name (" + std::to_string(names.size()) + ")");
		check(automatable == params.size(), "every parameter is automatable (" + std::to_string(automatable) + ")");
		check(meta == 0, "no meta parameter (" + std::to_string(meta) + ")");
		if(!params.empty())
			std::printf("  first: \"%s\", last: \"%s\" (Ableton lists none of them until Configure: more than 128)\n",
				params.front()->getName(64).toRawUTF8(), params.back()->getName(64).toRawUTF8());

		HostListener host;
		ap.addListener(&host);

		std::printf("%s: a page edit reaches the host as a gesture\n", mm ? "mm" : "md");
		if(mm)
		{
			mdJucePlugin::MmStudioLink link(*processor, controller);
			// T1 AMP DEC (page 1, index 2) and T6 LEVEL (page 7)
			expectGesture(host, controller.getParameter(mdJucePlugin::MmStudioLink::parameterName(1, 2), 0), "T1 AMP DEC",
				[&] { return link.setParam(0, 1, 2, 99); });
			expectGesture(host, controller.getParameter(mdJucePlugin::MmStudioLink::parameterName(7, 0), 5), "T6 LEVEL",
				[&] { return link.setParam(5, 7, 0, 77); });
		}
		else
		{
			mdJucePlugin::StudioLink link(*processor, controller);
			// T1 machine value 3 (DEC on most machines), T16 LEVEL, T2 mute
			expectGesture(host, controller.getParameter(mdJucePlugin::StudioLink::parameterName(2), 0), "T1 value 3",
				[&] { return link.setKitParam(0, 2, 99); });
			expectGesture(host, controller.getParameter(mdJucePlugin::StudioLink::parameterName(24), 15), "T16 LEVEL",
				[&] { return link.setKitParam(15, 24, 77); });
			expectGesture(host, controller.getParameter(mdJucePlugin::StudioLink::parameterName(25), 1), "T2 mute",
				[&] { return link.setMute(1, true); });
		}

		std::printf("%s: not host parameters (a DAW cannot map them): the Control page's eight knob rows (MIDI CC routes)"
			" and the values that belong to no track (the FX column)\n", mm ? "mm" : "md");

		ap.removeListener(&host);
		ap.releaseResources();
		processor.reset();
	}
	root.deleteRecursively();

	std::printf("%s\n", g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
