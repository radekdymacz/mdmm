#include "mdLearnRouter.h"

#include "deskCore/deskLearn.h"

#include "synthLib/midiTypes.h"

#include <algorithm>
#include <chrono>
#include <functional>
#include <thread>

namespace mdJucePlugin
{
	namespace
	{
		size_t threadKey() noexcept
		{
			return std::hash<std::thread::id>{}(std::this_thread::get_id());
		}
	}

	int learnedValue(const uint8_t _mode, const bool _invert, const uint8_t _value, const int _current, const int _min, const int _max)
	{
		return deskCore::learnedValue(_mode, _invert, _value, _current, _min, _max);
	}

	LearnTable buildLearnTable(const std::vector<deskCore::LearnMapping>& _mappings,
		const std::function<pluginLib::Parameter*(const deskCore::LearnRef&)>& _parameter, const uint32_t _generation,
		std::vector<pluginLib::Parameter*>* _byMapping, const int _globals)
	{
		LearnTable table;
		table.generation = _generation;
		if(_byMapping)
			_byMapping->assign(_mappings.size(), nullptr);
		for(size_t n = 0; n < _mappings.size() && n < LearnTable::MaxTargets; ++n)
		{
			const auto& m = _mappings[n];
			const bool global = m.at.isGlobal();
			if(global && (m.at.i < 0 || m.at.i >= _globals || m.at.i > 0xffff))
				continue;
			auto* param = global || !_parameter ? nullptr : _parameter(m.at);
			if(!param && !global)
				continue;
			LearnTarget target;
			target.param = param;
			target.global = global ? static_cast<int16_t>(m.at.i) : int16_t{-1};
			target.mode = static_cast<uint8_t>(m.mode);
			target.invert = m.invert ? 1 : 0;
			target.mapping = static_cast<uint8_t>(n);
			const size_t channel = m.ch == deskCore::g_learnAnyChannel ? LearnTable::AnyChannel : m.ch;
			if(table.add(channel, m.cc, target) && _byMapping)
				(*_byMapping)[n] = param;
		}
		return table;
	}

	LearnRouter::LearnRouter(const Apply _apply) : m_apply(_apply)
	{
	}

	void LearnRouter::publish(const LearnTable& _table) noexcept
	{
		m_published.write(_table);
	}

	void LearnRouter::setLearning(const bool _on) noexcept
	{
		if(_on)
			m_captureRead.store(m_captureWrite.load(std::memory_order_acquire), std::memory_order_release);
		m_learning.store(_on, std::memory_order_release);
	}

	std::array<uint64_t, 2> LearnRouter::takeTouched() noexcept
	{
		return { m_touched[0].exchange(0, std::memory_order_acq_rel), m_touched[1].exchange(0, std::memory_order_acq_rel) };
	}

	LearnRouter::Counts LearnRouter::counts() const noexcept
	{
		Counts c;
		c.applied = m_applied.load(std::memory_order_relaxed);
		c.captured = m_captured.load(std::memory_order_relaxed);
		c.capturedDropped = m_capturedDropped.load(std::memory_order_relaxed);
		c.globalQueued = m_globalQueued.load(std::memory_order_relaxed);
		c.globalDropped = m_globalDropped.load(std::memory_order_relaxed);
		c.notOnAudioThread = m_notOnAudioThread.load(std::memory_order_relaxed);
		c.physicalPassed = m_physicalPassed.load(std::memory_order_relaxed);
		return c;
	}

	bool LearnRouter::publishEmptyAndSettle(const unsigned _timeoutMs) noexcept
	{
		LearnTable empty;
		empty.generation = m_emptyGeneration.fetch_add(1, std::memory_order_relaxed) + 1;
		return publishAndSettle(empty, _timeoutMs);
	}

	bool LearnRouter::publishAndSettle(const LearnTable& _table, const unsigned _timeoutMs) noexcept
	{
		publish(_table);
		// Any block that begins from here on takes the empty table. A block running now ends or is followed by the next.
		const auto seen = m_blocks.load(std::memory_order_seq_cst);
		const auto start = std::chrono::steady_clock::now();
		while(m_inBlock.load(std::memory_order_seq_cst) && m_blocks.load(std::memory_order_seq_cst) == seen)
		{
			if(std::chrono::steady_clock::now() - start > std::chrono::milliseconds(_timeoutMs))
				return false;
			std::this_thread::sleep_for(std::chrono::milliseconds(1));
		}
		return true;
	}

	void LearnRouter::endBlock() noexcept
	{
		m_inBlock.store(false, std::memory_order_seq_cst);
	}

