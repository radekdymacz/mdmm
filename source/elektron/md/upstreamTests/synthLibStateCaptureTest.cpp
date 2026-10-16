// synthLib::Plugin::getState with a Device::StateCapture (the fork's hook in synthLib/device.h and plugin.cpp,
// doc/modern-ux/UPSTREAM.md): the device captures under the process/device lock and encodes after it is released,
// so the audio thread is not held up by a state save. md::Device is the one device that captures (mdstatecapture.h).

#include "synthLib/device.h"
#include "synthLib/plugin.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <future>
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

namespace
{
	using namespace std::chrono_literals;

	struct CaptureControl
	{
		std::mutex mutex;
		std::condition_variable condition;
		bool encodeStarted = false;
		bool allowEncode = false;
		std::function<void()> onCaptureDestroyed;
	};

	// Saves through a capture whose encode waits for the test, as md::Device does (without the wait)
	class CaptureTestDevice final : public synthLib::Device
	{
	public:
		CaptureTestDevice(std::shared_ptr<CaptureControl> _control, std::vector<uint8_t> _payload)
			: synthLib::Device({}), m_control(std::move(_control)), m_payload(std::move(_payload))
		{
		}

		class Capture final : public StateCapture
		{
		public:
			Capture(std::shared_ptr<CaptureControl> _control, std::vector<uint8_t> _payload)
				: control(std::move(_control)), payload(std::move(_payload))
			{
			}

			~Capture() override
			{
				if(control->onCaptureDestroyed)
					control->onCaptureDestroyed();
			}

			bool encode(std::vector<uint8_t>& _state) override
			{
				std::unique_lock lock(control->mutex);
				control->encodeStarted = true;
				control->condition.notify_all();
				control->condition.wait(lock, [&] { return control->allowEncode; });
				_state.insert(_state.end(), payload.begin(), payload.end());
				return true;
			}

			std::shared_ptr<CaptureControl> control;
			std::vector<uint8_t> payload;
		};

		float getSamplerate() const override { return 48000.0f; }
		bool isValid() const override { return true; }
		// The synchronous path is the capture encoded at once, so with a Plugin that ignored captures the
		// encode would run under its lock
		bool getState(std::vector<uint8_t>& _state, const synthLib::StateType _type) override
		{
			auto capture = beginStateCapture(_type);
			return capture && capture->encode(_state);
		}
		bool setState(const std::vector<uint8_t>&, synthLib::StateType) override { return false; }
		std::unique_ptr<StateCapture> beginStateCapture(synthLib::StateType) override
		{
			return std::make_unique<Capture>(m_control, m_payload);
		}
		uint32_t getChannelCountIn() override { return 0; }
		uint32_t getChannelCountOut() override { return 2; }
		bool setDspClockPercent(uint32_t) override { return true; }
		uint32_t getDspClockPercent() const override { return 100; }
		uint64_t getDspClockHz() const override { return 0; }

	protected:
		void readMidiOut(std::vector<synthLib::SMidiEvent>&) override {}
		void processAudio(const synthLib::TAudioInputs&,
			const synthLib::TAudioOutputs&, size_t) override {}
		bool sendMidi(const synthLib::SMidiEvent&,
			std::vector<synthLib::SMidiEvent>&) override { return true; }

	private:
		std::shared_ptr<CaptureControl> m_control;
		std::vector<uint8_t> m_payload;
	};

	int fail(const char* const _message)
	{
		std::cerr << _message << '\n';
		return 1;
	}

