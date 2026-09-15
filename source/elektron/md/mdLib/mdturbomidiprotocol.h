#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <initializer_list>

namespace md::turboMidi
{
	// Start with doc/turbomidi.md for a complete worked exchange and evidence limits.
	// Initiator/responder wire vocabulary; payload transport (e.g. SDS) is separate.
	// Source: Machinedrum OS 1.63 manual, Appendix C, printed C-4 through C-6:
	// https://www.elektron.se/wp-content/uploads/2024/09/machinedrum_manual_OS1.63.pdf
	// Frames are Header, Command, data, F7. Lengths below include the whole frame.
	// I = initiator (host); R = responder (instrument). MIDI realtime bytes can
	// interleave with SysEx and do not contribute to its length.
	//
	// Read mdturbomidisenderpolicy.h for Gearmulator choices and discrepancies;
	// read TurboMidiTransfer::serviceNegotiation() for the current host sequence.
	// These definitions do not provide a physical UART endpoint implementation.
	inline constexpr std::array<uint8_t, 6> Header{0xf0, 0x00, 0x20, 0x3c, 0x00, 0x00};
	enum class Command : uint8_t
	{
		SpeedRequest = 0x10,         // I -> R, 8 bytes
		SpeedReport = 0x11,          // R -> I, 12 bytes: supported lo/hi, certified lo/hi
		SpeedNegotiation = 0x12,     // I -> R, 10 bytes: speed1, speed2
		SpeedAcknowledgement = 0x13, // R -> I, 8 bytes
		FirstTest = 0x14,            // I -> R, 16 bytes: FirstTestPattern
		FirstTestResult = 0x15,      // R -> I, 16 bytes: echoed FirstTestPattern
		SecondTest = 0x16,           // I -> R, 8 bytes
		SecondTestResult = 0x17      // R -> I, 8 bytes
	};
	inline constexpr size_t CommandOffset = Header.size();
	inline constexpr size_t DataOffset = CommandOffset + 1;
	inline constexpr size_t EnvelopeBytes = DataOffset + 1; // includes F7
	inline constexpr size_t SpeedReportBytes = EnvelopeBytes + 4;
	inline constexpr uint32_t FirstTestPaddingBytes = 16;
	inline constexpr std::initializer_list<uint8_t> FirstTestPattern
		{0x55, 0x55, 0x55, 0x55, 0x00, 0x00, 0x00, 0x00};

	struct Speed
	{
		uint32_t bytesPerSecond;
		const char* label;
	};
	// Code 1 is standard MIDI; code 0 is an unused alias for display purposes.
	// MIDI uses ten serial bits per byte (8-N-1): standard MIDI is 31,250 bit/s.
	// These are host admission rates in bytes/s, NOT UART register settings.
	// Retain the sender's integer rounding for the fractional multipliers.
	inline constexpr Speed Speeds[] = {
		{3125, "1"}, {3125, "1"}, {6250, "2"}, {10406, "3.33"},
		{12500, "4"}, {15625, "5"}, {20812, "6.66"}, {25000, "8"}, {31250, "10"}
	};
}
