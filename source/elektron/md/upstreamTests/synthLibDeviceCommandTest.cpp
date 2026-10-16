// synthLib::Plugin::sendCommands (DESIGN-audio-lock.md step 3): commands another thread hands the device are applied on
// the audio thread at the start of the next block, in order and all of one call in the same block; a full queue (no
// blocks run) is applied under the lock instead of dropping; a command for a replaced device or one the device refuses
// is dropped and counted. Also the lock blame: a wait of the audio thread names the holder's site.

#include "synthLib/device.h"
#include "synthLib/plugin.h"

#include <array>
#include <atomic>
#include <chrono>
#include <cstring>
#include <iostream>
#include <thread>
#include <vector>

namespace
{
	using namespace std::chrono_literals;

	int g_failures = 0;

	void check(const bool _ok, const char* const _what)
	{
		std::cout << (_ok ? "ok: " : "FAIL: ") << _what << '\n';
		if(!_ok)
			++g_failures;
	}

	// Records the commands it applied (their kind and a) and the block each came in
	class CommandTestDevice final : public synthLib::Device
	{
	public:
		static constexpr uint32_t RefusedKind = 99;

		CommandTestDevice() : synthLib::Device({}) {}

		struct Applied { uint32_t kind, a; uint64_t block; };
		std::vector<Applied> applied;	// the audio thread's (or the holder of the lock's)
		std::atomic<uint64_t> blocks{0};

		bool applyCommand(const synthLib::DeviceCommand& _command) override
		{
			if(_command.kind == RefusedKind)
				return false;
			applied.push_back({_command.kind, _command.a, blocks.load(std::memory_order_relaxed)});
			return true;
		}

		float getSamplerate() const override { return 48000.0f; }
		bool isValid() const override { return true; }
		bool getState(std::vector<uint8_t>&, synthLib::StateType) override { return false; }
		bool setState(const std::vector<uint8_t>&, synthLib::StateType) override { return false; }
		uint32_t getChannelCountIn() override { return 0; }
		uint32_t getChannelCountOut() override { return 2; }
		bool setDspClockPercent(uint32_t) override { return true; }
		uint32_t getDspClockPercent() const override { return 100; }
		uint64_t getDspClockHz() const override { return 0; }

	protected:
		void readMidiOut(std::vector<synthLib::SMidiEvent>&) override {}
		void processAudio(const synthLib::TAudioInputs&, const synthLib::TAudioOutputs& _outputs, const size_t _samples) override
		{
			for(auto* out : _outputs)
				if(out)
					std::memset(out, 0, sizeof(float) * _samples);
			blocks.fetch_add(1, std::memory_order_relaxed);
		}
		bool sendMidi(const synthLib::SMidiEvent&, std::vector<synthLib::SMidiEvent>&) override { return true; }
	};

	struct Audio
	{
		static constexpr size_t Frames = 64;
		std::array<std::array<float, Frames>, 2> output{};
		synthLib::TAudioInputs inputs{};
		synthLib::TAudioOutputs outputs{};
		Audio() { for(size_t c = 0; c < output.size(); ++c) outputs[c] = output[c].data(); }
		void block(synthLib::Plugin& _plugin) { _plugin.process(inputs, outputs, Frames, 120.0, 0.0, false); }
	};

	synthLib::DeviceCommand command(const uint32_t _kind, const uint32_t _a)
	{
		synthLib::DeviceCommand c;
		c.kind = _kind;
		c.a = _a;
		return c;
	}

	void prepare(synthLib::Plugin& _plugin)
	{
		_plugin.setHostSamplerate(48000.0f, 48000.0f);
		_plugin.setBlockSize(Audio::Frames);
	}

	void testAppliedAtTheNextBlockInOrder()
	{
		auto* device = new CommandTestDevice();
		synthLib::Plugin plugin(device, [](synthLib::Device*) {});
		prepare(plugin);
		Audio audio;
		std::vector<synthLib::DeviceCommand> batch;
		for(uint32_t i = 0; i < 5; ++i)
			batch.push_back(command(1, i));
		check(plugin.sendCommands(batch.data(), batch.size()), "five commands queued");
		check(device->applied.empty(), "none applied before a block");
		audio.block(plugin);
		bool inOrder = device->applied.size() == 5;
		for(size_t i = 0; inOrder && i < 5; ++i)
			inOrder = device->applied[i].a == i && device->applied[i].block == 0;
		check(inOrder, "all five at the start of the next block, in order");
		check(plugin.getDroppedCommandCount() == 0, "none dropped");
		std::vector<synthLib::DeviceCommand> tooMany(synthLib::Plugin::CommandCapacity + 1, command(1, 0));
		check(!plugin.sendCommands(tooMany.data(), tooMany.size()), "more than the queue holds at once: refused");
		delete device;
	}

