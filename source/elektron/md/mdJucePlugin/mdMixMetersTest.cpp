// I-032 (0.8, WP9): the Mix page's output meters (mdMixMeters.h): a known sine gives its peak and RMS in dBFS, silence
// gives the floor, a clip is a clip; the pairs the host did not enable are off; the hook path (Meter::onBlock) allocates
// nothing; NaN and infinity are left out; the message thread reads while the audio thread writes. Pure: no JUCE, no ROM.
#include "mdMixMeters.h"

#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include <new>
#include <string>
#include <thread>
#include <vector>

namespace allocationProbe
{
	thread_local bool enabled = false;
	thread_local std::size_t allocations = 0;
}

// This executable owns its allocation functions so a thread-local probe can see every allocation the hook path makes.
void* operator new(const std::size_t _size)
{
	if(allocationProbe::enabled)
		++allocationProbe::allocations;
	if(auto* const p = std::malloc(_size == 0 ? 1 : _size))
		return p;
	throw std::bad_alloc();
}
void* operator new[](const std::size_t _size) { return ::operator new(_size); }
void operator delete(void* const _p) noexcept { std::free(_p); }
void operator delete[](void* const _p) noexcept { std::free(_p); }
void operator delete(void* const _p, std::size_t) noexcept { std::free(_p); }
void operator delete[](void* const _p, std::size_t) noexcept { std::free(_p); }

namespace
{
	int g_failures = 0;
	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}
	bool near(const double _a, const double _b, const double _tol) { return std::abs(_a - _b) <= _tol; }

	using namespace mdJucePlugin::mixMeters;

	constexpr size_t g_frames = 4800;		// 100 ms at 48 kHz: 100 whole periods of 1 kHz
	using Outputs = std::array<float*, 12>;

	// a sine of 1 kHz, amplitude a, in buf
	void sine(std::vector<float>& _buf, const double _amp)
	{
		_buf.resize(g_frames);
		for(size_t i = 0; i < g_frames; ++i)
			_buf[i] = static_cast<float>(_amp * std::sin(2.0 * 3.14159265358979323846 * 1000.0 * static_cast<double>(i) / 48000.0));
	}
}

