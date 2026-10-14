#include "mdNative.h"

namespace mdNative
{
	namespace
	{
		constexpr uint32_t wordMask = 0xffffff;
		constexpr uint64_t pairMask = 0xffffffffffffull;
		constexpr int64_t wordScale = 0x1000000;

		int32_t signedWord(const uint32_t _word)
		{
			return static_cast<int32_t>(_word & 0x7fffff) - static_cast<int32_t>(_word & 0x800000);
		}
		// C++17 does not specify right-shifting negative integers. Division here is explicitly floor.
		int64_t floorDivide(const int64_t _value, const int64_t _divisor)
		{
			return _value / _divisor - ((_value < 0 && _value % _divisor) ? 1 : 0);
		}
		int32_t accumulatorWord(const int64_t _value)
		{
			const auto word = floorDivide(_value, wordScale);
			return word > 0x7fffff ? 0x7fffff : word < -0x800000 ? -0x800000 : static_cast<int32_t>(word);
		}
		int64_t multiplyPair(const int32_t _value, const uint64_t _pair)
		{
			// The firmware's MPYSU + DMAC SS truncates the low product before the high product is added.
			const auto low = static_cast<int64_t>(_pair & wordMask);
			const auto high = signedWord(static_cast<uint32_t>(_pair >> 24));
			return floorDivide(int64_t(_value) * low * 2, wordScale) + int64_t(_value) * high * 2;
		}
	} // namespace

	void trigger(SineState &_state)
	{
		_state = {0, uint64_t{0x7ffff8} * wordScale, 0x7ffff8};
	}

	void renderSine(const SineParameters &_parameters, SineState &_state, const int32_t *_wave, Block &_out)
	{
		const auto increment =
			floorDivide(int64_t(_parameters.pitch) * wordScale + int64_t(_parameters.ramp) * _state.ramp * 2, 64);
		_state.ramp = accumulatorWord(int64_t(_parameters.rampDecay) * _state.ramp * 2);
		for (auto &sample : _out)
		{
			_state.phase &= (uint64_t{0x7fff} * wordScale) | wordMask;
			const auto wave = static_cast<int32_t>(floorDivide(_wave[_state.phase >> 24], 4));
			_state.phase = (_state.phase + static_cast<uint64_t>(increment)) & pairMask;
			sample = accumulatorWord(multiplyPair(wave, _state.gain));
			_state.gain = static_cast<uint64_t>(multiplyPair(_parameters.decay, _state.gain)) & pairMask;
		}
	}

} // namespace mdNative
