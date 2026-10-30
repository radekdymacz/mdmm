// MmMachine: how a document change reaches the machine (review, submit, the live kit edits, the dumps'
// push slots on SYSEX RECV or waiting for the person's, hwSend). Split from mmDeskMachine.cpp (review finding 9).
#include "mmDeskMachineParts.h"

#include "elektronData/mmCommands.h"
#include "elektronData/mmDump.h"
#include "elektronData/mmMachines.h"
#include "elektronData/mmPattern.h"

#include <utility>

namespace mmDesk
{
	using namespace parts;
	using deskCore::Source;

	namespace
	{
		bool isFx(const ed::MmKit& _k, const size_t _t)
		{
			const auto* m = ed::mmMachine(_k.machines[_t]);
			return m && m->fx;
		}

		// A track's routing goes live (0x5C) when 0x5C makes it what _to holds: on an FX machine it always sets an input,
		// on any other machine it clears it (measured, mmEditorProbeFirmwareTest inputs). Otherwise (an FX machine with
		// no input chosen, another with one) it goes in the kit dump.
		bool routingLive(const ed::MmKit& _to, const size_t _t)
		{
			return isFx(_to, _t) == ed::mmKitInput(_to, _t).has_value();
		}

		// The kit fields a live SysEx, CC or NRPN reaches when the kit becomes _to (everything else needs a dump): a
		// track's values and level only on its own MIDI channel, the MIDI page and MULTI ENV only on the base channel
		// (B-051), the outputs and an FX machine's input as routingLive says.
		ed::MmKit liveFields(ed::MmKit _k, const ed::MmKit& _to, const ChannelReach& _reach)
		{
			_k.name = {};
			_k.machines = {};
			for(size_t t = 0; t < _k.tracks.size(); ++t)
			{
				if(routingLive(_to, t))
				{
					ed::mmSetKitInput(_k, t, 0);	// the routing byte and the track's bits of the bus word: 0x5C's
					_k.routing[t] = 0;
				}
				if(_reach.track[t])
				{
					_k.levels[t] = 0;
					_k.tracks[t].pages = {};
				}
				if(_reach.nrpn)
				{
					_k.tracks[t].midi = {};
					_k.tracks[t].multiEnv = {};
				}
			}
			return _k;
		}
	}

	// ---- core -> machine ----

