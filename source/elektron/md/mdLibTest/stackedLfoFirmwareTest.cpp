// Stacked LFOs on a kick's pitch (beta report 2026-10-16: "3 LFOs on pitch ... will randomly just not trigger").
//
// The Machinedrum: a TRX-BD on track 1 hit on every beat, the LFOs of tracks 1-3 (or 2-4) all on track 1's PTCH in
// TRIG mode, their tracks trigged with the kick. Every hit of such a kick should sound the same, so each hit's first
// 30 ms is measured (peak, zero crossings, difference from the median hit) and a hit that differs is counted as a miss.
// Run with the speed-ups on and off, with the exact ESSI timing (L3) on and off, and at several host block sizes.
//
// The Monomachine (--mm): a GND-SIN on track 1 with a short amp envelope, its LFO1-3 (or LFO1 alone) on the PTCH page in
// TRIG mode (DEST 1OCT, SAW), played by a host note on its channel every beat (a note trigs amp, filter and LFO), each
// note at the same machine frame whatever the block size. The oscillator runs free, so the MM is judged by each hit's
// pitch (0-15 ms and 15-30 ms), not by its waveform: a hit more than 2 % off the median pitch is a miss.
// B-161 recurrence: mm-stack3-seq uses the internal sequencer, with explicit AMP/FILTER/LFO/pitch trigs,
// rather than incoming MIDI notes, started by the panel PLAY (MIDI Start is ignored under the factory TRANSPORT
// IGNORE). It extends coverage; it does not identify the unprovided reported pattern.
//
// Manual: needs a user-supplied ROM (GEARMULATOR_MD_FIRMWARE_BIN, --mm: GEARMULATOR_MM_FIRMWARE_BIN). Usage:
//   stackedLfoFirmwareTest [--mm] [--bars N] [--scenario NAME] [--block N] [--wav DIR] [--matrix] [-v]
// Exit 0 when no hit is missed in every run, 1 otherwise, 77 without a ROM.

#include "mdFirmwareSession.h"
#include "mmSysexRecv.h"

#include "mdLib/mmtelemetry.h"

#include "elektronData/mdCommands.h"
#include "elektronData/mdKit.h"
#include "elektronData/mdMachines.h"
#include "elektronData/mdPattern.h"
#include "elektronData/mmCommands.h"
#include "elektronData/mmDump.h"
#include "elektronData/mmKit.h"
#include "elektronData/mmPattern.h"

#include <cmath>
#include <cstdlib>
#include <cstring>
#include <map>
#include <optional>

using namespace mdFirmwareSession;
namespace ed = elektronData;

namespace
{
	std::string g_romName;

	struct Scenario
	{
		const char* name;
		const char* about;
		std::vector<uint8_t> lfoTracks;		// whose LFOs go to track 1 PTCH
		uint8_t update;						// 0 FREE, 1 TRIG, 2 HOLD
		bool trigLfoTracks;					// the LFO tracks trigged with the kick
		uint8_t shape;
		uint8_t speed;
		uint8_t depth;
	};

	const std::vector<Scenario>& scenarios()
	{
		static const std::vector<Scenario> s{
			{"none", "no LFO (the reference kick)", {}, 1, false, 1, 64, 0},
			{"one", "track 1's own LFO on PTCH, TRIG", {0}, 1, false, 1, 80, 96},
			{"stack3own", "LFOs of tracks 1-3 on track 1 PTCH, TRIG, tracks 2-3 trigged with the kick", {0, 1, 2}, 1, true, 1, 80, 96},
			{"stack3", "LFOs of tracks 2-4 on track 1 PTCH, TRIG, tracks 2-4 trigged with the kick", {1, 2, 3}, 1, true, 1, 80, 96},
			{"stack3untrigged", "LFOs of tracks 2-4 on track 1 PTCH, TRIG, tracks 2-4 not trigged", {1, 2, 3}, 1, false, 1, 80, 96},
			{"stack3hold", "LFOs of tracks 2-4 on track 1 PTCH, HOLD, trigged with the kick", {1, 2, 3}, 2, true, 1, 80, 96},
		};
		return s;
	}

