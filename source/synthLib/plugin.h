#pragma once

#include <array>
#include <mutex>
#include <atomic>
#include <functional>
#include <tuple>
#include <utility>

#include "midiTypes.h"
#include "realtimeInstrumentation.h"
#include "resamplerInOut.h"
#include "buildconfig.h"

#include "dsp56kBase/ringbuffer.h"

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
		template<typename Callback>
		decltype(auto) withDeviceLocked(Callback&& _callback) const
		{
			std::lock_guard lock(m_lock);
			const PublishOnExit publish(*this);
			return std::forward<Callback>(_callback)(m_device);
		}

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
		struct PublishOnExit
		{
			const Plugin& plugin;
			explicit PublishOnExit(const Plugin& _plugin) : plugin(_plugin) {}
			~PublishOnExit() { plugin.publishFacts(); }
		};
		// Under m_lock: the latencies and the FactsCallback's facts
		void publishFacts() const;
		void processMidiClock(double _bpm, double _ppqPos, bool _isPlaying, size_t _sampleCount, bool _ppqKnown);
		float* getSilentInputBuffer(size_t _minimumSize);
		float* getDiscardOutputBuffer(size_t _channel, size_t _minimumSize);
		void configureDeviceAudio();
		void updateDeviceLatency();
		void processMidiInEvents();
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
		mutable std::mutex m_lockAddMidiEvent;

		Device* m_device;
		uint64_t m_deviceGeneration = 0;	// counts setDevice: a capture in parts knows its device was replaced

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
		RealtimeInstrumentation m_realtimeInstrumentation;
	};
}
