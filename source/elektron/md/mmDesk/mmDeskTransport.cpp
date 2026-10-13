// Wave 2, the transport beyond PLAY and STOP (doc/modern-ux/DESIGN-machine-menus.md §2, PROBES-manual-gaps.md P1 and
// P5 MM): pause and resume, play from a song row, panic, the tempo nudge. Over MIDI the Monomachine takes Stop, Continue
// and the song position only with GLOBAL › CONTROL IN › TRANSPORT = ACCEPT (factory IGNORE): the editor asks to set it,
// as before PLAY over HW MIDI (askPlay).
#include "mmDeskMachineParts.h"

#include "deskWire/deskWire.h"

#include "elektronData/mmCommands.h"
#include "elektronData/mmGlobal.h"

#include <cmath>

namespace mmDesk
{
	using namespace parts;

	namespace
	{
		std::string rowName(const size_t _row)
		{
			char b[8];
			std::snprintf(b, sizeof b, "%03zu", _row + 1);
			return b;
		}
	}

	SongPosition songPositionOf(const ed::MmSong& _song, const size_t _row)
	{
		const auto kind = [&](const size_t _i) -> int
		{
			const auto p = _song.rows[_i].pattern();
			if(p == ed::MmSong::g_end)
				return 2;
			return p == ed::MmSong::g_loop ? 1 : 0;
		};
		if(_row >= _song.rows.size() || kind(_row) != 0)
			return {0, "Row " + rowName(_row) + " plays no pattern: pick a pattern row."};
		int steps = 0;
		for(size_t i = 0; i < _row; ++i)
		{
			const auto& b = _song.rows[i].bytes;
			const int k = kind(i);
			if(k == 2)
				return {0, "Row " + rowName(i) + " ends the song before row " + rowName(_row) + "."};
			if(k == 1)
				return {0, "Row " + rowName(i) + " is a LOOP, JUMP or HALT before row " + rowName(_row) + ": the machine counts its song "
					"position through the rows as they stand, so it cannot start there. Start the song and let it play to the row."};
			steps += b[ed::mmSongRow::g_length] * (b[ed::mmSongRow::g_repeats] + 1);
		}
		if(steps > deskWire::midi::g_maxSongPosition)
			return {0, "Row " + rowName(_row) + " is too far into the song for the MIDI song position (16383 steps)."};
		return {steps, {}};
	}

	// The panel's PLAY pauses and goes on (the machine's own pause); over MIDI it is Stop and Continue.
	bool MmMachine::panelTransport() const
	{
		return m_port.pressKeys && m_profile.panel;
	}

	// What needs MIDI Stop, Continue or the song position asks for TRANSPORT ACCEPT while the active global says IGNORE.
	Outcome MmMachine::askTransport(const Documents& _view, const std::string& _what)
	{
		const auto* g = activeGlobal(_view, m_curGlobal);
		if(!g || g->transportIn != 0 || m_pushes.busy({Kind::Global, g->position}))
			return ok();
		return ask("transportIgnore", _what + " This Monomachine ignores them: <b>GLOBAL › CONTROL IN › TRANSPORT</b> is <b>IGNORE</b> in GLOBAL "
			+ std::to_string(g->position + 1) + ". Set it to ACCEPT? It goes out as a global dump" + (manualDumps()
			? ", so it waits for SYSEX RECV (SEND in the pattern field)." : "."), "Set TRANSPORT to ACCEPT");
	}

	Outcome MmMachine::askPause(const Value&, const Documents& _view)
	{
		return panelTransport() ? ok() : askTransport(_view, "Over MIDI a pause is <b>MIDI Stop</b> and <b>Continue</b>.");
	}

	Outcome MmMachine::askPlayFrom(const Value&, const Documents& _view)
	{
		return askTransport(_view, "Playing from a song row is the <b>MIDI song position</b> and <b>Continue</b>.");
	}

