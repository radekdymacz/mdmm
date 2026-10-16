#pragma once

#include <array>
#include <mutex>
#include <atomic>
#include <chrono>
#include <functional>
#include <tuple>
#include <utility>

#include "midiTypes.h"
#include "realtimeInstrumentation.h"
#include "resamplerInOut.h"
#include "buildconfig.h"

#include "dsp56kBase/ringbuffer.h"

#include "deviceCommand.h"
#include "deviceTypes.h"
#include "midiClock.h"

namespace synthLib
{
	// The envelope's first byte of a state from getState (then its StateType): setState refuses another version
	constexpr uint8_t g_stateVersion = 1;

	class Device;

	class Plugin
	{
	public:
		static constexpr size_t RealtimeMidiEventCapacity = 1024;

		using CallbackDeviceInvalid = std::function<void(Device*)>;
		// DESIGN-audio-lock.md step 2: called with the device whenever the lock is about to be released by the audio
		// thread at a block's end, and by every locked call (withDeviceLocked, setDevice, setState, ...): it publishes
		// what readers need (a Seqlock), so they read without the lock. Runs under the lock; must not block or allocate.
		using FactsCallback = std::function<void(Device*)>;

		Plugin(Device* _device, CallbackDeviceInvalid _callbackDeviceInvalid);

		void addMidiEvent(const SMidiEvent& _ev);

		bool setPreferredDeviceSamplerate(float _samplerate);

		void setHostSamplerate(float _hostSamplerate, float _preferredDeviceSamplerate);
		void setResamplerMode(Resampler::Mode _mode);
		float getHostSamplerate() const { return m_hostSamplerate; }
		float getHostSamplerateInv() const { return m_hostSamplerateInv; }

		void setBlockSize(uint32_t _blockSize);
		void reserveMidiEventCapacity(size_t _capacity = RealtimeMidiEventCapacity);

		// As published with the facts (no lock): the plug-in's latencies after the last change or block
		uint32_t getLatencyMidiToOutput() const { return m_latencyMidiToOutput.load(std::memory_order_acquire); }
		uint32_t getLatencyInputToOutput() const { return m_latencyInputToOutput.load(std::memory_order_acquire); }
		// Counts visits to explicitly unsupported RT allocation paths: a host block
		// larger than setBlockSize, or dynamically sized SysEx processed/emitted by
		// the device. Prepared audio and channel-message MIDI must leave this stable.
		uint64_t getRealtimeAllocationFallbackCount() const
		{
			return m_realtimeAllocationFallbackCount.load();
		}
		RealtimeInstrumentation& getRealtimeInstrumentation() noexcept
		{
			return m_realtimeInstrumentation;
		}
		const RealtimeInstrumentation& getRealtimeInstrumentation() const noexcept
		{
			return m_realtimeInstrumentation;
		}

		void process(const TAudioInputs& _inputs, const TAudioOutputs& _outputs,
			size_t _count, double _bpm, double _ppqPos, bool _isPlaying, bool _ppqKnown = true);
		void getMidiOut(std::vector<SMidiEvent>& _midiOut);

		bool isValid() const;

		// Replaces the device: the old one's state is captured (getState), the new one is configured and given that
		// state before it is installed, so the lock is held only for the swap; the old device is deleted after it.
		void setDevice(Device* _device);
		Device* getDevice() const { return m_device; }

		// Keep a short control-plane operation pinned to the current Device. Callers
		// must not perform file I/O, allocation-heavy preparation, or other long work
		// inside this callback; capture immutable context here and prepare outside.
		// The facts are published after the callback, before the lock is released (FactsCallback).
		// _file / _line: the caller's site, named when the audio thread has to wait for this hold (lock blame)
		template<typename Callback>
		decltype(auto) withDeviceLocked(Callback&& _callback, const char* _file = __builtin_FILE(),
			const uint32_t _line = __builtin_LINE()) const
		{
			const LockScope lock(*this, _file, _line);
			const PublishOnExit publish(*this);
			return std::forward<Callback>(_callback)(m_device);
		}

