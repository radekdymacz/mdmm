#include "mdNativeChainCorpus.h"

#include <cstdio>
#include <fstream>

int main(const int _argc, char **_argv)
{
	try
	{
		if (_argc < 2 || _argc > 3)
			throw std::runtime_error("usage: mdNativeChainReplay corpus.bin [output.wav]");
		using namespace mdNative;
		using namespace mdNative::proof;
		std::ifstream in(_argv[1], std::ios::binary);
		if (readWord(in) != chainMagic)
			throw std::runtime_error("unexpected chain corpus format");
		const auto count = readWord(in);
		if (!count || count > 1000000)
			throw std::runtime_error("invalid chain corpus count");
		std::vector<int32_t> tables(trackTableSize), audio;
		for (auto &value : tables)
			value = signedWord(readWord(in));
		uint64_t hash = 14695981039346656037ull;
		for (uint32_t i = 0; i < count; ++i)
		{
			const auto c = readChainCase(in);
			auto state = c.before;
			Block output;
			renderTrack(c.controls, state, {tables.data()}, c.input, output);
			if (output != c.output || !sameTrack(state, c.after))
				throw std::runtime_error("chain mismatch at block " + std::to_string(i));
			for (const auto value : output)
				hash = hashWord(hash, uint32_t(value) & 0xffffff);
			if (_argc == 3)
				audio.insert(audio.end(), output.begin(), output.end());
		}
		if (in.peek() != std::char_traits<char>::eof())
			throw std::runtime_error("trailing chain corpus bytes");
		if (_argc == 3)
		{
			std::ofstream wav(_argv[2], std::ios::binary);
			writeWav(wav, audio);
		}
		std::printf("Connected track replay PASS: %u blocks, %u samples; FNV64=%016llx\n", count, count * 32,
					static_cast<unsigned long long>(hash));
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