	std::optional<ed::MdKit> readKit(Machine& _m, const uint8_t _slot)
	{
		return ed::decodeMdKit(_m.request(ed::mdKitRequest(_slot), ed::g_mdKitDump));
	}

	std::optional<ed::MdPattern> readPattern(Machine& _m, const uint8_t _slot)
	{
		return ed::decodeMdPattern(_m.request(ed::mdPatternRequest(_slot), ed::g_mdPatternDump));
	}

	struct Hit
	{
		size_t onset = 0;
		float peak = 0;
		int zc = 0;			// zero crossings in the first 30 ms
		double dev = 0;		// RMS difference from the median hit, relative to its RMS
		double hz[2]{};		// pitch over 0-15 ms and 15-30 ms, from interpolated rising zero crossings (any phase)
	};

	// The pitch of _x[_from, _to) from its rising zero crossings, interpolated: independent of the oscillator's phase.
	double pitchHz(const std::vector<float>& _x, const size_t _from, const size_t _to)
	{
		double first = -1, last = -1;
		int n = 0;
		for(size_t i = _from + 1; i < _to; ++i)
		{
			if(!(_x[i - 1] < 0 && _x[i] >= 0))
				continue;
			const double t = double(i - 1) + double(-_x[i - 1]) / double(_x[i] - _x[i - 1]);
			if(first < 0)
				first = t;
			last = t;
			++n;
		}
		return n > 1 ? (n - 1) * double(g_rate) / (last - first) : 0;
	}

	struct Result
	{
		std::vector<Hit> hits;
		int expected = 0;
		int missing = 0;		// beats with no onset at all
		int misses = 0;			// hits that differ from the median hit
		uint64_t hash = 0;
	};

	// Onsets: the first sample above the threshold after 60 ms below it.
	Result analyse(const std::vector<float>& _x, const size_t _start, const double _framesPerBeat, const int _beats, const bool _initialQuiet = false)
	{
		Result r;
		r.expected = _beats;
		const float threshold = 0.01f;
		const size_t win = g_rate * 30 / 1000;
		size_t quiet = 0;
		std::vector<size_t> onsets;
		for(size_t i = _start; i + win < _x.size(); ++i)
		{
			if(std::fabs(_x[i]) < threshold)
			{
				++quiet;
				continue;
			}
			if(quiet > g_rate * 60 / 1000 || (!_initialQuiet && onsets.empty()))
				onsets.push_back(i);
			quiet = 0;
		}
		for(const auto o : onsets)
		{
			Hit h;
			h.onset = o;
			for(size_t i = o; i < o + win; ++i)
			{
				h.peak = std::max(h.peak, std::fabs(_x[i]));
				if(i > o && (_x[i - 1] < 0) != (_x[i] < 0))
					++h.zc;
			}
			h.hz[0] = pitchHz(_x, o, o + win / 2);
			h.hz[1] = pitchHz(_x, o + win / 2, o + win);
			r.hits.push_back(h);
		}
		if(r.hits.empty())
		{
			r.missing = _beats;
			return r;
		}
		// beats without an onset, from the first onset on
		const auto first = static_cast<double>(r.hits.front().onset);
		for(int b = 0; b < _beats; ++b)
		{
			const double at = first + b * _framesPerBeat;
			if(at + win >= static_cast<double>(_x.size()))
			{
				r.expected = b;
				break;
			}
			const bool found = std::any_of(r.hits.begin(), r.hits.end(), [&](const Hit& _h)
			{
				return std::fabs(static_cast<double>(_h.onset) - at) < 0.1 * _framesPerBeat;
			});
			r.missing += !found;
		}
		// the median hit by zero crossings, then each hit's difference from it
		std::vector<Hit> sorted = r.hits;
		std::sort(sorted.begin(), sorted.end(), [](const Hit& _a, const Hit& _b) { return _a.zc < _b.zc; });
		const auto ref = sorted[sorted.size() / 2].onset;
		double refRms = 0;
		for(size_t i = 0; i < win; ++i)
			refRms += double(_x[ref + i]) * _x[ref + i];
		refRms = std::sqrt(refRms / win);
		const int medianZc = sorted[sorted.size() / 2].zc;
		float peaks = 0;
		for(const auto& h : sorted)
			peaks += h.peak;
		const float meanPeak = peaks / static_cast<float>(sorted.size());
		for(auto& h : r.hits)
		{
			double d = 0;
			for(size_t i = 0; i < win; ++i)
			{
				const double e = double(_x[h.onset + i]) - _x[ref + i];
				d += e * e;
			}
			h.dev = refRms > 0 ? std::sqrt(d / win) / refRms : 0;
			if(std::abs(h.zc - medianZc) > 2 || h.peak < 0.5f * meanPeak)
				++r.misses;
		}
		for(const auto v : _x)
		{
			uint32_t bits;
			std::memcpy(&bits, &v, 4);
			r.hash = (r.hash ^ bits) * 0x100000001b3ull;
		}
		return r;
	}

