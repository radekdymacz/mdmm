// deskStubHost: the editors' real core (deskCore with mdDesk or mmDesk) behind a page that runs without the plug-in, for
// the page tier (doc/release/DEV-CYCLE.md, scripts/mdmm-page.mjs). No JUCE, no emulator, no ROM: the machine is a fake
// that speaks the firmware's SysEx (it keeps the dumps it is sent, answers requests and status, loads patterns and kits)
// and reports what the emulator's device edge reports (telemetry, the working kit from memory). So undo, refusals,
// history, the library and the read-back are the real code, and a journey's "machine" check reads the core's documents.
//
//   deskStubHost md|mm [--real-timing]
//
// The page's batches come in on stdin, one JSON array per line (what the page's bridge posts); the messages for the
// page go out on stdout, one JSON array per line (what gm.recv takes). The plug-in's own commands (deskHost's table:
// the engine map, ROM, audio, menu, notices) are answered ok and do nothing, but the SysEx ones (wave 6): the session's
// SysEx work runs here as in the plug-in (mdJucePlugin/mdSyxWork.h), Import SysEx… opens the page tier's own file (two
// kits and two patterns named IMPORT, or GEARMULATOR_MDMM_SYX_FILE), Export SysEx… writes into the temp folder, and a
// factory reset is said to be the plug-in's. --real-timing keeps the emulator
// profile's dump pacing (a read-back 750 ms after the last edit on the MD) and the desk's clock at the wall's speed; by
// default the pacing is 20 ms and the desk's clock runs four times as fast (the loads at start take seconds, not ten).

#include "mdDesk/mdDesk.h"
#include "mdDesk/mdDeskSetup.h"
#include "mmDesk/mmDesk.h"
#include "deskHost/deskHost.h"
#include "mdJucePlugin/mdSyxWork.h"

#include "elektronData/factoryGlobals.h"
#include "elektronData/mdCommands.h"
#include "elektronData/mdGlobal.h"
#include "elektronData/mdKit.h"
#include "elektronData/mdPattern.h"
#include "elektronData/mdSamples.h"
#include "elektronData/mdAudition.h"
#include "elektronData/mdSong.h"
#include "elektronData/mdWorkingKit.h"
#include "elektronData/mmCommands.h"
#include "elektronData/mmGlobal.h"
#include "elektronData/mmKit.h"
#include "elektronData/mmMachines.h"
#include "elektronData/mmPattern.h"
#include "elektronData/mmSong.h"

#include "deskWire/mmWire.h"

#include <poll.h>
#include <unistd.h>

