#pragma once

#include <array>
#include <cstdint>
#include <initializer_list>

namespace md::turboMidi
{
	// Wire vocabulary: Machinedrum manual, Appendix C, TurboMIDI protocol.
	// Messages are Header, Command, optional data, F7.
	inline constexpr std::array<uint8_t, 6> Header{0xf0, 0x00, 0x20, 0x3c, 0x00, 0x00};
	enum class Command : uint8_t
	{
		SpeedRequest = 0x10,         // no data
		SpeedReport = 0x11,          // supported low/high, certified low/high (7-bit fields)
		SpeedNegotiation = 0x12,     // speed1, speed2
		SpeedAcknowledgement = 0x13, // no data
		FirstTest = 0x14,            // FirstTestPattern
		FirstTestResult = 0x15,      // echoed FirstTestPattern
		SecondTest = 0x16,           // no data
		SecondTestResult = 0x17      // no data
	};
	inline constexpr uint32_t FirstTestPaddingBytes = 16;
	inline constexpr std::initializer_list<uint8_t> FirstTestPattern
		{0x55, 0x55, 0x55, 0x55, 0x00, 0x00, 0x00, 0x00};

	struct Speed
	{
		uint32_t bytesPerSecond;
		const char* label;
	};
	// Code 1 is standard MIDI; code 0 is an unused alias for display purposes.
	// Retain the sender's integer rates for the fractional multipliers.
	inline constexpr Speed Speeds[] = {
		{3125, "1"}, {3125, "1"}, {6250, "2"}, {10406, "3.33"},
		{12500, "4"}, {15625, "5"}, {20812, "6.66"}, {25000, "8"}, {31250, "10"}
	};

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
		// Existing sender policy: bit n maps to code n+1, restricted to codes 1..8.
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