	void writeWav(const std::string& _path, const std::vector<float>& _x)
	{
		std::ofstream f(_path, std::ios::binary);
		const auto u32 = [&](const uint32_t _v) { f.write(reinterpret_cast<const char*>(&_v), 4); };
		const auto u16 = [&](const uint16_t _v) { f.write(reinterpret_cast<const char*>(&_v), 2); };
		const auto bytes = static_cast<uint32_t>(_x.size() * 4);
		f.write("RIFF", 4); u32(36 + bytes); f.write("WAVEfmt ", 8); u32(16); u16(3); u16(1); u32(g_rate); u32(g_rate * 4);
		u16(4); u16(32); f.write("data", 4); u32(bytes);
		f.write(reinterpret_cast<const char*>(_x.data()), bytes);
	}

	struct Options
	{
		int bars = 16;
		uint32_t block = 64;
		bool speedUps = true;
		bool exactEssi = false;
		std::string wavDir;
		bool verbose = false;
	};

	Result run(const Bytes& _rom, const Scenario& _s, const Options& _o)
	{
		Machine m(_rom, g_romName);
		m.hardware().setSpeedUps(_o.speedUps);
		m.hardware().setExactEssiTiming(_o.exactEssi);

		// the kit: every track GND-EMPTY, track 1 a TRX-BD, the LFOs on track 1's PTCH
		auto was = readKit(m, 0);
		require(was.has_value(), "kit 1 did not read");
		auto k = ed::mdClearedKit(*was, 0);
		const char name[] = "STACKLFO";
		std::fill(k.name.begin(), k.name.end(), 0);
		std::memcpy(k.name.data(), name, sizeof(name) - 1);
		k.models[0] = *ed::mdMachineModel("TRX-BD");
		k.params[0][0] = 40;	// PTCH
		k.params[0][1] = 24;	// DEC
		for(const auto t : _s.lfoTracks)
		{
			auto& l = k.lfos[t];
			l.track = 0;
			l.param = 0;
			l.shape1 = _s.shape;
			l.shape2 = _s.shape;
			l.update = _s.update;
			k.params[t][21] = _s.speed;
			k.params[t][22] = _s.depth;
			k.params[t][23] = 0;
		}
		m.send(ed::encodeMdKit(k));
		m.run(200);

		// the pattern: the kick on every beat, the LFO tracks with it when the scenario says so
		auto p = readPattern(m, 0);
		require(p.has_value(), "pattern A01 did not read");
		p->position = 0;
		p->kit = 0;
		p->length = 16;
		p->tempoMultiplier = 0;
		p->trigs.fill(0);
		p->lockMasks.fill(0);
		for(auto& row : p->lockRows)
			row.fill(ed::MdPattern::g_noLock);
		p->lockedRows = 0;
		p->accentPattern = p->slidePattern = p->swingPattern = 0;
		for(size_t st = 0; st < 64; st += 4)
		{
			*p = ed::withTrig(*p, 0, st, true);
			if(_s.trigLfoTracks)
				for(const auto t : _s.lfoTracks)
					if(t != 0)
						*p = ed::withTrig(*p, t, st, true);
		}
		m.send(ed::encodeMdPattern(*p));
		m.run(200);
		m.send(ed::mdLoadPattern(0));
		m.run(200);
		m.send(ed::mdLoadKit(0));
		m.run(200);
		m.send(ed::mdSetTempo(120 * 24));
		m.run(200);
		const auto loaded = readKit(m, 0);
		require(loaded && loaded->models[0] == k.models[0], "the kit did not take");

		// play and record N bars at the host block size
		std::array<std::vector<float>, 6> out;
		for(auto& o : out)
			o.assign(std::max<uint32_t>(_o.block, 1), 0.0f);
		synthLib::TAudioOutputs outputs{};
		for(size_t c = 0; c < out.size(); ++c)
			outputs[c] = out[c].data();
		std::vector<float> left;
		std::vector<synthLib::SMidiEvent> midi;
		const auto playPacket = md::panelPacket(m.hardware().getModel(), md::PanelControl::Play);
		require(playPacket.has_value(), "no PLAY packet");
		m.hardware().trySendPanelEvent(playPacket->row, playPacket->mask);
		const double framesPerBeat = g_rate * 60.0 / 120.0;
		const size_t total = static_cast<size_t>(framesPerBeat * 4 * _o.bars) + g_rate;
		bool released = false;
		// PLAY is let go at the same machine frame whatever the block size, so that only the block size differs
		const size_t releaseAt = g_rate / 25;
		while(left.size() < total)
		{
			auto n = static_cast<uint32_t>(_o.block);
			if(!released && left.size() + n > releaseAt)
				n = static_cast<uint32_t>(releaseAt - left.size());
			if(n)
			{
				m.hardware().processAudio(outputs, n, 0);
				left.insert(left.end(), out[0].begin(), out[0].begin() + n);
			}
			midi.clear();
			m.hardware().readMidiOut(midi);
			if(!released && left.size() >= releaseAt)
			{
				m.hardware().trySendPanelEvent(playPacket->row, 0);
				released = true;
			}
		}
		auto r = analyse(left, 0, framesPerBeat, _o.bars * 4);
		if(!_o.wavDir.empty())
			writeWav(_o.wavDir + "/" + _s.name + "-b" + std::to_string(_o.block) + (_o.speedUps ? "" : "-nospeed")
				+ (_o.exactEssi ? "-essi" : "") + ".wav", left);
		if(_o.verbose)
			for(size_t i = 0; i < r.hits.size(); ++i)
				std::printf("    hit %2zu at %8zu peak %.3f zc %3d dev %.3f\n", i, r.hits[i].onset, r.hits[i].peak, r.hits[i].zc, r.hits[i].dev);
		return r;
	}


