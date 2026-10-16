// WP1 of doc/release/PLAN-0.8.md: host notes through the firmware's own MIDI input, at the sample offsets the
// plug-in gives them (md::Hardware::scheduleMidi, the path of Device::sendMidi).
//
//   mdHostNotesFirmwareTest md    needs GEARMULATOR_MD_FIRMWARE_BIN
//   mdHostNotesFirmwareTest mm    needs GEARMULATOR_MM_FIRMWARE_BIN
//
// MD (D2): (a) every note of the factory key map sounds its track, (b) a note on a channel outside the base
// channels sounds nothing, (c) after a key map edit the new note sounds and the old one does not, (d) with GRID
// RECORD on a host note leaves the pattern as it was.
// MM (B-011): (e) six notes at one sample offset on six channels, all six voices sound.
// Exits 77 (skip) without the ROM, 1 when a case fails.

#include "mdFirmwareSession.h"

#include "elektronData/factoryGlobals.h"
#include "elektronData/mdCommands.h"
#include "elektronData/mdGlobal.h"
#include "elektronData/mdPattern.h"

#include "mdLib/mdpanel.h"
#include "mdLib/mdromloader.h"

#include "baseLib/filesystem.h"

#include <array>
#include <cmath>
#include <cstdlib>
#include <cstdio>
#include <string_view>

using namespace mdFirmwareSession;
namespace ed = elektronData;

namespace
{
	int g_failures = 0;

	void check(const bool _condition, const std::string& _what)
	{
		std::printf("  %s %s\n", _condition ? "ok  " : "FAIL", _what.c_str());
		if(!_condition)
			++g_failures;
	}

	using Energy = std::array<double, 6>;

	// What the six outputs carried during a stretch of machine time (mean square per output), and the left main
	// output's samples for pitch analysis.
	struct Listen
	{
		Energy sq{};
		std::vector<float> left;
		uint64_t frames = 0;

		double rms() const
		{
			double sum = 0;
			for(const auto e : sq)
				sum += e;
			return frames ? std::sqrt(sum / double(frames)) : 0.0;
		}
		Energy perOutput() const
		{
			Energy e{};
			for(size_t i = 0; i < e.size(); ++i)
				e[i] = frames ? std::sqrt(sq[i] / double(frames)) : 0.0;
			return e;
		}
	};

	Listen listen(Machine& _m, const double _ms)
	{
		Listen l;
		_m.onBlock = [&]
		{
			const auto& out = _m.blockOutputs();
			for(size_t c = 0; c < out.size(); ++c)
				for(const auto s : out[c])
					l.sq[c] += double(s) * s;
			l.left.insert(l.left.end(), out[0].begin(), out[0].end());
			l.frames += out[0].size();
		};
		_m.run(_ms);
		_m.onBlock = nullptr;
		return l;
	}

	// Wait until the outputs are quiet (voices decayed), at most _maxMs.
	void settle(Machine& _m, const double _maxMs = 8000)
	{
		for(double waited = 0; waited < _maxMs; waited += 100)
			if(listen(_m, 100).rms() < 2e-6)
				return;
	}

	void scheduleNote(Machine& _m, const bool _on, const uint8_t _channel, const uint8_t _note, const uint8_t _velocity,
		const uint32_t _offset)
	{
		synthLib::SMidiEvent e(synthLib::MidiEventSource::Host, static_cast<uint8_t>((_on ? 0x90 : 0x80) | _channel),
			_note, _on ? _velocity : uint8_t(0), _offset);
		require(_m.hardware().scheduleMidi(e, 0), "scheduleMidi rejected a note");
	}

	// A note held for _holdMs, listened to for _ms from the note-on.
	Listen playNote(Machine& _m, const uint8_t _channel, const uint8_t _note, const uint32_t _offset = 17,
		const double _ms = 350, const uint8_t _velocity = 127)
	{
		scheduleNote(_m, true, _channel, _note, _velocity, _offset);
		auto l = listen(_m, _ms);
		scheduleNote(_m, false, _channel, _note, 0, 0);
		return l;
	}

	double cosine(const Energy& _a, const Energy& _b)
	{
		double ab = 0, aa = 0, bb = 0;
		for(size_t i = 0; i < _a.size(); ++i)
		{
			ab += _a[i] * _b[i];
			aa += _a[i] * _a[i];
			bb += _b[i] * _b[i];
		}
		return aa > 0 && bb > 0 ? ab / std::sqrt(aa * bb) : 0.0;
	}

	std::string vec(const Energy& _e)
	{
		char b[160];
		std::snprintf(b, sizeof b, "%.4f %.4f %.4f %.4f %.4f %.4f", _e[0], _e[1], _e[2], _e[3], _e[4], _e[5]);
		return b;
	}

