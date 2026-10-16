// Manual-gap probes P1 to P10 (doc/modern-ux/PROBES-manual-gaps.md): questions about the firmware that decide parts of
// the manual-gap work (doc/modern-ux/PLAN-manual-gaps.md, wave P), answered on the real ROMs (MD OS 1.63, MM OS 1.32B).
// Discovery harness in the style of mdP4ProbeFirmwareTest and mmEditorProbeFirmwareTest: it measures and prints a
// RESULT line per question; the checks only guard that the rig itself works (the machine boots, plays, answers).
//
//   gapProbesFirmwareTest <MD ROM> <MM ROM> [p1|p1md|p1mm|p2|p2panel|p3|p4|p5|p6|p6b|p7|p8|p9|p10|all]
//   gapProbesFirmwareTest <MD ROM> <MM ROM> explore md|mm "<key,key,...>"     (prints the LCD after the keys)
//
// "-" for a ROM skips that machine; "--env" takes it from GEARMULATOR_MD_FIRMWARE_BIN / GEARMULATOR_MM_FIRMWARE_BIN. Exits 77
// (skip) without arguments or ROMs. Manual (not in ctest: about 7 minutes, discovery, not a guard): needs the user's own
// ROMs. Every probe prints a RESULT line; the report quotes them. Env: P3_LCD=1 prints the TRIG IN A screen, P2_TRACE=1
// every MIDI message out, P2_SNAP / P3_SNAP / P4_SNAP=<path> write the LCD as a .pgm, EXPLORE_ASCII=1 for explore.

#include "mdFirmwareSession.h"
#include "sysexPanelDriver.h"

#include "elektronData/mdCommands.h"
#include "elektronData/mdGlobal.h"
#include "elektronData/mdKit.h"
#include "elektronData/mdMachines.h"
#include "elektronData/mdPattern.h"
#include "elektronData/mdWorkingKit.h"
#include "elektronData/mdSong.h"
#include "elektronData/mmCommands.h"
#include "elektronData/mmGlobal.h"
#include "elektronData/mmKit.h"
#include "elektronData/mmPattern.h"
#include "elektronData/mmSong.h"
#include "elektronData/mmValidate.h"
#include "elektronData/sysex7bit.h"

#include "mdLib/mdautomation.h"
#include "mdLib/mdfactorybaseline.h"
#include "mdLib/mdmemorymap.h"
#include "mdLib/mdsequencerstate.h"
#include "mdLib/mmtelemetry.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <sstream>
#include <tuple>

using namespace mdFirmwareSession;
namespace ed = elektronData;

namespace
{
	int g_failures = 0;
	std::string g_mdRomName, g_mmRomName;
	constexpr auto g_mmModel = md::MachineModel::Monomachine;

	void check(const bool _condition, const std::string& _what)
	{
		std::printf("  %s %s\n", _condition ? "ok  " : "FAIL", _what.c_str());
		if(!_condition)
			++g_failures;
	}

	void result(const char* _id, const std::string& _line)
	{
		std::printf("RESULT %s: %s\n", _id, _line.c_str());
	}

	std::string hex(const Bytes& _b, const size_t _from = 0, const size_t _count = 0)
	{
		std::string s;
		const size_t to = _count ? std::min(_b.size(), _from + _count) : _b.size();
		char x[8];
		for(size_t i = _from; i < to; ++i)
		{
			std::snprintf(x, sizeof x, "%02x ", _b[i]);
			s += x;
		}
		return s;
	}

	// ---- the machine, either model -------------------------------------------------------------------------------

	struct Rig
	{
		bool mm = false;
		std::unique_ptr<Machine> m;
		bool extClock = false;				// run() feeds MIDI clock at 120 BPM
		double clockDebt = 0;
		std::function<void(const synthLib::SMidiEvent&)> userMidi;

		Rig(const Bytes& _rom, const bool _mm, const Bytes& _patchRam = {}, const bool _waitSplash = true)
			: mm(_mm)
			, m(std::make_unique<Machine>(_rom, _mm ? g_mmRomName : g_mdRomName, _patchRam, _waitSplash,
				  _mm ? g_mmModel : md::MachineModel::Machinedrum))
		{
		}

		Machine* operator->() { return m.get(); }

		// run, feeding MIDI clock while extClock is on (24 per quarter at 120 BPM = 20.83 ms)
		void run(const double _ms)
		{
			if(!extClock)
			{
				m->run(_ms);
				return;
			}
			double left = _ms;
			constexpr double clockMs = 60000.0 / (120.0 * 24.0);
			while(left > 0)
			{
				const double slice = std::min(left, clockMs - clockDebt);
				m->run(slice);
				left -= slice;
				clockDebt += slice;
				if(clockDebt >= clockMs - 1e-9)
				{
					clockDebt = 0;
					m->post({0xf8});
				}
			}
		}

		Bytes mmReq(const uint8_t _command, const uint8_t _value) const
		{
			return {0xf0, 0x00, 0x20, 0x3c, 0x03, 0x00, _command, static_cast<uint8_t>(_value & 0x7f), 0xf7};
		}
		Bytes mdReq(const uint8_t _command, const uint8_t _value) const
		{
			return {0xf0, 0x00, 0x20, 0x3c, 0x02, 0x00, _command, static_cast<uint8_t>(_value & 0x7f), 0xf7};
		}

		int status(const uint8_t _param)
		{
			if(mm)
			{
				const auto r = m->request(mmReq(0x70, _param), 0x72);
				return r.size() == 10 && r[7] == _param ? r[8] : -1;
			}
			const auto r = m->request(mdReq(0x70, _param), 0x72);
			return r.size() == 10 && r[7] == _param ? r[8] : -1;
		}

		Bytes dump(const uint8_t _command, const uint8_t _slot)
		{
			return m->request(mm ? mmReq(static_cast<uint8_t>(_command + 1), _slot) : mdReq(static_cast<uint8_t>(_command + 1), _slot), _command);
		}

		int step() { return mm ? m->read8(md::MmTelemetry::g_stepAddress) : m->playhead(); }
		int row() { return m->read8(mm ? md::MmTelemetry::g_songRowAddress : md::SongPosition::g_rowAddress); }
		int songMode() { return status(mm ? 0x10 : 0x10); }
		void setSongMode(const bool _on)
		{
			m->send(mm ? ed::mmSetStatus(ed::MmStatus::SongMode, _on ? 1 : 0) : ed::mdSetStatus(ed::MdStatus::SequencerMode, _on ? 1 : 0));
			run(300);
		}
		void loadPattern(const uint8_t _slot)
		{
			m->send(mm ? ed::mmLoadPattern(_slot) : ed::mdLoadPattern(_slot));
			run(300);
		}
		void loadSong(const uint8_t _slot)
		{
			m->send(mm ? ed::mmLoadSong(_slot) : ed::mdLoadSong(_slot));
			run(300);
		}
	};

	// ---- the panel ---------------------------------------------------------------------------------------------------

	void key(Rig& _r, const md::PanelControl _c, const double _hold = 60, const double _gap = 100)
	{
		const auto p = md::panelPacket(_r->hardware().getModel(), _c);
		require(p.has_value(), "no panel packet");
		_r->hardware().trySendPanelEvent(p->row, p->mask);
		_r.run(_hold);
		_r->hardware().trySendPanelEvent(p->row, 0);
		_r.run(_gap);
	}

	void chord(Rig& _r, const md::PanelControl _c, const double _hold = 60, const double _gap = 100)
	{
		const auto model = _r->hardware().getModel();
		const auto f = *md::panelPacket(model, md::PanelControl::Function);
		const auto t = *md::panelPacket(model, _c);
		md::PanelRowState rows;
		for(const auto pk : {rows.press(f), rows.press(t), rows.release(t), rows.release(f)})
		{
			_r->hardware().trySendPanelEvent(pk.row, pk.mask);
			_r.run(_hold);
		}
		_r.run(_gap);
	}

	// One packet a step, as the desk sends them (mdDeskFirmwareTest); a short gap so no step is lost.
	void turn(Rig& _r, const md::PanelEncoder _e, const int _steps)
	{
		const auto command = md::panelEncoderCommand(_r->hardware().getModel(), _e);
		require(command.has_value(), "no encoder command");
		for(int i = 0; i < std::abs(_steps); ++i)
		{
			_r->hardware().trySendPanelEvent(*command, _steps > 0 ? 0x01 : 0xff);
			_r.run(12);
		}
		_r.run(150);
	}

	const std::map<std::string, md::PanelControl>& keyNames()
	{
		using C = md::PanelControl;
		static const std::map<std::string, C> names = [] {
			std::map<std::string, C> n{{"enter", C::Enter}, {"exit", C::Exit}, {"up", C::Up}, {"down", C::Down}, {"left", C::Left},
				{"right", C::Right}, {"function", C::Function}, {"kit", C::Kit}, {"play", C::Play}, {"stop", C::Stop},
				{"record", C::Record}, {"patsong", C::PatternSong}, {"tempo", C::Tempo}, {"bankgroup", C::BankGroup},
				{"scale", C::Scale}, {"trigselect", C::TrigSelect}, {"songenable", C::SongEnable}, {"routing", C::SynthesisEffectsRouting},
				{"pageup", C::DataPageForward}, {"pagedown", C::DataPageBackward}, {"bankA", C::BankA}, {"bankB", C::BankB},
				{"bankC", C::BankC}, {"bankD", C::BankD}};
			for(int i = 0; i < 16; ++i)
				n["t" + std::to_string(i + 1)] = static_cast<C>(static_cast<int>(C::Trigger1) + i);
			for(int i = 0; i < 6; ++i)
				n["track" + std::to_string(i + 1)] = static_cast<C>(static_cast<int>(C::Track1) + i);
			return n;
		}();
		return names;
	}

	// "f+patsong" = FUNCTION held with PATTERN/SONG; "up*8" = eight times
	void keySeq(Rig& _r, const std::string& _seq)
	{
		std::stringstream ss(_seq);
		std::string tok;
		while(std::getline(ss, tok, ','))
		{
			int times = 1;
			if(const auto star = tok.find('*'); star != std::string::npos)
			{
				times = std::atoi(tok.c_str() + star + 1);
				tok.resize(star);
			}
			if(tok.rfind("snap:", 0) == 0)
			{
				const auto path = tok.substr(5);
				const auto panel = _r->hardware().getFrontPanelSnapshot();
				std::ofstream image(path, std::ios::binary);
				image << "P5\n128 64\n255\n";
				for(uint32_t y = 0; y < 64; ++y)
					for(uint32_t x = 0; x < 128; ++x)
						image.put(panel.getLcdPixel(x, y) ? '\0' : '\xff');
				continue;
			}
			if(tok.rfind("enc", 0) == 0 && tok.size() > 4)	// encA+5, encC-20
			{
				turn(_r, static_cast<md::PanelEncoder>(tok[3] - 'A'), std::atoi(tok.c_str() + 4));
				continue;
			}
			const bool withF = tok.rfind("f+", 0) == 0;
			if(withF)
				tok = tok.substr(2);
			const auto it = keyNames().find(tok);
			require(it != keyNames().end(), "unknown key " + tok);
			for(int i = 0; i < times; ++i)
			{
				if(withF)
					chord(_r, it->second);
				else
					key(_r, it->second);
			}
		}
	}

	// 1:1, '#' lit, '.' dark (a text cell is about 6 x 8 pixels); blank rows are one line
	void printLcd(Rig& _r, const char* _title)
	{
		const auto p = _r->hardware().getFrontPanelSnapshot();
		std::printf("---- LCD %s\n", _title);
		for(uint32_t y = 0; y < 64; ++y)
		{
			std::string line;
			for(uint32_t x = 0; x < 128; ++x)
				line += p.getLcdPixel(x, y) ? '#' : '.';
			std::printf("%02u %s\n", y, line.c_str());
		}
	}

	// ---- MM: dumps reach the machine only on SYSEX RECV (mmEditorProbeFirmwareTest) -------------------------------------

	void mmEnterRecv(Rig& _r)
	{
		using C = md::PanelControl;
		chord(_r, C::Kit, 10, 10);
		key(_r, C::Enter, 10, 10);
		for(int i = 0; i < 4; ++i) key(_r, C::Left, 10, 10);
		for(int i = 0; i < 8; ++i) key(_r, C::Up, 10, 10);
		key(_r, C::Down, 10, 10);
		key(_r, C::Down, 10, 10);
		key(_r, C::Right, 10, 10);
		for(int i = 0; i < 8; ++i) key(_r, C::Up, 10, 10);
		key(_r, C::Down, 10, 10);
		key(_r, C::Enter, 10, 10);
		key(_r, C::Right, 10, 10);
		key(_r, C::Enter, 10, 10);
		_r.run(50);
	}

	void mmLeaveRecv(Rig& _r)
	{
		for(int i = 0; i < 8; ++i) key(_r, md::PanelControl::Exit, 20, 20);
		_r.run(200);
	}

	void mmSendDumps(Rig& _r, const std::vector<Bytes>& _dumps)
	{
		mmEnterRecv(_r);
		for(const auto& d : _dumps)
		{
			_r->send(d);
			_r.run(150);
		}
		mmLeaveRecv(_r);
	}

	// ---- patterns and a song the transport probes play ---------------------------------------------------------------

	// MD: A01 64 steps (pattern mode), A02..A06 8 steps each (song rows 0..4). _silent: no trigs.
	void mdSetupSong(Rig& _r, const bool _silent = false)
	{
		const auto base = ed::decodeMdPattern(_r->request(ed::mdPatternRequest(0), ed::g_mdPatternDump));
		require(base.has_value(), "no pattern A01");
		auto make = [&](const uint8_t _slot, const uint8_t _len, const int _track) {
			auto p = *base;
			p.position = _slot;
			p.length = _len;
			p.trigs.fill(0);
			p.lockMasks.fill(0);
			p.lockedRows = 0;
			if(!_silent)
				p.trigs[static_cast<size_t>(_track)] = _len == 64 ? 0x1111111111111111ull : 0x11ull;
			return p;
		};
		_r->send(ed::encodeMdPattern(make(0, 64, 0)));
		for(uint8_t s = 1; s <= 5; ++s)
			_r->send(ed::encodeMdPattern(make(s, 8, s)));
		ed::MdSong song;
		song.position = 5;
		song.rows.clear();
		for(uint8_t s = 1; s <= 5; ++s)
		{
			ed::MdSongRow row;
			row.pattern = s;
			row.repeats = 0;
			row.start = 0;
			row.end = 8;
			song.rows.push_back(row);
		}
		ed::MdSongRow end;
		end.pattern = ed::MdSongRow::g_endRow;
		song.rows.push_back(end);
		_r->send(ed::encodeMdSong(song));
		_r.run(200);
		// song 7 (slot 6): rows of unequal length and a repeat, for the SPP-to-row mapping: row 0 = A02 8 steps played twice,
		// row 1 = A03 4 steps, row 2 = A04 8, row 3 = A05 8, END
		ed::MdSong mapSong;
		mapSong.position = 6;
		mapSong.rows.clear();
		const uint8_t ends[4] = {8, 4, 8, 8}, reps[4] = {1, 0, 0, 0};
		for(uint8_t i = 0; i < 4; ++i)
		{
			ed::MdSongRow row;
			row.pattern = static_cast<uint8_t>(i + 1);
			row.repeats = reps[i];
			row.start = 0;
			row.end = ends[i];
			mapSong.rows.push_back(row);
		}
		mapSong.rows.push_back(end);
		_r->send(ed::encodeMdSong(mapSong));
		_r.run(200);
		_r.loadSong(5);
		_r.loadPattern(0);
	}

