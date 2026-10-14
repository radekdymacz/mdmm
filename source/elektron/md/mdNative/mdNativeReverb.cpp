#include "mdNativeReverb.h"
#include "mdNativeFixed.h"

#include <cmath>

namespace mdNative
{
	ReverbState::ReverbState()
	{
		constexpr std::array<size_t, 5> diffLengths{47, 67, 101, 149, 223};
		constexpr std::array<size_t, 6> tankLengths{2695, 2479, 1843, 1653, 2048, 1024};
		for (size_t i = 0; i < diffusion.size(); ++i)
			diffusion[i].data.resize(diffLengths[i]);
		for (size_t i = 0; i < tank.size(); ++i)
		{
			tank[i].data.resize(tankLengths[i]);
			tank[i].read = 32;
		}
	}

	void renderReverb(const ReverbControls &_p, ReverbState &_s, const TrackTables &_t, const StereoBlock &_input,
					  const StereoBlock &_delay, StereoBlock &_output)
	{
		using namespace fixed;
		Block mono;
		auto read = (_s.predelayWrite + 16384 - size_t(_p.predelayWords)) & 16383;
		for (size_t i = 0; i < blockSize; ++i)
		{
			_s.predelay[_s.predelayWrite] = word(pair(_input.left[i]) + product(_p.delaySend, _delay.left[i]));
			_s.predelay[(_s.predelayWrite + 1) & 16383] =
				word(pair(_input.right[i]) + product(_p.delaySend, _delay.right[i]));
			_s.predelayWrite = (_s.predelayWrite + 2) & 16383;
		}
		for (auto &sample : mono)
		{
			sample = word(product(0x400000, _s.predelay[read]) + product(0x400000, _s.predelay[(read + 1) & 16383]));
			read = (read + 2) & 16383;
		}
		const auto diffusionGain = word(product(_p.decay, 0x66666) * 131072 + pair(0x59999a));
		for (size_t l = 0; l < _s.diffusion.size(); ++l)
		{
			auto &line = _s.diffusion[l];
			const auto gain = word(product(_t.words[0x398d + l], diffusionGain));
			auto delayed = line.data[line.write];
			auto carry = pair(line.previous);
			for (auto &sample : mono)
			{
				line.data[line.write] = word(carry);
				line.write = (line.write + 1) % line.data.size();
				const auto result = word(pair(delayed) - product(gain, word(carry)));
				delayed = line.data[line.write];
				carry = pair(sample) + product(gain, delayed);
				sample = result;
			}
			line.previous = word(carry);
		}
		std::array<Block, 6> taps;
		const auto modulation = floorDivide(pair(_t.words[0x8000 + _s.modulation]), 1048576);
		_s.modulation = (_s.modulation + 32) & 32767;
		const auto offset = word(modulation);
		const auto fraction = int32_t((uint64_t(modulation) & 0xffffff) / 2);
		for (size_t l = 0; l < _s.tank.size(); ++l)
		{
			auto &line = _s.tank[l];
			const auto c = _t.words[0x3b40 + _p.damping * 6 + std::min(l, size_t(4))];
			auto accumulator = line.filter;
			if (l < 4)
			{
				for (auto &sample : taps[l])
				{
					sample = word(accumulator);
					accumulator += product(c, line.previous) - product(c, sample);
					line.previous = line.data[line.read];
					line.read = (line.read + 1) % line.data.size();
				}
				// This stage retains the high word only at block boundaries.
				line.filter = pair(signedWord(uint32_t(uint64_t(accumulator) >> 24)));
			}
			else
			{
				const auto first = word(product(c, 0x7fffff - fraction));
				const auto second = word(product(c, fraction));
				auto pos =
					size_t((int64_t(line.read) + offset + int64_t(line.data.size())) % int64_t(line.data.size()));
				for (auto &sample : taps[l])
				{
					sample = word(accumulator);
					accumulator += product(first, line.data[pos]);
					pos = (pos + 1) % line.data.size();
					accumulator += product(second, line.data[pos]) - product(c, sample);
				}
				line.read = (line.read + blockSize) % line.data.size();
				line.filter = pair(signedWord(uint32_t(uint64_t(accumulator) >> 24)), uint32_t(accumulator));
			}
		}
		const auto *c = _t.words + 0x39c0 + _p.decay * 6;
		for (size_t i = 0; i < blockSize; ++i)
		{
			const auto common = product(c[2], taps[2][i]) - product(c[5], taps[5][i]) - product(c[3], taps[3][i]);
			_output.left[i] = word(2 * (common + product(c[1], taps[1][i])));
			_output.right[i] = word(2 * (common + product(c[0], taps[0][i])));
			const std::array<int32_t, 6> feedback{word(-product(c[4], taps[4][i]) + product(c[5], taps[5][i])),
												  word(product(c[0], taps[0][i]) + product(c[3], taps[3][i])),
												  word(product(c[0], taps[0][i]) - product(c[3], taps[3][i])),
												  word(-product(c[4], taps[4][i]) - product(c[5], taps[5][i])),
												  word(product(c[1], taps[1][i]) + product(c[2], taps[2][i])),
												  word(product(c[1], taps[1][i]) - product(c[2], taps[2][i]))};
			for (size_t l = 0; l < _s.tank.size(); ++l)
			{
				auto &line = _s.tank[l];
				line.data[line.write] = word(pair(feedback[l]) + product(mono[i], 0x155556));
				line.write = (line.write + 1) % line.data.size();
			}
		}
		int64_t envelope = pair(_s.envelope), peak = 0;
		for (const auto sample : mono)
		{
			envelope = product(word(envelope), 0x7fef9e) + product(std::abs(sample), 0x1062);
			peak = std::max(peak, envelope);
		}
		_s.envelope = word(envelope);
		const auto difference = peak - pair(_s.peak);
		_s.peak = word(peak);
		_s.gateAge = _s.gateAge >= _p.gateBlocks ? 0x7ffff0 : _s.gateAge + 1;
		bool closing = false;
		if (_p.gateBlocks != 0x7fffff)
		{
			if (difference >= pair(168))
				_s.gateAge = 0;
			else
				closing = _s.gateAge >= _p.gateBlocks;
		}
		Block gain;
		if (closing)
		{
			auto level = _s.gate;
			for (size_t i = 0; i < blockSize; i += 2)
			{
				gain[i] = level;
				gain[i + 1] = word(product(level, 0x7f5bc0));
				level = word(product(level, 0x7eb852));
			}
			_s.gate = level;
		}
		else
		{
			for (size_t i = 0; i < blockSize; ++i)
				gain[i] = word(pair(_s.gate) + pair(int32_t(i) * 0x147ae));
			_s.gate = word(pair(_s.gate) + pair(32 * 0x147ae));
		}
		for (unsigned ch = 0; ch < 2; ++ch)
		{
			auto &samples = ch ? _output.right : _output.left;
			auto high = _s.high[ch], low = _s.low[ch];
			auto previous = _s.previousInput[ch];
			for (size_t i = 0; i < blockSize; ++i)
			{
				const auto input = word(product(samples[i], gain[i]));
				const auto highOutput = word(high), lowOutput = word(low);
				high += product(input - previous, 0x400000) - product(word(high), _p.highpass);
				previous = input;
				low += product(_p.lowpass, highOutput) - product(_p.lowpass, lowOutput);
				samples[i] = word(product(lowOutput, _p.level) * 16);
			}
			_s.high[ch] = pair(signedWord(uint32_t(uint64_t(high) >> 24)), uint32_t(high));
			_s.low[ch] = pair(signedWord(uint32_t(uint64_t(low) >> 24)), uint32_t(low));
			_s.previousInput[ch] = previous;
		}
	}
} // namespace mdNative
