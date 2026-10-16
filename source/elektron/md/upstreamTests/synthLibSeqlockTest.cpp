// synthLib::Seqlock (DESIGN-audio-lock.md step 2, the facts snapshot): one writer at a time, readers without a lock.
// Readers racing writers that never stop must only ever see whole values (every word of a value written together),
// never one torn between two writes, never an older value than one they already saw or than the last write that had
// completed when the read began, and must make progress.
//
// A whole value is either the constructor's T{} (readers that run before the first write read it: the test before
// 2026-10-16 counted those as torn, which is what failed on Windows CI and once on macOS under load) or make(n).
// The same file builds synthLibSeqlockTsanTest with -fsanitize=thread where the compiler has it (CMakeLists.txt).
// MDMM_SEQLOCK_TEST_MS sets how long each concurrent case runs (default 500 ms).

#include "synthLib/seqlock.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

namespace
{
	// 40 words, all made from one counter: a torn read mixes counters (or mixes T{} with a counter)
	struct Value
	{
		uint64_t counter = 0;
		std::array<uint64_t, 38> words{};
		uint32_t check = 0;
		uint8_t flag = 0;
	};

	Value make(const uint64_t _counter)
	{
		Value v;
		v.counter = _counter;
		for(size_t i = 0; i < v.words.size(); ++i)
			v.words[i] = _counter * 2654435761u + i;
		v.check = static_cast<uint32_t>(_counter ^ 0xa5a5a5a5u);
		v.flag = static_cast<uint8_t>(_counter & 1);
		return v;
	}

	bool same(const Value& _a, const Value& _b)
	{
		return _a.counter == _b.counter && _a.words == _b.words && _a.check == _b.check && _a.flag == _b.flag;
	}

	// The writers write make(1), make(2), ...; before the first, the seqlock holds Value{}
	bool whole(const Value& _v)
	{
		return _v.counter == 0 ? same(_v, Value{}) : same(_v, make(_v.counter));
	}

	int fail(const char* const _message)
	{
		std::cerr << _message << '\n';
		return 1;
	}

	std::chrono::milliseconds runTime()
	{
		if(const char* const ms = std::getenv("MDMM_SEQLOCK_TEST_MS"))
			return std::chrono::milliseconds(std::max(10, std::atoi(ms)));
		return std::chrono::milliseconds(500);
	}

	int testDefaultAndSingleThread()
	{
		synthLib::Seqlock<Value> s;
		if(!same(s.read(), Value{}))
			return fail("a new seqlock does not read the default value");
		s.write(make(42));
		Value v;
		if(!s.tryRead(v) || v.counter != 42 || !whole(v))
			return fail("a written value is not read back");
		if(s.writes() != 2)
			return fail("the writes are not counted");
		return 0;
	}

	// A size that is not a multiple of the word: the last word is partly padding
	int testOddSize()
	{
		using Odd = std::array<uint8_t, 13>;
		synthLib::Seqlock<Odd> s;
		Odd a{};
		for(size_t i = 0; i < a.size(); ++i)
			a[i] = static_cast<uint8_t>(0xf0 + i);
		s.write(a);
		if(s.read() != a)
			return fail("a 13-byte value is not read back");
		return 0;
	}

	// _writers threads write in turn under one mutex (as synthLib::Plugin's holders of its device lock do)
	int testConcurrent(const int _writers, const int _readers)
	{
		synthLib::Seqlock<Value> s;
		std::mutex writeLock;
		uint64_t next = 1;							// under writeLock
		std::atomic<uint64_t> completed{0};			// the last write that returned
		std::atomic<bool> run{true};

		std::vector<std::thread> writers;
		for(int w = 0; w < _writers; ++w)
			writers.emplace_back([&]
			{
				while(run.load(std::memory_order_relaxed))
				{
					const std::lock_guard lock(writeLock);
					const auto c = next++;
					s.write(make(c));
					completed.store(c, std::memory_order_release);
				}
			});

		std::atomic<uint64_t> reads{0}, torn{0}, retried{0}, backwards{0}, stale{0};
		std::vector<std::thread> readers;
		for(int r = 0; r < _readers; ++r)
			readers.emplace_back([&]
			{
				uint64_t last = 0;
				const auto check = [&](const Value& _v, const uint64_t _floor)
				{
					reads.fetch_add(1, std::memory_order_relaxed);
					if(!whole(_v))
						torn.fetch_add(1, std::memory_order_relaxed);
					if(_v.counter < last)
						backwards.fetch_add(1, std::memory_order_relaxed);
					if(_v.counter < _floor)
						stale.fetch_add(1, std::memory_order_relaxed);
					last = std::max(last, _v.counter);
				};
				while(run.load(std::memory_order_relaxed))
				{
					auto floor = completed.load(std::memory_order_acquire);
					Value v;
					if(s.tryRead(v))
						check(v, floor);
					else
						retried.fetch_add(1, std::memory_order_relaxed);	// met a write in progress
					floor = completed.load(std::memory_order_acquire);
					check(s.read(), floor);
				}
			});

		std::this_thread::sleep_for(runTime());
		run = false;
		for(auto& t : writers)
			t.join();
		for(auto& t : readers)
			t.join();

		std::cout << "  " << _writers << " writer(s), " << _readers << " readers: " << completed.load() << " writes, "
			<< reads.load() << " reads, " << retried.load() << " retried, " << torn.load() << " torn, "
			<< backwards.load() << " went back, " << stale.load() << " stale\n";
		if(torn)
			return fail("a read returned a value torn between two writes");
		if(backwards)
			return fail("a reader saw an older value after a newer one");
		if(stale)
			return fail("a read returned a value older than a write that had completed before it began");
		if(!reads || completed.load() < 1000)
			return fail("the writer or the readers made no progress");
		return 0;
	}
}

int main()
{
	if(const auto r = testDefaultAndSingleThread())
		return r;
	if(const auto r = testOddSize())
		return r;
	// More readers than cores too, so writers are preempted in the middle of a write
	const auto cores = static_cast<int>(std::max(2u, std::thread::hardware_concurrency()));
	if(const auto r = testConcurrent(1, 3))
		return r;
	if(const auto r = testConcurrent(2, cores + 2))
		return r;
	std::cout << "synthLib seqlock tests passed\n";
	return 0;
}
