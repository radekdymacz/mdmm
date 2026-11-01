// MmMachine: GRID and LIVE RECORDING (MM-P4): the keys from the mode the machine is in, and the current
// pattern read back while it records (watchRecord, mmDeskWatch.h).
#include "mmDeskMachineParts.h"

namespace mmDesk
{
	using namespace parts;

	// MM-P4: GRID RECORDING (RECORD) and LIVE RECORDING (RECORD + PLAY), as the machine's keys from the
	// mode it is in (RAM). RECORD from LIVE goes to GRID (measured), so off from live is RECORD twice.
	// 0.6 wave 7: STEP RECORDING (STOP held + RECORD); RECORD leaves it (measured). It writes the track in focus
	// only (a note on another track's channel writes nothing, measured): t presses TRACK t first, also while in it.
	// Review 1 (Radek, 2026-10-12, B-092): RECORD waits like PLAY. Refused while the panel takes a dump or leaves SYSEX
	// RECV, it is pressed as soon as the panel is free (pumpRecord), given up after g_transportWaitMs; RECORD again while
	// it waits cancels it.
	Outcome MmMachine::cmdRecord(const Value& _m, const Documents&)
	{
		if(m_pendingRecord)
		{
			m_pendingRecord.reset();
			return ok("RECORD cancelled: it was waiting for the panel.");
		}
		return record(_m, true);
	}

	void MmMachine::pumpRecord(const double _now)
	{
		if(!m_pendingRecord)
			return;
		if(_now - m_pendingRecordMs > g_transportWaitMs)
		{
			m_pendingRecord.reset();
			return;
		}
		const auto m = *m_pendingRecord;
		if(record(m, false).errors.empty() && !m_recordWaiting)
			m_pendingRecord.reset();
	}

	Outcome MmMachine::record(const Value& _m, const bool _first)
	{
		m_recordWaiting = false;
		if(!machineState())
			return refuse(capabilities().reason("gridRecord"));
		if(m_tel.recording < 0)
			return refuse("The machine's recording mode is not known yet.");
		const auto* m = _m.find("mode");
		const auto mode = m && m->isString() ? m->asString() : std::string();
		const int want = mode == "step" ? 3 : mode == "live" ? 2 : mode == "grid" ? 1 : 0;
		const int cur = m_tel.recording;
		std::vector<Key> keys;
		if(const auto t = num(_m, "t"); t >= 0 && (want == 3 || cur == 3))
			keys.push_back(static_cast<Key>(static_cast<int>(Key::Track1) + t));
		if(want != cur)
		{
			// from -> to (0 off, 1 grid, 2 live, 3 step): the keys
			static const std::vector<Key> R{Key::Record}, LR{Key::LiveRecord}, R_LR{Key::Record, Key::LiveRecord}, RR{Key::Record, Key::Record},
				SR{Key::StepRecord}, R_SR{Key::Record, Key::StepRecord}, RR_SR{Key::Record, Key::Record, Key::StepRecord}, R_R{Key::Record, Key::Record};
			const auto& k = want == 3 ? (cur == 0 ? SR : cur == 1 ? R_SR : RR_SR)
				: cur == 3 ? (want == 0 ? R : want == 1 ? R_R : R_LR)
				: cur == 0 ? (want == 1 ? R : LR) : cur == 1 ? (want == 0 ? R : R_LR) : (want == 0 ? RR : R);
			if(cur == 2)
				releaseExit();
			keys.insert(keys.end(), k.begin(), k.end());
		}
		if(keys.empty())
			return ok();
		if(!pressTransportKeys(keys))
		{
			// the panel is busy taking an edit (SYSEX RECV): RECORD goes once it is free, as PLAY does
			m_recordWaiting = true;
			if(_first)
			{
				m_pendingRecord = _m;
				m_pendingRecordMs = now();
			}
			return ok(g_transportWaits);
		}
		if(want == 3 && cur != 3)
			return ok("STEP RECORDING: play a note to write it to the step, then the next. → a rest, ← back, Delete clears the step, Esc: done.");
		return ok();
	}