	void mmSetupSong(Rig& _r)
	{
		auto base = *ed::decodeMmPattern(_r.dump(0x67, 0));
		std::vector<Bytes> dumps;
		auto make = [&](const uint8_t _slot, const uint8_t _len) {
			auto p = base;
			p.position = _slot;
			p.length = _len;
			return p;
		};
		dumps.push_back(ed::encodeMmPattern(make(0, 64)));
		for(uint8_t s = 1; s <= 5; ++s)
			dumps.push_back(ed::encodeMmPattern(make(s, 8)));
		ed::MmSong song;
		song.position = 5;
		const auto setRow = [&](const size_t _i, const uint8_t _pattern) {
			auto& b = song.rows[_i].bytes;
			b.fill(0);
			b[ed::mmSongRow::g_pattern] = _pattern;
			b[ed::mmSongRow::g_length] = _pattern < 0xfe ? 8 : 0;
			b[ed::mmSongRow::g_tempo] = b[ed::mmSongRow::g_tempo + 1] = 0xff;
		};
		song.name.fill(0);
		for(size_t i = 0; i < song.rows.size(); ++i)
			setRow(i, ed::MmSong::g_end);
		for(uint8_t s = 1; s <= 5; ++s)
			setRow(s - 1, s);
		dumps.push_back(ed::encodeMmSong(song));
		// song 7 (slot 6): unequal row lengths and a repeat: row 0 = pattern 2 (8 steps) played twice, row 1 = 4 steps, row 2, row 3
		auto mapSong = song;
		mapSong.position = 6;
		const uint8_t lens[4] = {8, 4, 8, 8}, reps[4] = {1, 0, 0, 0};
		for(size_t i = 0; i < 4; ++i)
		{
			setRow(i, static_cast<uint8_t>(i + 1));
			mapSong.rows[i] = song.rows[i];
			mapSong.rows[i].bytes[ed::mmSongRow::g_length] = lens[i];
			mapSong.rows[i].bytes[ed::mmSongRow::g_repeats] = reps[i];
		}
		{
			auto& e = mapSong.rows[4].bytes;
			e.fill(0);
			e[ed::mmSongRow::g_pattern] = ed::MmSong::g_end;
			e[ed::mmSongRow::g_tempo] = e[ed::mmSongRow::g_tempo + 1] = 0xff;
		}
		// setRow wrote into `song` (the rows 0-3 are the same as before: restore its lengths)
		for(size_t i = 0; i < 4; ++i)
			song.rows[i].bytes[ed::mmSongRow::g_length] = 8;
		dumps.back() = ed::encodeMmSong(song);
		dumps.push_back(ed::encodeMmSong(mapSong));
		mmSendDumps(_r, dumps);
		_r.loadSong(5);
		_r.loadPattern(0);
	}

	// MM: set a few global fields through SYSEX RECV, make the slot active, read it back.
	ed::MmGlobal mmSetGlobal(Rig& _r, const std::function<void(ed::MmGlobal&)>& _change)
	{
		const int slot = _r.status(0x01);
		auto g = *ed::decodeMmGlobal(_r.dump(0x50, static_cast<uint8_t>(slot)));
		_change(g);
		mmSendDumps(_r, {ed::encodeMmGlobal(g)});
		_r->send(ed::mmSetActiveGlobal(static_cast<uint8_t>(slot)));
		_r.run(500);
		auto back = ed::decodeMmGlobal(_r.dump(0x50, static_cast<uint8_t>(slot)));
		require(back.has_value(), "no global read back");
		return *back;
	}

	// ---- P1: Song Position Pointer + Continue --------------------------------------------------------------------------

	struct Seen
	{
		int step0 = -1, row0 = -1;
		int stepEnd = -1, rowEnd = -1;
		bool stepMoved = false;
		std::string trace;
	};

	// Sample step and row every 20 ms for _ms, the trace every 100 ms.
	Seen watch(Rig& _r, const double _ms)
	{
		Seen s;
		int last = -1;
		for(double t = 0; t < _ms; t += 20)
		{
			_r.run(20);
			const int st = _r.step(), ro = _r.row();
			if(t == 0)
			{
				s.step0 = st;
				s.row0 = ro;
			}
			if(last >= 0 && st != last)
				s.stepMoved = true;
			last = st;
			s.stepEnd = st;
			s.rowEnd = ro;
			if(std::fmod(t, 100) < 20)
			{
				char b[24];
				std::snprintf(b, sizeof b, " %d/%d", st, ro);
				s.trace += b;
			}
		}
		return s;
	}

	void halt(Rig& _r)
	{
		key(_r, md::PanelControl::Stop);
		key(_r, md::PanelControl::Stop);
		_r.run(200);
	}

	std::string fmt(const Seen& _s)
	{
		char b[160];
		std::snprintf(b, sizeof b, "first step %d row %d, then step %d row %d%s; trace (step/row)%s", _s.step0, _s.row0, _s.stepEnd, _s.rowEnd,
			_s.stepMoved ? " (playing)" : " (standing)", _s.trace.c_str());
		return b;
	}

	// what sppSuite saw, for the RESULT line: SPP + CONTINUE that played from the pointer (pattern: the step; song: the
	// row, 8 steps a row), and a MIDI STOP that held the step and a CONTINUE that went on from it
	struct SppTally
	{
		int patternHit = 0, patternAll = 0, songHit = 0, songAll = 0, pauseHit = 0, pauseAll = 0;
	};
	SppTally g_tally;

	std::string tallyText(const SppTally& _t)
	{
		char b[160];
		std::snprintf(b, sizeof b, "pattern mode %d/%d from the step, song mode %d/%d on the row, MIDI STOP + CONTINUE resumes %d/%d", _t.patternHit,
			_t.patternAll, _t.songHit, _t.songAll, _t.pauseHit, _t.pauseAll);
		return b;
	}

	void sppSuite(Rig& _r, const std::string& _label)
	{
		g_tally = {};
		const std::string m = _r.mm ? "MM" : "MD";
		std::printf("-- %s %s\n", m.c_str(), _label.c_str());
		for(const bool song : {false, true})
		{
			_r.setSongMode(song);
			if(!song)
				_r.loadPattern(0);
			else
				_r.loadSong(5);
			halt(_r);
			std::printf("  %s mode, after STOP STOP: step %d row %d\n", song ? "SONG" : "PATTERN", _r.step(), _r.row());
			const std::vector<int> values = song ? std::vector<int>{0, 1, 2, 3, 8, 16, 24} : std::vector<int>{0, 4, 16, 40};
			for(const int spp : values)
			{
				halt(_r);
				_r->send({0xf2, static_cast<uint8_t>(spp & 0x7f), static_cast<uint8_t>(spp >> 7)});
				_r.run(60);
				_r->send({0xfb});
				const auto s = watch(_r, 400);
				std::printf("  %s SPP %2d + CONTINUE: %s\n", song ? "SONG   " : "PATTERN", spp, fmt(s).c_str());
				// played from the pointer: after 400 ms (about 3 steps at 120 BPM) the step is 2-4 past it (pattern), or the
				// first row read is the pointer's row (song; the MD's row address moves to the next row about 2 steps early)
				if(song)
				{
					++g_tally.songAll;
					g_tally.songHit += s.stepMoved && s.row0 == spp / 8;
				}
				else
				{
					++g_tally.patternAll;
					g_tally.patternHit += s.stepMoved && s.stepEnd >= spp + 2 && s.stepEnd <= spp + 4;
				}
				_r->send({0xfc});
				_r.run(100);
			}
			// SPP alone, then START (0xfa) and then the panel PLAY: where does it begin?
			for(const int spp : song ? std::vector<int>{2} : std::vector<int>{16})
			{
				halt(_r);
				_r->send({0xf2, static_cast<uint8_t>(spp), 0});
				_r.run(100);
				const auto stopped = std::to_string(_r.step()) + "/" + std::to_string(_r.row());
				key(_r, md::PanelControl::Play);
				const auto s = watch(_r, 300);
				std::printf("  %s SPP %2d, then panel PLAY (stopped state %s): %s\n", song ? "SONG   " : "PATTERN", spp, stopped.c_str(), fmt(s).c_str());
				halt(_r);
				_r->send({0xf2, static_cast<uint8_t>(spp), 0});
				_r.run(60);
				_r->send({0xfa});
				const auto s2 = watch(_r, 300);
				std::printf("  %s SPP %2d + START: %s\n", song ? "SONG   " : "PATTERN", spp, fmt(s2).c_str());
				_r->send({0xfc});
				_r.run(100);
			}
			// pause: start, run to the middle, FC, hold, FB
			halt(_r);
			_r->send({0xf2, 0, 0});
			_r.run(60);
			_r->send({0xfb});
			_r.run(520);
			const int sA = _r.step(), rA = _r.row();
			_r->send({0xfc});
			_r.run(300);
			const int sB = _r.step(), rB = _r.row();
			_r.run(500);
			const int sC = _r.step(), rC = _r.row();
			_r->send({0xfb});
			const auto resumed = watch(_r, 300);
			std::printf("  %s pause: playing at %d/%d, MIDI STOP -> %d/%d, 500 ms later %d/%d (%s), MIDI CONTINUE: %s\n", song ? "SONG   " : "PATTERN",
				sA, rA, sB, rB, sC, rC, sB == sC ? "held" : "kept moving", fmt(resumed).c_str());
			++g_tally.pauseAll;
			g_tally.pauseHit += sB == sC && resumed.stepMoved && resumed.step0 == sC;
			_r->send({0xfc});
			_r.run(100);
			// pause with the panel: STOP once, then CONTINUE
			halt(_r);
			_r->send({0xfb});
			_r.run(520);
			const int pA = _r.step(), pRowA = _r.row();
			key(_r, md::PanelControl::Stop);
			_r.run(200);
			const int pB = _r.step(), pRowB = _r.row();
			_r->send({0xfb});
			const auto resumed2 = watch(_r, 300);
			std::printf("  %s pause: playing at %d/%d, panel STOP once -> %d/%d, MIDI CONTINUE: %s\n", song ? "SONG   " : "PATTERN", pA, pRowA, pB, pRowB,
				fmt(resumed2).c_str());
			_r->send({0xfc});
			_r.run(100);
			halt(_r);
		}
		result(_r.mm ? "P1 MM" : "P1 MD", _label + ": " + tallyText(g_tally));
	}

	// SPP into a song whose rows are not all 8 steps (song slot 6: 8 steps played twice, 4, 8, 8, END)
	void sppRows(Rig& _r)
	{
		const std::string m = _r.mm ? "MM" : "MD";
		std::printf("-- %s SPP into unequal rows (song 7: row 0 = 8 steps x2, row 1 = 4 steps, row 2 = 8, row 3 = 8)\n", m.c_str());
		_r.setSongMode(true);
		_r.loadSong(6);
		for(const int spp : {0, 4, 8, 12, 16, 18, 20, 24, 28, 36})
		{
			halt(_r);
			_r->send({0xf2, static_cast<uint8_t>(spp & 0x7f), static_cast<uint8_t>(spp >> 7)});
			_r.run(60);
			_r->send({0xfb});
			const auto s = watch(_r, 300);
			std::printf("  SPP %2d + CONTINUE: %s\n", spp, fmt(s).c_str());
			_r->send({0xfc});
			_r.run(100);
		}
		halt(_r);
	}

	void p1(const Bytes& _rom, const bool _mm)
	{
		std::printf("== P1 %s: Song Position Pointer (0xF2) + Continue (0xFB)\n", _mm ? "MM" : "MD");
		Rig r(_rom, _mm);
		if(_mm)
			mmSetupSong(r);
		else
			mdSetupSong(r);
		// the rig itself
		r.setSongMode(false);
		r.loadPattern(0);
		key(r, md::PanelControl::Play);
		const auto played = watch(r, 400);
		check(played.stepMoved, "the rig: panel PLAY moves the playhead");
		halt(r);
		if(_mm)
		{
			const auto g0 = *ed::decodeMmGlobal(r.dump(0x50, static_cast<uint8_t>(r.status(0x01))));
			std::printf("  global as booted: TRANSPORT IN %d, TEMPO SYNC %d\n", g0.transportIn, g0.tempoSync);
			sppSuite(r, "TRANSPORT IN as booted (IGNORE expected), internal clock");
			const auto g1 = mmSetGlobal(r, [](ed::MmGlobal& _g) { _g.transportIn = 1; });
			check(g1.transportIn == 1, "TRANSPORT IN = ACCEPT read back");
			sppSuite(r, "TRANSPORT IN = ACCEPT, internal clock");
			sppRows(r);
			mmSetGlobal(r, [](ed::MmGlobal& _g) { _g.transportIn = 1; _g.tempoSync = 1; });
			r.extClock = true;
			r.run(500);
			sppSuite(r, "TRANSPORT IN = ACCEPT, TEMPO SYNC = EXT (clock fed at 120 BPM)");
			r.extClock = false;
		}
		else
		{
			const int slot = r.status(0x01);
			auto g = *ed::decodeMdGlobal(r.dump(0x50, static_cast<uint8_t>(slot)));
			std::printf("  global as booted: sync flags %02x\n", g.syncFlags);
			sppSuite(r, "CTRL IN on (as booted), internal clock");
			sppRows(r);
			auto g2 = g;
			g2.syncFlags = static_cast<uint8_t>(g.syncFlags | ed::mdGlobalBits::g_tempoInExternal);
			r->send(ed::encodeMdGlobal(g2));
			r->send(ed::mdSetActiveGlobal(static_cast<uint8_t>(slot)));
			r.run(500);
			r.extClock = true;
			r.run(500);
			sppSuite(r, "CTRL IN on, TEMPO IN = external (clock fed at 120 BPM)");
			r.extClock = false;
			auto g3 = g;
			g3.syncFlags = static_cast<uint8_t>(g.syncFlags | ed::mdGlobalBits::g_ctrlInOff);
			r->send(ed::encodeMdGlobal(g3));
			r->send(ed::mdSetActiveGlobal(static_cast<uint8_t>(slot)));
			r.run(500);
			sppSuite(r, "CTRL IN off (gate control: expected to ignore all)");
		}
	}



	// ---- P1b (wave 2): a pause after the panel's PLAY ---------------------------------------------------------------------
	// The editor starts the emulated machine with the panel's PLAY. Does MIDI Stop + Continue then go on from the step (P1
	// started it with the song position and Continue), and is the panel's PLAY while playing a pause? Pattern and song mode.
	void p1pause(const Bytes& _rom, const bool _mm)
	{
		std::printf("== P1b %s: pause after the panel's PLAY\n", _mm ? "MM" : "MD");
		Rig r(_rom, _mm);
		if(_mm)
		{
			mmSetupSong(r);
			mmSetGlobal(r, [](ed::MmGlobal& _g) { _g.transportIn = 1; });
		}
		else
			mdSetupSong(r);
		std::string answer;
		for(const bool song : {false, true})
		{
			r.setSongMode(song);
			if(!song)
				r.loadPattern(0);
			struct Way
			{
				const char* name;
				std::function<void()> pause, resume;
			};
			int held = -1;
			const std::vector<Way> ways{
				{"MIDI STOP, MIDI CONTINUE", [&] { r->send({0xfc}); }, [&] { r->send({0xfb}); }},
				{"MIDI STOP, the song position of the held step, MIDI CONTINUE", [&] { r->send({0xfc}); },
					[&] { r->send({0xf2, static_cast<uint8_t>(held & 0x7f), static_cast<uint8_t>(held >> 7)}); r->send({0xfb}); }},
				{"panel PLAY, panel PLAY", [&] { key(r, md::PanelControl::Play); }, [&] { key(r, md::PanelControl::Play); }},
				{"panel PLAY, MIDI CONTINUE", [&] { key(r, md::PanelControl::Play); }, [&] { r->send({0xfb}); }},
			};
			for(const auto& w : ways)
			{
				halt(r);
				r.run(200);
				key(r, md::PanelControl::Play);
				r.run(700);
				const int a = r.step(), ra = r.row();
				w.pause();
				r.run(300);
				const int b = r.step(), rb = r.row();
				r.run(500);
				const int c = r.step();
				held = b;
				w.resume();
				const auto after = watch(r, 300);
				const bool holds = b == c, goesOn = after.stepMoved && after.step0 == c;
				std::printf("  %s %-58s playing %d/%d, paused %d/%d, 500 ms later %d (%s); resumed: %s%s\n", song ? "SONG   " : "PATTERN", w.name, a, ra, b, rb, c,
					holds ? "held" : "moving", fmt(after).c_str(), holds && goesOn ? "   PAUSE" : "");
				if(holds && goesOn)
					answer += std::string(song ? "song: " : "pattern: ") + w.name + "; ";
			}
		}
		halt(r);
		result(_mm ? "P1b MM" : "P1b MD", answer.empty() ? "no way paused and went on from the step" : "pauses: " + answer);
	}

	// ---- P3: MD TRIG IN A / B (the global's ten input bytes) -------------------------------------------------------------

	std::string diffGlobal(const ed::MdGlobal& _a, const ed::MdGlobal& _b)
	{
		const auto a = ed::encodeMdGlobal(_a), b = ed::encodeMdGlobal(_b);
		std::string out;
		char x[48];
		for(size_t i = 0; i < a.size() && i < b.size(); ++i)
			if(a[i] != b[i] && i < 0xc0)
			{
				std::snprintf(x, sizeof x, " [0x%03zx] %02x->%02x", i, a[i], b[i]);
				out += x;
			}
		return out.empty() ? " (no change)" : out;
	}

