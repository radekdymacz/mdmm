#include "synthLib/device.h"
#include "synthLib/plugin.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <future>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>

namespace
{
	using namespace std::chrono_literals;

	struct Control
	{
		std::mutex mutex;
		std::condition_variable condition;
		uint32_t prepareStarted = 0;
		bool allowPrepare = false;
		std::function<void()> onTransactionDestroyed;
	};

	class TestDevice final : public synthLib::Device
	{
	public:
		explicit TestDevice(std::shared_ptr<Control> _control)
			: synthLib::Device({}), m_control(std::move(_control))
		{
		}

		class Transaction final : public StateTransaction
		{
		public:
			Transaction(std::shared_ptr<Control> _control, std::vector<uint8_t> _state,
				const uint64_t _generation)
				: control(std::move(_control)), state(std::move(_state))
				, generation(_generation)
			{
			}

			~Transaction() override
			{
				if(control->onTransactionDestroyed)
					control->onTransactionDestroyed();
			}

			bool prepare() override
			{
				std::unique_lock lock(control->mutex);
				++control->prepareStarted;
				control->condition.notify_all();
				control->condition.wait(lock, [&] { return control->allowPrepare; });
				return true;
			}

			std::shared_ptr<Control> control;
			std::vector<uint8_t> state;
			uint64_t generation;
		};

		float getSamplerate() const override { return 48000.0f; }
		bool isValid() const override { return true; }
		bool getState(std::vector<uint8_t>& _state, synthLib::StateType) override
		{
			_state.insert(_state.end(), m_state.begin(), m_state.end());
			return true;
		}
		bool setState(const std::vector<uint8_t>& _state, synthLib::StateType) override
		{
			m_state = _state;
			return true;
		}
		bool supportsStateTransactions() const override { return true; }
		std::unique_ptr<StateTransaction> beginStateTransaction(
			std::shared_ptr<const std::vector<uint8_t>> _state,
			synthLib::StateType) override
		{
			if(!_state)
				return {};
			return std::make_unique<Transaction>(m_control, *_state, ++m_generation);
		}
		bool finishStateTransaction(StateTransaction& _transaction) override
		{
			auto* const transaction = dynamic_cast<Transaction*>(&_transaction);
			if(!transaction || transaction->generation != m_generation)
				return false;
			m_state = transaction->state;
			return true;
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
		std::shared_ptr<Control> m_control;
		std::vector<uint8_t> m_state;
		uint64_t m_generation = 0;
	};

