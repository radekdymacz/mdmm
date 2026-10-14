#pragma once

#include "mdNativeChain.h"
#include "mdNativeCorpus.h"

namespace mdNative::proof
{
	constexpr uint32_t chainMagic = 0x31434e4d; // MNC1
	struct ChainCase
	{
		TrackControls controls{};
		TrackState before, after;
		Block input{}, output{};
	};
	inline void writeChainCase(std::ostream &_out, const ChainCase &_c)
	{
		for (const auto v : _c.controls)
			writeWord(_out, uint32_t(v));
		for (const auto *state : {&_c.before, &_c.after})
			for (const auto v : state->words)
				writeWord(_out, uint32_t(v) & 0xffffff);
		for (const auto *block : {&_c.input, &_c.output})
			for (const auto v : *block)
				writeWord(_out, uint32_t(v) & 0xffffff);
	}
	inline ChainCase readChainCase(std::istream &_in)
	{
		ChainCase c;
		for (auto &v : c.controls)
		{
			v = signedWord(readWord(_in));
			if (v < 0 || v > 0x3fff)
				throw std::runtime_error("invalid raw chain control");
		}
		for (auto *state : {&c.before, &c.after})
			for (auto &v : state->words)
				v = signedWord(readWord(_in));
		for (auto *block : {&c.input, &c.output})
			for (auto &v : *block)
				v = signedWord(readWord(_in));
		return c;
	}
	inline bool sameTrack(const TrackState &_a, const TrackState &_b)
	{
		for (size_t i = 0; i < _a.words.size(); ++i)
			if ((uint32_t(_a.words[i]) & 0xffffff) != (uint32_t(_b.words[i]) & 0xffffff))
				return false;
		return true;
	}
} // namespace mdNative::proof