	std::string inputs(const ed::MdGlobal& _g)
	{
		char x[64];
		std::string s = "A:";
		for(int i = 0; i < 10; ++i)
		{
			std::snprintf(x, sizeof x, "%s%d", i == 5 ? "  B:" : " ", _g.inputSettings[static_cast<size_t>(i)]);
			s += x;
		}
		return s;
	}

	void p3(const Bytes& _rom)
	{
		std::puts("== P3 MD: TRIG IN A / B bytes of the global (inputSettings, 10 bytes)");
		Rig r(_rom, false);
		const int slot = r.status(0x01);
		const auto readG = [&] { return *ed::decodeMdGlobal(r.dump(0x50, static_cast<uint8_t>(slot))); };
		const auto g0 = readG();
		std::printf("  global slot %d as booted: %s\n", slot, inputs(g0).c_str());
		const char* names[5] = {"A (GATE)", "B (SENS)", "C (VMIN)", "D (VMAX)", "E (DEST)"};
		std::string layout;
		for(int input = 0; input < 2; ++input)
		{
			std::printf("-- TRIG IN %c\n", input ? 'B' : 'A');
			keySeq(r, std::string("f+patsong,enter,down,right,") + (input ? "down,down" : "down") + ",enter");
			if(std::getenv("P3_SNAP"))
				keySeq(r, std::string("snap:") + std::getenv("P3_SNAP") + (input ? "B.pgm" : "A.pgm"));
			for(int e = 0; e < 5; ++e)
			{
				const auto before = readG();
				turn(r, static_cast<md::PanelEncoder>(e), 1);
				const auto one = readG();
				turn(r, static_cast<md::PanelEncoder>(e), 20);
				const auto up = readG();
				turn(r, static_cast<md::PanelEncoder>(e), 127);
				const auto max = readG();
				turn(r, static_cast<md::PanelEncoder>(e), -127);
				const auto min = readG();
				turn(r, static_cast<md::PanelEncoder>(e), -127);
				std::printf("  knob %s: +1:%s | +20:%s | max(+127):%s | min(-127):%s\n", names[e], diffGlobal(before, one).c_str(),
					diffGlobal(before, up).c_str(), diffGlobal(before, max).c_str(), diffGlobal(before, min).c_str());
				std::printf("          now %s\n", inputs(min).c_str());
				// which byte moved
				for(size_t i = 0; i < 10; ++i)
					if(before.inputSettings[i] != max.inputSettings[i] || before.inputSettings[i] != min.inputSettings[i])
					{
						char x[96];
						std::snprintf(x, sizeof x, "TRIG IN %c knob %s -> inputSettings[%zu] (min %d, max %d, start %d)\n", input ? 'B' : 'A', names[e], i,
							min.inputSettings[i], max.inputSettings[i], before.inputSettings[i]);
						layout += x;
					}
			}
			for(int i = 0; i < 6; ++i)
				key(r, md::PanelControl::Exit, 40, 80);
		}
		std::printf("%s", layout.c_str());
		// the same bytes by SysEx: a global dump with new values, made active (0x56), read back and shown on the panel
		auto g = readG();
		const std::array<uint8_t, 10> want{3, 16, 50, 1, 60, 0, 10, 0, 90, 127};	// A: DEST track 4, GATE 50, SENS 60, VMIN 10, VMAX 90
		g.inputSettings = want;
		r->send(ed::encodeMdGlobal(g));
		r->send(ed::mdSetActiveGlobal(static_cast<uint8_t>(slot)));
		r.run(500);
		const auto back = readG();
		std::printf("  by SysEx: sent %s, read back %s\n", inputs(g).c_str(), inputs(back).c_str());
		// what the screen shows: right after the 0x56 of the slot already active, then after another slot and back
		const auto showTrigInA = [&](const char* _when) {
			keySeq(r, "f+patsong,enter,down,right,up*4,down,enter");	// the menu keeps its cursor: from the top
			r.run(200);
			if(std::getenv("P3_LCD"))
				printLcd(r, _when);
			if(const char* snap = std::getenv("P3_SNAP"))
				keySeq(r, std::string("snap:") + snap + _when + ".pgm");
			for(int i = 0; i < 6; ++i)
				key(r, md::PanelControl::Exit, 40, 80);
		};
		showTrigInA("sysex");
		r->send(ed::mdSetActiveGlobal(static_cast<uint8_t>((slot + 1) % 8)));
		r.run(500);
		r->send(ed::mdSetActiveGlobal(static_cast<uint8_t>(slot)));
		r.run(500);
		showTrigInA("switched");
		const auto afterPanel = readG();
		std::printf("  after opening TRIG IN A on the panel twice: %s\n", inputs(afterPanel).c_str());
		check(back.inputSettings == want, "inputSettings written by SysEx read back unchanged");
		result("P3", std::string(layout.empty() ? "no inputSettings byte moved" : "interleaved A/B: [0] DEST A, [1] DEST B, [2] GATE A, [3] GATE B, [4] SENS A, [5] SENS B, [6] VMIN A, [7] VMIN B, [8] VMAX A, [9] VMAX B")
			+ (back.inputSettings == want ? "; a SysEx global sets them (read back unchanged)" : "; a SysEx global does NOT keep them"));
	}


	// ---- P5: what silences every voice over MIDI on the MD ----------------------------------------------------------------

	double rms(const std::vector<float>& _l, const std::vector<float>& _r, const size_t _from, const size_t _to)
	{
		double e = 0;
		const size_t to = std::min({_to, _l.size(), _r.size()});
		for(size_t i = _from; i < to; ++i)
			e += double(_l[i]) * _l[i] + double(_r[i]) * _r[i];
		return to > _from ? std::sqrt(e / double(to - _from)) : 0;
	}

	// tracks 1-4 on the base channel (1 as booted), the MD's mute and level CCs
	void mdMutes(Rig& _r, const bool _on)
	{
		namespace a = md::automation;
		for(uint8_t t = 0; t < 4; ++t)
			if(const auto cc = a::encodeParameterChange(md::MachineModel::Machinedrum, {a::machinedrum::Mute, t, 0, static_cast<uint8_t>(_on ? 1 : 0)}, 0))
				_r->send({(*cc)[0], (*cc)[1], (*cc)[2]});
	}

	void mdLevels(Rig& _r, const uint8_t _value)
	{
		namespace a = md::automation;
		for(uint8_t t = 0; t < 4; ++t)
			if(const auto cc = a::encodeParameterChange(md::MachineModel::Machinedrum, {a::machinedrum::Level, t, 0, _value}, 0))
				_r->send({(*cc)[0], (*cc)[1], (*cc)[2]});
	}

	void p5(const Bytes& _rom)
	{
		std::puts("== P5 MD: Stop twice over MIDI, other routes to silence every voice");
		Rig r(_rom, false);
		mdSetupSong(r, true);	// A01 plays but holds no trig: the sequencer runs silently
		r.setSongMode(false);
		r.loadPattern(0);
		// tracks 1-4: a sine (GND-SIN: PTCH, DEC, RAMP, RDEC) with the longest decay, a pitch of 40, no ramp
		const auto voices = [&] {
		for(uint8_t t = 0; t < 4; ++t)
		{
			r->send(ed::mdAssignMachine(t, *ed::mdMachineModel("GND-SIN"), ed::MdMachineInit::SynthesisEffectsRouting));
			r.run(100);
			const uint8_t base = static_cast<uint8_t>(16 + 24 * t);
			r->send({0xb0, static_cast<uint8_t>(base + 0), static_cast<uint8_t>(30 + 6 * t)});	// PTCH
			r->send({0xb0, static_cast<uint8_t>(base + 1), 127});							// DEC
			r->send({0xb0, static_cast<uint8_t>(base + 2), 0});							// RAMP
			r.run(100);
		}
		};
		voices();
		const auto tail = [&](const double _afterMs, const double _windowMs) {
			r.run(_afterMs);
			const auto from = r->left().size();
			r.run(_windowMs);
			return rms(r->left(), r->right(), from, r->left().size());
		};
		const auto trigger = [&] {
			for(const auto t : {md::PanelControl::Trigger1, md::PanelControl::Trigger2, md::PanelControl::Trigger3, md::PanelControl::Trigger4})
				key(r, t, 30, 20);
		};
		if(std::getenv("P5_TRACE"))
		{
			for(const int amd : {127})
			{
				for(const auto t : {md::PanelControl::Trigger1, md::PanelControl::Trigger2, md::PanelControl::Trigger3, md::PanelControl::Trigger4})
				{
					halt(r);
					r.run(1500);
					const auto from = r->left().size();
					key(r, t, 30, 20);
					std::printf("  AMD %d trigger %d: rms per 250 ms:", amd, static_cast<int>(t));
					for(int i = 0; i < 12; ++i)
					{
						const auto a = r->left().size();
						r.run(250);
						std::printf(" %.5f", rms(r->left(), r->right(), a, r->left().size()));
					}
					std::printf("   (from %zu)\n", from);
				}
			}
			return;
		}
		struct Scenario
		{
			std::string name;
			bool playing;
			std::function<void()> action;
		};
		const std::vector<Scenario> scenarios{
			{"nothing (control: the tails persist)", false, [] {}},
			{"stopped, MIDI STOP (0xFC) once", false, [&] { r->send({0xfc}); }},
			{"stopped, MIDI STOP x2 back to back", false, [&] { r->send({0xfc}); r->send({0xfc}); }},
			{"stopped, MIDI STOP, 100 ms, MIDI STOP", false, [&] { r->send({0xfc}); r.run(100); r->send({0xfc}); }},
			{"playing, MIDI STOP once", true, [&] { r->send({0xfc}); }},
			{"playing, MIDI STOP, 100 ms, MIDI STOP", true, [&] { r->send({0xfc}); r.run(100); r->send({0xfc}); }},
			{"playing, MIDI STOP x2 back to back", true, [&] { r->send({0xfc}); r->send({0xfc}); }},
			{"playing, panel STOP once", true, [&] { key(r, md::PanelControl::Stop, 30, 0); }},
			{"playing, panel STOP twice (the manual's way)", true, [&] { key(r, md::PanelControl::Stop, 30, 10); key(r, md::PanelControl::Stop, 30, 0); }},
			{"stopped, panel STOP twice", false, [&] { key(r, md::PanelControl::Stop, 30, 10); key(r, md::PanelControl::Stop, 30, 0); }},
			{"CC 123 (all notes off) on channel 1", false, [&] { r->send({0xb0, 123, 0}); }},
			{"CC 120 (all sound off) on channel 1", false, [&] { r->send({0xb0, 120, 0}); }},
			{"CC 123 + CC 120 on channels 1-4", false, [&] { for(uint8_t c = 0; c < 4; ++c) { r->send({static_cast<uint8_t>(0xb0 | c), 123, 0}); r->send({static_cast<uint8_t>(0xb0 | c), 120, 0}); } }},
			{"MIDI system reset (0xFF)", false, [&] { r->send({0xff}); }},
			{"note off, every note 0-127 on channel 1", false, [&] { for(uint8_t n = 0; n < 128; ++n) r->send({0x80, n, 0}); }},
			{"LOAD PATTERN A01 (SysEx 0x57)", false, [&] { r->send(ed::mdLoadPattern(0)); }},
			{"re-assign tracks 1-4 (SysEx 0x5B, init synthesis)", false, [&] { for(uint8_t t = 0; t < 4; ++t) r->send(ed::mdAssignMachine(t, *ed::mdMachineModel("GND-SIN"), ed::MdMachineInit::Synthesis)); }},
			{"mute CC on tracks 1-4 (on, 50 ms, off)", false, [&] { mdMutes(r, true); r.run(50); mdMutes(r, false); }},
			{"mute CC on tracks 1-4 (left on)", false, [&] { mdMutes(r, true); }},
			{"level CC 0 on tracks 1-4 (left at 0)", false, [&] { mdLevels(r, 0); }},
			{"level CC 0 on tracks 1-4, 50 ms, back to 100", false, [&] { mdLevels(r, 0); r.run(50); mdLevels(r, 100); }},
			{"LOAD KIT of the kit that plays (SysEx 0x58)", false, [&] { r->send(ed::mdLoadKit(static_cast<uint8_t>(std::max(0, r.status(0x02))))); }},
			{"MIDI STOP x2 + CC 123/120 on channels 1-4", false, [&] { r->send({0xfc}); r->send({0xfc}); for(uint8_t c = 0; c < 4; ++c) { r->send({static_cast<uint8_t>(0xb0 | c), 123, 0}); r->send({static_cast<uint8_t>(0xb0 | c), 120, 0}); } }},
		};
		double controlTail = 0, panelTail = 1;
		std::string answers;
		for(const auto& sc : scenarios)
		{
			halt(r);
			r->send({0xfc});
			mdMutes(r, false);
			mdLevels(r, 100);
			voices();
			r.run(300);
			if(sc.playing)
				key(r, md::PanelControl::Play);
			trigger();
			const double before = tail(100, 200);
			sc.action();
			const double d1 = tail(100, 400);
			const double d2 = tail(0, 400);
			std::printf("  %-48s before %.5f -> after %.5f, then %.5f%s\n", sc.name.c_str(), before, d1, d2,
				before > 1e-4 && d1 < before * 0.05 ? "   SILENT" : "");
			if(sc.name.rfind("nothing", 0) == 0)
				controlTail = d1;
			if(sc.name == "playing, panel STOP twice (the manual's way)")
				panelTail = d1;
			if(before > 1e-4 && d1 < before * 0.05)
				answers += sc.name + "; ";
		}
		check(controlTail > 1e-3, "the rig: the control scenario keeps sounding (" + std::to_string(controlTail) + ")");
		(void)panelTail;
		result("P5", answers.empty() ? "no scenario silenced the voices" : "silent after: " + answers);
	}

	// ---- P5 MM (wave 2): what silences the Monomachine's voices -----------------------------------------------------------------
	// Six notes held (note on, no note off) on the six track channels (1-6 as booted), then one action and the level after it.

	void p5mm(const Bytes& _rom)
	{
		std::puts("== P5 MM: held notes on the six tracks, what silences them");
		Rig r(_rom, true);
		r.setSongMode(false);
		const auto hold = [&] {
			for(uint8_t c = 0; c < 6; ++c)
				r->send({static_cast<uint8_t>(0x90 | c), static_cast<uint8_t>(48 + 3 * c), 110});
		};
		const auto release = [&] {
			for(uint8_t c = 0; c < 6; ++c)
				r->send({static_cast<uint8_t>(0x80 | c), static_cast<uint8_t>(48 + 3 * c), 0});
		};
		const auto level = [&](const double _afterMs, const double _windowMs) {
			r.run(_afterMs);
			const auto from = r->left().size();
			r.run(_windowMs);
			return rms(r->left(), r->right(), from, r->left().size());
		};
		const auto ccAll = [&](const uint8_t _cc) {
			for(uint8_t c = 0; c < 6; ++c)
				r->send({static_cast<uint8_t>(0xb0 | c), _cc, 0});
		};
		struct Scenario
		{
			std::string name;
			bool playing;
			std::function<void()> action;
		};
		const std::vector<Scenario> scenarios{
			{"nothing (control: the held notes go on)", false, [] {}},
			{"note off for the held notes (control)", false, [&] { release(); }},
			{"MIDI STOP (0xFC) once", false, [&] { r->send({0xfc}); }},
			{"MIDI STOP x2", false, [&] { r->send({0xfc}); r->send({0xfc}); }},
			{"CC 123 (all notes off) on channels 1-6", false, [&] { ccAll(123); }},
			{"CC 120 (all sound off) on channels 1-6", false, [&] { ccAll(120); }},
			{"CC 120 + CC 123 on channels 1-6", false, [&] { ccAll(120); ccAll(123); }},
			{"panel STOP once", false, [&] { key(r, md::PanelControl::Stop, 30, 0); }},
			{"panel STOP twice", false, [&] { key(r, md::PanelControl::Stop, 30, 10); key(r, md::PanelControl::Stop, 30, 0); }},
			{"playing, panel STOP twice", true, [&] { key(r, md::PanelControl::Stop, 30, 10); key(r, md::PanelControl::Stop, 30, 0); }},
			{"playing, CC 120 + CC 123 on channels 1-6", true, [&] { ccAll(120); ccAll(123); }},
		};
		double control = 0;
		std::string answers;
		for(const auto& sc : scenarios)
		{
			halt(r);
			release();
			ccAll(123);
			r.run(1500);
			if(sc.playing)
				key(r, md::PanelControl::Play);
			hold();
			const double before = level(300, 200);
			sc.action();
			const double d1 = level(100, 400);
			const double d2 = level(0, 400);
			const bool silent = before > 1e-4 && d1 < before * 0.05;
			std::printf("  %-48s before %.5f -> after %.5f, then %.5f%s\n", sc.name.c_str(), before, d1, d2, silent ? "   SILENT" : "");
			if(sc.name.rfind("nothing", 0) == 0)
				control = d1;
			if(silent)
				answers += sc.name + "; ";
		}
		release();
		ccAll(123);
		check(control > 1e-3, "the rig: the control scenario keeps sounding (" + std::to_string(control) + ")");
		result("P5mm", answers.empty() ? "no scenario silenced the voices" : "silent after: " + answers);
	}

