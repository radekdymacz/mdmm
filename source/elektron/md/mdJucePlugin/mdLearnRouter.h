#pragma once

// MIDI Learn, the realtime side (doc/midilearn/DESIGN-learn-0.8.md, decision C, slice L1).
//
// Message thread: publishes the learn table (a Seqlock write), switches learning on and off, drains the captured CCs,
// takes the touched bits. Audio thread: beginBlock refreshes its own copy of the table when a write happened, translate
// moves the mapped parameters and says whether the event was consumed. No lock, no allocation, no callback: learning
// is pulled by the message thread from a bounded single-producer, single-consumer ring.
//
// Only CCs (status 0xB0 to 0xBF) are consumed: a mapped (channel, CC) never reaches the firmware; while learning, every
// CC but the channel mode messages (120 to 127: all notes off and the like, which hosts send on stop) is captured and
// consumed. Everything else (notes, clock, transport, SysEx) goes on to the machine, also while learning.

#include "mdLearnTable.h"

#include "deskCore/deskLearn.h"

#include "synthLib/seqlock.h"

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <vector>

namespace synthLib
{
	struct SMidiEvent;
}

namespace mdJucePlugin
{
	// The next (unnormalized) value of a parameter in [_min, _max] that is at _current, for the CC value _value of a
	// mapping with the mode _mode (deskCore::LearnMode) and _invert. Absolute: the CC's 0..127 spread over the range
	// (inverted: 127..0). Relative Signed: 1 to 63 one step up, 65 to 127 one step down. Relative Offset: above 64 one
	// step up, below 64 one step down. Inverted relative modes step the other way. Always inside [_min, _max].
	int learnedValue(uint8_t _mode, bool _invert, uint8_t _value, int _current, int _min, int _max);

	// The audio thread's table from the setup's mappings (message thread): each mapping's parameter through _parameter (a
	// mapping whose parameter is null is left out), chains in the order of the list, at most LearnTable::MaxTargets.
	// _byMapping (optional) gets the parameter of every mapping by its index in _mappings (null for one left out), for the
	// host's notification.
	// A mapping of a global target (B-169, deskCore::LearnRef::isGlobal) has no parameter: it goes in when its id is below
	// _globals (the model's count), and the router hands its CCs to the message thread (drainGlobals).
	LearnTable buildLearnTable(const std::vector<deskCore::LearnMapping>& _mappings,
		const std::function<pluginLib::Parameter*(const deskCore::LearnRef&)>& _parameter, uint32_t _generation,
		std::vector<pluginLib::Parameter*>* _byMapping = nullptr, int _globals = 0);

	class LearnRouter
	{
	public:
		// How a target's parameter is moved (audio thread). True when it was applied. The processor's applier uses the
		// realtime host-automation entry, Parameter::setValue; tests pass their own.
		using Apply = bool (*)(pluginLib::Parameter& _param, const LearnTarget& _target, uint8_t _value);

		static constexpr size_t CaptureCapacity = 256;	// records; a power of two
		static constexpr size_t GlobalCapacity = 1024;	// records of CCs for global targets; a power of two

		struct Counts
		{
			uint64_t applied = 0;			// targets moved
			uint64_t captured = 0;			// CCs captured while learning
			uint64_t capturedDropped = 0;	// captured CCs lost to a full ring
			uint64_t globalQueued = 0;		// CCs handed to the message thread for a global target
			uint64_t globalDropped = 0;		// of those, lost to a full ring
			uint64_t notOnAudioThread = 0;	// CCs offered to translate from another thread (passed on untouched)
			uint64_t physicalPassed = 0;	// CCs from a MIDI port (source Physical) that went on to the machine raw, never translated
		};

		explicit LearnRouter(Apply _apply);

		LearnRouter(const LearnRouter&) = delete;
		LearnRouter& operator=(const LearnRouter&) = delete;

		// ---- message thread (one writer) ----

		void publish(const LearnTable& _table) noexcept;
		// Switching on also empties the ring (what is left from an earlier learn is not this learn's)
		void setLearning(bool _on) noexcept;
		bool learning() const noexcept { return m_learning.load(std::memory_order_acquire); }

		// F(uint8_t status, uint8_t cc, uint8_t value) for every captured CC, oldest first
		template<typename F> void drainCaptured(F&& _f)
		{
			auto read = m_captureRead.load(std::memory_order_relaxed);
			const auto write = m_captureWrite.load(std::memory_order_acquire);
			while(read != write)
			{
				const auto r = m_capture[read & (CaptureCapacity - 1)].load(std::memory_order_relaxed);
				_f(static_cast<uint8_t>(r & 0xff), static_cast<uint8_t>((r >> 8) & 0xff), static_cast<uint8_t>((r >> 16) & 0xff));
				++read;
			}
			m_captureRead.store(read, std::memory_order_release);
		}

