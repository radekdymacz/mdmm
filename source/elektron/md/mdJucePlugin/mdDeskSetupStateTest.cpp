// P4: the Machinedrum Editor's setup (md-desk/setup: app modulators, knob-row CCs)
// travels with the plug-in state as the "MDSK" chunk, and a project without it
// starts from the default setup. No firmware needed; isolated config.

#include "mdPluginProcessor.h"
#include "mdDeskHost.h"
#include "mdPageEditor.h"
#include "mdDeskSession.h"
#include "mdStudioLink.h"
#include "mmStudioLink.h"

#include "baseLib/binarystream.h"

#include "jucePluginLib/projectState.h"

#include "jucePluginEditorLib/pluginEditorState.h"

#include "juce_audio_processors/juce_audio_processors.h"

#include <cstdio>
#include <cstdlib>
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
			check(a.getDeskHost()->setup().find("followPlayed") == std::string::npos, "I-003: follow played track is off, and not written");
			say(*session, R"({"op":"followSet","id":3,"on":true})");
			check(a.getDeskHost()->setup().find("\"followPlayed\":true") != std::string::npos, "followSet: kept in the setup the project keeps");
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
		check(b.getDeskHost()->setup().find("\"followPlayed\":true") != std::string::npos, "and so does follow played track");
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