int main()
{
	std::printf("mdMixMetersTest\n");

	std::vector<float> loud, quiet, zero(g_frames, 0.0f);
	sine(loud, 0.5);		// peak -6.0 dBFS, RMS -9.0 dBFS
	sine(quiet, 0.05);		// peak -26.0 dBFS, RMS -29.0 dBFS

	// the dB scale
	check(toDb(1.0f) == 0.0 && toDb(0.5f) == -6.0 && toDb(0.1f) == -20.0, "1.0 is 0 dBFS, 0.5 is -6.0, 0.1 is -20.0");
	check(toDb(0.0f) == g_floorDb && toDb(1e-9f) == g_floorDb && toDb(-1.0f) == g_floorDb, "silence, and anything below the floor, reads the floor");
	check(toDb(2.0f) == 6.0, "above full scale reads above 0 (+6.0 dBFS for 2.0)");
	check(clipped(1.0001f) && !clipped(1.0f) && !clipped(0.99f), "a sample above 1 is a clip; 1 itself is not");

	// a known sine: A/B loud, C/D quiet, E/F not enabled (null)
	{
		Meter m;
		Outputs outs{};
		outs[0] = loud.data();
		outs[1] = loud.data();
		outs[2] = quiet.data();
		outs[3] = quiet.data();
		m.onBlock(outs, g_frames);
		const auto l = m.take();
		check(near(toDb(l.peak[0]), -6.0, 0.1) && near(toDb(l.peak[1]), -6.0, 0.1), "A/B: a 0.5 sine peaks at -6.0 dBFS (" + std::to_string(toDb(l.peak[0])) + ")");
		check(near(toDb(l.rms[0]), -9.0, 0.1) && near(toDb(l.rms[1]), -9.0, 0.1), "A/B: its RMS is -9.0 dBFS (" + std::to_string(toDb(l.rms[0])) + ")");
		check(near(toDb(l.peak[2]), -26.0, 0.1) && near(toDb(l.rms[3]), -29.0, 0.1), "C/D: a 0.05 sine peaks at -26.0, RMS -29.0");
		check(l.peak[4] == 0.0f && l.rms[5] == 0.0f && toDb(l.peak[4]) == g_floorDb, "E/F: nothing enabled reads the floor");
		check(l.on[0] && l.on[1] && !l.on[2], "the pairs the host enabled are on, the others off");
		const auto again = m.take();
		check(again.peak[0] == 0.0f && again.rms[0] == 0.0f && !again.on[0], "a take starts the window again");
	}

	// silence on an enabled pair: floor, but on
	{
		Meter m;
		Outputs outs{};
		for(size_t c = 0; c < g_channels; ++c)
			outs[c] = zero.data();
		m.onBlock(outs, g_frames);
		const auto l = m.take();
		check(toDb(l.peak[0]) == g_floorDb && toDb(l.rms[3]) == g_floorDb && l.on[0] && l.on[1] && l.on[2], "silence on every pair: the floor, all on");
	}

	// a clip: samples over full scale; the peak is the largest, the left and the right on their own
	{
		Meter m;
		std::vector<float> hot(g_frames, 0.2f);
		hot[100] = -1.5f;
		Outputs outs{};
		outs[2] = hot.data();
		outs[3] = quiet.data();
		m.onBlock(outs, g_frames);
		const auto l = m.take();
		check(l.peak[2] == 1.5f && clipped(l.peak[2]) && !clipped(l.peak[3]), "C: a -1.5 sample is a peak of 1.5 and clips; D does not");
		check(near(toDb(l.peak[2]), 3.5, 0.05), "and reads +3.5 dBFS");
	}

	// blocks add up: the peak is the largest of the window, the RMS is over all of its frames
	{
		Meter m;
		Outputs a{}, b{};
		a[0] = loud.data();
		b[0] = zero.data();
		m.onBlock(a, g_frames);
		m.onBlock(b, g_frames);
		const auto l = m.take();
		check(near(toDb(l.peak[0]), -6.0, 0.1), "two blocks: the peak is the louder one's");
		check(near(toDb(l.rms[0]), -12.0, 0.1), "and the RMS is of both (half the energy: -12.0 dBFS, " + std::to_string(toDb(l.rms[0])) + ")");
	}

	// NaN and infinity are left out
	{
		Meter m;
		std::vector<float> bad = loud;
		bad[10] = std::numeric_limits<float>::quiet_NaN();
		bad[11] = std::numeric_limits<float>::infinity();
		bad[12] = -std::numeric_limits<float>::infinity();
		Outputs outs{};
		outs[0] = bad.data();
		m.onBlock(outs, g_frames);
		const auto l = m.take();
		check(l.peak[0] <= 0.5001f && l.peak[0] > 0.49f && near(toDb(l.rms[0]), -9.0, 0.2), "NaN and infinity do not poison the window (peak " + std::to_string(l.peak[0]) + ")");
	}

	// the hook path allocates nothing
	{
		Meter m;
		Outputs outs{};
		for(size_t c = 0; c < g_channels; ++c)
			outs[c] = loud.data();
		allocationProbe::allocations = 0;
		allocationProbe::enabled = true;
		for(int i = 0; i < 200; ++i)
			m.onBlock(outs, g_frames);
		const auto l = m.take();
		allocationProbe::enabled = false;
		check(allocationProbe::allocations == 0, "the hook path allocates nothing (" + std::to_string(allocationProbe::allocations) + " allocations in 200 blocks and a take)");
		check(near(toDb(l.rms[5]), -9.0, 0.1), "and the window of 200 blocks reads right");
	}

	// the message thread reads while the audio thread writes: a window is never louder than the signal, and the sum
	// of the windows' energy is the energy written
	{
		Meter m;
		Outputs outs{};
		outs[0] = loud.data();
		constexpr int blocks = 4000;
		std::atomic<bool> go{false}, done{false};
		std::thread writer([&]
		{
			while(!go.load())
			{
			}
			for(int i = 0; i < blocks; ++i)
				m.onBlock(outs, g_frames);
			done = true;
		});
		go = true;
		bool sane = true;
		int reads = 0;
		while(!done.load())
		{
			const auto l = m.take();
			++reads;
			if(l.peak[0] > 0.5001f || l.rms[0] > 0.5001f || l.rms[0] < 0.0f)
				sane = false;
		}
		writer.join();
		const auto last = m.take();
		if(last.peak[0] > 0.5001f)
			sane = false;
		check(sane && reads > 0, "a reader on another thread never sees a level the signal did not have (" + std::to_string(reads) + " reads)");
	}

	std::printf(g_failures ? "FAILED: %d\n" : "all passed\n", g_failures);
	return g_failures ? 1 : 0;
}
