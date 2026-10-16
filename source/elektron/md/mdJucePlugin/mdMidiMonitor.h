#pragma once

// 0.8 (WP3): the MIDI monitor core. What one plug-in instance did with MIDI, counted: by direction (in from the host or
// a port, in to the firmware, out from the machine, out to the host), by type (note, CC, program change, clock,
// transport, SysEx, other) and by channel 1-16, plus the drops the processor already counts. Pure: no JUCE, no lock.
//   - Monitor, the audio thread's: onEvent is two relaxed atomic adds (a port's thread may add too: fetch_add never
//     loses a count). No allocation, no lock, never waits. Readers (the message thread) take() a copy.
//   - LogPacer and logLine, the message thread's: a line `midi: in ... out ... dropped ...` at most every 10 s, and
//     only while the counts changed.
// The page gets the counts as the "midiStats" message (mdDeskSession.cpp midiStatsOf); the line goes to the start-up
// log (AudioPluginAudioProcessor::logMidiMonitor).

#include <array>
#include <atomic>
#include <cstdint>
#include <string>

namespace mdJucePlugin::midiMonitor
{
	enum class Direction : uint8_t
	{
		InHost,			// from the host's MIDI in or a physical port, as the processor takes it
		InFirmware,		// into the firmware's MIDI input (what the routing let through)
		OutMachine,		// out of the machine, before the routing
		OutHost			// into the host's MIDI out (what the routing let through)
	};
	constexpr size_t g_directions = 4;

	enum class Type : uint8_t
	{
		Note,			// note on, note off
		Cc,
		ProgramChange,
		Clock,			// timing clock
		Transport,		// start, continue, stop, song position
		SysEx,
		Other			// poly pressure, aftertouch, pitch bend, tune request, active sensing, reset, junk
	};
	constexpr size_t g_types = 7;
	constexpr size_t g_channels = 16;

	// The type of a message by its status byte; a message that carries SysEx bytes is SysEx whatever its first byte.
	inline Type typeOf(const uint8_t _status, const bool _hasSysex) noexcept
	{
		if(_hasSysex || _status == 0xf0)
			return Type::SysEx;
		if(_status < 0x80)
			return Type::Other;
		if(_status < 0xf0)
		{
			switch(_status & 0xf0)
			{
			case 0x80: case 0x90: return Type::Note;
			case 0xb0: return Type::Cc;
			case 0xc0: return Type::ProgramChange;
			default: return Type::Other;
			}
		}
		switch(_status)
		{
		case 0xf8: return Type::Clock;
		case 0xf2: case 0xfa: case 0xfb: case 0xfc: return Type::Transport;
		default: return Type::Other;
		}
	}

	// A channel message's channel 0-15, or -1 for the system messages and SysEx.
	inline int channelOf(const uint8_t _status, const bool _hasSysex) noexcept
	{
		return _hasSysex || _status < 0x80 || _status >= 0xf0 ? -1 : (_status & 0x0f);
	}

	inline const char* directionName(const Direction _d) noexcept
	{
		switch(_d)
		{
		case Direction::InHost: return "inHost";
		case Direction::InFirmware: return "inFirmware";
		case Direction::OutMachine: return "outMachine";
		case Direction::OutHost: return "outHost";
		}
		return "";
	}

	inline const char* typeName(const Type _t) noexcept
	{
		switch(_t)
		{
		case Type::Note: return "note";
		case Type::Cc: return "cc";
		case Type::ProgramChange: return "pc";
		case Type::Clock: return "clock";
		case Type::Transport: return "transport";
		case Type::SysEx: return "sysex";
		case Type::Other: return "other";
		}
		return "";
	}

	// The drops the instance already counts, read by the caller (they live in the processor, the external MIDI and the
	// machine's scheduler)
	struct Dropped
	{
		uint64_t scheduledOverflow = 0;		// md::Hardware: events the scheduled-MIDI ring could not take
		uint64_t externalIn = 0;			// pluginLib::ExternalMidi: HW MIDI in the editor's queue dropped
		uint64_t allocationFallback = 0;	// host messages that took the allocating path (SysEx, longer than 3 bytes)
		uint64_t total() const { return scheduledOverflow + externalIn + allocationFallback; }
	};

