// MD Sample Manager erase probe (MD-194, MD-198; doc/release/0.9/md-sample-manager.md, "The erase probe: plan").
// The Machinedrum's own SAMPLE MGR menu is driven from its front panel on the emulated machine (MD OS 1.63, the UW
// sample memory) and the sample memory is read back before and after. The first run LOGS and never asserts on the menu:
//
//   1. Reach the global menu (EXIT x3, FUNCTION held, PATTERN/SONG, FUNCTION released) and sweep the arrow keys,
//      the LCD dumped after every key (a dump is printed only when the screen changed; its hash is always printed).
//   2. Replay the erase scripts below (g_eraseOne, g_eraseAll), each step with the LCD hash it must show; a step that
//      shows another screen stops the script and leaves the menu with EXIT, so a wrong menu position never erases.
//      The scripts are empty until the first run's dumps have been read (then: key names and the hashes they print).
//   3. After a script the sample bank (readMdSampleBank) and the flash are compared with the bank before.
//
// Read the output: lines starting "PROBE" are the results, lines starting "LCD" are the screens, "KEY" one key.
//   PROBE reach        the screen hash after the keys that should be the global menu
//   PROBE erase-one    slots that changed (length before -> after), samples used before -> after, flash bytes changed
//   PROBE erase-all    the same for the ALL entry
//   PROBE repeat       two fresh machines give the same bank after the same script (the editor can drive it)
// Needs MD OS 1.63 (GEARMULATOR_MD_FIRMWARE_BIN); exits 77 without it. Only a failed machine start fails the test.

#include "mdFirmwareSession.h"

#include "elektronData/mdSamples.h"

#include "mdLib/mddeskdevice.h"

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

using namespace mdFirmwareSession;
namespace ed = elektronData;

namespace
{
	// One script step: a key name (md::panelKeySequence) and the LCD hash the screen must show after it
	// (0 = not known yet, printed and not checked).
	struct Step
	{
		const char* key;
		uint64_t screen;
	};

	// Filled from the first run's dumps. g_eraseOne: from a cold start to "slot g_eraseSlot erased" (the menu keys, then
	// ERASE, the slot, ENTER, ENTER); g_eraseAll: the ALL entry. The slot is 0-based.
	const std::vector<Step> g_eraseOne;
	const std::vector<Step> g_eraseAll;
	constexpr uint8_t g_eraseSlot = 5;
	// ctest prints a test's output only when it fails: true makes the probe end with a failure so the CI log shows the
	// dumps; false once the scripts are filled and the probe is a plain measurement.
	constexpr bool g_failToShowLog = true;

	uint64_t lcdHash(Machine& _m)
	{
		const auto panel = _m.hardware().getFrontPanelSnapshot();
		uint64_t h = 1469598103934665603ull;
		for(uint32_t y = 0; y < 64; ++y)
			for(uint32_t x = 0; x < 128; ++x)
				h = (h ^ (panel.getLcdPixel(x, y) ? 1u : 0u)) * 1099511628211ull;
		return h;
	}

	// Two pixel rows to a character: ' ' none, '\'' upper, ',' lower, '#' both.
	void dumpLcd(Machine& _m, const char* _what)
	{
		const auto panel = _m.hardware().getFrontPanelSnapshot();
		std::printf("LCD %s hash %016llx\n", _what, static_cast<unsigned long long>(lcdHash(_m)));
		for(uint32_t y = 0; y < 64; y += 2)
		{
			std::string row;
			for(uint32_t x = 0; x < 128; ++x)
			{
				const bool up = panel.getLcdPixel(x, y), down = panel.getLcdPixel(x, y + 1);
				row += up ? (down ? '#' : '\'') : (down ? ',' : ' ');
			}
			while(!row.empty() && row.back() == ' ')
				row.pop_back();
			std::printf("LCD |%s\n", row.c_str());
		}
	}

