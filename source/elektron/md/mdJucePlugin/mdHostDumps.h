#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace mdJucePlugin
{
	// I-070 (AUTO RECEIVE): the Monomachine's user-data dumps from the host's MIDI in, taken off the raw way to the
	// firmware (which drops them outside SYSEX RECV) and handed to the session, which sends them the way IMPORT SYSEX
	// does (doc/release/0.9/mm-auto-receive.md).

	// A whole Monomachine kit, pattern, song or global dump: F0 00 20 3C 03 00 <id> .. F7. Other SysEx (requests, the
	// 0x5x commands that act on every screen, DigiPRO waveforms) is not one.
	inline bool isMmUserDump(const uint8_t* _data, const size_t _size)
	{
		if(!_data || _size < 10 || _data[0] != 0xf0 || _data[_size - 1] != 0xf7)
			return false;
		if(_data[1] != 0x00 || _data[2] != 0x20 || _data[3] != 0x3c || _data[4] != 0x03 || _data[5] != 0x00)
			return false;
		const auto id = _data[6];
		return id == 0x50 || id == 0x52 || id == 0x67 || id == 0x69;
	}

	// The dumps on their way from the audio thread to the session: a byte ring with a 4-byte length before each message,
	// its memory taken once (the constructor). push never allocates, waits or locks: a second producer at the same time
	// (a MIDI port's thread, a test's injection) or a message that does not fit returns false, and the caller lets the
	// message go its old way. pop is the session's (one consumer).
	class HostDumpInbox
	{
	public:
		static constexpr size_t g_capacity = 256 * 1024;	// a full Monomachine backup is about 200 KB

		explicit HostDumpInbox(const size_t _capacity = g_capacity) : m_ring(_capacity) {}

		bool push(const uint8_t* _data, const size_t _size)
		{
			if(!_size || _size > 0xffffffu)
				return false;
			if(m_pushing.test_and_set(std::memory_order_acquire))
				return false;
			const auto head = m_head.load(std::memory_order_relaxed);
			const auto tail = m_tail.load(std::memory_order_acquire);
			const bool fits = m_ring.size() - (head - tail) >= _size + 4;
			if(fits)
			{
				const uint8_t len[4] = {static_cast<uint8_t>(_size), static_cast<uint8_t>(_size >> 8), static_cast<uint8_t>(_size >> 16), 0};
				write(head, len, 4);
				write(head + 4, _data, _size);
				m_head.store(head + 4 + _size, std::memory_order_release);
			}
			m_pushing.clear(std::memory_order_release);
			return fits;
		}

		// The oldest message, or false when there is none.
		bool pop(std::vector<uint8_t>& _out)
		{
			const auto tail = m_tail.load(std::memory_order_relaxed);
			const auto head = m_head.load(std::memory_order_acquire);
			if(head == tail)
				return false;
			uint8_t len[4];
			read(tail, len, 4);
			const size_t size = static_cast<size_t>(len[0]) | static_cast<size_t>(len[1]) << 8 | static_cast<size_t>(len[2]) << 16;
			_out.resize(size);
			read(tail + 4, _out.data(), size);
			m_tail.store(tail + 4 + size, std::memory_order_release);
			return true;
		}

		bool empty() const { return m_head.load(std::memory_order_acquire) == m_tail.load(std::memory_order_acquire); }

	private:
		void write(const size_t _at, const uint8_t* _data, const size_t _size)
		{
			for(size_t i = 0; i < _size; ++i)
				m_ring[(_at + i) % m_ring.size()] = _data[i];
		}
		void read(const size_t _at, uint8_t* _data, const size_t _size) const
		{
			for(size_t i = 0; i < _size; ++i)
				_data[i] = m_ring[(_at + i) % m_ring.size()];
		}

		std::vector<uint8_t> m_ring;
		std::atomic<size_t> m_head{0};	// bytes written, ever (the producer's)
		std::atomic<size_t> m_tail{0};	// bytes read, ever (the consumer's)
		std::atomic_flag m_pushing = ATOMIC_FLAG_INIT;
	};
}
