#include "mdNativeEngineCorpus.h"
#include "mdNativeEngineDemo.h"
#include "mdNativeEngineOracle.h"

int main(const int _argc, char **_argv)
{
	const char *path = _argc > 1 ? _argv[1] : std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
	if (!path || !*path)
	{
		std::puts("mdNativeEngineFirmwareTest: SKIP (ROM not set)");
		return 77;
	}
	try
	{
		auto oracle = std::make_unique<Oracle>();
		const bool snapshot = std::string(path) == "--snapshot";
		if (snapshot)
		{
			require(_argc >= 3, "snapshot directory missing");
			oracle->extractSnapshot(_argv[2]);
		}
		else
			oracle->extract(path);
		auto engine = std::make_unique<Engine>(referenceProfile(*oracle));
		setupDemo(*engine);
		initializeOutputReference(*oracle, engine->profile);
		auto &memory = oracle->memory;
		for (uint32_t a = 0x800; a < 0xd00; ++a)
			memory.set(MemArea_Y, a, 0);
		for (unsigned t = 0; t < 16; ++t)
			memory.set(MemArea_Y, 0x800 + 64 * t + 0x25, 0x148000);
		const unsigned outputArgument = snapshot ? 3 : 2;
		std::ofstream corpus;
		if (unsigned(_argc) > outputArgument)
		{
			std::ofstream profile(std::string(_argv[outputArgument]) + "/engine-profile.bin", std::ios::binary);
			writeProfile(profile, engine->profile);
			corpus.open(std::string(_argv[outputArgument]) + "/engine-reference.bin", std::ios::binary);
			writeWord(corpus, 0x31464e4d);
			writeWord(corpus, 16536);
		}
		std::vector<int32_t> audio;
		uint64_t hash = 14695981039346656037ull;
		for (unsigned block = 0; block < 16536; ++block)
		{
			updateDemo(*engine, block);
			for (unsigned t = 0; t < 16; ++t)
			{
				const auto &track = engine->tracks[t];
				oracle->reset();
				const auto voice = 0xc00 + t * 16;
				oracle->dsp.regs().r[6].var = voice;
				oracle->dsp.regs().r[7].var = 0x400;
				oracle->dsp.writeReg(Reg_M7, TReg24(31));
				const std::array<int32_t, 4> vp{track.voice.pitch, track.voice.decay, track.voice.ramp,
												track.voice.rampDecay};
				for (unsigned i = 0; i < 4; ++i)
					memory.set(MemArea_Y, voice + 1 + i, uint32_t(vp[i]) & 0xffffff);
				if (demoTrigger(t, block))
					oracle->run(0x1000a4, 0x1000ac);
				oracle->run(0x1000ad, 0x1000dc);
				oracle->reset();
				const auto state = 0x800 + t * 64;
				oracle->dsp.regs().r[6].var = state;
				oracle->dsp.regs().r[7].var = 0x400;
				oracle->dsp.regs().r[5].var = 0x200 + t * 32;
				for (unsigned i = 0; i < 9; ++i)
					memory.set(MemArea_Y, state + i, track.controls[i]);
				memory.set(MemArea_Y, state + 0x29, memory.get(MemArea_Y, state + 0x24));
				memory.set(MemArea_Y, state + 0x2d, memory.get(MemArea_Y, state + 0x22));
				oracle->run(0xa4, 0x25e);
				memory.set(MemArea_X, 0x6c8 + t, 6);
				const auto &mix = track.mixer;
				const std::array<int32_t, 4> mp{mix.level, mix.pan, mix.reverb, mix.delay};
				for (unsigned i = 0; i < 4; ++i)
					memory.set(MemArea_Y, 0x101 + 5 * t + i, uint32_t(mp[i]) & 0xffffff);
			}
			oracle->reset();
			oracle->run(0x294, 0x971);
			StereoBlock actual;
			engine->render(actual);
			for (unsigned i = 0; i < 32; ++i)
				for (unsigned ch = 0; ch < 2; ++ch)
				{
					const auto expected = signedWord(memory.get(MemArea_X, 0x180 + i * 2 + ch));
					const auto value = ch ? actual.right[i] : actual.left[i];
					if (value != expected)
						throw std::runtime_error("full engine block " + std::to_string(block) + " sample " +
												 std::to_string(i) + " expected " + std::to_string(expected) +
												 " actual " + std::to_string(value));
					if (corpus.is_open())
						writeWord(corpus, uint32_t(expected) & 0xffffff);
					audio.push_back(value);
					hash = hashWord(hash, uint32_t(value) & 0xffffff);
				}
		}
		if (unsigned(_argc) > outputArgument)
		{
			std::ofstream wav(std::string(_argv[outputArgument]) + "/engine-native.wav", std::ios::binary);
			writeStereoWav(wav, audio);
		}
		std::printf("Full engine PASS: 16536 blocks, 529152 stereo frames, 1058304 channel samples; FNV64=%016llx\n",
					static_cast<unsigned long long>(hash));
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