	// ---- P7: the MD's EDIT ALL marks: which tracks a pattern-wide accent reaches (wave 3, the track dots) -------------
	// A sine on track 1, one trig on step 1, accent amount 15; each scenario is a pattern dump (A01) with the accent
	// fields set, LOAD PATTERN, PLAY, the level of the first 300 ms, STOP. An accented trig is louder than the plain one.
	// Measured 2026-10-11: any nonzero editAll is ALL (0x0002, a mask without track 1, still accents track 1), the
	// pattern-wide row then reaches the track whatever its own row holds, and per track only the own row counts. So
	// there is no per-track "takes the ALL row" setting to edit: ALL means every track.

	void p7(const Bytes& _rom)
	{
		std::puts("== P7 MD: EDIT ALL accent: which tracks take the pattern-wide row; is editAll a flag or a track mask");
		Rig r(_rom, false);
		const auto base = ed::decodeMdPattern(r->request(ed::mdPatternRequest(0), ed::g_mdPatternDump));
		require(base.has_value(), "no pattern A01");
		for(uint8_t t = 0; t < 1; ++t)	// track 1: CCs 16-39 on the base channel (track 2's level drifted between runs: not used)
		{
			r->send(ed::mdAssignMachine(t, *ed::mdMachineModel("GND-SIN"), ed::MdMachineInit::SynthesisEffectsRouting));
			r.run(100);
			const uint8_t b = static_cast<uint8_t>(16 + 24 * t);
			r->send({0xb0, static_cast<uint8_t>(b + 0), 40});	// PTCH
			r->send({0xb0, static_cast<uint8_t>(b + 1), 90});	// DEC
			r->send({0xb0, static_cast<uint8_t>(b + 2), 0});	// RAMP
			r.run(100);
		}
		struct Scenario
		{
			const char* name;
			uint32_t editAll;
			uint64_t all;
			uint64_t own;		// the track's own accent row
			uint64_t other;		// the other tracks' own rows
		};
		const Scenario scenarios[] = {
			{"no accent (EDIT ALL 1, every row empty)", 1, 0, 0, 0},
			{"EDIT ALL 1, pattern-wide step 1, own rows empty", 1, 1, 0, 0},
			{"EDIT ALL 1, pattern-wide empty, own row step 1", 1, 0, 1, 0},
			{"EDIT ALL 0, pattern-wide step 1, own row empty", 0, 1, 0, 0},
			{"EDIT ALL 0, own row step 1", 0, 0, 1, 0},
			{"EDIT ALL 0, another track's own row step 1", 0, 0, 0, 1},
			{"editAll 0x0002 (a mask without track 1), pattern-wide step 1", 2, 1, 0, 0},
			{"editAll 0xFFFF, pattern-wide step 1", 0xffff, 1, 0, 0},
		};
		std::string line;
		for(const size_t track : {size_t(0)})
		{
			double plain = 0;
			for(const auto& sc : scenarios)
			{
				auto p = *base;
				p.position = 0;
				p.length = 16;
				p.trigs.fill(0);
				p.lockMasks.fill(0);
				p.lockedRows = 0;
				p.trigs[track] = 1;
				p.accentAmount = 15;
				p.accentEditAll = sc.editAll;
				p.accentPattern = sc.all;
				for(size_t t = 0; t < 16; ++t)
					p.trackAccent[t] = t == track ? sc.own : sc.other;
				halt(r);
				r->send(ed::encodeMdPattern(p));
				r.run(300);
				r.loadPattern(0);
				const auto back = ed::decodeMdPattern(r->request(ed::mdPatternRequest(0), ed::g_mdPatternDump));
				key(r, md::PanelControl::Play, 30, 0);
				const auto from = r->left().size();
				r.run(300);
				const double level = rms(r->left(), r->right(), from, r->left().size());
				halt(r);
				if(sc.editAll == 1 && !sc.all && !sc.own)
					plain = level;
				const bool louder = plain > 0 && level > plain * 1.15;
				std::printf("  track %zu, %-62s level %.5f%s (editAll read back %u)\n", track + 1, sc.name, level, louder ? "   ACCENTED" : "",
					back ? back->accentEditAll : 9999u);
				if(louder)
					line += "t" + std::to_string(track + 1) + ": " + sc.name + "; ";
			}
			check(plain > 1e-4, "the rig: track " + std::to_string(track + 1) + " sounds (" + std::to_string(plain) + ")");
		}
		result("P7", line.empty() ? "no scenario accented" : "accented: " + line);
	}

	// ---- P6: does the factory baseline hold the factory kits, patterns, songs and globals --------------------------------------

	const uint8_t* findBytes(const Bytes& _hay, const Bytes& _needle, const size_t _from = 0)
	{
		if(_needle.empty() || _hay.size() < _needle.size() || _from >= _hay.size())
			return nullptr;
		return static_cast<const uint8_t*>(memmem(_hay.data() + _from, _hay.size() - _from, _needle.data(), _needle.size()));
	}

	// the raw payload of a dump: 7-bit unpacked between the 10-byte header and the 5-byte trailer
	Bytes mdRaw(const Bytes& _sysex)
	{
		if(_sysex.size() < 16)
			return {};
		return ed::decode7Bit(_sysex.data() + 10, _sysex.size() - 15);
	}

	void p6(const Bytes& _rom)
	{
		std::puts("== P6 MD: the factory baseline (mdfactorybaseline) against the factory kits, patterns, songs, globals");
		Rig r(_rom, false);
		auto& hw = r->hardware();
		// no MIDI, no keys until the capture finished: any interaction disqualifies the machine-local baseline
		uint64_t waited = 0;
		while(!hw.factoryFlashCacheReady() && waited < g_rate * 120ull)
		{
			r->run(500);
			waited += g_rate / 2;
		}
		const bool ready = hw.factoryFlashCacheReady();
		std::printf("  factory flash capture %s after %.1f s of machine time past the splash\n", ready ? "complete" : "NOT complete", waited / double(g_rate));
		Bytes baseline;
		const bool got = ready && hw.copyFactoryFlashBaseline(baseline);
		check(got, "the rig: the factory flash baseline can be copied");
		const auto patchRam = hw.copyPatchRam();
		const auto flashNow = hw.copyFlashData();
		const auto& romImage = hw.flashBaseline();
		std::printf("  sizes: baseline %zu, patch RAM %zu, flash now %zu, ROM image %zu\n", baseline.size(), patchRam.size(), flashNow.size(), romImage.size());
		if(!got)
		{
			result("P6", "no baseline");
			return;
		}
		struct Kind
		{
			const char* name;
			uint8_t reply;
			uint8_t slots;
		};
		const Kind kinds[] = {{"kit", 0x52, 64}, {"pattern", 0x67, 128}, {"song", 0x69, 32}, {"global", 0x50, 8}};
		// A slot "is in" a haystack when at least 60 % of its non-trivial 24-byte chunks (more than 3 distinct values) are
		// found there, taken from its 8-bit payload (decode7Bit over everything) or from the plain message bytes (the kit and
		// global dumps hold their parameter blocks unpacked), whichever matches better.
		struct Hay
		{
			const char* name;
			const Bytes* data;
		};
		const Hay hays[] = {{"baseline", &baseline}, {"patchRAM", &patchRam}, {"ROM", &romImage}};
		const auto chunks = [](const Bytes& _b) {
			std::vector<Bytes> out;
			for(size_t o = 0; o + 24 <= _b.size(); o += 24)
			{
				Bytes c(_b.begin() + static_cast<long>(o), _b.begin() + static_cast<long>(o) + 24);
				if(std::set<uint8_t>(c.begin(), c.end()).size() > 3)
					out.push_back(std::move(c));
			}
			return out;
		};
		std::string summary;
		for(const auto& k : kinds)
		{
			std::map<std::string, int> slotsIn;
			std::map<std::string, std::vector<long>> where;
			int answered = 0, nontrivial = 0;
			for(uint8_t slot = 0; slot < k.slots; ++slot)
			{
				const auto d = r.dump(k.reply, slot);
				if(d.empty())
					continue;
				++answered;
				const Bytes plain(d.begin() + 10, d.end() - 5);
				const auto cRaw = chunks(mdRaw(d)), cPlain = chunks(plain);
				if(cRaw.empty() && cPlain.empty())
					continue;
				++nontrivial;
				for(const auto& h : hays)
				{
					const auto score = [&](const std::vector<Bytes>& _cs, long& _first) {
						int hit = 0;
						_first = -1;
						for(const auto& c : _cs)
							if(const auto* f = findBytes(*h.data, c))
							{
								++hit;
								if(_first < 0)
									_first = static_cast<long>(f - h.data->data());
							}
						return _cs.empty() ? 0.0 : double(hit) / double(_cs.size());
					};
					long f1 = -1, f2 = -1;
					const double s1 = score(cRaw, f1), s2 = score(cPlain, f2);
					const bool in = std::max(s1, s2) >= 0.6;
					slotsIn[h.name] += in;
					if(slot < 4)
						where[h.name].push_back(in ? (s1 >= s2 ? f1 : f2) : -1);
				}
			}
			std::printf("  %-8s: %d of %u slots answered, %d with non-trivial content; slots found in", k.name, answered, k.slots, nontrivial);
			for(const auto& h : hays)
				std::printf(" %s %d", h.name, slotsIn[h.name]);
			std::printf("; first offsets of slots 0-3:");
			for(const auto& h : hays)
			{
				std::printf(" %s[", h.name);
				for(const auto o : where[h.name])
					std::printf(" %ld", o);
				std::printf(" ]");
			}
			std::printf("\n");
			char x[160];
			std::snprintf(x, sizeof x, "%s %d/%d in the baseline, %d in patch RAM, %d in the ROM image; ", k.name, slotsIn["baseline"], nontrivial,
				slotsIn["patchRAM"], slotsIn["ROM"]);
			summary += x;
		}
		result("P6", summary);
	}


	// ---- P6b: a fresh boot as the factory source ------------------------------------------------------------------------
	// The baseline is the sample flash; kits, patterns, songs and globals live in patch RAM. So: does a machine booted with
	// no patch RAM hold the factory data, the same every time, and does a patch RAM carry a user's change over a reboot?

	std::vector<Bytes> mdAllDumps(Rig& _r)
	{
		std::vector<Bytes> out;
		const std::pair<uint8_t, uint8_t> kinds[] = {{0x52, 64}, {0x67, 128}, {0x69, 32}, {0x50, 8}};
		for(const auto& [reply, slots] : kinds)
			for(uint8_t s = 0; s < slots; ++s)
				out.push_back(_r.dump(reply, s));
		return out;
	}

	void p6b(const Bytes& _rom)
	{
		std::puts("== P6b MD: a machine booted with no patch RAM as the factory source");
		Bytes patch;
		std::vector<Bytes> first;
		std::set<std::string> kitNames;
		size_t distinctKits = 0, distinctPatterns = 0;
		{
			Rig a(_rom, false);
			first = mdAllDumps(a);
			std::set<Bytes> kits(first.begin(), first.begin() + 64), patterns(first.begin() + 64, first.begin() + 192);
			distinctKits = kits.size();
			distinctPatterns = patterns.size();
			for(uint8_t k = 0; k < 4; ++k)
				if(const auto kit = ed::decodeMdKit(first[k]))
					kitNames.insert(std::string(reinterpret_cast<const char*>(kit->name.data()), strnlen(reinterpret_cast<const char*>(kit->name.data()), kit->name.size())));
			// a user's change: kit 6 renamed and stored, pattern 9 shortened and stored
			auto kit = *ed::decodeMdKit(first[5]);
			const char nm[] = "PROBE KIT";
			kit.name.fill(0);
			std::memcpy(kit.name.data(), nm, sizeof nm - 1);
			a->send(ed::encodeMdKit(kit));
			auto pat = *ed::decodeMdPattern(first[64 + 8]);
			pat.length = 12;
			a->send(ed::encodeMdPattern(pat));
			a.run(500);
			patch = a->hardware().copyPatchRam();
		}
		std::printf("  fresh boot: %zu distinct kits of 64, %zu distinct patterns of 128; kit names 1-4:", distinctKits, distinctPatterns);
		for(const auto& n : kitNames)
			std::printf(" \"%s\"", n.c_str());
		std::printf("\n");
		size_t sameFresh = 0, changedCarried = 0;
		{
			Rig b(_rom, false);
			const auto again = mdAllDumps(b);
			for(size_t i = 0; i < first.size() && i < again.size(); ++i)
				sameFresh += first[i] == again[i];
		}
		std::printf("  a second fresh boot: %zu of %zu dumps byte for byte the same\n", sameFresh, first.size());
		{
			Rig c(_rom, false, patch);
			const auto kit = ed::decodeMdKit(c.dump(0x52, 5));
			const auto pat = ed::decodeMdPattern(c.dump(0x67, 8));
			changedCarried = (kit && std::string(reinterpret_cast<const char*>(kit->name.data()), 9) == "PROBE KIT") + (pat && pat->length == 12);
			std::printf("  boot with the saved patch RAM: kit 6 %s, pattern A09 length %d\n", kit ? std::string(reinterpret_cast<const char*>(kit->name.data()), 9).c_str() : "?",
				pat ? pat->length : -1);
		}
		check(changedCarried == 2, "the rig: a patch RAM carries a stored kit and pattern over a reboot");
		char x[200];
		std::snprintf(x, sizeof x, "a boot with no patch RAM gives the factory data: %zu/%zu dumps identical on a second fresh boot, %zu distinct kits, %zu distinct patterns",
			sameFresh, first.size(), distinctKits, distinctPatterns);
		result("P6b", x);
	}

	// ---- P4: MM DigiPRO waveform dump (0x5D) and request (0x5E) on the MKII ROM -----------------------------------------------

	// A DigiPRO waveform dump as the public banks carry it: 7027 bytes, F0 00 20 3C 03 00 5D <v> <r> <wave 0-63>, four more
	// header bytes, 6132 bytes of wave data 7-bit packed (a 1024-sample 24-bit cycle, then the lower resolutions), the
	// 14-bit sum of bytes from index 10 on, the length (size - 10), F7 (mdsysexfile.h: the sum starts at 10, not 9).
	Bytes digiProDump(const uint8_t _slot, const uint8_t _version, const uint8_t _revision, const uint8_t _marker)
	{
		Bytes raw(6132, 0);
		for(size_t i = 0; i < 1024; ++i)
		{
			const int32_t q = static_cast<int32_t>(0.5 * std::sin(6.283185307 * double(i) / 1024.0) * 8388607.0);
			raw[i * 3] = static_cast<uint8_t>((q >> 16) & 0xff);
			raw[i * 3 + 1] = static_cast<uint8_t>((q >> 8) & 0xff);
			raw[i * 3 + 2] = static_cast<uint8_t>(q & 0xff);
		}
		raw[3100] = _marker;
		Bytes m{0xf0, 0x00, 0x20, 0x3c, 0x03, 0x00, 0x5d, _version, _revision, _slot, 0, 0, 0, 0};
		const auto enc = ed::encode7Bit(raw.data(), raw.size());
		m.insert(m.end(), enc.begin(), enc.end());
		m.resize(m.size() + 5);
		uint32_t sum = 0;
		for(size_t i = 10; i < m.size() - 5; ++i)
			sum += m[i];
		sum &= 0x3fff;
		const size_t n = m.size();
		m[n - 5] = static_cast<uint8_t>(sum >> 7);
		m[n - 4] = static_cast<uint8_t>(sum & 0x7f);
		m[n - 3] = static_cast<uint8_t>((n - 10) >> 7);
		m[n - 2] = static_cast<uint8_t>((n - 10) & 0x7f);
		m[n - 1] = 0xf7;
		return m;
	}

	size_t flashDiff(const Bytes& _a, const Bytes& _b)
	{
		size_t changed = 0;
		for(size_t i = 0; i < _a.size() && i < _b.size(); ++i)
			changed += _a[i] != _b[i];
		return changed + (_a.size() > _b.size() ? _a.size() - _b.size() : _b.size() - _a.size());
	}

