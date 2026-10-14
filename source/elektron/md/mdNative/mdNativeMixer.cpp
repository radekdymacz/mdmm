#include "mdNativeMixer.h"

#include <algorithm>
#include <array>

namespace mdNative
{
	namespace
	{
		int32_t limited(const int64_t _accumulator)
		{
			constexpr int64_t scale = 0x1000000;
			const auto v = _accumulator / scale - ((_accumulator < 0 && _accumulator % scale) ? 1 : 0);
			return int32_t(std::clamp(v, int64_t(-0x800000), int64_t(0x7fffff)));
		}
		int64_t multiply(const int32_t _a, const int32_t _b)
		{
			return int64_t(_a) * _b * 2;
		}
	} // namespace

	void mixTracks(const Block *_tracks, const MixerControls *_controls, const size_t _count, const int32_t *_sineTable,
				   MixerBuses &_output)
	{
		std::array<std::array<int64_t, blockSize>, 6> sums{};
		for (size_t t = 0; t < _count; ++t)
		{
			const auto &p = _controls[t];
			const auto pan = std::clamp(p.pan, 0, 0x7fffff);
			const auto index = (pan > 0x7ecccd ? 0x7fffff : pan) / 1024;
			const auto left = limited(multiply(_sineTable[8192 + index], p.level));
			const auto right = limited(multiply(_sineTable[index], p.level));
			const std::array<int32_t, 6> gains{left,
											   right,
											   limited(multiply(left, p.reverb)),
											   limited(multiply(right, p.reverb)),
											   limited(multiply(left, p.delay)),
											   limited(multiply(right, p.delay))};
			for (size_t b = 0; b < gains.size(); ++b)
				for (size_t i = 0; i < blockSize; ++i)
					sums[b][i] += multiply(gains[b], _tracks[t][i]);
		}
		const std::array<Block *, 6> outputs{&_output.main.left,	&_output.main.right, &_output.reverb.left,
											 &_output.reverb.right, &_output.delay.left, &_output.delay.right};
		for (size_t b = 0; b < outputs.size(); ++b)
			for (size_t i = 0; i < blockSize; ++i)
				(*outputs[b])[i] = limited(sums[b][i] * 8);
	}
} // namespace mdNative