namespace
{
	// 0.8 (MIDI Learn L2, DESIGN-learn-0.8.md): the mappings are part of the setup. In either editor: a mapping the page adds
	// (learnAdd) is saved with the project and comes back in a new instance, which tells its page and publishes the table the
	// audio thread reads (a CC then moves the parameter); learning is pulled by the session step from the captured CCs
	// (nothing happens on the audio thread's side but the capture); a knob row's new CC takes its mappings with it (the
	// Machinedrum); an alpha project's MDLN mapping is taken over once; a mapping the project cannot be read for is left
	// out and said (left).
	void learnState(const md::MachineModel _model, const char* _name)
	{
		std::printf("%s: MIDI Learn in the setup\n", _name);
		const bool mm = _model == md::MachineModel::Monomachine;
		const auto say = [](mdJucePlugin::DeskSession& _s, const std::string& _json) { _s.onPageMessage(*elektronData::json::parse(_json)); };
		const auto lastLearn = [](const std::vector<Value>& _page) -> const Value*
		{
			for(auto it = _page.rbegin(); it != _page.rend(); ++it)
				if(const auto* t = it->find("type"); t && t->isString() && t->asString() == "learn")
					return it->find("doc");
			return nullptr;
		};
		const auto mappingsOf = [&](const std::vector<Value>& _page) -> const std::vector<Value>*
		{
			const auto* d = lastLearn(_page);
			return d && d->find("mappings") ? &d->find("mappings")->asArray() : nullptr;
		};
		const std::string target = mm ? R"("t":0,"pg":0,"i":0)" : R"("t":0,"i":0)";
		const std::string target2 = mm ? R"("t":1,"pg":1,"i":2)" : R"("t":1,"i":2)";
		const int ccAny = mm ? 60 : 21;		// the Monomachine's page 1 starts at CC 56; the Machinedrum's CC 16-39 are the first lane's
		const std::string name = mm ? mdJucePlugin::MmStudioLink::parameterName(0, 0) : mdJucePlugin::StudioLink::parameterName(0);

		juce::MemoryBlock saved;
		{
			mdJucePlugin::AudioPluginAudioProcessor a(_model, isolated());
			juce::AudioProcessor& ja = a;
			auto* session = a.getDeskHost()->session();
			std::vector<Value> page;
			session->attach([&page](const Value& _m) { page.push_back(_m); });
			say(*session, R"({"op":"ready"})");
			check(mappingsOf(page) && mappingsOf(page)->empty() && lastLearn(page)->find("enabled")->asBool(), "no mapping at first, and MIDI mapping is on");
			check(lastLearn(page)->find("limits")->find("max")->asNumber() == 128, "the document says the most mappings");
			say(*session, R"({"op":"learnAdd","id":1,"cc":)" + std::to_string(ccAny) + "," + target + "}");
			const auto* list = mappingsOf(page);
			check(list && list->size() == 1 && (*list)[0].find("cc")->asNumber() == ccAny && (*list)[0].find("ch")->asNumber() == 255
				&& (*list)[0].find("mode")->asString() == "Absolute", "learnAdd: one mapping on any channel");
			// the machine's own CCs it hides (the base channel 0: 4 channels of the Machinedrum, 6 of the Monomachine)
			check(list && (*list)[0].find("overrides")->asArray().size() == (mm ? 6u : 4u), "and it says which firmware targets it overrides");
			say(*session, R"({"op":"learnAdd","id":2,"cc":)" + std::to_string(ccAny) + "," + target + "}");
			check(mappingsOf(page)->size() == 1, "learnAdd: the same mapping again is refused (already mapped)");
			check(a.getDeskHost()->setup().find("\"mappings\"") != std::string::npos, "the mapping is in the setup the project keeps");

			// the audio thread's table: published; a CC moves the parameter
			auto& router = a.learnRouter();
			router.beginBlock();
			check(router.table().count == 1, "the table the audio thread reads has the mapping");
			auto* param = a.getController().getParameter(name, 0);
			check(router.translate(0xb3, static_cast<uint8_t>(ccAny), 127) && param && param->getUnnormalizedValue() == 127,
				"a CC on any channel moves the parameter and is consumed");

			// learning is pulled by the step: two values from one controller make the mapping, only on the message thread
			say(*session, R"({"op":"learnStart","id":3,)" + target2 + "}");
			check(lastLearn(page)->find("learning")->isObject() && lastLearn(page)->find("learning")->find("got")->asNumber() == 0
				&& lastLearn(page)->find("learning")->find("need")->asNumber() == 2, "learnStart: the document says what waits, 0 of 2");
			router.beginBlock();
			check(router.translate(0xb2, 30, 10), "while learning a CC is captured and consumed");
			check(router.translate(0x90, 60, 100) == false, "and a note goes on to the machine");
			check(mappingsOf(page)->size() == 1, "nothing is learned yet: the audio thread only captured");
			session->step();
			check(lastLearn(page)->find("learning")->isObject() && lastLearn(page)->find("learning")->find("got")->asNumber() == 1, "the step took the first value: 1 of 2");
			check(router.translate(0xb2, 30, 100), "the second value");
			session->step();
			list = mappingsOf(page);
			check(list && list->size() == 2 && (*list)[1].find("cc")->asNumber() == 30 && (*list)[1].find("ch")->asNumber() == 2
				&& (*list)[1].find("t")->asNumber() == 1 && lastLearn(page)->find("learning")->isNull(),
				"the step learned the mapping: the CC and channel it came on, the target; learning is over");
			router.beginBlock();
			check(router.table().count == 2, "and the audio thread has the new table at its next block");
			auto* p2 = a.getController().getParameter(mm ? mdJucePlugin::MmStudioLink::parameterName(1, 2) : mdJucePlugin::StudioLink::parameterName(2), 1);
			check(router.translate(0xb2, 30, 127) && p2 && p2->getUnnormalizedValue() == 127, "the learned CC moves its parameter");
			router.translate(0xb2, 30, 0);
			session->step();
			check(router.takeTouched() == std::array<uint64_t, 2>{0, 0}, "the session step took the touched bits (the host is told on the message thread)");

			// a second learnStart moves the target, learnCancel ends it
			say(*session, R"({"op":"learnStart","id":4,)" + target + "}");
			say(*session, R"({"op":"learnStart","id":5,)" + target2 + "}");
			check(router.learning() && lastLearn(page)->find("learning")->find("t")->asNumber() == 1, "a second learnStart moves the target");
			say(*session, R"({"op":"learnCancel","id":6})");
			check(!router.learning() && lastLearn(page)->find("learning")->isNull(), "learnCancel ends it");

			// invert and remove
			say(*session, R"({"op":"learnInvert","id":7,"index":0})");
			check((*mappingsOf(page))[0].find("invert")->asBool(), "learnInvert");
			say(*session, R"({"op":"learnRemove","id":8,"index":1})");
			check(mappingsOf(page)->size() == 1, "learnRemove");
			router.beginBlock();
			check(router.table().count == 1, "and the table follows");

			// the host hears the moves in change gestures: one begin, values, one end 250 ms after the last move; a rebuild closes
			// an open one (none stays stuck), and a bit the old table set names nothing in the new
			struct Gestures final : juce::AudioProcessorParameter::Listener
			{
				void parameterValueChanged(int, float) override { ++values; }
				void parameterGestureChanged(int, const bool _starting) override { (_starting ? begins : ends)++; }
				int begins = 0, ends = 0, values = 0;
			} gestures;
			auto* gp = a.getController().getParameter(name, 0);
			gp->addListener(&gestures);
			router.beginBlock();
			router.translate(0xb0, static_cast<uint8_t>(ccAny), 10);
			session->step();
			check(gestures.begins == 1 && gestures.ends == 0 && gestures.values >= 1, "gesture: a learned move opens one change gesture and tells the host the value");
			router.translate(0xb0, static_cast<uint8_t>(ccAny), 100);
			session->step();
			check(gestures.begins == 1 && gestures.ends == 0, "gesture: the next move is in the same gesture");
			juce::Thread::sleep(300);
			session->step();
			check(gestures.begins == 1 && gestures.ends == 1, "gesture: it ends 250 ms after the last move");
			router.translate(0xb0, static_cast<uint8_t>(ccAny), 40);
			session->step();
			check(gestures.begins == 2 && gestures.ends == 1, "gesture: a new move, a new gesture");
			router.translate(0xb0, static_cast<uint8_t>(ccAny), 90);
			say(*session, R"({"op":"learnInvert","id":70,"index":0})");
			check(gestures.begins == 2 && gestures.ends == 2, "gesture: a rebuild of the table closes the open one (none stays stuck)");
			check(router.takeTouched() == std::array<uint64_t, 2>{0, 0}, "and the bit the old table set is gone");
			say(*session, R"({"op":"learnInvert","id":71,"index":0})");
			gp->removeListener(&gestures);
			check(gestures.begins == gestures.ends, "every gesture opened was closed");

			// HW MIDI engine: the host's MIDI in is the machine's own MIDI out: nothing is translated or captured, the document says why
			const auto asOk = [&](const char* _id)
			{
				for(auto it = page.rbegin(); it != page.rend(); ++it)
					if(const auto* t = it->find("type"); t && t->asString() == "result" && it->find("id") && it->find("id")->asNumber() == std::atof(_id))
						return it->find("ok")->asBool();
				return true;
			};
			say(*session, R"({"op":"learnStart","id":72,)" + target2 + "}");
			check(router.learning(), "a learn waits for a controller");
			a.getExternalMidi().set(true);
			session->step();
			check(!router.learning() && lastLearn(page)->find("paused") && lastLearn(page)->find("learning")->isNull(), "HW MIDI on: the learn ends, and the document says Learn is off (paused, with the reason)");
			say(*session, R"({"op":"learnStart","id":73,)" + target2 + "}");
			check(!asOk("73") && !router.learning(), "and a new learn is refused");
			const auto applied0 = router.counts().applied, captured0 = router.counts().captured;
			synthLib::SMidiEvent hostCc(synthLib::MidiEventSource::Host);
			hostCc.a = 0xb0; hostCc.b = static_cast<uint8_t>(ccAny); hostCc.c = 3;
			router.beginBlock();
			check(!a.consumeMidiIn(hostCc) && router.counts().applied == applied0 && router.counts().captured == captured0,
				"and a mapped CC from the host passes through untouched, not translated and not captured");
			a.getExternalMidi().set(false);
			session->step();
			check(!lastLearn(page)->find("paused") && a.consumeMidiIn(hostCc), "back on the emulator: no reason, and the mapping works again");
			ja.getStateInformation(saved);
			say(*session, R"({"op":"learnStart","id":80,)" + target2 + "}");
			check(router.learning(), "a learn waits when the page goes");
			session->detach();
			check(!router.learning(), "the page detached (the editor closed): the learn is cancelled");
		}

		// a new instance restores the mapping with the project, tells its page and publishes the table
		mdJucePlugin::AudioPluginAudioProcessor b(_model, isolated());
		juce::AudioProcessor& jb = b;
		jb.setStateInformation(saved.getData(), static_cast<int>(saved.getSize()));
		auto* session = b.getDeskHost()->session();
		std::vector<Value> page;
		session->attach([&page](const Value& _m) { page.push_back(_m); });
		say(*session, R"({"op":"ready"})");
		session->step();
		say(*session, R"({"op":"ready"})");
		const auto* list = mappingsOf(page);
		check(list && list->size() == 1 && (*list)[0].find("cc")->asNumber() == ccAny && (*list)[0].find("invert")->asBool(),
			"a mapping survives save and load of the project: the new instance's document has it, inverted as saved");
		auto& router = b.learnRouter();
		router.beginBlock();
		auto* param = b.getController().getParameter(name, 0);
		check(router.table().count == 1 && router.translate(0xb0, static_cast<uint8_t>(ccAny), 127) && param->getUnnormalizedValue() == 0,
			"and its table moves the parameter (the inversion kept)");

		// an alpha project's MDLN mapping: taken over once when the setup has no mappings member
		{
			auto project = pluginLib::parseProject(std::vector<uint8_t>(static_cast<const uint8_t*>(saved.getData()),
				static_cast<const uint8_t*>(saved.getData()) + saved.getSize()));
			check(project.has_value(), "the saved project parses");
			if(project)
			{
				pluginLib::putChunk(project->chunks, pluginLib::fourCC("MDSK"), std::nullopt);		// no setup member
				const std::string preset = std::string(R"({"name":"x","version":1,"mappings":[)")
					+ R"({"type":"ControlChange","mode":"RelativeSigned","channel":2,"part":3,"controller":44,"paramName":")" + name + R"(","invert":true},)"
					+ R"({"type":"ControlChange","channel":0,"controller":45,"paramName":")" + name + R"("},)"
					+ R"({"type":"ControlChange","channel":0,"part":1,"controller":46,"paramName":"NoSuchParameter"}]})";
				baseLib::BinaryStream chunkData;
				chunkData.write(preset);
				std::vector<uint8_t> bytes;
				chunkData.toVector(bytes);
				pluginLib::putChunk(project->chunks, pluginLib::fourCC("MDLN"), pluginLib::ProjectChunk{pluginLib::fourCC("MDLN"), 2, bytes});
				const auto alpha = pluginLib::writeProject(*project);
				mdJucePlugin::AudioPluginAudioProcessor c(_model, isolated());
				juce::AudioProcessor& jc = c;
				jc.setStateInformation(alpha.data(), static_cast<int>(alpha.size()));
				auto* cs = c.getDeskHost()->session();
				std::vector<Value> cp;
				cs->attach([&cp](const Value& _m) { cp.push_back(_m); });
				say(*cs, R"({"op":"ready"})");
				cs->step();
				say(*cs, R"({"op":"ready"})");
				const auto* l = mappingsOf(cp);
				check(l && l->size() == 1 && (*l)[0].find("cc")->asNumber() == 44 && (*l)[0].find("ch")->asNumber() == 2
					&& (*l)[0].find("t")->asNumber() == 3 && (*l)[0].find("mode")->asString() == "RelativeSigned" && (*l)[0].find("invert")->asBool(),
					"MDLN of an alpha project is imported: the mapping with a track part, its channel, mode and inversion");
				const auto* left = lastLearn(cp)->find("left");
				check(left && left->asArray().size() == 2, "the automatic part and the unknown parameter are left out, said in left");
				check(c.getDeskHost()->legacyMapping().empty() && c.getDeskHost()->setup().find("\"mappings\"") != std::string::npos,
					"and it is in the setup now, MDLN is not kept");
				say(*cs, R"({"op":"learnRemove","id":60,"index":0})");
				check(c.getDeskHost()->setup().find("\"mappings\":[]") != std::string::npos,
					"deleting the imported mapping writes mappings: [] so the alpha MDLN is not imported again");
				cs->detach();
			}
		}

		// a setup with a mapping the editor cannot read: that one is left out alone, said in the document
		{
			const std::string badTarget = mm ? R"("t":0,"pg":99,"i":0)" : R"("t":0,"i":99)";
			const std::string setup = mm
				? R"({"schema":"mm-desk/setup","version":1,"mappings":[{"ch":0,"cc":21,"t":0,"pg":0,"i":0,"mode":"future-mode"},{"ch":0,"cc":22,)" + badTarget + "}]}"
				: R"({"schema":"md-desk/setup","version":1,"mappings":[{"ch":0,"cc":21,"t":0,"i":0,"mode":"future-mode","extra":1},{"ch":0,"cc":22,)" + badTarget + "}]}";
			mdJucePlugin::AudioPluginAudioProcessor d(_model, isolated());
			d.getDeskHost()->setSetup(setup);
			auto* ds = d.getDeskHost()->session();
			std::vector<Value> dp;
			ds->attach([&dp](const Value& _m) { dp.push_back(_m); });
			say(*ds, R"({"op":"ready"})");
			ds->step();
			say(*ds, R"({"op":"ready"})");
			const auto* l = mappingsOf(dp);
			check(l && l->size() == 1 && (*l)[0].find("mode")->asString() == "Absolute", "an unknown mode is absolute, the other mapping is kept");
			const auto* left = lastLearn(dp)->find("left");
			bool path = false;
			if(left)
				for(const auto& e : left->asArray())
					path = path || e.asString().find("$.mappings[1]") == 0;
			check(path, "the one outside the limits is left out alone, with its path");
			ds->detach();
		}
		session->detach();
	}