	// ---- Machinedrum ----------------------------------------------------------------------------------------

	constexpr double g_silent = 3e-5;	// RMS of all outputs under which nothing sounds

	void setGlobal(Machine& _m, const ed::MdGlobal& _g)
	{
		_m.send(ed::encodeMdGlobal(_g));
		_m.send(ed::mdSetActiveGlobal(_g.position));
		_m.run(400);
	}

	int statusValue(Machine& _m, const ed::MdStatus _param)
	{
		const auto r = ed::parseMdStatusResponse(_m.request(ed::mdStatusRequest(_param), 0x72));
		return r ? r->value : -1;
	}

	int noteForTrack(const ed::MdGlobal& _g, const uint8_t _track)
	{
		for(int n = 0; n < 128; ++n)
			if(_g.keymap[n] == _track)
				return n;
		return -1;
	}

	// What the panel's own TRIG key of a track sounds like (the reference the MIDI notes are compared to).
	Listen panelPad(Machine& _m, const uint8_t _track)
	{
		const auto row = static_cast<uint8_t>(0x20 + (_track >> 3));
		const auto mask = static_cast<uint8_t>(1u << (_track & 7));
		_m.hardware().trySendPanelEvent(row, mask);
		auto l = listen(_m, 350);
		_m.hardware().trySendPanelEvent(row, 0);
		return l;
	}