	void p4(const Bytes& _rom)
	{
		std::puts("== P4 MM: DigiPRO waveform request 0x5E and dump 0x5D");
		Rig r(_rom, true);
		int anySysex = 0;
		r->onSysex = [&](const Bytes& _m) {
			++anySysex;
			std::printf("    (SysEx out: %zu bytes %s)\n", _m.size(), hex(_m, 0, 12).c_str());
		};
		const auto ask = [&](const uint8_t _n) {
			return r->request({0xf0, 0x00, 0x20, 0x3c, 0x03, 0x00, 0x5e, _n, 0xf7}, 0x5d);
		};
		std::string answered;
		for(const uint8_t n : {0, 1, 2, 31, 45, 63, 64, 65, 100})
			if(!ask(n).empty())
				answered += std::to_string(n) + " ";
		std::printf("  0x5E request, normal screens, waveforms 0 1 2 31 45 63 64 65 100: answered for [%s]\n", answered.c_str());
		check(!r.dump(0x52, 0).empty(), "the rig: the kit request is answered");
		result("P4-request", answered.empty() ? "no 0x5D answer to a 0x5E request on the normal screens" : "answers for " + answered);

		// the dump on the normal screens, then on DIGIPRO MGR > RECEIVE (the screen the plug-in's file sender enters)
		const auto sendWave = [&](const char* _where, const uint8_t _slot, const uint8_t _v, const uint8_t _rev, const bool _exit) {
			const auto before = r->hardware().copyUserFlash();
			const auto beforePatch = r->hardware().copyPatchRam();
			r->send(digiProDump(_slot, _v, _rev, 0x33));
			r.run(1500);
			if(_exit)
			{
				for(int i = 0; i < 2; ++i)
					key(r, md::PanelControl::Exit, 60, 300);
				r.run(8000);
			}
			const auto after = r->hardware().copyUserFlash();
			const auto afterPatch = r->hardware().copyPatchRam();
			std::printf("  0x5D v%d.%d wave %d %s: user flash bytes changed %zu, patch RAM bytes changed %zu\n", _v, _rev, _slot, _where, flashDiff(before, after),
				flashDiff(beforePatch, afterPatch));
			return flashDiff(before, after);
		};
		const size_t plain = sendWave("on the normal screens", 60, 1, 1, false);
		result("P4-dump-plain", plain ? "0x5D changed user flash on the normal screens" : "0x5D left user flash alone on the normal screens");

		md::test::enterMmReceive(r->hardware(), true);
		r.run(300);
		if(std::getenv("P4_SNAP"))
			keySeq(r, std::string("snap:") + std::getenv("P4_SNAP"));
		const uint8_t rx = r->read8(md::MmTelemetry::g_recvActiveAddress);
		std::printf("  on DIGIPRO MGR > RECEIVE: RAM 0x26a3c3 = %d (SYSEX RECV flag; the DigiPRO screen may use another)\n", rx);
		size_t inRecv = 0;
		for(const auto vr : {std::make_pair<uint8_t, uint8_t>(1, 1), std::make_pair<uint8_t, uint8_t>(1, 0), std::make_pair<uint8_t, uint8_t>(2, 1)})
		{
			inRecv = sendWave("on DIGIPRO MGR > RECEIVE", 60, vr.first, vr.second, true);
			if(inRecv)
				break;
			md::test::enterMmReceive(r->hardware(), true);
			r.run(300);
		}
		result("P4-dump-recv", inRecv ? "0x5D on DIGIPRO MGR > RECEIVE changed user flash (" + std::to_string(inRecv) + " bytes)" : "0x5D on DIGIPRO MGR > RECEIVE changed nothing");
		// after the wave is in: does a request for it answer now?
		const auto back = ask(60), other = ask(61);
		const auto sent = digiProDump(60, 1, 1, 0x33);
		std::printf("  0x5E for wave 60 after the import: %s%s; for the empty wave 61: %s\n", back.empty() ? "no answer" : "answered",
			back == sent ? ", byte for byte what was sent" : (back.empty() ? "" : ", differs from what was sent"), other.empty() ? "no answer" : "answered");
		if(!back.empty() && back != sent)
		{
			size_t first = 0;
			while(first < back.size() && first < sent.size() && back[first] == sent[first])
				++first;
			std::printf("    first difference at byte %zu: answered %s vs sent %s (sizes %zu / %zu)\n", first, hex(back, first, 8).c_str(), hex(sent, first, 8).c_str(),
				back.size(), sent.size());
		}
		check(!back.empty(), "the imported DigiPRO wave is requestable (0x5E)");
		std::string verdict;
		verdict += answered.empty() ? "0x5E: no answer for an empty wave; " : "0x5E answers; ";
		verdict += back.empty() ? "no answer for an imported wave; " : (back == sent ? "an imported wave comes back byte for byte; " : "an imported wave comes back (changed bytes); ");
		verdict += plain ? "0x5D taken on the normal screens; " : "0x5D ignored on the normal screens; ";
		verdict += inRecv ? "0x5D taken on DIGIPRO MGR RECEIVE" : "0x5D not taken on DIGIPRO MGR RECEIVE";
		result("P4", verdict);
	}


	// ---- P2: MM CONTROL OUT 1 (SEQUENCER / ARP / KEYBOARD) ----------------------------------------------------------------------
	// p2panel finds the bytes from the panel (GLOBAL > CONTROL > CONTROL OUT1, the dump after each key); p2 then writes each
	// value of each byte by SysEx and measures what reaches MIDI out and the audio.

	struct Meas
	{
		int notesOut = 0;
		double rms = 0;
	};

	// MM pattern slot 7: track 1 plays C-3 on every fourth step of 16 and nothing else does (no other track, no MIDI track);
	// with _arp the track's arpeggiator is on (mode KEY, speed 6) for the notes played into it.
	Bytes p2Pattern(Rig& _r, const bool _arp)
	{
		auto p = *ed::decodeMmPattern(_r.dump(0x67, 0));
		p.position = _arp ? 8 : 7;
		p.length = 16;
		for(auto* m : {&p.amp, &p.filter, &p.lfo, &p.noteOff, &p.midiTrig, &p.midiNoteOff, &p.pitch, &p.chord, &p.midiNote, &p.slide, &p.midiSlide})
			m->fill(0);
		p.amp[0] = _arp ? 0 : 0x1111111111111111ull;
		p.pitch[0] = _arp ? 0 : 0x1111111111111111ull;
		for(auto& n : p.notes)
			n.fill(ed::MmPattern::g_noNote);
		for(size_t s = 0; s < 64; s += 4)
			p.notes[0][s] = 60;
		p.lockMasks = {};
		p.lockRowCount = 0;
		p.midiNoteCount = 0;
		p.chordNoteCount = 0;
		if(_arp)
		{
			p.arp.playOjmp[0] = 1;	// UP
			p.arp.mode[0] = 1;		// KEY
			p.arp.range[0] = 0;
			p.arp.speed[0] = 6;
			p.arp.trigs[0] = 7;
			p.arp.length[0] = 16;
			p.arp.steps[0].fill(ed::g_mmArpStepCentre);
		}
		return ed::encodeMmPattern(p);
	}

	void p2(const Bytes& _rom)
	{
		std::puts("== P2 MM: CONTROL OUT 1 bytes 0x07-0x09 (SEQUENCER, ARP, KEYBOARD) written by SysEx");
		Rig r(_rom, true);
		int notes = 0;
		const bool trace = std::getenv("P2_TRACE") != nullptr;
		r->onMidi = [&](const synthLib::SMidiEvent& _e) {
			if((_e.a & 0xf0) == 0x90 && _e.c > 0)
				++notes;
			if(trace && _e.a != 0xf8 && _e.a != 0xfe)
				std::printf("    midi out %02x %02x %02x\n", _e.a, _e.b, _e.c);
		};
		mmSendDumps(r, {p2Pattern(r, false), p2Pattern(r, true)});
		const int slot = r.status(0x01);
		const auto g0 = *ed::decodeMmGlobal(r.dump(0x50, static_cast<uint8_t>(slot)));
		const auto raw0 = ed::mmGlobalRaw(g0);
		std::printf("  global slot %d as booted, bytes 0x07-0x09:", slot);
		for(size_t i = 0x07; i < 0x0a; ++i)
			std::printf(" %02x", raw0[i]);
		std::printf("\n");

		const auto measure = [&](const std::string& _what) {
			std::string line = "  " + _what + ":";
			Meas m[3];
			// 1) the sequencer
			r.setSongMode(false);
			r.loadPattern(7);
			halt(r);
			notes = 0;
			key(r, md::PanelControl::Play);
			r.run(600);
			auto from = r->left().size();
			notes = 0;
			r.run(2000);
			m[0] = {notes, rms(r->left(), r->right(), from, r->left().size())};
			halt(r);
			r.run(500);
			// 2) the keyboard: the TRIG keys (not recording)
			notes = 0;
			from = r->left().size();
			for(const auto t : {md::PanelControl::Trigger1, md::PanelControl::Trigger5, md::PanelControl::Trigger8})
				key(r, t, 120, 250);
			r.run(300);
			m[1] = {notes, rms(r->left(), r->right(), from, r->left().size())};
			// 3) the arpeggiator: two notes held on track 1's channel
			r.loadPattern(8);
			halt(r);
			r.run(300);
			notes = 0;
			from = r->left().size();
			r->send({0x90, 60, 100});
			r->send({0x90, 64, 100});
			r.run(1200);
			r->send({0x80, 60, 0});
			r->send({0x80, 64, 0});
			r.run(300);
			m[2] = {notes, rms(r->left(), r->right(), from, r->left().size())};
			const char* names[3] = {"SEQ", "KBD (TRIG keys)", "ARP (MIDI notes in, arp on)"};
			for(int i = 0; i < 3; ++i)
			{
				char x[96];
				std::snprintf(x, sizeof x, " %s: %d notes out, audio %.4f;", names[i], m[i].notesOut, m[i].rms);
				line += x;
			}
			std::printf("%s\n", line.c_str());
			return std::array<Meas, 3>{m[0], m[1], m[2]};
		};
		const auto base = measure("as booted");
		check(base[0].notesOut >= 0 && base[0].rms > 1e-4, "the rig: the sequencer track sounds (" + std::to_string(base[0].rms) + ")");
		std::string summary;
		for(size_t i = 0x07; i < 0x0a; ++i)
		{
			for(const uint8_t v : {0, 1, 2})
			{
				if(v == raw0[i])
					continue;
				mmSetGlobal(r, [&](ed::MmGlobal& _g) {
					auto raw = ed::mmGlobalRaw(_g);
					raw[i] = v;
					_g = *ed::mmGlobalFromRaw(raw, _g.position);
				});
				char what[48];
				std::snprintf(what, sizeof what, "byte 0x%02zx = %d", i, v);
				const auto m = measure(what);
				char x[96];
				std::snprintf(x, sizeof x, "0x%02zx=%d: seq %d/kbd %d/arp %d notes out; ", i, v, m[0].notesOut, m[1].notesOut, m[2].notesOut);
				summary += x;
			}
			mmSetGlobal(r, [&](ed::MmGlobal& _g) { _g = g0; });
		}
		r->onMidi = nullptr;
		result("P2", summary);
	}


	std::string diffRaw(const Bytes& _a, const Bytes& _b)
	{
		std::string out;
		char x[48];
		for(size_t i = 0; i < _a.size() && i < _b.size(); ++i)
			if(_a[i] != _b[i])
			{
				std::snprintf(x, sizeof x, " [0x%03zx] %02x->%02x", i, _a[i], _b[i]);
				out += x;
			}
		return out.empty() ? " (no change)" : out;
	}

	// The same bytes from the panel: GLOBAL > CONTROL > CONTROL OUT1, every row's value moved with LEFT/RIGHT, the global read back.
	void p2panel(const Bytes& _rom)
	{
		std::puts("== P2 MM (panel): GLOBAL > CONTROL > CONTROL OUT1, the global dump after each key");
		Rig r(_rom, true);
		const int slot = r.status(0x01);
		const auto readRaw = [&] { return ed::mmGlobalRaw(*ed::decodeMmGlobal(r.dump(0x50, static_cast<uint8_t>(slot)))); };
		keySeq(r, "f+kit,enter,down,right,down,enter");
		if(std::getenv("P2_SNAP"))
			keySeq(r, std::string("snap:") + std::getenv("P2_SNAP"));
		auto prev = readRaw();
		const char* rows[3] = {"SEQUENCER", "ARP", "KEYBOARD"};
		std::string table;
		for(int row = 0; row < 3; ++row)
		{
			if(row)
				keySeq(r, "down");
			// INT, OUT, INT+OUT: step with RIGHT, then wrap back with LEFT
			for(const char* k : {"right", "right", "right", "left", "left", "left", "left"})
			{
				keySeq(r, k);
				const auto now = readRaw();
				std::printf("  %-9s %-5s:%s\n", rows[row], k, diffRaw(prev, now).c_str());
				prev = now;
			}
		}
		for(int i = 0; i < 6; ++i)
			key(r, md::PanelControl::Exit, 40, 80);
		(void)table;
	}

	// P8 (wave 5): GLOBAL > AUDIO > MASTER TUNE from the panel: the global's masterTune (tenths of Hz) after the keys, down
	// to the bottom and up to the top. P8_NAV: the keys that open the value (default "f+kit,enter,right,enter").
	void p8(const Bytes& _rom)
	{
		std::puts("== P8 MM (panel): GLOBAL > AUDIO > MASTER TUNE, its range");
		Rig r(_rom, true);
		const int slot = r.status(0x01);
		const auto tune = [&] { const auto g = ed::decodeMmGlobal(r.dump(0x50, static_cast<uint8_t>(slot))); return g ? int(g->masterTune) : -1; };
		const char* nav = std::getenv("P8_NAV");
		keySeq(r, nav ? nav : "f+kit,enter,right,enter");
		std::printf("  opened: %d\n", tune());
		for(const char* k : {"up", "right", "down", "left", "down*60", "left*12", "up*120", "right*12"})
		{
			keySeq(r, k);
			std::printf("  %-9s: %d\n", k, tune());
		}
		for(int i = 0; i < 6; ++i)
			key(r, md::PanelControl::Exit, 40, 80);
	}

	// P9 (wave 8): the machine picker's audition and the Mix page's LEV, as the editor sends them. A machine assigned the
	// way the desk's `machine` command does it (SysEx 0x5B, init SYNTHESIS, then the document's synthesis values as CCs),
	// the track's note (the default map: track 1 = note 36 on the base channel) right behind it or a little later: is the
	// new machine the one heard? Then the way back (the old machine and its values again, as Undo delivers them) and the
	// level CC (8 + track) against the note's loudness.
	void p9(const Bytes& _rom)
	{
		std::puts("== P9 MD: a machine assigned and its track's note right behind it (the picker's audition); the level CC");
		Rig r(_rom, false);
		r.setSongMode(false);
		const auto sin = *ed::mdMachineModel("GND-SIN"), empty = *ed::mdMachineModel("GND-EMPTY");
		// track 1's synthesis CCs 16-19 on channel 1: GND-SIN PTCH, DEC, RAMP, RDEC
		const auto tune = [&] {
			r->send({0xb0, 16, 40});
			r->send({0xb0, 17, 90});
			r->send({0xb0, 18, 0});
			r->send({0xb0, 19, 0});
		};
		const auto level = [&](const uint8_t _v) {
			namespace a = md::automation;
			if(const auto cc = a::encodeParameterChange(md::MachineModel::Machinedrum, {a::machinedrum::Level, 0, 0, _v}, 0))
				r->send({(*cc)[0], (*cc)[1], (*cc)[2]});
		};
		const auto heard = [&] {	// the note on track 1 and the first 300 ms after it
			const auto from = r->left().size();
			r->send({0x90, 36, 100});
			r.run(300);
			const double v = rms(r->left(), r->right(), from, r->left().size());
			r->send({0x80, 36, 0});
			r.run(700);
			return v;
		};
		const auto settle = [&](const uint32_t _model) {
			r->send(ed::mdAssignMachine(0, _model, ed::MdMachineInit::SynthesisEffectsRouting));
			r.run(200);
			if(_model == sin)
				tune();
			level(100);
			r.run(300);
		};
		settle(sin);
		const double sinLevel = heard();
		settle(empty);
		const double emptyLevel = heard();
		std::printf("  controls: GND-SIN %.5f, GND-EMPTY %.5f\n", sinLevel, emptyLevel);
		check(sinLevel > 1e-3 && emptyLevel < sinLevel * 0.05, "the rig: track 1's note sounds on GND-SIN, not on GND-EMPTY");

		std::string answers;
		int newHeard = 0, all = 0;
		for(const double gap : {0.0, 5.0, 20.0, 100.0})
		{
			for(const auto& [from, to, name] : {std::tuple{empty, sin, "GND-EMPTY -> GND-SIN"}, std::tuple{sin, empty, "GND-SIN -> GND-EMPTY"}})
			{
				settle(from);
				r->send(ed::mdAssignMachine(0, to, ed::MdMachineInit::Synthesis));
				if(to == sin)
					tune();	// the document's synthesis values, as the desk resends them after a new machine
				if(gap > 0)
					r.run(gap);
				const double v = heard();
				const bool isNew = to == sin ? v > sinLevel * 0.5 : v < sinLevel * 0.05;
				std::printf("  %-22s note %5.1f ms after: %.5f  %s\n", name, gap, v, isNew ? "the new machine" : "THE OLD MACHINE");
				newHeard += isNew ? 1 : 0;
				++all;
				if(!isNew)
					answers += std::string(name) + " at " + std::to_string(int(gap)) + " ms; ";
			}
		}

		// the way back: GND-SIN tuned, auditioned as GND-EMPTY, then GND-SIN and its values again (Undo's delivery)
		settle(sin);
		const double before = heard();
		r->send(ed::mdAssignMachine(0, empty, ed::MdMachineInit::Synthesis));
		const double during = heard();
		r->send(ed::mdAssignMachine(0, sin, ed::MdMachineInit::Synthesis));
		tune();
		const double after = heard();
		std::printf("  back: before %.5f, auditioning GND-EMPTY %.5f, back on GND-SIN %.5f\n", before, during, after);
		const bool back = after > before * 0.9 && after < before * 1.1;

		// LEV: the level CC against the note's loudness
		std::string levels;
		double at100 = 0;
		for(const uint8_t v : {127, 100, 64, 32, 0})
		{
			settle(sin);
			level(v);
			r.run(50);
			const double l = heard();
			if(v == 100)
				at100 = l;
			char x[48];
			std::snprintf(x, sizeof x, "%s%d: %.5f", levels.empty() ? "" : ", ", v, l);
			levels += x;
		}
		std::printf("  level CC: %s\n", levels.c_str());
		check(at100 > 1e-3, "the rig: a note at level 100 sounds");
		result("P9", std::to_string(newHeard) + " of " + std::to_string(all) + " notes played the new machine"
			+ (answers.empty() ? " (also with no gap: SysEx then note in one stream)" : "; the old one at " + answers)
			+ (back ? "; the old machine and its values again give the same sound" : "; the way back does NOT give the same sound")
			+ "; level CC " + levels);
	}