	// MD: a knob row's CC changed (knobs) takes its any-channel mappings with it, in the same command
	void knobRowMovesMappings()
	{
		std::printf("Machinedrum: a knob row's CC moves its mappings\n");
		mdJucePlugin::AudioPluginAudioProcessor a(md::MachineModel::Machinedrum, isolated());
		auto* session = a.getDeskHost()->session();
		std::vector<Value> page;
		session->attach([&page](const Value& _m) { page.push_back(_m); });
		const auto say = [&](const char* _json) { session->onPageMessage(*elektronData::json::parse(_json)); };
		say(R"({"op":"ready"})");
		say(R"({"op":"learnAdd","id":1,"cc":21,"t":0,"i":0})");
		say(R"({"op":"learnAdd","id":2,"cc":21,"t":1,"i":1,"ch":3})");
		say(R"({"op":"knobs","id":3,"ccs":[41,22,23,24,25,26,27,28]})");
		const Value* doc = nullptr;
		for(auto it = page.rbegin(); it != page.rend() && !doc; ++it)
			if(const auto* t = it->find("type"); t && t->asString() == "learn")
				doc = it->find("doc");
		session->step();
		for(auto it = page.rbegin(); it != page.rend(); ++it)
			if(const auto* t = it->find("type"); t && t->asString() == "learn")
			{
				doc = it->find("doc");
				break;
			}
		const auto& list = doc->find("mappings")->asArray();
		check(list.size() == 2 && list[0].find("cc")->asNumber() == 41 && list[0].find("ch")->asNumber() == 255
			&& list[1].find("cc")->asNumber() == 21 && list[1].find("ch")->asNumber() == 3,
			"the any-channel mapping follows the knob row to CC 41, the channel-specific one is the person's own and stays");
		auto& router = a.learnRouter();
		router.beginBlock();
		check(router.table().count == 2, "and the table follows");
		say(R"({"op":"learnAdd","id":4,"cc":22,"t":3,"i":3})");
		say(R"({"op":"knobs","id":5,"ccs":[22,41,23,24,25,26,27,28]})");
		session->step();
		for(auto it = page.rbegin(); it != page.rend(); ++it)
			if(const auto* t = it->find("type"); t && t->asString() == "learn")
			{
				const auto& l2 = it->find("doc")->find("mappings")->asArray();
				check(l2.size() == 3 && l2[0].find("cc")->asNumber() == 22 && l2[2].find("cc")->asNumber() == 41,
					"two rows swapped in one command: each mapping follows its own row (22 and 41), none merged");
				break;
			}
		session->detach();
	}
}

