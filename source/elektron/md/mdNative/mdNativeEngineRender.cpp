#include "mdNativeEngineCorpus.h"
#include "mdNativeEngineDemo.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <ctime>
#include <fstream>
#include <memory>

namespace
{
	using namespace mdNative;
	using namespace mdNative::proof;
	void benchmark(const EngineProfile &_profile)
	{
		for (const size_t tracks : {1, 8, 16})
			for (const bool returns : {false, true})
			{
				std::vector<double> cpu, wall, durations;
				uint64_t hash = 14695981039346656037ull;
				for (unsigned trial = 0; trial < 3; ++trial)
				{
					auto engine = std::make_unique<Engine>(_profile);
					setupDemo(*engine, tracks);
					engine->returnsEnabled = returns;
					StereoBlock output;
					for (unsigned b = 0; b < 3000; ++b)
					{
						updateDemo(*engine, b);
						engine->render(output);
					}
					constexpr unsigned callbacks = 6890;
					durations.clear();
					durations.reserve(callbacks);
					const auto c0 = std::clock();
					const auto w0 = std::chrono::steady_clock::now();
					for (unsigned b = 0; b < callbacks; ++b)
					{
						const auto start = std::chrono::steady_clock::now();
						for (unsigned half = 0; half < 2; ++half)
						{
							updateDemo(*engine, (3000 + b * 2 + half) % 11024);
							engine->render(output);
						}
						durations.push_back(
							std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now() - start)
								.count());
						hash = hashWord(hash, uint32_t(output.left[0]));
					}
					const double seconds = double(callbacks * 64) / sampleRate;
					wall.push_back(std::chrono::duration<double>(std::chrono::steady_clock::now() - w0).count() /
								   seconds * 100);
					cpu.push_back(double(std::clock() - c0) / CLOCKS_PER_SEC / seconds * 100);
				}
				std::sort(cpu.begin(), cpu.end());
				std::sort(wall.begin(), wall.end());
				std::sort(durations.begin(), durations.end());
#ifdef __EMSCRIPTEN__
				const char *runtime = "wasm-node";
				const char *cpuText = "null"; // Emscripten clock() is elapsed time, not process CPU time.
#else
				const char *runtime = "native";
				char cpuText[32];
				std::snprintf(cpuText, sizeof(cpuText), "%.6f", cpu[1]);
#endif
				std::printf("{\"runtime\":\"%s\",\"tracks\":%zu,\"returns\":%s,\"cpu_percent\":%s,\"wall_percent\":%."
							"6f,\"callback_frames\":64,\"sample_rate\":44100,\"p95_us_last_trial\":%.6f,\"checksum\":"
							"\"%016llx\"}\n",
							runtime, tracks, returns ? "true" : "false", cpuText, wall[1],
							durations[size_t(durations.size() * .95)], static_cast<unsigned long long>(hash));
			}
	}
} // namespace

int main(const int _argc, char **_argv)
{
	try
	{
		if (_argc < 3 || _argc > 4)
			throw std::runtime_error(
				"usage: mdNativeEngineRender profile.bin output.wav [reference.bin] | profile.bin --benchmark");
		std::ifstream file(_argv[1], std::ios::binary);
		auto profile = readProfile(file);
		if (file.peek() != std::char_traits<char>::eof())
			throw std::runtime_error("trailing profile data");
		if (std::string(_argv[2]) == "--benchmark")
		{
			benchmark(profile);
			return 0;
		}
		auto engine = std::make_unique<Engine>(std::move(profile));
		setupDemo(*engine);
		std::ifstream reference;
		unsigned blocks = 16536;
		if (_argc == 4)
		{
			reference.open(_argv[3], std::ios::binary);
			if (readWord(reference) != 0x31464e4d || readWord(reference) != blocks)
				throw std::runtime_error("unexpected full-engine reference");
		}
		std::vector<int32_t> audio;
		audio.reserve(size_t(blocks) * blockSize * 2);
		uint64_t hash = 14695981039346656037ull;
		for (unsigned b = 0; b < blocks; ++b)
		{
			updateDemo(*engine, b);
			StereoBlock output;
			engine->render(output);
			for (size_t i = 0; i < blockSize; ++i)
				for (const auto sample : {output.left[i], output.right[i]})
				{
					if (reference.is_open() && signedWord(readWord(reference)) != sample)
						throw std::runtime_error("full-engine reference differs at block " + std::to_string(b));
					audio.push_back(sample);
					hash = hashWord(hash, uint32_t(sample) & 0xffffff);
				}
		}
		if (reference.is_open() && reference.peek() != std::char_traits<char>::eof())
			throw std::runtime_error("trailing reference data");
		std::ofstream output(_argv[2], std::ios::binary);
		writeStereoWav(output, audio);
		std::printf("Full engine render PASS: %zu channel samples; FNV64=%016llx\n", audio.size(),
					static_cast<unsigned long long>(hash));
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