#include <array>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <iterator>
#include <type_traits>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace
{
	namespace ed = elektronData;
	using Value = ed::json::Value;
	using Bytes = std::vector<uint8_t>;

	// The desk's clock. By default it runs four times as fast as the wall's: the background loads (30 ms between two
	// requests), the read-back's quiet time and the expectations' windows pass in a quarter of the time; the page's own
	// timers and the journeys' waits stay real. --real-timing: one to one.
	double g_timeScale = 4;
	double nowMs()
	{
		static const auto t0 = std::chrono::steady_clock::now();
		return g_timeScale * std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
	}

	Bytes load(const std::string& _name)
	{
		std::ifstream s(std::string(DESKSTUB_TESTDATA_DIR) + "/" + _name, std::ios::binary);
		return {std::istreambuf_iterator<char>(s), std::istreambuf_iterator<char>()};
	}

	template<size_t N> void setName(std::array<uint8_t, N>& _name, const std::string& _text)
	{
		_name.fill(0);
		for(size_t i = 0; i < N && i < _text.size(); ++i)
			_name[i] = static_cast<uint8_t>(_text[i]);
	}

	std::string twoDigits(const int _n)
	{
		char b[8];
		std::snprintf(b, sizeof(b), "%02d", _n);
		return b;
	}

	// a SysEx message of the form F0 00 20 3C <product> 00 <command> <value> F7
	bool isShort(const Bytes& _m, const uint8_t _product)
	{
		return _m.size() >= 9 && _m[0] == 0xf0 && _m[1] == 0x00 && _m[2] == 0x20 && _m[3] == 0x3c && _m[4] == _product && _m.back() == 0xf7;
	}

	// ------------------------------------------------------------------------------------------------- the Machinedrum
	// The fake MD OS 1.63: 128 patterns, 64 kits, 32 songs and 8 globals (the committed test dumps and copies of them,
	// each kit named KIT nn), what plays (pattern, kit, song, global, the sequencer mode), the working kit (the CCs and
	// the working-kit SysEx move it; memory shows it), the mutes, PLAY and STOP.
	class FakeMd
	{
	public:
		FakeMd()
		{
			const ed::MdKit kits0[3] = {*ed::decodeMdKit(load("programmed_kit_0.syx")), *ed::decodeMdKit(load("programmed_kit_1.syx")),
				*ed::decodeMdKit(load("programmed_kit_2.syx"))};
			for(uint8_t k = 0; k < ed::MdKit::g_slots; ++k)
			{
				auto kit = kits0[k % 3];
				kit.position = k;
				setName(kit.name, "KIT " + twoDigits(k + 1));
				m_kits[k] = kit;
			}
			// every pattern 16 steps with a few trigs (kick, snare, hats), per-track accent, slide and swing (EDIT ALL off);
			// the programmed test dumps (one with all 64 lock rows in use) at A08, B01 and H16
			auto empty = *ed::decodeMdPattern(load("programmed_pattern_1.syx"));
			empty.length = 16;
			empty.accentEditAll = empty.slideEditAll = empty.swingEditAll = 0;
			empty.accentPattern = empty.slidePattern = empty.swingPattern = 0;
			empty.trackAccent.fill(0);
			empty.trackSlide.fill(0);
			empty.trackSwing.fill(0);
			for(uint8_t p = 0; p < 128; ++p)
			{
				auto pat = empty;
				pat.position = p;
				pat.kit = static_cast<uint8_t>(p % 16);
				pat.trigs.fill(0);
				pat.trigs[0] = 0x1111;					// steps 1, 5, 9, 13
				pat.trigs[1] = 0x1010;					// 5, 13
				pat.trigs[2] = 0x5555 << (p & 1);		// every other step
				pat.trigs[3] = p & 2 ? 0x0100 : 0;
				m_patterns[p] = pat;
			}
			for(const auto& [slot, file] : std::map<uint8_t, const char*>{{7, "programmed_pattern_2.syx"}, {16, "programmed_pattern_7.syx"},
				{127, "programmed_pattern_0.syx"}})
			{
				auto pat = *ed::decodeMdPattern(load(file));
				pat.position = slot;
				m_patterns[slot] = pat;
			}
			// every song: A01 to A04, then END
			for(uint8_t s = 0; s < ed::MdSong::g_slots; ++s)
			{
				ed::MdSong song;
				song.position = s;
				setName(song.name, "SONG " + twoDigits(s + 1));
				song.rows.clear();
				for(uint8_t r = 0; r < 4; ++r)
				{
					ed::MdSongRow row;
					row.pattern = r;
					row.repeats = 0;
					song.rows.push_back(row);
				}
				song.rows.push_back(ed::MdSongRow{});	// END
				m_songs[s] = song;
			}
			// the sample bank: ROM slots 1-4 hold a short sine each (named SIN1-SIN4), the rest and RAM are empty
			for(uint8_t s = 0; s < 48; ++s)
			{
				ed::MdSampleSlot slot;
				slot.slot = s;
				if(s < 4)
				{
					auto pcm = std::make_shared<std::vector<int16_t>>(11025);
					for(size_t i = 0; i < pcm->size(); ++i)
						(*pcm)[i] = static_cast<int16_t>(12000 * std::sin(6.2831853 * (110.0 * (s + 1)) * static_cast<double>(i) / 44100.0));
					slot.empty = false;
					slot.length = static_cast<uint32_t>(pcm->size());
					slot.rate = 44100;
					slot.name = "SIN" + std::to_string(s + 1);
					slot.peaks = ed::mdPeaks(slot.length, ed::g_mdSampleBins, [&](const uint32_t _i) { return (*pcm)[_i] / 32768.0f; });
					slot.pcm = pcm;
				}
				m_samples.rom.push_back(slot);
			}
			for(uint8_t s = 0; s < 4; ++s)
			{
				ed::MdSampleSlot slot;
				slot.ram = true;
				slot.slot = s;
				m_samples.ram.push_back(slot);
			}
			m_samples.ramReadable = true;
			m_samples.signature = 1;
			for(uint8_t g = 0; g < ed::MdGlobal::g_slots; ++g)
				m_globals[g] = ed::mdFactoryGlobal(g);
			m_kit = m_patterns[0].kit;
			m_working = m_kits[m_kit];
		}

		mdDesk::DevicePort port()
		{
			mdDesk::DevicePort p;
			p.sendSysex = [this](const Bytes& _m) { take(_m); };
			p.sendKitParam = [this](const uint8_t _t, const uint8_t _i, const uint8_t _v)
			{
				if(_t >= 16)
					return;
				if(_i < 24)
					m_working.params[_t][_i] = _v;
				else if(_i == 24)
					m_working.levels[_t] = _v;
			};
			p.sendMute = [this](const uint8_t _t, const bool _on) { if(_t < 16) m_mutes = _on ? (m_mutes | (1 << _t)) : (m_mutes & ~(1 << _t)); };
			p.sendNote = [](uint8_t, uint8_t, uint8_t) {};
			p.pressKey = [this](const std::string& _k) { return press(_k); };
			// DATA ENTRY: present (live recording needs it) but no knob page is reported, so Control All stays on CCs
			p.turnKnob = [this](const uint8_t _knob, const int _d)
			{
				// live recording: a DATA ENTRY turn moves the selected track's value on the knob page and locks the next trig
				// of that track with it (manual p.48; slice 5: MD-139)
				if(m_recording && m_playing && _knob < 8 && m_knobPage >= 0 && m_knobPage < 3)
				{
					const size_t i = static_cast<size_t>(m_knobPage) * 8 + _knob;
					const int v = std::clamp(static_cast<int>(m_working.params[m_track][i]) + _d, 0, 127);
					m_working.params[m_track][i] = static_cast<uint8_t>(v);
					const auto& pat = m_patterns[m_pattern];
					const size_t len = std::max<size_t>(1, pat.length);
					for(size_t k = 1; k <= len; ++k)
					{
						const size_t st = (static_cast<size_t>(m_step) + k) % len;
						if((pat.trigs[m_track] >> st) & 1)
						{
							if(const auto locked = ed::withLock(pat, m_track, i, st, static_cast<uint8_t>(v)))
								m_patterns[m_pattern] = *locked;
							break;
						}
					}
				}
				return true;
			};
			p.sendMidi = [this](const Bytes& _m) { realtime(_m); };
			p.nowMs = [] { return nowMs(); };
			p.audition = [this](const ed::AuditionClip& _clip)
			{
				m_audition = {++m_auditionId, _clip.pcm != nullptr, 0};
				m_auditionEnds = nowMs() + g_timeScale * (_clip.pcm && _clip.rate ? 1000.0 * static_cast<double>(_clip.pcm->size()) / _clip.rate : 0);
				return m_audition.id;
			};
			p.auditionStatus = [this]
			{
				if(m_audition.playing && nowMs() >= m_auditionEnds)
					m_audition.playing = false;
				return m_audition;
			};
			return p;
		}

		// what the device edge hands the desk each step (mdSessionMd.cpp, MdEmuEngine::step)
		void step(mdDesk::Desk& _desk)
		{
			auto replies = std::move(m_replies);
			m_replies.clear();
			for(const auto& r : replies)
				_desk.onDeviceSysex(r);
			const double now = nowMs();
			if(m_playing && now - m_stepAt >= 125 * g_timeScale)	// 120 BPM, a 16th (wall time)
			{
				m_stepAt = now;
				if(m_songMode)
					m_step = songLocate(++m_songPos).second;
				else
					m_step = (m_step + 1) % std::max<int>(1, m_patterns[m_pattern].length);
				// wave 7: EXIT/NO and a TRIG key held while live recording: that track's trig on the step that plays goes
				if(m_recording && m_exitHeld && m_heldTrig >= 0)
					m_patterns[m_pattern] = ed::withTrig(m_patterns[m_pattern], static_cast<size_t>(m_heldTrig), static_cast<size_t>(m_step), false);
				// MD-140: EXIT/NO and a DATA ENTRY knob's switch: the selected track's lock of that knob's parameter on the step goes
				if(m_recording && m_exitHeld && m_heldKnob >= 0)
					m_patterns[m_pattern] = ed::withoutLock(m_patterns[m_pattern], m_track, static_cast<size_t>(m_knobPage * 8 + m_heldKnob),
						static_cast<size_t>(m_step));
			}
			mdDesk::Telemetry t;
			t.valid = true;
			t.step = m_playing ? m_step : -1;
			t.pattern = m_pattern;
			t.playing = m_playing;
			t.recording = m_recording;
			// the knob page only while live recording (lock removal needs it): stopped or playing none is reported, so
			// Control All stays on CCs
			t.knobPage = m_recording ? m_knobPage : -1;
			t.bootAnimation = 0;
			t.mutes = m_mutes;
			t.chainKnown = true;
			t.chain = m_chain;
			t.bankGroup = m_bankGroup;
			t.panelPending = 0;
			t.songRow = m_songMode && m_playing ? songLocate(m_songPos).first : -1;
			_desk.onTelemetry(t);
			if(now - m_memoryAt >= 32)
			{
				m_memoryAt = now;
				Bytes region{m_kit, 0};
				const auto image = ed::mdWorkingKitImage(m_working);
				region.insert(region.end(), image.begin(), image.end());
				_desk.onWorkingKitMemory(region);
			}
			if(_desk.pageSeen() && !_desk.hasSamples())
				_desk.onSampleBank(m_samples);
			_desk.tick();
		}

	private:

		void reply(Bytes _m) { m_replies.push_back(std::move(_m)); }
	public:
		// replies waiting: the host steps again at once (a background load is a request and its reply, back to back)
		bool busy() const { return !m_replies.empty(); }
	private:
		void status(const uint8_t _param, const uint8_t _value)
		{
			reply({0xf0, 0x00, 0x20, 0x3c, 0x02, 0x00, 0x72, _param, static_cast<uint8_t>(_value & 0x7f), 0xf7});
		}
		uint8_t statusValue(const uint8_t _param) const
		{
			switch(_param)
			{
			case 0x01: return m_global;
			case 0x02: return m_kit;
			case 0x04: return m_pattern;
			case 0x08: return m_song;
			case 0x10: return m_songMode ? 1 : 0;
			case 0x20: return m_globals[m_global].extendedMode ? 1 : 0;	// extended locks: the active global's
			case 0x22: return m_track;
			default: return 0;
			}
		}
		// LOAD PATTERN (also what ends a chain: the chain's Clear, mdDeskChain.cpp)
		void loadPattern(const uint8_t _p)
		{
			m_chain = {};
			m_pattern = _p & 127;
			loadKit(m_patterns[m_pattern].kit);
		}
		void loadKit(const uint8_t _k)
		{
			m_kit = _k & 63;
			m_working = m_kits[m_kit];
		}

		void take(const Bytes& _m)
		{
			if(!isShort(_m, 0x02))
				return;
			const auto cmd = _m[6];
			const auto v = _m[7];
			switch(cmd)
			{
			case 0x70: status(v, statusValue(v)); return;
			case 0x71:	// SET STATUS
				if(_m.size() < 10)
					return;
				switch(v)
				{
				case 0x01: m_global = _m[8] & 7; break;
				case 0x02: loadKit(_m[8]); break;
				case 0x04: loadPattern(_m[8]); break;
				case 0x08: m_song = _m[8] & 31; break;
				case 0x10: m_songMode = _m[8] != 0; break;
				case 0x20: m_globals[m_global].extendedMode = _m[8] != 0 ? 1 : 0; break;	// CLASSIC / EXTENDED (slice 5: MD-004)
				case 0x22: m_track = _m[8] & 15; break;
				default: break;
				}
				return;
			case 0x56: m_global = v & 7; return;	// SET ACTIVE GLOBAL (slice 5: MD-282)
			case 0x57: loadPattern(v); return;
			case 0x58: loadKit(v); return;
			case 0x59: { auto k = m_working; k.position = v & 63; m_kits[v & 63] = k; m_kit = v & 63; return; }	// SAVE KIT
			case 0x6c: m_song = v & 31; return;
			case 0x6d: return;	// SAVE SONG: the song is the slot already
			case 0x51: reply(ed::encodeMdGlobal(m_globals[v & 7])); return;
			case 0x53: reply(ed::encodeMdKit(m_kits[v & 63])); return;
			case 0x68: reply(ed::encodeMdPattern(m_patterns[v & 127])); return;
			case 0x6a: reply(ed::encodeMdSong(m_songs[v & 31])); return;
			case 0x50: if(const auto g = ed::decodeMdGlobal(_m)) m_globals[g->position & 7] = *g; return;
			case 0x52: if(const auto k = ed::decodeMdKit(_m)) m_kits[k->position & 63] = *k; return;
			case 0x67: if(const auto p = ed::decodeMdPattern(_m)) m_patterns[p->position & 127] = *p; return;
			case 0x69: if(const auto s = ed::decodeMdSong(_m)) m_songs[s->position & 31] = *s; return;
			// the working kit's own SysEx (manual Appendix C)
			case 0x5b:	// ASSIGN MACHINE: track, model (7 bits), UW, init
				if(_m.size() >= 12 && v < 16)
					m_working.models[v] = static_cast<uint32_t>(_m[8] | (_m[9] ? 0x80 : 0));
				return;
			case 0x55:	// KIT NAME
				for(size_t i = 0; i < m_working.name.size(); ++i)
					m_working.name[i] = 7 + i < _m.size() - 1 ? _m[7 + i] : 0;
				return;
			case 0x62:	// LFO: lfo << 3 | param, value
				if(_m.size() >= 10)
				{
					auto& l = m_working.lfos[(v >> 3) & 15];
					const auto x = _m[8];
					switch(v & 7) { case 0: l.track = x; break; case 1: l.param = x; break; case 2: l.shape1 = x; break; case 3: l.shape2 = x; break; case 4: l.update = x; break; default: break; }
				}
				return;
			case 0x65: if(_m.size() >= 10 && v < 16) m_working.trigGroups[v] = _m[8] == 0x7f ? ed::MdKit::g_noGroup : _m[8]; return;
			case 0x66: if(_m.size() >= 10 && v < 16) m_working.muteGroups[v] = _m[8] == 0x7f ? ed::MdKit::g_noGroup : _m[8]; return;
			case 0x61:	// TEMPO, BPM x 24 in two 7-bit bytes: the active global's
				if(_m.size() >= 10)
					m_globals[m_global].tempo = static_cast<uint16_t>((v << 7) | _m[8]);
				return;
			case 0x5c:	// TRACK ROUTING: the active global's
				if(_m.size() >= 10 && v < 16)
					m_globals[m_global].routing[v] = _m[8];
				return;
			case 0x5d: case 0x5e: case 0x5f: case 0x60:	// master effects: param, value
				if(_m.size() >= 10 && v < 8)
				{
					const size_t fx = cmd == 0x5e ? 0 : cmd == 0x5d ? 1 : cmd == 0x5f ? 2 : 3;
					m_working.masterFx[fx][v] = _m[8];
				}
				return;
			default: return;
			}
		}

		// the row and the step in it that _pos steps into the song play (rows' end - start times their plays; a LOOP, JUMP
		// or END stops the count: the fixture's songs have none before their END)
		std::pair<int, int> songLocate(const int _pos) const
		{
			const auto& song = m_songs[m_song];
			int at = 0;
			for(size_t i = 0; i < song.rows.size(); ++i)
			{
				const auto& r = song.rows[i];
				if(ed::songRowKind(r, i) != ed::MdSongRowKind::Pattern)
					break;
				const int len = std::max(1, r.end - r.start), all = len * (r.repeats + 1);
				if(_pos < at + all)
					return {static_cast<int>(i), (_pos - at) % len};
				at += all;
			}
			return {0, 0};
		}

		// wave 2: MIDI Stop holds the step, Continue goes on from it, a song position (stopped) sets where (P1; CTRL IN on)
		void realtime(const Bytes& _m)
		{
			if(_m.empty())
				return;
			if(_m[0] == 0xfc && m_playing)
			{
				m_playing = false;
				m_paused = true;
			}
			else if(_m[0] == 0xfb && !m_playing)
			{
				m_playing = true;
				m_paused = false;
				m_stepAt = nowMs();
			}
			else if(_m[0] == 0xf2 && _m.size() == 3 && !m_playing)
			{
				const int pos = _m[1] | (_m[2] << 7);
				m_songPos = pos;
				m_step = m_songMode ? songLocate(pos).second : pos % std::max<int>(1, m_patterns[m_pattern].length);
				m_paused = true;
			}
		}

		bool press(const std::string& _key)
		{
			// wave 7: keys held down and let go later (EXIT/NO, a TRIG key), a TRIG key recorded while live recording
			if(_key.rfind("hold:", 0) == 0 || _key.rfind("release:", 0) == 0)
			{
				const bool down = _key[0] == 'h';
				const auto name = _key.substr(down ? 5 : 8);
				if(name == "exit")
					m_exitHeld = down;
				else if(name.rfind("trig", 0) == 0)
					m_heldTrig = down ? std::atoi(name.c_str() + 4) - 1 : -1;
				else if(name.size() == 5 && name.rfind("knob", 0) == 0)
					m_heldKnob = down ? name[4] - 'A' : -1;
				return true;
			}
			if(_key.rfind("trig", 0) == 0)
			{
				if(m_recording && m_playing)
					m_patterns[m_pattern] = ed::withTrig(m_patterns[m_pattern], static_cast<size_t>(std::atoi(_key.c_str() + 4) - 1), static_cast<size_t>(m_step), true);
				return true;
			}
			// REC while recording is PLAY: recording off, the pattern plays on (mdDeskMachine.cpp cmdRecord)
			if(_key == "play" && m_recording)
			{
				m_recording = false;
				return true;
			}
			if(_key == "recordPlay")
				m_recording = true;
			else if(_key == "stop")
				m_recording = false;
			// PLAY: starts; while playing it pauses, while paused it goes on (the machine's own pause)
			if(_key == "play" && m_playing)
			{
				m_playing = false;
				m_paused = true;
			}
			else if(_key == "play" && m_paused)
			{
				m_playing = true;
				m_paused = false;
				m_stepAt = nowMs();
			}
			else if(_key == "play" || _key == "recordPlay")
			{
				m_playing = true;
				m_paused = false;
				m_step = 0;
				m_songPos = 0;
				m_stepAt = nowMs();
			}
			else if(_key == "stop")
			{
				m_playing = m_paused = false;
				m_step = m_songPos = 0;
			}
			else if(_key == "bankGroup")
				m_bankGroup = 1 - m_bankGroup;
			else if(_key == "page")	// SYNTHESIS / EFFECTS / ROUTING
				m_knobPage = (m_knobPage + 1) % 3;
			else if(_key.rfind("chain:", 0) == 0)	// chain:<bank>:<trig>,<trig>,...: BANK held, the TRIGs (mdDeskChain.cpp)
			{
				const auto colon = _key.find(':', 6);
				const int bank = std::atoi(_key.c_str() + 6);
				std::vector<uint8_t> list;
				for(size_t at = colon + 1; at < _key.size();)
				{
					list.push_back(static_cast<uint8_t>(m_bankGroup * 64 + bank * 16 + std::atoi(_key.c_str() + at)));
					const auto comma = _key.find(',', at);
					at = comma == std::string::npos ? _key.size() : comma + 1;
				}
				chain(list);
			}
			return true;
		}

		// one pattern: picked (the chain ends); two or more: the firmware's chain, from the first
		void chain(const std::vector<uint8_t>& _patterns)
		{
			if(_patterns.size() == 1)
			{
				m_chain = {};
				loadPattern(_patterns[0]);
				return;
			}
			if(!_patterns.empty() && !m_playing)
				loadPattern(_patterns[0]);
			m_chain.active = !_patterns.empty();
			m_chain.patterns = _patterns;
			m_chain.next = _patterns.size() > 1 ? 1 : -1;
		}

		std::array<ed::MdPattern, 128> m_patterns;
		std::array<ed::MdKit, ed::MdKit::g_slots> m_kits;
		std::array<ed::MdSong, ed::MdSong::g_slots> m_songs;
		std::array<ed::MdGlobal, ed::MdGlobal::g_slots> m_globals;
		ed::MdKit m_working;
		ed::MdSampleBank m_samples;
		ed::AuditionStatus m_audition;
		uint64_t m_auditionId = 0;
		double m_auditionEnds = 0;
		mdDesk::Chain m_chain;
		uint8_t m_pattern = 0, m_kit = 0, m_song = 0, m_global = 0, m_track = 0;
		bool m_songMode = false, m_playing = false, m_paused = false, m_recording = false, m_exitHeld = false;
		int m_heldTrig = -1, m_heldKnob = -1, m_knobPage = 0;
		int m_mutes = 0, m_step = 0, m_bankGroup = 0, m_songPos = 0;
		double m_stepAt = 0, m_memoryAt = -1000;
		std::vector<Bytes> m_replies;
	};

	// ------------------------------------------------------------------------------------------------ the Monomachine
	// The fake MM OS 1.32B (as mmDeskTest's FakeMachine, grown): dumps are taken on SYSEX RECV only (the GLOBAL menu's
	// screen the desk's key macro opens), requests and status answered, LOAD PATTERN / KIT, SAVE KIT, SET ACTIVE GLOBAL,
	// the working kit (parameter changes and machine assigns move it; memory shows it), the mutes and the transport.
	void toPage(const Value& _m);

	class FakeMm
	{
	public:
		FakeMm()
		{
			const ed::MmKit kits0[3] = {*ed::decodeMmKit(load("mm/programmed-kit-000.syx")), *ed::decodeMmKit(load("mm/programmed-kit-001.syx")),
				*ed::decodeMmKit(load("mm/programmed-kit-002.syx"))};
			for(uint8_t k = 0; k < ed::MmKit::g_slots; ++k)
			{
				auto kit = kits0[k % 3];
				kit.position = k;
				setName(kit.name, "KIT " + twoDigits(k + 1));
				m_kits[k] = kit;
			}
			std::array<ed::MmPattern, 5> p0;
			const char* files[5] = {"mm/programmed-pattern-000.syx", "mm/programmed-pattern-001.syx", "mm/programmed-pattern-002.syx",
				"mm/programmed-pattern-003.syx", "mm/programmed-pattern-005.syx"};
			for(size_t i = 0; i < 5; ++i)
				p0[i] = *ed::decodeMmPattern(load(files[i]));
			const uint8_t slots0[5] = {0, 1, 2, 3, 5};
			for(uint8_t p = 0; p < ed::MmPattern::g_slots; ++p)
			{
				auto pat = p0[1];
				for(size_t i = 0; i < 5; ++i)
					if(slots0[i] == p)
						pat = p0[i];
				pat.position = p;
				if(p > 5)
					pat.kit = static_cast<uint8_t>(p % 16);
				m_patterns[p] = pat;
			}
			// every song: A01 to A04, then END (as the firmware writes an END row: no tempo change)
			for(uint8_t s = 0; s < ed::MmSong::g_slots; ++s)
			{
				ed::MmSong song;
				song.position = s;
				setName(song.name, "SONG " + twoDigits(s + 1));
				for(size_t r = 0; r < song.rows.size(); ++r)
				{
					auto& b = song.rows[r].bytes;
					b.fill(0);
					b[ed::mmSongRow::g_pattern] = r < 4 ? static_cast<uint8_t>(r) : ed::MmSong::g_end;
					b[ed::mmSongRow::g_length] = 16;
					b[ed::mmSongRow::g_tempo] = b[ed::mmSongRow::g_tempo + 1] = 0xff;
				}
				m_songs[s] = song;
			}
			for(uint8_t g = 0; g < ed::MmGlobal::g_slots; ++g)
				m_globals[g] = ed::mmFactoryGlobal(g);
			m_kit = m_patterns[0].kit & 127;
			m_working = m_kits[m_kit];
		}

		mmDesk::DevicePort port()
		{
			mmDesk::DevicePort p;
			p.sendSysex = [this](const Bytes& _m) { wire("sysex", _m); take(_m); };
			p.sendParam = [this](const uint8_t _t, const uint8_t _p, const uint8_t _i, const uint8_t _v)
			{
				if(_t >= 6 || _i >= 8)
					return;
				if(const auto cc = deskWire::mm::param(m_baseCh, _t, _p, _i, _v))
					wire("cc", *cc);
				if(_p == 8 && _i == 0)	// the track's mute (mmDeskCommands.cpp)
					m_mutes = _v ? (m_mutes | (1 << _t)) : (m_mutes & ~(1 << _t));
				else if(_p == 7 && _i == 0)
					m_working.levels[_t] = _v;
				else if(_p < 7)
				{
					m_working.tracks[_t].pages[_p][_i] = _v;
					lockLive(_t, _p, _i, _v);
				}
			};
			// NRPN: a track's MIDI page (0x38 +) and its multi envelope (0x40 +), mmDeskDelivery.cpp
			p.baseChannel = [this](const uint8_t _ch) { m_baseCh = _ch; };
			p.sendNrpn = [this](const uint8_t _t, const uint8_t _p, const uint8_t _v)
			{
				if(_t >= 6)
					return;
				for(const auto& m : deskWire::mm::nrpn(m_baseCh, _t, _p, _v))
					wire("nrpn", m);
				if(_p >= 0x38 && _p < 0x40)
					m_working.tracks[_t].midi[_p - 0x38] = _v;
				else if(_p >= 0x40 && _p < 0x46)
					m_working.tracks[_t].multiEnv[_p - 0x40] = _v;
			};
			p.pressKeys = [this](const std::vector<mmDesk::Key>& _k) { return press(_k); };
			p.pressBankTrigs = [this](const uint8_t _bank, const std::vector<uint8_t>& _trigs)
			{
				std::vector<uint8_t> list;
				for(const auto t : _trigs)
					list.push_back(static_cast<uint8_t>(m_bankGroup * 64 + _bank * 16 + t));
				if(list.size() == 1)
				{
					m_chain = {};
					m_pattern = list[0];
					recallKit(m_patterns[m_pattern].kit);
				}
				else
				{
					m_chain.active = !list.empty();
					m_chain.patterns = list;
					m_chain.next = list.size() > 1 ? 1 : -1;
				}
				return true;
			};
			// wave 7: STEP RECORDING writes a played note (any channel here) to the focus track at the cursor, and moves on
			p.sendNote = [this](const uint8_t _ch, const uint8_t _note, const uint8_t _velocity)
			{
				if(const auto n = deskWire::note(_ch, _note, _velocity))
					wire("note", *n);
				if(m_recording != 3 || !_velocity || m_stepCursor < 0)
					return;
				setNote(m_focus, m_stepCursor, _note);
				m_stepCursor = (m_stepCursor + 1) % std::max<int>(1, m_patterns[m_pattern].length);
			};
			p.sendMidi = [this](const Bytes& _m) { realtime(_m); };
			p.nowMs = [] { return nowMs(); };
			return p;
		}

		// 0.6 slice 5 MM: every message the core hands the device edge, as the wire engine would put it on the cable (the base
		// channel from baseChannel, deskWire's CC / NRPN / note encoders): {type: "wire", kind, b: the first 16 bytes, n: its
		// length}. The page ignores the type; a journey listens to it (Bridge.onMessage) to check the CC number and the channel.
		void wire(const char* _kind, const Bytes& _b)
		{
			Value m = Value::object();
			m.set("type", "wire");
			m.set("kind", _kind);
			Value b = Value::array();
			for(size_t i = 0; i < _b.size() && i < 16; ++i)
				b.push(Value(static_cast<int>(_b[i])));
			m.set("b", std::move(b));
			m.set("n", static_cast<int>(_b.size()));
			toPage(m);
		}

		// slice 5 (MM-082, MM-207): LIVE RECORDING plays and a value the editor sends (a CC) is locked on the step that plays when it
		// arrives, a step without a trig included (mmDeskFirmwareTest reclock): the parameter's row is made when it is new (rows
		// sit in track, page, parameter order), 62 at most
		void lockLive(const uint8_t _t, const uint8_t _pg, const uint8_t _i, const uint8_t _v)
		{
			if(m_recording != 2 || !m_running)
				return;
			// the track's CC reaches the machine only on a channel it plays (as MmMachine::noteRecLock: ChannelReach)
			if(!ed::mmTrackChannel(m_globals[m_global & 7], _t).has_value())
				return;
			auto& p = m_patterns[m_pattern];
			const ed::MmLockParam param{_t, _pg, _i};
			int row = ed::mmLockRow(p, param);
			if(row < 0)
			{
				if(p.lockRowCount >= ed::MmPattern::g_lockRows)
					return;
				p.lockMasks[_t][_pg] = static_cast<uint8_t>(p.lockMasks[_t][_pg] | (1u << _i));
				row = ed::mmLockRow(p, param);
				if(row < 0)
					return;
				for(int k = static_cast<int>(ed::MmPattern::g_lockRows) - 1; k > row; --k)
					p.lockRows[static_cast<size_t>(k)] = p.lockRows[static_cast<size_t>(k) - 1];
				p.lockRows[static_cast<size_t>(row)].fill(0xff);
				++p.lockRowCount;
			}
			p.lockRows[static_cast<size_t>(row)][static_cast<size_t>(m_step) % ed::MmPattern::g_steps] = _v;
		}

		// a step of track _t: a note (0-127) or none (-1), as the machine's recordings write it (trigs and pitch)
		void setNote(const int _t, const int _s, const int _note)
		{
			auto& p = m_patterns[m_pattern];
			const auto bit = ed::mmStepBit(static_cast<size_t>(_s));
			for(auto* m : {&p.amp, &p.filter, &p.lfo, &p.pitch})
				(*m)[static_cast<size_t>(_t)] = _note >= 0 ? ((*m)[static_cast<size_t>(_t)] | bit) : ((*m)[static_cast<size_t>(_t)] & ~bit);
			p.notes[static_cast<size_t>(_t)][static_cast<size_t>(_s)] = _note >= 0 ? static_cast<uint8_t>(_note) : ed::MmPattern::g_noNote;
			// a step written or erased loses its chord notes (they need the trig, and a written note is one note)
			p.chord[static_cast<size_t>(_t)] &= ~bit;
			size_t kept = 0;
			for(size_t i = 0; i < p.chordNoteCount && i < p.chordNotes.size(); ++i)
			{
				const auto e = ed::mmNoteEntry(p.chordNotes[i]);
				if(e.track != _t || e.step != _s)
					p.chordNotes[kept++] = p.chordNotes[i];
			}
			for(size_t i = kept; i < p.chordNoteCount && i < p.chordNotes.size(); ++i)
				p.chordNotes[i] = 0;
			p.chordNoteCount = static_cast<uint8_t>(kept);
		}

		void step(mmDesk::Desk& _desk)
		{
			auto replies = std::move(m_replies);
			m_replies.clear();
			for(const auto& r : replies)
				_desk.onDeviceSysex(r);
			const double now = nowMs();
			if(m_running && now - m_stepAt >= 125 * g_timeScale)
			{
				m_stepAt = now;
				m_step = m_songMode ? songLocate(++m_songPos).second : (m_step + 1) % 16;
				++m_blocks;
				// wave 7: EXIT held in LIVE RECORDING: the focus track's note on the step that plays goes
				if(m_recording == 2 && m_exitHeld)
					setNote(m_focus, m_step, -1);
			}
			mmDesk::Telemetry t;
			t.valid = true;
			t.blocks = ++m_blocks;
			t.step = m_running ? m_step : -1;
			t.running = m_running;
			t.screen = m_screen;
			t.recvCount = m_recvTaken;
			t.recvActive = m_screen == mmDesk::Screen::GlobalEdit;
			t.tempo = m_tempo;
			t.mutes = m_mutes;
			t.recording = m_recording;
			t.stepCursor = m_recording == 3 ? m_stepCursor : -1;
			t.bankGroup = m_bankGroup;
			t.chainKnown = true;
			t.chain = m_chain;
			t.songRow = m_songMode ? (m_running ? songLocate(m_songPos).first : 0) : -1;
			_desk.onTelemetry(t);
			if(now - m_memoryAt >= 32)
			{
				m_memoryAt = now;
				Bytes region{m_kit, 0, 0, 0, 0};
				const auto raw = ed::mmKitRaw(m_working);
				region.insert(region.end(), raw.begin(), raw.end());
				_desk.onWorkingKit(region);
			}
			_desk.tick();
		}

	private:
		uint8_t m_baseCh = 0;
		void reply(Bytes _m) { m_replies.push_back(std::move(_m)); }
	public:
		// replies waiting: the host steps again at once (a background load is a request and its reply, back to back)
		bool busy() const { return !m_replies.empty(); }
	private:
		// a pattern recalls its kit, but the same kit is not read again: the working kit keeps its edits (the firmware does:
		// mmDeskFirmwareTest machine, "another pattern with the same kit"; MM manual 1-18)
		void recallKit(const uint8_t _k)
		{
			if((_k & 127) != m_kit)
				loadKit(_k);
		}

		void loadKit(const uint8_t _k)
		{
			m_kit = _k & 127;
			m_working = m_kits[m_kit];
		}

		void take(const Bytes& _m)
		{
			if(!isShort(_m, 0x03))
				return;
			const auto cmd = _m[6];
			const auto v = _m[7];
			// dumps: taken on SYSEX RECV only, as the firmware does
			if(cmd == 0x50 || cmd == 0x52 || cmd == 0x67 || cmd == 0x69)
			{
				if(m_screen != mmDesk::Screen::GlobalEdit)
					return;
				++m_recvTaken;
				if(cmd == 0x50) { if(const auto g = ed::decodeMmGlobal(_m)) m_globals[g->position & 7] = *g; }
				else if(cmd == 0x52) { if(const auto k = ed::decodeMmKit(_m)) { m_kits[k->position & 127] = *k; if((k->position & 127) == m_kit) m_working = *k; } }
				else if(cmd == 0x67) { if(const auto p = ed::decodeMmPattern(_m)) m_patterns[p->position & 127] = *p; }
				else if(const auto s = ed::decodeMmSong(_m)) m_songs[s->position % ed::MmSong::g_slots] = *s;
				return;
			}
			switch(cmd)
			{
			case 0x51: reply(ed::encodeMmGlobal(m_globals[v & 7])); return;
			case 0x53: reply(ed::encodeMmKit(m_kits[v & 127])); return;
			case 0x68: reply(ed::encodeMmPattern(m_patterns[v & 127])); return;
			case 0x6a: reply(ed::encodeMmSong(m_songs[v % ed::MmSong::g_slots])); return;
			case 0x56: m_global = v & 7; return;
			case 0x57: m_chain = {}; m_pattern = v & 127; recallKit(m_patterns[m_pattern].kit); return;
			case 0x58: loadKit(v); return;
			case 0x59: { auto k = m_working; k.position = v & 127; m_kits[v & 127] = k; m_kit = v & 127; return; }
			case 0x6c: m_song = v % ed::MmSong::g_slots; return;
			case 0x6d: return;
			case 0x5e:	// a DigiPRO waveform: answered when used (waveforms 1 and 4 here), else nothing (P4)
				if(v == 0 || v == 3)
					reply({0xf0, 0x00, 0x20, 0x3c, 0x03, 0x00, 0x5d, 0x01, 0x01, v, 0, 0, 0, 0, static_cast<uint8_t>(0x10 + v), 0, 0, 0xf7});
				return;
			case 0x5b: if(_m.size() >= 11 && v < 6) m_working.machines[v] = _m[8]; return;
			case 0x61: if(_m.size() >= 10) m_tempo = (v << 7) | _m[8]; return;	// TEMPO, BPM x 24
			case 0x5c:	// the outputs, and an FX machine's input (any other's cleared), as OS 1.32B stores them (elektronData::mmSetKitInput)
				if(_m.size() >= 11 && v < 6)
				{
					ed::mmSetKitOutputs(m_working, v, _m[8]);
					const auto* mach = ed::mmMachine(m_working.machines[v]);
					ed::mmSetKitInput(m_working, v, mach && mach->fx ? std::optional<uint8_t>(_m[9]) : std::nullopt);
				}
				return;
			case 0x55: for(size_t i = 0; i < m_working.name.size(); ++i) m_working.name[i] = 7 + i < _m.size() - 1 ? _m[7 + i] : 0; return;
			case 0x70:
			{
				uint8_t value = 0;
				switch(v)
				{
				case 0x01: value = m_global; break;
				case 0x02: value = m_kit; break;
				case 0x04: value = m_pattern; break;
				case 0x08: value = m_song; break;
				case 0x10: value = m_songMode ? 1 : 0; break;
				case 0x20: value = m_poly ? 1 : 0; break;
				case 0x22: value = static_cast<uint8_t>(std::max(0, m_focus)); break;	// the track in focus (0.6 wave 9)
				default: break;
				}
				reply({0xf0, 0x00, 0x20, 0x3c, 0x03, 0x00, 0x72, v, static_cast<uint8_t>(value & 0x7f), 0xf7});
				return;
			}
			case 0x71:
				if(_m.size() < 10)
					return;
				switch(v)
				{
				case 0x01: m_global = _m[8] & 7; break;
				case 0x02: loadKit(_m[8]); break;
				case 0x04: m_pattern = _m[8] & 127; recallKit(m_patterns[m_pattern].kit); break;
				case 0x08: m_song = _m[8] % ed::MmSong::g_slots; break;
				case 0x10: m_songMode = _m[8] != 0; break;
				case 0x20: m_poly = _m[8] != 0; break;
				default: break;
				}
				return;
			default: return;
			}
		}

		// the row and the step in it that _pos steps into the song play (each row's length times its plays)
		std::pair<int, int> songLocate(const int _pos) const
		{
			const auto& song = m_songs[m_song];
			int at = 0;
			for(size_t i = 0; i < song.rows.size(); ++i)
			{
				const auto& b = song.rows[i].bytes;
				if(b[ed::mmSongRow::g_pattern] >= ed::MmSong::g_loop)
					break;
				const int len = std::max<int>(1, b[ed::mmSongRow::g_length]), all = len * (b[ed::mmSongRow::g_repeats] + 1);
				if(_pos < at + all)
					return {static_cast<int>(i), (_pos - at) % len};
				at += all;
			}
			return {0, 0};
		}

		// wave 2: with TRANSPORT IN = ACCEPT, MIDI Stop holds the step, Continue goes on, a song position (stopped) sets where;
		// in SONG mode the row that holds it starts at its first step (P1, internal clock). IGNORE: none of them does anything.
		void realtime(const Bytes& _m)
		{
			if(_m.empty() || !m_globals[m_global & 7].transportIn)
				return;
			if(_m[0] == 0xfc && m_running)
			{
				m_running = false;
				m_paused = true;
			}
			else if(_m[0] == 0xfb && !m_running)
			{
				m_running = true;
				m_paused = false;
				m_stepAt = nowMs();
			}
			else if(_m[0] == 0xf2 && _m.size() == 3 && !m_running)
			{
				const int pos = _m[1] | (_m[2] << 7);
				if(m_songMode)
				{
					const auto [row, inRow] = songLocate(pos);
					m_songPos = pos - inRow;
					m_step = 0;
					(void)row;
				}
				else
					m_step = pos % 16;
				m_paused = true;
			}
		}

		bool press(const std::vector<mmDesk::Key>& _keys)
		{
			if(mmDesk::RecvSession::isEnterMacro(_keys))
			{
				m_screen = mmDesk::Screen::GlobalEdit;
				return true;
			}
			if(_keys == mmDesk::RecvSession::exitKeys())
			{
				m_screen = mmDesk::Screen::Main;
				return true;
			}
			// the MUTE window: TRIG 9-14 mute and unmute the MIDI tracks
			if(!_keys.empty() && _keys[0] == mmDesk::Key::MuteWindow)
			{
				for(const auto k : _keys)
					if(k >= mmDesk::Key::Trig9 && k <= mmDesk::Key::Trig14)
						m_mutes ^= 1 << (6 + static_cast<int>(k) - static_cast<int>(mmDesk::Key::Trig9));
				return true;
			}
			for(const auto k : _keys)
			{
				using K = mmDesk::Key;
				// wave 7: the recording modes as the machine's keys move them (mmEditorProbeFirmwareTest recording), the focus,
				// EXIT held, STEP RECORDING's keys
				if(k >= K::Track1 && k <= K::Track6)
					m_focus = static_cast<int>(k) - static_cast<int>(K::Track1);
				else if(k == K::ExitDown || k == K::ExitUp)
					m_exitHeld = k == K::ExitDown;
				else if(k == K::Record)
					m_recording = m_recording == 0 ? 1 : m_recording == 2 ? 1 : 0;
				else if(k == K::StepRecord)
				{
					m_recording = 3;
					m_stepCursor = 0;
					m_running = m_paused = false;
				}
				else if(m_recording == 3 && (k == K::Left || k == K::Right || k == K::Enter))
				{
					const int len = std::max<int>(1, m_patterns[m_pattern].length);
					if(k == K::Enter)
						setNote(m_focus, m_stepCursor, -1);
					m_stepCursor = (m_stepCursor + (k == K::Left ? len - 1 : 1)) % len;
				}
				if(k == K::LiveRecord)
					m_recording = 2;
				else if(k == K::Stop && m_recording == 2)
					m_recording = 0;
				if(k == mmDesk::Key::BankGroup)
					m_bankGroup = 1 - m_bankGroup;
				// PLAY: starts; while playing it pauses, while paused it goes on (the machine's own pause)
				if(k == mmDesk::Key::Play && m_running)
				{
					m_running = false;
					m_paused = true;
				}
				else if(k == mmDesk::Key::Play && m_paused)
				{
					m_running = true;
					m_paused = false;
					m_stepAt = nowMs();
				}
				else if(k == mmDesk::Key::Play || k == mmDesk::Key::LiveRecord)
				{
					m_running = true;
					m_paused = false;
					m_step = m_songPos = 0;
					m_stepAt = nowMs();
				}
				else if(k == mmDesk::Key::Stop)
				{
					m_running = m_paused = false;
					m_step = m_songPos = 0;
				}
				else if(k == mmDesk::Key::Exit)
					m_screen = mmDesk::Screen::Main;
			}
			return true;
		}

		std::array<ed::MmPattern, ed::MmPattern::g_slots> m_patterns;
		std::array<ed::MmKit, ed::MmKit::g_slots> m_kits;
		std::array<ed::MmSong, ed::MmSong::g_slots> m_songs;
		std::array<ed::MmGlobal, ed::MmGlobal::g_slots> m_globals;
		ed::MmKit m_working;
		mmDesk::Chain m_chain;
		uint8_t m_pattern = 0, m_kit = 0, m_song = 0, m_global = 0;
		bool m_songMode = false, m_running = false, m_poly = false, m_paused = false;
		int m_mutes = 0, m_step = 0, m_bankGroup = 0, m_tempo = 120 * 24, m_songPos = 0;
		int m_recording = 0, m_stepCursor = 0, m_focus = 0;	// 0 off, 1 grid, 2 live, 3 step; the cursor; the track in focus
		bool m_exitHeld = false;
		uint64_t m_blocks = 0;
		uint32_t m_recvTaken = 0;
		mmDesk::Screen m_screen = mmDesk::Screen::Main;
		double m_stepAt = 0, m_memoryAt = -1000;
		std::vector<Bytes> m_replies;
	};

	// ------------------------------------------------------------------------------------------------- the stub host
	// The plug-in's session in small: the desk first, then deskHost's table (answered ok, nothing done), and the
	// plug-in's own periodic messages (the CPU meter, the output level) with fixed values.
	std::vector<Value> g_out;
	void toPage(const Value& _m) { g_out.push_back(_m); }

	void flushOut()
	{
		if(g_out.empty())
			return;
		Value batch = Value::array();
		for(auto& m : g_out)
			batch.push(std::move(m));
		g_out.clear();
		const auto text = ed::json::write(batch);
		std::fwrite(text.data(), 1, text.size(), stdout);
		std::fputc('\n', stdout);
		std::fflush(stdout);
	}

	void reply(const Value& _message, const bool _ok, const std::string& _note)
	{
		toPage(deskCore::resultMessage(_message, _ok ? std::vector<std::string>{} : std::vector<std::string>{_note}, _note));
	}

	// The .syx Import SysEx… opens in the page tier: GEARMULATOR_MDMM_SYX_FILE, else two kits named IMPORT 1 and IMPORT 2
	// in K01 and K02 and two patterns (A01, A02) with trigs on every step of track 1, from the committed test dumps.
	Bytes stubSyx(const bool _mm)
	{
		if(const char* f = std::getenv("GEARMULATOR_MDMM_SYX_FILE"); f && *f)
		{
			std::ifstream in(f, std::ios::binary);
			if(in)
				return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
		}
		Bytes out;
		const auto add = [&out](const Bytes& _m) { out.insert(out.end(), _m.begin(), _m.end()); };
		for(uint8_t i = 0; i < 2; ++i)
		{
			if(_mm)
			{
				auto k = *ed::decodeMmKit(load(i ? "mm/programmed-kit-001.syx" : "mm/programmed-kit-000.syx"));
				k.position = i;
				setName(k.name, "IMPORT " + std::to_string(i + 1));
				add(ed::encodeMmKit(k));
				auto p = *ed::decodeMmPattern(load("mm/programmed-pattern-001.syx"));
				p.position = i;
				p.kit = i;
				add(ed::encodeMmPattern(p));
			}
			else
			{
				auto k = *ed::decodeMdKit(load(i ? "programmed_kit_1.syx" : "programmed_kit_0.syx"));
				k.position = i;
				setName(k.name, "IMPORT " + std::to_string(i + 1));
				add(ed::encodeMdKit(k));
				auto p = *ed::decodeMdPattern(load("programmed_pattern_1.syx"));
				p.position = i;
				p.kit = i;
				p.length = 16;
				p.trigs.fill(0);
				p.trigs[0] = 0xffff;
				add(ed::encodeMdPattern(p));
			}
		}
		return out;
	}

	template<typename DeskT> void hostMessage(DeskT& _desk, mdJucePlugin::SyxWork<DeskT>& _syx, const Value& _message, double& _gainDb)
	{
		if(_desk.onPageMessage(_message))
			return;
		const auto op = deskCore::opOf(_message);
		const auto* row = deskHost::commands().find(op);
		if(!row)
		{
			reply(_message, false, "unknown command " + op);
			return;
		}
		if(const auto errors = deskHost::Table::check(*row, _message); !errors.empty())
		{
			reply(_message, false, errors.front());
			return;
		}
		// wave 6: the session's SysEx work, as the plug-in runs it
		if(_syx.handle(_desk, _message, reply, toPage))
			return;
		constexpr bool mm = std::is_same_v<DeskT, mmDesk::Desk>;
		if(op == "chooseSyx")
		{
			reply(_message, true, "");
			const char* f = std::getenv("GEARMULATOR_MDMM_SYX_FILE");
			toPage(_syx.open(_desk, stubSyx(mm), f && *f ? std::string(f).substr(std::string(f).find_last_of('/') + 1) : std::string("page-tier.syx")));
			return;
		}
		if(op == "syxExport")
		{
			reply(_message, true, "");
			using Work = mdJucePlugin::SyxWork<DeskT>;
			const auto r = Work::exportRequest(_message);
			const auto write = [all = r.all](const Bytes& _bytes, const std::string& _words)
			{
				const auto path = std::string(std::getenv("TMPDIR") ? std::getenv("TMPDIR") : "/tmp") + "/deskStubHost-export.syx";
				std::ofstream o(path, std::ios::binary);
				o.write(reinterpret_cast<const char*>(_bytes.data()), static_cast<std::streamsize>(_bytes.size()));
				Value m = Value::object();
				m.set("type", "syxExport");
				m.set("ok", !_bytes.empty());
				m.set("running", false);
				m.set("text", _bytes.empty() ? std::string("Nothing to write: the editor holds none of what was chosen.")
					: "Wrote page-tier.syx (" + std::to_string(_bytes.size()) + " bytes): " + (all ? "every document the editor holds (" + _words + ")." : _words + "."));
				toPage(m);
			};
			if(r.waves)
				_syx.exportStart(_desk, r, write);
			else
				write(Work::exportBytes(_desk, r), Work::exportWords(_desk, r));
			return;
		}
		if(op == "machineReset")
		{
			reply(_message, false, "The factory reset needs the plug-in (a second machine from the ROM): not in the page tier.");
			return;
		}
		if(op == "outputGain")
			if(const auto* db = _message.find("db"); db && db->isNumber())
				_gainDb = db->asNumber();
		reply(_message, true, "");
	}

	void periodic(const double _now, double& _cpuAt, double& _levelAt, const double _gainDb)
	{
		if(_now - _cpuAt >= 1000 * g_timeScale)
		{
			_cpuAt = _now;
			Value m = Value::object();
			m.set("type", "cpuLoad");
			m.set("state", "running");
			m.set("load", 0.12);
			m.set("worst", 0.2);
			m.set("realtime", 1.0);
			m.set("sampleRate", 44100.0);
			m.set("blockSize", 512);
			m.set("plugin", false);
			m.set("speedUps", "on");
			m.set("leversOff", Value::array());
			m.set("exactEssi", false);
			Value saved = Value::object();
			saved.set("legacyEmulation", false);
			saved.set("leversOff", Value::array());
			m.set("saved", saved);
			m.set("translated", false);
			m.set("arch", "stub");
			toPage(m);
		}
		if(_now - _levelAt >= 250 * g_timeScale)
		{
			_levelAt = _now;
			Value m = Value::object();
			m.set("type", "outputLevel");
			m.set("peakL", 0.0);
			m.set("peakR", 0.0);
			m.set("clip", false);
			m.set("gainDb", _gainDb);
			toPage(m);
		}
	}

	template<typename DeskT, typename Fake> int serve(DeskT& _desk, Fake& _fake)
	{
		double cpuAt = -1000, levelAt = -1000, gainDb = 0;
		mdJucePlugin::SyxWork<DeskT> syx;
		_desk.setSysexTap([&syx](const Bytes& _m) { syx.onMachineSysex(_m); });
		std::string pending;
		bool open = true;
		while(open)
		{
			pollfd fd{STDIN_FILENO, POLLIN, 0};
			if(poll(&fd, 1, _fake.busy() ? 0 : 8) > 0 && (fd.revents & (POLLIN | POLLHUP)))
			{
				char buf[65536];
				const auto n = read(STDIN_FILENO, buf, sizeof(buf));
				if(n <= 0)
					open = false;
				else
					pending.append(buf, static_cast<size_t>(n));
				for(size_t nl; (nl = pending.find('\n')) != std::string::npos;)
				{
					const auto line = pending.substr(0, nl);
					pending.erase(0, nl + 1);
					if(line.empty())
						continue;
					const auto batch = ed::json::parse(line);
					if(!batch || !batch->isArray())
					{
						std::fprintf(stderr, "deskStubHost: not a batch: %.200s\n", line.c_str());
						continue;
					}
					for(const auto& m : batch->asArray())
						hostMessage(_desk, syx, m, gainDb);
				}
			}
			_fake.step(_desk);
			if(syx.running() && _desk.lifecycle() == deskCore::Lifecycle::Ready)
			{
				syx.step(_desk, nowMs(), false, toPage);
				_desk.flush();
			}
			if(_desk.pageSeen())
				periodic(nowMs(), cpuAt, levelAt, gainDb);
			flushOut();
		}
		return 0;
	}

	template<typename Profile> Profile fast(Profile _p, const bool _real)
	{
		if(!_real)
			_p.push.minIntervalMs = _p.push.quietMs = 20;
		return _p;
	}

	std::vector<deskCore::EngineChoice> engines(const std::string& _emu, const std::string& _hw)
	{
		return {{"emu", _emu, true, {}}, {"hw", _hw, false, "the page tier has no MIDI ports"}};
	}
}

