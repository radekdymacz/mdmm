// ROM-free example: ordinary mathematical sine, exponential amplitude and pitch envelopes.
// Only mdNative is linked. This executable never opens a ROM, corpus or emulated machine.
#include "mdNativeCorpus.h"
#include "mdNativeFloat.h"

#include <cmath>
#include <cstdio>
#include <fstream>

int main(const int _argc, char **_argv)
{
	try
	{
		if (_argc != 2)
			throw std::runtime_error("usage: mdNativeRender output.wav");
		using namespace mdNative;
		using namespace mdNative::proof;
		// Initialization storage belongs on the heap; the default WASM stack is smaller than this table.
		std::vector<float> wave(waveSize);
		generateSineWave(wave.data());
		std::vector<int32_t> audio;
		FloatBlock block{};
		constexpr std::array<float, 8> frequencies{110, 220, 440, 880, 110, 110, 110, 110};
		for (size_t note = 0; note < frequencies.size(); ++note)
		{
			FloatSineState state{0.0, 1.0f, 1.0f};
			// 0.65 s to -60 dB amplitude; 0.12 s pitch sweep, updated once per 32 samples.
			const FloatSineParameters parameters{frequencies[note] * waveSize / sampleRate,
												 std::pow(0.001f, 1.0f / (0.65f * sampleRate)),
												 note >= 4 ? float(note - 3) * 660.0f * waveSize / sampleRate : 0.0f,
												 std::pow(0.001f, float(blockSize) / (0.12f * sampleRate))};
			for (size_t b = 0; b < demoBlocksPerNote; ++b)
			{
				renderSineFloat(parameters, state, wave.data(), block);
				for (const auto sample : block)
					audio.push_back(static_cast<int32_t>(std::llround(sample * 8388608.0)));
			}
		}
		std::ofstream out(_argv[1], std::ios::binary);
		writeWav(out, audio);
		std::printf("ROM-free sine: %zu samples, 44.1 kHz, generated waveform and musical parameters\n", audio.size());
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