	struct MmScenario
	{
		const char* name;
		const char* about;
		int lfos;		// LFO1..LFOn on the PTCH page
		bool sequencer = false;
	};

	const std::vector<MmScenario>& mmScenarios()
	{
		static const std::vector<MmScenario> s{
			{"mm-none", "no LFO (the reference note)", 0},
			{"mm-one", "LFO1 on PTCH, TRIG", 1},
			{"mm-stack3", "LFO1-3 on PTCH, TRIG", 3},
			{"mm-stack3-seq", "LFO1-3 on PTCH, TRIG, internal sequencer", 3, true},
		};
		return s;
	}

	ed::MmKit mmWorkingKit(Machine& _m)
	{
		const auto patch = _m.hardware().copyPatchRam();
		const auto off = ed::g_mmWorkingKitAddress - 0x700000;
		const Bytes raw(patch.begin() + off, patch.begin() + off + ed::MmKit::g_rawSize);
		const auto k = ed::mmKitFromRaw(raw, 0);
		require(k.has_value(), "the MM working kit did not decode");
		return *k;
	}

	Result runMm(const Bytes& _rom, const MmScenario& _s, const Options& _o)
	{
		Machine m(_rom, g_romName, {}, true, md::MachineModel::Monomachine);
		m.hardware().setSpeedUps(_o.speedUps);
		m.hardware().setExactEssiTiming(_o.exactEssi);
		const auto cc = [&](const uint8_t _ch, const uint8_t _cc, const uint8_t _v) { m.send({static_cast<uint8_t>(0xb0 | _ch), _cc, _v}); };
		// track 1 a GND-SIN with its pages initialised, the other tracks silent
		m.send(ed::mmAssignMachine(0, 1, 1));
		m.run(200);
		for(uint8_t ch = 1; ch < 6; ++ch)
			cc(ch, 7, 0);
		// AMP: ATK 0, HOLD 0, DEC 30, REL 0, VOL 100
		cc(0, 56, 0); cc(0, 57, 0); cc(0, 58, 30); cc(0, 59, 0); cc(0, 61, 100);
		// LFO pages (PAGE DEST TRIG WAVE MULT SPD INTL DPTH): PTCH, TRIG, SAW, SPD 80, depth 96
		static constexpr uint8_t lfoBase[3]{88, 104, 112};
		for(int l = 0; l < 3; ++l)
		{
			const uint8_t b = lfoBase[l];
			const bool on = l < _s.lfos;
			// enumerated LFO settings take a CC value scaled over their range (index x 128 / count): PAGE PTCH (0 of 9),
			// DEST 1OCT (3 of 8), TRIG (1 of 5), WAVE SAW (2 of 11), MULT 1X; then SPD 80, INTL 0
			const auto pick = [](const int _index, const int _count) { return static_cast<uint8_t>((2 * _index + 1) * 64 / _count); };
			cc(0, b + 0, pick(0, 9)); cc(0, b + 1, pick(3, 8)); cc(0, b + 2, pick(1, 5)); cc(0, b + 3, pick(2, 11));
			cc(0, b + 4, 0); cc(0, b + 5, 80); cc(0, b + 6, 0); cc(0, b + 7, on ? 96 : 0);
		}
		m.run(300);
		// one note before the measured ones: the first trig after the LFO settings arrive starts from another phase
		m.send({0x90, 60, 100});
		m.run(60);
		m.send({0x80, 60, 0});
		m.run(500);
		const auto k = mmWorkingKit(m);
		require(k.machines[0] == 1, "track 1 is not a GND-SIN");
		if(_o.verbose)
			for(int l = 0; l < 3; ++l)
			{
				std::printf("    LFO%d:", l + 1);
				for(const auto v : k.tracks[0].pages[static_cast<size_t>(4 + l)])
					std::printf(" %u", v);
				std::printf("\n");
			}

		if(_s.sequencer)
		{
			ed::MmPattern p;
			for(auto& notes : p.notes)
				notes.fill(ed::MmPattern::g_noNote);
			for(auto& row : p.lockRows)
				row.fill(ed::MmPattern::g_noLock);
			p.midiNotes.fill(0xffff);
			p.chordNotes.fill(0xffff);
			for(auto* arp : {&p.arp, &p.midiArp})
			{
				arp->length.fill(16);
				arp->speed.fill(5);
				for(auto& steps : arp->steps)
					steps.fill(64);
			}
			for(size_t step = 0; step < p.length; step += 4)
			{
				const auto bit = ed::mmStepBit(step);
				p.pitch[0] |= bit;
				p.amp[0] |= bit;
				p.filter[0] |= bit;
				p.lfo[0] |= bit;
				p.notes[0][step] = 60;
			}
			const auto received = mmSysexRecv::send(m, {ed::encodeMmKit(k), ed::encodeMmPattern(p)});
			require(received.taken == 2 && received.errors == 0, "the sequencer kit and pattern did not import");
			const auto stored = ed::decodeMmPattern(m.request(ed::mmPatternRequest(0), ed::g_mmPatternDump));
			require(stored && stored->pitch == p.pitch && stored->amp == p.amp && stored->lfo == p.lfo
				&& stored->filter == p.filter && stored->notes == p.notes, "the stored sequencer trigs differ");
			m.send(ed::mmLoadPattern(0));
			m.send(ed::mmLoadKit(0));
			m.send(ed::mmSetTempo(120));
			m.run(300);
			require(mmWorkingKit(m).tracks[0].pages == k.tracks[0].pages, "loading the pattern changed the LFO kit");
			// the panel PLAY: MIDI Start is ignored under the factory CONTROL IN TRANSPORT IGNORE (mmDeskFirmwareTest)
			// A key pressed while the machine still takes a dump (SYSEX RECV) is lost (mmDesk pressKeys): wait, and press again
			// until the sequencer runs (CI run 40648229103: 0 of one press). PLAY is only pressed while it does not run.
			m.run(1500);
			for(int tries = 0; tries < 6 && m.read8(md::MmTelemetry::g_runningAddress) == 0; ++tries)
			{
				m.panel(md::PanelControl::Play);
				m.run(2000); // one warm-up bar, then measure continuing sequencer trigs
			}
			require(m.read8(md::MmTelemetry::g_runningAddress) != 0, "the sequencer did not start");
		}

		std::array<std::vector<float>, 6> out;
		for(auto& o : out)
			o.assign(std::max<uint32_t>(_o.block, 1), 0.0f);
		synthLib::TAudioOutputs outputs{};
		for(size_t c = 0; c < out.size(); ++c)
			outputs[c] = out[c].data();
		std::vector<float> left;
		std::vector<synthLib::SMidiEvent> midi;
		const double framesPerBeat = g_rate * 60.0 / 120.0;
		const int beats = _o.bars * 4;
		const size_t total = static_cast<size_t>(framesPerBeat * beats) + g_rate;
		// note on at each beat, off 60 ms later, each at its own machine frame
		std::vector<std::pair<size_t, Bytes>> events;
		for(int b = 0; !_s.sequencer && b < beats; ++b)
		{
			const auto at = static_cast<size_t>(g_rate / 10 + b * framesPerBeat);
			events.push_back({at, {0x90, 60, 100}});
			events.push_back({at + g_rate * 60 / 1000, {0x80, 60, 0}});
		}
		size_t next = 0;
		while(left.size() < total)
		{
			while(next < events.size() && events[next].first <= left.size())
				m.post(events[next++].second);
			auto n = static_cast<uint32_t>(_o.block);
			if(next < events.size() && left.size() + n > events[next].first)
				n = static_cast<uint32_t>(events[next].first - left.size());
			m.hardware().processAudio(outputs, n, 0);
			left.insert(left.end(), out[0].begin(), out[0].begin() + n);
			midi.clear();
			m.hardware().readMidiOut(midi);
		}
		// A running sequencer can be mid-note at capture start. Wait for silence before its first measured onset.
		auto r = analyse(left, 0, framesPerBeat, beats, _s.sequencer);
		// a free-running oscillator starts each note at another phase: judge the MM by pitch, not by waveform
		r.misses = 0;
		double median[2]{};
		for(int w = 0; w < 2; ++w)
		{
			std::vector<double> v;
			for(const auto& h : r.hits)
				v.push_back(h.hz[w]);
			std::sort(v.begin(), v.end());
			median[w] = v.empty() ? 0 : v[v.size() / 2];
		}
		for(const auto& h : r.hits)
		{
			bool off = false;
			for(int w = 0; w < 2; ++w)
				off |= median[w] <= 0 || std::fabs(h.hz[w] - median[w]) > 0.02 * median[w];
			r.misses += off;
		}
		std::printf("    median pitch %.1f Hz (0-15 ms), %.1f Hz (15-30 ms); hits more than 2 %% off: %d\n", median[0], median[1], r.misses);
		if(!_o.wavDir.empty())
			writeWav(_o.wavDir + "/" + _s.name + "-b" + std::to_string(_o.block) + (_o.speedUps ? "" : "-nospeed") + ".wav", left);
		if(_o.verbose)
			for(size_t i = 0; i < r.hits.size(); ++i)
				std::printf("    hit %2zu at %8zu peak %.3f %.1f Hz %.1f Hz\n", i, r.hits[i].onset, r.hits[i].peak, r.hits[i].hz[0], r.hits[i].hz[1]);
		return r;
	}