// 1.0 review (real time 4): with no page the session steps every g_idleStepMs, each step standing for several 8 ms
// ones; every period keeps its length: over the same time the idle pace is due as often as the 8 ms pace (one more or
// one less at the edges), and on the first step.
void idlePace()
{
	using mdJucePlugin::due;
	const auto span = static_cast<uint64_t>(mdJucePlugin::g_idleStepMs / mdJucePlugin::g_stepMs);
	bool same = span > 1;
	for(const double period : {mdJucePlugin::g_deskTickMs, mdJucePlugin::g_lcdMs, mdJucePlugin::g_cpuLoadMs, 96.0,
		mdJucePlugin::g_hostTempoMs, mdJucePlugin::g_engineChoicesMs, mdJucePlugin::g_followHostMs})
	{
		int fast = 0, idle = 0;
		for(uint64_t t = 1; t <= 10000; ++t)
			fast += due(t, period) ? 1 : 0;
		for(uint64_t t = span; t <= 10000; t += span)
			idle += due(t, period, span) ? 1 : 0;
		const int expected = period <= mdJucePlugin::g_idleStepMs ? static_cast<int>(10000 / span) : fast;
		same = same && std::abs(idle - expected) <= 1 && due(span, period, span);
	}
	check(same, "idle pace: each period is as long in ms at 64 ms steps as at 8 ms steps (and due at once)");
	bool exact = true;
	for(uint64_t t = 1; t < 1000; ++t)
		exact = exact && due(t, 96.0, 1) == (((t - 1) % 12) == 0);
	check(exact, "a page's pace (span 1): due as before, every n-th step from the first");
}