	void runMd(const Bytes& _rom, const std::string& _romName)
	{
		std::puts("== MD host notes through the firmware MIDI input");
		Machine m(_rom, _romName);
		auto g = ed::decodeMdGlobal(m.request(ed::mdGlobalRequest(0), ed::g_mdGlobalDump));
		require(g.has_value(), "global 0 read");
		g->position = 0;
		const uint8_t base = g->baseChannel;
		std::printf("  base channel %u (channels %u-%u), key map:", base, base + 1, base + 4);
		for(int n = 0; n < 128; ++n)
			if(g->keymap[n] != ed::MdGlobal::g_unmapped)
				std::printf(" %d>%u", n, g->keymap[n]);
		std::printf("\n");
		const auto factory = ed::mdFactoryGlobal(0);
		check(g->keymap == factory.keymap, "the machine starts with the factory key map");
		settle(m);

		// (a) every track by its key map note on the base channel; the panel's TRIG key is the reference
		std::puts("-- (a) each key map note sounds its track");
		int silentReference = 0;
		for(uint8_t t = 0; t < 16; ++t)
		{
			const int note = noteForTrack(*g, t);
			if(note < 0)
			{
				check(false, "track " + std::to_string(t + 1) + " has a key map note");
				continue;
			}
			const auto ref = panelPad(m, t);
			settle(m);
			const auto got = playNote(m, base, static_cast<uint8_t>(note));
			settle(m);
			const double c = cosine(ref.perOutput(), got.perOutput());
			std::printf("    track %2u note %3d: panel %.5f [%s]  note %.5f [%s]  cosine %.3f\n", t + 1, note, ref.rms(),
				vec(ref.perOutput()).c_str(), got.rms(), vec(got.perOutput()).c_str(), c);
			if(ref.rms() < g_silent)
			{
				++silentReference;	// a track the default kit leaves silent: nothing to compare
				continue;
			}
			const double ratio = ref.rms() > 0 ? got.rms() / ref.rms() : 0;
			check(got.rms() > g_silent && c > 0.99 && ratio > 0.85 && ratio < 1.18, "track " + std::to_string(t + 1) + " (note " + std::to_string(note)
				+ ") sounds as its TRIG key does (ratio "
				+ std::to_string(ratio) + ", cosine " + std::to_string(c) + ")");
		}
		check(silentReference == 0, "the factory kit sounds on every track (silent: " + std::to_string(silentReference) + ")");

		// a softer note is softer: velocity 64 on track 1 sounds lower than 127
		{
			const int note = noteForTrack(*g, 0);
			const auto loud = playNote(m, base, static_cast<uint8_t>(note), 17, 350, 127);
			settle(m);
			const auto soft = playNote(m, base, static_cast<uint8_t>(note), 17, 350, 64);
			settle(m);
			std::printf("    velocity 127 rms %.5f, velocity 64 rms %.5f\n", loud.rms(), soft.rms());
			check(soft.rms() > g_silent && soft.rms() < loud.rms() * 0.8, "velocity 64 sounds lower than 127");
		}

		// (b) a channel outside the four base channels sounds nothing; the in-group channels are only reported
		std::puts("-- (b) another channel sounds nothing");
		const uint8_t outside = static_cast<uint8_t>((base + 8) & 15);
		for(const uint8_t t : {uint8_t(0), uint8_t(5), uint8_t(15)})
		{
			const int note = noteForTrack(*g, t);
			const auto l = playNote(m, outside, static_cast<uint8_t>(note));
			settle(m);
			check(l.rms() < g_silent, "track " + std::to_string(t + 1) + " note " + std::to_string(note) + " on channel "
				+ std::to_string(outside + 1) + " is silent (rms " + std::to_string(l.rms()) + ")");
		}
		for(uint8_t ch = 0; ch < 4; ++ch)
		{
			const auto l = playNote(m, static_cast<uint8_t>(base + ch), static_cast<uint8_t>(noteForTrack(*g, 0)));
			settle(m);
			std::printf("    info: track 1 note on channel %u: rms %.5f\n", base + ch + 1, l.rms());
		}

		// (c) a key map edit: note 100 plays track 3 (index 2); track 3's old note maps nowhere
		std::puts("-- (c) a key map edit moves the note");
		const uint8_t track = 2;
		const int oldNote = noteForTrack(*g, track);
		constexpr uint8_t newNote = 100;
		auto edited = *g;
		edited.keymap[newNote] = track;
		edited.keymap[static_cast<size_t>(oldNote)] = ed::MdGlobal::g_unmapped;
		setGlobal(m, edited);
		const auto back = ed::decodeMdGlobal(m.request(ed::mdGlobalRequest(0), ed::g_mdGlobalDump));
		check(back && back->keymap == edited.keymap, "the edited key map is on the machine");
		const auto ref = panelPad(m, track);
		settle(m);
		const auto fresh = playNote(m, base, newNote);
		settle(m);
		const auto old = playNote(m, base, static_cast<uint8_t>(oldNote));
		settle(m);
		std::printf("    new note %u: rms %.5f cosine %.3f; old note %d: rms %.5f\n", newNote, fresh.rms(),
			cosine(ref.perOutput(), fresh.perOutput()), oldNote, old.rms());
		check(ref.rms() > g_silent && fresh.rms() > g_silent && cosine(ref.perOutput(), fresh.perOutput()) > 0.9,
			"the new note sounds track 3");
		check(old.rms() < g_silent, "the old note, now unmapped, sounds nothing");
		setGlobal(m, *g);

		// (d) GRID RECORD on: a host note leaves the pattern as it was
		std::puts("-- (d) GRID RECORD safety");
		const int slot = statusValue(m, ed::MdStatus::Pattern);
		require(slot >= 0, "current pattern");
		const auto dump = [&] { return m.request(ed::mdPatternRequest(static_cast<uint8_t>(slot)), ed::g_mdPatternDump); };
		m.send({0xfc});
		m.run(200);
		const auto original = dump();
		require(!original.empty(), "pattern dump");
		m.panel(md::PanelControl::Record);	// RECORD alone: grid recording
		m.run(200);
		const int noteA = noteForTrack(*g, 0), noteB = noteForTrack(*g, 9);
		playNote(m, base, static_cast<uint8_t>(noteA));
		playNote(m, base, static_cast<uint8_t>(noteB), 5, 250);
		m.run(300);
		const auto afterNotes = dump();
		check(!afterNotes.empty() && afterNotes == original, "two host notes in GRID RECORD leave the pattern unchanged");
		// positive control: the panel's own TRIG key does edit the grid, so the comparison can see an edit
		panelPad(m, 3);
		m.run(300);
		const auto afterPad = dump();
		check(!afterPad.empty() && afterPad != original, "control: a panel TRIG key in GRID RECORD does edit the pattern");
		m.panel(md::PanelControl::Record);
		m.run(200);
		m.send(original);	// put the pattern back
		m.run(300);
	}

	// ---- Monomachine -----------------------------------------------------------------------------------------

