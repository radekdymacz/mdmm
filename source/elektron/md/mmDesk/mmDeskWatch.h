#pragma once

#include "mmDeskTelemetry.h"

#include "deskCore/deskNotes.h"

#include "elektronData/mmPattern.h"

#include <algorithm>
#include <cstdint>
#include <map>
#include <optional>
#include <utility>
#include <vector>

namespace mmDesk
{
	// Small state values of the Monomachine adapter, each with a pure step: (state, what happened, now) ->
	// (next state, what to do). The adapter keeps one of each and does the effects (review finding 9).

	// ---- playing, from the step byte ----
	// In the plug-in the RAM running flag (0x26b46e) can stay 0 while the sequencer plays, so "playing" is the
	// flag or the step advancing: two single steps forward (or a wrap to 0) in a row, each within three step
	// times at the tempo (a 3/4X pattern included). A stop that resets the step to 0 is one move, so it never
	// reads as playing.
	struct StepWatch
	{
		int rawStep = -1;
		int moves = 0;
		double movedMs = -1e9;
	};

	struct StepSeen
	{
		StepWatch next;
		bool playing = false;
		bool stepped = false;	// the step byte changed
	};

	inline StepSeen watchStep(StepWatch _s, const Telemetry& _t, const double _now)
	{
		StepSeen r;
		r.stepped = _t.valid && _t.step != _s.rawStep;
		const double stepMs = _t.tempo > 0 ? 360000.0 / _t.tempo : 250.0;
		const double window = std::max(250.0, 3.0 * stepMs);
		if(r.stepped)
		{
			const bool forward = _s.rawStep >= 0 && (_t.step == _s.rawStep + 1 || (_t.step == 0 && _s.rawStep > 0));
			_s.moves = forward && _now - _s.movedMs < window ? std::min(_s.moves + 1, 2) : (forward ? 1 : 0);
			_s.movedMs = _now;
			_s.rawStep = _t.step;
		}
		const bool stepping = _s.moves >= 2 && _now - _s.movedMs < window;
		if(!stepping && _now - _s.movedMs >= window)
			_s.moves = 0;
		r.playing = _t.valid && (_t.running || stepping);
		r.next = _s;
		return r;
	}

	// ---- B-053: the kit a pattern pick or a pattern dump makes the machine play ----
	// Measured on the OS 1.32B (mmDeskFirmwareTest kitlink): a pick of a pattern in banks A-D, LOAD PATTERN (0x57) or
	// the panel's BANK + TRIG, loads the kit it links (stopped: at once; playing: at the switch); a pick in banks E-H
	// loads no kit: the kit that played goes on playing (B-046 is the same rule). So only an A-D pick can lose the
	// unsaved edits of the kit that plays.
	inline bool pickLoadsKit(const int _pattern) { return _pattern >= 0 && _pattern < 64; }

	// A dump of the pattern that plays makes the firmware load the kit the dump links (B-027), so a dump of an E-H
	// pattern that links another kit than the one that plays (it was picked with no kit load) would load that kit and
	// lose what plays. The dump links the kit that plays instead (as LOAD KIT and SAVE KIT relink it), unless the
	// edit itself changed the link. The kit to write, or nothing when the dump stays as it is.
	inline std::optional<uint8_t> dumpKeepsKit(const bool _patternPlays, const int _kitPlays, const uint8_t _linkBefore, const uint8_t _linkAfter)
	{
		if(!_patternPlays || _kitPlays < 0 || _kitPlays > 127 || _linkAfter != _linkBefore || _linkAfter == _kitPlays)
			return std::nullopt;
		return static_cast<uint8_t>(_kitPlays);
	}

	// ---- B-060: a transpose edited while the pattern plays ----
	// Measured on the OS 1.32B (mmDeskFirmwareTest transpose): a dump of the pattern that plays stores its transposes
	// (a synth or MIDI track's TRACK, SCALE and KEY, the pattern's PAT), but the sequencer goes on with the ones it took
	// at PLAY until the next start. No SysEx, CC or LOAD PATTERN of the slot applies them, nor the TRANSPOSE screen
	// opened alone. Turning its TRACK knob (DATA ENTRY A) does, at once, for the track number in focus: synth track n
	// and MIDI track n, with PAT, SCALE and KEY, as the pattern holds them. So one step there and back applies what the
	// dump stored and stores nothing new.

	// The track numbers (bit n: synth track n and MIDI track n) whose transposes _after moves against _before; a
	// changed PAT moves all six.
	inline uint8_t transposesMoved(const elektronData::MmPattern& _before, const elektronData::MmPattern& _after)
	{
		if(_before.patternTranspose != _after.patternTranspose)
			return 0x3f;
		uint8_t moved = 0;
		for(size_t n = 0; n < 6; ++n)
			for(const auto* x : {&_before.transpose, &_before.midiTranspose})
			{
				const auto& y = x == &_before.transpose ? _after.transpose : _after.midiTranspose;
				if(x->track[n] != y.track[n] || x->scale[n] != y.scale[n] || x->key[n] != y.key[n])
					moved = static_cast<uint8_t>(moved | (1 << n));
			}
		return moved;
	}