	MmMachine::Review MmMachine::review(const Value& _command, const std::vector<Change>& _changes, const Documents& _view)
	{
		// B-051: the active global's base channel may change (the GLOBAL page): the editor's channel messages wait until
		// the machine has it (setBaseChannel), its SysEx never depends on it.
		// The library's slot writes that lose something ask first (the page sends them again with force), as the
		// Machinedrum's: clearing a slot; writing over a kit that has a name, over the kit that plays (it is loaded
		// too, its unsaved edits go), or over a pattern with trigs.
		const auto op = deskCore::opOf(_command);
		// MM-095: the pattern that plays given another kit: the machine loads that kit at once, the edits of the kit that
		// plays are lost (measured, gapProbesFirmwareTest w12patkit). Joined to the library's question (withAsk), never
		// instead of it: a pattern written over the one that plays asks both.
		Outcome o;
		if(kitState(_view) == deskCore::KitState::Edited)
			for(const auto& c : _changes)
				if(c.ref().kind == Kind::Pattern && static_cast<int>(c.ref().slot) == m_curPattern
					&& std::get<ed::MmPattern>(c.after).kit != std::get<ed::MmPattern>(c.before).kit)
				{
					o = ask("discardKit", "<b>" + ed::mmPatternName(c.ref().slot) + "</b> plays and gets kit <b>" + kitLabel(_view, std::get<ed::MmPattern>(c.after).kit)
						+ "</b>: the machine loads it at once, and your edits to <b>" + kitLabel(_view, m_curKit) + "</b> are lost.", "Switch and lose edits");
					break;
				}
		const auto* row = MmModel::commands().find(op);
		if(!row || row->group != g_library)
			return Review(o);
		const bool clears = op == "kitClear" || op == "patClear" || op == "songClear";
		if(op == "kitRename" || op == "kitCopy" || op == "patCopy" || op == "songRename" || op == "songCopy" || op == "globalCopy")
			return Review(o);	// a name, or the clipboard: nothing is lost (but the kit edits, above)
		const bool edited = kitState(_view) == deskCore::KitState::Edited;
		for(const auto& c : _changes)
		{
			const auto ref = c.ref();
			const bool plays = ref.kind == Kind::Kit && static_cast<int>(ref.slot) == m_curKit;
			const std::string playing = !plays ? std::string() : edited ? " It is the kit that plays: it is loaded too, and its unsaved edits are lost (the machine keeps them in its UNDO KIT)."
				: " It is the kit that plays: it is loaded too.";
			if(clears && ref.kind == Kind::Kit)
				o = deskCore::withAsk(std::move(o), ask("clearSlot", "Clear <b>" + kitLabel(_view, ref.slot) + "</b>? Every track becomes GND-SIN." + playing, "Clear kit"));
			else if(clears && ref.kind == Kind::Pattern)
				o = deskCore::withAsk(std::move(o), ask("clearSlot", "Clear <b>" + ed::mmPatternName(ref.slot) + "</b>? Its notes and locks are removed. It keeps its kit link.",
					"Clear pattern"));
			else if(clears && ref.kind == Kind::Song)
			{
				if(!songIsEmpty(std::get<ed::MmSong>(c.before)))
					o = deskCore::withAsk(std::move(o), ask("clearSlot", "Clear <b>S" + std::string(ref.slot < 9 ? "0" : "") + std::to_string(ref.slot + 1) + "</b>? Its rows and its name are removed.", "Clear song"));
			}
			else if(ref.kind == Kind::Global)
				o = deskCore::withAsk(std::move(o), ask("overwriteSlot", "Paste over <b>GLOBAL " + std::to_string(ref.slot + 1) + "</b>? Its MIDI channels,"
					" control, multi map, MIDI tracks, routing and master tune are replaced (Undo brings them back).", "Paste"));
			else if(ref.kind == Kind::Song)
			{
				if(!songIsEmpty(std::get<ed::MmSong>(c.before)))
					o = deskCore::withAsk(std::move(o), ask("overwriteSlot", "Write over <b>S" + std::string(ref.slot < 9 ? "0" : "") + std::to_string(ref.slot + 1) + "</b>? What it holds is replaced.", "Overwrite"));
			}
			else if(ref.kind == Kind::Kit && (plays || !kitIsEmpty(std::get<ed::MmKit>(c.before))))
				o = deskCore::withAsk(std::move(o), ask("overwriteSlot", "Write over <b>" + kitLabel(_view, ref.slot) + "</b>? What it holds is replaced." + playing, "Overwrite"));
			else if(ref.kind == Kind::Pattern && patternHasTrigs(std::get<ed::MmPattern>(c.before)))
				o = deskCore::withAsk(std::move(o), ask("overwriteSlot", "Write over <b>" + ed::mmPatternName(ref.slot) + "</b>? Its notes and locks are replaced.",
					"Overwrite"));
		}
		return Review(o);
	}

	ChannelReach ChannelReach::of(const ed::MmGlobal* _global)
	{
		ChannelReach r;
		if(!_global)
			return r;
		for(uint8_t t = 0; t < 6; ++t)
			r.track[t] = ed::mmTrackChannel(*_global, t).has_value();
		r.nrpn = ed::mmBaseChannelOn(*_global);
		return r;
	}

	ChannelReach MmMachine::reach(const Documents& _view) const
	{
		if(clock() < m_channelsSettleUntilMs)
			return ChannelReach::none();
		return ChannelReach::of(activeGlobal(_view, m_curGlobal));
	}