	// ---- P10: MM POLY, the filter's key tracking and the MULTI ENV (0.6 wave 9, B-064) ---------------------------------
	// Every scenario: a kit written by dump into slot 11 and a pattern into slot 10 that links it (LOAD PATTERN loads both),
	// raw MIDI notes on the channels of the factory global (track t: base + t; AUTO 9, MULTI TRIG 7), the output measured.
	// A "plain" track: AMP ATK 0 HOLD 0 DEC 127 REL 8 DIST 64, VOL 60, level 48, the filter open, no filter envelope, no
	// delay, no LFO.

	struct P10Kit
	{
		std::array<uint8_t, 6> machine{1, 1, 1, 1, 1, 1};	// 1 GND-SIN, 2 GND-NOIS
		std::array<uint8_t, 6> vol{60, 60, 60, 60, 60, 60};
		uint8_t mode = 1;									// MULTI TRIG mode: 0 ALL TRK, 1 SPLIT KEY, 2 SEQ START, 3 SEQ TRNSP
		std::array<uint8_t, 4> env{0, 127, 127, 127};		// MULTI ENV ATK DEC SUS REL
		uint8_t lpfMask = 0x3f, hpfMask = 0x3f;
		std::array<uint8_t, 2> flt{0, 127};					// T1's FILTER BASE, WDTH
	};
	constexpr uint8_t g_p10Kit = 10, g_p10Pattern = 9;

	// T1's trigs: every second step (pitch C-4), or one chord trig (C E G) on step 1; T2 a trig on step 1 too
	void p10Load(Rig& _r, const P10Kit& _k, const bool _chord)
	{
		auto kit = *ed::decodeMmKit(_r.dump(0x52, 0));
		kit.position = g_p10Kit;
		for(size_t t = 0; t < 6; ++t)
		{
			kit.machines[t] = _k.machine[t];
			kit.levels[t] = 48;	// six tracks together stay well under full scale
			auto& pg = kit.tracks[t].pages;
			pg[0] = {0, 0, 0, 0, 0, 0, 0, 64};
			pg[1] = {0, 0, 127, 8, 64, _k.vol[t], 64, 0};	// DIST 64: none (0 silences the track, measured)
			pg[2] = {0, 127, 0, 0, 0, 40, 0, 0};
			pg[3] = {64, 64, 0, 32, 0, 0, 0, 127};
			for(size_t l = 4; l < 7; ++l)
				pg[l][7] = 0;
			kit.tracks[t].multiEnv = {_k.env[0], _k.env[1], _k.env[2], _k.env[3], 0, 0};
		}
		kit.tracks[0].pages[2][0] = _k.flt[0];
		kit.tracks[0].pages[2][1] = _k.flt[1];
		kit.multiTrigMode = _k.mode;
		kit.multiTrigTiming = 0;
		kit.splitKey = 0;	// SPLIT KEY: every key is in the upper zone, which starts at T1: all six tracks
		kit.splitTrack = 0;
		kit.lpfMask = _k.lpfMask;
		kit.hpfMask = _k.hpfMask;
		auto p = *ed::decodeMmPattern(_r.dump(0x67, 0));
		p.position = g_p10Pattern;
		p.kit = g_p10Kit;
		p.length = 16;
		p.multiplier = 0;
		for(auto* m : {&p.amp, &p.filter, &p.lfo, &p.noteOff, &p.midiTrig, &p.midiNoteOff, &p.pitch, &p.chord, &p.midiNote, &p.slide, &p.midiSlide})
			m->fill(0);
		for(auto& n : p.notes)
			n.fill(ed::MmPattern::g_noNote);
		p.lockMasks = {};
		p.lockRowCount = 0;
		p.midiNoteCount = 0;
		p.chordNoteCount = 0;
		if(_chord)
		{
			p.amp[0] = p.filter[0] = p.lfo[0] = p.pitch[0] = p.chord[0] = 1;
			p.notes[0][0] = 60;
			p.chordNotes[0] = ed::mmNoteEntryWord({0, 0, 64});
			p.chordNotes[1] = ed::mmNoteEntryWord({0, 0, 67});
			p.chordNoteCount = 2;
			p.amp[1] = p.filter[1] = p.lfo[1] = p.pitch[1] = 1;
			p.notes[1][0] = 72;
		}
		else
			for(size_t s = 0; s < 16; s += 2)
			{
				p.amp[0] |= 1ull << s;
				p.filter[0] |= 1ull << s;
				p.lfo[0] |= 1ull << s;
				p.pitch[0] |= 1ull << s;
				p.notes[0][s] = 60;
			}
		mmSendDumps(_r, {ed::encodeMmKit(kit), ed::encodeMmPattern(p)});
		halt(_r);
		_r.loadPattern(g_p10Pattern);
		_r->send(ed::mmLoadKit(g_p10Kit));
		_r.run(600);
		const auto back = ed::decodeMmKit(_r.dump(0x52, g_p10Kit));
		check(back && back->multiTrigMode == _k.mode && back->tracks[0].multiEnv[3] == _k.env[3] && back->machines[1] == _k.machine[1], "P10: the kit is stored");
		check(_r.status(0x02) == g_p10Kit && _r.status(0x04) == g_p10Pattern, "P10: kit and pattern loaded");
	}

	double p10Level(Rig& _r, const double _ms)
	{
		const size_t a = _r->left().size();
		_r.run(_ms);
		return rms(_r->left(), _r->right(), a, _r->left().size());
	}

	// the amplitude at _f over [_from, _to) (Goertzel, the mix of both channels)
	double p10Amp(Rig& _r, const size_t _from, const size_t _to, const double _f)
	{
		const auto& l = _r->left();
		const auto& rr = _r->right();
		const double w = 2.0 * M_PI * _f / 44100.0, c = 2.0 * std::cos(w);
		double s1 = 0, s2 = 0;
		for(size_t i = _from; i < _to; ++i)
		{
			const double s = 0.5 * (double(l[i]) + double(rr[i])) + c * s1 - s2;
			s2 = s1;
			s1 = s;
		}
		return 2.0 * std::sqrt(std::max(0.0, s1 * s1 + s2 * s2 - c * s1 * s2)) / double(std::max<size_t>(1, _to - _from));
	}

	// the strongest amplitude within 3 % of _f (0.25 Hz steps): a pitch, whatever its fine tune
	double p10Pitch(Rig& _r, const size_t _from, const size_t _to, const double _f)
	{
		double best = 0;
		for(double f = _f * 0.97; f <= _f * 1.03; f += 0.25)
			best = std::max(best, p10Amp(_r, _from, _to, f));
		return best;
	}

	void p10(const Bytes& _rom)
	{
		std::puts("== P10 MM: POLY, the filter's key tracking, the MULTI ENV (wave 9, B-064)");
		Rig r(_rom, true);
		r.setSongMode(false);
		const int slot = r.status(0x01);
		const auto gl = *ed::decodeMmGlobal(r.dump(0x50, static_cast<uint8_t>(slot)));
		const uint8_t base = gl.baseChannel, autoCh = gl.autoChannel, mt = gl.multiTrigChannel;
		{
			const auto k0 = *ed::decodeMmKit(r.dump(0x52, static_cast<uint8_t>(r.status(0x02))));
			std::printf("  global %d: base %d, auto %d, multi trig %d (0-based); the kit that plays at boot: MULTI TRIG mode %d, MULTI ENV %d %d %d %d %d %d\n", slot, base, autoCh, mt,
				k0.multiTrigMode, k0.tracks[0].multiEnv[0], k0.tracks[0].multiEnv[1], k0.tracks[0].multiEnv[2], k0.tracks[0].multiEnv[3], k0.tracks[0].multiEnv[4], k0.tracks[0].multiEnv[5]);
		}
		const auto on = [&](const uint8_t _ch, const uint8_t _n) { r->send({static_cast<uint8_t>(0x90 | _ch), _n, 100}); };
		const auto off = [&](const uint8_t _ch, const uint8_t _n) { r->send({static_cast<uint8_t>(0x80 | _ch), _n, 0}); };
		const auto offAll = [&] {
			for(const uint8_t ch : {uint8_t(base), uint8_t(base + 1), uint8_t(base + 5), autoCh, mt})
				for(const uint8_t n : {36, 60, 64, 67, 72, 84})
					off(ch, n);
			r.run(800);
		};
		const auto stopped = [&] { halt(r); offAll(); };
		const auto seq = [&] { key(r, md::PanelControl::Play); r.run(400); const double v = p10Level(r, 1000); halt(r); r.run(400); return v; };

		// ---- POLY: whose voices, how many ----
		{
			P10Kit k;
			k.machine = {1, 2, 2, 2, 2, 2};
			p10Load(r, k, true);
			// the sine's frequency at C-4
			on(base, 60);
			r.run(300);
			size_t a = r->left().size();
			r.run(300);
			double f0 = 0, best = -1;
			for(double f = 100; f < 1000; f *= std::pow(2.0, 1.0 / 96.0))
				if(const double v = p10Amp(r, a, r->left().size(), f); v > best)
				{
					best = v;
					f0 = f;
				}
			stopped();
			std::printf("  T1 GND-SIN C-4: %.1f Hz\n", f0);
			// which of _semis (semitones over C-4) sound: an amplitude over a quarter of the strongest one's
			const auto pitches = [&](const std::function<void()>& _play, const char* _what, const std::vector<int>& _semis = {0, 4, 7}) {
				_play();
				r.run(300);
				const size_t a0 = r->left().size();
				r.run(300);
				const size_t a1 = r->left().size();
				std::vector<double> amp;
				for(const int st : _semis)
					amp.push_back(p10Pitch(r, a0, a1, f0 * std::pow(2.0, st / 12.0)));
				const double lv = rms(r->left(), r->right(), a0, a1), top = *std::max_element(amp.begin(), amp.end());
				int n = 0;
				std::string each;
				for(size_t i = 0; i < amp.size(); ++i)
				{
					n += top > 1e-3 && amp[i] > 0.25 * top;
					char b[24];
					std::snprintf(b, sizeof b, " %+d:%.4f", _semis[i], amp[i]);
					each += b;
				}
				stopped();
				std::printf("  %-62s%s, rms %.4f: %d sound\n", _what, each.c_str(), lv, n);
				return std::array<double, 2>{double(n), lv};
			};
			const auto chord = [&](const std::function<void()>& _play, const char* _what) { return pitches(_play, _what); };
			const auto keys = [&](const uint8_t _ch) { on(_ch, 60); on(_ch, 64); on(_ch, 67); };
			key(r, md::PanelControl::Track1);
			const auto mono = chord([&] { keys(base); }, "mono, TRACK 1, C E G on track 1's channel");
			r->send(ed::mmSetStatus(ed::MmStatus::Poly, 1));
			r.run(300);
			std::printf("  POLY status: %d\n", r.status(0x20));
			const auto poly = chord([&] { keys(base); }, "POLY, TRACK 1, C E G on track 1's channel");
			const auto other = chord([&] { keys(static_cast<uint8_t>(base + 1)); }, "POLY, TRACK 1, C E G on track 2's channel");
			const auto autoC = chord([&] { keys(autoCh); }, "POLY, TRACK 1, C E G on the AUTO channel");
			const auto mtC = chord([&] { keys(mt); }, "POLY, TRACK 1, C E G on the MULTI TRIG channel");
			const auto six = pitches([&] { for(const uint8_t n : {60, 64, 67, 72, 76, 79}) on(base, n); }, "POLY, TRACK 1, six notes (C E G of C-4 and C-5) on track 1", {0, 4, 7, 12, 16, 19});
			const auto seven = pitches([&] { for(const uint8_t n : {60, 64, 67, 72, 76, 79, 84}) on(base, n); }, "POLY, TRACK 1, seven notes (and C-6) on track 1", {0, 4, 7, 12, 16, 19, 24});
			key(r, md::PanelControl::Track2);
			const auto t2off = chord([&] { keys(base); }, "POLY, TRACK 2, C E G on track 1's channel");
			const auto t2 = chord([&] { keys(static_cast<uint8_t>(base + 1)); }, "POLY, TRACK 2, C E G on track 2's channel (T2 noise)");
			key(r, md::PanelControl::Track1);
			const auto sp = chord([&] { key(r, md::PanelControl::Play); }, "POLY, TRACK 1, the sequencer: T1's C E G trig, T2's C-5");
			r->send(ed::mmSetStatus(ed::MmStatus::Poly, 0));
			r.run(300);
			const auto sm = chord([&] { key(r, md::PanelControl::Play); }, "mono, the sequencer: T1's C E G trig, T2's C-5");
			result("P10 poly", "mono " + std::to_string(int(mono[0])) + " pitch; POLY on the focus track " + std::to_string(int(poly[0]))
				+ ", on another track's channel rms " + std::to_string(other[1]).substr(0, 6) + ", AUTO " + std::to_string(int(autoC[0])) + ", MULTI TRIG " + std::to_string(int(mtC[0]))
				+ "; focus T2: T1's channel rms " + std::to_string(t2off[1]).substr(0, 6) + ", T2's channel rms " + std::to_string(t2[1]).substr(0, 6)
				+ "; sequencer chord POLY " + std::to_string(int(sp[0])) + " mono " + std::to_string(int(sm[0])) + "; six notes: " + std::to_string(int(six[0])) + " sound, seven: "
				+ std::to_string(int(seven[0])));
		}

		// ---- KEY TRACKING: a low and a high note through a low LPF (a high HPF), tracking on and off ----
		{
			std::string line;
			for(const auto& [what, flt, lpf] : std::vector<std::tuple<const char*, std::array<uint8_t, 2>, bool>>{{"LPF", {0, 24}, true}, {"HPF", {80, 47}, false}})
			{
				for(const bool track : {true, false})
				{
					P10Kit k;
					k.vol = {60, 0, 0, 0, 0, 0};
					k.flt = flt;
					(lpf ? k.lpfMask : k.hpfMask) = track ? 0x3f : 0x3e;
					p10Load(r, k, false);
					on(base, 36);
					r.run(300);
					const double lo = p10Level(r, 300);
					stopped();
					on(base, 84);
					r.run(300);
					const double hi = p10Level(r, 300);
					stopped();
					std::printf("  %s (BASE %d WDTH %d), key tracking %s: C-1 (MIDI 36) %.4f, C-5 (MIDI 84) %.4f\n", what, flt[0], flt[1], track ? "on " : "off", lo, hi);
					char b[96];
					std::snprintf(b, sizeof b, "%s %s: low %.4f high %.4f; ", what, track ? "on" : "off", lo, hi);
					line += b;
				}
			}
			result("P10 key", line);
		}

		// ---- MULTI ENV: what it shapes, in each MULTI TRIG mode ----
		{
			std::string line;
			const char* modes[4] = {"ALL TRK", "SPLIT KEY", "SEQ START", "SEQ TRNSP"};
			for(uint8_t mode = 0; mode < 4; ++mode)
			{
				for(const auto& env : std::vector<std::array<uint8_t, 4>>{{0, 127, 127, 127}, {0, 127, 127, 0}, {0, 0, 0, 0}})
				{
					P10Kit k;
					k.mode = mode;
					k.env = env;
					p10Load(r, k, false);
					const double s0 = seq();
					on(base, 60);
					r.run(200);
					const double o0 = p10Level(r, 300);
					stopped();
					on(mt, 60);
					r.run(200);
					const double m = p10Level(r, 300);
					off(mt, 60);
					r.run(800);
					const double after = p10Level(r, 300);
					const double s1 = mode >= 2 ? -1 : seq();
					on(base, 60);
					r.run(200);
					const double o1 = p10Level(r, 300);
					stopped();
					// a MULTI TRIG note again (held, the pattern stopped), and T1's own note under it
					on(mt, 60);
					r.run(300);
					halt(r);
					on(base, 64);
					r.run(200);
					const double o2 = p10Level(r, 300);
					stopped();
					std::printf("  %-9s env %3d %3d %3d %3d: sequencer %.4f, T1's own note %.4f; MULTI TRIG note %.4f, 300 ms after its note off %.4f; then sequencer %.4f, T1's own note %.4f; under a new MULTI TRIG note %.4f\n",
						modes[mode], env[0], env[1], env[2], env[3], s0, o0, m, after, s1, o1, o2);
					char b[200];
					std::snprintf(b, sizeof b, "%s %d/%d/%d/%d: seq %.3f own %.3f MT %.3f after %.3f seq %.3f own %.3f own under MT %.3f; ", modes[mode], env[0], env[1], env[2], env[3], s0, o0, m, after, s1, o1, o2);
					line += b;
				}
			}
			result("P10 menv", line);
		}
	}