namespace
{
	std::vector<uint8_t> bytesOf(const juce::MemoryBlock& _m)
	{
		const auto* p = static_cast<const uint8_t*>(_m.getData());
		return std::vector<uint8_t>(p, p + _m.getSize());
	}

	// review 2 (finding 4): the project's frame has one reader and writer (pluginLib::parseProject); a project held without
	// a ROM keeps every chunk byte for byte and takes each machine-free chunk that moved (the MIDI mapping "MDLN" too,
	// which was lost), on save and when the machine comes
	void heldProject(const juce::MemoryBlock& _saved)
	{
		std::printf("a project held without a ROM\n");
		using pluginLib::fourCC;
		const auto saved = bytesOf(_saved);
		auto project = pluginLib::parseProject(saved);
		check(project && pluginLib::writeProject(*project) == saved && pluginLib::findChunk(project->chunks, fourCC("MDSK")),
			"a saved project parses into its chunks and is written back byte for byte");
		// what moved goes in place, what is new at the end, what is gone goes; the rest stays
		pluginLib::ProjectChunk learnOld{fourCC("MDLN"), 2, {1, 2, 3}}, learnNew{fourCC("MDLN"), 2, {4, 5}}, future{fourCC("ZZZZ"), 9, {9, 9}};
		std::vector<pluginLib::ProjectChunk> chunks{learnOld, future};
		pluginLib::putMoved(chunks, {learnOld}, {learnNew, pluginLib::ProjectChunk{fourCC("MDSK"), 1, {7}}});
		check(chunks.size() == 3 && chunks[0] == learnNew && chunks[1] == future && chunks[2].fourCC == fourCC("MDSK"),
			"a moved MIDI mapping is put in place, a new chunk at the end, an unknown one stays");
		pluginLib::putMoved(chunks, {learnNew}, {});
		check(chunks.size() == 2 && !pluginLib::findChunk(chunks, fourCC("MDLN")), "a mapping cleared since: its chunk goes");

		// a project with a MIDI mapping and a newer editor's chunk, held (no ROM), the setup changed, saved
		project->chunks.push_back(learnOld);
		project->chunks.push_back(future);
		const auto given = pluginLib::writeProject(*project);
		mdJucePlugin::AudioPluginAudioProcessor c(md::MachineModel::Machinedrum, isolated());
		juce::AudioProcessor& jc = c;
		jc.setStateInformation(given.data(), static_cast<int>(given.size()));
		juce::MemoryBlock same;
		jc.getStateInformation(same);
		check(bytesOf(same) == given, "held and saved untouched: the same bytes");
		const std::string setup = R"({"schema":"md-desk/setup","version":1,"knobCcs":[40,41,42,43,44,45,46,47]})";
		c.getDeskHost()->setSetup(setup);
		juce::MemoryBlock changed;
		jc.getStateInformation(changed);
		const auto out = pluginLib::parseProject(bytesOf(changed));
		bool restSame = out && out->chunks.size() == project->chunks.size();
		for(size_t i = 0; restSame && i < out->chunks.size(); ++i)
			if(out->chunks[i].fourCC != fourCC("MDSK"))
				restSame = out->chunks[i] == project->chunks[i];
		check(out && restSame && pluginLib::findChunk(out->chunks, fourCC("MDLN"))->data == learnOld.data
			&& pluginLib::findChunk(out->chunks, fourCC("ZZZZ"))->version == 9, "a setup changed while held: the MIDI mapping and the newer chunk stay as they were");
		std::vector<uint8_t> taken;
		check(c.getDeskHost()->takeHeldState(taken) && taken == bytesOf(changed), "the machine that comes gets the same bytes (the change is not lost there)");
		c.getDeskHost()->holdState(given.data(), static_cast<int>(given.size()));
		check(c.getMidiLearnTranslator() == nullptr, "the pluginLib translator is not made: an alpha MDLN chunk is kept as it was (read only, never rewritten)");
		c.getDeskHost()->takeHeldState(taken);
	}
}