	std::string MmMachine::noChannelReason(const Documents& _view, const int _t) const
	{
		const auto* g = activeGlobal(_view, m_curGlobal);
		if(!g)
			return {};
		const auto where = " (GLOBAL " + std::to_string(g->position + 1) + " › MIDI: the GLOBAL page, or GLOBAL › MIDI › CHANNELS on the machine)";
		if(!ed::mmBaseChannelOn(*g))
			return std::string("The machine's MIDI base channel is ") + (g->baseChannel > 15 ? "OFF" : "16, which reaches no track")
				+ ": it takes no mutes or notes over MIDI" + where + ".";
		if(_t >= 0 && _t < 6 && !ed::mmTrackChannel(*g, static_cast<uint8_t>(_t)))
			return "T" + std::to_string(_t + 1) + " has no MIDI channel of its own: base channel " + std::to_string(g->baseChannel + 1)
				+ ", CHANNEL SPAN " + std::to_string(g->channelSpan) + where + ", so the machine takes no mute or note for it over MIDI.";
		if(clock() < m_channelsSettleUntilMs)
			return "The machine's MIDI channels just changed; try again in a moment.";
		return {};
	}

	Outcome MmMachine::submit(const Change& _change, const Intent&, const Documents& _view)
	{
		const auto ref = _change.ref();
		m_recv.touch();
		switch(ref.kind)
		{
		case Kind::Pattern:
		{
			// B-053: a dump of the pattern that plays keeps the kit that plays (dumpKeepsKit)
			auto pattern = std::get<ed::MmPattern>(_change.after);
			const auto* before = std::get_if<ed::MmPattern>(&_change.before);
			const auto keep = dumpKeepsKit(static_cast<int>(ref.slot) == m_curPattern, m_curKit, before ? before->kit : pattern.kit, pattern.kit);
			if(keep)
				pattern.kit = *keep;
			// B-060: the machine plays a dumped transpose from its next start; the TRANSPOSE knob applies it at once
			const bool moved = before && static_cast<int>(ref.slot) == m_curPattern && transposesMoved(*before, pattern);
			if(moved && machineState())
				m_trnWanted = static_cast<uint8_t>(m_trnWanted | transposesMoved(*before, pattern));
			pushDump(ref, ed::encodeMmPattern(pattern));
			std::string note = keep ? "The pattern now links " + kitLabel(_view, *keep) + ", the kit that plays (the machine loaded no kit when it was picked)." : "";
			if(moved && m_playing && !machineState())
				note += std::string(note.empty() ? "" : " ") + "Heard from the next start: over MIDI the Monomachine plays a pattern's new transpose"
					" when it starts again (TRANSPOSE on its panel applies it at once).";
			return ok(note);
		}
		case Kind::Song:
			pushDump(ref, ed::encodeMmSong(std::get<ed::MmSong>(_change.after)));
			if(static_cast<int>(ref.slot) != m_curSong)
				return ok();
			// 0.3.5: the machine's song: loaded again by the desk once it is stopped in SONG mode (pumpSongReload)
			m_songReloadNeeded = true;
			m_songEditedMs = now();
			return ok(m_playing && m_songMode == 1 ? "Heard from the next start." : "");
		case Kind::Global:
			pushDump(ref, ed::encodeMmGlobal(std::get<ed::MmGlobal>(_change.after)));
			return ok();
		case Kind::Kit:
			// A stored slot: its dump on SYSEX RECV; into the kit that plays it is loaded too (LOAD KIT, as the
			// Machinedrum's library does), so what plays is what the slot holds.
		{
			const bool sent = pushDump(ref, ed::encodeMmKit(std::get<ed::MmKit>(_change.after)));
			if(static_cast<int>(ref.slot) == m_curKit)
			{
				loadKitAfter(ref, sent);
				return ok("Written to the kit slot and loaded.");
			}
			return ok();
		}
		case Kind::WorkingKit:
		{
			const auto& before = std::get<WorkingKit>(_change.before).kit;
			const auto& after = std::get<WorkingKit>(_change.after).kit;
			if(after.position != m_curKit)
				return refuse("Only the kit that plays can be edited live");
			std::vector<std::string> notes;
			deliverKitLive(before, after, reach(_view), notes);
			noteRecLock(before, after, reach(_view));
			// Pending until memory shows it (or it is too old to wait for); without memory nothing
			// reads it back: done as sent.
			if(m_profile.memory)
				m_working.expect.sent(before, after, now());
			else
				settle(WorkingKit{after}, Source::Tracked);
			std::string note;
			for(const auto& n : notes)
				note += (note.empty() ? "" : " ") + n;
			return ok(note);
		}
		}
		return ok();
	}

