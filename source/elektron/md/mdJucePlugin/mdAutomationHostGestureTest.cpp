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
// 3. B-205 (0.9.1, doc/release/0.9.1/control-matrix-host-params.md): the Control page's eight knob rows are the host
//    parameters Knob 1-8, after the tracks' (whose ids and order do not change). A host change of Knob 1 drives the knob
//    row as CC 21 on the host's MIDI in does, and tells the host nothing back about the knob; a CC 21 and the page's
//    knobTurn reach the host as begin, value, end of the knob, on the message thread.
// 4. Prints what is not a host parameter (the values that belong to no track): a DAW cannot map those.
#include "mdControlKnobs.h"
#include "mdController.h"
#include "mdMidiLearnCommands.h"
#include "mdPluginProcessor.h"
#include "mdStudioLink.h"
#include "mmStudioLink.h"

#include "deskCore/deskLearn.h"

#include "jucePluginLib/parameter.h"

#include "synthLib/midiTypes.h"

#include "juce_audio_utils/juce_audio_utils.h"

#include <array>
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
		const auto count = static_cast<size_t>(params.size());
		const size_t perTrack = mm ? 58u : 26u;
		const size_t tracks = mm ? 6u : 16u;
		const size_t trackParams = tracks * perTrack;
		const size_t expected = trackParams + mdJucePlugin::ControlKnobs::Count;
		check(count == expected, "parameter count " + std::to_string(count) + " (expected " + std::to_string(expected)
			+ ": the tracks' " + std::to_string(trackParams) + ", then Knob 1-8)");
		// the tracks' parameters first, track by track, each with its id page_track_index as before (B-205 adds none of them)
		size_t oldIdsKept = 0;
		for(size_t i = 0; i < trackParams && i < count; ++i)
		{
			const auto* p = dynamic_cast<pluginLib::Parameter*>(params[static_cast<int>(i)]);
			if(!p)
				continue;
			const auto& d = p->getDescription();
			const auto id = juce::String::formatted("%d_%d_%d", static_cast<int>(d.page), static_cast<int>(p->getPart()), static_cast<int>(d.index));
			if(p->getPart() == i / perTrack && p->getParameterID() == id)
				++oldIdsKept;
		}
		check(oldIdsKept == trackParams, "the tracks' parameters keep their place and their ids page_track_index ("
			+ std::to_string(oldIdsKept) + " of " + std::to_string(trackParams) + ")");
		size_t knobsFound = 0;
		for(size_t k = 0; k < mdJucePlugin::ControlKnobs::Count && trackParams + k < count; ++k)
		{
			auto* p = params[static_cast<int>(trackParams + k)];
			const auto* knob = dynamic_cast<mdJucePlugin::ControlKnob*>(p);
			const auto name = "Knob " + std::to_string(k + 1);
			if(knob && knob == processor->controlKnobs().knob(k) && knob->getParameterID() == mdJucePlugin::ControlKnobs::parameterId(k)
				&& knob->getParameterID() == juce::String("control_knob_") + juce::String(static_cast<int>(k) + 1)
				&& p->getName(64).toStdString() == name && p->isAutomatable() && !p->isMetaParameter() && p->getNumSteps() == 128)
				++knobsFound;
		}
		check(knobsFound == mdJucePlugin::ControlKnobs::Count, "the last eight are Knob 1-8 (ids control_knob_1..8), automatable, "
			"not meta, 0-127 (" + std::to_string(knobsFound) + ")");
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
		check(ids.size() == count, "every parameter has its own string id (" + std::to_string(ids.size()) + ")");
		check(names.size() == count, "every parameter has its own name (" + std::to_string(names.size()) + ")");
		check(automatable == count, "every parameter is automatable (" + std::to_string(automatable) + ")");
		check(meta == 0, "no meta parameter (" + std::to_string(meta) + ")");
		if(!params.isEmpty())
			std::printf("  first: \"%s\", last: \"%s\" (Ableton lists none of them until Configure: more than 128)\n",
				params.getFirst()->getName(64).toRawUTF8(), params.getLast()->getName(64).toRawUTF8());

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

		std::printf("%s: Knob 1-8 drive and follow the Control page's knob rows\n", mm ? "mm" : "md");
		{
			// a knob row mapping as the page makes it: Knob 1's CC (21), any channel, to T1's value 3 (MD) / T1 AMP DEC (MM)
			auto* target = mm ? controller.getParameter(mdJucePlugin::MmStudioLink::parameterName(1, 2), 0)
				: controller.getParameter(mdJucePlugin::StudioLink::parameterName(2), 0);
			check(target != nullptr, "the knob row's target exists");
			std::vector<deskCore::LearnMapping> maps(1);
			maps[0].ch = deskCore::g_learnAnyChannel;
			maps[0].cc = 21;
			maps[0].at = mm ? deskCore::LearnRef{0, 1, 2} : deskCore::LearnRef{0, -1, 2};
			double now = 0;
			auto& knobs = processor->controlKnobs();
			mdJucePlugin::MidiLearnCommands::Model model;
			model.pages = mm;
			model.tracks = static_cast<int>(tracks);
			mdJucePlugin::MidiLearnCommands::Host h;
			h.mappings = [&maps]() -> const std::vector<deskCore::LearnMapping>& { return maps; };
			h.setMappings = [&maps](std::vector<deskCore::LearnMapping> _list) { maps = std::move(_list); };
			h.parameter = [target](const deskCore::LearnRef&) { return target; };
			h.nowMs = [&now] { return now; };
			h.knob = [&knobs](const size_t _k) { return knobs.knob(_k); };
			mdJucePlugin::MidiLearnCommands learn(processor->learnRouter(), model, h, [](const elektronData::json::Value&) {});
			learn.step();	// the table, with the knob rows' CCs
			auto* knob1 = knobs.knob(0);
			auto* knob2 = knobs.knob(1);
			const int knob1Index = knob1 ? knob1->getParameterIndex() : -1;
			const int knob2Index = knob2 ? knob2->getParameterIndex() : -1;
			const int targetIndex = target ? target->getParameterIndex() : -1;
			bool onMessage = false;
			if(target && knob1 && knob2)
			{
				// the host moves Knob 1: at the next block's start its row drives the target, as a CC 21 of that value would
				host.events.clear();
				knob1->setValue(mdJucePlugin::ControlKnob::toNormalised(100));
				processor->processBlockStarted(128, false);
				processor->processBlockEnded(128);
				check(target->getUnnormalizedValue() == 100, "a host change of Knob 1 (100) moves the knob row's target to "
					+ std::to_string(target->getUnnormalizedValue()));
				learn.step();
				now += 300;
				learn.step();
				check(host.of(targetIndex, onMessage) == "bve" && onMessage, "and the target reaches the host as begin, value, end, "
					"as for a CC; got \"" + host.of(targetIndex, onMessage) + "\"");
				check(host.of(knob1Index, onMessage).empty(), "the host is told nothing back about Knob 1 (no loop); got \""
					+ host.of(knob1Index, onMessage) + "\"");

				// a CC 21 on the host's MIDI in moves the row: the target and Knob 1 follow
				host.events.clear();
				synthLib::SMidiEvent cc(synthLib::MidiEventSource::Host);
				cc.a = 0xb3;	// any channel
				cc.b = 21;
				cc.c = 30;
				processor->processBlockStarted(128, false);
				const bool consumed = processor->consumeMidiIn(cc);
				processor->processBlockEnded(128);
				check(consumed && target->getUnnormalizedValue() == 30, "CC 21 (30) on the host's MIDI in moves the same target");
				learn.step();
				check(knob1->value127() == 30, "Knob 1 follows the row: " + std::to_string(knob1->value127()));
				now += 300;
				learn.step();
				const auto knobSeq = host.of(knob1Index, onMessage);
				check(knobSeq == "bve" && onMessage, "Knob 1 reaches the host as begin, value, end on the message thread; got \""
					+ knobSeq + "\"");
				// a host that sends that value back moves nothing
				knob1->setValue(mdJucePlugin::ControlKnob::toNormalised(30));
				std::array<uint8_t, mdJucePlugin::ControlKnobs::Count> values{};
				check(knobs.takeHostMoves(values) == 0, "the host sending Knob 1's own value back drives nothing");

				// the page drags knob row 2 (knobTurn): Knob 2 follows
				host.events.clear();
				learn.knobTurned(1, 77);
				now += 300;
				learn.step();
				const auto turnSeq = host.of(knob2Index, onMessage);
				check(knobSeq == "bve" && turnSeq == "bve" && onMessage && knob2->value127() == 77,
					"a knob row dragged on the page (knobTurn 1, 77): Knob 2 reaches the host as begin, value, end; got \"" + turnSeq + "\"");
				std::array<uint8_t, mdJucePlugin::ControlKnobs::Count> after{};
				check(knobs.takeHostMoves(after) == 0, "and it drives nothing back");
			}
		}

		std::printf("%s: not host parameters (a DAW cannot map them): the values that belong to no track (the FX column)\n",
			mm ? "mm" : "md");

		ap.removeListener(&host);
		ap.releaseResources();
		processor.reset();
	}
	root.deleteRecursively();

	std::printf("%s\n", g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
