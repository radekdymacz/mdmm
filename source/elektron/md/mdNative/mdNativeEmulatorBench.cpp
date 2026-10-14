// Whole-firmware comparison. Same machine family/count, sample rate and callback size as the native bench.
// Front-panel parameter conversion and scheduling differ: this is a workload comparison, not an audio null test.
#include "elektronData/mdCommands.h"
#include "elektronData/mdKit.h"
#include "elektronData/mdPattern.h"
#include "mdLibTest/mdFirmwareSession.h"

#include <algorithm>
#include <cmath>
#include <ctime>

int main(const int _argc, char **_argv)
{
	using namespace mdFirmwareSession;
	namespace ed = elektronData;
	if (_argc != 2)
	{
		std::puts("usage: mdNativeEmulatorBench ROM");
		return 77;
	}
	try
	{
		std::setvbuf(stdout, nullptr, _IOLBF, 0);
		auto machine = std::make_unique<Machine>(load(_argv[1]), _argv[1]);
		auto &m = *machine;
		const auto kitSlot =
			uint8_t(ed::parseMdStatusResponse(m.request(ed::mdStatusRequest(ed::MdStatus::Kit), 0x72))->value);
		const auto patternSlot =
			uint8_t(ed::parseMdStatusResponse(m.request(ed::mdStatusRequest(ed::MdStatus::Pattern), 0x72))->value);
		auto kit = ed::decodeMdKit(m.request(ed::mdKitRequest(kitSlot), ed::g_mdKitDump)).value();
		auto pattern = ed::decodeMdPattern(m.request(ed::mdPatternRequest(patternSlot), ed::g_mdPatternDump)).value();
		pattern.length = 16;
		pattern.scale = 0;
		pattern.tempoMultiplier = 0;
		pattern.kit = kitSlot;
		pattern.accentPattern = pattern.slidePattern = pattern.swingPattern = 0;
		pattern.trackAccent = pattern.trackSlide = pattern.trackSwing = {};
		for (uint8_t t = 0; t < 16; ++t)
			for (uint8_t p = 0; p < 24; ++p)
				if (ed::lockRowIndex(pattern, t, p))
					pattern = ed::withoutLockRow(pattern, t, p);
		std::array<std::array<float, g_block>, 6> samples{};
		synthLib::TAudioOutputs outputs{};
		for (size_t i = 0; i < samples.size(); ++i)
			outputs[i] = samples[i].data();
		for (unsigned count : {1, 8, 16})
			for (bool returns : {false, true})
			{
				m.panel(md::PanelControl::Stop);
				for (unsigned t = 0; t < 16; ++t)
				{
					kit.models[t] = t < count ? 1 : 0; // GND-SIN / GND-EMPTY
					kit.params[t].fill(0);
					kit.params[t][0] = uint8_t(28 + t % 8 * 6);
					kit.params[t][1] = 100;
					kit.params[t][10] = kit.params[t][11] = 64;
					kit.params[t][13] = 100;
					kit.params[t][14] = 30;
					kit.params[t][17] = 80;
					kit.params[t][18] = uint8_t(t * 127 / 15);
					kit.params[t][19] = kit.params[t][20] = returns ? 48 : 0;
					kit.levels[t] = 100;
					kit.trigGroups[t] = kit.muteGroups[t] = ed::MdKit::g_noGroup;
					pattern.trigs[t] = t < count ? uint64_t(0x1111) << (t % 4) : 0;
				}
				m.send(ed::encodeMdKit(kit));
				m.send(ed::mdLoadKit(kitSlot));
				m.send(ed::encodeMdPattern(pattern));
				m.panel(md::PanelControl::Play);
				m.run(2000);
				std::vector<double> cpu, wall, durations;
				double energy = 0;
				unsigned moves = 0;
				for (unsigned trial = 0; trial < 3; ++trial)
				{
					constexpr unsigned callbacks = 6890;
					durations.clear();
					durations.reserve(callbacks);
					const auto c0 = std::clock();
					const auto w0 = std::chrono::steady_clock::now();
					int previous = m.playhead();
					for (unsigned b = 0; b < callbacks; ++b)
					{
						const auto start = std::chrono::steady_clock::now();
						m.hardware().processAudio(outputs, g_block, 0);
						durations.push_back(
							std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now() - start)
								.count());
						energy += double(samples[0][0]) * samples[0][0] + double(samples[1][0]) * samples[1][0];
						if (b % 32 == 0)
						{
							const auto step = m.playhead();
							moves += step != previous;
							previous = step;
						}
					}
					const double seconds = double(callbacks * g_block) / g_rate;
					wall.push_back(std::chrono::duration<double>(std::chrono::steady_clock::now() - w0).count() /
								   seconds * 100);
					cpu.push_back(double(std::clock() - c0) / CLOCKS_PER_SEC / seconds * 100);
				}
				require(moves > 10 && energy > 0.000001, "emulator benchmark did not play audible notes");
				std::sort(cpu.begin(), cpu.end());
				std::sort(wall.begin(), wall.end());
				std::sort(durations.begin(), durations.end());
				std::printf("{\"runtime\":\"firmware-emulator\",\"tracks\":%u,\"returns\":%s,\"cpu_percent\":%.6f,"
							"\"wall_percent\":%.6f,\"callback_frames\":64,\"sample_rate\":44100,\"p95_us_last_trial\":%"
							".6f,\"playhead_moves\":%u,\"sampled_energy\":%.9f}\n",
							count, returns ? "true" : "false", cpu[1], wall[1],
							durations[size_t(durations.size() * .95)], moves, energy);
			}
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