	void MmMachine::deliverKitLive(const ed::MmKit& _from, const ed::MmKit& _to, const ChannelReach& _reach, std::vector<std::string>& _notes)
	{
		sendKitLive(_from, _to, _reach);
		// What no live message reaches: a kit dump to the current slot, then LOAD KIT. Paced as every dump (latest wins).
		if(ed::mmKitRaw(liveFields(_from, _to, _reach)) != ed::mmKitRaw(liveFields(_to, _to, _reach)))
		{
			auto k = _to;
			k.position = static_cast<uint8_t>(m_curKit);
			const Ref slot{Kind::Kit, k.position};
			loadKitAfter(slot, pushDump(slot, ed::encodeMmKit(k)));
			const bool channel = ed::mmKitRaw(liveFields(_from, _to, {})) == ed::mmKitRaw(liveFields(_to, _to, {}));
			_notes.push_back(channel ? "Written to the kit slot and loaded (the track has no MIDI channel of its own in the active global)."
				: "Written to the kit slot and loaded (no live SysEx for this setting).");
		}
	}

	void MmMachine::sendKitLive(const ed::MmKit& _from, const ed::MmKit& _to, const ChannelReach& _reach)
	{
		if(_from.name != _to.name)
			m_port.sendSysex(ed::mmSetKitNameBytes(_to.name));	// B-190: all 11 bytes, as the stored kit has them
		for(uint8_t t = 0; t < 6; ++t)
		{
			const bool machine = _from.machines[t] != _to.machines[t];
			if(machine)
				m_port.sendSysex(ed::mmAssignMachine(t, _to.machines[t], 0));
			const auto input = ed::mmKitInput(_to, t);
			const bool outputs = ed::mmRoutingOutputs(_from.routing[t]) != ed::mmRoutingOutputs(_to.routing[t]);
			if(routingLive(_to, t) && (outputs || ed::mmKitInput(_from, t) != input))
				m_port.sendSysex(ed::mmSetRouting(t, ed::mmRoutingOutputs(_to.routing[t]), input.value_or(0)));
			if(_reach.track[t])
			{
				if(_from.levels[t] != _to.levels[t])
					m_port.sendParam(t, 7, 0, _to.levels[t]);
				for(uint8_t pg = 0; pg < 7; ++pg)
					for(uint8_t i = 0; i < 8; ++i)
						if(_from.tracks[t].pages[pg][i] != _to.tracks[t].pages[pg][i] || (machine && pg == 0))
							m_port.sendParam(t, pg, i, _to.tracks[t].pages[pg][i]);
			}
			if(!_reach.nrpn)
				continue;
			for(uint8_t i = 0; i < 8; ++i)
				if(_from.tracks[t].midi[i] != _to.tracks[t].midi[i])
					m_port.sendNrpn(t, static_cast<uint8_t>(0x38 + i), _to.tracks[t].midi[i]);
			for(uint8_t i = 0; i < 6; ++i)
				if(_from.tracks[t].multiEnv[i] != _to.tracks[t].multiEnv[i])
					m_port.sendNrpn(t, static_cast<uint8_t>(0x40 + i), _to.tracks[t].multiEnv[i]);
		}
	}