	// ---- W12a MD: the "clip" between two dependent values on the synthesis page (MD-033) --------------------------------
	// Every machine on track 1, its synthesis page, the LCD. A clip is a small arch over the dotted line between two
	// value boxes, above their knobs (manual p.9): three pixels lit on the line's row y0 (x-1..x+1), and on y0+1 the
	// pixels x-3 and x+3 lit with x itself dark. y0 is 14 for the upper four boxes, 46 for the lower four; the lines are
	// at x 67, 87, 107. W12_LCD=1 prints each screen that has one.

	void w12clip(const Bytes& _rom)
	{
		std::puts("== W12a MD: clips between the synthesis page's value boxes");
		Rig r(_rom, false);
		keySeq(r, "exit,exit");
		const auto clips = [&] {
			const auto p = r->hardware().getFrontPanelSnapshot();
			const auto at = [&](const int _x, const int _y) { return p.getLcdPixel(static_cast<uint32_t>(_x), static_cast<uint32_t>(_y)); };
			std::string where;
			for(const int row : {0, 1})
				for(const int gap : {0, 1, 2})
				{
					const int x = 67 + 20 * gap, y = row ? 46 : 14;
					if(at(x - 1, y) && at(x, y) && at(x + 1, y) && at(x - 3, y + 1) && at(x + 3, y + 1) && !at(x, y + 1))
						where += " " + std::to_string(row * 4 + gap + 1) + "-" + std::to_string(row * 4 + gap + 2);
				}
			return where;
		};
		std::string found;
		for(uint32_t model = 0; model < 256; ++model)
		{
			const auto name = ed::mdMachineName(model);
			if(name.empty())
				continue;
			r->send(ed::mdAssignMachine(0, model, ed::MdMachineInit::SynthesisEffectsRouting));
			r.run(400);
			keySeq(r, "exit");
			r.run(200);
			const auto names = ed::mdMachineParamNames(model);
			uint32_t measured = 0;
			for(int page = 0; page < 3; ++page)
			{
				if(page)
					keySeq(r, "routing");
				if(const char* snap = std::getenv("W12_SNAP_MACHINE"); snap && name == snap)
					keySeq(r, std::string("snap:") + std::getenv("W12_SNAP_DIR") + "/" + std::to_string(page) + ".pgm");
				const auto where = clips();
				if(where.empty())
					continue;
				std::string pairs;
				for(size_t i = 1; i < where.size(); i += 4)
				{
					const int k = page * 8 + where[i] - '1';
					measured |= 1u << k;
					pairs += std::string(" ") + (names[k] ? names[k] : "?") + "/" + (names[k + 1] ? names[k + 1] : "?");
				}
				static const char* pageNames[3] = {"synthesis", "effects", "routing"};
				std::printf("  %-9s %-9s clip between knobs%s:%s\n", name.c_str(), pageNames[page], where.c_str(), pairs.c_str());
				found += name + "/" + pageNames[page] + ":" + where + ";";
				if(std::getenv("W12_LCD"))
					printLcd(r, name.c_str());
			}
			keySeq(r, "routing");
			check(measured == ed::mdMachineClips(model), name + ": the clips as elektronData::mdMachineClips lists them");
		}
		result("W12a clip", found.empty() ? "no machine draws a clip" : found);
	}

	// ---- W12b MD + MM: where the UNDO KIT lives and how to load it (MD-043, MM-102) --------------------------------------
	// The working kit gets a name the slots do not hold, another kit is loaded (LOAD KIT): the firmware keeps the edited
	// kit as its UNDO KIT. Where are its bytes (patch RAM and main RAM searched for the name), and does a LOAD KIT of a
	// slot past the last (64..127) load it?

	void w12undo(const Bytes& _rom, const bool _mm)
	{
		std::printf("== W12b %s: the UNDO KIT\n", _mm ? "MM" : "MD");
		Rig r(_rom, _mm);
		const uint32_t wk = _mm ? ed::g_mmWorkingKitAddress : ed::g_mdWorkingKitAddress;
		const auto name = [&](const uint32_t _at) { std::string n; for(uint32_t i = 0; i < 11; ++i) { const auto c = r->read8(_at + i); n += c >= 32 && c < 127 ? static_cast<char>(c) : '.'; } return n; };
		const auto setName = [&](const std::string& _n) { r->send(_mm ? ed::mmSetKitName(_n) : ed::mdSetKitName(_n)); r.run(300); };
		const auto loadKit = [&](const uint8_t _k) { r->send(_mm ? ed::mmLoadKit(_k) : ed::mdLoadKit(_k)); r.run(500); };
		const auto find = [&](const std::string& _n) {
			std::string at;
			for(const auto range : {md::memorymap::g_patchOsAlias, md::memorymap::g_mainRam})
				for(uint32_t a = range.begin; a + _n.size() < range.end; ++a)
				{
					bool same = true;
					for(size_t i = 0; i < _n.size() && same; ++i)
						same = r->read8(a + static_cast<uint32_t>(i)) == static_cast<uint8_t>(_n[i]);
					if(same)
					{
						char x[16];
						std::snprintf(x, sizeof x, " 0x%06x", a);
						at += x;
					}
				}
			return at.empty() ? std::string(" nowhere") : at;
		};
		const int k0 = r.status(0x02);
		std::printf("  kit %d, working kit name '%s'\n", k0, name(wk).c_str());
		setName("UNDOTESTA");
		std::printf("  renamed live: working kit name '%s'; UNDOTESTA at%s\n", name(wk).c_str(), find("UNDOTESTA").c_str());
		const uint8_t k1 = static_cast<uint8_t>((k0 + 1) % 64);
		loadKit(k1);
		std::printf("  LOAD KIT %d: kit %d, working kit '%s'; UNDOTESTA at%s\n", k1, r.status(0x02), name(wk).c_str(), find("UNDOTESTA").c_str());
		std::string line = "after LOAD KIT the edited kit is at" + find("UNDOTESTA");
		for(const int k : {64, 65, 100, 127})
		{
			loadKit(static_cast<uint8_t>(k));
			std::printf("  LOAD KIT %d: kit %d, working kit '%s'\n", k, r.status(0x02), name(wk).c_str());
			line += "; LOAD KIT " + std::to_string(k) + " -> kit " + std::to_string(r.status(0x02)) + " '" + name(wk) + "'";
		}
		// SAVE KIT over another slot: the overwritten kit goes to the UNDO KIT (manual)
		setName("UNDOTESTB");
		r->send(_mm ? ed::mmSaveKit(k0) : ed::mdSaveKit(k0));
		r.run(800);
		std::printf("  SAVE KIT %d (renamed UNDOTESTB first): UNDOTESTA at%s, UNDOTESTB at%s\n", k0, find("UNDOTESTA").c_str(), find("UNDOTESTB").c_str());
		// The machine's own route: LOAD KIT list, its first entry (UNDO KIT), ENTER
		const uint32_t undoAt = wk + static_cast<uint32_t>(_mm ? 698 : ed::g_mdWorkingKitSize);
		loadKit(k1);
		setName("UNDOTESTC");
		loadKit(static_cast<uint8_t>((k1 + 1) % 64));
		std::printf("  kit %d plays '%s', UNDO KIT image (0x%06x) '%s'\n", r.status(0x02), name(wk).c_str(), undoAt, name(undoAt).c_str());
		if(_mm)
			keySeq(r, "kit,enter,up*3,enter");
		else
			keySeq(r, "kit,enter,up*3,enter");
		r.run(500);
		std::printf("  panel LOAD KIT > UNDO KIT: kit %d plays '%s', UNDO KIT image '%s'\n", r.status(0x02), name(wk).c_str(), name(undoAt).c_str());
		line += "; panel load of UNDO KIT: kit " + std::to_string(r.status(0x02)) + " plays '" + name(wk) + "', undo image now '" + name(undoAt) + "'";
		// the kit that plays has unsaved edits when the UNDO KIT is loaded: where do they go?
		setName("UNDOTESTD");
		keySeq(r, "kit,enter,up*" + std::to_string(r.status(0x02) + 1) + ",enter");
		r.run(500);
		std::printf("  edited (UNDOTESTD), then UNDO KIT again: kit %d plays '%s', UNDO KIT image '%s'\n", r.status(0x02), name(wk).c_str(), name(undoAt).c_str());
		line += "; with unsaved edits (UNDOTESTD) UNDO KIT again: kit " + std::to_string(r.status(0x02)) + " plays '" + name(wk) + "', undo image '" + name(undoAt) + "'";
		result(_mm ? "W12b MM undo kit" : "W12b MD undo kit", line);
		if(std::getenv("W12_LCD"))
			printLcd(r, "end");
	}

	// ---- W12c MD + MM: what the machine's CLEAR KIT leaves in a slot (MD-045) -------------------------------------------
	// LOAD KIT list, a slot that is not the current kit, FUNCTION + PLAY (CLEAR KIT), EXIT; the slot read back. Two
	// slots with different kits, so what depends on the old kit shows.

	void w12clearkit(const Bytes& _rom)
	{
		std::puts("== W12c MD: CLEAR KIT");
		Rig r(_rom, false);
		const auto readKit = [&](const uint8_t _k) { return *ed::decodeMdKit(r.dump(0x52, _k)); };
		const auto show = [&](const ed::MdKit& _k, const char* _what) {
			std::printf("  %s: name '", _what);
			for(const auto c : _k.name) std::printf("%c", c >= 32 && c < 127 ? c : '.');
			std::printf("' version %d revision %d; name bytes", _k.version, _k.revision);
			for(const auto c : _k.name) std::printf(" %02x", c);
			std::printf("\n");
			for(size_t t = 0; t < 16; ++t)
			{
				std::printf("    T%-2zu model %3u level %3d trig %3d mute %3d lfo %d/%d/%d/%d/%d params", t + 1, _k.models[t], _k.levels[t], _k.trigGroups[t],
					_k.muteGroups[t], _k.lfos[t].track, _k.lfos[t].param, _k.lfos[t].shape1, _k.lfos[t].shape2, _k.lfos[t].update);
				for(const auto v : _k.params[t]) std::printf(" %d", v);
				std::printf("\n");
				if(t > 1 && std::getenv("W12_ALL") == nullptr) { std::printf("    ...\n"); break; }
			}
			for(size_t f = 0; f < 4; ++f) { std::printf("    master fx %zu:", f); for(const auto v : _k.masterFx[f]) std::printf(" %d", v); std::printf("\n"); }
			for(size_t t = 0; t < 16; t += 5) { std::printf("    lfo state T%zu:", t + 1); for(const auto v : _k.lfos[t].state) std::printf(" %d", v); std::printf("\n"); }
		};
		const int k0 = r.status(0x02);
		std::printf("  current kit %d\n", k0);
		std::vector<ed::MdKit> cleared;
		for(const int down : {3, 5})
		{
			const auto slot = static_cast<uint8_t>(k0 + down);
			const auto before = readKit(slot);
			show(before, ("slot " + std::to_string(slot) + " before").c_str());
			keySeq(r, "kit,enter,down*" + std::to_string(down) + ",f+play");
			r.run(300);
			if(std::getenv("W12_LCD")) printLcd(r, "after f+play");
			keySeq(r, "exit,exit");
			r.run(500);
			const auto after = readKit(slot);
			show(after, ("slot " + std::to_string(slot) + " after CLEAR KIT").c_str());
			check(after == ed::mdClearedKit(before, slot), "slot " + std::to_string(slot) + ": the machine's CLEAR KIT leaves elektronData::mdClearedKit");
			cleared.push_back(after);
		}
		auto a = cleared[0], b = cleared[1];
		a.position = b.position = 0;
		const bool same = a == b;
		bool tracksSame = true, allEmpty = true;
		for(size_t t = 0; t < 16; ++t)
		{
			tracksSame = tracksSame && cleared[0].params[t] == cleared[0].params[0] && cleared[0].levels[t] == cleared[0].levels[0];
			allEmpty = allEmpty && cleared[0].models[t] == 0;
		}
		result("W12c MD clear kit", std::string("two cleared slots ") + (same ? "are the same kit" : "differ") + "; every track " +
			(allEmpty ? "GND-EMPTY" : "not GND-EMPTY") + (tracksSame ? ", the same values on every track" : ", values differ per track"));
	}

	// ---- W12d MD + MM: STOP with a pattern cued (MD-099) -----------------------------------------------------------------
	// A01 plays, A02 is cued (a TRIG key while playing, or SysEx LOAD PATTERN), then STOP: the panel's, or MIDI Stop. Which
	// pattern is current after it, and which plays on PLAY?

	void w12stop(const Bytes& _rom, const bool _mm)
	{
		std::printf("== W12d %s: STOP with a pattern cued\n", _mm ? "MM" : "MD");
		Rig r(_rom, _mm);
		const auto pat = [&] { return r.status(0x04); };
		std::string line;
		const char* cues[2] = {"TRIG key", "SysEx LOAD PATTERN"};
		const char* stops[2] = {"panel STOP", "MIDI Stop"};
		for(int cue = 0; cue < 2; ++cue)
			for(int stop = 0; stop < 2; ++stop)
			{
				halt(r);
				r.setSongMode(false);
				r.loadPattern(0);
				key(r, md::PanelControl::Play);
				r.run(300);
				if(cue == 0)
					key(r, md::PanelControl::Trigger2);
				else
					r->send(_mm ? ed::mmLoadPattern(1) : ed::mdLoadPattern(1));
				r.run(150);
				const int cued = pat();
				const int stepBefore = r.step();
				if(stop == 0)
					key(r, md::PanelControl::Stop);
				else
					r->post({0xfc});
				r.run(300);
				const int after = pat();
				key(r, md::PanelControl::Play);
				r.run(300);
				const int plays = pat();
				const int step = r.step();
				char b[256];
				std::snprintf(b, sizeof b, "%s + %s: pattern %d while cued (step %d), %d after STOP, %d after PLAY (step %d)", cues[cue], stops[stop], cued,
					stepBefore, after, plays, step);
				std::printf("  %s\n", b);
				line += std::string(b) + "; ";
			}
		halt(r);
		result(_mm ? "W12d MM stop" : "W12d MD stop", line);
	}

	// ---- W12e MD: a pattern made longer on the machine copies its first page (MD-106) ------------------------------------
	// A 16-step pattern with trigs, a lock, accent and swing on page 1 only goes in as a dump; SCALE SETUP (FUNCTION +
	// SCALE) and UP / DOWN lengthen it; the pattern read back. Again with a trig on page 3 (the manual: the copy happens
	// only when the later pages are empty), and from 32 steps, and to 48.