		// DESIGN-audio-lock.md step 3: queues _count commands for the device (Device::applyCommand), applied in this
		// order at the start of the next audio block, all in the same block. Any thread but the audio thread; never
		// takes the device lock while blocks run. When the queue is full (no blocks ran for a while: host stopped,
		// offline tests) the queue is applied under the lock first. False: more than CommandCapacity commands.
		static constexpr size_t CommandCapacity = 256;
		bool sendCommands(const DeviceCommand* _commands, size_t _count);
		// Commands not applied: the device refused them, or it was replaced or invalid when they came
		uint64_t getDroppedCommandCount() const { return m_droppedCommands.load(std::memory_order_relaxed); }

		// Installs the facts callback (under the lock) and publishes once
		void setFactsCallback(FactsCallback _callback);

#if !SYNTHLIB_DEMO_MODE
		bool getState(std::vector<uint8_t>& _state, StateType _type) const;
		bool setState(const std::vector<uint8_t>& _state) const;
#endif
		void insertMidiEvent(const SMidiEvent& _ev);

		bool setLatencyBlocks(uint32_t _latencyBlocks);
		// Whether the host's tempo and transport go to the device as MIDI clock, Start and Stop (on by default)
		void setHostClock(bool _on) { m_hostClockOn.store(_on, std::memory_order_release); }
		bool hostClock() const { return m_hostClockOn.load(std::memory_order_acquire); }
		// B-121: the host's Stop also sends All Notes Off on every channel (hostStopEvents, midiClock.h)
		void setNotesOffOnHostStop(bool _on) { m_notesOffOnHostStop.store(_on, std::memory_order_release); }
		bool notesOffOnHostStop() const { return m_notesOffOnHostStop.load(std::memory_order_acquire); }
		uint32_t getLatencyBlocks() const { return m_extraLatencyBlocks; }

	private:
		// m_lock held with the holder's site recorded: when the audio thread has to wait, it names the site
		// (RealtimeInstrumentation lock blame). Nested holds restore the outer site when they end
		class LockScope
		{
		public:
			explicit LockScope(const Plugin& _plugin, const char* _file = __builtin_FILE(),
				const uint32_t _line = __builtin_LINE())
			: m_plugin(_plugin)
			, m_lock(_plugin.m_lock)
			, m_outerFile(_plugin.m_holderFile.load(std::memory_order_relaxed))
			, m_outerLine(_plugin.m_holderLine.load(std::memory_order_relaxed))
			, m_file(_file)
			, m_line(_line)
			, m_start(_plugin.m_realtimeInstrumentation.isEnabled() ? std::chrono::steady_clock::now()
				: std::chrono::steady_clock::time_point{})
			, m_startCpu(m_start != std::chrono::steady_clock::time_point{} ? RealtimeInstrumentation::threadCpuNanoseconds() : 0)
			{
				m_plugin.m_holderFile.store(_file, std::memory_order_relaxed);
				m_plugin.m_holderLine.store(_line, std::memory_order_relaxed);
			}
			~LockScope()
			{
				// the hold, while still holding the lock (it serialises the instrumentation's writers)
				if(m_start != std::chrono::steady_clock::time_point{})
				{
					const auto cpu = RealtimeInstrumentation::threadCpuNanoseconds();
					const auto wall = static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(
						std::chrono::steady_clock::now() - m_start).count());
					// no thread clock (Windows: GetThreadTimes ticks in scheduler quanta): the wall time stands for the work
					const auto work = cpu || m_startCpu ? (cpu >= m_startCpu ? cpu - m_startCpu : 0) : wall;
					m_plugin.m_realtimeInstrumentation.recordLockHold(wall, work, m_file, m_line);
				}
				m_plugin.m_holderFile.store(m_outerFile, std::memory_order_relaxed);
				m_plugin.m_holderLine.store(m_outerLine, std::memory_order_relaxed);
			}
			LockScope(const LockScope&) = delete;
			LockScope& operator=(const LockScope&) = delete;
		private:
			const Plugin& m_plugin;
			std::lock_guard<std::recursive_mutex> m_lock;
			const char* const m_outerFile;
			const uint32_t m_outerLine;
			const char* const m_file;
			const uint32_t m_line;
			const std::chrono::steady_clock::time_point m_start;
			const uint64_t m_startCpu;
		};
		struct PublishOnExit
		{
			const Plugin& m_plugin;
			explicit PublishOnExit(const Plugin& _plugin) : m_plugin(_plugin) {}
			~PublishOnExit() { m_plugin.publishFacts(); }
		};
		// Under m_lock: the latencies and the FactsCallback's facts
		void publishFacts() const;
		void processMidiClock(double _bpm, double _ppqPos, bool _isPlaying, size_t _sampleCount, bool _ppqKnown);
		float* getSilentInputBuffer(size_t _minimumSize);
		float* getDiscardOutputBuffer(size_t _channel, size_t _minimumSize);
		void configureDeviceAudio();
		void updateDeviceLatency();
		void processMidiInEvents();
		// Under m_lock: applies the queued commands (sendCommands)
		void applyCommands();
		void processMidiInEvent(const SMidiEvent& _ev, bool _realtime);
#if !SYNTHLIB_DEMO_MODE
		// setState's header and dispatch for a device nobody else can reach yet (setDevice's new one): no lock
		static bool setStateUnshared(Device& _device, const std::vector<uint8_t>& _state);
#endif