		// F(const deskCore::LearnGlobalEvent&) for every CC a global target met, oldest first (message thread): the
		// session applies them through the page's own edit path
		template<typename F> void drainGlobals(F&& _f)
		{
			auto read = m_globalRead.load(std::memory_order_relaxed);
			const auto write = m_globalWrite.load(std::memory_order_acquire);
			while(read != write)
			{
				const auto r = m_globalRing[read & (GlobalCapacity - 1)].load(std::memory_order_relaxed);
				deskCore::LearnGlobalEvent e;
				e.id = static_cast<uint8_t>(r & 0xff);
				e.mode = static_cast<uint8_t>((r >> 8) & 0xff);
				e.invert = ((r >> 16) & 1) != 0;
				e.value = static_cast<uint8_t>((r >> 24) & 0x7f);
				_f(e);
				++read;
			}
			m_globalRead.store(read, std::memory_order_release);
		}

		// The mapping indices (LearnTarget::mapping) moved since the last call, as two 64-bit masks
		std::array<uint64_t, 2> takeTouched() noexcept;

		Counts counts() const noexcept;

		// Publishes the empty table and returns once no block that began before it can still be reading the old one: the
		// controller's parameters may be freed after this. Waits at most _timeoutMs (the audio thread of a host that has
		// stopped never ends a block; it will read the empty table at its next block start). True: settled.
		bool publishEmptyAndSettle(unsigned _timeoutMs = 200) noexcept;
		// The same for a new table: returns once no block that began before it can still be reading the old one, so the
		// touched bits taken after this belong to the new table (a stale bit cannot name another parameter).
		bool publishAndSettle(const LearnTable& _table, unsigned _timeoutMs = 20) noexcept;

		// Any thread: a CC that came from a MIDI port (source Physical) passes to the machine raw, counted (the design:
		// these editors open no such port; a project's port chunk could)
		void countPhysicalPassed() noexcept { m_physicalPassed.fetch_add(1, std::memory_order_relaxed); }

		// ---- audio thread only ----

		// Refreshes the local copy when the seqlock's writes moved (on an overlapping write it keeps the copy it has and
		// tries again next block). Also marks the calling thread as the audio thread.
		void beginBlock() noexcept;
		// The block is over: nothing in it reads the table any more (publishEmptyAndSettle waits for this)
		void endBlock() noexcept;
		uint64_t blocks() const noexcept { return m_blocks.load(std::memory_order_acquire); }
		// True: consumed (a mapped CC, or a CC captured while learning); it must not reach the firmware.
		bool translate(uint8_t _status, uint8_t _data1, uint8_t _data2) noexcept;
		bool translate(const synthLib::SMidiEvent& _ev) noexcept;

		// The copy translate reads (audio thread; tests and diagnostics)
		const LearnTable& table() const noexcept { return m_table; }

	private:
		bool onAudioThread() const noexcept;
		void capture(uint8_t _status, uint8_t _cc, uint8_t _value) noexcept;
		void queueGlobal(const LearnTarget& _target, uint8_t _value) noexcept;
		bool runChain(uint8_t _head, uint8_t _value) noexcept;

		const Apply m_apply;

		synthLib::Seqlock<LearnTable> m_published;

		// audio thread
		LearnTable m_table;
		LearnTable m_scratch;
		uint64_t m_seenWrites = 0;

		std::atomic<uint32_t> m_emptyGeneration{0};
		std::atomic<uint64_t> m_blocks{0};		// blocks begun
		std::atomic<bool> m_inBlock{false};		// between beginBlock and endBlock

		std::atomic<size_t> m_audioThread{0};
		std::atomic<bool> m_haveAudioThread{false};

		std::atomic<bool> m_learning{false};
		std::array<std::atomic<uint32_t>, CaptureCapacity> m_capture{};
		std::atomic<uint32_t> m_captureWrite{0};		// audio thread
		std::atomic<uint32_t> m_captureRead{0};			// message thread

		std::array<std::atomic<uint32_t>, GlobalCapacity> m_globalRing{};
		std::atomic<uint32_t> m_globalWrite{0};			// audio thread
		std::atomic<uint32_t> m_globalRead{0};			// message thread

		std::array<std::atomic<uint64_t>, 2> m_touched{};

		std::atomic<uint64_t> m_applied{0};
		std::atomic<uint64_t> m_captured{0};
		std::atomic<uint64_t> m_capturedDropped{0};
		std::atomic<uint64_t> m_globalQueued{0};
		std::atomic<uint64_t> m_globalDropped{0};
		std::atomic<uint64_t> m_notOnAudioThread{0};
		std::atomic<uint64_t> m_physicalPassed{0};
	};
}
