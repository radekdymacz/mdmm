#pragma once

#include "mdDeskAdapter.h"
#include "deskCore/deskSongRow.h"
#include "mdDeskDelivery.h"
#include "mdDeskModel.h"
#include "mdDeskRecord.h"
#include "mdDeskTelemetry.h"
#include "mdDeskWorkingKit.h"

#include "deskCore/deskAdapter.h"
#include "deskCore/deskChain.h"
#include "deskCore/deskHostClock.h"
#include "deskCore/deskWorkingCopy.h"
#include "deskCore/deskCore.h"
#include "deskCore/deskLoadQueue.h"
#include "deskCore/deskPacer.h"
#include "deskCore/deskSequence.h"

#include "mdDataLink/mdDataLink.h"

#include <array>
#include <deque>
#include <functional>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace mdDesk
{
	// The Machinedrum adapter (P6): mdDataLink, kit delivery, the knob recorder, the load queue,
	// pushes, sequences on facts and the machine state, behind deskCore's Machine protocol. The
	// core never sees SysEx, keys or RAM; this class never publishes documents.
	class MdMachine final : public deskCore::AdapterBase<MdModel, MdAdapter>
	{
	public:
		using Value = elektronData::json::Value;
		using Profile = mdDesk::Profile;
		using Port = DevicePort;

		MdMachine(Profile _profile, Port _port);

		// ---- deskCore::Machine ----
		Review review(const Value& _command, const std::vector<Change>& _changes, const Documents& _view) override;
		deskCore::Outcome submit(const Change& _change, const Intent& _intent, const Documents& _view) override;
		deskCore::Outcome command(const Value& _command, const Documents& _view) override;
		deskCore::Outcome askFor(const Value& _command, const Documents& _view) override;
		void onSysex(const Bytes& _message) override;
		void tick(double _nowMs, const Documents& _view) override;
		void pageReady() override;
		Value state(const Documents& _view) const override;
		Value status() const override;
		deskCore::Capabilities capabilities() const override;
		deskCore::Lifecycle lifecycle() const override { return deskCore::lifecycleOf(facts()); }
		Context context() const override { return {m_session.state().kit}; }
		bool busy() const override;
		std::string sendAsIs(const Bytes& _message, bool _dump) override;
		AsIs asIs() const override;

		// ---- MdAdapter: Machinedrum facts from the device ----
		void setProbe(Probe _probe) override;
		TelemetryEvents onTelemetry(const Telemetry& _telemetry) override;
		void onWorkingKitMemory(const Bytes& _region, const Documents& _view) override;
		void onHostKitParam(uint8_t _track, uint8_t _index, uint8_t _value, const Documents& _view) override;
		void onHostMute(uint8_t _track, bool _muted) override;
		void sendModulation(uint8_t _track, uint8_t _param, uint8_t _value, const Documents& _view) override;
		const Telemetry& telemetry() const override { return m_telemetry; }
		std::string sendSample(uint8_t _slot, const elektronData::MdSampleUpload& _upload) override;
		void cancelSample() override;
		const SdsSender::Progress& sampleProgress() const override { return m_sds.progress(); }
		uint64_t audition(const elektronData::AuditionClip& _clip) override { return m_port.audition ? m_port.audition(_clip) : 0; }
		elektronData::AuditionStatus auditionStatus() const override { return m_port.auditionStatus ? m_port.auditionStatus() : elektronData::AuditionStatus{}; }
		// The protocol facts (not MdAdapter's: the desk reads them for tests and diagnostics).
		const mdDataLink::Session::State& linkState() const { return m_session.state(); }
		bool replied() const { return m_wire.replied; }
		double lastRoundTripMs() const { return m_lastRoundTripMs; }

		const Profile& profile() const { return m_profile; }
		size_t loading() const { return m_loads.pending(); }
		// The model's machine commands this adapter runs (tests check them against the table).
		static std::vector<std::string> commandsHandled();
		// The commands that may ask first (tests check them against the table).
		static std::vector<std::string> commandsAsking();

	private:
		using Handler = deskCore::Outcome (MdMachine::*)(const Value&, const Documents&);
		// The adapter's own op -> function map for the model's machine commands.
		static const std::map<std::string, Handler>& handlers();

		// What a sequence step does (deskCore::Sequencer, facts instead of fixed delays).
		enum class Act : uint8_t { Stop, Play, RecordPlay, LoadSong, SelectPattern, MidiStop, SongMode, FromPosition };
		using Pushes = deskCore::Pushes<DocRef, Document>;
		// The firmware tweaks from its selected track, which must lead (controlAllLeads): the adapter
		// selects one first (SET STATUS, then the machine's status says it is selected).
		struct TweakTurns
		{
			struct Turn { int page; uint8_t knob; int steps; uint8_t lead; };
			std::deque<Turn> turns;		// net steps per knob, in order
			bool held = false;			// FUNCTION is held on the machine
			double lastMs = -1e9;		// the last turn
			double pageKeyMs = -1e9;	// the last page key
			double selectMs = -1e9;		// the last SET STATUS track or track status request
			double startMs = 0;			// the gesture began (nothing held, nothing waiting)
			double trackKnownMs = -1e9;	// the machine last said which track is selected
			int pageKeys = 0;			// page keys pressed without the knob page following
			int selects = 0;			// SET STATUS track sent without the status following
			uint32_t indexes = 0;		// the kit parameters (bit 0-23) this gesture tweaked
			// The kit parameters the machine's own gesture is moving: the CCs the machine sends while it
			// steps them (the plug-in's parameters report them) are its way there, not new edits.
			uint32_t guard = 0;
			double checkMs = -1;		// when to check that memory shows the gesture (-1: no check due)

			void want(const int _page, const uint8_t _knob, const int _steps, const uint8_t _lead, const double _nowMs)
			{
				if(!active())
					startMs = _nowMs;
				indexes |= 1u << (_page * 8 + _knob);
				guard |= 1u << (_page * 8 + _knob);
				if(!turns.empty() && turns.back().page == _page && turns.back().knob == _knob && turns.back().lead == _lead)
					turns.back().steps += _steps;
				else
					turns.push_back({_page, _knob, _steps, _lead});
			}
			bool active() const { return held || !turns.empty(); }
		};
		struct RecLock
		{
			uint8_t track = 0, param = 0, step = 0;
			double atMs = 0;
		};
		// Panel keys on their way (a fact from the device's telemetry, P6): pressed at atMs, seen
		// pending by the device, and over when the device says none are left.
		// Panel keys (and knob turns) sent and not yet worked off, as the device reports them: it
		// shows keys pending, then none left. One fact, two transitions.
		struct Keys
		{
			std::vector<std::string> waiting;	// held back while a dump request is in flight
			bool sent = false;
			bool seenPending = false;
			double sentMs = 0;

			void pressed(const double _nowMs)
			{
				sent = true;
				seenPending = false;
				sentMs = _nowMs;
			}
			// The device's count of keys it has not worked off (-1: it does not say).
			void onPending(const int _pending)
			{
				if(sent && _pending > 0)
					seenPending = true;
				else if(sent && (seenPending || _pending < 0))
					sent = false;
			}
		};

		// What the panel-key features need (one fact each, read by capabilities() and the commands).
		bool panelKeys() const { return m_port.pressKey && m_profile.panel; }
		bool canLiveRecord() const { return panelKeys() && m_telemetry.valid && m_port.turnKnob; }
		bool canChain() const { return panelKeys() && m_telemetry.valid; }
		deskCore::LifeFacts facts() const;
		void wireSession();
		void startOver();
		double now() const { return m_port.nowMs(); }
		bool keysOnTheirWay() const;
		bool pressKey(const std::string& _key);
		void releaseKeys();
		deskCore::Outcome sendChain(const std::vector<int>& _patterns);
		// CLEAR: LOAD PATTERN of the current pattern (false: it is not known).
		bool clearChain();
		void pumpChain();
		// 0.3.5: an edited current song is heard without Reload song (pumpSongReload)
		void pumpSongReload(double _now);
		// B-098: the emulated machine has not loaded a song since it started (its working song is empty)
		bool songNotLoaded() const;
		// B-101: REC once the playing pattern's push is on the machine
		deskCore::Outcome startRecording();
		void pumpRecordStart(double _now);
		double m_songEditedMs = -1;
		void load(const DocRef& _ref, bool _urgent);
		void request(const DocRef& _ref);
		std::optional<uint8_t> currentKit() const { return m_session.state().kit; }
		deskCore::Outcome pushDump(const Document& _doc, const Documents& _view);

		void onPattern(const elektronData::MdPattern& _p);
		void onKit(const elektronData::MdKit& _k);
		void onSong(const elektronData::MdSong& _s);
		void onGlobal(const elektronData::MdGlobal& _g);
		void onDumpReadBack(const Document& _doc);
		void onState(const mdDataLink::Session::State& _s);
		void takeWorkingKit(const Documents* _view);
		deskCore::KitState kitState(const Documents& _view) const;
		const elektronData::MdKit* heldKit(const Documents& _view) const;
		void setBaseChannel(const elektronData::MdGlobal& _g);
		std::string channelsOff(const Documents& _view) const;
		void pumpLoads(double _now);
		void gaveUpLoad(const DocRef& _ref);
		bool current(const DocRef& _ref) const;
		void pumpPushes(double _now, const Documents& _view);
		void pumpTweak(double _now);
		void checkTweak(double _now);
		void pumpCoalesced(double _now);
		// Whether Control All can be the machine's own gesture now (panel keys, knob page telemetry, not
		// recording: while recording a turn is a lock).
		bool tweakByPanel() const;
		static std::optional<uint8_t> tweakLead(const elektronData::MdKit& _kit, std::optional<uint8_t> _preferred);
		deskCore::PushPolicy pushPolicy(DocKind _kind) const;
		void sendDump(const Document& _doc, const Documents& _view);
		void restoreWorkingKit(const elektronData::MdKit& _stored, const elektronData::MdKit& _working);
		void sendLive(uint8_t _t, uint8_t _index, uint8_t _value);
		void pumpRecording(double _now, const Documents& _view);
		void pumpSequence(double _now);
		void runSequence(std::vector<deskCore::SeqStep<Act>> _steps);

		// Machine commands (the table's handler column).
		static const std::map<std::string, Handler>& askers();
		static Value kitDetails(std::optional<uint8_t> _kit);
		deskCore::Outcome askSelect(const Value&, const Documents&);
		deskCore::Outcome askKitLoad(const Value&, const Documents&);
		deskCore::Outcome askReloadKit(const Value&, const Documents&);
		deskCore::Outcome askKitSaveAs(const Value&, const Documents&);
		deskCore::Outcome cmdLoad(const Value&, const Documents&);
		deskCore::Outcome cmdSelect(const Value&, const Documents&);
		deskCore::Outcome cmdSaveKit(const Value&, const Documents&);
		deskCore::Outcome cmdReloadKit(const Value&, const Documents&);
		deskCore::Outcome cmdLoadUndoKit(const Value&, const Documents&);
		std::optional<deskCore::Outcome> undoKitRefused() const;
		deskCore::Outcome askLoadUndoKit(const Value&, const Documents&);
		deskCore::Outcome cmdKitLoad(const Value&, const Documents&);
		deskCore::Outcome cmdKitSaveAs(const Value&, const Documents&);
		deskCore::Outcome kitSwitchedBy(uint8_t _slot, bool _load);
		deskCore::Outcome cmdRecord(const Value&, const Documents&);
		deskCore::Outcome cmdLiveErase(const Value&, const Documents&);
		// liveErase: EXIT/NO and the TRIG key or knob switch let go if they are down.
		void releaseErase();
		// liveErase with a parameter: select the track, show its knob page, then hold EXIT/NO and the knob.
		void pumpErase(double _now);
		deskCore::Outcome cmdRecTrig(const Value&, const Documents&);
		deskCore::Outcome cmdNoteOn(const Value&, const Documents&);
		deskCore::Outcome cmdNoteOff(const Value&, const Documents&);
		// The keyboard's held layer: let track _t's note go and put back what its key held (the document's
		// value); restore() puts back every held value, the notes sound on.
		void releaseNote(uint8_t _t, const Documents& _view);
		void restore(std::vector<deskCore::HeldOverride> _held, const Documents& _view);
		void sendHeld(uint8_t _t, uint8_t _index, uint8_t _value);
		// A memory image without the keyboard's held layer.
		elektronData::MdKit unheld(elektronData::MdKit _image, const Documents* _view) const;
		deskCore::Outcome cmdChain(const Value&, const Documents&);
		deskCore::Outcome cmdChainClear(const Value&, const Documents&);
		deskCore::Outcome cmdGlobalSlot(const Value&, const Documents&);
		deskCore::Outcome cmdSelectSong(const Value&, const Documents&);
		deskCore::Outcome cmdSaveSong(const Value&, const Documents&);
		deskCore::Outcome askSaveSong(const Value&, const Documents&);
		deskCore::Outcome cmdReloadSong(const Value&, const Documents&);
		deskCore::Outcome cmdSampleCancel(const Value&, const Documents&);
		// Every SysEx but a sample's goes here (m_out holds it while a sample is on its way).
		void sendSysex(const Bytes& _message);
		bool canSendSysex() const { return m_out.open(); }
		double streamTimeoutMs() const;
		void sendLiveSysex(const LiveEdit& _e, const Bytes& _message);
		void pumpSample(double _now);
		deskCore::Outcome cmdPlay(const Value&, const Documents&);
		deskCore::Outcome cmdStop(const Value&, const Documents&);
		deskCore::Outcome cmdMute(const Value&, const Documents&);
		deskCore::Outcome cmdSeqMode(const Value&, const Documents&);
		deskCore::Outcome cmdFollowHost(const Value&, const Documents&);
		deskCore::HostClock m_hostClock;	// review 1 (I-026): TEMPO IN is the host-clock switch
		// Wave 2 (mdDeskTransport.cpp): pause, resume, play from a song row, panic, the tempo nudge.
		deskCore::Outcome cmdPause(const Value&, const Documents&);
		deskCore::Outcome cmdResume(const Value&, const Documents&);
		deskCore::Outcome cmdPlayFrom(const Value&, const Documents&);
		deskCore::Outcome cmdPanic(const Value&, const Documents&);
		deskCore::Outcome cmdNudge(const Value&, const Documents&);
		bool ctrlIn(const Documents& _view) const;
		void runTransportAct(Act _act, int _arg);
		// The tempo a nudge started from (BPM x 24), until it is let go.
		std::optional<uint16_t> m_nudgeFrom;

		const Profile m_profile;
		Port m_port;
		// P9: the device's own SysEx out, sample > held > normal (SysexOut)
		SysexOut m_out;
		SdsSender m_sds;
		mdDataLink::Session m_session;

		deskCore::LoadQueue<DocRef> m_loads;
		bool m_backgroundQueued = false;
		Pushes m_pushes;

		deskCore::WorkingCopy<elektronData::MdKit> m_working;	// where the kit that plays comes from
		double m_kitStatusAskedMs = -1e9;
		// B-025: dumps over the current pattern whose kit reload the working kit's edits must follow, and when the
		// last one went into the stream. Meanwhile memory images of the kit are not taken (they show the kit before
		// the reload, then the stored slot): the restore after the dump sets what memory must show.
		int m_reloadsPending = 0;
		double m_reloadQueuedMs = 0;
		static constexpr double g_reloadHoldMs = 10000;	// a reload not restored by then holds nothing any more
		static constexpr double g_songReloadQuietMs = 300;
		static constexpr double g_recordWaitMs = 3000;	// B-101: REC waits at most this long for a pattern push
		// liveErase: the page says the key is still held every 250 ms; without word for this long the keys are let go
		// (a page that went away, reloaded or died while Delete was held)
		static constexpr double g_eraseQuietMs = 1000;	// a song edit, then this long before the song loads again
		bool reloadHolds() const { return m_reloadsPending > 0 && now() - m_reloadQueuedMs < g_reloadHoldMs; }

		Probe m_probe = Probe::Running;
		deskCore::WireFacts m_wire;
		bool m_telemetrySeen = false;
		double m_lastStatusMs = -1e9;
		double m_lastRoundTripMs = -1;
		Keys m_keys;
		std::optional<uint8_t> m_audibleQueue;
		// The chain (or CLEAR) the page asked for while keys were on their way, sent after them.
		deskCore::Latest<deskCore::ChainRequest> m_chain;
		double m_switchReportedMs = -1;
		std::optional<uint8_t> m_lastKit;
		std::optional<uint8_t> m_lastPattern;
		Telemetry m_telemetry;
		deskCore::SongRowHeard m_songRow;	// 0.3.5: the row heard (the RAM byte runs ahead by about two steps)
		int m_songRowHeard = -1;
		deskCore::SongRowHeard m_songRepeats;	// MD-147: the row's passes still to come, read as the row
		int m_songRepeatsHeard = -1;
		std::array<bool, 16> m_mutes{};
		// The page's keyboard: per track, the note sounding (one at a time; a later key replaces it). The kit
		// value a key holds is the working copy's held layer (m_working.held).
		struct SoundingNote { uint8_t channel = 0; uint8_t note = 0; int pitch = 0; };
		std::array<std::optional<SoundingNote>, 16> m_notes{};
		KnobRecorder m_knobs;
		// B-134: the kit the machine's memory holds now (its last published region, decoded), for the knob recorder. The
		// working copy's image is dropped at a desk reset or when another kit plays and taken again only from a region
		// that changed, and the device publishes the region only when memory changes: the recorder waited for memory
		// that never came, no turn, no lock (md-seq-live-lock alone, fresh start: one region before the page's reset).
		// Kept over a desk reset: it is the machine's memory, and a new device publishes its own.
		std::optional<elektronData::MdKit> m_memoryKit;
		double m_knobKeysMs = -1e9;	// B-134: when the knob recorder's last turns were seen on their way
		std::optional<RecLock> m_recLock;
		// liveErase: the track whose TRIG key is held with EXIT/NO, or (param, MD-140) whose knob switch is: the knob
		// of kit parameter 0-23 on its page (SYNTHESIS / EFFECTS / ROUTING), which the machine shows before the keys go
		// down (held false until then).
		struct Erase
		{
			uint8_t track = 0;
			std::optional<uint8_t> param;
			bool held = false;
			bool gaveUp = false;	// the knob page never showed: nothing held until the page asks for something else
			int pagePresses = 0;
			double lastMs = -1e9;
		};
		std::optional<Erase> m_erasing;
		double m_recordedMs = -1e18;		// B-101: telemetry last said live recording
		bool m_recordedSinceRec = false;	// B-127: live recording ran since REC was last pressed twice (sendChain)
		double m_recordWaitMs = -1;			// B-101: REC pressed, waiting for the pattern's push (pumpRecordStart)
		double m_eraseSeenMs = 0;			// liveErase: the page's last word that the key is still held
		static constexpr int g_eraseMaxPagePresses = 4;
		double m_recordPollMs = -1e9;
		deskCore::Sequencer<Act> m_sequence;
		TweakTurns m_tweak;
		// Control All without the panel (HW MIDI, no telemetry): the latest value per (track, index),
		// sent as at most one CC each per coalescing tick, within the wire's budget.
		std::map<std::pair<uint8_t, uint8_t>, uint8_t> m_coalesced;
		// B-145: plain values (an undo) that came while the machine's Control All gesture was on its way: sent when it ends
		std::map<std::pair<uint8_t, uint8_t>, uint8_t> m_afterTweak;
		double m_coalescedMs = -1e9;
	};
}