int main(const int _argc, char** _argv)
{
	const std::string model = _argc > 1 ? _argv[1] : "";
	const bool real = _argc > 2 && std::strcmp(_argv[2], "--real-timing") == 0;
	if(real)
		g_timeScale = 1;
	if(model == "md")
	{
		FakeMd fake;
		mdDesk::Desk::Port port;
		port.device = fake.port();
		port.toPage = toPage;
		port.saveSetup = [](const Value&) {};
		port.ready = [] { Value l = Value::object(); l.set("type", "learn"); Value d = Value::object(); d.set("enabled", false); d.set("mappings", Value::array()); d.set("learning", Value()); l.set("doc", d); toPage(l); };
		mdDesk::Desk desk(port, fast(mdDesk::emulatorProfile(), real));
		desk.setEngines(engines(mdDesk::emulatorProfile().label, mdDesk::wireProfile().label));
		desk.loadSetup(mdDesk::deskSetupToJson({}));
		desk.setProbe(deskCore::LifeFacts::Probe::Running);
		return serve(desk, fake);
	}
	if(model == "mm")
	{
		FakeMm fake;
		mmDesk::Desk::Port port;
		port.device = fake.port();
		port.toPage = toPage;
		port.saveSetup = [](const Value&) {};
		port.ready = [] { Value l = Value::object(); l.set("type", "learn"); Value d = Value::object(); d.set("enabled", false); d.set("mappings", Value::array()); d.set("learning", Value()); l.set("doc", d); toPage(l); };
		mmDesk::Desk desk(port, fast(mmDesk::emulatorProfile(), real));
		desk.setEngines(engines(mmDesk::emulatorProfile().label, mmDesk::wireProfile().label));
		desk.setProbe(deskCore::LifeFacts::Probe::Running);
		return serve(desk, fake);
	}
	std::fprintf(stderr, "usage: deskStubHost md|mm [--real-timing]\n");
	return 2;
}
