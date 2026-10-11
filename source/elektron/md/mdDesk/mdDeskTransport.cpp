// Wave 2, the transport beyond PLAY and STOP (doc/modern-ux/DESIGN-machine-menus.md §2, PROBES-manual-gaps.md P1 and P5):
// pause and resume, play from a song row, panic, the tempo nudge. MdMachine's commands for them, and the song position.
#include "mdDeskMachine.h"
#include "mdDeskTransport.h"

#include "deskWire/deskWire.h"

#include "elektronData/mdCommands.h"
#include "elektronData/mdGlobal.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace mdDesk
{
	namespace ed = elektronData;
	using Value = ed::json::Value;
	using deskCore::Outcome;

	namespace
	{
		Outcome ok(std::string _note = {}) { return {{}, std::move(_note), {}}; }
		Outcome refuse(std::string _error) { return {{std::move(_error)}, {}, {}}; }

		std::string rowName(const size_t _row)
		{
			char b[8];
			std::snprintf(b, sizeof b, "%03zu", _row + 1);
			return b;
		}

		constexpr const char* g_ctrlInOff = "CTRL IN is off in GLOBAL › MIDI: the Machinedrum ignores MIDI Stop, Continue and the song "
			"position. Turn CTRL IN on.";
	}

	SongPosition songPositionOf(const ed::MdSong& _song, const size_t _row)
	{
		if(_row >= _song.rows.size() || ed::songRowKind(_song.rows[_row], _row) != ed::MdSongRowKind::Pattern)
			return {0, "Row " + rowName(_row) + " plays no pattern: pick a pattern row."};
		int steps = 0;
		for(size_t i = 0; i < _row; ++i)
		{
			const auto& r = _song.rows[i];
			switch(ed::songRowKind(r, i))
			{
			case ed::MdSongRowKind::Pattern:
				steps += std::max(0, static_cast<int>(r.end) - static_cast<int>(r.start)) * (r.repeats + 1);
				break;
			case ed::MdSongRowKind::Loop:
			case ed::MdSongRowKind::Jump:
				return {0, "Row " + rowName(i) + " is a " + std::string(ed::songRowKind(r, i) == ed::MdSongRowKind::Loop ? "LOOP" : "JUMP")
					+ " before row " + rowName(_row) + ": the machine counts its song position through the rows as they stand, so it "
					"cannot start there. Start the song and let it play to the row."};
			default:
				return {0, "Row " + rowName(i) + " ends the song before row " + rowName(_row) + "."};
			}
		}
		if(steps > deskWire::midi::g_maxSongPosition)
			return {0, "Row " + rowName(_row) + " is too far into the song for the MIDI song position (16383 steps)."};
		return {steps, {}};
	}

	// The MD takes MIDI Stop, Continue and the song position only with CTRL IN on (P1).
	bool MdMachine::ctrlIn(const Documents& _view) const
	{
		return !_view.global || !(_view.global->syncFlags & ed::mdGlobalBits::g_ctrlInOff);
	}

	// P1: MIDI Stop holds the step and MIDI Continue goes on from it, on the emulator and over a wire alike (CTRL IN on). The
	// panel's PLAY is no pause on the emulated OS 1.63: PLAY after it starts the pattern again (measured, mdDeskFirmwareTest
	// transport).
	Outcome MdMachine::cmdPause(const Value&, const Documents& _view)
	{
		if(m_telemetry.valid && !m_telemetry.playing)
			return refuse("Nothing plays: PLAY first.");
		if(!m_port.sendMidi)
			return refuse("This engine has no transport.");
		if(!ctrlIn(_view))
			return refuse(g_ctrlInOff);
		m_port.sendMidi(deskWire::stopMessage());
		return ok("Paused. PLAY goes on from this step; STOP ends it.");
	}

	Outcome MdMachine::cmdResume(const Value&, const Documents& _view)
	{
		if(!m_port.sendMidi)
			return refuse("This engine has no transport.");
		if(!ctrlIn(_view))
			return refuse(g_ctrlInOff);
		m_port.sendMidi(deskWire::continueMessage());
		return ok();
	}

	// P5: no MIDI message silences the Machinedrum's voices; its own STOP pressed twice does (playing or stopped).
	Outcome MdMachine::cmdPanic(const Value&, const Documents&)
	{
		if(!panelKeys())
			return refuse(g_noPanic);
		if(!pressKey("stop") || !pressKey("stop"))
			return refuse("The panel did not take STOP.");
		return ok("Every voice off: STOP twice.");
	}

	// P1: in SONG mode a Song Position Pointer (the steps of the rows before it) and Continue play the song from the row,
	// on the emulator and over a wire alike. Stopped first (MIDI Stop: a song position is taken while stopped), then SONG
	// mode when the machine is in PATTERN mode, each when the machine shows it (a sequence, not fixed delays).
	Outcome MdMachine::cmdPlayFrom(const Value& _m, const Documents& _view)
	{
		if(!m_port.sendMidi)
			return refuse(g_noPlayFrom);
		if(!ctrlIn(_view))
			return refuse(g_ctrlInOff);
		const auto cur = m_session.state().song;
		const auto it = cur ? _view.songs.find(*cur) : _view.songs.end();
		if(it == _view.songs.end())
			return refuse("The current song is not known yet.");
		const auto* i = _m.find("i");
		const auto row = static_cast<size_t>(i && i->isNumber() ? i->asNumber() : 0);
		const auto pos = songPositionOf(it->second, row);
		if(!pos.refused.empty())
			return refuse(pos.refused);
		std::vector<deskCore::SeqStep<Act>> steps;
		if(m_telemetry.playing)
			steps.push_back({Act::MidiStop, 0, deskCore::Wait::Stopped, 0, 1000});
		if(m_session.state().songMode != true)
			steps.push_back({Act::SongMode, 1, deskCore::Wait::SongModeIs, 1, 2000});
		steps.push_back({Act::FromPosition, pos.sixteenths});
		runSequence(std::move(steps));
		return ok("Plays song " + std::to_string(*cur + 1) + " from row " + rowName(row) + ".");
	}

	// The machine's TEMPO menu, LEFT / RIGHT held: 10 % slower or faster while held, back at the release; nothing stored
	// (the global document keeps its tempo, no undo step). _pct 0 is the release.
	Outcome MdMachine::cmdNudge(const Value& _m, const Documents& _view)
	{
		if(!canSendSysex())
			return refuse("This engine cannot send SysEx to the machine.");
		if(!_view.global)
			return refuse("The tempo is not known yet.");
		const auto* p = _m.find("pct");
		const int pct = p && p->isNumber() ? static_cast<int>(p->asNumber()) : 0;
		if(pct == 0)
		{
			if(m_nudgeFrom)
				sendSysex(ed::mdSetTempo(*m_nudgeFrom));
			m_nudgeFrom.reset();
			// a read of the active global while the nudge held shows its tempo: read it again
			if(const auto g = m_session.state().globalSlot)
				load({DocKind::Global, *g}, true);
			return ok();
		}
		if(!m_nudgeFrom)
			m_nudgeFrom = _view.global->tempo;
		const auto t = std::clamp(static_cast<int>(std::lround(*m_nudgeFrom * (100.0 + pct) / 100.0)), 30 * 24, 300 * 24);
		sendSysex(ed::mdSetTempo(static_cast<uint16_t>(t)));
		return ok();
	}

	void MdMachine::runTransportAct(const Act _act, const int _arg)
	{
		switch(_act)
		{
		case Act::MidiStop:
			if(m_port.sendMidi)
				m_port.sendMidi(deskWire::stopMessage());
			break;
		case Act::SongMode:
			sendSysex(ed::mdSetStatus(ed::MdStatus::SequencerMode, _arg ? 1 : 0));
			sendSysex(ed::mdStatusRequest(ed::MdStatus::SequencerMode));
			break;
		case Act::FromPosition:
			if(const auto spp = deskWire::songPosition(_arg); spp && m_port.sendMidi)
			{
				m_port.sendMidi(*spp);
				m_port.sendMidi(deskWire::continueMessage());
			}
			break;
		default:
			break;
		}
	}
}