	void print(const char* _name, const Options& _o, const Result& _r)
	{
		std::map<int, int> zc;
		double maxDev = 0;
		for(const auto& h : _r.hits)
		{
			++zc[h.zc];
			maxDev = std::max(maxDev, h.dev);
		}
		std::printf("  %-16s block %4u speed-ups %-3s L3 %-3s: %3zu hits of %3d, missing %d, differing %d, max dev %.3f, hash %016llx, zc:",
			_name, _o.block, _o.speedUps ? "on" : "off", _o.exactEssi ? "on" : "off", _r.hits.size(), _r.expected, _r.missing,
			_r.misses, maxDev, static_cast<unsigned long long>(_r.hash));
		for(const auto& [z, n] : zc)
			std::printf(" %d:%d", z, n);
		std::printf("\n");
	}
}

int main(int _argc, char** _argv)
{
	const bool mm = std::any_of(_argv + 1, _argv + _argc, [](const char* _a) { return std::strcmp(_a, "--mm") == 0; });
	const char* const romVar = mm ? "GEARMULATOR_MM_FIRMWARE_BIN" : "GEARMULATOR_MD_FIRMWARE_BIN";
	const char* rom = std::getenv(romVar);
	if(!rom || !*rom)
	{
		std::printf("stackedLfoFirmwareTest: SKIP (%s not set)\n", romVar);
		return 77;
	}
	g_romName = rom;
	Options o;
	std::string only;
	bool matrix = false;
	for(int i = 1; i < _argc; ++i)
	{
		const std::string a = _argv[i];
		const auto next = [&] { require(i + 1 < _argc, a + " needs a value"); return std::string(_argv[++i]); };
		if(a == "--bars") o.bars = std::stoi(next());
		else if(a == "--block") o.block = static_cast<uint32_t>(std::stoul(next()));
		else if(a == "--scenario") only = next();
		else if(a == "--wav") o.wavDir = next();
		else if(a == "--matrix") matrix = true;
		else if(a == "--nospeedups") o.speedUps = false;
		else if(a == "--essi") o.exactEssi = true;
		else if(a == "-v") o.verbose = true;
	}
	// --matrix: the speed-ups on and off, L3 on and off (the MD; the MM always runs exact), host blocks 1, 7, 64, 512
	const auto runsFor = [&]
	{
		if(!matrix)
			return std::vector<Options>{o};
		std::vector<Options> runs;
		for(const bool sp : {true, false})
			for(const bool essi : {false, true})
				for(const uint32_t b : {64u, 1u, 7u, 512u})
				{
					if((!sp || essi) && b != 64)
						continue;
					if(mm && essi)
						continue;
					auto x = o;
					x.speedUps = sp;
					x.exactEssi = essi;
					x.block = b;
					runs.push_back(x);
				}
		return runs;
	};
	try
	{
		const auto romBytes = load(rom);
		int failures = 0;
		if(mm)
		{
			for(const auto& s : mmScenarios())
			{
				if(!only.empty() && only != s.name)
					continue;
				std::printf("%s: %s\n", s.name, s.about);
				for(const auto& r : runsFor())
				{
					const auto res = runMm(romBytes, s, r);
					print(s.name, r, res);
					failures += res.missing + res.misses;
				}
			}
		}
		for(const auto& s : scenarios())
		{
			if(mm || (!only.empty() && only != s.name))
				continue;
			std::printf("%s: %s\n", s.name, s.about);
			for(const auto& r : runsFor())
			{
				const auto res = run(romBytes, s, r);
				print(s.name, r, res);
				// FREE-running LFOs make every hit different on purpose: only the TRIG scenarios must repeat
				if(s.update == 1 && (s.trigLfoTracks || s.lfoTracks.size() <= 1))
					failures += res.missing + res.misses;
			}
		}
		std::printf("stackedLfoFirmwareTest: %s\n", failures ? "FAIL" : "PASS");
		return failures ? 1 : 0;
	}
	catch(const std::exception& _e)
	{
		std::fprintf(stderr, "stackedLfoFirmwareTest: %s\n", _e.what());
		return 1;
	}
}
