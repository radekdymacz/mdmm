#include "mdNativeCompressor.h"
#include "mdNativeFixed.h"

namespace mdNative
{
	void renderCompressor(const CompressorControls &_p, CompressorState &_s, const WideStereoBlock &_input,
						  StereoBlock &_output)
	{
		using namespace fixed;
		const auto &c = _p.words;
		StereoBlock detector;
		std::array<int64_t, 2> low{pair(_s.low[0]), pair(_s.low[1])};
		std::array<int64_t, 2> high{pair(_s.high[0]), pair(_s.high[1])};
		for (size_t i = 0; i < blockSize; ++i)
		{
			for (unsigned ch = 0; ch < 2; ++ch)
			{
				_s.lookahead[_s.write][ch] = _input[ch][i];
				const auto input = word(low[ch]);
				low[ch] +=
					product(0x4ccccd, signedWord(uint32_t(uint64_t(_input[ch][i]) >> 24))) - product(0x4ccccd, input);
				high[ch] += product(input - _s.previousInput[ch], 0x400000) - product(c[3], word(high[ch]));
				_s.previousInput[ch] = input;
				(ch ? detector.right : detector.left)[i] = word(high[ch]);
			}
			_s.write = (_s.write + 1) % _s.lookahead.size();
		}
		for (unsigned ch = 0; ch < 2; ++ch)
		{
			_s.low[ch] = word(low[ch]);
			_s.high[ch] = word(high[ch]);
		}
		Block envelope, roots, mapped, gains;
		auto accumulator = _s.envelope;
		for (size_t i = 0; i < blockSize; ++i)
		{
			const auto energy =
				word((product(detector.left[i], detector.left[i]) + product(detector.right[i], detector.right[i])) * 8);
			envelope[i] = word(accumulator);
			if (product(0x7fdf3b, _s.previousEnvelope) > accumulator)
				_s.envelopeRate = c[0];
			if (product(0x7fdf3b, envelope[i]) > pair(_s.previousEnvelope))
				_s.envelopeRate = c[1];
			_s.previousEnvelope = envelope[i];
			accumulator += product(_s.envelopeRate, energy) - product(_s.envelopeRate, envelope[i]);
		}
		_s.envelope = pair(word(accumulator), uint32_t(accumulator));
		accumulator = pair(_s.root);
		for (size_t i = 0; i < blockSize; ++i)
		{
			roots[i] = word(accumulator);
			accumulator += pair(envelope[i]) - product(roots[i], roots[i]);
			const auto root = roots[i];
			mapped[i] = root > c[6] ? word(product(root, c[10]) + pair(c[9]))
				: root > c[5]		? word(product(root, c[8]) + pair(c[7]))
									: root;
		}
		_s.root = word(accumulator);
		accumulator = pair(_s.gain);
		for (size_t i = 0; i < blockSize; ++i)
		{
			gains[i] = word(accumulator);
			accumulator += pair(mapped[i]) - product(roots[i], gains[i]);
		}
		_s.gain = word(accumulator);
		const auto makeup = word(product(0x7fffff - c[4], c[2]));
		for (size_t i = 0; i < blockSize; ++i)
		{
			const auto gain = word(product(gains[i], makeup));
			const auto dry = c[4] / 128;
			const auto &delayed = _s.lookahead[(_s.write + i) % _s.lookahead.size()];
			_output.left[i] = word(multiplyPair(gain + dry, delayed[0]) * 128);
			_output.right[i] = word(multiplyPair(gain + dry, delayed[1]) * 128);
		}
	}
} // namespace mdNative