	// Energy at one frequency (Goertzel) over a stretch of the left output.
	double tone(const std::vector<float>& _x, const double _hz)
	{
		const double w = 2.0 * 3.14159265358979323846 * _hz / g_rate;
		const double coeff = 2.0 * std::cos(w);
		double s1 = 0, s2 = 0;
		for(const auto x : _x)
		{
			const double s = x + coeff * s1 - s2;
			s2 = s1;
			s1 = s;
		}
		return std::sqrt(std::max(0.0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / double(_x.size());
	}

	double hz(const uint8_t _note) { return 440.0 * std::exp2((double(_note) - 69.0) / 12.0); }

	// KIT > LOAD, FUNCTION+PLAY clears the kit (all six tracks GND>SIN), ENTER loads it: as in mmAudioFirmwareTest.
	void emptyKit(Machine& _m)
	{
		const auto tap = [&](const md::PanelControl c) { _m.panel(c); _m.run(100); };
		tap(md::PanelControl::Kit);
		tap(md::PanelControl::Enter);
		const auto function = md::panelPacket(md::MachineModel::Monomachine, md::PanelControl::Function);
		const auto play = md::panelPacket(md::MachineModel::Monomachine, md::PanelControl::Play);
		require(function && play, "clear-kit controls");
		md::PanelRowState rows;
		for(const auto p : {rows.press(*function), rows.press(*play), rows.release(*play), rows.release(*function)})
		{
			_m.hardware().trySendPanelEvent(p.row, p.mask);
			_m.run(50);
		}
		_m.run(2000);
		tap(md::PanelControl::Enter);
		tap(md::PanelControl::Exit);
	}

	void runMm(const Bytes& _rom, const std::string& _romName)
	{
		std::puts("== MM six notes at one sample offset");
		Machine m(_rom, _romName, {}, true, md::MachineModel::Monomachine);
		emptyKit(m);
		settle(m);
		const std::array<uint8_t, 6> notes{48, 52, 55, 59, 62, 66};	// distinct pitches, a sine each
		const auto chords = [&](const char* _what, const std::initializer_list<uint32_t> _offsets)
		{
			std::array<double, 6> alone{};
			std::printf("-- %s: single notes (the reference level of each voice)\n", _what);
			for(uint8_t t = 0; t < 6; ++t)
			{
				const auto l = playNote(m, t, notes[t], 5, 400);
				settle(m);
				alone[t] = tone(l.left, hz(notes[t]));
				std::printf("    track %u note %u (%.1f Hz): level %.5f\n", t + 1, notes[t], hz(notes[t]), alone[t]);
				check(alone[t] > 1e-4, std::string(_what) + ": track " + std::to_string(t + 1) + " sounds alone");
			}
			for(const uint32_t offset : _offsets)
			{
				std::printf("-- %s: chord, all six note-ons at offset %u\n", _what, offset);
				for(uint8_t t = 0; t < 6; ++t)
					scheduleNote(m, true, t, notes[t], 100, offset);
				const auto l = listen(m, 400);
				for(uint8_t t = 0; t < 6; ++t)
					scheduleNote(m, false, t, notes[t], 0, 0);
				settle(m);
				for(uint8_t t = 0; t < 6; ++t)
				{
					const double level = tone(l.left, hz(notes[t]));
					std::printf("    track %u: level %.5f (alone %.5f)\n", t + 1, level, alone[t]);
					check(alone[t] > 0 && level > alone[t] * 0.25, std::string(_what) + ", offset " + std::to_string(offset)
						+ ": voice " + std::to_string(t + 1) + " sounds");
				}
			}
		};
		chords("GND-SIN", {0u, 1u, 33u, 63u});
		// B-011 was seen with DigiPRO: assign DPRO-DDRW (machine 32, manual Appendix C) to every track
		for(uint8_t t = 0; t < 6; ++t)
		{
			m.post({0xf0, 0, 0x20, 0x3c, 3, 0, 0x5b, t, 32, 1, 0xf7});
			m.run(1000);
		}
		settle(m);
		chords("DigiPRO", {0u, 33u});
	}
}

int main(const int argc, char** argv)
{
	const std::string_view which = argc == 2 ? argv[1] : "";
	if(which != "md" && which != "mm")
	{
		std::fputs("usage: mdHostNotesFirmwareTest md|mm\n", stderr);
		return 2;
	}
	const bool isMd = which == "md";
	const char* path = std::getenv(isMd ? "GEARMULATOR_MD_FIRMWARE_BIN" : "GEARMULATOR_MM_FIRMWARE_BIN");
	if(!path || !*path)
	{
		std::printf("mdHostNotesFirmwareTest %s: SKIP (firmware not supplied)\n", argv[1]);
		return 77;
	}
	try
	{
		Bytes rom;
		require(baseLib::filesystem::readFile(rom, path), "could not read the ROM");
		require(md::RomLoader::isRomForModel(rom, isMd ? md::MachineModel::Machinedrum : md::MachineModel::Monomachine),
			"ROM fingerprint mismatch");
		if(isMd)
			runMd(rom, path);
		else
			runMm(rom, path);
	}
	catch(const std::exception& e)
	{
		std::fprintf(stderr, "mdHostNotesFirmwareTest %s: %s\n", argv[1], e.what());
		return 1;
	}
	std::printf("mdHostNotesFirmwareTest %s: %s (%d failed)\n", argv[1], g_failures ? "FAIL" : "PASS", g_failures);
	return g_failures ? 1 : 0;
}