	// A key pressed (its packets, each held for a moment), then 100 ms of machine time, then the screen.
	uint64_t press(Machine& _m, const std::string& _key, uint64_t& _last)
	{
		const auto packets = md::panelKeySequence(md::MachineModel::Machinedrum, _key);
		require(!packets.empty(), "no panel packets for key " + _key);
		for(const auto& p : packets)
		{
			require(_m.hardware().trySendPanelEvent(p.row, p.mask), "panel event rejected for " + _key);
			_m.run(40);
		}
		_m.run(100);
		const auto hash = lcdHash(_m);
		std::printf("KEY %-12s screen %016llx%s\n", _key.c_str(), static_cast<unsigned long long>(hash),
			hash == _last ? " (unchanged)" : "");
		if(hash != _last)
			dumpLcd(_m, _key.c_str());
		_last = hash;
		return hash;
	}

	void settle(Machine& _m)
	{
		for(uint32_t i = 0; !_m.hardware().factoryFlashCacheReady(); ++i)
		{
			require(i < 60 * g_rate / g_block, "the factory flash did not settle");
			_m.run(g_block * 1000.0 / g_rate);
		}
		_m.run(500);
	}

	ed::MdSampleBank readBank(Machine& _m) { return ed::readMdSampleBank(md::sampleMemoryOf(_m.hardware()), 8); }

	void reachMenu(Machine& _m, uint64_t& _last)
	{
		for(int i = 0; i < 3; ++i)
			press(_m, "exit", _last);
		press(_m, "hold:function", _last);
		press(_m, "patternSong", _last);
		press(_m, "release:function", _last);
		std::printf("PROBE reach screen %016llx\n", static_cast<unsigned long long>(_last));
	}

	// Leave whatever menu it is in; never an ENTER.
	void leaveMenu(Machine& _m, uint64_t& _last)
	{
		for(int i = 0; i < 6; ++i)
			press(_m, "exit", _last);
	}

	// Runs a script; false at the first screen that is not the one expected (the menu is left with EXIT).
	bool replay(Machine& _m, const std::vector<Step>& _script, uint64_t& _last)
	{
		for(const auto& step : _script)
		{
			const auto hash = press(_m, step.key, _last);
			if(step.screen && hash != step.screen)
			{
				std::printf("PROBE script stopped at %s: screen %016llx, expected %016llx\n", step.key,
					static_cast<unsigned long long>(hash), static_cast<unsigned long long>(step.screen));
				leaveMenu(_m, _last);
				return false;
			}
		}
		return true;
	}

	std::vector<uint8_t> flashOf(Machine& _m)
	{
		const auto flash = _m.hardware().copyFlashData();
		return {flash.begin(), flash.end()};
	}

	uint32_t usedOf(const ed::MdSampleBank& _b) { return _b.used(); }

	// What changed between two banks, one line.
	void reportDiff(const char* _what, const ed::MdSampleBank& _before, const ed::MdSampleBank& _after,
		const std::vector<uint8_t>& _flashBefore, const std::vector<uint8_t>& _flashAfter)
	{
		std::string slots;
		int changed = 0;
		for(size_t i = 0; i < _before.rom.size() && i < _after.rom.size(); ++i)
		{
			const auto& a = _before.rom[i];
			const auto& b = _after.rom[i];
			if(a.empty == b.empty && a.length == b.length && a.name == b.name && a.rate == b.rate)
				continue;
			++changed;
			slots += " ROM-" + std::to_string(i + 1) + " " + std::to_string(a.length) + (a.name.empty() ? "" : "'" + a.name + "'")
				+ "->" + std::to_string(b.length) + (b.name.empty() ? "" : "'" + b.name + "'");
		}
		size_t flashBytes = 0;
		for(size_t i = 0; i < _flashBefore.size() && i < _flashAfter.size(); ++i)
			flashBytes += _flashBefore[i] != _flashAfter[i];
		std::printf("PROBE %s: %d slots changed:%s | samples used %u -> %u of %u (free %u -> %u) | RAM slots %s | flash bytes changed %zu\n",
			_what, changed, slots.empty() ? " none" : slots.c_str(), usedOf(_before), usedOf(_after), ed::g_mdSampleCapacity,
			ed::g_mdSampleCapacity - usedOf(_before), ed::g_mdSampleCapacity - usedOf(_after),
			_before.ram == _after.ram ? "unchanged" : "changed", flashBytes);
	}

