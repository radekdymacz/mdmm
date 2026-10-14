#include "mdNativeMasterEq.h"
#include "mdNativeFixed.h"

namespace mdNative
{
	namespace
	{
		using namespace fixed;
		int32_t reciprocal(const int32_t _divisor)
		{
			auto remainder = pair(32768);
			bool carry = false;
			for (unsigned i = 0; i < 24; ++i)
			{
				const auto sign = (remainder < 0) != (_divisor < 0) ? 1 : -1;
				remainder = remainder * 2 + int(carry) + sign * pair(_divisor);
				const auto bits = uint64_t(remainder);
				remainder = int64_t(bits & 0x7fffffffffffffull) - int64_t(bits & 0x80000000000000ull);
				carry = remainder >= 0;
			}
			return int32_t(uint64_t(remainder) & 0x7fffff);
		}
		std::array<int32_t, 5> bellCoefficients(const MasterEqControls &_p)
		{
			const auto width = _p.words[6], frequency = _p.words[7], gain = _p.words[8];
			const auto shaped = word(product(gain, width) * (gain < 0 ? -16 : 16));
			const auto square = product(frequency, frequency);
			const auto denominator = pair(32768) + square + product(gain < 0 ? shaped : width, frequency);
			const auto quotient = reciprocal(word(denominator));
			const auto numerator = product(gain < 0 ? width : shaped, frequency);
			const auto middle = product(word(pair(-32768) + square), quotient) * 32;
			return {
				word(product(word(pair(32768) + square + numerator), quotient) * 16), word(middle),
				word(product(word(pair(32768) + square - numerator), quotient) * 16), word(-middle * 8),
				word(product(word(pair(-32768) + product(gain < 0 ? shaped : width, frequency) - square), quotient) *
					 128)};
		}
		template <size_t N> int64_t dot(const std::array<int32_t, N> &_c, const std::array<int64_t, N> &_v)
		{
			int64_t low = 0, high = 0;
			for (size_t i = 0; i < N; ++i)
			{
				low += int64_t(_c[i]) * int64_t(uint64_t(_v[i]) & 0xffffff) * 2;
				high += product(_c[i], signedWord(uint32_t(uint64_t(_v[i]) >> 24)));
			}
			return high + floorDivide(low, scale);
		}
	} // namespace

	void renderMasterEq(const MasterEqControls &_p, MasterEqState &_s, const StereoBlock &_input,
						WideStereoBlock &_output)
	{
		using namespace fixed;
		const auto &c = _p.words;
		const auto bell = bellCoefficients(_p);
		for (unsigned ch = 0; ch < 2; ++ch)
		{
			auto &s = _s.channels[ch];
			const auto &input = ch ? _input.right : _input.left;
			for (size_t i = 0; i < blockSize; ++i)
			{
				const auto first = limitPair(s.first);
				s.first = multiplyPair(c[2], first) + product(c[1], s.previousInput) + product(c[0], input[i]);
				s.previousInput = input[i];
				const auto second = limitPair(s.second);
				s.second = dot<3>({c[3], c[4], c[5]}, {first, s.previousFirst, second});
				s.previousFirst = first;
				const auto filtered =
					limitPair(dot<5>(bell, {second, s.input[0], s.input[1], s.output[0], s.output[1]}) * 2);
				s.input[1] = s.input[0];
				s.input[0] = second;
				s.output[1] = s.output[0];
				s.output[0] = filtered;
				_output[ch][i] = limitPair(multiplyPair(c[9], filtered) * 256);
			}
			// Original persistent state saves the unscaled accumulator's high/low words.
			s.first = pair(signedWord(uint32_t(uint64_t(s.first) >> 24)), uint32_t(s.first));
			s.second = pair(signedWord(uint32_t(uint64_t(s.second) >> 24)), uint32_t(s.second));
		}
	}
} // namespace mdNative
