#pragma once

// A value one thread at a time writes and any thread reads without a lock (DESIGN-audio-lock.md step 2, the facts
// snapshot): the writer never waits, a reader that met a write in progress reads again. The value is kept as relaxed
// atomic words between two sequence numbers (Boehm, "Can seqlocks get along with programming language memory
// models?", 2012), so there is no data race even when a read and a write overlap.
// Writers must be serialised by the caller (synthLib::Plugin: only the holder of its device lock writes).
// Until the first write() a reader gets T{} (the constructor's write), a whole value like any other: the test once
// counted it as torn (DESIGN-audio-lock.md, "The seqlock test failures of 2026-10-16").

#include <array>
#include <atomic>
#include <cstdint>
#include <cstring>
#include <thread>
#include <type_traits>

namespace synthLib
{
	template<typename T>
	class Seqlock
	{
		static_assert(std::is_trivially_copyable_v<T>, "a seqlock holds a plain value");
		static constexpr size_t Words = (sizeof(T) + sizeof(uint64_t) - 1) / sizeof(uint64_t);

	public:
		Seqlock() { write(T{}); }

		// One writer at a time. Never waits.
		void write(const T& _value) noexcept
		{
			std::array<uint64_t, Words> words{};
			std::memcpy(words.data(), &_value, sizeof(T));
			const auto sequence = m_sequence.load(std::memory_order_relaxed);
			m_sequence.store(sequence + 1, std::memory_order_relaxed);	// odd: a write is in progress
			std::atomic_thread_fence(std::memory_order_release);
			for(size_t i = 0; i < Words; ++i)
				m_words[i].store(words[i], std::memory_order_relaxed);
			m_sequence.store(sequence + 2, std::memory_order_release);
		}

		// False when a write overlapped the read (_value is then unspecified): read again
		bool tryRead(T& _value) const noexcept
		{
			const auto before = m_sequence.load(std::memory_order_acquire);
			if(before & 1)
				return false;
			std::array<uint64_t, Words> words;
			for(size_t i = 0; i < Words; ++i)
				words[i] = m_words[i].load(std::memory_order_relaxed);
			std::atomic_thread_fence(std::memory_order_acquire);
			if(m_sequence.load(std::memory_order_relaxed) != before)
				return false;
			std::memcpy(&_value, words.data(), sizeof(T));
			return true;
		}

		// Any thread: the last complete write. Retries while writes overlap (a write is a few stores; a writer
		// preempted in the middle of one is waited for by yielding)
		T read() const noexcept
		{
			T value;
			for(uint32_t attempt = 0; !tryRead(value); ++attempt)
			{
				if(attempt > 64)
					std::this_thread::yield();
			}
			return value;
		}

		// How many writes completed
		uint64_t writes() const noexcept { return m_sequence.load(std::memory_order_acquire) / 2; }

	private:
		std::atomic<uint64_t> m_sequence{0};
		std::array<std::atomic<uint64_t>, Words> m_words{};
	};
}
