#include "mdNativeChainCorpus.h"
#include "mdNativeTrackOracle.h"

int main(const int _argc, char **_argv)
{
	const char *path = _argc > 1 ? _argv[1] : std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
	if (!path || !*path)
	{
		std::puts("mdNativeChainFirmwareTest: SKIP (ROM not set)");
		return 77;
	}
	try
	{
		require(_argc <= 3, "usage: mdNativeChainFirmwareTest [ROM [existing-output-directory]]");
		auto oracle = std::make_unique<Oracle>();
		oracle->extract(path);
		std::vector<int32_t> tables(trackTableSize);
		for (uint32_t i = 0; i < tables.size(); ++i)
			tables[i] = signedWord(oracle->memory.get(MemArea_X, 0x140000 + i));
		constexpr unsigned blocksPerSection = 2756, sections = 8, count = blocksPerSection * sections;
		std::ofstream corpus;
		if (_argc == 3)
		{
			std::ofstream tableFile(std::string(_argv[2]) + "/track-tables.bin", std::ios::binary);
			for (const auto value : tables)
				writeWord(tableFile, uint32_t(value) & 0xffffff);
			corpus.open(std::string(_argv[2]) + "/chain-corpus.bin", std::ios::binary);
			writeWord(corpus, chainMagic);
			writeWord(corpus, count);
			for (const auto value : tables)
				writeWord(corpus, uint32_t(value) & 0xffffff);
		}
		TrackState state;
		state.words[0x25] = 0x148000;
		std::array<SineState, 3> voices{};
		for (auto &v : voices)
			trigger(v);
		std::vector<int32_t> dry, reference, rendered;
		uint64_t hash = 14695981039346656037ull;
		for (unsigned block = 0; block < count; ++block)
		{
			const unsigned section = block / blocksPerSection, local = block % blocksPerSection;
			const int sweep = int(local * 127 / (blocksPerSection - 1));
			// Raw DSP controls: AMD, AMF, EQF, EQG, FLTF, FLTW, FLTQ, SRR, DIST (128 units/knob step).
			TrackControls p{0, 0, 64 * 128, 64 * 128, 0, 127 * 128, 0, 0, 0};
			if (section == 1)
			{
				p[0] = sweep * 128;
				p[1] = 45 * 128;
			}
			if (section == 2)
			{
				p[2] = sweep * 128;
				p[3] = 95 * 128;
			}
			if (section == 3)
			{
				p[5] = sweep * 128;
				p[6] = 50 * 128;
			}
			if (section == 4)
				p[4] = sweep * 128;
			if (section == 5)
			{
				p[4] = 20 * 128;
				p[5] = 40 * 128;
				p[6] = sweep * 128;
			}
			if (section == 6)
				p[7] = sweep * 128;
			if (section == 7)
				p[8] = sweep * 128;
			state.words[0x29] = state.words[0x24];
			state.words[0x2d] = state.words[0x22];
			std::copy(p.begin(), p.end(), state.words.begin());
			ChainCase c;
			c.controls = p;
			c.before = state;
			for (size_t v = 0; v < voices.size(); ++v)
			{
				if (local % 689 == 0)
					trigger(voices[v]);
				Block tone;
				renderSine({int32_t(5231 *
									(v == 0		  ? 1
										 : v == 1 ? 4
												  : 16)),
							0x7ffc00, 0, 0},
						   voices[v], oracle->wave.data(), tone);
				for (size_t i = 0; i < blockSize; ++i)
					c.input[i] += tone[i] / 3;
			}
			oracle->reset();
			for (unsigned i = 0; i < 64; ++i)
				oracle->put(i, c.before.words[i]);
			for (unsigned i = 0; i < 32; ++i)
				oracle->memory.set(MemArea_Y, 0x400 + i, uint32_t(c.input[i]) & 0xffffff);
			oracle->dsp.regs().r[5].var = 0x300;
			oracle->dsp.regs().r[7].var = 0x400;
			oracle->run(0xa4, 0x25e);
			for (unsigned i = 0; i < 64; ++i)
				c.after.words[i] = oracle->get(i);
			for (unsigned i = 0; i < 32; ++i)
				c.output[i] = signedWord(oracle->memory.get(MemArea_X, 0x300 + i));
			Block actual;
			renderTrack(p, state, {tables.data()}, c.input, actual);
			if (c.output != actual || !sameTrack(state, c.after))
			{
				std::fprintf(stderr, "chain block %u section %u sweep %d\n", block, section, sweep);
				for (unsigned i = 0; i < 64; ++i)
					if ((uint32_t(state.words[i]) & 0xffffff) != (uint32_t(c.after.words[i]) & 0xffffff))
						std::fprintf(stderr, "state %02x expected %06x actual %06x\n", i,
									 uint32_t(c.after.words[i]) & 0xffffff, uint32_t(state.words[i]) & 0xffffff);
				for (unsigned i = 0; i < 32; ++i)
					if (actual[i] != c.output[i])
						std::fprintf(stderr, "sample %u expected %d actual %d\n", i, c.output[i], actual[i]);
				throw std::runtime_error("connected track chain differs");
			}
			if (corpus.is_open())
				writeChainCase(corpus, c);
			dry.insert(dry.end(), c.input.begin(), c.input.end());
			reference.insert(reference.end(), c.output.begin(), c.output.end());
			rendered.insert(rendered.end(), actual.begin(), actual.end());
			for (const auto sample : actual)
				hash = hashWord(hash, uint32_t(sample) & 0xffffff);
		}
		if (_argc == 3)
		{
			const auto save = [&](const char *_name, const std::vector<int32_t> &_audio) {
				std::ofstream wav(std::string(_argv[2]) + "/" + _name, std::ios::binary);
				writeWav(wav, _audio);
			};
			save("chain-input.wav", dry);
			save("chain-dsp.wav", reference);
			save("chain-native.wav", rendered);
		}
		std::printf("Connected track PASS: %u blocks, %u samples, all 64 state words exact; FNV64=%016llx\n", count,
					count * 32, static_cast<unsigned long long>(hash));
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
