// A state save without the plug-in's lock (codex review 2026-10, item 3): the table-driven CRC-32 of the state and
// cache formats (mdstate.cpp), and md::Device's capture (mdstatecapture.h): copied under the lock, encoded after it,
// the same bytes as the save under the lock wrote. The capture part needs the firmware (GEARMULATOR_MD_FIRMWARE_BIN,
// GEARMULATOR_MM_FIRMWARE_BIN): md::Device takes only the supported ROMs.

#include "baseLib/filesystem.h"
#include "mdLib/mddevice.h"
#include "mdLib/mdmemorymap.h"
#include "mdLib/mdonemomentcopy.h"
#include "mdLib/mdromdata.h"
#include "mdLib/mdstatecapture.h"
#include "mdLib/mdstate.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <string>
#include <vector>

namespace
{
	int g_failures = 0;

	void check(const bool _condition, const char* const _message)
	{
		std::printf("[%s] %s\n", _condition ? "PASS" : "FAIL", _message);
		if(!_condition)
			++g_failures;
	}

	std::vector<uint8_t> makePatchRam()
	{
		std::vector<uint8_t> result(md::g_patchRamStateSize);
		uint32_t value = 0x12345678;
		for(auto& byte : result)
		{
			value = value * 1664525u + 1013904223u;
			byte = static_cast<uint8_t>(value >> 24);
		}
		return result;
	}

	// The bitwise CRC-32 the state format was written with: the reference for the table-driven one
	uint32_t crc32(const uint8_t* const _data, const size_t _size)
	{
		uint32_t crc = 0xffffffffu;
		for(size_t i = 0; i < _size; ++i)
		{
			crc ^= _data[i];
			for(uint32_t bit = 0; bit < 8; ++bit)
				crc = (crc >> 1) ^ (0xedb88320u & (0u - (crc & 1u)));
		}
		return ~crc;
	}

	// The state CRC is table-driven: it must give exactly what the bitwise CRC-32 gave, or old states and caches
	// stop loading. The standard check value, then random buffers of awkward lengths against the bitwise reference.
	void testCrc32()
	{
		const std::string checkInput = "123456789";
		check(md::crc32(reinterpret_cast<const uint8_t*>(checkInput.data()), checkInput.size()) == 0xcbf43926u,
			"CRC-32 of \"123456789\" is 0xCBF43926");
		check(md::crc32(nullptr, 0) == 0, "CRC-32 of nothing is 0");

		uint32_t seed = 0x9e3779b9u;
		bool same = true;
		for(const size_t size : {size_t(1), size_t(3), size_t(7), size_t(64), size_t(4093),
			size_t(md::g_uwFlashSectorSize), size_t(md::g_patchRamStateSize)})
		{
			std::vector<uint8_t> data(size);
			for(auto& byte : data)
			{
				seed = seed * 1664525u + 1013904223u;
				byte = static_cast<uint8_t>(seed >> 24);
			}
			same = same && md::crc32(data.data(), data.size()) == crc32(data.data(), data.size());
		}
		check(same, "table CRC-32 equals the bitwise CRC-32 on random buffers");

		using clock = std::chrono::steady_clock;
		const auto patchRam = makePatchRam();
		const auto t0 = clock::now();
		const auto bitwise = crc32(patchRam.data(), patchRam.size());
		const auto t1 = clock::now();
		const auto table = md::crc32(patchRam.data(), patchRam.size());
		const auto t2 = clock::now();
		std::printf("  CRC-32 of 1 MiB: bitwise %.2f ms, table %.2f ms\n",
			std::chrono::duration<double, std::milli>(t1 - t0).count(),
			std::chrono::duration<double, std::milli>(t2 - t1).count());
		check(bitwise == table, "and on the patch RAM image");
	}

