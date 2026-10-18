// The pure MIDI Learn core (deskLearn.h, doc/midilearn/DESIGN-learn-0.8.md, L0): the edits, the learn step, the mode
// detection, the overrides, the setup member's lenient codec and the alpha "MDLN" import. No JUCE, no ROM.

#include "deskLearn.h"
#include "deskSetup.h"

#include <cstdio>
#include <string>

namespace
{
	using namespace deskCore;
	namespace json = elektronData::json;

	int g_failures = 0;

	void check(const bool _ok, const char* _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what);
		if(!_ok)
			++g_failures;
	}

	json::Value parse(const char* _text)
	{
		std::string err;
		auto v = json::parse(_text, &err);
		if(!v)
		{
			std::printf("  FAIL test json: %s\n", err.c_str());
			++g_failures;
			return json::Value::object();
		}
		return *v;
	}

	LearnMapping map(const uint8_t _ch, const uint8_t _cc, const int _t, const int _i, const LearnMode _mode = LearnMode::Absolute, const bool _inv = false, const int _pg = -1)
	{
		LearnMapping m;
		m.ch = _ch;
		m.cc = _cc;
		m.at = {_t, _pg, _i};
		m.mode = _mode;
		m.invert = _inv;
		return m;
	}

	void edits()
	{
		std::vector<LearnMapping> l;
		auto r = addMapping(l, map(0, 21, 2, 5));
		check(r.ok() && r.list.size() == 1, "add: one mapping");
		l = r.list;
		r = addMapping(l, map(0, 21, 2, 5));
		check(!r.ok() && r.refusal == "already mapped" && r.list == l, "add: an identical mapping is refused, the list unchanged");
		r = addMapping(l, map(0, 21, 2, 5, LearnMode::RelativeSigned, true));
		check(r.ok() && r.list.size() == 1 && r.list[0].mode == LearnMode::RelativeSigned && r.list[0].invert, "add: the same message and target with another mode replaces it where it stands");
		r = addMapping(l, map(0, 21, 3, 5));
		check(r.ok() && r.list.size() == 2, "add: another target on the same CC is a second target");
		r = addMapping(r.list, map(g_learnAnyChannel, 21, 2, 5));
		check(r.ok() && r.list.size() == 3, "add: any channel and channel 1 are different messages");
		check(!addMapping(l, map(0, 128, 0, 0)).ok() && !addMapping(l, map(16, 1, 0, 0)).ok() && !addMapping(l, map(0, 1, -1, 0)).ok() && !addMapping(l, map(0, 1, 0, -1)).ok(),
			"add: cc over 127, channel 17, no track, no parameter are refused");

		std::vector<LearnMapping> full;
		for(size_t n = 0; n < g_learnMaxMappings; ++n)
			full.push_back(map(0, static_cast<uint8_t>(n), 0, 0));
		r = addMapping(full, map(1, 0, 0, 0));
		check(!r.ok() && r.refusal == "128 mappings at most" && r.list.size() == 128, "add: the 129th is refused");
		r = addMapping(full, map(0, 5, 0, 0, LearnMode::RelativeOffset));
		check(r.ok() && r.list.size() == 128 && r.list[5].mode == LearnMode::RelativeOffset, "add: a replace works on a full list");

		l = {map(0, 1, 0, 0), map(0, 2, 0, 1), map(0, 3, 0, 2)};
		check(removeMapping(l, 1).size() == 2 && removeMapping(l, 1)[1].cc == 3, "remove: the one at the index");
		check(removeMapping(l, 3) == l, "remove: out of range changes nothing");
		check(invertMapping(l, 2)[2].invert && !invertMapping(invertMapping(l, 2), 2)[2].invert && invertMapping(l, 9) == l, "invert: toggles, out of range changes nothing");

		l = {map(g_learnAnyChannel, 21, 0, 0), map(2, 21, 1, 1), map(g_learnAnyChannel, 22, 0, 1)};
		auto moved = moveKnobCc(l, 21, 40);
		check(moved.size() == 3 && moved[0].cc == 40 && moved[0].ch == g_learnAnyChannel && moved[1].cc == 21 && moved[2].cc == 22,
			"moveKnobCc: the any-channel mappings follow the row, a channel-specific one stays");
		l.push_back(map(g_learnAnyChannel, 40, 0, 0));
		moved = moveKnobCc(l, 21, 40);
		check(moved.size() == 3 && !moved.empty(), "moveKnobCc: a mapping that would duplicate one the row already has is dropped");
		check(moveKnobCc(l, 21, 21) == l && moveKnobCc(l, 21, 200) == l, "moveKnobCc: the same CC or one over 127 changes nothing");
	}

	void learning()
	{
		LearnCapture c;
		c.target = {2, -1, 5};
		auto s = learnStep(c, 0x90, 60, 100);
		check(!s.next.started && !s.learned, "a note is ignored: it stays the machine's");
		s = learnStep(c, 0xB2, 21, 40);
		check(s.next.started && s.next.ch == 2 && s.next.cc == 21 && s.next.values.size() == 1 && !s.learned, "the first CC fixes channel and controller");
		auto c2 = s.next;
		s = learnStep(c2, 0xB3, 21, 90);
		check(!s.learned && s.next.values.size() == 1, "another channel is ignored");
		s = learnStep(c2, 0xB2, 22, 90);
		check(!s.learned && s.next.values.size() == 1, "another controller is ignored");
		s = learnStep(c2, 0xB2, 21, 40);
		check(!s.learned && s.next.values.size() == 1, "the same value again does not count");
		s = learnStep(c2, 0xB2, 21, 41);
		check(s.learned && s.learned->ch == 2 && s.learned->cc == 21 && s.learned->at == c.target && s.learned->mode == LearnMode::Absolute
			&& !s.learned->invert, "two different values complete it, with the channel it came on and the target");
		check(!s.next.started && s.next.values.empty() && s.next.target.t == -1, "after a learn the capture is empty");

		// a button: pressed and released
		s = learnStep(learnStep(c, 0xB0, 50, 127).next, 0xB0, 50, 0);
		check(s.learned && s.learned->mode == LearnMode::Absolute, "a 0/127 button is learned as absolute");
		s = learnStep(learnStep(c, 0xB0, 50, 1).next, 0xB0, 50, 127);
		check(s.learned && s.learned->mode == LearnMode::RelativeSigned, "1 and 127: relative signed");
		s = learnStep(learnStep(c, 0xB0, 50, 63).next, 0xB0, 50, 65);
		check(s.learned && s.learned->mode == LearnMode::RelativeOffset, "63 and 65: relative offset");

		check(detectMode({}) == LearnMode::Absolute && detectMode({0, 127}) == LearnMode::Absolute && detectMode({127, 0, 127}) == LearnMode::Absolute, "detectMode: empty and buttons are absolute");
		check(detectMode({1, 127}) == LearnMode::RelativeSigned && detectMode({2, 126}) == LearnMode::RelativeSigned, "detectMode: encoder around 1/127");
		check(detectMode({63, 65}) == LearnMode::RelativeOffset && detectMode({64, 65}) == LearnMode::RelativeOffset, "detectMode: around 64");
		check(detectMode({10, 30, 50}) == LearnMode::Absolute, "detectMode: a sweep is absolute");
	}

	void overrides()
	{
		// a toy firmware map: on offsets 0..3, CC 16..39 drive parameter cc - 16 of track offset * 4 + ...; only CC 21 for brevity
		const FirmwareCcMap map21 = [](const int _offset, const int _cc) -> std::optional<LearnRef>
		{
			if(_cc < 16 || _cc > 39)
				return std::nullopt;
			return LearnRef{_offset, -1, _cc - 16};
		};
		FirmwareChannels ch{0, 4};
		auto o = overridesOf(map(0, 21, 2, 5), ch, map21);
		check(o.size() == 1 && o[0].ch == 0 && o[0].at == LearnRef{0, -1, 5}, "a channel-specific mapping hides the firmware's target on that channel");
		check(overridesOf(map(9, 21, 2, 5), ch, map21).empty(), "channel 10 is off the machine's channels: nothing hidden");
		check(overridesOf(map(0, 60, 2, 5), ch, map21).empty(), "a CC off the firmware map hides nothing");
		o = overridesOf(map(g_learnAnyChannel, 21, 2, 5), ch, map21);
		check(o.size() == 4 && o[0].ch == 0 && o[3].ch == 3 && o[3].at.t == 3, "an any-channel mapping hides it on every machine channel");
		ch = {14, 4};
		o = overridesOf(map(g_learnAnyChannel, 21, 2, 5), ch, map21);
		check(o.size() == 4 && o[0].ch == 0 && o[0].at.t == 2 && o[2].ch == 14 && o[2].at.t == 0 && o[3].ch == 15, "the base channel wraps: base 15 and 16, then 1 and 2");
		check(overridesOf(map(0, 21, 2, 5), {0, 0}, map21).empty() && overridesOf(map(0, 21, 2, 5), ch, nullptr).empty(), "no span or no map: nothing hidden");
	}

	LearnLimits mdLimits() { return LearnLimits{16, 0, 24}; }
	LearnLimits mmLimits() { return LearnLimits{6, 8, 8}; }

	void codec()
	{
		SetupSpec md;
		md.learn = mdLimits();
		DeskSetup s;
		s.mappings = {map(0, 21, 2, 5), map(g_learnAnyChannel, 22, 15, 23, LearnMode::RelativeSigned, true)};
		std::vector<std::string> errors;
		auto doc = setupToJson(s, md);
		check(setupHasMappings(doc), "written: a mappings member");
		auto back = setupFromJson(doc, md, errors);
		check(errors.empty() && back.mappings == s.mappings && back == s, "round trip (md-desk/setup)");
		check(!setupHasMappings(setupToJson(DeskSetup{}, md)), "none: no member written");
		check(setupFromJson(setupToJson(DeskSetup{}, md), md, errors).mappings.empty(), "none read back");

		// through the text: a stored project
		std::string err;
		const auto text = json::write(doc);
		const auto reparsed = json::parse(text, &err);
		check(reparsed && setupFromJson(*reparsed, md, errors) == s, "round trip through the document text");

		SetupSpec mm;
		mm.schema = "mm-desk/setup";
		mm.modulators.schema = "mm-desk/modulators";
		mm.tracks = 6;
		mm.knobCcs = false;
		mm.writesBare = true;
		mm.learn = mmLimits();
		DeskSetup m;
		m.mappings = {map(1, 70, 3, 4, LearnMode::Absolute, false, 2), map(g_learnAnyChannel, 21, 0, 0, LearnMode::RelativeOffset, false, 0)};
		errors.clear();
		auto mdoc = setupToJson(m, mm);
		check(mdoc.find("mappings") && mdoc.find("mappings")->asArray()[0].find("pg") && mdoc.find("schema")->asString() == "mm-desk/modulators", "mm: the bare modulators document with mappings and pages beside it");
		check(setupFromJson(mdoc, mm, errors) == m && errors.empty(), "round trip (mm-desk/modulators)");

		// the lenient cases
		errors.clear();
		auto d = parse(R"({"schema":"md-desk/setup","version":1,"mappings":[
			{"ch":0,"cc":21,"t":2,"i":5,"mode":"absolute","invert":false,"future":{"x":1}},
			{"ch":0,"cc":22,"t":2,"i":6,"mode":"swirl"},
			{"ch":0,"cc":23,"t":2,"i":7,"invert":"yes"},
			{"cc":24,"t":2,"i":5},
			{"ch":17,"cc":24,"t":2,"i":5},
			{"ch":0,"cc":128,"t":2,"i":5},
			{"ch":0,"cc":25,"t":16,"i":5},
			{"ch":0,"cc":25,"t":-1,"i":5},
			{"ch":0,"cc":25,"t":2,"i":24},
			{"ch":0,"cc":25,"t":2,"i":1.5},
			{"ch":0,"cc":25,"t":2,"i":5,"pg":1},
			{"ch":0,"cc":21,"t":2,"i":5,"mode":"relative-signed"},
			"nope",
			{"ch":255,"cc":30,"t":0,"i":0,"mode":"relative-offset","invert":true}
		],"unknownMember":[1,2]})");
		back = setupFromJson(d, md, errors);
		check(back.mappings.size() == 5, "lenient: the good items stay (plus the ones with a soft problem)");
		check(back.mappings[0] == map(0, 21, 2, 5) && back.mappings[1].mode == LearnMode::Absolute && !back.mappings[2].invert && back.mappings[4].mode == LearnMode::RelativeOffset && back.mappings[4].invert,
			"lenient: an unknown member is ignored, an unknown mode is absolute, a bad invert is false, a pg on a model without pages is ignored");
		bool paths = true;
		for(const char* p : {"$.mappings[1].mode", "$.mappings[2].invert", "$.mappings[3].ch", "$.mappings[4].ch", "$.mappings[5].cc", "$.mappings[6]", "$.mappings[7].t",
			"$.mappings[8]", "$.mappings[9].i", "$.mappings[11]", "$.mappings[12]"})
		{
			bool found = false;
			for(const auto& e : errors)
				found = found || e.rfind(p, 0) == 0;
			if(!found)
			{
				std::printf("    no error for %s\n", p);
				paths = false;
			}
		}
		check(paths, "lenient: each bad item says where (its JSON path)");

		// past 128
		json::Value big = json::Value::array();
		for(int n = 0; n < 140; ++n)
		{
			json::Value o = json::Value::object();
			o.set("ch", n % 16);
			o.set("cc", n % 128);
			o.set("t", n % 16);
			o.set("i", n % 24);
			big.push(std::move(o));
		}
		errors.clear();
		const auto many = mappingsFromJson(big, mdLimits(), errors);
		check(many.size() == 128 && errors.size() == 12 && errors[0].rfind("$.mappings[128]", 0) == 0, "lenient: items past 128 are left out, each said");

		// target outside the limits of the model
		errors.clear();
		auto mmBad = parse(R"([{"ch":0,"cc":1,"t":6,"pg":0,"i":0},{"ch":0,"cc":1,"t":5,"pg":8,"i":0},{"ch":0,"cc":1,"t":5,"i":0},{"ch":0,"cc":1,"t":5,"pg":7,"i":7}])");
		const auto ok = mappingsFromJson(mmBad, mmLimits(), errors);
		check(ok.size() == 1 && ok[0].at == LearnRef{5, 7, 7} && errors.size() == 3, "mm limits: track 7, page 9, a missing page are left out");

		// not a list, other documents
		errors.clear();
		check(mappingsFromJson(parse(R"({"a":1})"), mdLimits(), errors).empty() && errors.size() == 1, "not a list: none, said once");
		d = parse(R"({"schema":"md-desk/setup","version":1})");
		check(!setupHasMappings(d) && setupFromJson(d, md, errors).mappings.empty(), "a missing mappings member means none");
		d = parse(R"({"schema":"md-desk/setup","version":2,"mappings":[{"ch":0,"cc":1,"t":0,"i":0}]})");
		check(setupFromJson(d, md, errors).mappings.empty(), "a newer major version is the default setup");
	}

	// What the Machinedrum Editor 0.7.0 reads of a project's setup: the code of mdmm-v0.7.0, copied (mdDesk/mdDeskSetup.cpp
	// deskSetupFromJson, deskCore/deskMod.cpp modSetupFromJson, deskCore/deskSolo.h fromJson), trimmed only where a fixture has no
	// such member (the members of a source or a link). It looks at the schema, the version and the members it knows; anything
	// else is not read. Any error it finds makes the default setup in 0.7.0, so a document is readable when it has none.
	struct Read070
	{
		bool ok = false;
		std::vector<int> knobs;
		size_t sources = 0;
		std::vector<int> soloTracks;
	};

	// deskMod.cpp:47 (0.7.0), the top of modSetupFromJson; the sources and links of the fixtures are empty
	bool modSetup070(const json::Value& _doc, const char* _schema, size_t& _sources, std::vector<std::string>& _errors)
	{
		const auto before = _errors.size();
		const auto* schema = _doc.find("schema");
		if(!schema || !schema->isString() || schema->asString() != _schema)
			_errors.emplace_back(std::string("$.schema: expected ") + _schema);
		const auto* version = _doc.find("version");
		if(!version || !version->isNumber() || version->asNumber() != 1)
			_errors.emplace_back("$.version: expected 1");
		if(const auto* sources = _doc.find("sources"); sources && sources->isArray())
			_sources = sources->asArray().size();
		if(const auto* links = _doc.find("links"); links && links->isArray() && !links->asArray().empty())
			_errors.emplace_back("(fixture) links are not part of this copy");
		return _errors.size() == before;
	}

	// deskSolo.h (0.7.0) listFrom + fromJson
	std::optional<std::vector<int>> soloTracks070(const json::Value& _solo, const int _count, std::vector<std::string>& _errors)
	{
		if(!_solo.isObject())
		{
			_errors.push_back("$.solo: expected an object");
			return {};
		}
		const auto* t = _solo.find("tracks");
		std::vector<int> out;
		if(t && t->isArray())
			for(const auto& v : t->asArray())
			{
				const int n = v.isNumber() ? static_cast<int>(v.asNumber()) : -1;
				if(n < 0 || n >= _count)
				{
					_errors.push_back("$.solo.tracks: expected tracks 0 to " + std::to_string(_count - 1));
					return {};
				}
				out.push_back(n);
			}
		return out;
	}

	Read070 read070Md(const json::Value& _doc)
	{
		Read070 r;
		std::vector<std::string> errors;
		const auto* schema = _doc.find("schema");
		if(!schema || !schema->isString() || schema->asString() != "md-desk/setup")
			errors.emplace_back("$.schema: expected md-desk/setup");
		const auto* version = _doc.find("version");
		if(!version || !version->isNumber() || version->asNumber() != 1)
			errors.emplace_back("$.version: expected 1");
		if(const auto* m = _doc.find("modulators"))
			modSetup070(*m, "md-desk/modulators", r.sources, errors);
		if(const auto* k = _doc.find("knobCcs"))
		{
			std::vector<int> ccs;
			if(k->isArray())
				for(const auto& v : k->asArray())
					ccs.push_back(v.isNumber() ? static_cast<int>(v.asNumber()) : -1);
			const auto bad = validateKnobCcs(ccs);
			errors.insert(errors.end(), bad.begin(), bad.end());
			r.knobs = ccs;
		}
		if(const auto* sl = _doc.find("solo"))
			if(const auto solo = soloTracks070(*sl, 16, errors))
				r.soloTracks = *solo;
		r.ok = errors.empty();
		return r;
	}

	// mmDesk::Desk::loadSetup (0.7.0): the bare modulators document and the solo beside it
	Read070 read070Mm(const json::Value& _doc)
	{
		Read070 r;
		std::vector<std::string> errors;
		modSetup070(_doc, "mm-desk/modulators", r.sources, errors);
		if(const auto* sl = _doc.find("solo"))
			if(const auto solo = soloTracks070(*sl, 12, errors))
				r.soloTracks = *solo;
		r.ok = errors.empty();
		return r;
	}

	// All knob rows at once, from the original list: a swap and a rotation keep every mapping
	void knobRows()
	{
		const std::vector<LearnMapping> l{map(g_learnAnyChannel, 21, 0, 1), map(g_learnAnyChannel, 22, 1, 2), map(g_learnAnyChannel, 23, 2, 3), map(5, 21, 3, 4)};
		auto r = moveKnobCcs(l, {21, 22}, {22, 21});
		check(r.size() == 4 && r[0].cc == 22 && r[1].cc == 21 && r[2].cc == 23 && r[3].cc == 21 && r[3].ch == 5, "knob rows swapped: each mapping follows its own row, the channel-specific one stays");
		r = moveKnobCcs(l, {21, 22, 23}, {22, 23, 21});
		check(r.size() == 4 && r[0].cc == 22 && r[1].cc == 23 && r[2].cc == 21, "knob rows rotated: three mappings, none merged");
		r = moveKnobCcs(l, {21}, {22});
		check(r.size() == 4 && r[0].cc == 22 && r[1].cc == 22 && r[0].at != r[1].at, "one row moved onto a CC another row still has (other targets): both stay");
		r = moveKnobCcs({map(g_learnAnyChannel, 21, 0, 1), map(g_learnAnyChannel, 22, 0, 1)}, {21}, {22});
		check(r.size() == 1 && r[0].cc == 22, "and the same target on the same CC is one mapping");
		check(moveKnobCcs(l, {21}, {21}) == l, "no change");
		// the member stays once the project has had mappings
		SetupSpec md;
		md.learn = {16, 0, 25};
		DeskSetup s;
		check(setupToJson(s, md).find("mappings") == nullptr, "no mappings ever: no member");
		s.mappingsKept = true;
		std::vector<std::string> errors;
		const auto doc = setupToJson(s, md);
		check(doc.find("mappings") && doc.find("mappings")->asArray().empty() && setupHasMappings(doc) && setupFromJson(doc, md, errors).mappingsKept,
			"a project that had mappings writes mappings: [] when the list is empty (an alpha MDLN is not imported again)");
	}

	// 0.8 compatibility (the 1.0 read promise: additions are new members, never a version bump): a setup written with
	// mappings is read by the 0.7.0 reader without a complaint, and gives it exactly what it gave without them. The
	// fixtures are the documents the new codec writes now.
	void older()
	{
		SetupSpec md;
		md.learn = {16, 0, 25};
		SetupSpec mm;
		mm.schema = "mm-desk/setup";
		mm.tracks = 12;
		mm.knobCcs = false;
		mm.writesBare = true;
		mm.learn = {6, 8, 8};
		mm.modulators = ModLimits{"mm-desk/modulators", 5, 63};

		DeskSetup s;
		s.knobCcs = {30, 31, 32, 33, 34, 35, 36, 37};
		s.solo.tracks = {2, 5};
		s.mappings = {map(0, 21, 2, 5), map(g_learnAnyChannel, 22, 0, 24, LearnMode::RelativeSigned, true)};
		auto doc = setupToJson(s, md);
		const std::string fixtureMd = elektronData::json::write(doc);
		check(fixtureMd.find("\"mappings\":[{\"ch\":0,\"cc\":21,\"t\":2,\"i\":5,\"mode\":\"absolute\",\"invert\":false},{\"ch\":255,\"cc\":22,\"t\":0,\"i\":24,\"mode\":\"relative-signed\",\"invert\":true}]") != std::string::npos,
			"fixture: the Machinedrum's setup with mappings, as the codec writes it");
		auto read = read070Md(parse(fixtureMd.c_str()));
		DeskSetup plain = s;
		plain.mappings.clear();
		const auto without = read070Md(setupToJson(plain, md));
		check(read.ok && without.ok && read.knobs == without.knobs && read.soloTracks == without.soloTracks && read.sources == without.sources
			&& read.knobs == std::vector<int>{30, 31, 32, 33, 34, 35, 36, 37} && read.soloTracks == std::vector<int>{2, 5},
			"0.7.0's reader takes a setup with mappings without error and reads what it read before (the unknown member is ignored)");

		DeskSetup m;
		m.solo.tracks = {1, 4};
		m.mappings = {map(3, 60, 1, 4, LearnMode::Absolute, false, 1)};
		const std::string fixtureMm = elektronData::json::write(setupToJson(m, mm));
		check(fixtureMm.find("\"schema\":\"mm-desk/modulators\"") != std::string::npos && fixtureMm.find("\"mappings\":[{\"ch\":3,\"cc\":60,\"t\":1,\"pg\":1,\"i\":4,") != std::string::npos,
			"fixture: the Monomachine's setup with mappings, in the 0.x shape");
		const auto mmRead = read070Mm(parse(fixtureMm.c_str()));
		check(mmRead.ok && mmRead.soloTracks == std::vector<int>{1, 4}, "0.7.0's Monomachine reader takes it too, solo intact");
		// and this version reads the 0.7.0 documents (no mappings member): none
		std::vector<std::string> errors;
		check(setupFromJson(setupToJson(plain, md), md, errors).mappings.empty() && errors.empty(), "a setup without mappings (0.7.0 wrote these) reads as none");
	}

	void mdln()
	{
		const LearnModelLookup model = [](const std::string& _n) -> std::optional<LearnRef>
		{
			if(_n == "Decay")
				return LearnRef{-1, -1, 5};
			if(_n == "Pitch")
				return LearnRef{-1, -1, 0};
			return std::nullopt;
		};
		const auto preset = parse(R"({"name":"x","version":1,"mappings":[
			{"type":"ControlChange","mode":"Absolute","channel":0,"part":2,"controller":21,"nrpn":0,"paramName":"Decay","feedbackTargets":0,"invert":false},
			{"type":"ControlChange","mode":"RelativeSigned","channel":255,"part":0,"controller":22,"paramName":"Pitch","invert":true},
			{"type":"ControlChange","mode":"Relative","channel":1,"part":3,"controller":23,"paramName":"Pitch"},
			{"type":"ControlChange","mode":"Absolute","channel":0,"part":255,"controller":24,"paramName":"Decay"},
			{"type":"ControlChange","mode":"Absolute","channel":0,"part":1,"controller":25,"paramName":"Nope"},
			{"type":"PitchBend","mode":"Absolute","channel":0,"part":1,"controller":0,"paramName":"Pitch"},
			{"type":"ControlChange","channel":0,"part":40,"controller":26,"paramName":"Pitch"},
			{"type":"ControlChange","channel":0,"part":2,"controller":21,"paramName":"Decay"},
			{"type":"ControlChange","channel":99,"part":2,"controller":27,"paramName":"Decay"}
		]})");
		const auto r = importMdln(preset, model, mdLimits());
		check(r.mappings.size() == 3, "MDLN: the CC mappings with a known name and a track part come over");
		check(r.mappings[0] == map(0, 21, 2, 5) && r.mappings[1] == map(g_learnAnyChannel, 22, 0, 0, LearnMode::RelativeSigned, true)
			&& r.mappings[2] == map(1, 23, 3, 0, LearnMode::RelativeSigned), "MDLN: channel, CC, track, parameter, mode (the old \"Relative\" is signed) and invert");
		check(r.left.size() == 6, "MDLN: the automatic part, the unknown name, the pitch bend, the part off the model, the repeat and the bad channel are left out, each said");
		check(importMdln(parse(R"({"version":1})"), model, mdLimits()).mappings.empty() && importMdln(parse("[1]"), model, mdLimits()).left.size() == 1, "MDLN: no mappings member: nothing, said");

		// the MM: the model lookup also gives the page
		const LearnModelLookup mmModel = [](const std::string& _n) -> std::optional<LearnRef>
		{
			if(_n == "FltFreq")
				return LearnRef{-1, 1, 3};
			return std::nullopt;
		};
		const auto m = importMdln(parse(R"({"version":1,"mappings":[{"type":"ControlChange","channel":0,"part":4,"controller":74,"paramName":"FltFreq"}]})"), mmModel, mmLimits());
		check(m.mappings.size() == 1 && m.mappings[0].at == LearnRef{4, 1, 3}, "MDLN: a model with pages gives the page");
	}

	// B-169: a mapping can drive a global target ({"g": id}); a project saved by a 0.8 beta (track mappings only) still loads.
	void globals()
	{
		const LearnLimits md{16, 0, 25, 35};
		const LearnLimits mm{6, 8, 8, 9};
		LearnMapping g;
		g.ch = 2;
		g.cc = 70;
		g.at = LearnRef::global(33);
		g.mode = LearnMode::RelativeOffset;
		check(g.at.isGlobal() && inLimits(g.at, md) && !inLimits(LearnRef::global(35), md) && !inLimits(LearnRef::global(-1), md)
			&& inLimits(g.at, LearnLimits{16, 0, 25, 40}) && !inLimits(g.at, LearnLimits{16, 0, 25}), "a global target is inside the limits that name it, by id");
		check(inLimits(LearnRef::global(8), mm) && !inLimits(LearnRef::global(9), mm), "the Monomachine's global ids are bounded the same way");

		auto r = addMapping({}, g);
		check(r.ok() && r.list.size() == 1, "add: a global mapping");
		r = addMapping(r.list, g);
		check(!r.ok() && r.refusal == "already mapped", "add: the same CC to the same global is one mapping");
		auto other = g;
		other.at = LearnRef::global(34);
		r = addMapping(r.list, other);
		check(r.ok() && r.list.size() == 2, "add: a second global on the same CC is its second target");

		const auto doc = mappingsToJson(r.list, false);
		const std::string text = json::write(doc);
		check(text.find("{\"ch\":2,\"cc\":70,\"g\":33,\"mode\":\"relative-offset\",\"invert\":false}") != std::string::npos
			&& text.find("\"t\":255") == std::string::npos, "a global writes {ch, cc, g, mode, invert}, no track");
		std::vector<std::string> errors;
		auto back = mappingsFromJson(parse(text.c_str()), md, errors);
		check(errors.empty() && back == r.list, "a global mapping round-trips");
		const auto backMm = mappingsToJson(r.list, true);
		check(json::write(backMm).find("\"pg\"") == std::string::npos, "the Monomachine's writer leaves pg out of a global as well");
		errors.clear();
		back = mappingsFromJson(backMm, mm, errors);
		check(errors.empty() && back == r.list, "a global mapping round-trips in the Monomachine's shape too");

		errors.clear();
		const auto bad = mappingsFromJson(parse(R"([{"ch":0,"cc":1,"g":35},{"ch":0,"cc":2,"g":-1},{"ch":0,"cc":3,"g":"x"},{"ch":0,"cc":4,"g":3}])"), md, errors);
		check(bad.size() == 1 && bad[0].cc == 4 && bad[0].at.isGlobal() && errors.size() == 3, "a global past the model's list, a negative or a non-number is left out alone");

		// a 0.8 beta's project: track mappings only, the same list with the global-aware limits
		errors.clear();
		const auto beta = mappingsFromJson(parse(R"([{"ch":0,"cc":21,"t":2,"i":5,"mode":"absolute","invert":false},{"ch":255,"cc":22,"t":0,"i":24,"mode":"relative-signed","invert":true}])"), md, errors);
		check(errors.empty() && beta.size() == 2 && !beta[0].at.isGlobal() && beta[0].at == LearnRef{2, -1, 5} && beta[1].invert && beta[1].mode == LearnMode::RelativeSigned,
			"a 0.8 beta's track-only mappings load unchanged");
		errors.clear();
		const auto betaMm = mappingsFromJson(parse(R"([{"ch":3,"cc":60,"t":1,"pg":1,"i":4,"mode":"absolute","invert":false}])"), mm, errors);
		check(errors.empty() && betaMm.size() == 1 && betaMm[0].at == LearnRef{1, 1, 4}, "a 0.8 beta's Monomachine mappings load unchanged");

		// a newer project's global read by a model without globals (an older build): left out, the rest kept
		errors.clear();
		const auto old = mappingsFromJson(parse(R"([{"ch":0,"cc":1,"g":3},{"ch":0,"cc":2,"t":1,"i":1}])"), LearnLimits{16, 0, 25}, errors);
		check(old.size() == 1 && old[0].cc == 2 && errors.size() == 1, "a model without globals leaves a global mapping out and keeps the track ones");

		// the setup document carries them
		SetupSpec spec;
		spec.learn = md;
		DeskSetup s;
		s.knobCcs = {30, 31, 32, 33, 34, 35, 36, 37};
		s.mappings = {g, map(0, 21, 2, 5)};
		errors.clear();
		const auto s2 = setupFromJson(setupToJson(s, spec), spec, errors);
		check(errors.empty() && s2.mappings == s.mappings, "the setup keeps global mappings with the project");
	}

}

int main()
{
	globals();
	edits();
	learning();
	overrides();
	codec();
	mdln();
	older();
	knobRows();
	std::printf("deskLearnTest: %s (%d failures)\n", g_failures ? "FAIL" : "PASS", g_failures);
	return g_failures ? 1 : 0;
}