	// B-027: the OS 1.32B takes a dump of the pattern that plays and loads the kit the pattern links from its slot,
	// also when that is the kit that plays (measured, mmDeskFirmwareTest machine: memory shows the stored kit some
	// 20-40 ms after the dump is taken on SYSEX RECV): the kit's unsaved edits, a machine change or a value, are gone.
	// As the Machinedrum's (B-025): once the machine has read and applied the dump (the stream's after-work), the edits
	// go again (restoreWorkingKit); until then no memory image of the kit is taken, it shows the stored slot.
	void MmMachine::reloadFollows(const Bytes& _patternDump)
	{
		const auto pattern = ed::decodeMmPattern(_patternDump);
		if(!pattern || m_curKit < 0 || static_cast<int>(pattern->kit) != m_curKit)
			return;	// another kit loads: the edits of the kit that played are lost, as on the machine
		++m_reloadsPending;
		m_reloadQueuedMs = clock();
		m_stream.after([this, kit = m_curKit]
		{
			m_reloadsPending = std::max(0, m_reloadsPending - 1);
			m_restoreKit = kit;
		}, clock());
	}

	void MmMachine::transposeFollows()
	{
		if(!m_trnWanted)
			return;
		m_stream.after([this, tracks = std::exchange(m_trnWanted, uint8_t{0})] { m_trnDue = static_cast<uint8_t>(m_trnDue | tracks); }, clock());
	}

	// B-060: the transposes the dumps stored, played at once (applyTransposeKeys). After the last dump of the pattern
	// that plays (none queued behind it, none waiting on SYSEX RECV, the machine took it) and with the track in focus
	// asked for, to give it back. Stopped, the next PLAY takes them anyway.
	void MmMachine::pumpTranspose(const Documents& _view)
	{
		if(!m_trnDue)
			return;
		const auto it = m_curPattern >= 0 ? _view.patterns.find(static_cast<uint8_t>(m_curPattern)) : _view.patterns.end();
		if(!m_playing || !machineState() || it == _view.patterns.end())
		{
			m_trnDue = 0;
			m_focusAskedMs = -1;
			return;
		}
		if(const auto* p = m_pushes.find({Kind::Pattern, static_cast<uint8_t>(m_curPattern)}); p && (p->parked || p->slot.next()))
			return;
		if(m_trnWanted || m_recv.queued() || m_recv.taking() || now() < m_keysUntilMs)
			return;
		if(m_focusAskedMs < 0)
		{
			m_port.sendSysex(ed::mmStatusRequest(ed::MmStatus::AudioTrack));
			m_focusAskedMs = clock();
			return;
		}
		const bool known = m_focusSeenMs >= m_focusAskedMs;
		if(!known && clock() - m_focusAskedMs < g_focusWaitMs)
			return;
		if(!pressKeys(applyTransposeKeys(m_trnDue, it->second, known ? m_focus : -1)))
			return;
		m_trnDue = 0;
		m_focusAskedMs = -1;
	}

	// The machine loaded the kit that plays from its slot: what the editor shows of it (its unsaved edits, and those
	// sent since the dump) goes again as live edits, pending until memory shows it. From the tick, which has the view:
	// the after-work only marks it due.
	void MmMachine::restoreWorkingKit(const Documents& _view)
	{
		const int kit = std::exchange(m_restoreKit, -1);
		if(kit < 0 || kit != m_curKit)
			return;	// another kit plays now, loaded from its slot
		const auto* working = _view.workingKitOf(kit);
		const auto stored = _view.kits.find(static_cast<uint8_t>(kit));
		if(!working || stored == _view.kits.end())
			return;
		const auto loaded = ed::mmKitAsLoaded(stored->second);
		if(ed::mmKitRaw(loaded) == ed::mmKitRaw(*working))
			return;	// clean: the reload changed nothing
		// Live edits; what no live message reaches is in the slot already (deliverKitLive wrote it there), or, when the
		// MIDI channels changed since, goes there now.
		std::vector<std::string> notes;
		deliverKitLive(loaded, *working, reach(_view), notes);
		if(!m_profile.memory)
			return;
		// From the slot the machine now holds, not from before the edits that were on their way.
		m_working.expect.clear();
		m_working.expect.sent(loaded, *working, now());
	}

