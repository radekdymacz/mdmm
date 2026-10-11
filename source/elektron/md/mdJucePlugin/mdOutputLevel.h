#pragma once

// I-021: the output meter and master volume in the LCD (both editors, plug-in and standalone). The volume is the
// plug-in layer's output gain (pluginLib::Processor::applyOutputGain: after the emulation, on every output bus, ramped
// across a block when it moves), so the emulated machine and its own volume settings are untouched. The meter is that
// gain's result: the main output's left and right peaks since the page's last reading (and every output's, for the
// clip mark). Pure (no JUCE, no lock):
//   - the volume's range: dB to gain and back, g_minDb and below is off (-inf), g_maxDb at most
//   - peakOf: a block's largest |sample| of an output, or across the outputs (the audio thread's, once a block)
//   - Meter: the peaks since the last take(), lock-free maxima the audio thread raises and the reader swaps to 0
// The page gets the "outputLevel" message (mdDeskSession.cpp outputLevelOf, skins/shared/deskVolume.js).

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <optional>

namespace mdJucePlugin::outputLevel
{
	constexpr double g_minDb = -60;		// the volume's floor: at or below it the output is off
	constexpr double g_maxDb = 6;

	// The gain for a volume in dB: 0 (off) at g_minDb and below, never above g_maxDb.
	inline float gainOfDb(const double _db)
	{
		if(!(_db > g_minDb))
			return 0.0f;
		return static_cast<float>(std::pow(10.0, std::min(_db, g_maxDb) / 20.0));
	}

	// The volume in dB of a gain, 0.1 dB steps; none when it is off (0, or at g_minDb and below).
	inline std::optional<double> dbOfGain(const float _gain)
	{
		if(!(_gain > 0.0f))
			return std::nullopt;
		const double db = std::round(20.0 * std::log10(static_cast<double>(_gain)) * 10.0) / 10.0;
		if(db <= g_minDb)
			return std::nullopt;
		return std::min(db, g_maxDb);
	}

	// A block's largest |sample| of one output (null: an output the host did not enable). A NaN never wins a
	// comparison, so it is left out.
	inline float peakOf(const float* _buf, const size_t _frames) noexcept
	{
		float peak = 0.0f;
		if(!_buf)
			return peak;
		for(size_t i = 0; i < _frames; ++i)
		{
			const float a = std::fabs(_buf[i]);
			if(a > peak)
				peak = a;
		}
		return peak;
	}

	// The same across the outputs
	template<size_t N> float peakOf(const std::array<float*, N>& _buffers, const size_t _frames) noexcept
	{
		float peak = 0.0f;
		for(const float* buf : _buffers)
			peak = std::max(peak, peakOf(buf, _frames));
		return peak;
	}

	// What the meter shows: the main output's left and right, and every output's largest (the clip mark: the volume
	// is on every output bus, so a clip on an extra output counts too)
	struct Peaks
	{
		float left = 0.0f;
		float right = 0.0f;
		float all = 0.0f;
	};

	// The peaks of the blocks since the last take(). Single writer (the audio thread), the reader swaps in 0: three
	// lock-free maxima, no lock, no allocation.
	class Meter
	{
	public:
		// One block: the outputs after the gain (0 and 1 are the main output's left and right)
		template<size_t N> void onBlock(const std::array<float*, N>& _outputs, const size_t _frames) noexcept
		{
			static_assert(N >= 2, "the main output is two channels");
			const float l = peakOf(_outputs[0], _frames);
			const float r = peakOf(_outputs[1], _frames);
			float all = std::max(l, r);
			for(size_t i = 2; i < N; ++i)
				all = std::max(all, peakOf(_outputs[i], _frames));
			onBlock({l, r, all});
		}
		void onBlock(const Peaks& _p) noexcept
		{
			raise(m_left, _p.left);
			raise(m_right, _p.right);
			raise(m_all, _p.all);
		}
		Peaks take() noexcept
		{
			Peaks p;
			p.left = m_left.exchange(0.0f, std::memory_order_relaxed);
			p.right = m_right.exchange(0.0f, std::memory_order_relaxed);
			p.all = m_all.exchange(0.0f, std::memory_order_relaxed);
			return p;
		}

	private:
		static void raise(std::atomic<float>& _a, const float _v) noexcept
		{
			auto cur = _a.load(std::memory_order_relaxed);
			while(cur < _v && !_a.compare_exchange_weak(cur, _v, std::memory_order_relaxed))
			{
			}
		}
		static_assert(std::atomic<float>::is_always_lock_free, "the output meter's peaks must be lock-free floats");
		std::atomic<float> m_left{0.0f};
		std::atomic<float> m_right{0.0f};
		std::atomic<float> m_all{0.0f};
	};

	// A peak over 0 dBFS: a sample above 1 (the clip mark)
	inline bool clipped(const float _peak) { return _peak > 1.0f; }
}
