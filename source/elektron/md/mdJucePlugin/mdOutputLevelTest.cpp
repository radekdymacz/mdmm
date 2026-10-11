// I-021: the LCD's output meter and volume (mdOutputLevel.h): the volume's range (dB to gain and back, off at the
// floor, +6 dB at most), a block's peak across the outputs, and the meter's left, right and clip peaks since the last
// take (also with a reader on another thread). Pure: no JUCE.
#include "mdOutputLevel.h"

#include <cmath>
#include <cstdio>
#include <string>
#include <thread>

namespace
{
	int g_failures = 0;
	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}
	bool near(const double _a, const double _b, const double _tol = 1e-4) { return std::abs(_a - _b) <= _tol; }

	using namespace mdJucePlugin::outputLevel;
}

int main()
{
	std::printf("mdOutputLevelTest\n");

	// the volume's range
	{
		check(gainOfDb(0) == 1.0f, "0 dB is unity gain");
		check(near(gainOfDb(-6), 0.501187), "-6 dB is half the level");
		check(near(gainOfDb(6), 1.995262) && gainOfDb(12) == gainOfDb(6), "+6 dB at most");
		check(gainOfDb(-60) == 0.0f && gainOfDb(-100) == 0.0f, "the floor (-60 dB) and below is off");
		check(gainOfDb(-59.9) > 0.0f, "just above the floor still sounds");
		check(dbOfGain(1.0f) == 0.0, "unity gain reads 0 dB");
		check(dbOfGain(gainOfDb(-12.3)) == -12.3 && dbOfGain(gainOfDb(4.5)) == 4.5, "dB to gain and back, 0.1 dB steps");
		check(!dbOfGain(0.0f) && !dbOfGain(-1.0f) && !dbOfGain(1e-4f), "off, or at the floor and below: no dB (-inf)");
		check(dbOfGain(4.0f) == g_maxDb, "a gain above +6 dB (set elsewhere) reads +6 dB");
	}

	// a block's peak across the outputs
	{
		float a[4] = {0.1f, -0.7f, 0.2f, 0.0f};
		float b[4] = {0.0f, 0.3f, -0.4f, 0.65f};
		std::array<float*, 12> outs{};
		outs[0] = a;
		outs[5] = b;	// an extra output, the ones between not enabled
		check(peakOf(outs, 4) == 0.7f, "the largest |sample| of every enabled output (a negative one too)");
		check(peakOf(outs, 0) == 0.0f, "no frames: no peak");
		std::array<float*, 12> none{};
		check(peakOf(none, 4) == 0.0f, "no outputs: no peak");
		float c[2] = {1.25f, 0.0f};
		outs[7] = c;
		check(clipped(peakOf(outs, 2)) && !clipped(1.0f) && !clipped(0.99f), "a sample above 1 is a clip; 1 itself is not");
	}

	// the meter: the main output's left and right, every output's for the clip, since the last take
	{
		Meter m;
		const auto none = m.take();
		check(none.left == 0.0f && none.right == 0.0f && none.all == 0.0f, "nothing yet: 0");
		float l[3] = {0.1f, -0.3f, 0.2f};
		float r[3] = {0.6f, 0.0f, -0.5f};
		float extra[3] = {0.0f, 1.5f, 0.0f};
		std::array<float*, 12> outs{};
		outs[0] = l;
		outs[1] = r;
		m.onBlock(outs, 3);
		l[1] = -0.8f;
		r[0] = 0.2f;
		m.onBlock(outs, 3);
		auto p = m.take();
		check(p.left == 0.8f && p.right == 0.6f && p.all == 0.8f, "left and right apart, each its largest block's peak since the last take");
		p = m.take();
		check(p.left == 0.0f && p.right == 0.0f && p.all == 0.0f, "a take starts again");
		outs[4] = extra;
		m.onBlock(outs, 3);
		p = m.take();
		check(p.left == 0.8f && p.right == 0.5f && clipped(p.all) && !clipped(p.left), "an extra output's clip counts for the clip mark, not for the bars");
		std::array<float*, 12> mono{};
		mono[0] = l;
		m.onBlock(mono, 3);
		p = m.take();
		check(p.left == 0.8f && p.right == 0.0f, "no right channel (not enabled): its bar stays down");

		// a writer raising it while a reader takes: every taken value is one the writer gave, the largest is seen
		Meter t;
		std::atomic<bool> done{false};
		std::thread writer([&]
		{
			for(int i = 0; i < 200000; ++i)
			{
				const float v = static_cast<float>(i % 100) / 100.0f;
				t.onBlock(Peaks{v, v / 2, v});
			}
			t.onBlock(Peaks{0.995f, 0.4975f, 0.995f});
			done = true;
		});
		float largest = 0.0f;
		bool sane = true;
		while(!done)
		{
			const auto v = t.take();
			sane = sane && v.left >= 0.0f && v.left <= 0.995f && v.right <= 0.4975f;
			largest = std::max(largest, v.left);
		}
		writer.join();
		largest = std::max(largest, t.take().left);
		check(sane && largest == 0.995f, "with a reader on another thread: no torn value, the largest is taken");
	}

	std::printf(g_failures ? "mdOutputLevelTest: %d failed\n" : "mdOutputLevelTest: all passed\n", g_failures);
	return g_failures ? 1 : 0;
}