	deskCore::PushPolicy MmMachine::pushPolicy(const Kind _kind) const
	{
		auto policy = deskCore::wirePolicy(m_profile.push, m_profile.wire, replyBytes(_kind));
		// B-014: no faster than the stream carries the dump (a MIDI cable's pace while playing; the newest value waits meanwhile)
		policy.minIntervalMs = std::max(policy.minIntervalMs, m_stream.policy().wireMs(replyBytes(_kind)));
		return policy;
	}

	// Paced (DESIGN-edit-flow.md): the dump goes now or waits its turn (latest wins); the read-back is
	// asked for once the gesture is quiet (pumpPushes).
	bool MmMachine::pushDump(const Ref& _ref, Bytes _dump)
	{
		auto& p = m_pushes[_ref];
		if(manualDumps() && p.parked)
		{
			// Still waiting for the person's SYSEX RECV: the newer dump takes its place (latest wins), in its
			// place in the queue.
			for(auto& w : m_manual)
				if(w.ref && *w.ref == _ref)
					w.bytes = _dump;
			p.slot.abandon();
			p.slot.want(_dump, now(), pushPolicy(_ref.kind));
			return true;
		}
		// A dump still queued on SYSEX RECV (parked) goes first; the new one waits its turn (Held). Else
		// paced; latest wins.
		if(!m_pushes.want(_ref, _dump, now(), pushPolicy(_ref.kind)))
			return false;
		sendDump(_ref, std::move(_dump));
		return true;
	}

	void MmMachine::loadKitAfter(const Ref& _ref, const bool _sent)
	{
		if(!_sent)
		{
			m_loadAfter.insert(_ref);
			return;
		}
		auto load = ed::mmLoadKit(_ref.slot);
		if(manualDumps())
		{
			// HW MIDI: a newer dump took the place of the one still waiting for SYSEX RECV, whose LOAD KIT waits
			// after it already: one is enough (a drag would queue one per value).
			const auto dump = std::find_if(m_manual.begin(), m_manual.end(), [&](const Waiting& _w) { return _w.ref && *_w.ref == _ref; });
			if(dump != m_manual.end()
				&& std::any_of(dump + 1, m_manual.end(), [&](const Waiting& _w) { return !_w.ref && _w.bytes == load; }))
				return;
		}
		afterDumps(std::move(load));
	}

	void MmMachine::sendDump(const Ref& _ref, Bytes _dump)
	{
		m_pushes[_ref].parked = true;
		if(manualDumps())
		{
			// HW MIDI: the machine takes a dump only on SYSEX RECV, which only the person can open: it waits
			// (recv.waiting, SEND n) until the page says the machine is there (hwSend).
			m_manual.push_back({std::move(_dump), _ref});
			return;
		}
		const auto tag = m_nextRecvTag++;
		m_recvRefs[tag] = _ref;
		m_recv.want(std::move(_dump), tag);
	}

	void MmMachine::pumpPushes(const double _now)
	{
		const auto policyOf = [this](const Ref& _ref) { return pushPolicy(_ref.kind); };
		const double timeout = m_profile.wire ? g_wireReadBackTimeoutMs : g_readBackTimeoutMs;
		const auto timeoutOf = [timeout](const Ref&) { return timeout; };
		using K = Pushes::Effect::Kind;
		if(m_stream.sending(_now))
			m_pushes.restartAsked(_now);
		for(auto& e : m_pushes.pump(_now, policyOf, timeoutOf, deskCore::g_maxReadBacks))
		{
			switch(e.kind)
			{
			case K::Send:
				sendDump(e.ref, std::move(*e.value));
				// a write into the kit that plays waited behind the dump before it: its LOAD KIT follows it (measured:
				// two kit edits in quick succession lost the second, LOAD KIT ran before its dump)
				if(m_loadAfter.erase(e.ref) && static_cast<int>(e.ref.slot) == m_curKit)
					afterDumps(ed::mmLoadKit(e.ref.slot));
				break;
			case K::AskBack:
				// The gesture is quiet: one read-back confirms the last dump.
				request(e.ref, true);
				break;
			case K::TimedOut:
				// A read-back that never came: the push was given up.
				fail(e.ref, std::string("The machine did not read back the ") + kindName(e.ref.kind) + " that was sent. Showing what it holds.");
				request(e.ref, true);
				break;
			}
		}
	}