	void LearnRouter::beginBlock() noexcept
	{
		m_inBlock.store(true, std::memory_order_seq_cst);
		m_blocks.fetch_add(1, std::memory_order_seq_cst);
		m_audioThread.store(threadKey(), std::memory_order_relaxed);
		m_haveAudioThread.store(true, std::memory_order_release);

		const auto writes = m_published.writes();
		if(writes == m_seenWrites)
			return;
		// the seqlock leaves the target unspecified when a write overlapped: read into the scratch, keep the copy we have
		if(!m_published.tryRead(m_scratch))
			return;
		m_table = m_scratch;
		m_seenWrites = writes;
	}

	bool LearnRouter::onAudioThread() const noexcept
	{
		return m_haveAudioThread.load(std::memory_order_acquire) && m_audioThread.load(std::memory_order_relaxed) == threadKey();
	}

	bool LearnRouter::translate(const synthLib::SMidiEvent& _ev) noexcept
	{
		if(!_ev.sysex.empty())
			return false;
		return translate(_ev.a, _ev.b, _ev.c);
	}

	bool LearnRouter::translate(const uint8_t _status, const uint8_t _data1, const uint8_t _data2) noexcept
	{
		if((_status & 0xf0) != 0xb0 || _data1 > 127)
			return false;
		if(!onAudioThread())
		{
			m_notOnAudioThread.fetch_add(1, std::memory_order_relaxed);
			return false;
		}

		if(_data1 < 120 && m_learning.load(std::memory_order_acquire))
		{
			capture(_status, _data1, _data2);
			return true;
		}

		const auto channel = static_cast<size_t>(_status & 0x0f);
		const bool onChannel = runChain(m_table.head[channel][_data1], _data2);
		const bool anyChannel = runChain(m_table.head[LearnTable::AnyChannel][_data1], _data2);
		return onChannel || anyChannel;
	}

	bool LearnRouter::runChain(uint8_t _head, const uint8_t _value) noexcept
	{
		if(_head == LearnTable::None)
			return false;
		bool found = false;
		// bounded: a chain never has more links than the table has targets
		for(size_t links = 0; _head != LearnTable::None && _head < m_table.count && links < LearnTable::MaxTargets; ++links)
		{
			found = true;
			const auto& target = m_table.targets[_head];
			if(target.global >= 0)
				queueGlobal(target, _value);
			else if(target.param && m_apply(*target.param, target, _value))
			{
				m_applied.fetch_add(1, std::memory_order_relaxed);
				if(target.mapping < 128)
					m_touched[target.mapping >> 6].fetch_or(uint64_t{1} << (target.mapping & 63), std::memory_order_release);
			}
			_head = target.next;
		}
		return found;
	}

	void LearnRouter::queueGlobal(const LearnTarget& _target, const uint8_t _value) noexcept
	{
		const auto write = m_globalWrite.load(std::memory_order_relaxed);
		const auto read = m_globalRead.load(std::memory_order_acquire);
		if(write - read >= GlobalCapacity)
		{
			m_globalDropped.fetch_add(1, std::memory_order_relaxed);
			return;
		}
		const auto record = static_cast<uint32_t>(_target.global & 0xffff) | static_cast<uint32_t>(_target.mode & 0xf) << 16
			| static_cast<uint32_t>(_target.invert ? 1 : 0) << 20 | static_cast<uint32_t>(_value & 0x7f) << 21;
		m_globalRing[write & (GlobalCapacity - 1)].store(record, std::memory_order_relaxed);
		m_globalWrite.store(write + 1, std::memory_order_release);
		m_globalQueued.fetch_add(1, std::memory_order_relaxed);
	}

	void LearnRouter::capture(const uint8_t _status, const uint8_t _cc, const uint8_t _value) noexcept
	{
		const auto write = m_captureWrite.load(std::memory_order_relaxed);
		const auto read = m_captureRead.load(std::memory_order_acquire);
		if(write - read >= CaptureCapacity)
		{
			m_capturedDropped.fetch_add(1, std::memory_order_relaxed);
			return;
		}
		const auto record = static_cast<uint32_t>(_status) | static_cast<uint32_t>(_cc) << 8 | static_cast<uint32_t>(_value & 0x7f) << 16;
		m_capture[write & (CaptureCapacity - 1)].store(record, std::memory_order_relaxed);
		m_captureWrite.store(write + 1, std::memory_order_release);
		m_captured.fetch_add(1, std::memory_order_relaxed);
	}
}
