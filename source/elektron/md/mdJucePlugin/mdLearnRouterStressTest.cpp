// 0.8 (MIDI Learn L1, doc/midilearn/DESIGN-learn-0.8.md "Tests" 3): the router under two threads. One thread stands
// in for the audio thread: block start, then mapped and unmapped CCs, in a loop. The main thread publishes tables,
// switches learning on and off, drains the ring and takes the touched bits. Every table is a function of its
// generation, so the audio thread checks that the copy it reads is exactly one published table (never torn). Built a
// second time with ThreadSanitizer (mdLearnRouterStressTestTsan, macOS): no report. Pure: no JUCE, no ROM.
#include "mdLearnRouter.h"

#include "deskCore/deskLearn.h"

#include <array>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <thread>

namespace pluginLib
{
	class Parameter
	{
	public:
		std::atomic<int> value{0};
	};
}

namespace
{
	using namespace mdJucePlugin;

	constexpr size_t g_params = 32;
	std::array<pluginLib::Parameter, g_params> g_param;

	bool apply(pluginLib::Parameter& _p, const LearnTarget& _t, const uint8_t _value)
	{
		const auto current = _p.value.load(std::memory_order_relaxed);
		const auto next = learnedValue(_t.mode, _t.invert != 0, _value, current, 0, 127);
		_p.value.store(next, std::memory_order_relaxed);
		return next != current;
	}

	// Table number _g: its size, targets, chains and channels all follow from _g
	LearnTable makeTable(const uint32_t _g)
	{
		LearnTable t;
		t.generation = _g;
		const size_t n = _g == 0 ? 0 : 1 + _g % LearnTable::MaxTargets;
		for(size_t i = 0; i < n; ++i)
		{
			LearnTarget target;
			target.param = &g_param[(_g + i) % g_params];
			target.mode = static_cast<uint8_t>((_g + i) % 3);
			target.invert = static_cast<uint8_t>((_g + i) & 1);
			target.mapping = static_cast<uint8_t>(i);
			t.add((_g + i) % 17, static_cast<uint8_t>((_g * 7 + i * 3) % 120), target);
		}
		return t;
	}

	uint64_t bitCount(uint64_t _v)
	{
		uint64_t n = 0;
		for(; _v; _v &= _v - 1)
			++n;
		return n;
	}

	bool sameTable(const LearnTable& _a, const LearnTable& _b)
	{
		if(_a.generation != _b.generation || _a.count != _b.count || _a.head != _b.head)
			return false;
		for(size_t i = 0; i < _a.count; ++i)
		{
			const auto& x = _a.targets[i];
			const auto& y = _b.targets[i];
			if(x.param != y.param || x.mode != y.mode || x.invert != y.invert || x.next != y.next || x.mapping != y.mapping)
				return false;
		}
		return true;
	}
}

int main(int _argc, char** _argv)
{
	const double seconds = _argc > 1 ? std::atof(_argv[1]) : 2.0;
	std::printf("mdLearnRouterStressTest (%.1f s)\n", seconds);

	LearnRouter router(&apply);
	router.publish(makeTable(1));

	std::atomic<bool> stop{false};
	std::atomic<uint64_t> blocks{0}, torn{0}, distinct{0}, consumed{0}, backwards{0};

	std::thread audio([&]
	{
		uint32_t last = 0;
		LearnTable expected = makeTable(0);
		uint32_t cc = 0;
		while(!stop.load(std::memory_order_acquire))
		{
			router.beginBlock();
			const auto& table = router.table();
			if(table.generation != last)
			{
				if(table.generation < last)
					backwards.fetch_add(1, std::memory_order_relaxed);
				last = table.generation;
				expected = makeTable(last);
				distinct.fetch_add(1, std::memory_order_relaxed);
			}
			// every block, not only when the generation moved: the copy in use is exactly the published table of its
			// generation, whole, however many writes overlapped it
			if(!sameTable(table, expected))
				torn.fetch_add(1, std::memory_order_relaxed);
			uint64_t c = 0;
			for(int i = 0; i < 32; ++i)
			{
				cc = (cc + 1) % 128;
				const auto status = static_cast<uint8_t>(0xb0 | (cc % 16));
				c += router.translate(status, static_cast<uint8_t>(cc), static_cast<uint8_t>(i * 4)) ? 1 : 0;
				router.translate(0x90, static_cast<uint8_t>(cc), 100);		// a note: never consumed
			}
			consumed.fetch_add(c, std::memory_order_relaxed);
			blocks.fetch_add(1, std::memory_order_relaxed);
		}
	});

	const auto start = std::chrono::steady_clock::now();
	uint32_t generation = 1;
	uint64_t drained = 0, touched = 0, toggles = 0;
	while(std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count() < seconds)
	{
		router.publish(makeTable(++generation));
		if(generation % 64 == 0)
		{
			router.setLearning(!router.learning());
			++toggles;
		}
		router.drainCaptured([&](const uint8_t _s, uint8_t, uint8_t)
		{
			if((_s & 0xf0) == 0xb0)
				++drained;
		});
		const auto bits = router.takeTouched();
		touched += bitCount(bits[0]) + bitCount(bits[1]);
	}
	stop.store(true, std::memory_order_release);
	audio.join();
	router.drainCaptured([&](uint8_t, uint8_t, uint8_t) { ++drained; });

	const auto counts = router.counts();
	std::printf("  tables published %u, seen %llu, blocks %llu, consumed %llu, applied %llu, captured %llu (dropped %llu, drained %llu), touched bits %llu, learning toggles %llu\n",
		generation, static_cast<unsigned long long>(distinct.load()), static_cast<unsigned long long>(blocks.load()),
		static_cast<unsigned long long>(consumed.load()), static_cast<unsigned long long>(counts.applied),
		static_cast<unsigned long long>(counts.captured), static_cast<unsigned long long>(counts.capturedDropped),
		static_cast<unsigned long long>(drained), static_cast<unsigned long long>(touched),
		static_cast<unsigned long long>(toggles));

	int failures = 0;
	auto check = [&](const bool _ok, const char* _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what);
		if(!_ok)
			++failures;
	};
	check(torn.load() == 0, "every table the audio thread used is exactly one published table");
	check(backwards.load() == 0, "the audio thread never goes back to an older table");
	check(distinct.load() > 1 && blocks.load() > 100, "the audio thread ran and took new tables");
	check(consumed.load() > 0 && counts.applied > 0, "mapped CCs were consumed and applied");
	// switching learning on empties the ring, so a CC captured just before can be dropped there: never more drained
	check(drained <= counts.captured && (counts.captured == 0 || drained > 0), "the captured CCs were drained on the main thread");
	check(counts.captured > 0, "learning was on for some blocks and captured CCs");
	check(counts.notOnAudioThread == 0, "every CC came from the audio thread");

	if(failures)
	{
		std::printf("mdLearnRouterStressTest: %d FAILED\n", failures);
		return 1;
	}
	std::printf("mdLearnRouterStressTest: all passed\n");
	return 0;
}
