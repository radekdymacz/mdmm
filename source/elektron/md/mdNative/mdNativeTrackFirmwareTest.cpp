#include "mdNativeTrackOracle.h"

int main(const int _argc, char **_argv)
{
	const char *path = _argc > 1 ? _argv[1] : std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
	if (!path || !*path)
	{
		std::puts("mdNativeTrackFirmwareTest: SKIP (ROM not set)");
		return 77;
	}
	try
	{
		require(_argc <= 3, "usage: mdNativeTrackFirmwareTest [ROM [output-corpus]]");
		auto oracle = std::make_unique<Oracle>();
		oracle->extract(path);
		constexpr uint32_t casesPerStage = 8192, total = casesPerStage * 6;
		std::ofstream corpus;
		if (_argc == 3)
		{
			corpus.open(_argv[2], std::ios::binary);
			writeWord(corpus, trackMagic);
			writeWord(corpus, total);
			for (const auto value : oracle->wave)
				writeWord(corpus, uint32_t(value) & 0xffffff);
		}
		uint64_t hash = 14695981039346656037ull;
		for (uint32_t kind = 0; kind < 6; ++kind)
		{
			std::array<int32_t, 8> continuing{};
			for (uint32_t i = 0; i < casesPerStage; ++i)
			{
				TrackCase c;
				c.kind = kind;
				for (auto &p : c.parameters)
					p = signedWord(randomWord());
				for (auto &s : c.before)
					s = signedWord(randomWord());
				if (kind < 2)
				{
					c.before[kind ? 3 : 4] &= 0xffffff;
					for (unsigned j = kind ? 4 : 5; j < 8; ++j)
						c.before[j] = 0;
				}
				else if (kind < 4)
				{
					c.before[2] &= 0xffffff;
					c.before[5] &= 0xffffff;
					for (auto *block : {&c.coefficients.feedback2, &c.coefficients.feedback1,
										&c.coefficients.feedforward, &c.coefficients.middle})
						for (auto &value : *block)
							value = signedWord(randomWord());
				}
				else
				{
					c.parameters[0] &= 0x3fff;
					c.parameters[1] &= 0x3fff;
					c.before[0] &= kind == 4 ? 0xff : 0x7fff;
					for (unsigned j = kind == 4 ? 2 : 1; j < 8; ++j)
						c.before[j] = 0;
				}
				if (i >= casesPerStage / 2)
					c.before = continuing;
				for (auto &sample : c.input)
					sample = signedWord(randomWord());
				if (i % 16 == 0)
					c.input.fill(0);
				if (i % 16 == 1)
					c.input.fill(0x7fffff);
				if (i % 16 == 2)
					c.input.fill(-0x800000);
				const auto expected = oracle->reference(c), actual = native(c, oracle->wave.data());
				if (expected.output != actual.output || expected.after != actual.after)
				{
					std::fprintf(stderr, "stage %u case %u\n", kind, i);
					for (unsigned j = 0; j < 32; ++j)
						if (expected.output[j] != actual.output[j])
							std::fprintf(stderr, "sample %u expected %d actual %d\n", j, expected.output[j],
										 actual.output[j]);
					for (unsigned j = 0; j < 8; ++j)
						std::fprintf(stderr, "state %u expected %d actual %d\n", j, expected.after[j], actual.after[j]);
					throw std::runtime_error("native track stage differs from original DSP1");
				}
				continuing = expected.after;
				if (corpus.is_open())
					writeTrackCase(corpus, expected);
				for (const auto sample : expected.output)
					hash = hashWord(hash, uint32_t(sample) & 0xffffff);
			}
		}
		std::printf("Track kernels PASS: %u blocks, %u samples and states exact; FNV64=%016llx\n", total, total * 32,
					static_cast<unsigned long long>(hash));
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