// Review (real time 4): a real machine's wire lets one message out per step once it is free, so the session keeps the
// 8 ms pace without a page while messages wait for the wire; idle, without a page, it slows down.
void wirePace(const md::MachineModel _model, const char* _name)
{
	mdJucePlugin::AudioPluginAudioProcessor p(_model, isolated());
	juce::AudioProcessor& jp = p;
	auto* session = p.getDeskHost()->session();
	if(!session)
	{
		check(false, "wire pace: no session");
		return;
	}
	check(session->paceMs() == static_cast<int>(mdJucePlugin::g_idleStepMs), "no page, the emulator: the idle pace");
	jp.prepareToPlay(44100.0, 256);
	// the page chose HW MIDI and was ready (the desk asks the machine for its documents over the wire), then closed
	session->attach([](const elektronData::json::Value&) {});
	session->onPageMessage(*elektronData::json::parse(R"({"op":"engine","kind":"hw"})"));
	session->onPageMessage(*elektronData::json::parse(R"({"op":"ready"})"));
	session->detach();
	bool busy = false;
	for(int i = 0; i < 50 && !busy; ++i)
	{
		session->step();
		busy = session->paceMs() == static_cast<int>(mdJucePlugin::g_stepMs);
	}
	std::printf("  (%s)\n", _name);
	check(busy, "the HW MIDI engine with messages waiting for the wire: the 8 ms pace, no page up");
	bool idle = false;
	const auto t0 = juce::Time::getMillisecondCounterHiRes();
	while(!idle && juce::Time::getMillisecondCounterHiRes() - t0 < 20000)
	{
		session->step();
		juce::Thread::sleep(8);
		idle = session->paceMs() == static_cast<int>(mdJucePlugin::g_idleStepMs);
	}
	check(idle, "once the wire is free again: the idle pace");
	jp.releaseResources();
}