	// A state save encodes without the process/device lock (the audio thread waits for it), and drops its
	// capture, which may own copies of whole memories, after the lock is released.
	int testStateCaptureEncodesUnlocked()
	{
		auto control = std::make_shared<CaptureControl>();
		const std::vector<uint8_t> payload{0x4d, 0x44, 0x53, 0x54};
		CaptureTestDevice device(control, payload);
		synthLib::Plugin plugin(&device, [](synthLib::Device* const _device)
		{
			return _device;
		});

		std::atomic<bool> destructionWasUnlocked{false};
		std::thread destructionProbeThread;
		control->onCaptureDestroyed = [&]
		{
			std::promise<void> acquiredPromise;
			auto acquired = acquiredPromise.get_future();
			destructionProbeThread = std::thread([&plugin, promise = std::move(acquiredPromise)]() mutable
			{
				plugin.withDeviceLocked([](synthLib::Device*) {});
				promise.set_value();
			});
			destructionWasUnlocked = acquired.wait_for(500ms) == std::future_status::ready;
		};
		const auto releaseEncode = [&]
		{
			{
				std::lock_guard lock(control->mutex);
				control->allowEncode = true;
			}
			control->condition.notify_all();
		};

		std::vector<uint8_t> saved;
		bool savedOk = false;
		std::thread saveThread([&] { savedOk = plugin.getState(saved, synthLib::StateTypeGlobal); });
		{
			std::unique_lock lock(control->mutex);
			if(!control->condition.wait_for(lock, 2s, [&] { return control->encodeStarted; }))
			{
				lock.unlock();
				releaseEncode();
				saveThread.join();
				if(destructionProbeThread.joinable())
					destructionProbeThread.join();
				return fail("state encode did not start");
			}
		}

		// The encode is deliberately blocked. Audio and control work must still get the lock at once.
		auto lockProbe = std::async(std::launch::async, [&]
		{
			return plugin.withDeviceLocked([](synthLib::Device* const _device)
			{
				return _device != nullptr;
			});
		});
		const bool lockWasFree = lockProbe.wait_for(500ms) == std::future_status::ready;
		releaseEncode();
		saveThread.join();
		const bool probeSawDevice = lockProbe.get();
		if(destructionProbeThread.joinable())
			destructionProbeThread.join();

		if(!lockWasFree || !probeSawDevice)
			return fail("state encode held the process/device lock");
		if(!destructionWasUnlocked)
			return fail("state capture was destroyed under the process/device lock");
		const std::vector<uint8_t> expected{1, synthLib::StateTypeGlobal, 0x4d, 0x44, 0x53, 0x54};
		if(!savedOk || saved != expected)
			return fail("captured state is not the plug-in header followed by the device payload");
		return 0;
	}

	// A device whose capture is taken in parts (StateCapture::captureMore) and whose setState and destructor can
	// probe the plug-in's lock (DESIGN-audio-lock.md step 1)
	class PartsTestDevice final : public synthLib::Device
	{
	public:
		PartsTestDevice(std::vector<uint8_t> _payload, const int _parts) : synthLib::Device({}), payload(std::move(_payload)), parts(_parts) {}
		~PartsTestDevice() override
		{
			if(onDestroyed)
				onDestroyed();
		}

		class Capture final : public StateCapture
		{
		public:
			Capture(PartsTestDevice& _device) : m_payload(_device.payload), m_parts(_device.parts), m_onPart(_device.onPart) {}
			bool captureMore() override
			{
				const int call = m_calls++;
				if(m_onPart)
					m_onPart(call);
				return call < m_parts;
			}
			bool encode(std::vector<uint8_t>& _state) override
			{
				_state.insert(_state.end(), m_payload.begin(), m_payload.end());
				return m_calls == m_parts + 1;	// every part taken
			}

		private:
			std::vector<uint8_t> m_payload;
			int m_parts;
			std::function<void(int)> m_onPart;
			int m_calls = 0;
		};

		float getSamplerate() const override { return 48000.0f; }
		bool isValid() const override { return true; }
		bool getState(std::vector<uint8_t>& _state, synthLib::StateType) override
		{
			_state.insert(_state.end(), payload.begin(), payload.end());
			return true;
		}
		bool setState(const std::vector<uint8_t>& _state, synthLib::StateType) override
		{
			received = _state;
			if(onSetState)
				onSetState();
			return true;
		}
		std::unique_ptr<StateCapture> beginStateCapture(synthLib::StateType) override { return std::make_unique<Capture>(*this); }
		uint32_t getChannelCountIn() override { return 0; }
		uint32_t getChannelCountOut() override { return 2; }
		bool setDspClockPercent(uint32_t) override { return true; }
		uint32_t getDspClockPercent() const override { return 100; }
		uint64_t getDspClockHz() const override { return 0; }

		std::vector<uint8_t> payload;
		int parts;
		std::function<void(int)> onPart;
		std::function<void()> onSetState;
		std::function<void()> onDestroyed;
		std::vector<uint8_t> received;

	protected:
		void readMidiOut(std::vector<synthLib::SMidiEvent>&) override {}
		void processAudio(const synthLib::TAudioInputs&, const synthLib::TAudioOutputs&, size_t) override {}
		bool sendMidi(const synthLib::SMidiEvent&, std::vector<synthLib::SMidiEvent>&) override { return true; }
	};

	// Whether another thread gets the plug-in's lock within 500 ms
	bool lockIsFree(const synthLib::Plugin& _plugin)
	{
		auto probe = std::async(std::launch::async, [&] { _plugin.withDeviceLocked([](synthLib::Device*) {}); });
		return probe.wait_for(500ms) == std::future_status::ready;
	}

