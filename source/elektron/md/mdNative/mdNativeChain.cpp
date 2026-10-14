#include "mdNativeChain.h"

#include <algorithm>

namespace mdNative
{
	namespace
	{
		constexpr int64_t scale = 0x1000000;
		int64_t wrap(const int64_t _value)
		{
			const auto bits = uint64_t(_value);
			return int64_t(bits & 0x7fffffffffffffull) - int64_t(bits & 0x80000000000000ull);
		}
		int32_t signedWord(const uint32_t _value)
		{
			return int32_t(_value & 0x7fffff) - int32_t(_value & 0x800000);
		}
		int64_t divideFloor(const int64_t _v, const int64_t _d)
		{
			return _v / _d - ((_v < 0 && _v % _d) ? 1 : 0);
		}
		int32_t word(const int64_t _v)
		{
			return int32_t(std::clamp(divideFloor(_v, scale), int64_t(-0x800000), int64_t(0x7fffff)));
		}
		int64_t product(const int32_t _a, const int32_t _b)
		{
			return int64_t(_a) * _b * 2;
		}
		int64_t normalized(const int64_t _v, const int _shift)
		{
			if (_shift >= 0)
				return divideFloor(_v, int64_t{1} << _shift);
			const auto bits = uint64_t(_v) << -_shift;
			return int64_t(bits & 0x7fffffffffffffull) - int64_t(bits & 0x80000000000000ull);
		}
		// The reference coefficient ratio retains the original 24-bit division precision. This runs at
		// block/control rate, never for every sample. A modern coefficient designer can replace it separately.
		int32_t ratio(const int32_t _numerator, const int64_t _denominator)
		{
			int shift = 0;
			if (_denominator)
			{
				auto bits = uint64_t(_denominator) << 8;
				if (_denominator < 0)
					bits = ~bits;
				bits |= 255;
				int top = 63;
				while (!(bits & (uint64_t{1} << top)))
					--top;
				shift = top - 54;
			}
			const auto divisor = word(normalized(_denominator, shift));
			auto remainder = divideFloor(normalized(int64_t(_numerator) * scale, shift), 8);
			bool carry = false;
			for (unsigned i = 0; i < 24; ++i)
			{
				const bool add = (remainder < 0) != (divisor < 0);
				remainder = wrap(remainder * 2 + int(carry) + (add ? 1 : -1) * int64_t(divisor) * scale);
				carry = remainder >= 0;
			}
			return word(int64_t(signedWord(uint32_t(remainder))) * scale * 2);
		}
		EqCoefficients eqCoefficients(const TrackControls &_p, const TrackTables &_t)
		{
			const auto at = [&](const int _address) { return _t.words[_address - 0x140000]; };
			const auto frequency = _p[2] / 8, gain = _p[3] / 128;
			const auto x = at(0x14221d + frequency + at(0x143476 + gain));
			const auto y = at(0x142c76 + frequency + at(0x143576 + gain));
			const auto a = product(x, y) - 0x400000ll * scale, b = -product(y, y);
			EqCoefficients result;
			result.words[0] = word(b);
			result.words[1] = word(a);
			const auto numerator = word(-divideFloor(b, 2) - a);
			const auto u = at(0x14221d + frequency + at(0x1434f6 + gain));
			const auto v = at(0x142c76 + frequency + at(0x1435f6 + gain));
			const auto first = divideFloor(product(v, v), 2), middle = -product(u, v);
			const auto multiplier = ratio(numerator, first + middle + 0x400000ll * scale);
			result.words[2] = word(product(multiplier, word(first)));
			result.words[3] = word(product(multiplier, word(middle)));
			result.words[4] = word(product(multiplier, 0x400000));
			return result;
		}
		Block ramp(const int32_t _from, const int64_t _targetAccumulator, const bool _falling)
		{
			Block result;
			auto accumulator = int64_t(_from) * scale;
			const auto delta = word(_targetAccumulator - int64_t(_from) * scale);
			for (unsigned i = 0; i < 32; ++i)
			{
				result[i] = word(accumulator);
				const auto weight = _falling ? (i ? 0x82000 - int(i) * 0x4000 : 0) : 0x2000 + int(i) * 0x4000;
				accumulator += product(delta, weight);
			}
			return result;
		}
		FilterCoefficients filterCoefficients(TrackState &_state, const TrackTables &_t, const bool _upper)
		{
			auto &s = _state.words;
			const auto at = [&](const int _address) { return _t.words[_address - 0x140000]; };
			const auto frequency = s[_upper ? 0x24 : 0x22], resonance = s[_upper ? 0x26 : 0x23];
			const auto x = at(0x1402aa + frequency + at(0x141f00 + resonance));
			const auto y = at(0x141700 + frequency + at(0x141f80 + resonance));
			const auto a = product(x, y), b = -product(y, y);
			const auto feed2 = word(b);
			const auto feed1Accumulator = _upper ? int64_t(word(a * 2 - 0x800000ll * scale)) * scale
												 : int64_t(word(a)) * scale - 0x400000ll * scale;
			const auto forwardAccumulator = _upper ? -(a * 2 - 0x800000ll * scale + int64_t(feed2) * scale)
												   : divideFloor(a * 2 - b + 0x800000ll * scale, 8);
			const auto feed1 = word(feed1Accumulator), forward = word(forwardAccumulator);
			const bool falling = frequency < s[_upper ? 0x29 : 0x2d];
			const auto f2 = _upper ? 0x2b : 0x2f, f1 = _upper ? 0x2a : 0x2e, ff = _upper ? 0x2c : 0x30;
			FilterCoefficients c;
			c.feedback2 = ramp(s[f2], b, falling);
			c.feedback1 = ramp(s[f1], feed1Accumulator, falling);
			c.feedforward = ramp(s[ff], forwardAccumulator, falling);
			if (!_upper)
			{
				const auto delta = word(forwardAccumulator - int64_t(s[ff]) * scale);
				auto accumulator = int64_t(s[ff]) * scale * -2;
				const auto twiceDelta = word(int64_t(delta) * scale * -2);
				for (unsigned i = 0; i < 32; ++i)
				{
					c.middle[i] = word(accumulator);
					const auto weight = falling ? (i ? 0x82000 - int(i) * 0x4000 : 0) : 0x2000 + int(i) * 0x4000;
					accumulator += product(twiceDelta, weight);
				}
			}
			s[f2] = feed2;
			s[f1] = feed1;
			s[ff] = forward;
			return c;
		}
	} // namespace

