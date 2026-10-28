// Pure unit tests for the Monomachine codec (no firmware): the wire encoding
// rules, note entries, lock row order, routing, and the JSON contract's errors.

#include "mmCommands.h"
#include "mmDump.h"
#include "mmGlobal.h"
#include "mmJson.h"
#include "mmKit.h"
#include "mmMachines.h"
#include "mmPattern.h"
#include "mmSong.h"
#include "mmValidate.h"
#include "mmWave.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>

namespace
{
	namespace ed = elektronData;
	int g_failures = 0;

	void check(const bool _ok, const char* _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what);
		if(!_ok)
			++g_failures;
	}

	bool hasError(const std::vector<std::string>& _errors, const std::string& _part)
	{
		for(const auto& e : _errors)
			if(e.find(_part) != std::string::npos)
				return true;
		return false;
	}

	ed::MmPattern emptyPattern()
	{
		ed::MmPattern p;
		for(auto& t : p.notes) t.fill(ed::MmPattern::g_noNote);
		for(auto& r : p.lockRows) r.fill(ed::MmPattern::g_noLock);
		p.midiNotes.fill(0xffff);
		p.chordNotes.fill(0xffff);
		for(size_t t = 0; t < 6; ++t)
		{
			p.swing[t] = p.midiSwing[t] = 0xaaaaaaaaaaaaaaaaull;
			for(auto* a : {&p.arp, &p.midiArp})
			{
				a->speed[t] = 5;
				a->length[t] = 8;
				a->steps[t].fill(0x40);
			}
			p.arp.trigs[t] = 7;
		}
		return p;
	}

	void wire()
	{
		std::puts("wire encoding");
		const std::vector<uint8_t> raw{1, 1, 2, 0x90, 3, 3, 3};
		const auto rle = ed::mmRunLengthEncode(raw);
		check((rle == std::vector<uint8_t>{0x82, 1, 2, 0x81, 0x90, 0x83, 3}), "runs of 2+ and single high bytes become (0x80|n, v)");
		check(ed::mmRunLengthDecode(rle) == raw, "run-length decode inverts it");
		std::vector<uint8_t> long_(300, 7);
		const auto longRle = ed::mmRunLengthEncode(long_);
		check((longRle == std::vector<uint8_t>{0xff, 7, 0xff, 7, 0xae, 7}), "a 300-byte run splits at 127");
		const ed::MmDump d{ed::g_mmKitDump, 2, 1, 5, raw};
		const auto m = ed::packMmDump(d);
		check(ed::unpackMmDump(m) == d, "pack -> unpack is lossless");
		// 7 stream bytes: one full 7-bit group, then the empty group's 0x00.
		check(m.size() == 10 + 8 + 1 + 5 && m[18] == 0, "a stream of a multiple of 7 bytes ends with an empty group byte");
		auto bad = m;
		bad[12] ^= 1;
		check(!ed::unpackMmDump(bad), "a bad checksum is refused");
		check((ed::mmRequest(0x68, 3) == std::vector<uint8_t>{0xf0, 0, 0x20, 0x3c, 3, 0, 0x68, 3, 0xf7}), "requests use product id 3");
	}

	void entries()
	{
		std::puts("note entries and locks");
		const ed::MmNoteEntry e{1, 1, 60};
		check(ed::mmNoteEntryWord(e) == 0x7841, "note 60, track 2, step 2 is 0x7841 (firmware lab: 78 41)");
		check(ed::mmNoteEntry(0x8602) == (ed::MmNoteEntry{0, 2, 67}), "0x8602 is note 67 on track 1 step 3");
		auto p = emptyPattern();
		p.lockMasks[1][0] = 0x01;		// T2 SYN1
		p.lockMasks[0][0] = 0x04;		// T1 SYN3
		p.lockMasks[0][7] = 0x02;		// T1 MIDI VEL
		p.lockRowCount = 3;
		const auto params = ed::mmLockParams(p);
		check(params.size() == 3 && params[0] == (ed::MmLockParam{0, 0, 2}) && params[1] == (ed::MmLockParam{0, 7, 1})
			&& params[2] == (ed::MmLockParam{1, 0, 0}), "rows follow (track, page, parameter) order");
		check(ed::mmLockRow(p, {1, 0, 0}) == 2, "a parameter's row is its place in that order");
		check(ed::validate(p).empty(), "a consistent pattern validates");
		p.lockRowCount = 2;
		check(!ed::validate(p).empty(), "a row count that does not match the masks is refused");
		p.lockRowCount = 3;
		check(ed::mmPatternFromRaw(ed::mmPatternRaw(p), 7).has_value(), "raw <-> value");
		check(ed::mmPatternRaw(p).size() == ed::MmPattern::g_rawSize, "the raw pattern is 6,520 bytes");
		check(ed::mmPatternRaw(p)[0x274] == 0x04 && ed::mmPatternRaw(p)[0x27b] == 0x02 && ed::mmPatternRaw(p)[0x27c] == 0x01,
			"lock masks sit at 0x274, 8 bytes per track");
	}

	void json()
	{
		std::puts("JSON contract");
		auto p = emptyPattern();
		p.position = 18;
		p.pitch[0] = p.amp[0] = p.filter[0] = p.lfo[0] = 1;
		p.notes[0][0] = 48;
		p.lockMasks[0][1] = 1;
		p.lockRowCount = 1;
		p.lockRows[0][0] = 99;
		p.midiTrig[2] = p.midiNote[2] = 1ull << 4;
		p.midiNotes[0] = ed::mmNoteEntryWord({2, 4, 64});
		p.midiNoteCount = 1;
		const auto doc = ed::mmPatternToJson(p);
		check(doc.find("name") && doc.find("name")->asString() == "B03", "slot 18 is B03");
		std::vector<std::string> errors;
		const auto back = ed::mmPatternFromJson(doc, errors);
		check(back && *back == p, "pattern -> JSON -> pattern");

		auto text = ed::json::write(doc);
		auto swap = [&](const std::string& _from, const std::string& _to) {
			auto t = text;
			t.replace(t.find(_from), _from.size(), _to);
			errors.clear();
			return ed::mmPatternFromJson(*ed::json::parse(t), errors);
		};
		check(!swap("\"length\":16", "\"length\":90") && hasError(errors, "length"), "length 90 is refused with its path");
		check(!swap("\"schema\":\"mm-desk/pattern\"", "\"schema\":\"md-desk/pattern\"") && hasError(errors, "schema"), "an MD document is refused");
		check(!swap("[[2,4,64]]", "[[6,4,64]]") && hasError(errors, "track"), "a MIDI note on track 7 is refused");

		// 63 locks do not fit.
		auto full = emptyPattern();
		int n = 0;
		for(size_t t = 0; t < 6 && n < 62; ++t)
			for(size_t pg = 0; pg < 8 && n < 62; ++pg)
				for(size_t i = 0; i < 8 && n < 62; ++i, ++n)
					full.lockMasks[t][pg] |= static_cast<uint8_t>(1u << i);
		full.lockRowCount = 62;
		check(ed::validate(full).empty(), "62 locked parameters validate");
		full.lockMasks[5][7] |= 0x80;
		check(!ed::validate(full).empty(), "a 63rd locked parameter is refused");

		// 0.3.5: what OS 1.32B takes from a 2008 backup: RNGE 8 (the knob's end), a note on a step without its trig
		auto old = emptyPattern();
		old.arp.range[3] = 8;
		old.notes[1][4] = 60;
		check(ed::validate(old).empty(), "arpeggiator range 8 and a note without its trig validate");
		errors.clear();
		const auto oldBack = ed::mmPatternFromJson(ed::mmPatternToJson(old), errors);
		check(oldBack && *oldBack == old, "and go through JSON");
		old.arp.range[3] = 9;
		check(!ed::validate(old).empty(), "arpeggiator range 9 is refused");

		ed::MmKit k;
		for(auto& m : k.machines) m = 1;
		k.trigPos.fill(ed::MmKit::g_noTrigPos);
		ed::mmSetKitOutputs(k, 3, 2);
		ed::mmSetKitInput(k, 3, 1);
		ed::mmSetKitOutputs(k, 4, 5);
		ed::mmSetKitInput(k, 4, 6);
		errors.clear();
		const auto kitBack = ed::mmKitFromJson(ed::mmKitToJson(k), errors);
		check(kitBack && *kitBack == k, "kit -> JSON -> kit");
		// as the firmware's 0x5C stores them (mmEditorProbeFirmwareTest inputs): INP A on T4 is 0x52, BUS EF on T5 0x0d
		// with bus 3 in the bus word's bits 8-9
		check(k.routing[3] == 0x52 && ed::mmRoutingOutputs(k.routing[3]) == 2 && ed::mmKitInput(k, 3) == 1, "INP A: routing 0x52");
		check(k.routing[4] == 0x0d && k.x1cd[1] == 0x03 && k.x1cd[2] == 0x00 && ed::mmKitInput(k, 4) == 6, "BUS EF: routing 0x0d, bus 3 for T5");
		ed::mmSetKitInput(k, 4, 0);
		check(k.routing[4] == 0x15 && k.x1cd[1] == 0 && ed::mmKitInput(k, 4) == 0, "NEIGHBOR: routing 0x15, the bus cleared");
		check(!ed::mmKitInput(k, 0) && ed::mmKitToJson(k).find("tracks")->asArray()[0].find("input")->isNull(), "no input chosen: null");
		ed::mmSetKitInput(k, 4, 5);
		ed::mmSetKitInput(k, 4, std::nullopt);
		check(k.routing[4] == 0x05 && k.x1cd[1] == 0x02 && !ed::mmKitInput(k, 4), "none: the input bits go, the bus word stays (as 0x5C on a synth machine)");
		errors.clear();
		const auto stale = ed::mmKitFromJson(ed::mmKitToJson(k), errors);
		check(stale && *stale == k, "and goes through JSON as it is");
		k.machines[0] = 42;
		check(!ed::validate(k).empty(), "an unknown machine is refused");

		ed::MmSong s;
		s.rows[0].bytes[0] = 5;
		s.rows[0].bytes[ed::mmSongRow::g_length] = 64;
		s.rows[0].bytes[22] = s.rows[0].bytes[23] = 0xff;
		s.rows[1].bytes[0] = ed::MmSong::g_loop;
		s.rows[1].bytes[ed::mmSongRow::g_target] = 0;
		s.rows[2].bytes[0] = ed::MmSong::g_end;
		const auto sdoc = ed::mmSongToJson(s);
		const auto& rows = sdoc.find("rows")->asArray();
		check(rows.size() == 3 && rows[1].find("kind")->asString() == "loop" && rows[2].find("kind")->asString() == "end",
			"song rows up to END, with loop kinds");
		errors.clear();
		const auto songBack = ed::mmSongFromJson(sdoc, errors);
		check(songBack && *songBack == s, "song -> JSON -> song");

		ed::MmGlobal g;
		errors.clear();
		const auto gBack = ed::mmGlobalFromJson(ed::mmGlobalToJson(g), errors);
		check(gBack && *gBack == g, "global -> JSON -> global");
		g.channelSpan = 0;	// a 2008 backup's, kept by OS 1.32B
		check(ed::validate(g).empty(), "CHANNEL SPAN 0 validates");
	}

	// Release review 2026-10-04 S1 and S9: hidden runs and lock rows stay inside their buffers.
	void bounds()
	{
		std::puts("bounds");
		ed::MmSong s;
		s.rows[0].bytes[0] = ed::MmSong::g_end;
		const auto doc = ed::mmSongToJson(s);
		std::vector<std::string> errors;
		check(ed::mmSongFromJson(doc, errors).has_value(), "a song document reads");
		const auto withRuns = [&](const char* _runs)
		{
			auto d = doc;
			d.find("firmware")->put("rowsAfterEnd", *ed::json::parse(_runs));	// v2: the hidden fields sit in "firmware"
			errors.clear();
			return ed::mmSongFromJson(d, errors);
		};
		check(!withRuns("[[-8,\"0000000000000000\"]]") && hasError(errors, "rowsAfterEnd"), "a negative run index is refused");
		check(!withRuns("[[1e300,\"00\"]]") && hasError(errors, "rowsAfterEnd"), "a huge run index is refused");
		check(!withRuns("[[0.5,\"00\"]]") && hasError(errors, "rowsAfterEnd"), "a fractional run index is refused");
		const auto tail = (ed::MmSong::g_rows - 1) * 24;
		check(!withRuns(("[[" + std::to_string(tail - 1) + ",\"0000\"]]").c_str()) && hasError(errors, "past the region"),
			"a run that ends past the region is refused");
		const auto last = withRuns(("[[" + std::to_string(tail - 1) + ",\"05\"]]").c_str());
		check(last && last->rows[ed::MmSong::g_rows - 1].bytes[23] == 5, "a run that ends at the region's end is written");

		auto p = emptyPattern();
		for(auto& t : p.lockMasks)
			t.fill(0xff);
		p.lockRowCount = 62;
		check(ed::mmLockRow(p, {0, 7, 5}) == 61, "the 62nd locked parameter has the last row");
		check(ed::mmLockRow(p, {0, 7, 6}) == -1 && ed::mmLockRow(p, {5, 7, 7}) == -1, "parameters past row 61 have no row");
	}

	void machines()
	{
		std::puts("machines and commands");
		check(ed::mmMachines().size() == 22, "22 machines in OS 1.32B");
		check(ed::mmParamName(4, 0, 4) == "SUBX" && ed::mmParamName(4, 0, 3).empty(), "SWAVE-SAW's slot 5 is SUBX, slot 4 unused (firmware screen)");
		check(ed::mmParamName(2, 0, 1) == "RED", "GND-NOIS: ST RED STON (firmware screen, not the manual's order)");
		check(ed::mmParamName(0, 7, 0) == "LEN", "the MIDI page starts with LEN");
		check(ed::mmParamCc(2, 1) == 73 && ed::mmParamCc(6, 7) == 119, "CC map: FILTER 72-79, LFO3 112-119");
		check((ed::mmSetTempo(120.0) == std::vector<uint8_t>{0xf0, 0, 0x20, 0x3c, 3, 0, 0x61, 0x16, 0x40, 0xf7}), "tempo 120 = 2880");
	}

	// 0.9 wave 2: the DigiPRO waveform dump (doc/release/0.9/mm-digipro.md 2) and a waveform from audio
	void waves()
	{
		std::puts("DigiPRO waveforms");
		std::vector<float> saw(600);
		for(size_t i = 0; i < saw.size(); ++i)
			saw[i] = static_cast<float>(2.0 * static_cast<double>(i) / static_cast<double>(saw.size()) - 1.0);
		std::string why;
		const auto w = ed::mmWaveFromCycle(saw, 9, "saw1", why);
		check(w.has_value() && why.empty(), "a saw cycle of 600 frames makes a waveform");
		if(!w)
			return;
		check(w->data.size() == ed::g_mmWaveDataSize && w->position == 9 && w->version == 1 && w->revision == 1, "6132 bytes, position 9, 1.1");
		check(ed::mmWaveName(*w) == "SAW1", "the name in upper case");
		const auto dump = ed::encodeMmWave(*w);
		check(dump.size() == ed::g_mmWaveDumpSize && dump[6] == 0x5d && dump[9] == 9 && dump[10] == 'S' && dump.back() == 0xf7,
			"the dump: 7027 bytes, 0x5D, the position in byte 9, the name from byte 10");
		const auto back = ed::decodeMmWave(dump);
		check(back && *back == *w, "decode gives the waveform back");
		check(back && ed::encodeMmWave(*back) == dump, "and encodes to the same bytes");
		const size_t n = dump.size();
		check(((static_cast<size_t>(dump[n - 3]) << 7) | dump[n - 2]) == n - 10, "the length is size - 10");
		auto broken = dump;
		broken[2000] ^= 0x01;
		check(!ed::decodeMmWave(broken), "a changed data byte breaks the sum: refused");
		auto high = dump;
		high[3000] |= 0x80;
		check(!ed::decodeMmWave(high), "a data byte above 7F is refused");
		check(!ed::decodeMmWave(std::vector<uint8_t>(dump.begin(), dump.end() - 1)), "a short dump is refused");
		const auto placed = ed::mmWavePlaced(dump, 63);
		const auto moved = ed::decodeMmWave(placed);
		check(moved && moved->position == 63 && moved->data == w->data && std::equal(dump.begin() + 10, dump.end(), placed.begin() + 10),
			"placed at W64: only byte 9 changes, the sum stays valid (it starts at byte 10)");

		const auto l0 = ed::mmWaveLevel(*w, 0);
		double peak = 0;
		for(const auto x : l0)
			peak = std::max(peak, std::abs(x));
		check(l0.size() == 1024 && std::abs(peak - std::pow(10.0, -0.1 / 20.0)) < 1e-4, "level 0: 1024 points, the peak at full scale less 0.1 dB");
		double mean = 0;
		for(const auto x : l0)
			mean += x;
		check(std::abs(mean / 1024.0) < 1e-4, "no DC");
		const auto l8 = ed::mmWaveLevel(*w, 8);
		check(l8.size() == 4 && std::abs(l8[0] + l8[2]) < 1e-5 && std::abs(l8[1] + l8[3]) < 1e-5, "level 8: 4 points, the fundamental only");
		const auto l1 = ed::mmWaveLevel(*w, 1);
		double nyquist = 0;
		for(size_t i = 0; i < l1.size(); ++i)
			nyquist += (i & 1 ? -1.0 : 1.0) * l1[i];
		check(l1.size() == 512 && std::abs(nyquist / 512.0) < 1e-4, "level 1: 512 points, nothing at its half");
		check(ed::mmWaveLevel(*w, 9).empty(), "there is no level 9");
		check(ed::mmWavePoints(*w, 128).size() == 128, "128 points for a drawing");

		check(ed::mmWaveNameProblem("ab-1").empty() && !ed::mmWaveNameProblem("ABCDE").empty() && !ed::mmWaveNameProblem("A*").empty(),
			"names: four of A-Z 0-9 space - + . / #, lower case raised");
		auto renamed = *w;
		ed::setMmWaveName(renamed, "ab");
		check(ed::mmWaveName(renamed) == "AB" && renamed.name[2] == ' ' && renamed.name[3] == ' ', "a short name is padded with spaces");
		ed::MmWave zero = *w;
		zero.name = {};
		check(ed::mmWaveName(zero).empty(), "a name of zeros shows as none");

		check(!ed::mmWaveFromCycle(std::vector<float>(4, 0.5f), 0, "", why) && !why.empty(), "4 frames are too short");
		check(!ed::mmWaveFromCycle(std::vector<float>(ed::g_mmWaveMaxFrames + 1, 0.f), 0, "", why), "more than 65536 frames are refused");
		check(!ed::mmWaveFromCycle(std::vector<float>(512, 0.25f), 0, "", why), "DC alone is silent: refused");
		check(!ed::mmWaveFromCycle(saw, 0, "TOOLONG", why), "a bad name is refused");
	}
}

int main()
{
	wire();
	entries();
	json();
	bounds();
	machines();
	waves();
	std::printf("%s (%d failures)\n", g_failures ? "FAIL" : "PASS", g_failures);
	return g_failures ? 1 : 0;
}
