#pragma once

#include <atomic>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <vector>

#include "midiports.h"

#include "synthLib/midiTypes.h"

namespace pluginLib
{
	// External MIDI (P4, the Machinedrum and Monomachine Editors' HW MIDI; doc/modern-ux/UPSTREAM.md):
	// an editor drives real hardware through the plug-in's MIDI in and out (the host's and the
	// physical ports) instead of the emulated device. While it is on, SysEx that comes in is kept for
	// the editor (not given to the device), what the editor sends goes out in the next audio block,
	// and the device's own MIDI output is not passed on (it would reach the hardware). The processor
	// owns one and calls takeIn() and flushOut(); the editor calls set(), send() and drainIn().
	// Message thread, except the audio-thread side (takeIn, flushOut) inside processBlock; neither
	// waits for the message thread or allocates.
	// Known gap (doc/ROADMAP.md F1): what the editor sends leaves only in flushOut, inside an audio
	// block; a host that stops calling processBlock (suspend when idle, an offline bounce) holds it.
	class ExternalMidi
	{
	public:
		// What came in and is not drained yet, at most (both buffers are made when HW MIDI goes on: the audio thread
		// never allocates). 128 KiB is 40 s of DIN SysEx; the message thread drains every 8 to 64 ms.
		static constexpr size_t InCapacity = 128 * 1024;

		void set(const bool _on)
		{
			{
				const std::scoped_lock lock(m_inMutex);
				m_inBytes.clear();
				m_inDrain.clear();
				if(_on)
				{
					m_inBytes.reserve(InCapacity);
					m_inDrain.reserve(InCapacity);
				}
			}
			const std::scoped_lock lock(m_mutex);
			m_on.store(_on, std::memory_order_release);
			m_out.clear();
		}

		bool isOn() const { return m_on.load(std::memory_order_acquire); }

		void send(const synthLib::SMidiEvent& _ev)
		{
			const std::scoped_lock lock(m_mutex);
			if(m_on.load(std::memory_order_relaxed))
				m_out.push_back(_ev);
		}

		// Message thread: the SysEx that came in since the last call. The lock is held only to swap the two buffers.
		void drainIn(std::vector<synthLib::SMidiEvent>& _out)
		{
			{
				const std::scoped_lock lock(m_inMutex);
				std::swap(m_inBytes, m_inDrain);
			}
			for(size_t i = 0; i + sizeof(uint32_t) <= m_inDrain.size();)
			{
				uint32_t n = 0;
				std::memcpy(&n, m_inDrain.data() + i, sizeof(n));
				i += sizeof(n);
				synthLib::SMidiEvent e(synthLib::MidiEventSource::Physical);
				e.sysex.assign(m_inDrain.begin() + static_cast<std::ptrdiff_t>(i),
					m_inDrain.begin() + static_cast<std::ptrdiff_t>(i + n));
				_out.push_back(std::move(e));
				i += n;
			}
			m_inDrain.clear();	// keeps its capacity: the next swap gives the audio thread a made buffer
		}

		// The processor's MIDI in (the audio thread for the host's, a MIDI thread for a port's): SysEx from the
		// hardware is the editor's. True: kept, the device does not get it. Never waits and never allocates (1.0
		// review): the bytes go into a buffer made by set(); a message that finds no room, or the lock held by
		// drainIn's swap past a short spin, is dropped and counted (inDropped), never given to the device.
		bool takeIn(const synthLib::SMidiEvent& _ev)
		{
			if(_ev.source == synthLib::MidiEventSource::Device || _ev.sysex.empty() || !isOn())
				return false;
			std::unique_lock lock(m_inMutex, std::defer_lock);
			for(int i = 0; i < 64 && !lock.owns_lock(); ++i)
				(void)lock.try_lock();
			const auto n = _ev.sysex.size();
			if(!lock.owns_lock() || n > UINT32_MAX || m_inBytes.size() + sizeof(uint32_t) + n > m_inBytes.capacity())
			{
				m_inDropped.fetch_add(1, std::memory_order_relaxed);
				return true;
			}
			const auto len = static_cast<uint32_t>(n);
			const auto* lenBytes = reinterpret_cast<const uint8_t*>(&len);
			m_inBytes.insert(m_inBytes.end(), lenBytes, lenBytes + sizeof(len));
			m_inBytes.insert(m_inBytes.end(), _ev.sysex.begin(), _ev.sysex.end());
			return true;
		}

		// SysEx from the hardware dropped because the editor did not drain it in time (takeIn)
		uint64_t inDropped() const { return m_inDropped.load(std::memory_order_relaxed); }

		// The audio block: what the editor sent, to the host's MIDI out and the physical ports. Never
		// waits for the message thread; what cannot be taken now goes out with the next block.
		void flushOut(juce::MidiBuffer& _midiMessages, MidiPorts& _ports)
		{
			if(!isOn())
				return;
			std::unique_lock lock(m_mutex, std::try_to_lock);
			if(!lock.owns_lock())
				return;
			for(const auto& e : m_out)
			{
				_midiMessages.addEvent(MidiPorts::toJuceMidiMessage(e), 0);
				_ports.send(e);
			}
			m_out.clear();
		}

	private:
		std::atomic<bool> m_on{false};
		std::mutex m_mutex;							// m_out
		std::vector<synthLib::SMidiEvent> m_out;
		std::mutex m_inMutex;						// m_inBytes; held by the producer while it appends, by drainIn to swap
		std::vector<uint8_t> m_inBytes, m_inDrain;	// [uint32 length][SysEx bytes]... (m_inDrain: drainIn's only)
		std::atomic<uint64_t> m_inDropped{0};
	};
}