	void MmMachine::afterDumps(Bytes _message)
	{
		if(manualDumps())
			m_manual.push_back({std::move(_message), std::nullopt});
		else
			m_recv.want(std::move(_message));
	}


	// MM-P4, HW MIDI: the person says the machine is on SYSEX RECV. What waited goes out, in order; the
	// dumps are read back.
	Outcome MmMachine::cmdHwSend(const Value&, const Documents&)
	{
		if(!manualDumps())
			return refuse("The editor opens SYSEX RECV on this engine by itself.");
		if(m_manual.empty())
			return ok("Nothing waits for SYSEX RECV.");
		const auto n = m_manual.size();
		for(auto& w : m_manual)
		{
			m_port.sendSysex(w.bytes);
			if(!w.ref)
				continue;
			if(auto* push = m_pushes.find(*w.ref); push && push->parked)
			{
				push->parked = false;
				push->slot.askedBack(now());
				request(*w.ref, true);
			}
			if(w.ref->kind == Kind::Pattern && static_cast<int>(w.ref->slot) == m_curPattern)
				reloadFollows(w.bytes);
		}
		m_manual.clear();
		return ok(std::to_string(n) + (n == 1 ? " message" : " messages") + " sent. Press EXIT on the Monomachine when the editor has read"
			" them back (the pattern field is empty again).");
	}

	void MmMachine::pumpRecv(const double _now)
	{
		if(m_profile.wire)
			return;
		// 0.9 wave 2: DIGIPRO MGR has the panel; SYSEX RECV's dumps wait (its clock waits with them)
		if(!m_waveRecv.quiet())
			return;
		// Parked, with the person's keys still on their way (pressKeys): the next dump waits, since a key the machine
		// gets while it takes a dump is lost (mmDeskFirmwareTest parked).
		if(m_recv.parked() && now() < m_keysUntilMs)
			return;
		// 0.3.4: a dump the session sent may still wait in the stream (cable speed while playing): the session stays
		// on SYSEX RECV until the stream is quiet, or the machine would leave it before the dump arrives
		if(m_recv.parked() && m_stream.sending(_now))
			m_recv.touch();
		// B-067: the macro's cursor goes to the active global (ENTER on another slot would make it active)
		if(activeSlot() >= 0)
			m_recv.activeGlobal = activeSlot() & 7;
		auto out = m_recv.tick(_now, m_tel);
		if(!out.keys.empty() && m_port.pressKeys)
			m_port.pressKeys(out.keys);
		for(const auto& s : out.sends)
		{
			m_port.sendSysex(s.bytes);
			// The push this dump answers (its tag): ask for its read-back.
			const auto tagged = m_recvRefs.find(s.tag);
			if(tagged == m_recvRefs.end())
				continue;
			const auto ref = tagged->second;
			m_recvRefs.erase(tagged);
			// On the wire now; its read-back waits for the gesture's quiet (pumpPushes).
			if(auto* push = m_pushes.find(ref); push && push->parked)
				push->parked = false;
			if(ref.kind == Kind::Pattern && static_cast<int>(ref.slot) == m_curPattern)
			{
				reloadFollows(s.bytes);
				transposeFollows();
			}
		}
		// The machine never showed SYSEX RECV: the session dropped what it held. Those pushes fail (the
		// page shows the error, the edit is no longer pending) and the document is read again.
		std::set<Ref> failedRefs;
		for(const auto tag : out.gaveUp)
		{
			const auto tagged = m_recvRefs.find(tag);
			if(tagged == m_recvRefs.end())
				continue;
			failedRefs.insert(tagged->second);
			m_recvRefs.erase(tagged);
		}
		for(const auto& ref : failedRefs)
		{
			if(auto* push = m_pushes.find(ref))
			{
				push->parked = false;
				push->slot.abandon();
			}
			m_loadAfter.erase(ref);
			fail(ref, std::string("The Monomachine did not open GLOBAL > SYSEX RECV, so the ") + kindName(ref.kind)
				+ " edit was not sent. Showing what it holds.");
			request(ref, true);
		}
	}