	void renderTrack(const TrackControls &_p, TrackState &_state, const TrackTables &_tables, const Block &_input,
					 Block &_output)
	{
		auto &s = _state.words;
		std::copy(_p.begin(), _p.end(), s.begin());
		s[0x22] = _p[4] / 8;
		s[0x23] = s[0x22] ? _p[6] / 128 : 0;
		s[0x24] = std::min(0x7ff, _p[4] / 8 + _p[5] / 8);
		s[0x26] = _p[5] / 8 >= 0x7ef ? 0 : _p[6] / 128;
		Block modulated, equalized, upper, delayed, lower, reduced;
		auto phase = uint32_t(s[0x25]) & 0x7fff;
		renderAmplitudeModulation(_p[0], _p[1], phase, _tables.words + 0x8000, _input, modulated);
		s[0x25] = int32_t(0x148000 + phase);
		EqState eq{s[0x12], s[0x13], s[0x14], s[0x16], uint32_t(s[0x15]) & 0xffffff};
		renderEq(eqCoefficients(_p, _tables), eq, modulated, equalized);
		s[0x12] = eq.input1;
		s[0x13] = eq.input2;
		s[0x14] = eq.output1;
		s[0x16] = eq.output2;
		s[0x15] = int32_t(eq.fraction);
		FilterState u{s[0x17], s[0x18], uint32_t(s[0x27]) & 0xffffff, s[0xa], s[0xc], uint32_t(s[0xb]) & 0xffffff};
		delayed[0] = u.output2;
		delayed[1] = u.output1;
		renderUpperFilter(filterCoefficients(_state, _tables, true), u, equalized, upper);
		std::copy_n(upper.begin(), 30, delayed.begin() + 2);
		s[0x17] = u.output1;
		s[0x18] = u.output2;
		s[0x27] = int32_t(u.fraction);
		s[0xa] = u.intermediate1;
		s[0xc] = u.intermediate2;
		s[0xb] = int32_t(u.intermediateFraction);
		FilterState l{s[0x19], s[0x1b], uint32_t(s[0x1a]) & 0xffffff, s[0xd], s[0xf], uint32_t(s[0xe]) & 0xffffff,
					  s[0x10], s[0x11]};
		renderLowerFilter(filterCoefficients(_state, _tables, false), l, delayed, lower);
		s[0x19] = l.output1;
		s[0x1b] = l.output2;
		s[0x1a] = int32_t(l.fraction);
		s[0xd] = l.intermediate1;
		s[0xf] = l.intermediate2;
		s[0xe] = int32_t(l.intermediateFraction);
		s[0x10] = l.input1;
		s[0x11] = l.input2;
		RateReductionState r{s[0x1c], s[0x1d]};
		renderRateReduction(_p[7], r, lower, reduced);
		s[0x1c] = r.phase;
		s[0x1d] = r.held;
		AmpState amp{s[0x1e], s[0x1f], s[0x20], uint32_t(s[0x21]) & 0xffffff};
		const auto index = _p[8] / 64;
		renderAmp({_tables.words[0x3777 + index], _tables.words[0x3878 + index]}, amp, reduced, _output);
		s[0x1e] = amp.previousGain;
		s[0x1f] = amp.previousInput;
		s[0x20] = amp.output;
		s[0x21] = int32_t(amp.fraction);
	}
} // namespace mdNative