	// getState takes a capture in parts: every captureMore is called, and the result is the header and the payload
	int testStateCaptureInParts()
	{
		PartsTestDevice device({7, 8, 9}, 5);
		int calls = 0;
		device.onPart = [&](int) { ++calls; };
		synthLib::Plugin plugin(&device, [](synthLib::Device*) {});
		std::vector<uint8_t> saved;
		const bool ok = plugin.getState(saved, synthLib::StateTypeGlobal);
		const std::vector<uint8_t> expected{1, synthLib::StateTypeGlobal, 7, 8, 9};
		(void)plugin.withDeviceLocked([](synthLib::Device*) { return 0; });
		if(!ok || saved != expected || calls != 6)
			return fail("a capture in parts was not taken to its end");
		return 0;
	}

	// A device replaced while a capture is taken in parts: the capture begins again on the new device
	int testStateCaptureRestartsOnNewDevice()
	{
		auto* first = new PartsTestDevice({1, 1, 1}, 3);
		auto* second = new PartsTestDevice({2, 2}, 2);
		synthLib::Plugin plugin(first, [](synthLib::Device*) {});
		bool swapped = false;
		// the swap from inside a part (the lock is recursive): deterministic, between this part and the next
		first->onPart = [&](const int _call)
		{
			if(_call == 1 && !swapped)
			{
				swapped = true;
				plugin.setDevice(second);
			}
		};
		std::vector<uint8_t> saved;
		const bool ok = plugin.getState(saved, synthLib::StateTypeGlobal);
		const std::vector<uint8_t> expected{1, synthLib::StateTypeGlobal, 2, 2};
		const bool secondInstalled = plugin.getDevice() == second;
		plugin.setDevice(new PartsTestDevice({}, 0));	// deletes the second (the plug-in never deletes its last device)
		if(!swapped || !secondInstalled || !ok || saved != expected)
			return fail("a capture of a replaced device was not begun again on the new one");
		return 0;
	}

	// setDevice: the new device gets the old one's state without the lock held, and the old device is deleted after
	// the lock is released; only the swap holds it
	int testSetDevicePreparesUnlocked()
	{
		auto* first = new PartsTestDevice({3, 4, 5}, 2);
		auto* second = new PartsTestDevice({}, 0);
		synthLib::Plugin plugin(first, [](synthLib::Device*) {});
		bool preparedUnlocked = false, deletedUnlocked = false;
		second->onSetState = [&] { preparedUnlocked = lockIsFree(plugin); };
		first->onDestroyed = [&] { deletedUnlocked = lockIsFree(plugin); };
		plugin.setDevice(second);
		const std::vector<uint8_t> expected{3, 4, 5};
		const bool ok = plugin.getDevice() == second && second->received == expected;
		second->onSetState = nullptr;
		plugin.setDevice(new PartsTestDevice({}, 0));
		if(!ok)
			return fail("setDevice did not give the new device the old one's state");
		if(!preparedUnlocked)
			return fail("setDevice prepared the new device under the process/device lock");
		if(!deletedUnlocked)
			return fail("setDevice deleted the old device under the process/device lock");
		return 0;
	}
}

namespace
{
	// DESIGN-audio-lock.md step 2: the facts callback runs once when installed and at the end of every locked call, on
	// the calling thread before the call returns, with the current device (a replaced one included)
	int testFactsPublishedUnderTheLock()
	{
		auto* first = new PartsTestDevice({1}, 0);
		synthLib::Plugin plugin(first, [](synthLib::Device*) {});
		int published = 0;
		bool sameThread = true;
		const auto caller = std::this_thread::get_id();
		synthLib::Device* last = nullptr;
		plugin.setFactsCallback([&](synthLib::Device* const _device)
		{
			++published;
			last = _device;
			sameThread = sameThread && std::this_thread::get_id() == caller;
		});
		const int installed = published;
		plugin.withDeviceLocked([](synthLib::Device*) {});
		const int afterCall = published;
		auto* second = new PartsTestDevice({2}, 0);
		plugin.setDevice(second);
		const bool sawSecond = last == second;
		plugin.setFactsCallback({});
		plugin.setDevice(new PartsTestDevice({}, 0));
		if(installed != 1 || afterCall != 2)
			return fail("the facts were not published on install and after a locked call");
		if(!sawSecond)
			return fail("the facts after setDevice were not the new device's");
		if(!sameThread)
			return fail("the facts callback ran on another thread");
		return 0;
	}
}

int main()
{
	if(const auto result = testStateCaptureEncodesUnlocked())
		return result;
	if(const auto result = testStateCaptureInParts())
		return result;
	if(const auto result = testStateCaptureRestartsOnNewDevice())
		return result;
	if(const auto result = testSetDevicePreparesUnlocked())
		return result;
	if(const auto result = testFactsPublishedUnderTheLock())
		return result;

	std::cout << "synthLib state capture tests passed\n";
	return 0;
}
