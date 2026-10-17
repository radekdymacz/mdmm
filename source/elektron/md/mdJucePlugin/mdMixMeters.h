#pragma once

// I-032 (0.8, WP9): the Mix page's output meters, one per output pair of the machine: A/B, C/D, E/F (the plug-in's
// three stereo outputs, mdPluginProcessor.cpp createBusesProperties). The emulation gives no audio per track, so this
// is a level per output, after the volume (the same signal the host hears). Pure: no JUCE, no lock.
//   - Meter, the audio thread's: onBlock is one pass over the six channels of the pairs, a few atomic ops, no
//     allocation, no lock, never waits (doc/modern-ux/DESIGN-audio-lock.md). The message thread take()s: the largest
//     |sample| (peak) and the RMS of each channel since the last take(), and which pairs the host had enabled.
//   - toDb, the page's unit: dBFS to 0.1 dB, g_floorDb for silence (JSON has no -inf).
// The page gets the levels as the "mixLevels" message (mdDeskSession.cpp mixLevelsOf), about 25 times a second, only
// while its Mix page is shown (the page's mixMeters command). Its decay and peak hold are the page's.
//
// A window is read whole. The meter keeps two windows (peak, sum of squares and frame count together) and the audio
// thread fills the one `m_active` names; take() flips `m_active`, waits until the audio thread has left the window it
// flipped away from (at most the rest of one block), and reads it. So a reading never mixes two windows (an RMS from
// one window's energy and another's frame count could read above the peak, or above the signal), and no block is lost
// or counted twice. The audio thread never waits: when take() flips between its two steps it just starts the block
// again on the new window.

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <thread>

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
		uint64_t frames = 0;						// the frames the window covers
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
			// claim the active window (Dekker with take(): either take() sees the claim and waits, or we see its flip)
			uint32_t idx;
			for(;;)
			{
				idx = m_active.load(std::memory_order_seq_cst);
				m_busy[idx].store(true, std::memory_order_seq_cst);
				if(m_active.load(std::memory_order_seq_cst) == idx)
					break;
				m_busy[idx].store(false, std::memory_order_release);
			}
			Window& w = m_win[idx];
			uint8_t seen = 0;
			for(size_t c = 0; c < g_channels; ++c)
			{
				const float* buf = _outputs[c];
				if(!buf)
					continue;
				seen = static_cast<uint8_t>(seen | (1u << (c / 2)));
				float peak = w.peak[c];
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
				w.peak[c] = peak;
				w.sumSq[c] += sumSq;
			}
			w.seen = static_cast<uint8_t>(w.seen | seen);
			w.frames += _frames;
			m_busy[idx].store(false, std::memory_order_release);
		}

		// The reader's (one reader at a time): the window since the last take(), and the window starts again
		Levels take() noexcept
		{
			const uint32_t old = m_active.fetch_xor(1u, std::memory_order_seq_cst);
			while(m_busy[old].load(std::memory_order_acquire))
				std::this_thread::yield();		// the audio thread is in the last block it began on this window
			Window& w = m_win[old];
			Levels l;
			l.frames = w.frames;
			for(size_t c = 0; c < g_channels; ++c)
			{
				l.peak[c] = w.peak[c];
				const double ms = w.frames ? w.sumSq[c] / static_cast<double>(w.frames) : 0.0;
				l.rms[c] = std::min(static_cast<float>(std::sqrt(ms)), w.peak[c]);		// rounding only: RMS <= peak
			}
			for(size_t p = 0; p < g_pairs; ++p)
				l.on[p] = (w.seen & (1u << p)) != 0;
			w = Window{};
			return l;
		}

	private:
		struct Window
		{
			std::array<float, g_channels> peak{};
			std::array<double, g_channels> sumSq{};
			uint64_t frames = 0;
			uint8_t seen = 0;
		};
		static bool finite(const float _v) noexcept
		{
			uint32_t bits;
			std::memcpy(&bits, &_v, sizeof(bits));
			return (bits & 0x7f800000u) != 0x7f800000u;
		}
		static_assert(std::atomic<uint32_t>::is_always_lock_free && std::atomic<bool>::is_always_lock_free,
			"the mix meters' atomics must be lock-free");
		std::array<Window, 2> m_win{};
		std::array<std::atomic<bool>, 2> m_busy{};
		std::atomic<uint32_t> m_active{0};
	};
}
