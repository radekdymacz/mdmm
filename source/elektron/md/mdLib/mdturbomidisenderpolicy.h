#pragma once

#include <cstdint>

namespace md::turboMidi::senderPolicy
{
	// Implementation profile, not an independent specification of TurboMIDI.
	// Capability decoding is low | (high << 7). Existing bit -> code mapping:
	//   bit:         0  1  2     3  4  5     6  7
	//   code:        1  2  3     4  5  6     7  8
	//   multiplier:  1  2  3.33  4  5  6.66  8  10
	// Original MD 1.63 / MM 1.32b firmware confirms the manual: bit n means
	// code n+2 (bit 0 = 2x). This retained decoder is off by one. It remains
	// unchanged here to preserve sender behavior; see doc/turbomidi.md and
	// turboMidiFirmwareTest.cpp for independent firmware vectors. Bit+1 also
	// appears in MCL's startTurboMidi() at commit 312e9b44dd988cfa9597f156decd81b7cc3e24c1:
	// https://github.com/jmamma/MCL/blob/312e9b44dd988cfa9597f156decd81b7cc3e24c1/avr/cores/megacommand/Midi/TurboMidi.cpp
	// For example, report 01 00 01 00 falls back here, while original firmware
	// requests codes 2/2. turboMidiTest.cpp characterizes the retained mismatch.
	//
	// All timers below use emulated time, paused while ingress is blocked:
	// - response budget: >1s per wait phase, starting at final byte ADMISSION;
	//   partial bytes do not restart it. This does not implement the manual's
	//   per-byte deadlines (master >=30ms; slave 15..25ms).
	// - outgoing Active Sensing: every 150ms while using a Turbo pacing rate.
	//   Incoming realtime bytes are ignored; no peer keepalive-loss timer exists.
	// - fallback after a link test: stop Active Sensing, wait 350ms for the peer's
	//   documented >300ms keepalive-loss reset. Earlier failures immediately
	//   start payload at 1x.
	// - after 0x17: allow 10ms for MD 1.63's UART reset before admitting payload.
	//   This is a firmware compatibility delay, not a protocol requirement.
	inline constexpr uint32_t ResponseTimeoutSeconds = 1;
	inline constexpr uint32_t PeerResetMilliseconds = 350;
	inline constexpr uint32_t ActiveSenseMilliseconds = 150;

	inline uint16_t decodeCapabilityMask(uint8_t _low, uint8_t _high)
	{
		return static_cast<uint16_t>(_low) | (static_cast<uint16_t>(_high) << 7);
	}

	struct NegotiatedSpeeds
	{
		uint8_t firstTest; // speed1 in the negotiation message
		uint8_t transfer;  // speed2 in the negotiation message
		bool turboAvailable() const { return firstTest > 1 && transfer > 1; }
	};

	inline uint8_t highestSpeedCode(const uint16_t _mask)
	{
		for(int bit = 7; bit >= 0; --bit)
			if(_mask & (uint16_t{1} << bit))
				return static_cast<uint8_t>(bit + 1);
		return 1;
	}

	inline NegotiatedSpeeds selectSpeeds(const uint16_t _supported, const uint16_t _certified)
	{
		// Gearmulator policy: bit n maps to code n+1, restricted to codes 1..8.
		// If the highest supported speed is uncertified, use the next supported
		// speed for transfer (without another certification check). Keep this
		// mapping/policy distinct from a claim of conformance to the manual.
		const uint16_t common = _supported & 0x00ffu;
		const auto first = highestSpeedCode(common);
		const uint16_t firstBit = uint16_t{1} << (first - 1);
		const auto transfer = (_certified & firstBit) ? first
			: highestSpeedCode(common & (firstBit - 1u));
		return {first, transfer};
	}
}