	// Confirmed (force) while TRANSPORT is IGNORE: ACCEPT in the active global, the machine's own setting (as followHost: no
	// undo step). True when that dump went out instead of the command.
	bool MmMachine::acceptTransport(const Value& _m, const Documents& _view, Outcome& _out)
	{
		const auto* g = activeGlobal(_view, m_curGlobal);
		if(!g || g->transportIn != 0 || !flag(_m, "force"))
			return false;
		const Ref ref{Kind::Global, g->position};
		if(m_pushes.busy(ref))
			return false;
		auto accept = *g;
		accept.transportIn = 1;
		pushDump(ref, ed::encodeMmGlobal(accept));
		// the command itself follows once the machine applies it (pumpAfterAccept)
		Value again = _m;
		again.put("force", false);
		m_afterAccept = again;
		m_afterAcceptMs = now();
		_out = ok(manualDumps() ? "TRANSPORT ACCEPT waits for SYSEX RECV (SEND in the pattern field); then it goes."
			: "TRANSPORT is set to ACCEPT; it goes as soon as the machine takes it.");
		return true;
	}

	// A command that waited for TRANSPORT ACCEPT: once the active global holds it and is applied (made active, the panel back
	// from SYSEX RECV), at most g_afterAcceptMs after the question.
	void MmMachine::pumpAfterAccept(const double _now, const Documents& _view)
	{
		if(!m_afterAccept)
			return;
		if(_now - m_afterAcceptMs > g_afterAcceptMs)
		{
			m_afterAccept.reset();
			return;
		}
		const auto* g = activeGlobal(_view, m_curGlobal);
		if(!g || g->transportIn != 1 || m_activateGlobal >= 0 || m_chooseGlobal >= 0 || m_pushes.busy({Kind::Global, g->position})
			|| (!m_profile.wire && m_recv.state() != RecvSession::State::Idle))
			return;
		if(m_reactivateGlobal && activeSlot() >= 0)
		{
			sendActiveGlobal(activeSlot() & 7);	// HW MIDI: applied when made active again (P7)
			m_reactivateGlobal = false;
		}
		const auto c = *m_afterAccept;
		m_afterAccept.reset();
		command(c, _view);
	}

	Outcome MmMachine::cmdPause(const Value& _m, const Documents& _view)
	{
		if(m_profile.telemetry && !m_playing)
			return refuse("Nothing plays: PLAY first.");
		if(panelTransport())
		{
			// B-135: while the panel takes an edit the pause waits for it, as PLAY does
			if(!pressWaiting(TransportWait::Pause))
			{
				waitTransport(TransportWait::Pause);
				return ok(g_transportWaits);
			}
			m_pendingTransport.reset();
			return ok("Paused. PLAY goes on from this step; STOP ends it.");
		}
		Outcome o;
		if(acceptTransport(_m, _view, o))
			return o;
		if(!m_port.sendMidi)
			return refuse("This engine has no transport.");
		m_port.sendMidi(deskWire::stopMessage());
		return ok("Paused (MIDI Stop). PLAY goes on from this step (MIDI Continue); STOP ends it.");
	}

	// P1b: after the panel's PLAY paused it, MIDI Continue goes on from the step in pattern and song mode; the panel's PLAY
	// again goes on in pattern mode but starts the row again in song mode. So Continue where the global takes it.
	Outcome MmMachine::cmdResume(const Value& _m, const Documents& _view)
	{
		const auto* g = activeGlobal(_view, m_curGlobal);
		if(panelTransport() && !(g && g->transportIn == 1 && m_port.sendMidi))
		{
			// B-135 (the 0.6 e2e run, mm-top-pause): ▶ to go on while the panel took an edit was refused ("The panel is
			// busy"), the machine stayed paused: it waits for the panel, as PLAY does
			if(!pressWaiting(TransportWait::Resume))
			{
				waitTransport(TransportWait::Resume);
				return ok(g_transportWaits);
			}
			m_pendingTransport.reset();
			return ok();
		}
		Outcome o;
		if(acceptTransport(_m, _view, o))
			return o;
		if(!m_port.sendMidi)
			return refuse("This engine has no transport.");
		m_port.sendMidi(deskWire::continueMessage());
		m_steps = resumedByEditor(m_steps, now());
		return ok();
	}

