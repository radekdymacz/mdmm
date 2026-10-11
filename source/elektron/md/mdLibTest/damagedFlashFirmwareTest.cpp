// B-054: a Machinedrum whose flash image is damaged, or whose DSP stopped taking the ColdFire's words, must not hang
// the emulation (the audio thread, holding the device lock). Three cases, each run on a worker thread under a
// watchdog (a hang cannot be undone, so the watchdog fails the test and exits):
//   queue    a running machine; DSP1 kept running but no longer reading its host port (a loop of its own, its host
//            interrupts off), its receive ring filled: the ColdFire's next word used to block for good in the ring's
//            semaphore, on the thread that would empty it. Now: dropped and counted. Then DSP1 halted: the words and
//            host commands to it are dropped too.
//   halted   a machine started on a flash image whose OS sector 6 is damaged (no loader in between): a DSP runs the
//            garbage the OS uploads, its PC leaves P memory and it halts; the scheduler used to wait for its cycles
//            for good. Now: the halted DSP is parked, the rest of the machine runs on.
//   loader   the same damaged image as a project state (a valid CRC: the bytes as stored), loaded as a project:
//            the loader puts the ROM's bytes back in the firmware's sectors, so the machine starts as it should.
// Needs the MD OS 1.63 ROM:  GEARMULATOR_MD_FIRMWARE_BIN=<ROM> mdDamagedFlashFirmwareTest [queue|halted|loader]
// Exits 77 without it.

#include "mdLib/mddevice.h"
#include "mdLib/mdhardware.h"
#include "mdLib/mddsp.h"
#include "mdLib/mdstate.h"
#include "mdLib/mdtypes.h"

#include "dsp56kEmu/hdi08.h"
#include "mc68k/hdi08.h"
#include "mc68k/peripheralTypes.h"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <functional>
#include <iterator>
#include <memory>
#include <string>
#include <thread>
#include <vector>

namespace
{
	int g_failures = 0;

	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s: %s\n", _ok ? "ok" : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}

	// _run on a worker thread; it bumps _progress as machine time passes. No progress for 20 s of wall time: a
	// hang, which nothing can end, so the test fails here and exits.
	void watched(const char* _name, const std::function<void(std::atomic<uint64_t>&)>& _run)
	{
		std::atomic<uint64_t> progress{0};
		std::atomic<bool> done{false};
		std::thread worker([&]
		{
			_run(progress);
			done = true;
		});
		uint64_t last = 0;
		auto since = std::chrono::steady_clock::now();
		while(!done)
		{
			std::this_thread::sleep_for(std::chrono::milliseconds(100));
			const auto p = progress.load();
			if(p != last)
			{
				last = p;
				since = std::chrono::steady_clock::now();
				continue;
			}
			if(std::chrono::steady_clock::now() - since > std::chrono::seconds(20))
			{
				std::printf("  FAIL: %s: the emulation hung (no machine time passed for 20 s, after %llu blocks)\n", _name,
					static_cast<unsigned long long>(p));
				std::printf("mdDamagedFlashFirmwareTest: FAIL\n");
				std::fflush(stdout);
				std::_Exit(1);
			}
		}
		worker.join();
	}

	constexpr uint32_t g_block = 128;
	constexpr uint64_t blocksOf(const double _seconds) { return static_cast<uint64_t>(_seconds * md::g_samplerate / g_block); }

	std::vector<uint8_t> damaged(const std::vector<uint8_t>& _rom, const uint32_t _sector)
	{
		auto flash = _rom;
		auto* p = flash.data() + static_cast<size_t>(_sector) * md::g_uwFlashSectorSize;
		for(size_t i = 0; i < md::g_uwFlashSectorSize; ++i)
			p[i] ^= 0xa5;
		return flash;
	}

	bool sectorIsRom(const std::vector<uint8_t>& _flash, const std::vector<uint8_t>& _rom, const uint32_t _sector)
	{
		const auto offset = static_cast<size_t>(_sector) * md::g_uwFlashSectorSize;
		return _flash.size() == _rom.size()
			&& std::equal(_rom.begin() + offset, _rom.begin() + offset + md::g_uwFlashSectorSize, _flash.begin() + offset);
	}

	// Run until the firmware takes MIDI (at most _seconds of machine time); true if it did.
	bool runToMidiReady(md::Hardware& _hw, std::atomic<uint64_t>& _progress, const double _seconds)
	{
		for(uint64_t b = 0; b < blocksOf(_seconds); ++b)
		{
			_hw.advance(g_block);
			++_progress;
			if(_hw.isFirmwareMidiReady() && _hw.isAudioReady())
				return true;
		}
		return false;
	}

	// The ColdFire's store of one word to a DSP's host port, the bytes as the firmware writes them (the port's write
	// callback hands the word to md::Dsp, exactly as when the firmware writes).
	void storeWord(mc68k::Hdi08& _port, const uint32_t _word)
	{
		_port.write8(mc68k::PeriphAddress::HdiTXH, static_cast<uint8_t>(_word >> 16));
		_port.write8(mc68k::PeriphAddress::HdiTXM, static_cast<uint8_t>(_word >> 8));
		_port.write8(mc68k::PeriphAddress::HdiTXL, static_cast<uint8_t>(_word));
	}

