#pragma once

// Private, generated proof fixtures. This format has no host-endian or struct-padding dependencies.
#include "mdNative.h"

#include <istream>
#include <ostream>
#include <stdexcept>
#include <vector>

namespace mdNative::proof
{
	constexpr uint32_t magic = 0x31534e4d; // MNS1
	constexpr uint32_t waveSize = 32768;
	constexpr uint32_t sampleRate = 44100;
	constexpr uint32_t stressCases = 16384;
	constexpr uint32_t demoNotes = 8;
	constexpr uint32_t demoBlocksPerNote = sampleRate / blockSize;
	constexpr uint32_t corpusCases = stressCases + demoNotes * demoBlocksPerNote;

	inline int32_t signedWord(const uint32_t _word)
	{
		return static_cast<int32_t>(_word & 0x7fffff) - static_cast<int32_t>(_word & 0x800000);
	}
	inline void writeWord(std::ostream &_out, const uint32_t _word)
	{
		const char bytes[]{char(_word), char(_word >> 8), char(_word >> 16), char(_word >> 24)};
		_out.write(bytes, 4);
		if (!_out)
			throw std::runtime_error("could not write corpus");
	}
	inline uint32_t readWord(std::istream &_in)
	{
		unsigned char bytes[4];
		if (!_in.read(reinterpret_cast<char *>(bytes), 4))
			throw std::runtime_error("truncated corpus");
		return uint32_t(bytes[0]) | (uint32_t(bytes[1]) << 8) | (uint32_t(bytes[2]) << 16) | (uint32_t(bytes[3]) << 24);
	}
	inline void writeState(std::ostream &_out, const SineState &_state)
	{
		writeWord(_out, uint32_t(_state.phase >> 24));
		writeWord(_out, uint32_t(_state.phase & 0xffffff));
		writeWord(_out, uint32_t(_state.gain >> 24));
		writeWord(_out, uint32_t(_state.gain & 0xffffff));
		writeWord(_out, uint32_t(_state.ramp) & 0xffffff);
	}
	inline SineState readState(std::istream &_in)
	{
		SineState state;
		state.phase = uint64_t(readWord(_in)) << 24;
		state.phase |= readWord(_in);
		state.gain = uint64_t(readWord(_in)) << 24;
		state.gain |= readWord(_in);
		state.ramp = signedWord(readWord(_in));
		return state;
	}
	inline bool sameState(const SineState &_a, const SineState &_b)
	{
		return _a.phase == _b.phase && _a.gain == _b.gain && _a.ramp == _b.ramp;
	}
	inline uint64_t hashWord(uint64_t _hash, const uint32_t _word)
	{
		for (unsigned shift = 0; shift < 32; shift += 8)
		{
			_hash ^= (_word >> shift) & 0xff;
			_hash *= 1099511628211ull;
		}
		return _hash;
	}

	// Mono 24-bit PCM at the proof sample rate; callers choose which signal-chain stage to capture.
	inline void writeWav(std::ostream &_out, const std::vector<int32_t> &_samples)
	{
		const auto size = static_cast<uint32_t>(_samples.size() * 3);
		_out.write("RIFF", 4);
		writeWord(_out, 36 + size);
		_out.write("WAVEfmt ", 8);
		writeWord(_out, 16);
		writeWord(_out, 0x00010001);
		writeWord(_out, sampleRate);
		writeWord(_out, sampleRate * 3);
		writeWord(_out, 0x00180003);
		_out.write("data", 4);
		writeWord(_out, size);
		for (const auto sample : _samples)
		{
			const auto word = static_cast<uint32_t>(sample);
			const char bytes[]{char(word), char(word >> 8), char(word >> 16)};
			_out.write(bytes, 3);
		}
		if (!_out)
			throw std::runtime_error("could not write WAV");
	}
} // namespace mdNative::proof
