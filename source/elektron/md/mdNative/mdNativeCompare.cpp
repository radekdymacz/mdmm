// Measures this one voice, excluding parameter conversion, allocation, I/O, UI and mixing.
#include "mdNativeCorpus.h"
#include "mdNativeFloat.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>

namespace
{
	using namespace mdNative;
	using namespace mdNative::proof;
	volatile double observed = 0;

	template <typename Render> double benchmark(Render &&_render)
	{
		constexpr size_t blocks = 300000;
		std::array<double, 7> measurements{};
		for (auto &elapsed : measurements)
		{
			const auto begin = std::chrono::steady_clock::now();
			double checksum = 0;
			for (size_t block = 0; block < blocks; ++block)
				checksum += _render(block);
			observed = checksum;
			elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now() - begin).count() * 1e9 /
				double(blocks * blockSize);
		}
		std::sort(measurements.begin(), measurements.end());
		return measurements[3];
	}
} // namespace

int main(const int _argc, char **_argv)
{
	try
	{
		if (_argc < 2 || _argc > 4 || (_argc == 4 && std::string(_argv[3]) != "--generated-wave"))
			throw std::runtime_error(
				"usage: mdNativeCompare generated-corpus.bin [float-output.wav [--generated-wave]]");
		std::ifstream corpus(_argv[1], std::ios::binary);
		if (readWord(corpus) != magic || readWord(corpus) != waveSize || readWord(corpus) != corpusCases)
			throw std::runtime_error("unsupported corpus");
		std::vector<int32_t> wave(waveSize);
		std::vector<float> floatWave(waveSize);
		for (size_t i = 0; i < wave.size(); ++i)
		{
			wave[i] = signedWord(readWord(corpus));
			floatWave[i] = float(wave[i]) / 33554432.0f;
		}
		if (_argc == 4)
			generateSineWave(floatWave.data());
		SineState exactState;
		FloatSineState floatState;
		Block exact{};
		FloatBlock approximate{};
		std::vector<int32_t> audio;
		double signalEnergy = 0, errorEnergy = 0, maximumError = 0;
		constexpr std::array<int32_t, demoNotes> pitches{5231, 10462, 20924, 41848, 10462, 10462, 10462, 10462};
		for (size_t note = 0; note < pitches.size(); ++note)
		{
			trigger(exactState);
			trigger(floatState);
			const SineParameters parameters{pitches[note], 0x7ff800, note >= 4 ? int32_t(0x20000 * (note - 3)) : 0,
											0x7c0000};
			const auto floatParameters = toFloat(parameters);
			for (size_t block = 0; block < demoBlocksPerNote; ++block)
			{
				renderSine(parameters, exactState, wave.data(), exact);
				renderSineFloat(floatParameters, floatState, floatWave.data(), approximate);
				for (size_t s = 0; s < blockSize; ++s)
				{
					const double reference = exact[s] / 8388608.0;
					const double difference = approximate[s] - reference;
					signalEnergy += reference * reference;
					errorEnergy += difference * difference;
					maximumError = std::max(maximumError, std::abs(difference));
					audio.push_back(static_cast<int32_t>(std::llround(approximate[s] * 8388608.0)));
				}
			}
		}
		if (_argc >= 3)
		{
			std::ofstream out(_argv[2], std::ios::binary);
			writeWav(out, audio);
		}
		const SineParameters parameters{10462, 0x7ff800, 0x40000, 0x7c0000};
		const auto floatParameters = toFloat(parameters);
		const auto exactNs = benchmark([&](const size_t _block) {
			if (_block % 256 == 0)
				trigger(exactState);
			renderSine(parameters, exactState, wave.data(), exact);
			return double(exact.back()) / 8388608.0;
		});
		const auto floatNs = benchmark([&](const size_t _block) {
			if (_block % 256 == 0)
				trigger(floatState);
			renderSineFloat(floatParameters, floatState, floatWave.data(), approximate);
			return double(approximate.back());
		});
		std::printf("{\"wave_source\":\"%s\",\"samples_compared\":%zu,\"rms_error_dbfs\":%.6f,\"peak_error_dbfs\":%.6f,"
					"\"snr_db\":%.6f,\"exact_ns_per_sample\":%.6f,\"float_ns_per_sample\":%.6f,"
					"\"float_speedup\":%.6f,\"benchmark\":\"median of 7, 300000 blocks each, scalar voice only\"}\n",
					_argc == 4 ? "generated-sine" : "user-ROM", audio.size(),
					10 * std::log10(errorEnergy / double(audio.size())), 20 * std::log10(maximumError),
					10 * std::log10(signalEnergy / errorEnergy), exactNs, floatNs, exactNs / floatNs);
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