	void queue(const std::vector<uint8_t>& _rom, const std::string& _romName)
	{
		std::puts("queue: DSP1 stops reading its host port, the ColdFire writes on");
		watched("queue", [&](std::atomic<uint64_t>& _progress)
		{
			auto hw = std::make_unique<md::Hardware>(_rom, _romName, md::MachineModel::Machinedrum);
			check(hw->isValid(), "the machine is valid");
			check(runToMidiReady(*hw, _progress, 60), "the firmware takes MIDI");
			auto& dsp1 = hw->getDspMixer();
			auto& port = hw->getUC().getHdi08Dsp1();
			// Running, not reading: a loop of its own in external P memory (JMP $7ffff0), its host interrupts and
			// DMA requests off. Its cycles pass; it never reads HRX. Its receive ring filled up (the firmware itself
			// waits for TXDE, so only a ColdFire running garbage writes on: that store is made here).
			constexpr dsp56k::TWord loop = 0x7ffff0;
			dsp1.dsp().memWriteP(loop, 0x0af080);
			dsp1.dsp().memWriteP(loop + 1, loop);
			dsp1.dsp().setPC(loop);
			dsp1.hdi08().writeControlRegister(0);
			while(!dsp1.hdi08().dataRXFull())
			{
				const dsp56k::TWord w = 0;
				dsp1.hdi08().writeRX(&w, 1);
			}
			for(uint32_t i = 0; i < 16; ++i, ++_progress)
				storeWord(port, 0x123456 + i);
			check(!dsp1.halted() && dsp1.hdi08().dataRXFull(), "DSP1 runs, not reading: its ring stays full");
			check(dsp1.droppedHostWords() == 16, "16 words to the full ring dropped and counted, not waited for: "
				+ std::to_string(dsp1.droppedHostWords()));
			for(uint64_t b = 0; b < blocksOf(1); ++b, ++_progress)
				hw->advance(g_block);
			check(true, "the machine runs on");

			// Halted (its PC out of P memory, as a DSP running garbage ends): no time passes for it. Words and host
			// commands from the ColdFire go nowhere; none may wait for it.
			dsp1.dsp().setPC(0x800000);
			check(dsp1.halted(), "DSP1 halted");
			const auto before = dsp1.droppedHostWords();
			for(uint32_t i = 0; i < 64; ++i, ++_progress)
			{
				storeWord(port, i);
				port.write8(mc68k::PeriphAddress::HdiCVR, static_cast<uint8_t>(mc68k::Hdi08::Hc | 0x12));
			}
			check(dsp1.droppedHostWords() > before, "words and host commands to the halted DSP dropped and counted: "
				+ std::to_string(dsp1.droppedHostWords() - before));
			for(uint64_t b = 0; b < blocksOf(2); ++b, ++_progress)
				hw->advance(g_block);
			check(true, "the machine runs on with DSP1 halted");
		});
	}

	void halted(const std::vector<uint8_t>& _rom, const std::string& _romName)
	{
		std::puts("halted: a flash image with OS sector 6 damaged, started as it is");
		watched("halted", [&](std::atomic<uint64_t>& _progress)
		{
			auto hw = std::make_unique<md::Hardware>(_rom, _romName, md::MachineModel::Machinedrum, std::vector<uint8_t>{},
				std::shared_ptr<md::FrontPanelPublisher>{}, damaged(_rom, 6));
			check(hw->isValid(), "the machine is valid");
			for(uint64_t b = 0; b < blocksOf(15); ++b, ++_progress)
				hw->advance(g_block);
			check(hw->getDspMixer().halted() || hw->getDspProducer().halted(), "a DSP halted (its PC left P memory)");
		});
		check(true, "the emulation ran 15 s of machine time with a halted DSP");
	}

	void loader(const std::vector<uint8_t>& _rom, const std::string& _romName)
	{
		std::puts("loader: the same image as a project's state");
		watched("loader", [&](std::atomic<uint64_t>& _progress)
		{
			synthLib::DeviceCreateParams params;
			params.romData = _rom;
			params.romName = _romName;
			params.customData = md::deviceCustomData(md::MachineModel::Machinedrum);
			md::Device device(params);
			check(device.isValid(), "the device is valid");
			// A first-run state: the whole flash image (every sector, ROM-relative), the CRCs over the damaged bytes.
			std::vector<uint8_t> state;
			const auto patchRam = device.getHardware().copyPatchRam();
			check(md::encodeState(state, patchRam, damaged(_rom, 6), _rom, _rom, md::MachineModel::Machinedrum,
				synthLib::StateTypeGlobal), "the damaged state encodes (its CRC is the damaged bytes')");
			check(device.setState(state, synthLib::StateTypeGlobal), "the project loads");
			auto& hw = device.getHardware();
			check(sectorIsRom(hw.copyFlashData(), _rom, 6), "the machine's sector 6 is the ROM's again");
			check(runToMidiReady(hw, _progress, 60), "the machine starts: the firmware takes MIDI");
			check(!hw.getDspMixer().halted() && !hw.getDspProducer().halted(), "no DSP halted");
		});
	}
}

int main(const int _argc, const char* const* _argv)
{
	std::setvbuf(stdout, nullptr, _IONBF, 0);
	const char* path = std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
	if(!path || !*path)
	{
		std::puts("mdDamagedFlashFirmwareTest: SKIP (GEARMULATOR_MD_FIRMWARE_BIN not set)");
		return 77;
	}
	std::ifstream in(path, std::ios::binary);
	const std::vector<uint8_t> rom{std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
	if(rom.size() != md::g_romSize)
	{
		std::puts("mdDamagedFlashFirmwareTest: FAIL (the ROM is not 8 MiB)");
		return 1;
	}
	const std::string only = _argc > 1 ? _argv[1] : "";
	if(only.empty() || only == "queue")
		queue(rom, path);
	if(only.empty() || only == "halted")
		halted(rom, path);
	if(only.empty() || only == "loader")
		loader(rom, path);
	std::printf("mdDamagedFlashFirmwareTest: %s\n", g_failures == 0 ? "PASS" : "FAIL");
	return g_failures == 0 ? 0 : 1;
}