		dsp56k::RingBuffer<SMidiEvent, RealtimeMidiEventCapacity, false> m_midiInRingBuffer;
		std::vector<SMidiEvent> m_midiIn;
		std::vector<SMidiEvent> m_midiOut;

		SMidiEvent m_pendingSysexInput;

		ResamplerInOut m_resampler;
		mutable std::recursive_mutex m_lock;
		mutable std::atomic<const char*> m_holderFile{nullptr};	// the site of m_lock's off-audio-thread holder (LockScope)
		mutable std::atomic<uint32_t> m_holderLine{0};
		mutable std::mutex m_lockAddMidiEvent;

		Device* m_device;
		std::atomic<uint64_t> m_deviceGeneration{0};	// counts setDevice: a capture in parts knows its device was replaced

		// sendCommands' queue: producers serialise on m_lockCommands, the holder of m_lock consumes. Lock order:
		// m_lockCommands before m_lock (sendCommands' full-queue path), never the other way round: nothing holding
		// m_lock (a withDeviceLocked callback, a FactsCallback, Device::applyCommand) may call sendCommands
		std::array<DeviceCommand, CommandCapacity> m_commands{};
		std::atomic<uint64_t> m_commandWrite{0};
		std::atomic<uint64_t> m_commandRead{0};
		std::mutex m_lockCommands;
		std::atomic<uint64_t> m_droppedCommands{0};

		std::vector<float> m_silentInputBuffer;
		std::array<std::vector<float>, std::tuple_size_v<TAudioOutputs>>
			m_discardOutputBuffers;

		float m_hostSamplerate = 0.0f;
		float m_hostSamplerateInv = 0.0f;

		uint32_t m_blockSize = 0;

		uint32_t m_deviceLatencyMidiToOutput = 0;
		uint32_t m_deviceLatencyInputToOutput = 0;
		uint32_t m_deviceExtraLatencyHost = 0;

		MidiClock m_midiClock;
		std::atomic<bool> m_hostClockOn{true};
		std::atomic<bool> m_notesOffOnHostStop{false};
		bool m_hostClockWas = true;		// audio thread

		uint32_t m_extraLatencyBlocks = 1;

		float m_deviceSamplerate = 0.0f;
		CallbackDeviceInvalid m_callbackDeviceInvalid;
		FactsCallback m_factsCallback;
		mutable std::atomic<uint32_t> m_latencyMidiToOutput{0};
		mutable std::atomic<uint32_t> m_latencyInputToOutput{0};
		std::atomic<uint64_t> m_realtimeAllocationFallbackCount{0};
		mutable RealtimeInstrumentation m_realtimeInstrumentation;	// mutable: a locked call records its hold
	};
}