	// A fresh machine, the menu, the script; the bank after (empty optional: the script stopped).
	bool runScript(const Bytes& _rom, const std::string& _romName, const std::vector<Step>& _script, const char* _what,
		ed::MdSampleBank* _after = nullptr)
	{
		Machine m(_rom, _romName);
		settle(m);
		const auto before = readBank(m);
		const auto flashBefore = flashOf(m);
		uint64_t last = 0;
		reachMenu(m, last);
		const bool ok = replay(m, _script, last);
		m.run(2000);
		const auto after = readBank(m);
		reportDiff(_what, before, after, flashBefore, flashOf(m));
		if(_after)
			*_after = after;
		return ok;
	}

	void explore(const Bytes& _rom, const std::string& _romName)
	{
		std::puts("== probe: the global menu and the arrow keys");
		Machine m(_rom, _romName);
		settle(m);
		const auto bank = readBank(m);
		int filled = 0;
		for(const auto& s : bank.rom)
			filled += s.empty ? 0 : 1;
		std::printf("PROBE bank: %d of %zu ROM slots hold a sample, %u samples used of %u\n", filled, bank.rom.size(), bank.used(),
			ed::g_mdSampleCapacity);
		uint64_t last = 0;
		dumpLcd(m, "cold start");
		last = lcdHash(m);
		reachMenu(m, last);
		// each arrow a few times, the screens show which keys move the cursor and where FILE, SAMPLE MGR, MODE and NAME/SIZE are
		for(const char* key : {"right", "right", "right", "right", "left", "left", "left", "left", "down", "down", "down", "down",
			   "up", "up", "up", "up"})
			press(m, key, last);
		// ENTER once on each of a few positions is the next run's work, with the dumps above in hand; here one ENTER only
		press(m, "enter", last);
		for(const char* key : {"right", "down", "up", "left"})
			press(m, key, last);
		leaveMenu(m, last);
		const auto after = readBank(m);
		std::printf("PROBE explore: the bank after the sweep is %s the one before (an ENTER was pressed once)\n",
			after == bank ? "equal to" : "DIFFERENT from");
	}
}

int main()
{
	std::setvbuf(stdout, nullptr, _IONBF, 0);
	const auto* const path = std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
	if(!path || !*path)
	{
		std::cout << "mdSampleManagerProbeFirmwareTest: SKIP (GEARMULATOR_MD_FIRMWARE_BIN not set)\n";
		return 77;
	}
	try
	{
		const auto rom = load(path);
		require(rom.size() == md::g_romSize, "ROM must be the 8 MiB MD 1.63 image");
		explore(rom, path);
		if(g_eraseOne.empty() || g_eraseAll.empty())
			std::puts("PROBE erase: no key script yet (g_eraseOne, g_eraseAll): fill them from the LCD dumps above");
		if(!g_eraseOne.empty())
		{
			std::printf("== probe: erase slot ROM-%d\n", g_eraseSlot + 1);
			ed::MdSampleBank first, second;
			const bool a = runScript(rom, path, g_eraseOne, "erase-one", &first);
			const bool b = runScript(rom, path, g_eraseOne, "erase-one (second machine)", &second);
			std::printf("PROBE repeat: scripts %s, the two banks are %s\n", a && b ? "ran to the end" : "STOPPED",
				first == second ? "equal (the same keys give the same result)" : "DIFFERENT");
		}
		if(!g_eraseAll.empty())
		{
			std::puts("== probe: erase all");
			runScript(rom, path, g_eraseAll, "erase-all");
		}
		std::puts("DONE (the probe asserts nothing about the menu)");
		if(g_failToShowLog)
		{
			std::puts("FAIL on purpose (g_failToShowLog): ctest prints the output of a failed test only");
			return 1;
		}
		return 0;
	}
	catch(const std::exception& e)
	{
		std::printf("FAIL %s\n", e.what());
		return 1;
	}
}
