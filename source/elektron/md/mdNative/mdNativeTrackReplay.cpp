#include "mdNativeTrackCorpus.h"

#include <cstdio>
#include <fstream>

int main(const int _argc, char **_argv)
{
	try
	{
		if (_argc != 2)
			throw std::runtime_error("usage: mdNativeTrackReplay track-corpus.bin");
		std::ifstream in(_argv[1], std::ios::binary);
		using namespace mdNative::proof;
		if (readWord(in) != trackMagic)
			throw std::runtime_error("unexpected track corpus format");
		const auto count = readWord(in);
		if (count == 0 || count > 1000000)
			throw std::runtime_error("invalid track corpus count");
		std::vector<int32_t> wave(waveSize);
		for (auto &value : wave)
			value = signedWord(readWord(in));
		uint64_t hash = 14695981039346656037ull;
		for (uint32_t i = 0; i < count; ++i)
		{
			const auto expected = readTrackCase(in);
			const auto actual = native(expected, wave.data());
			if (actual.output != expected.output || actual.after != expected.after)
				throw std::runtime_error("track replay differs at case " + std::to_string(i));
			for (const auto sample : actual.output)
				hash = hashWord(hash, uint32_t(sample) & 0xffffff);
		}
		if (in.peek() != std::char_traits<char>::eof())
			throw std::runtime_error("trailing track corpus bytes");
		std::printf("Track replay PASS: %u blocks, %u samples and states exact; FNV64=%016llx\n", count, count * 32,
					static_cast<unsigned long long>(hash));
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
