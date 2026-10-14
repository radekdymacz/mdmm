#include "mdNativeCorpus.h"

#include <cstdio>
#include <fstream>

int main(const int _argc, char **_argv)
{
	try
	{
		if (_argc < 2 || _argc > 3)
			throw std::runtime_error("usage: mdNativeReplay generated-corpus.bin [output.wav]");
		std::ifstream in(_argv[1], std::ios::binary);
		using namespace mdNative;
		using namespace mdNative::proof;
		if (readWord(in) != magic || readWord(in) != waveSize)
			throw std::runtime_error("unsupported corpus");
		const auto cases = readWord(in);
		if (cases != corpusCases)
			throw std::runtime_error("unexpected case count");
		std::vector<int32_t> wave(waveSize);
		for (auto &value : wave)
			value = signedWord(readWord(in));
		uint64_t hash = 14695981039346656037ull;
		std::vector<int32_t> audio;
		for (uint32_t c = 0; c < cases; ++c)
		{
			const SineParameters parameters{signedWord(readWord(in)), signedWord(readWord(in)),
											signedWord(readWord(in)), signedWord(readWord(in))};
			auto state = readState(in);
			const auto expectedState = readState(in);
			Block actual{};
			renderSine(parameters, state, wave.data(), actual);
			if (!sameState(state, expectedState))
				throw std::runtime_error("state mismatch in case " + std::to_string(c));
			for (size_t s = 0; s < actual.size(); ++s)
			{
				if (actual[s] != signedWord(readWord(in)))
					throw std::runtime_error("sample mismatch in case " + std::to_string(c) + ":" + std::to_string(s));
				hash = hashWord(hash, uint32_t(actual[s]) & 0xffffff);
			}
			if (c >= stressCases)
				audio.insert(audio.end(), actual.begin(), actual.end());
		}
		if (in.peek() != std::char_traits<char>::eof())
			throw std::runtime_error("trailing corpus data");
		std::printf("GND-SIN PASS: %u blocks, %u samples, all final states exact; audio FNV64=%016llx\n", cases,
					cases * uint32_t(blockSize), static_cast<unsigned long long>(hash));
		if (_argc == 3)
		{
			std::ofstream wav(_argv[2], std::ios::binary);
			writeWav(wav, audio);
		}
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
