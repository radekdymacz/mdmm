#pragma once

// I-032 (0.8, WP9): the Mix page's output meters, one per output pair of the machine: A/B, C/D, E/F (the plug-in's
// three stereo outputs, mdPluginProcessor.cpp createBusesProperties). The emulation gives no audio per track, so this
// is a level per output, after the volume (the same signal the host hears). Pure: no JUCE, no lock.
//   - Meter, the audio thread's: onBlock is one pass over the six channels of the pairs, a few relaxed atomic ops, no
//     allocation, no lock, never waits (doc/modern-ux/DESIGN-audio-lock.md). The message thread take()s: the largest
//     |sample| (peak) and the RMS of each channel since the last take(), and which pairs the host had enabled.
//   - toDb, the page's unit: dBFS to 0.1 dB, g_floorDb for silence (JSON has no -inf).
// The page gets the levels as the "mixLevels" message (mdDeskSession.cpp mixLevelsOf), about 25 times a second, only
// while its Mix page is shown (the page's mixMeters command). Its decay and peak hold are the page's.
//
// One quirk, stated: the peak, the sum of squares and the frame count are each taken by their own atomic exchange, so
// a block that lands between two of them is counted in this window's RMS or the next one's. A block is about 5 ms
// of a 40 ms window; the RMS is a display value.

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace mdJucePlugin::mixMeters
{
	constexpr size_t g_pairs = 3;
	constexpr size_t g_channels = g_pairs * 2;		// A, B, C, D, E, F
	constexpr double g_floorDb = -96;

	struct Levels
	{
		std::array<float, g_channels> peak{};		// linear, the largest |sample| since the last take()
		std::array<float, g_channels> rms{};		// linear
		std::array<bool, g_pairs> on{};				// the host enabled this pair's output during the window
	};

	// dBFS of a linear level, 0.1 dB steps; g_floorDb for silence and anything below it
	inline double toDb(const float _linear) noexcept
	{
		if(!(_linear > 0.0f))
			return g_floorDb;
		const double db = std::round(20.0 * std::log10(static_cast<double>(_linear)) * 10.0) / 10.0;
		return std::max(db, g_floorDb);
	}

	// Over 0 dBFS: a sample above 1
	inline bool clipped(const float _peak) noexcept { return _peak > 1.0f; }

	class Meter
	{
	public:
		// One block: the outputs after the gain (0..5 are A..F; a null buffer is an output the host did not enable).
		// Written to survive -Ofast: a NaN or an infinity is left out by its bits, not by a comparison.
		template<size_t N> void onBlock(const std::array<float*, N>& _outputs, const size_t _frames) noexcept
		{
			static_assert(N >= g_channels, "the three stereo outputs are six channels");
			uint8_t seen = 0;
			for(size_t c = 0; c < g_channels; ++c)
			{
				const float* buf = _outputs[c];
				if(!buf)
					continue;
				seen = static_cast<uint8_t>(seen | (1u << (c / 2)));
				float peak = 0.0f;
				double sumSq = 0.0;
				for(size_t i = 0; i < _frames; ++i)
				{
					const float s = buf[i];
					if(!finite(s))
						continue;
					const float a = s < 0.0f ? -s : s;
					if(a > peak)
						peak = a;
					sumSq += static_cast<double>(s) * static_cast<double>(s);
				}
				raise(m_peak[c], peak);
				add(m_sumSq[c], sumSq);
			}
			m_seen.fetch_or(seen, std::memory_order_relaxed);
			m_frames.fetch_add(_frames, std::memory_order_relaxed);
		}

		// The reader's: the window since the last take(), and the window starts again
		Levels take() noexcept
		{
			Levels l;
			const uint64_t frames = m_frames.exchange(0, std::memory_order_relaxed);
			for(size_t c = 0; c < g_channels; ++c)
			{
				l.peak[c] = m_peak[c].exchange(0.0f, std::memory_order_relaxed);
				const double sumSq = m_sumSq[c].exchange(0.0, std::memory_order_relaxed);
				l.rms[c] = frames ? static_cast<float>(std::sqrt(sumSq / static_cast<double>(frames))) : 0.0f;
			}
			const auto seen = m_seen.exchange(0, std::memory_order_relaxed);
			for(size_t p = 0; p < g_pairs; ++p)
				l.on[p] = (seen & (1u << p)) != 0;
			return l;
		}

	private:
		static bool finite(const float _v) noexcept
		{
			uint32_t bits;
			std::memcpy(&bits, &_v, sizeof(bits));
			return (bits & 0x7f800000u) != 0x7f800000u;
		}
		static void raise(std::atomic<float>& _a, const float _v) noexcept
		{
			auto cur = _a.load(std::memory_order_relaxed);
			while(cur < _v && !_a.compare_exchange_weak(cur, _v, std::memory_order_relaxed))
			{
			}
		}
		static void add(std::atomic<double>& _a, const double _v) noexcept
		{
			auto cur = _a.load(std::memory_order_relaxed);
			while(!_a.compare_exchange_weak(cur, cur + _v, std::memory_order_relaxed))
			{
			}
		}
		static_assert(std::atomic<float>::is_always_lock_free && std::atomic<double>::is_always_lock_free
			&& std::atomic<uint64_t>::is_always_lock_free, "the mix meters' atomics must be lock-free");
		std::array<std::atomic<float>, g_channels> m_peak{};
		std::array<std::atomic<double>, g_channels> m_sumSq{};
		std::atomic<uint64_t> m_frames{0};
		std::atomic<uint8_t> m_seen{0};
	};
}