int main()
{
	// No ROM anywhere: an empty data root, set before anything reads it (a Mac with the ROMs installed in Documents
	// would otherwise start a machine, and the no-ROM hold path is what this test checks)
	const auto root = juce::File::getSpecialLocation(juce::File::tempDirectory).getNonexistentChildFile("mdDeskSetupStateTest", "");
	root.createDirectory();
	setenv("GEARMULATOR_DATA_ROOT", (root.getFullPathName() + "/").toRawUTF8(), 1);
	juce::ScopedJuceInitialiser_GUI juce;
	idlePace();
	wirePace(md::MachineModel::Machinedrum, "Machinedrum");
	wirePace(md::MachineModel::Monomachine, "Monomachine");
	soloState(md::MachineModel::Machinedrum, "Machinedrum");
	soloState(md::MachineModel::Monomachine, "Monomachine");
	learnState(md::MachineModel::Machinedrum, "Machinedrum");
	learnState(md::MachineModel::Monomachine, "Monomachine");
	knobRowMovesMappings();
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
	heldProject(withSetup);
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
		// 1.0 review (real time 5): the inbox is made when HW MIDI goes on and never grows on the audio thread; what
		// does not fit is dropped and counted (still kept from the device), and the next drain has room again
		{
			auto& ext = b.getExternalMidi();
			synthLib::SMidiEvent big(synthLib::MidiEventSource::Physical);
			big.sysex.assign(pluginLib::ExternalMidi::InCapacity / 2, 0x11);
			big.sysex.front() = 0xf0;
			big.sysex.back() = 0xf7;
			const auto dropped0 = ext.inDropped();
			const bool kept = ext.takeIn(big) && ext.takeIn(big) && ext.takeIn(big);
			in.clear();
			ext.drainIn(in);
			check(kept && in.size() == 1 && in[0].sysex.size() == big.sysex.size() && ext.inDropped() == dropped0 + 2,
				"a full inbox drops and counts what does not fit, never gives it to the device");
			in.clear();
			const bool again = ext.takeIn(big);
			ext.drainIn(in);
			check(again && in.size() == 1 && ext.inDropped() == dropped0 + 2, "after a drain there is room again");
		}
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
	root.deleteRecursively();
	std::printf("mdDeskSetupStateTest: %s\n", g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