	// P1 (MM): with TRANSPORT ACCEPT, in SONG mode, the song position and Continue start the row that holds the pointer at
	// its first step. Stopped first, then SONG mode when it is in PATTERN mode, each when the machine shows it.
	Outcome MmMachine::cmdPlayFrom(const Value& _m, const Documents& _view)
	{
		if(!m_port.sendMidi)
			return refuse(g_noPlayFrom);
		Outcome o;
		if(acceptTransport(_m, _view, o))
			return o;
		const auto it = m_curSong < 0 ? _view.songs.end() : _view.songs.find(static_cast<uint8_t>(m_curSong));
		if(it == _view.songs.end())
			return refuse("The current song is not known yet.");
		const auto row = static_cast<size_t>(std::max(0, num(_m, "i", 0)));
		const auto pos = songPositionOf(it->second, row);
		if(!pos.refused.empty())
			return refuse(pos.refused);
		std::vector<deskCore::SeqStep<Act>> steps;
		if(m_playing)
			steps.push_back({Act::MidiStop, 0, deskCore::Wait::Stopped, 0, 1000});
		if(m_songMode != 1)
			steps.push_back({Act::SongMode, 1, deskCore::Wait::SongModeIs, 1, 2000});
		steps.push_back({Act::FromPosition, pos.sixteenths});
		m_sequence.start(std::move(steps));
		pumpSequence(now());
		return ok("Plays song " + std::to_string(m_curSong + 1) + " from row " + rowName(row) + ".");
	}

	// P5 MM (measured): CC 123 on the track channels lets the held notes go, as their note offs would (their release
	// rings); CC 120 does nothing. STOP (the panel's, twice; MIDI Stop over a wire) stops the sequencer.
	Outcome MmMachine::cmdPanic(const Value&, const Documents& _view)
	{
		const auto* g = activeGlobal(_view, m_curGlobal);
		if(!m_port.sendMidi)
			return refuse(g_noPanic);
		if(g)
			for(uint8_t t = 0; t < 6; ++t)
				if(const auto ch = ed::mmTrackChannel(*g, t))
					m_port.sendMidi(deskWire::controlChange(*ch, deskWire::midi::g_allNotesOff, 0));
		if(panelTransport())
		{
			// B-135 (mm-top-panic): the two STOPs were dropped while the panel took an edit, the machine played on: they
			// wait for it, as STOP does
			if(pressWaiting(TransportWait::Panic))
				m_pendingTransport.reset();
			else
				waitTransport(TransportWait::Panic);
		}
		else
			m_port.sendMidi(deskWire::stopMessage());
		return ok("Every note off (CC 123 on each track's channel) and STOP.");
	}

	// TEMPO, LEFT / RIGHT held: 10 % off while held, back at the release (_pct 0).
	Outcome MmMachine::cmdNudge(const Value& _m, const Documents&)
	{
		const int pct = num(_m, "pct", 0);
		const auto send = [&](const int _tempo)
		{
			m_stream.sendLatest(0x7e000000, ed::mmSetTempo(_tempo / 24.0), false, clock());
			m_expectTempo = deskCore::FieldExpectation<int>::sent(_tempo, clock());
		};
		if(pct == 0)
		{
			if(m_nudgeFrom)
				send(*m_nudgeFrom);
			m_nudgeFrom.reset();
			return ok();
		}
		if(!m_nudgeFrom)
		{
			const auto shown = m_expectTempo.shown(tempoInMemory(), clock(), m_profile.settleMs);
			if(!shown)
				return refuse("The tempo is not known yet.");
			m_nudgeFrom = *shown;
		}
		send(std::clamp(static_cast<int>(std::lround(*m_nudgeFrom * (100.0 + pct) / 100.0)), 30 * 24, 300 * 24));
		return ok();
	}

	void MmMachine::runTransportAct(const Act _act, const int _arg)
	{
		switch(_act)
		{
		case Act::MidiStop:
			if(m_port.sendMidi)
				m_port.sendMidi(deskWire::stopMessage());
			break;
		case Act::SongMode:
			m_port.sendSysex(ed::mmSetStatus(ed::MmStatus::SongMode, _arg ? 1 : 0));
			m_port.sendSysex(ed::mmStatusRequest(ed::MmStatus::SongMode));
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