	// A state save captures under the plug-in's lock and encodes after it (md::Device::beginStateCapture). The
	// bytes must be what the encoder gives for the machine's memories, as the save under the lock wrote them, in
	// every case the device picks: sparse against the factory baseline, a complete image before there is one, a
	// restore in progress (the requested bytes, or its pending overlay for the other state type), and the
	// Monomachine's patch RAM plus user flash. Needs the firmware: md::Device takes only the supported ROMs.
	struct CaptureResult
	{
		std::vector<uint8_t> bytes;
		double lockedMs = 0;
		double encodeMs = 0;
		int holds = 0;
	};

	CaptureResult captureState(md::Device& _device, const synthLib::StateType _type)
	{
		using clock = std::chrono::steady_clock;
		CaptureResult result;
		// beginStateCapture with the first captureMore, then each captureMore, is one hold of the plug-in's lock
		// (synthLib::Plugin::getState): lockedMs is the longest (DESIGN-audio-lock.md step 1: the MD flash a part a hold)
		std::unique_ptr<synthLib::Device::StateCapture> capture;
		for(bool more = true; more; ++result.holds)
		{
			const auto t0 = clock::now();
			if(!capture)
				capture = _device.beginStateCapture(_type);
			more = capture && capture->captureMore();
			result.lockedMs = std::max(result.lockedMs, std::chrono::duration<double, std::milli>(clock::now() - t0).count());
		}
		const auto t1 = clock::now();
		if(!capture || !capture->encode(result.bytes))
			result.bytes.clear();
		result.encodeMs = std::chrono::duration<double, std::milli>(clock::now() - t1).count();
		return result;
	}

	std::unique_ptr<md::Device> makeDevice(const std::vector<uint8_t>& _rom, const md::MachineModel _model,
		const std::string& _home)
	{
		synthLib::DeviceCreateParams params;
		params.romData = _rom;
		params.romName = _model == md::MachineModel::Monomachine ? "mm-state-test.bin" : "md-state-test.bin";
		params.customData = md::deviceCustomData(_model);
		params.homePath = _home;
		return std::make_unique<md::Device>(params);
	}

	bool sameAsGetState(md::Device& _device, const synthLib::StateType _type, const std::vector<uint8_t>& _captured)
	{
		std::vector<uint8_t> state;
		return _device.getState(state, _type) && state == _captured;
	}