	// A copy of the counters at about one moment (they are read one by one).
	struct Counts
	{
		std::array<std::array<uint64_t, g_types>, g_directions> type{};
		std::array<std::array<uint64_t, g_channels>, g_directions> channel{};	// channel messages only
		Dropped dropped;

		uint64_t total(const Direction _d) const
		{
			uint64_t n = 0;
			for(const auto v : type[static_cast<size_t>(_d)])
				n += v;
			return n;
		}
		uint64_t count(const Direction _d, const Type _t) const { return type[static_cast<size_t>(_d)][static_cast<size_t>(_t)]; }
		// every counter summed: grows with any message or drop, so it changes exactly when something was counted
		uint64_t fingerprint() const
		{
			uint64_t n = dropped.total();
			for(size_t d = 0; d < g_directions; ++d)
				n += total(static_cast<Direction>(d));
			return n;
		}
	};

	// The audio thread's half. Writers: the audio thread (and, for a port's messages, the MIDI thread); readers: any.
	class Monitor
	{
	public:
		// One message. _status is the first byte (SMidiEvent::a); _hasSysex: the event carries SysEx bytes.
		void onEvent(const Direction _d, const uint8_t _status, const bool _hasSysex) noexcept
		{
			const auto d = static_cast<size_t>(_d);
			m_type[d][static_cast<size_t>(typeOf(_status, _hasSysex))].fetch_add(1, std::memory_order_relaxed);
			if(const auto c = channelOf(_status, _hasSysex); c >= 0)
				m_channel[d][static_cast<size_t>(c)].fetch_add(1, std::memory_order_relaxed);
		}

		Counts take() const noexcept
		{
			Counts c;
			for(size_t d = 0; d < g_directions; ++d)
			{
				for(size_t t = 0; t < g_types; ++t)
					c.type[d][t] = m_type[d][t].load(std::memory_order_relaxed);
				for(size_t ch = 0; ch < g_channels; ++ch)
					c.channel[d][ch] = m_channel[d][ch].load(std::memory_order_relaxed);
			}
			return c;
		}

	private:
		std::atomic<uint64_t> m_type[g_directions][g_types]{};
		std::atomic<uint64_t> m_channel[g_directions][g_channels]{};
	};

	// `midi: in host=12 fw=12 (note=8 cc=4) out machine=3 host=3 (clock=3) dropped sched=0 ext=0 alloc=1` : a direction's
	// kinds are listed when it counted any.
	inline std::string logLine(const Counts& _c)
	{
		const auto kinds = [&](const Direction _d)
		{
			std::string s;
			for(size_t t = 0; t < g_types; ++t)
				if(const auto n = _c.type[static_cast<size_t>(_d)][t])
					s += (s.empty() ? "" : " ") + std::string(typeName(static_cast<Type>(t))) + "=" + std::to_string(n);
			return s;
		};
		const auto part = [&](const char* _name, const Direction _d)
		{
			auto s = std::string(_name) + "=" + std::to_string(_c.total(_d));
			if(const auto k = kinds(_d); !k.empty())
				s += " (" + k + ")";
			return s;
		};
		return "midi: in " + part("host", Direction::InHost) + " " + part("fw", Direction::InFirmware)
			+ " out " + part("machine", Direction::OutMachine) + " " + part("host", Direction::OutHost)
			+ " dropped sched=" + std::to_string(_c.dropped.scheduledOverflow) + " ext=" + std::to_string(_c.dropped.externalIn)
			+ " alloc=" + std::to_string(_c.dropped.allocationFallback);
	}

	// When to write the line: at most every g_logEveryMs, and only if something was counted since the last line.
	class LogPacer
	{
	public:
		static constexpr double g_logEveryMs = 10000.0;
		bool due(const double _nowMs, const uint64_t _fingerprint)
		{
			if(_fingerprint == m_fingerprint)
				return false;
			if(m_wrote && _nowMs - m_lastMs < g_logEveryMs)
				return false;
			m_wrote = true;
			m_lastMs = _nowMs;
			m_fingerprint = _fingerprint;
			return true;
		}
	private:
		bool m_wrote = false;
		double m_lastMs = 0;
		uint64_t m_fingerprint = 0;
	};
}
