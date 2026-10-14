#pragma once

#include <algorithm>
#include <cstdint>

namespace mdNative::fixed
{
	constexpr int64_t scale = 0x1000000;
	inline int64_t floorDivide(const int64_t _v, const int64_t _d)
	{
		return _v / _d - ((_v < 0 && _v % _d) ? 1 : 0);
	}
	inline int32_t signedWord(const uint32_t _v)
	{
		return int32_t(_v & 0x7fffff) - int32_t(_v & 0x800000);
	}
	inline int32_t word(const int64_t _v)
	{
		return int32_t(std::clamp(floorDivide(_v, scale), int64_t(-0x800000), int64_t(0x7fffff)));
	}
	inline int64_t pair(const int32_t _high, const uint32_t _low = 0)
	{
		return int64_t(_high) * scale + (_low & 0xffffff);
	}
	inline int64_t product(const int32_t _a, const int32_t _b)
	{
		return int64_t(_a) * _b * 2;
	}
	inline int64_t limitPair(const int64_t _v)
	{
		return std::clamp<int64_t>(_v, -0x800000000000ll, 0x7fffffffffffll);
	}
	inline int64_t multiplyPair(const int32_t _c, const int64_t _v)
	{
		return floorDivide(int64_t(_c) * int64_t(uint64_t(_v) & 0xffffff) * 2, scale) +
			product(_c, signedWord(uint32_t(uint64_t(_v) >> 24)));
	}
} // namespace mdNative::fixed