	void testMachinedrumStateCapture(const std::vector<uint8_t>& _rom)
	{
		// A machine-local factory cache for this ROM: 34 initialized sectors, as the OS 1.63 cache has
		auto factory = _rom;
		for(size_t sector = 0; sector < 34; ++sector)
			for(size_t i = 0; i < md::g_uwFlashSectorSize; i += 61)
				factory[(sector * 3 + 1) * md::g_uwFlashSectorSize + i] ^= static_cast<uint8_t>(sector + 1);
		std::vector<uint8_t> cache;
		check(md::encodeFactoryFlashCache(cache, factory, _rom), "capture: a factory cache for the firmware encodes");

		const auto nonce = std::chrono::steady_clock::now().time_since_epoch().count();
		const auto home = baseLib::filesystem::getCurrentDirectory() + ".md-state-capture-test-"
			+ std::to_string(nonce) + "/";
		const auto cacheFile = home + "nvram/md-uw-1.63-factory-v2.cache";
		baseLib::filesystem::createDirectory(home + "nvram");
		check(baseLib::filesystem::writeFile(cacheFile, cache), "capture: the factory cache is stored");
		auto cached = makeDevice(_rom, md::MachineModel::Machinedrum, home);
		baseLib::filesystem::remove(cacheFile);
		baseLib::filesystem::remove(home + "nvram");
		baseLib::filesystem::remove(home);
		check(cached->isValid(), "capture: the Machinedrum boots from the factory cache");

		// User samples in 16 sectors, then the sparse state against the factory baseline
		auto& hardware = cached->getHardware();
		auto flash = hardware.copyFlashData();
		for(size_t sector = 0; sector < 16; ++sector)
			for(size_t i = 0; i < md::g_uwFlashSectorSize; i += 97)
				flash[(64 + sector) * md::g_uwFlashSectorSize + i] ^= static_cast<uint8_t>(sector * 31 + 7);
		hardware.replaceFlashData(flash, true);
		std::vector<uint8_t> sparseExpected;
		check(md::encodeStateWithFactoryBaseline(sparseExpected, hardware.copyPatchRam(), flash, factory, _rom,
			md::MachineModel::Machinedrum, synthLib::StateTypeGlobal), "capture: the sparse reference encodes");
		const auto first = captureState(*cached, synthLib::StateTypeGlobal);
		const auto again = captureState(*cached, synthLib::StateTypeGlobal);
		check(first.bytes == sparseExpected && again.bytes == sparseExpected,
			"capture: sparse state against the factory baseline, byte for byte");
		check(sameAsGetState(*cached, synthLib::StateTypeGlobal, sparseExpected), "capture: getState writes the same");
		std::printf("  state save, MD from the factory cache, 16 sample sectors: longest hold %.2f ms then %.2f ms (%d holds), "
			"encode %.2f ms (first, decodes the cache) then %.2f ms\n",
			first.lockedMs, again.lockedMs, first.holds, first.encodeMs, again.encodeMs);
		check(first.lockedMs < 1.0 && again.lockedMs < 1.0 && first.holds > 1, "capture: the MD flash is taken a part per hold, each under 1 ms");

		// The flash written while the capture is taken in parts (DESIGN-audio-lock.md step 1): the pieces written
		// are copied again and the save is the flash as it is after the write, never parts of before and after
		{
			auto capture = cached->beginStateCapture(synthLib::StateTypeGlobal);
			const bool parts = capture && capture->captureMore() && capture->captureMore();
			auto changed = flash;
			for(size_t i = 0; i < md::g_uwFlashSectorSize; i += 13)
				changed[90 * md::g_uwFlashSectorSize + i] ^= 0x5a;	// a sector the parts copied after the first ones
			changed[2 * md::g_uwFlashSectorSize + 7] ^= 0x01;			// and one in the parts already copied
			hardware.replaceFlashData(changed, true);
			while(capture && capture->captureMore())
			{
			}
			std::vector<uint8_t> bytes, expected;
			check(parts && capture && capture->encode(bytes)
				&& md::encodeStateWithFactoryBaseline(expected, hardware.copyPatchRam(), changed, factory, _rom,
					md::MachineModel::Machinedrum, synthLib::StateTypeGlobal)
				&& bytes == expected, "capture: a flash write during the parts is copied again (the flash after it)");
			hardware.replaceFlashData(flash, true);
		}

		// The patch RAM written while the capture is taken in parts (md::OneMomentCopy): the piece written after it was
		// copied is copied again, and the save is the patch RAM after the write
		{
			auto capture = cached->beginStateCapture(synthLib::StateTypeGlobal);
			bool parts = capture != nullptr;
			for(int i = 0; parts && i < 130; ++i)	// the flash's 128 parts and two of the patch RAM's
				parts = capture->captureMore();
			auto& uc = hardware.getUC();
			const auto before = hardware.copyPatchRam();
			uc.pokePatchRamForTest(0x123, static_cast<uint8_t>(before[0x123] ^ 0xa5));		// a piece copied already
			uc.pokePatchRamForTest(0xf0000, static_cast<uint8_t>(before[0xf0000] ^ 0x3c));	// one not yet
			while(capture && capture->captureMore())
			{
			}
			std::vector<uint8_t> bytes, expected;
			check(parts && capture && capture->encode(bytes)
				&& md::encodeStateWithFactoryBaseline(expected, hardware.copyPatchRam(), flash, factory, _rom,
					md::MachineModel::Machinedrum, synthLib::StateTypeGlobal)
				&& bytes == expected, "capture: patch RAM written during the parts is saved as it is after the writes");
			uc.pokePatchRamForTest(0x123, before[0x123]);
			uc.pokePatchRamForTest(0xf0000, before[0xf0000]);
		}

		// Written faster than it is copied (DESIGN-audio-lock.md, the rest): 17 pieces of the patch RAM (more than the
		// 256 KiB one hold may copy) written between every part never settle. No hold copies more than that, and after
		// a bounded number of holds the save fails rather than take the memory whole in one hold
		{
			auto capture = cached->beginStateCapture(synthLib::StateTypeGlobal);
			auto* const typed = dynamic_cast<md::DeviceStateCapture*>(capture.get());
			auto& uc = hardware.getUC();
			const auto patchBefore = hardware.copyPatchRam();
			uint32_t holds = 0;
			size_t worstBytes = 0;
			while(typed && holds < 20000)
			{
				for(size_t i = 0; i < 17; ++i)
					uc.pokePatchRamForTest(i * md::Microcontroller::g_patchRamMarkSize, static_cast<uint8_t>(holds));
				const bool more = capture->captureMore();
				worstBytes = std::max(worstBytes, typed->copy.maxStepBytes());
				++holds;
				if(!more)
					break;
			}
			std::vector<uint8_t> bytes;
			std::printf("  state save with the patch RAM written faster than copied: gave up after %u holds, no hold copied more than %zu KiB\n",
				holds, worstBytes / 1024);
			check(typed && holds < 20000 && !capture->encode(bytes),
				"capture: a memory written faster than it is copied fails after a bounded number of holds");
			check(typed && worstBytes <= md::OneMomentCopy::g_restLimit,
				"capture: no hold copies more than the rest limit (256 KiB)");
			for(size_t i = 0; i < 17; ++i)
				uc.pokePatchRamForTest(i * md::Microcontroller::g_patchRamMarkSize, patchBefore[i * md::Microcontroller::g_patchRamMarkSize]);
		}

		// No factory cache yet: a complete flash image
		auto firstRun = makeDevice(_rom, md::MachineModel::Machinedrum, {});
		std::vector<uint8_t> completeExpected;
		check(md::encodeState(completeExpected, firstRun->getHardware().copyPatchRam(),
			firstRun->getHardware().copyFlashData(), _rom, _rom, md::MachineModel::Machinedrum,
			synthLib::StateTypeGlobal), "capture: the complete-image reference encodes");
		const auto complete = captureState(*firstRun, synthLib::StateTypeGlobal);
		check(complete.bytes == completeExpected, "capture: complete flash image without a factory baseline");
		check(sameAsGetState(*firstRun, synthLib::StateTypeGlobal, completeExpected),
			"capture: getState writes the same complete image");
		std::printf("  state save, MD without a factory cache (complete image): under the lock %.2f ms, "
			"encode %.2f ms\n",
			complete.lockedMs, complete.encodeMs);

		// Restoring the sparse state without its factory baseline leaves it pending
		auto pending = makeDevice(_rom, md::MachineModel::Machinedrum, {});
		check(pending->setState(sparseExpected, synthLib::StateTypeGlobal) && pending->isProjectStateRestorePending(),
			"capture: a sparse restore without the factory baseline is pending");
		const auto requested = captureState(*pending, synthLib::StateTypeGlobal);
		check(requested.bytes == sparseExpected, "capture: a pending restore saves the requested state");
		md::DecodedState decoded;
		std::vector<uint8_t> overlayExpected;
		check(md::decodeState(decoded, sparseExpected, _rom, md::MachineModel::Machinedrum, synthLib::StateTypeGlobal)
			&& md::encodeState(overlayExpected, decoded.patchRam, decoded.flashOverlay, _rom,
				md::MachineModel::Machinedrum, synthLib::StateTypeCurrentProgram),
			"capture: the pending-overlay reference encodes");
		const auto overlay = captureState(*pending, synthLib::StateTypeCurrentProgram);
		check(overlay.bytes == overlayExpected, "capture: the other state type saves the pending overlay");
		check(sameAsGetState(*pending, synthLib::StateTypeCurrentProgram, overlayExpected),
			"capture: getState writes the same pending overlay");
	}