	// ---- 0.9 wave 2: the DigiPRO manager (mmWaveRecv.h, doc/release/0.9/mm-digipro.md) ----

	std::string MmMachine::sendWaves(const std::vector<Bytes>& _dumps)
	{
		if(!m_stream.open())
			return "This engine cannot send SysEx to the machine.";
		for(const auto& d : _dumps)
		{
			if(manualDumps())
				m_manualWaves.push_back(d);
			else
				m_waveRecv.want(d);
		}
		return {};
	}

	std::string MmMachine::eraseWave(const int _wave)
	{
		if(manualDumps() || !m_port.pressKeys)
			return "The editor cannot press this machine's keys: erase on the Monomachine, GLOBAL > FILE > DIGIPRO MGR > ERASE.";
		if(_wave < -1 || _wave > 63)
			return "There is no such waveform.";
		m_waveRecv.erase(_wave);
		return {};
	}

	// HW MIDI: the person says the machine is on DIGIPRO MGR > RECEIVE > ORG. What waited goes out, in order; the machine
	// writes it once the person presses [EXIT/NO] there.
	std::string MmMachine::wavesSendNow()
	{
		if(!manualDumps())
			return "The editor opens DIGIPRO MGR > RECEIVE on this engine by itself.";
		for(const auto& d : m_manualWaves)
			m_port.sendSysex(d);
		if(!m_manualWaves.empty())
			++m_wavesFinished;
		m_manualWaves.clear();
		return {};
	}

	MmAdapter::WaveWork MmMachine::waveWork() const
	{
		WaveWork w;
		w.queued = m_waveRecv.queued() + m_manualWaves.size();
		w.busy = !m_waveRecv.quiet();
		w.finished = m_wavesFinished;
		w.gaveUp = m_wavesGaveUp;
		w.state = m_waveRecv.stateName();
		if(!m_manualWaves.empty())
			w.waitsFor = "Open GLOBAL > FILE > DIGIPRO MGR > RECEIVE > ORG on the Monomachine (it says WAITING), then press Send.";
		return w;
	}

	void MmMachine::pumpWaves(const double _now)
	{
		if(m_profile.wire || m_waveRecv.idle())
			return;
		// SYSEX RECV's dumps first: DIGIPRO MGR starts once that session is idle and holds nothing
		if(m_waveRecv.state() == WaveRecv::State::Idle && (m_recv.state() != RecvSession::State::Idle || m_recv.queued() > 0))
			return;
		// and once the desk's own keys are through
		if(m_waveRecv.state() == WaveRecv::State::Idle && now() < m_keysUntilMs)
			return;
		// a dump the session sent may still wait in the stream: it stays on RECEIVE until the stream is quiet
		if(m_waveRecv.state() == WaveRecv::State::Parked && m_stream.sending(_now))
			m_waveRecv.touch();
		if(activeSlot() >= 0)
			m_waveRecv.activeGlobal = activeSlot() & 7;
		auto out = m_waveRecv.tick(_now, m_tel);
		if(!out.keys.empty() && m_port.pressKeys)
			m_port.pressKeys(out.keys);
		for(const auto& s : out.sends)
			m_port.sendSysex(s);
		if(out.finished)
			++m_wavesFinished;
		if(out.gaveUp)
			++m_wavesGaveUp;
	}
}
