#pragma once

#include "mdNativeCorpus.h"
#include "mdNativeEngine.h"

namespace mdNative::proof
{
	constexpr uint32_t engineProfileMagic = 0x31454e4d;
	inline void writeProfile(std::ostream &_out, const EngineProfile &_p)
	{
		writeWord(_out, engineProfileMagic);
		for (const auto v : _p.tables)
			writeWord(_out, uint32_t(v) & 0xffffff);
		for (const auto v : _p.delay)
			writeWord(_out, uint32_t(v) & 0xffffff);
		const auto &r = _p.reverb;
		for (const auto v :
			 {r.highpass, r.lowpass, r.decay, r.damping, r.level, r.gateBlocks, r.delaySend, r.predelayWords})
			writeWord(_out, uint32_t(v) & 0xffffff);
		for (const auto v : _p.eq.words)
			writeWord(_out, uint32_t(v) & 0xffffff);
		for (const auto v : _p.compressor.words)
			writeWord(_out, uint32_t(v) & 0xffffff);
	}
	inline EngineProfile readProfile(std::istream &_in)
	{
		if (readWord(_in) != engineProfileMagic)
			throw std::runtime_error("unexpected native engine profile");
		EngineProfile p;
		p.tables.resize(trackTableSize);
		for (auto &v : p.tables)
			v = signedWord(readWord(_in));
		for (auto &v : p.delay)
			v = signedWord(readWord(_in));
		auto &r = p.reverb;
		for (auto *v :
			 {&r.highpass, &r.lowpass, &r.decay, &r.damping, &r.level, &r.gateBlocks, &r.delaySend, &r.predelayWords})
			*v = signedWord(readWord(_in));
		for (auto &v : p.eq.words)
			v = signedWord(readWord(_in));
		for (auto &v : p.compressor.words)
			v = signedWord(readWord(_in));
		if (r.decay < 0 || r.decay > 63 || r.damping < 0 || r.damping > 63 || r.predelayWords < 0 ||
			r.predelayWords >= 16384)
			throw std::runtime_error("invalid reverb table/ring index");
		if (p.delay[0] < 160 || p.delay[0] > 96859 || p.delay[1] < 1 || p.delay[1] > 32768)
			throw std::runtime_error("invalid delay timing");
		return p;
	}
	inline void writeStereoWav(std::ostream &_out, const std::vector<int32_t> &_interleaved)
	{
		const auto size = uint32_t(_interleaved.size() * 3);
		_out.write("RIFF", 4);
		writeWord(_out, 36 + size);
		_out.write("WAVEfmt ", 8);
		writeWord(_out, 16);
		writeWord(_out, 0x00020001);
		writeWord(_out, sampleRate);
		writeWord(_out, sampleRate * 6);
		writeWord(_out, 0x00180006);
		_out.write("data", 4);
		writeWord(_out, size);
		for (const auto sample : _interleaved)
		{
			const auto word = uint32_t(sample);
			const char bytes[]{char(word), char(word >> 8), char(word >> 16)};
			_out.write(bytes, 3);
		}
		if (!_out)
			throw std::runtime_error("could not write stereo WAV");
	}
} // namespace mdNative::proof
