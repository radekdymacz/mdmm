// synthLib::Seqlock (DESIGN-audio-lock.md step 2, the facts snapshot): one writer, readers without a lock. Readers
// racing a writer that never stops must only ever see whole values (every word of a value written together), never
// one torn between two writes, and must make progress.

#include "synthLib/seqlock.h"

#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <thread>
#include <vector>

namespace
{
	// 41 words, all made from one counter: a torn read mixes counters
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

	bool whole(const Value& _v)
	{
		const auto expected = make(_v.counter);
		return _v.words == expected.words && _v.check == expected.check && _v.flag == expected.flag;
	}

	int fail(const char* const _message)
	{
		std::cerr << _message << '\n';
		return 1;
	}

	int testDefaultAndSingleThread()
	{
		synthLib::Seqlock<Value> s;
		const auto initial = s.read();
		if(initial.counter != 0 || initial.words != Value{}.words || initial.check != 0)
			return fail("a new seqlock does not read the default value");
		s.write(make(42));
		Value v;
		if(!s.tryRead(v) || v.counter != 42 || !whole(v))
			return fail("a written value is not read back");
		if(s.writes() != 2)
			return fail("the writes are not counted");
		return 0;
	}

	int testConcurrentWriterReaders()
	{
		synthLib::Seqlock<Value> s;
		std::atomic<bool> run{true};
		std::atomic<uint64_t> written{0};
		std::thread writer([&]
		{
			uint64_t c = 1;
			while(run.load(std::memory_order_relaxed))
			{
				s.write(make(c));
				written.store(c++, std::memory_order_relaxed);
			}
		});
		std::atomic<uint64_t> reads{0}, torn{0}, retried{0}, backwards{0};
		std::vector<std::thread> readers;
		for(int r = 0; r < 3; ++r)
			readers.emplace_back([&]
			{
				uint64_t last = 0;
				while(run.load(std::memory_order_relaxed))
				{
					Value v;
					if(!s.tryRead(v))
					{
						++retried;	// met a write in progress: read again
						continue;
					}
					++reads;
					if(!whole(v))
						++torn;
					if(v.counter < last)
						++backwards;
					last = v.counter;
					const auto b = s.read();
					if(!whole(b))
						++torn;
				}
			});
		std::this_thread::sleep_for(std::chrono::milliseconds(600));
		run = false;
		writer.join();
		for(auto& t : readers)
			t.join();
		std::cout << "  " << written.load() << " writes, " << reads.load() << " reads, " << retried.load() << " retried, "
			<< torn.load() << " torn, " << backwards.load() << " went back\n";
		if(torn)
			return fail("a read returned a value torn between two writes");
		if(backwards)
			return fail("a reader saw an older value after a newer one");
		if(!reads || written.load() < 1000)
			return fail("the writer or the readers made no progress");
		return 0;
	}
}

int main()
{
	if(const auto r = testDefaultAndSingleThread())
		return r;
	if(const auto r = testConcurrentWriterReaders())
		return r;
	std::cout << "synthLib seqlock tests passed\n";
	return 0;
}