	void testABatchIsOneBlock()
	{
		auto* device = new CommandTestDevice();
		synthLib::Plugin plugin(device, [](synthLib::Device*) {});
		prepare(plugin);
		std::atomic<bool> run{true};
		std::thread audioThread([&]
		{
			Audio audio;
			while(run)
				audio.block(plugin);
		});
		constexpr uint32_t Batches = 2000, PerBatch = 7;
		for(uint32_t b = 0; b < Batches; ++b)
		{
			std::array<synthLib::DeviceCommand, PerBatch> batch;
			for(uint32_t i = 0; i < PerBatch; ++i)
				batch[i] = command(1, b * PerBatch + i);
			while(!plugin.sendCommands(batch.data(), batch.size()))
				std::this_thread::yield();
		}
		std::this_thread::sleep_for(20ms);
		run = false;
		audioThread.join();
		bool all = device->applied.size() == Batches * PerBatch;
		bool sameBlock = all, ordered = all;
		for(size_t i = 0; all && i < device->applied.size(); ++i)
		{
			ordered = ordered && device->applied[i].a == i;
			if(i % PerBatch)
				sameBlock = sameBlock && device->applied[i].block == device->applied[i - 1].block;
		}
		check(all && ordered, "every command of a busy sender applied once, in order");
		check(sameBlock, "each call's commands in one block");
		check(plugin.getDroppedCommandCount() == 0, "none dropped");
		delete device;
	}

	void testFullQueueAppliedUnderTheLock()
	{
		auto* device = new CommandTestDevice();
		synthLib::Plugin plugin(device, [](synthLib::Device*) {});
		prepare(plugin);
		// no blocks run (a stopped host): the queue fills, then is applied by the sender
		const auto total = static_cast<uint32_t>(synthLib::Plugin::CommandCapacity * 2 + 3);
		for(uint32_t i = 0; i < total; ++i)
		{
			const auto c = command(1, i);
			plugin.sendCommands(&c, 1);
		}
		check(device->applied.size() == synthLib::Plugin::CommandCapacity * 2, "a full queue is applied by the sender, not dropped");
		Audio audio;
		audio.block(plugin);
		bool ordered = device->applied.size() == total;
		for(size_t i = 0; ordered && i < total; ++i)
			ordered = device->applied[i].a == i;
		check(ordered, "the rest at the next block, every one in order");
		check(plugin.getDroppedCommandCount() == 0, "none dropped");
		delete device;
	}

	void testStaleAndRefusedAreDropped()
	{
		auto* first = new CommandTestDevice();
		synthLib::Plugin plugin(first, [](synthLib::Device*) {});
		prepare(plugin);
		Audio audio;
		const auto refused = command(CommandTestDevice::RefusedKind, 0);
		plugin.sendCommands(&refused, 1);
		audio.block(plugin);
		check(plugin.getDroppedCommandCount() == 1, "a refused command is counted");
		const auto stale = command(1, 7);
		plugin.sendCommands(&stale, 1);
		auto* second = new CommandTestDevice();
		plugin.setDevice(second);	// deletes the first
		audio.block(plugin);
		check(second->applied.empty(), "a command queued for the replaced device does not reach the new one");
		check(plugin.getDroppedCommandCount() == 2, "and is counted");
		const auto fresh = command(1, 8);
		plugin.sendCommands(&fresh, 1);
		audio.block(plugin);
		check(second->applied.size() == 1 && second->applied[0].a == 8, "the new device gets what is sent after the swap");
		delete second;
	}

	void testWaitNamesTheHolder()
	{
		auto* device = new CommandTestDevice();
		synthLib::Plugin plugin(device, [](synthLib::Device*) {});
		prepare(plugin);
		auto& realtime = plugin.getRealtimeInstrumentation();
		realtime.setEnabled(true);
		realtime.reset();
		std::atomic<bool> held{false};
		uint32_t line = 0;
		std::thread holder([&]
		{
			line = __LINE__ + 1;
			plugin.withDeviceLocked([&](synthLib::Device*) { held = true; std::this_thread::sleep_for(30ms); });
		});
		while(!held)
			std::this_thread::yield();
		Audio audio;
		audio.block(plugin);
		holder.join();
		const auto snap = realtime.snapshot();
		bool named = false;
		for(size_t i = 0; i < snap.lockBlameCount; ++i)
		{
			const auto& b = snap.lockBlame[i];
			named = named || (b.file && std::strstr(b.file, "synthLibDeviceCommandTest.cpp") && b.line == line && b.waits == 1
				&& b.maxNanoseconds >= 10'000'000);
		}
		check(named, "the audio thread's wait is blamed on the holder's file and line");
		bool hold = false;
		for(size_t i = 0; i < snap.lockHoldCount; ++i)
			hold = hold || (snap.lockHolds[i].line == line && snap.lockHolds[i].maxNanoseconds >= 25'000'000);
		check(hold, "the hold itself is recorded at that site");
		delete device;
	}
}

int main()
{
	testAppliedAtTheNextBlockInOrder();
	testABatchIsOneBlock();
	testFullQueueAppliedUnderTheLock();
	testStaleAndRefusedAreDropped();
	testWaitNamesTheHolder();
	std::cout << (g_failures ? "synthLibDeviceCommandTest: FAIL\n" : "synthLibDeviceCommandTest: PASS\n");
	return g_failures ? 1 : 0;
}
