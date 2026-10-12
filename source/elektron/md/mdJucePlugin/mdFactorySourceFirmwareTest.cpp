// Wave 6: the Machinedrum's factory data from the user's own ROM (mdFactorySource.h, PROBES-manual-gaps.md P6b). The
// reading runs on the class's own thread, as in the editor (a std::thread's stack is small: md::Hardware must not live
// on it), and must give 64 kits, 128 patterns and 32 songs, the factory kits first. Needs the MD OS 1.63 ROM:
//   GEARMULATOR_MD_FIRMWARE_BIN=<ROM> mdFactorySourceFirmwareTest
// Exits 77 without it.

#include "mdFactorySource.h"

#include "elektronData/mdKit.h"
#include "mdLib/mdhardware.h"
#include "synthLib/audioTypes.h"

#include <array>
#include <memory>

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iterator>
#include <string>
#include <thread>

namespace
{
	int g_failures = 0;
	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}
	std::string kitName(const std::vector<uint8_t>& _dump)
	{
		const auto k = elektronData::decodeMdKit(_dump);
		if(!k)
			return "?";
		const auto* p = reinterpret_cast<const char*>(k->name.data());
		return {p, strnlen(p, k->name.size())};
	}
}

int main()
{
	std::setvbuf(stdout, nullptr, _IONBF, 0);
	const auto* path = std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
	if(!path || !*path)
	{
		std::puts("mdFactorySourceFirmwareTest: SKIP (GEARMULATOR_MD_FIRMWARE_BIN not set)");
		return 77;
	}
	std::ifstream f(path, std::ios::binary);
	const std::vector<uint8_t> rom{std::istreambuf_iterator<char>(f), std::istreambuf_iterator<char>()};
	if(rom.empty())
	{
		std::printf("mdFactorySourceFirmwareTest: cannot read %s\n", path);
		return 1;
	}
	std::string name(path);
	name = name.substr(name.find_last_of('/') + 1);

	std::puts("the factory data, read on the source's own thread:");
	mdJucePlugin::MdFactorySource source;
	const auto t0 = std::chrono::steady_clock::now();
	check(source.start(rom, name), "it starts");
	check(!source.start(rom, name), "a second start while it runs is refused");
	// the machine the editor plays runs beside it, as in the editor (MD_FACTORY_ALONE=1: the source alone)
	std::unique_ptr<md::Hardware> playing;
	if(!std::getenv("MD_FACTORY_ALONE"))
		playing = std::make_unique<md::Hardware>(rom, name, md::MachineModel::Machinedrum);
	std::array<std::vector<float>, 6> out;
	synthLib::TAudioOutputs outputs{};
	for(size_t c = 0; c < out.size(); ++c)
	{
		out[c].resize(64);
		outputs[c] = out[c].data();
	}
	std::optional<mdJucePlugin::MdFactorySource::Result> r;
	uint64_t blocks = 0;
	while(!(r = source.take()))
	{
		if(playing)
		{
			playing->processAudio(outputs, 64, 0);
			++blocks;
		}
		else
			std::this_thread::sleep_for(std::chrono::milliseconds(200));
	}
	if(playing)
		std::printf("  the playing machine ran %.1f s of audio meanwhile\n", blocks * 64 / 44100.0);
	const auto s = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
	std::printf("  read in %.1f s: %zu dumps%s%s\n", s, r->dumps.size(), r->error.empty() ? "" : ", error: ", r->error.c_str());
	check(r->error.empty(), "no error");
	check(r->dumps.size() == static_cast<size_t>(mdJucePlugin::MdFactorySource::g_total), "64 kits, 128 patterns, 32 songs");
	if(r->dumps.size() >= 4)
	{
		const auto names = kitName(r->dumps[0]) + ", " + kitName(r->dumps[1]) + ", " + kitName(r->dumps[2]) + ", " + kitName(r->dumps[3]);
		std::printf("  kits 1-4: %s\n", names.c_str());
		check(names == "TRX UW, EFM UW, E12 UW, P-I UW", "the factory kits first: " + names);
	}
	check(source.progress() == mdJucePlugin::MdFactorySource::g_total, "the progress counts every dump");
	std::printf(g_failures ? "%d FAILED\n" : "all ok\n", g_failures);
	return g_failures ? 1 : 0;
}