	void testMonomachineStateCapture(const std::vector<uint8_t>& _rom)
	{
		auto mm = makeDevice(_rom, md::MachineModel::Monomachine, {});
		check(mm->isValid(), "capture: the Monomachine boots");
		std::vector<uint8_t> expected;
		check(md::encodeState(expected, mm->getHardware().copyPatchRam(), md::MachineModel::Monomachine,
			synthLib::StateTypeGlobal, mm->getHardware().copyUserFlash()),
			"capture: the Monomachine reference encodes");
		const auto captured = captureState(*mm, synthLib::StateTypeGlobal);
		check(captured.bytes == expected, "capture: Monomachine patch RAM and user flash, byte for byte");
		check(sameAsGetState(*mm, synthLib::StateTypeGlobal, expected), "capture: getState writes the same");
		std::printf("  state save, MM: under the lock %.2f ms, encode %.2f ms\n", captured.lockedMs, captured.encodeMs);

		// A firmware flash write (the AM29F program command through the CPU's write path) while the capture is taken in
		// parts: it marks its own 64 KiB piece of the flash, which is copied again, and the save is the flash after it
		{
			auto capture = mm->beginStateCapture(synthLib::StateTypeGlobal);
			bool parts = capture != nullptr;
			for(int i = 0; parts && i < 20; ++i)	// the patch RAM's parts and the first of the user flash's
				parts = capture->captureMore();
			auto& uc = mm->getHardware().getUC();
			const auto base = md::memorymap::g_flashFull.begin;
			const auto userBase = md::memorymap::g_flashFull.offset(md::memorymap::g_mmUserFlash.begin);
			const auto flashBefore = uc.flashMark(userBase);
			const auto otherBefore = uc.flashMark(userBase + 3 * md::Microcontroller::g_flashMarkSize);
			const auto userBefore = mm->getHardware().copyUserFlash();
			uc.write16(base + 0xaaa, 0xaa);
			uc.write16(base + 0x554, 0x55);
			uc.write16(base + 0xaaa, 0xa0);
			uc.write16(base + userBase + 0x20, 0x0000);	// the first piece, copied already
			const bool marked = uc.flashMark(userBase) != flashBefore
				&& uc.flashMark(userBase + 3 * md::Microcontroller::g_flashMarkSize) == otherBefore;
			while(capture && capture->captureMore())
			{
			}
			const auto userAfter = mm->getHardware().copyUserFlash();
			std::vector<uint8_t> bytes, expectedAfter;
			check(parts && marked && userAfter != userBefore && capture && capture->encode(bytes)
				&& md::encodeState(expectedAfter, mm->getHardware().copyPatchRam(), md::MachineModel::Monomachine,
					synthLib::StateTypeGlobal, userAfter)
				&& bytes == expectedAfter,
				"capture: Monomachine firmware flash write during the parts marks its own piece and is saved as after the write");
		}
	}

