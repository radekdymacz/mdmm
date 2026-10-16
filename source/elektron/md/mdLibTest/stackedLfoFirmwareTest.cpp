// Stacked LFOs on a kick's pitch (beta report 2026-10-16: "3 LFOs on pitch ... will randomly just not trigger").
//
// The Machinedrum: a TRX-BD on track 1 hit on every beat, the LFOs of tracks 1-3 (or 2-4) all on track 1's PTCH in
// TRIG mode, their tracks trigged with the kick. Every hit of such a kick should sound the same, so each hit's first
// 30 ms is measured (peak, zero crossings, difference from the median hit) and a hit that differs is counted as a miss.
// Run with the speed-ups on and off, with the exact ESSI timing (L3) on and off, and at several host block sizes.
//
// Manual: needs a user-supplied ROM (GEARMULATOR_MD_FIRMWARE_BIN). Usage:
//   stackedLfoFirmwareTest [md] [--bars N] [--scenario NAME] [--block N] [--wav DIR] [--matrix]
// Exit 0 when no hit is missed in every run, 1 otherwise, 77 without a ROM.

#include "mdFirmwareSession.h"

#include "elektronData/mdCommands.h"
#include "elektronData/mdKit.h"
#include "elektronData/mdMachines.h"
#include "elektronData/mdPattern.h"

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
	};

	struct Result
	{
		std::vector<Hit> hits;
		int expected = 0;
		int missing = 0;		// beats with no onset at all
		int misses = 0;			// hits that differ from the median hit
		uint64_t hash = 0;
	};

	// Onsets: the first sample above the threshold after 60 ms below it.
	Result analyse(const std::vector<float>& _x, const size_t _start, const double _framesPerBeat, const int _beats)
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
			if(quiet > g_rate * 60 / 1000 || onsets.empty())
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

	void print(const Scenario& _s, const Options& _o, const Result& _r)
	{
		std::map<int, int> zc;
		double maxDev = 0;
		for(const auto& h : _r.hits)
		{
			++zc[h.zc];
			maxDev = std::max(maxDev, h.dev);
		}
		std::printf("  %-16s block %4u speed-ups %-3s L3 %-3s: %3zu hits of %3d, missing %d, differing %d, max dev %.3f, hash %016llx, zc:",
			_s.name, _o.block, _o.speedUps ? "on" : "off", _o.exactEssi ? "on" : "off", _r.hits.size(), _r.expected, _r.missing,
			_r.misses, maxDev, static_cast<unsigned long long>(_r.hash));
		for(const auto& [z, n] : zc)
			std::printf(" %d:%d", z, n);
		std::printf("\n");
	}
}

int main(int _argc, char** _argv)
{
	const char* rom = std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
	if(!rom || !*rom)
	{
		std::puts("stackedLfoFirmwareTest: SKIP (GEARMULATOR_MD_FIRMWARE_BIN not set)");
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
	try
	{
		const auto romBytes = load(rom);
		int failures = 0;
		for(const auto& s : scenarios())
		{
			if(!only.empty() && only != s.name)
				continue;
			std::printf("%s: %s\n", s.name, s.about);
			std::vector<Options> runs{o};
			if(matrix)
			{
				runs.clear();
				for(const bool sp : {true, false})
					for(const bool essi : {false, true})
						for(const uint32_t b : {64u, 1u, 512u})
						{
							if((!sp || essi) && b != 64)
								continue;
							auto x = o;
							x.speedUps = sp;
							x.exactEssi = essi;
							x.block = b;
							runs.push_back(x);
						}
			}
			for(const auto& r : runs)
			{
				const auto res = run(romBytes, s, r);
				print(s, r, res);
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