	void w12extend(const Bytes& _rom)
	{
		std::puts("== W12e MD: lengthening a pattern on the machine");
		std::unique_ptr<Rig> rig;
		const auto readPattern = [&](const uint8_t _p) { return *ed::decodeMdPattern(rig->dump(0x67, _p)); };
		const auto trigsOf = [](const ed::MdPattern& _p, const size_t _t) {
			std::string s;
			for(size_t i = 0; i < _p.length; ++i)
				s += (i && i % 16 == 0 ? "|" : "") + std::string(ed::hasTrig(_p, _t, i) ? "x" : ".");
			return s;
		};
		std::string line;
		struct Case { const char* what; uint8_t from; const char* keys; bool page3; };
		for(const Case c : {Case{"LEN 16 scale 16, up (LEN 17)", 16, "up", false}, Case{"scale 16 -> 32 (right, up)", 16, "right,up", false},
				Case{"scale 16 -> 64 (right, up*3)", 16, "right,up*3", false}, Case{"scale 16 -> 64 with a trig on page 3", 16, "right,up*3", true},
				Case{"scale 32 -> 64 (right, up*2)", 32, "right,up*2", false}, Case{"scale 16 -> 48 (right, up*2)", 16, "right,up*2", false},
				Case{"LEN 16 scale 64 -> LEN 64 (up*48)", 16, "up*48", false},
				Case{"scale 16 -> 32 with a trig on page 2", 16, "right,up", true}, Case{"scale 32 LEN 20 -> scale 64", 20, "right,up*2", false},
				Case{"scale 16 -> 32 with a trig on page 3 (step 41, past the new length)", 16, "right,up", true}})
		{
			rig = std::make_unique<Rig>(_rom, false);
			auto& r = *rig;
			auto p = readPattern(0);
			p.length = c.from;
			const bool wide = std::string(c.what).find("scale 64 ->") != std::string::npos;
			p.scale = wide ? 3 : c.from == 20 ? 1 : static_cast<uint8_t>(c.from / 16 - 1);
			p.trigs.fill(0);
			p.lockMasks.fill(0);
			for(auto& row : p.lockRows) row.fill(0xff);
			p.accentPattern = p.slidePattern = p.swingPattern = 0;
			p.trackAccent.fill(0); p.trackSlide.fill(0); p.trackSwing.fill(0);
			p.lockedRows = 0;
			for(const size_t i : {0, 4, 8, 13})
				p = ed::withTrig(p, 0, i, true);
			p = ed::withTrig(p, 1, 2, true);
			if(c.from > 16)
				p = ed::withTrig(p, 1, 20, true);
			if(c.page3)
				p = ed::withTrig(p, 2, std::string(c.what).find("page 2") != std::string::npos ? 20 : 40, true);
			p.accentPattern = 1ull << 4;
			p.swingPattern = 1ull << 8;
			if(const auto l = ed::withLock(p, 0, 0, 4, 99))
				p = *l;
			p.position = 0;
			r->send(ed::encodeMdPattern(p));
			r.run(500);
			r.loadPattern(0);
			const auto before = readPattern(0);
			keySeq(r, "f+scale");
			keySeq(r, std::string("left*3,") + c.keys);
			keySeq(r, "exit");
			r.run(400);
			const auto after = readPattern(0);
			const auto lock = ed::lockValue(after, 0, 0, 36);
			const auto lock2 = ed::lockValue(after, 0, 0, 20);
			char b[600];
			std::snprintf(b, sizeof b, "%s: length %d/%d -> %d/%d; T1 %s; T2 %s; T3 %s; accent %016llx swing %016llx; lock T1 PTCH step 21 %d, step 37 %d",
				c.what, before.length, before.scale, after.length, after.scale, trigsOf(after, 0).c_str(), trigsOf(after, 1).c_str(), trigsOf(after, 2).c_str(),
				static_cast<unsigned long long>(after.accentPattern), static_cast<unsigned long long>(after.swingPattern), lock2 ? *lock2 : -1, lock ? *lock : -1);
			std::printf("  %s\n", b);
			line += std::string(b) + "; ";
		}
		result("W12e MD extend", line);
	}

	// ---- W12f MD: where the firmware counts a song row's repeats (MD-147) -------------------------------------------------
	// Song 8: row 0 = A02 (8 steps) x4 (REPEATS 3), row 1 = A03 x3 (REPEATS 2), END. SONG mode, PLAY; main RAM snapshot in
	// the middle of every pass (step 4); the bytes that count the passes of a row (up or down by one a pass, again for the
	// next row).

	void w12repeats(const Bytes& _rom)
	{
		std::puts("== W12f MD: the song row's repeat counter");
		Rig r(_rom, false);
		mdSetupSong(r);
		ed::MdSong song;
		song.position = 7;
		song.rows.clear();
		for(const auto [pat, reps] : {std::pair<uint8_t, uint8_t>{1, 3}, {2, 2}})
		{
			ed::MdSongRow row;
			row.pattern = pat;
			row.repeats = reps;
			row.start = 0;
			row.end = 8;
			song.rows.push_back(row);
		}
		ed::MdSongRow end;
		end.pattern = ed::MdSongRow::g_endRow;
		song.rows.push_back(end);
		r->send(ed::encodeMdSong(song));
		r.run(300);
		r.loadSong(7);
		r.setSongMode(true);
		key(r, md::PanelControl::Play);
		std::vector<Bytes> snaps;
		std::vector<int> rows;
		int last = -1;
		for(int i = 0; i < 4000 && snaps.size() < 7; ++i)
		{
			r.run(5);
			const int st = r.step();
			if(st == 4 && last != 4)
			{
				snaps.push_back(r->snapshotRam());
				rows.push_back(r.row());
			}
			last = st;
		}
		halt(r);
		std::string rowLine;
		for(const auto x : rows)
			rowLine += std::to_string(x) + " ";
		std::printf("  rows at the passes: %s\n", rowLine.c_str());
		std::string found;
		if(snaps.size() == 7)
			for(size_t a = 0; a < snaps[0].size(); ++a)
			{
				int v[7];
				for(size_t k = 0; k < 7; ++k)
					v[k] = snaps[k][a];
				const auto counts = [&](const size_t _from, const size_t _n, const int _dir) {
					for(size_t k = _from + 1; k < _from + _n; ++k)
						if(v[k] != v[k - 1] + _dir)
							return false;
					return true;
				};
				for(const int dir : {-1, 1})
					if(counts(0, 4, dir) && counts(4, 3, dir))
					{
						char x[160];
						std::snprintf(x, sizeof x, " 0x%06zx (%s: %d %d %d %d | %d %d %d)", 0x200000 + a, dir < 0 ? "down" : "up", v[0], v[1], v[2], v[3], v[4], v[5], v[6]);
						std::printf("  candidate%s\n", x);
						found += x;
					}
			}
		result("W12f MD repeats", "rows " + rowLine + "; counters:" + (found.empty() ? std::string(" none") : found));
	}

	// ---- W12g MM: the kit a pattern uses (MM-095) ---------------------------------------------------------------------------
	// Pattern 2 (not playing) and pattern 1 (the current one) get kit 4 by a dump (SYSEX RECV); which kit plays after each,
	// and after LOAD PATTERN of each? Stopped and playing.

	void w12patkit(const Bytes& _rom)
	{
		std::puts("== W12g MM: a pattern's kit");
		Rig r(_rom, true);
		std::string line;
		const auto setKit = [&](const uint8_t _p, const uint8_t _k) {
			auto p = *ed::decodeMmPattern(r.dump(0x67, _p));
			p.kit = _k;
			mmSendDumps(r, {ed::encodeMmPattern(p)});
			r.run(500);
			return static_cast<int>(ed::decodeMmPattern(r.dump(0x67, _p))->kit);
		};
		const auto say = [&](const std::string& _what) {
			char b[200];
			std::snprintf(b, sizeof b, "%s: pattern %d, kit %d", _what.c_str(), r.status(0x04), r.status(0x02));
			std::printf("  %s\n", b);
			line += std::string(b) + "; ";
		};
		r.loadPattern(0);
		r->send(ed::mmLoadKit(0));
		r.run(400);
		say("start");
		for(const bool playing : {false, true})
		{
			const std::string w = playing ? " (playing)" : " (stopped)";
			if(playing)
				key(r, md::PanelControl::Play);
			std::printf("  pattern 2 kit set to 5 by a dump: read back %d\n", setKit(1, 5));
			say("after the dump into another pattern" + w);
			std::printf("  pattern 1 kit set to 4 by a dump: read back %d\n", setKit(0, 4));
			say("after the dump into the current pattern" + w);
			r.loadPattern(1);
			r.run(playing ? 2500 : 300);
			say("after LOAD PATTERN 2" + w);
			r.loadPattern(0);
			r.run(playing ? 2500 : 300);
			say("after LOAD PATTERN 1" + w);
			if(playing)
				halt(r);
			setKit(0, 0);
			setKit(1, 1);
			r.loadPattern(0);
			r->send(ed::mmLoadKit(0));
			r.run(400);
		}
		result("W12g MM pattern kit", line);
	}

	// ---- W12h MM: the song's bars and beats (MM-271) --------------------------------------------------------------------------
	// Song 6 (rows of 8 steps = 2 beats): SONG mode, PLAY; main RAM in the middle of every row (step 4); the bytes and
	// 16-bit words that grow by the same amount every row.

	void w12mmcounter(const Bytes& _rom)
	{
		std::puts("== W12h MM: the song's played bars and beats");
		Rig r(_rom, true);
		mmSetupSong(r);
		r.loadSong(5);
		r.setSongMode(true);
		key(r, md::PanelControl::Play);
		std::vector<Bytes> snaps;
		std::vector<int> rows;
		int last = -1;
		for(int i = 0; i < 4000 && snaps.size() < (std::getenv("W12_KEYS") ? 3u : 5u); ++i)
		{
			r.run(5);
			const int st = r.step();
			if(st == 4 && last != 4)
			{
				snaps.push_back(r->snapshotRam());
				rows.push_back(r.row());
			}
			last = st;
		}
		if(const char* keys = std::getenv("W12_KEYS"))
		{
			keySeq(r, keys);
			std::printf("  after the keys: song steps (0x2bdf3c) %d\n", (r->read8(0x2bdf3c) << 8) | r->read8(0x2bdf3d));
		}
		halt(r);
		std::string rowLine;
		for(const auto x : rows)
			rowLine += std::to_string(x) + " ";
		std::printf("  rows at the samples: %s\n", rowLine.c_str());
		std::string found;
		if(snaps.size() == 5)
			for(size_t a = 0; a + 1 < snaps[0].size(); ++a)
				for(const int width : {1, 2})
				{
					int v[5];
					for(size_t k = 0; k < 5; ++k)
						v[k] = width == 1 ? snaps[k][a] : (snaps[k][a] << 8) | snaps[k][a + 1];
					const int d = v[1] - v[0];
					if(d <= 0 || d > 64)
						continue;
					bool same = true;
					for(size_t k = 2; k < 5 && same; ++k)
						same = v[k] - v[k - 1] == d;
					if(!same)
						continue;
					char x[160];
					std::snprintf(x, sizeof x, " 0x%06zx/%d (+%d: %d %d %d %d %d)", 0x200000 + a, width, d, v[0], v[1], v[2], v[3], v[4]);
					std::printf("  candidate%s\n", x);
					found += x;
				}
		result("W12h MM counter", "rows " + rowLine + "; growing:" + (found.empty() ? std::string(" none") : found));
	}

	// ---- explore ------------------------------------------------------------------------------------------------------

	void explore(const Bytes& _rom, const bool _mm, const std::string& _keys)
	{
		Rig r(_rom, _mm);
		keySeq(r, _keys);
		r.run(300);
		if(std::getenv("EXPLORE_ASCII"))
			printLcd(r, _keys.c_str());
	}
}

int main(const int _argc, char** _argv)
{
	std::setvbuf(stdout, nullptr, _IONBF, 0);
	if(_argc < 3)
	{
		std::puts("usage: gapProbesFirmwareTest <MD ROM|-> <MM ROM|-> [p1|p1md|p1mm|p2|p2panel|p3|p4|p5|p6|p6b|p7|p8|p9|p10|all|explore md|mm keys]");
		return 77;
	}
	try
	{
		// "--env" for a ROM: GEARMULATOR_MD_FIRMWARE_BIN / GEARMULATOR_MM_FIRMWARE_BIN, "-" when it is not set
		const auto romArg = [](const std::string& _arg, const char* _env) {
			if(_arg != "--env")
				return _arg;
			const char* v = std::getenv(_env);
			return std::string(v && *v ? v : "-");
		};
		const std::string mdPath = romArg(_argv[1], "GEARMULATOR_MD_FIRMWARE_BIN"), mmPath = romArg(_argv[2], "GEARMULATOR_MM_FIRMWARE_BIN");
		if(mdPath == "-" && mmPath == "-")
		{
			std::puts("gapProbesFirmwareTest: SKIP (no ROM)");
			return 77;
		}
		Bytes mdRom, mmRom;
		if(mdPath != "-")
		{
			g_mdRomName = mdPath;
			mdRom = load(mdPath);
			require(mdRom.size() == md::g_romSize, "MD ROM must be the 8 MiB MD 1.63 image");
		}
		if(mmPath != "-")
		{
			g_mmRomName = mmPath;
			mmRom = load(mmPath);
			require(mmRom.size() == md::g_romSize, "MM ROM must be the 8 MiB MM 1.32B image");
		}
		const std::string only = _argc > 3 ? _argv[3] : "all";
		const auto want = [&](const char* _id) { return only == "all" || only == _id; };
		if(only == "explore")
		{
			require(_argc > 5, "explore md|mm keys");
			const bool mm = std::string(_argv[4]) == "mm";
			explore(mm ? mmRom : mdRom, mm, _argv[5]);
			return 0;
		}
		if(!mdRom.empty() && only == "w12undo")
			w12undo(mdRom, false);
		if(!mmRom.empty() && only == "w12undo")
			w12undo(mmRom, true);
		if(!mdRom.empty() && only == "w12clearkit")
			w12clearkit(mdRom);
		if(!mdRom.empty() && only == "w12stop")
			w12stop(mdRom, false);
		if(!mmRom.empty() && only == "w12stop")
			w12stop(mmRom, true);
		if(!mdRom.empty() && only == "w12extend")
			w12extend(mdRom);
		if(!mdRom.empty() && only == "w12repeats")
			w12repeats(mdRom);
		if(!mmRom.empty() && only == "w12patkit")
			w12patkit(mmRom);
		if(!mmRom.empty() && only == "w12mmcounter")
			w12mmcounter(mmRom);
		if(!mdRom.empty() && only == "w12clip")
			w12clip(mdRom);
		if(!mdRom.empty() && want("p3"))
			p3(mdRom);
		if(!mmRom.empty() && (want("p2") || only == "p2panel"))
			p2panel(mmRom);
		if(!mmRom.empty() && want("p2"))
			p2(mmRom);
		if(!mmRom.empty() && only == "p8")
			p8(mmRom);
		if(!mmRom.empty() && only == "p10")
			p10(mmRom);
		if(!mmRom.empty() && want("p4"))
			p4(mmRom);
		if(!mdRom.empty() && want("p5"))
			p5(mdRom);
		if(!mmRom.empty() && (want("p5") || only == "p5mm"))
			p5mm(mmRom);
		if(!mdRom.empty() && want("p6"))
			p6(mdRom);
		if(!mdRom.empty() && (want("p6") || only == "p6b"))
			p6b(mdRom);
		if(!mdRom.empty() && want("p7"))
			p7(mdRom);
		if(!mdRom.empty() && want("p9"))
			p9(mdRom);
		if(!mdRom.empty() && (want("p1") || only == "p1md"))
			p1(mdRom, false);
		if(!mmRom.empty() && (want("p1") || only == "p1mm"))
			p1(mmRom, true);
		if(!mdRom.empty() && (want("p1") || only == "p1b" || only == "p1bmd"))
			p1pause(mdRom, false);
		if(!mmRom.empty() && (want("p1") || only == "p1b" || only == "p1bmm"))
			p1pause(mmRom, true);
		std::printf("gapProbesFirmwareTest: %s (%d failure(s))\n", g_failures ? "FAIL" : "PASS", g_failures);
		return g_failures ? 1 : 0;
	}
	catch(const std::exception& e)
	{
		std::printf("gapProbesFirmwareTest: ERROR %s\n", e.what());
		return 1;
	}
}
