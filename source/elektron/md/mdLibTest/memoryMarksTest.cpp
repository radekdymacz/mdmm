// The write marks (md::Microcontroller::patchRamMark, flashMark; DESIGN-audio-lock.md) move whenever the firmware CPU
// writes into a piece of the patch RAM or the flash through the slow path, and only for the pieces written. A copy in
// parts relies on this: a write that does not mark makes a stale piece look current. No ROM needed: a synthetic image.

#include "mdLib/mdmc.h"
#include "mdLib/mdmemorymap.h"
#include "mdLib/mdrom.h"

#include <cstdint>
#include <cstdio>
#include <memory>
#include <random>
#include <vector>

namespace
{
	using namespace md::memorymap;

	int g_failures = 0;

	void check(const bool _ok, const char* const _what)
	{
		std::printf("[%s] %s\n", _ok ? "PASS" : "FAIL", _what);
		if(!_ok)
			++g_failures;
	}

	using Mc = md::Microcontroller;
	constexpr size_t g_ram = Mc::g_patchRamMarkSize;
	constexpr size_t g_flash = Mc::g_flashMarkSize;

	void patchRam(const md::MachineModel _model, const bool _fastLane, const char* const _name)
	{
		std::vector<uint8_t> image(md::g_romSize, 0x5a);
		const md::Rom rom(image, "synthetic-marks-image");
		Mc uc(rom, _model);
		uc.setMemoryFastLane(_fastLane);
		const std::string name = std::string(_name) + (_fastLane ? " (fast lane)" : " (slow path)");

		const auto marks = [&]
		{
			std::vector<uint64_t> m;
			for(size_t i = 0; i < 6; ++i)
				m.push_back(uc.patchRamMark(i * g_ram));
			return m;
		};

		// a 16-bit write at the bootstrap alias moves the mark of its piece only
		auto before = marks();
		uc.write16(g_patchBootstrap.begin + 2 * g_ram + 6, 0x1234);
		auto after = marks();
		bool only = after[2] != before[2];
		for(size_t i = 0; i < before.size(); ++i)
			only = only && (i == 2 || after[i] == before[i]);
		check(only, (name + ": write16 at 0x100000 + n marks its piece, no other").c_str());

		// the same through the OS alias at 0x700000
		before = after;
		uc.write16(g_patchOsAlias.begin + 4 * g_ram, 0x4321);
		after = marks();
		check(after[4] != before[4] && after[2] == before[2], (name + ": write16 at the OS alias marks its piece").c_str());

		// a write at the last byte of a piece marks that piece, not the next
		before = after;
		uc.write8(g_patchBootstrap.begin + g_ram - 1, 0x77);
		after = marks();
		check(after[0] != before[0] && after[1] == before[1], (name + ": write8 at a piece's last byte marks that piece").c_str());

		// the same write twice moves the mark again (a count, not a flag)
		before = after;
		uc.write16(g_patchBootstrap.begin + 6, 0x0001);
		uc.write16(g_patchBootstrap.begin + 6, 0x0002);
		after = marks();
		check(after[0] >= before[0] + 2, (name + ": every write moves the mark").c_str());
		check(uc.patchRamWrites() > 0, (name + ": patchRamWrites moved").c_str());
	}

	// The Monomachine's Am29f flash: program a word, erase a sector; each marks its own piece of the flash
	void monomachineFlash()
	{
		std::vector<uint8_t> image(md::g_romSize, 0x5a);
		const md::Rom rom(image, "synthetic-marks-image");
		Mc uc(rom, md::MachineModel::Monomachine);
		const auto base = g_flashFull.begin;
		const auto unlock = [&](const uint16_t _third)
		{
			uc.write16(base + 0xaaa, 0xaa);
			uc.write16(base + 0x554, 0x55);
			uc.write16(base + 0xaaa, _third);
		};
		const auto marks = [&]
		{
			std::vector<uint64_t> m;
			for(size_t i = 0; i < 8; ++i)
				m.push_back(uc.flashMark(i * g_flash));
			return m;
		};
		auto before = marks();
		unlock(0xa0);
		uc.write16(base + 3 * g_flash + 2, 0x0f0f);	// the word: piece 3
		auto after = marks();
		bool only = after[3] != before[3];
		for(size_t i = 0; i < before.size(); ++i)
			only = only && (i == 3 || after[i] == before[i]);
		check(only, "Monomachine flash: a programmed word marks its own piece only");

		before = after;
		unlock(0x80);
		uc.write16(base + 0xaaa, 0xaa);
		uc.write16(base + 0x554, 0x55);
		uc.write16(base + 5 * g_flash, 0x30);	// erase the sector at 5 x 64 KiB
		after = marks();
		only = after[5] != before[5];
		for(size_t i = 0; i < before.size(); ++i)
			only = only && (i == 5 || after[i] == before[i]);
		check(only, "Monomachine flash: an erased sector marks its own piece only");
	}
}

int main()
{
	// the emulator logs every register and erase to stderr (MCLOG): the results are on stdout
#ifdef _WIN32
	std::freopen("NUL", "w", stderr);
#else
	std::freopen("/dev/null", "w", stderr);
#endif
	for(const bool fast : {true, false})
	{
		patchRam(md::MachineModel::Machinedrum, fast, "MD patch RAM");
		patchRam(md::MachineModel::Monomachine, fast, "MM patch RAM");
	}
	monomachineFlash();
	std::printf("%s\n", g_failures ? "FAILED" : "OK");
	return g_failures ? 1 : 0;
}