	int fail(const char* const _message)
	{
		std::cerr << _message << '\n';
		return 1;
	}
}

int main()
{
	auto control = std::make_shared<Control>();
	TestDevice device(control);
	synthLib::Plugin plugin(&device, [](synthLib::Device* const _device)
	{
		return _device;
	});

	std::atomic<bool> destructionWasUnlocked{false};
	std::atomic<bool> destructionProbeFinished{false};
	std::thread destructionProbeThread;
	control->onTransactionDestroyed = [&]
	{
		std::promise<void> acquiredPromise;
		auto acquired = acquiredPromise.get_future();
		destructionProbeThread = std::thread([&plugin, &destructionProbeFinished,
			promise = std::move(acquiredPromise)]() mutable
		{
			plugin.withDeviceLocked([](synthLib::Device*) {});
			destructionProbeFinished = true;
			promise.set_value();
		});
		destructionWasUnlocked = acquired.wait_for(500ms) == std::future_status::ready;
	};

	const std::vector<uint8_t> requested{1, synthLib::StateTypeGlobal, 0x2a};
	bool restored = false;
	std::thread restoreThread([&] { restored = plugin.setState(requested); });
	{
		std::unique_lock lock(control->mutex);
		if(!control->condition.wait_for(lock, 2s,
			[&] { return control->prepareStarted == 1; }))
		{
			control->allowPrepare = true;
			lock.unlock();
			control->condition.notify_all();
			restoreThread.join();
			return fail("state preparation did not start");
		}
	}

	// Preparation is deliberately blocked. The process/device lock must still be
	// immediately available to audio/control work on another thread.
	auto lockProbe = std::async(std::launch::async, [&]
	{
		return plugin.withDeviceLocked([](synthLib::Device* const _device)
		{
			return _device != nullptr;
		});
	});
	if(lockProbe.wait_for(500ms) != std::future_status::ready || !lockProbe.get())
	{
		{
			std::lock_guard lock(control->mutex);
			control->allowPrepare = true;
		}
		control->condition.notify_all();
		restoreThread.join();
		return fail("state preparation held the process/device lock");
	}

	{
		std::lock_guard lock(control->mutex);
		control->allowPrepare = true;
	}
	control->condition.notify_all();
	restoreThread.join();
	if(destructionProbeThread.joinable())
		destructionProbeThread.join();
	if(!restored)
		return fail("transactional state restore failed");
	if(!destructionProbeFinished || !destructionWasUnlocked)
		return fail("state transaction was destroyed under the process/device lock");

	std::vector<uint8_t> saved;
	if(!plugin.getState(saved, synthLib::StateTypeGlobal) || saved != requested)
		return fail("transactional state restore committed the wrong bytes");

	// A second request can begin while the first is preparing. The device-specific
	// generation check must make the older commit harmless even if it finishes last.
	control->onTransactionDestroyed = {};
	{
		std::lock_guard lock(control->mutex);
		control->prepareStarted = 0;
		control->allowPrepare = false;
	}
	const std::vector<uint8_t> older{1, synthLib::StateTypeGlobal, 0x31};
	const std::vector<uint8_t> newer{1, synthLib::StateTypeGlobal, 0x32};
	bool olderResult = true;
	bool newerResult = false;
	std::thread olderThread([&] { olderResult = plugin.setState(older); });
	{
		std::unique_lock lock(control->mutex);
		if(!control->condition.wait_for(lock, 2s,
			[&] { return control->prepareStarted == 1; }))
		{
			control->allowPrepare = true;
			lock.unlock();
			control->condition.notify_all();
			olderThread.join();
			return fail("older concurrent restore did not start");
		}
	}
	std::thread newerThread([&] { newerResult = plugin.setState(newer); });
	{
		std::unique_lock lock(control->mutex);
		if(!control->condition.wait_for(lock, 2s,
			[&] { return control->prepareStarted == 2; }))
		{
			control->allowPrepare = true;
			control->condition.notify_all();
			olderThread.join();
			newerThread.join();
			return fail("newer concurrent restore did not start");
		}
		control->allowPrepare = true;
	}
	control->condition.notify_all();
	olderThread.join();
	newerThread.join();
	saved.clear();
	if(olderResult || !newerResult
		|| !plugin.getState(saved, synthLib::StateTypeGlobal) || saved != newer)
		return fail("an interrupted restore superseded the newer request");

	// B-203: a block-end job runs on the audio thread at a block's end while blocks run, and in a hold of the caller's
	// own when none do; the caller then never holds the lock while blocks run
	{
		TestDevice jobDevice(std::make_shared<Control>());
		synthLib::Plugin jobPlugin(&jobDevice, [](synthLib::Device*) {});
		jobPlugin.setHostSamplerate(48000.0f, 48000.0f);
		jobPlugin.setBlockSize(64);
		jobPlugin.getRealtimeInstrumentation().setEnabled(true);
		const auto holdsAt = [&](const uint32_t _line)
		{
			const auto snap = jobPlugin.getRealtimeInstrumentation().snapshot();
			for(size_t i = 0; i < snap.lockHoldCount; ++i)
				if(snap.lockHolds[i].line == _line && snap.lockHolds[i].file && std::string(snap.lockHolds[i].file) == __FILE__)
					return snap.lockHolds[i].waits;
			return uint64_t{0};
		};

		// no audio: the job runs here, under the lock, named by its caller's site
		std::thread::id ranOn;
		synthLib::Device* ranWith = nullptr;
		const auto job = [&](synthLib::Device* const _device)
		{
			ranOn = std::this_thread::get_id();
			ranWith = _device;
		};
		const uint32_t idleLine = __LINE__ + 1;
		const bool idleAtBlockEnd = jobPlugin.withDeviceAtBlockEnd(job, 20ms);
		if(idleAtBlockEnd || ranOn != std::this_thread::get_id() || ranWith != &jobDevice || holdsAt(idleLine) != 1)
			return fail("a block-end job with no audio did not run in a hold of its caller's own");

		// blocks run: the job runs on the audio thread, and the caller holds no lock
		std::atomic<bool> run{true};
		std::atomic<uint32_t> blocks{0};
		std::thread::id audioThread;
		std::thread audio([&]
		{
			audioThread = std::this_thread::get_id();
			const synthLib::TAudioInputs inputs{};
			const synthLib::TAudioOutputs outputs{};
			while(run)
			{
				jobPlugin.process(inputs, outputs, 64, 120.0, 0.0, false);
				++blocks;
				std::this_thread::sleep_for(1ms);
			}
		});
		// until a block has ended, a job runs at once in a hold of its own (no block since the last found none)
		while(!blocks)
			std::this_thread::sleep_for(1ms);
		bool allAtBlockEnd = true;
		bool allOnAudio = true;
		const uint32_t blockLine = __LINE__ + 4;
		for(int i = 0; i < 20; ++i)
		{
			ranOn = {};
			if(!jobPlugin.withDeviceAtBlockEnd(job, 2000ms))
				allAtBlockEnd = false;
			if(ranOn != audioThread)
				allOnAudio = false;
		}
		run = false;
		audio.join();
		if(!allAtBlockEnd || !allOnAudio || holdsAt(blockLine) != 0)
			return fail("a block-end job did not run on the audio thread at a block's end while blocks ran");

		// the audio stopped: back to a hold of its own
		ranOn = {};
		if(jobPlugin.withDeviceAtBlockEnd(job, 20ms) || ranOn != std::this_thread::get_id())
			return fail("a block-end job after the audio stopped did not run in a hold of its own");
	}

	std::cout << "synthLib state transaction tests passed\n";
	return 0;
}
