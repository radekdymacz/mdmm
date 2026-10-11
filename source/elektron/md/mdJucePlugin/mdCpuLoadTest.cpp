// I-018: the CPU meter's measurement (mdCpuLoad.h): the audio thread's totals and worst block, and the smoother's
// reading (the load smoothed over about half a second, the worst block of the last 3 s, stopped / bypassed /
// offline instead of 0 %). Pure: no JUCE, the time is injected.
#include "mdCpuLoad.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <string>
#include <thread>
#include <vector>

namespace
{
	int g_failures = 0;
	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}
	bool near(const double _a, const double _b, const double _tol = 1e-6) { return std::abs(_a - _b) <= _tol; }

	using namespace mdJucePlugin::cpuLoad;

	// a block of 480 frames at 48 kHz has a 10 ms budget
	constexpr int g_frames = 480;
	constexpr double g_rate = 48000;
	constexpr uint64_t g_budgetNs = 10000000;
	uint64_t ns(const double _share) { return static_cast<uint64_t>(_share * static_cast<double>(g_budgetNs)); }

	// _blocks blocks of _share each, then a reading at _ms
	Reading run(Meter& _m, Smoother& _s, const int _blocks, const double _share, const double _ms)
	{
		for(int i = 0; i < _blocks; ++i)
			_m.onBlock(ns(_share), g_frames, g_rate, false);
		return _s.add(_m.take(), _ms);
	}
}

int main()
{
	std::printf("mdCpuLoadTest\n");

	// the audio thread's totals
	{
		Meter m;
		m.onBlock(ns(0.25), g_frames, g_rate, false);
		m.onBlock(ns(0.75), g_frames, g_rate, false);
		m.onBlock(ns(5.0), g_frames, g_rate, true);		// offline: counted, not measured
		m.onBypassed();
		m.onBlock(ns(0.5), 0, g_rate, false);			// no frames: no budget, nothing counted
		m.onBlock(ns(0.5), g_frames, 0, false);			// no rate: the same
		const auto t = m.take();
		check(t.blocks == 2 && t.busyNs == ns(0.25) + ns(0.75) && t.budgetNs == 2 * g_budgetNs,
			"two realtime blocks: their time and their 10 ms budgets summed");
		check(t.offline == 1 && t.bypassed == 1, "an offline block and a bypassed call are counted apart");
		check(near(t.worst, 0.75, 1e-4), "the worst block since the last take: 75 %");
		const auto u = m.take();
		check(u.worst == 0 && u.blocks == 2, "taking starts the worst again; the totals stay");
		m.onBlock(ns(3.0), g_frames, g_rate, false);
		check(near(m.take().worst, 3.0, 1e-4), "an overload is kept as it is (300 %), not clipped");
	}

	// the worst block from two threads at once: the maximum is never lost to the reader's swap
	{
		Meter m;
		std::thread audio([&]
		{
			for(int i = 0; i < 200000; ++i)
				m.onBlock(ns(i == 123456 ? 2.5 : 0.1), g_frames, g_rate, false);
		});
		double worst = 0;
		uint64_t blocks = 0;
		while(blocks < 200000)
		{
			const auto t = m.take();
			worst = std::max(worst, t.worst);
			blocks = t.blocks;
		}
		audio.join();
		worst = std::max(worst, m.take().worst);
		check(near(worst, 2.5, 1e-4), "one 250 % block among 200000 read while they come: seen as the worst");
	}

	// the reading: smoothing, the worst of the last 3 s, the states
	{
		Meter m;
		Smoother s;
		auto r = s.add(m.take(), 0);
		check(r.state == State::None, "before the first block: none (the meter says so, not 0 %)");
		r = s.add(m.take(), 250);
		check(r.state == State::None && r.load == 0, "still no block: none");

		r = run(m, s, 25, 0.2, 500);
		check(r.state == State::Running && near(r.load, 0.2), "the first blocks: running, the load is theirs at once (20 %)");
		r = run(m, s, 25, 0.6, 750);
		const double k = 1.0 - std::exp(-250.0 / Smoother::g_tauMs);
		check(near(r.load, 0.2 + 0.4 * k) && near(r.window, 0.6), "a jump to 60 %: smoothed with a 0.5 s time constant");
		double load = r.load;
		for(int i = 1; i <= 8; ++i)
			load = run(m, s, 25, 0.6, 750 + 250 * i).load;
		check(near(load, 0.6, 0.01), "after 2 s at 60 %: the load is 60 %");

		// one slow block among quiet ones: the worst is marked for 3 s
		m.onBlock(ns(1.3), g_frames, g_rate, false);
		r = run(m, s, 24, 0.6, 3000);
		check(near(r.worst, 1.3, 1e-4) && r.load < 0.7, "one block at 130 %: the worst says 130 %, the load hardly moves");
		r = run(m, s, 25, 0.6, 5500);
		check(near(r.worst, 1.3, 1e-4), "2.5 s later it is still marked");
		r = run(m, s, 25, 0.6, 6100);
		check(near(r.worst, 0.6, 1e-4), "after 3 s it is gone (the worst is the recent blocks', never below the load)");

		// the host stops the engine: a short gap is still running, then stopped (not 0 %)
		r = s.add(m.take(), 6350);
		check(r.state == State::Running && near(r.load, load, 0.01), "250 ms without a block: still running, the last load");
		r = s.add(m.take(), 6700);
		check(r.state == State::Stopped && r.load == 0 && r.worst == 0, "600 ms without a block: stopped");
		r = run(m, s, 25, 0.1, 6950);
		check(r.state == State::Running && near(r.load, 0.1) && near(r.worst, 0.1, 1e-4),
			"running again: a fresh average (10 %), the old worst forgotten");

		// bypassed or offline instead of running
		r = s.add(m.take(), 7200);
		m.onBypassed();
		r = s.add(m.take(), 7700);
		check(r.state == State::Bypassed, "only bypassed calls: bypassed");
		m.onBlock(ns(0.5), g_frames, g_rate, true);
		r = s.add(m.take(), 7950);
		check(r.state == State::Offline, "only offline blocks: offline");
	}

	// a reading after a long gap (the page was hidden): the new window's load at once
	{
		Meter m;
		Smoother s;
		run(m, s, 10, 0.9, 0);
		run(m, s, 10, 0.9, 250);
		const auto r = run(m, s, 10, 0.3, 60000);
		check(r.state == State::Running && near(r.load, 0.3, 1e-3), "a minute later: the load is the new blocks' (30 %)");
	}

	// the cost: a block's bookkeeping in nanoseconds (informative; the meter must be negligible beside a block)
	{
		Meter m;
		const auto t0 = std::chrono::steady_clock::now();
		constexpr int n = 1000000;
		// as the processor does it: a clock read when the block starts, one when it ends, then the bookkeeping
		for(int i = 0; i < n; ++i)
		{
			const auto a = std::chrono::steady_clock::now();
			const auto b = std::chrono::steady_clock::now();
			m.onBlock(static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(b - a).count()), g_frames, g_rate, false);
		}
		const double each = std::chrono::duration<double, std::nano>(std::chrono::steady_clock::now() - t0).count() / n;
		std::printf("  info: two clock reads and Meter::onBlock: %.1f ns a block (a 10 ms block's budget is 10000000 ns)\n", each);
		check(m.take().blocks == static_cast<uint64_t>(n) && each < 1000, "a block's bookkeeping takes well under a microsecond");
	}

	std::printf(g_failures ? "mdCpuLoadTest: FAIL (%d)\n" : "mdCpuLoadTest: PASS\n", g_failures);
	return g_failures ? 1 : 0;
}