	void testStateCapture()
	{
		const auto* const mdPath = std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
		const auto* const mmPath = std::getenv("GEARMULATOR_MM_FIRMWARE_BIN");
		const auto* const required = std::getenv("GEARMULATOR_REQUIRE_FIRMWARE_TESTS");
		const bool require = required && std::string(required) == "1";
		std::vector<uint8_t> rom;
		if(mdPath && *mdPath && baseLib::filesystem::readFile(rom, mdPath))
			testMachinedrumStateCapture(rom);
		else if(require)
			check(false, "capture: GEARMULATOR_MD_FIRMWARE_BIN is required");
		else
			std::puts("  SKIP the Machinedrum state capture (GEARMULATOR_MD_FIRMWARE_BIN not set)");
		rom.clear();
		if(mmPath && *mmPath && baseLib::filesystem::readFile(rom, mmPath))
			testMonomachineStateCapture(rom);
		else if(require)
			check(false, "capture: GEARMULATOR_MM_FIRMWARE_BIN is required");
		else
			std::puts("  SKIP the Monomachine state capture (GEARMULATOR_MM_FIRMWARE_BIN not set)");
	}
}

int main()
{
	std::puts("Machinedrum and Monomachine state capture tests\n");
	testCrc32();
	testStateCapture();
	std::printf("\n%s (%d failures)\n", g_failures == 0 ? "OK" : "FAILED", g_failures);
	return g_failures == 0 ? 0 : 1;
}
