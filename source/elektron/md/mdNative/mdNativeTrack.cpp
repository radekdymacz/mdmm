#include "mdNativeTrack.h"

namespace mdNative
{
	namespace
	{
		constexpr int64_t scale = 0x1000000;
		int64_t wrap(const int64_t _value)
		{
			const auto bits = static_cast<uint64_t>(_value);
			return static_cast<int64_t>(bits & 0x7fffffffffffffull) - static_cast<int64_t>(bits & 0x80000000000000ull);
		}
		int32_t word(const int64_t _value)
		{
			const auto high = _value / scale - ((_value < 0 && _value % scale) ? 1 : 0);
			return high > 0x7fffff ? 0x7fffff : high < -0x800000 ? -0x800000 : static_cast<int32_t>(high);
		}
		int64_t pair(const int32_t _high, const uint32_t _low)
		{
			return int64_t(_high) * scale + (_low & 0xffffff);
		}
		int64_t product(const int32_t _a, const int32_t _b)
		{
			return int64_t(_a) * _b * 2;
		}
		int64_t limitedPair(const int64_t _value)
		{
			return _value > 0x7fffffffffffll ? 0x7fffffffffffll
				: _value < -0x800000000000ll ? -0x800000000000ll
											 : _value;
		}
		void saveFilter(FilterState &_s, const int64_t _a, const int64_t _b)
		{
			_s.fraction = uint32_t(limitedPair(_a)) & 0xffffff;
			_s.intermediateFraction = uint32_t(limitedPair(_b)) & 0xffffff;
		}
	} // namespace

	void renderEq(const EqCoefficients &_coefficients, EqState &_state, const Block &_input, Block &_output)
	{
		const auto &c = _coefficients.words;
		auto accumulator = pair(_state.output1, _state.fraction);
		for (size_t i = 0; i < blockSize; ++i)
		{
			accumulator = wrap(accumulator + product(c[0], _state.output2) + 2 * product(c[1], _state.output1) +
							   product(c[2], _state.input2) + product(c[3], _state.input1) + product(c[4], _input[i]));
			_output[i] = word(accumulator);
			_state.output2 = _state.output1;
			_state.output1 = _output[i];
			_state.input2 = _state.input1;
			_state.input1 = _input[i];
		}
		_state.fraction = static_cast<uint32_t>(accumulator) & 0xffffff;
	}

	void renderAmp(const AmpParameters &_parameters, AmpState &_state, const Block &_input, Block &_output)
	{
		const auto gain = word(product(_parameters.outputGain, 0x7fdf3b));
		auto accumulator = pair(_state.output, _state.fraction);
		for (size_t i = 0; i < blockSize; ++i)
		{
			const auto input = word(wrap(product(_input[i], _parameters.inputGain) * 512));
			accumulator = wrap(accumulator - product(_state.previousGain, _state.previousInput) +
							   product(-16777, word(accumulator)) + product(input, gain));
			_output[i] = word(accumulator);
			_state.previousGain = gain;
			_state.previousInput = input;
		}
		_state.output = word(accumulator);
		_state.fraction = static_cast<uint32_t>(accumulator) & 0xffffff;
	}

	void renderUpperFilter(const FilterCoefficients &_c, FilterState &_s, const Block &_input, Block &_output)
	{
		auto a = pair(_s.output1, _s.fraction), b = pair(_s.intermediate1, _s.intermediateFraction);
		for (size_t i = 0; i < blockSize; ++i)
		{
			// The original pipeline feeds the second section from the first section's two-sample history.
			a = wrap(a + product(_c.feedback2[i], _s.output2) + product(_c.feedback1[i], _s.output1) +
					 product(_c.feedforward[i], _s.intermediate2));
			b = wrap(b + product(_c.feedback2[i], _s.intermediate2) + product(_c.feedback1[i], _s.intermediate1) +
					 product(_c.feedforward[i], _input[i]));
			_output[i] = word(a);
			_s.output2 = _s.output1;
			_s.output1 = word(a);
			_s.intermediate2 = _s.intermediate1;
			_s.intermediate1 = word(b);
		}
		saveFilter(_s, a, b);
	}

	void renderLowerFilter(const FilterCoefficients &_c, FilterState &_s, const Block &_input, Block &_output)
	{
		auto a = pair(_s.output1, _s.fraction), b = pair(_s.intermediate1, _s.intermediateFraction);
		for (size_t i = 0; i < blockSize; ++i)
		{
			b = wrap(b + product(_c.feedback2[i], _s.intermediate2) + 2 * product(_c.feedback1[i], _s.intermediate1) +
					 product(_c.feedforward[i], _s.input2) + product(_c.middle[i], _s.input1) +
					 product(_c.feedforward[i], _input[i]));
			a = wrap(a + product(_c.feedback2[i], _s.output2) + 2 * product(_c.feedback1[i], _s.output1) +
					 product(_c.feedforward[i], _s.intermediate2) + product(_c.middle[i], _s.intermediate1) +
					 product(_c.feedforward[i], word(b)));
			_output[i] = word(a);
			_s.output2 = _s.output1;
			_s.output1 = word(a);
			_s.intermediate2 = _s.intermediate1;
			_s.intermediate1 = word(b);
			_s.input2 = _s.input1;
			_s.input1 = _input[i];
		}
		saveFilter(_s, a, b);
	}

	void renderRateReduction(const int32_t _control, RateReductionState &_s, const Block &_input, Block &_output)
	{
		const auto control = word(int64_t(_control + 0x4000) * scale);
		const auto threshold = word(wrap((product(control, control) - 32 * scale) * 4 + 16 * scale));
		int64_t phase = _s.phase;
		for (size_t i = 0; i < blockSize; ++i)
		{
			phase += 16;
			if (phase >= threshold)
			{
				_s.held = _input[i];
				phase -= threshold;
			}
			_output[i] = _s.held;
		}
		_s.phase = word(phase * scale);
	}

	void renderAmplitudeModulation(const int32_t _depth, const int32_t _rate, uint32_t &_phase, const int32_t *_wave,
								   const Block &_input, Block &_output)
	{
		const auto depth = word(int64_t(_depth) * 512 * scale);
		const auto dry = word(int64_t(_depth) * 512 * scale - 0x800000ll * scale);
		const auto step = _rate / 8 - ((_rate < 0 && _rate % 8) ? 1 : 0);
		for (size_t i = 0; i < blockSize; ++i)
		{
			const auto modulated = word(product(_wave[_phase & 0x7fff], _input[i]));
			_output[i] = word(-product(dry, _input[i]) + product(depth, modulated));
			_phase = (_phase + uint32_t(step)) & 0x7fff;
		}
	}
} // namespace mdNative