	// LIVE RECORDING erase (manual 1-49): EXIT held while the notes to go play. The machine erases the notes of the
	// track in focus as they pass (measured, OS 1.32B: amp and pitch trigs; TRACK t moves the focus first).
	Outcome MmMachine::cmdLiveErase(const Value& _m, const Documents&)
	{
		if(!machineState())
			return refuse(capabilities().reason("gridRecord"));
		const bool on = flag(_m, "on");
		if(!on)
		{
			releaseExit();
			return ok();
		}
		if(m_tel.recording != 2)
			return refuse("Not live recording: erase works while LIVE RECORDING plays.");
		const auto t = num(_m, "t", 0);
		m_exitSeenMs = clock();
		if(m_exitHeld && m_eraseTrack == t)
			return ok();
		std::vector<Key> keys{static_cast<Key>(static_cast<int>(Key::Track1) + t)};
		if(!m_exitHeld)
			keys.push_back(Key::ExitDown);
		if(!pressKeys(keys))
			return refuse(g_panelBusy);
		m_exitHeld = true;
		m_eraseTrack = t;
		return ok("Erasing T" + std::to_string(t + 1) + "'s notes as they play, while Delete is held.");
	}

	// EXIT let go (liveErase off, recording left or changed). True when it was down.
	bool MmMachine::releaseExit()
	{
		if(!m_exitHeld)
			return false;
		m_exitHeld = false;
		return pressKeys({Key::ExitUp});
	}

	// STEP RECORDING's keys (manual 1-50): LEFT and RIGHT move the cursor (RIGHT leaves a rest), ENTER clears the step
	// and moves on (measured).
	Outcome MmMachine::cmdStepKey(const Value& _m, const Documents&)
	{
		if(!machineState())
			return refuse(capabilities().reason("gridRecord"));
		if(m_tel.recording != 3)
			return refuse("Not step recording: Shift-click REC first.");
		const auto* k = _m.find("key");
		const auto key = k && k->isString() ? k->asString() : std::string();
		const auto press = key == "left" ? Key::Left : key == "right" ? Key::Right : Key::Enter;
		return pressKeys({press}) ? ok() : refuse(g_panelBusy);
	}

	// The machine writes the current pattern while it records: read it back while it records and once when it
	// stops. True when the recording mode changed since the last step (the transport message says it).
	bool MmMachine::readWhileRecording(const double _now)
	{
		const auto r = watchRecord(m_recordReads, m_tel.recording, m_curPattern >= 0, _now, g_recordReadMs);
		m_recordReads = r.next;
		if(r.changed && m_tel.recording != 2)
			releaseExit();
		if(m_recLock && (r.changed || clock() - m_recLock->atMs > g_recLockMs))
			m_recLock.reset();
		if(r.read)
			request({Kind::Pattern, static_cast<uint8_t>(m_curPattern)}, true);
		return r.changed;
	}

	// Measured (mmDeskFirmwareTest reclock, OS 1.32B): while LIVE RECORDING plays, a synth track's value on its own MIDI
	// channel (a CC, pages SYN to LF3) becomes a lock of that value on the step that plays when it arrives, a step
	// without a trig included (it gets a trigless lock). The MIDI page's values go by NRPN, not measured: not named.
	void MmMachine::noteRecLock(const ed::MmKit& _before, const ed::MmKit& _after, const ChannelReach& _reach)
	{
		if(m_tel.recording != 2 || !m_playing || m_tel.step < 0 || m_tel.step > 63)
			return;
		for(uint8_t t = 0; t < 6; ++t)
		{
			if(!_reach.track[t] || _before.machines[t] != _after.machines[t])
				continue;
			for(uint8_t pg = 0; pg < 7; ++pg)
				for(uint8_t i = 0; i < 8; ++i)
					if(_before.tracks[t].pages[pg][i] != _after.tracks[t].pages[pg][i])
						m_recLock = RecLock{t, pg * 8 + i, m_tel.step, clock()};
		}
	}
}