	// The keys that make the machine play the transposes of _p for the track numbers in _tracks: TRANSPOSE (FUNCTION +
	// BANK B), for each TRACK n and the knob one step there and back (down first when a value is above zero, so neither
	// end of the range clamps it), TRACK _focus again when it is known (0-5; the TRACK keys move the focus), EXIT.
	inline std::vector<Key> applyTransposeKeys(const uint8_t _tracks, const elektronData::MmPattern& _p, const int _focus)
	{
		std::vector<Key> keys{Key::Transpose};
		for(int n = 0; n < 6; ++n)
		{
			if(!((_tracks >> n) & 1))
				continue;
			keys.push_back(static_cast<Key>(static_cast<int>(Key::Track1) + n));
			const bool down = std::max(_p.transpose.track[static_cast<size_t>(n)], _p.midiTranspose.track[static_cast<size_t>(n)]) > 0;
			keys.push_back(down ? Key::KnobDown : Key::KnobUp);
			keys.push_back(down ? Key::KnobUp : Key::KnobDown);
		}
		if(keys.size() == 1)
			return {};
		if(_focus >= 0 && _focus < 6)
			keys.push_back(static_cast<Key>(static_cast<int>(Key::Track1) + _focus));
		keys.push_back(Key::Exit);
		return keys;
	}

	// ---- RECORD: the current pattern read back while the machine records ----
	// The machine writes the current pattern while it records (MM-P4): read it back this often while it
	// records, and once when it stops, so what the keyboard or the machine's TRIG keys recorded shows.
	struct RecordReads
	{
		int last = -1;			// the recording mode last seen (Telemetry::recording)
		double readMs = -1e9;	// the last read-back
	};

	struct RecordStep
	{
		RecordReads next;
		bool read = false;		// ask for the current pattern now
		bool changed = false;	// the recording mode changed since the last step
	};

	inline RecordStep watchRecord(RecordReads _s, const int _recording, const bool _patternKnown, const double _now, const double _everyMs)
	{
		RecordStep r;
		r.changed = _recording != _s.last;
		if(_recording >= 0 && _patternKnown && ((_recording >= 1 && _now - _s.readMs > _everyMs) || (_s.last >= 1 && _recording == 0)))
		{
			r.read = true;
			_s.readMs = _now;
		}
		_s.last = _recording;
		r.next = _s;
		return r;
	}

	// ---- the transport telemetry message ----
	// The playhead, at most every _minMs, and the recording mode when it changes.
	struct TelemetryOut
	{
		int step = -1;
		bool playing = false;
		double sentMs = -1e9;
	};

	// The next state when a telemetry message is due now; nullopt: nothing to publish.
	inline std::optional<TelemetryOut> telemetryDue(const TelemetryOut& _s, const int _step, const bool _playing, const bool _recordChanged,
		const double _now, const double _minMs)
	{
		if(!(_recordChanged || ((_step != _s.step || _playing != _s.playing) && _now - _s.sentMs > _minMs)))
			return std::nullopt;
		return TelemetryOut{_step, _playing, _now};
	}

	// ---- the keyboard's sounding notes ----
	// (track, pitch) -> the MIDI channel and note its note on went to: the note off goes there, whatever the
	// global says meanwhile. A second note on of the same pitch ends the first.
	struct NoteSend
	{
		uint8_t channel = 0;
		uint8_t note = 0;
		uint8_t velocity = 0;	// 0: note off
	};

	using SoundingNotes = std::map<std::pair<uint8_t, int>, std::pair<uint8_t, uint8_t>>;

	struct NotesStep
	{
		SoundingNotes next;
		std::vector<NoteSend> sends;	// in order
	};

	inline NotesStep pressNote(SoundingNotes _s, const uint8_t _track, const int _pitch, const uint8_t _channel, const uint8_t _note,
		const uint8_t _velocity)
	{
		NotesStep r;
		const std::pair<uint8_t, int> key{_track, _pitch};
		if(const auto it = _s.find(key); it != _s.end())
			r.sends.push_back({it->second.first, it->second.second, 0});
		r.sends.push_back({_channel, _note, _velocity});
		_s[key] = {_channel, _note};
		r.next = std::move(_s);
		return r;
	}

	inline NotesStep releaseNotes(SoundingNotes _s, const deskCore::NoteOff& _off)
	{
		NotesStep r;
		for(auto it = _s.begin(); it != _s.end();)
		{
			if(it->first.first != _off.track || !_off.releases(it->first.second))
			{
				++it;
				continue;
			}
			r.sends.push_back({it->second.first, it->second.second, 0});
			it = _s.erase(it);
		}
		r.next = std::move(_s);
		return r;
	}
}
