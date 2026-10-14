#include "mdNativeCompressor.h"
#include "mdNativeDelay.h"
#include "mdNativeFixed.h"
#include "mdNativeMasterEq.h"
#include "mdNativeMixer.h"
#include "mdNativeReverb.h"
#include "mdNativeTrackOracle.h"

#include <fstream>

int main(const int _argc, char **_argv)
{
	const char *path = _argc > 1 ? _argv[1] : std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
	if (!path || !*path)
	{
		std::puts("mdNativeOutputFirmwareTest: SKIP (ROM not set)");
		return 77;
	}
	try
	{
		auto oracle = std::make_unique<Oracle>();
		if (std::string(path) == "--snapshot" && _argc == 3)
		{
			for (auto area : {MemArea_P, MemArea_X, MemArea_Y})
			{
				std::ifstream file(std::string(_argv[2]) + "/dsp1-" +
									   (area == MemArea_P		? "P"
											: area == MemArea_X ? "X"
																: "Y") +
									   ".bin",
								   std::ios::binary);
				require(bool(file), "missing private snapshot");
				unsigned char bytes[3];
				uint32_t address = 0;
				while (file.read(reinterpret_cast<char *>(bytes), 3))
					oracle->memory.set(area, address++,
									   (uint32_t(bytes[0]) << 16) | (uint32_t(bytes[1]) << 8) | bytes[2]);
			}
			for (uint32_t i = 0; i < waveSize; ++i)
				oracle->wave[i] = signedWord(oracle->memory.get(MemArea_X, 0x148000 + i));
		}
		else
			oracle->extract(path);
		auto &memory = oracle->memory;
		for (unsigned c = 0; c < 1024; ++c)
		{
			oracle->reset();
			memory.set(MemArea_X, 0x640, 0x400);
			std::array<Block, 16> tracks;
			std::array<MixerControls, 16> controls;
			for (unsigned t = 0; t < 16; ++t)
			{
				controls[t] = {int32_t(randomWord() & 0xfffff), int32_t(randomWord() & 0x7fffff),
							   int32_t(randomWord() & 0x7fffff), int32_t(randomWord() & 0x7fffff)};
				if (c < 3)
					controls[t].pan = c == 0 ? 0 : c == 1 ? 0x400000 : 0x7fffff;
				memory.set(MemArea_X, 0x6c8 + t, 6);
				memory.set(MemArea_Y, 0x100 + t * 5 + 1, controls[t].level);
				memory.set(MemArea_Y, 0x100 + t * 5 + 2, controls[t].pan);
				memory.set(MemArea_Y, 0x100 + t * 5 + 3, controls[t].reverb);
				memory.set(MemArea_Y, 0x100 + t * 5 + 4, controls[t].delay);
				for (unsigned i = 0; i < 32; ++i)
				{
					tracks[t][i] = signedWord(randomWord()) / 16;
					memory.set(MemArea_X, 0x200 + t * 32 + i, uint32_t(tracks[t][i]) & 0xffffff);
				}
			}
			oracle->run(0x294, 0x342);
			MixerBuses actual;
			mixTracks(tracks.data(), controls.data(), 16, oracle->wave.data(), actual);
			const std::array<const StereoBlock *, 3> buses{&actual.main, &actual.reverb, &actual.delay};
			const std::array<unsigned, 3> addresses{0x180, 0x1c0, 0x600};
			for (unsigned b = 0; b < 3; ++b)
				for (unsigned i = 0; i < 32; ++i)
					for (unsigned channel = 0; channel < 2; ++channel)
					{
						const auto expected = signedWord(memory.get(MemArea_X, addresses[b] + 2 * i + channel));
						const auto value = channel ? buses[b]->right[i] : buses[b]->left[i];
						if (value != expected)
							throw std::runtime_error("mixer case " + std::to_string(c) + " bus " + std::to_string(b) +
													 " sample " + std::to_string(i) + " expected " +
													 std::to_string(expected) + " actual " + std::to_string(value));
					}
		}
		std::puts("Mixer PASS: 1024 blocks, 196608 bus samples, 16 tracks, level/pan/two stereo sends exact");
		auto delay = std::make_unique<DelayState>();
		delay->words = {80000, 16384, 0, 0, 0x200000, 0x7000, 0x100000, 0x600000, 0x400000, 0, 80000, 16384};
		for (uint32_t i = 0; i < delayRingSize * 2; ++i)
			memory.set(MemArea_X, 0x10011a + i, 0);
		for (unsigned c = 0; c < 4096; ++c)
		{
			oracle->reset();
			StereoBlock input, output;
			for (unsigned i = 0; i < 22; ++i)
				memory.set(MemArea_Y, 0x150 + i, uint32_t(delay->words[i]) & 0xffffff);
			for (unsigned i = 0; i < 32; ++i)
			{
				input.left[i] = c < 3000 ? signedWord(randomWord()) / 64 : 0;
				input.right[i] = c < 3000 ? signedWord(randomWord()) / 64 : 0;
				memory.set(MemArea_X, 0x600 + i * 2, uint32_t(input.left[i]) & 0xffffff);
				memory.set(MemArea_X, 0x601 + i * 2, uint32_t(input.right[i]) & 0xffffff);
			}
			oracle->run(0x342, 0x43c);
			renderDelay(*delay, input, output);
			for (unsigned i = 0; i < 32; ++i)
			{
				const auto at = (unsigned(delay->words[9]) + delayRingSize - 1 - i) % (delayRingSize - 1);
				const auto expected = signedWord(memory.get(MemArea_X, 0x10011a + at));
				if (expected != delay->left[at])
					throw std::runtime_error("delay ring case " + std::to_string(c) + " address " + std::to_string(at) +
											 " expected " + std::to_string(expected) + " actual " +
											 std::to_string(delay->left[at]));
			}
			for (unsigned i = 0; i < 22; ++i)
				if ((uint32_t(delay->words[i]) & 0xffffff) != memory.get(MemArea_Y, 0x150 + i))
					throw std::runtime_error("delay state case " + std::to_string(c) + " offset " + std::to_string(i) +
											 " expected " +
											 std::to_string(signedWord(memory.get(MemArea_Y, 0x150 + i))) + " actual " +
											 std::to_string(delay->words[i]));
			for (unsigned i = 0; i < 32; ++i)
				for (unsigned ch = 0; ch < 2; ++ch)
				{
					const auto expected = signedWord(memory.get(MemArea_X, 0x600 + i * 2 + ch));
					const auto actual = ch ? output.right[i] : output.left[i];
					if (expected != actual)
						throw std::runtime_error("delay audio case " + std::to_string(c) + " sample " +
												 std::to_string(i) + " expected " + std::to_string(expected) +
												 " actual " + std::to_string(actual));
				}
		}
		std::puts("Delay PASS: 4096 blocks, 262144 stereo samples, all 22 state words exact");
		auto reverb = std::make_unique<ReverbState>();
		ReverbControls rp;
		std::vector<int32_t> tables(trackTableSize);
		for (uint32_t i = 0; i < tables.size(); ++i)
			tables[i] = signedWord(memory.get(MemArea_X, 0x140000 + i));
		constexpr std::array<uint32_t, 5> diffusionBase{0x1319c0, 0x131a00, 0x131a80, 0x131b00, 0x131c00};
		constexpr std::array<uint32_t, 6> tankBase{0x130000, 0x131000, 0x132000, 0x132800, 0x133000, 0x130c00};
		for (uint32_t a = 0x130000; a < 0x138000; ++a)
			memory.set(MemArea_X, a, 0);
		for (uint32_t a = 0x14397d; a <= 0x14398a; ++a)
			memory.set(MemArea_Y, a, 0);
		memory.set(MemArea_Y, 0x143979, 0x134000);
		for (unsigned l = 0; l < 5; ++l)
		{
			memory.set(MemArea_X, 0x143992 + l, diffusionBase[l]);
			memory.set(MemArea_X, 0x14399c + l, 0);
		}
		for (unsigned l = 0; l < 6; ++l)
		{
			memory.set(MemArea_X, 0x1439a1 + l, tankBase[l]);
			memory.set(MemArea_X, 0x1439a7 + l, tankBase[l] + 32);
			memory.set(MemArea_X, 0x1439b4 + l, 0);
			memory.set(MemArea_X, 0x1439ba + l, 0);
		}
		memory.set(MemArea_X, 0x1439b3, 0x148000);
		for (unsigned c = 0; c < 4096; ++c)
		{
			oracle->reset();
			StereoBlock input, delayed, output;
			const std::array<int32_t, 8> p{rp.highpass, rp.lowpass,	   rp.decay,	 rp.damping,
										   rp.level,	rp.gateBlocks, rp.delaySend, rp.predelayWords};
			for (unsigned i = 0; i < p.size(); ++i)
				memory.set(MemArea_Y, 0x185 + i, uint32_t(p[i]) & 0xffffff);
			for (unsigned i = 0; i < 32; ++i)
			{
				input.left[i] = c < 1024 ? signedWord(randomWord()) / 64 : 0;
				input.right[i] = c < 1024 ? signedWord(randomWord()) / 64 : 0;
				memory.set(MemArea_X, 0x1c0 + 2 * i, uint32_t(input.left[i]) & 0xffffff);
				memory.set(MemArea_X, 0x1c1 + 2 * i, uint32_t(input.right[i]) & 0xffffff);
				memory.set(MemArea_X, 0x600 + 2 * i, 0);
				memory.set(MemArea_X, 0x601 + 2 * i, 0);
			}
			oracle->run(0x43c, 0x66c);
			renderReverb(rp, *reverb, {tables.data()}, input, delayed, output);
			for (unsigned l = 0; l < 5; ++l)
				if (signedWord(memory.get(MemArea_X, 0x14399c + l)) != reverb->diffusion[l].previous)
					throw std::runtime_error("reverb diffusion case " + std::to_string(c) + " line " +
											 std::to_string(l));
			for (unsigned l = 0; l < 6; ++l)
			{
				const auto expected = signedWord(memory.get(MemArea_X, 0x1439b4 + l));
				const auto actual = fixed::word(reverb->tank[l].filter);
				if (expected != actual)
					throw std::runtime_error("reverb tank case " + std::to_string(c) + " line " + std::to_string(l) +
											 " expected " + std::to_string(expected) + " actual " +
											 std::to_string(actual));
			}
			for (unsigned i = 0; i < 32; ++i)
				for (unsigned ch = 0; ch < 2; ++ch)
				{
					const auto expected = signedWord(memory.get(MemArea_Y, 2 + i * 2 + ch));
					const auto actual = ch ? output.right[i] : output.left[i];
					if (expected != actual)
						throw std::runtime_error("reverb audio case " + std::to_string(c) + " sample " +
												 std::to_string(i) + " expected " + std::to_string(expected) +
												 " actual " + std::to_string(actual));
				}
		}
		std::puts("Reverb PASS: 4096 blocks, 262144 stereo samples");
		MasterEqControls eqp;
		for (unsigned i = 0; i < 10; ++i)
			eqp.words[i] = signedWord(memory.get(MemArea_Y, 0x170 + i));
		MasterEqState eq;
		for (uint32_t a = 0x192; a <= 0x1af; ++a)
			memory.set(MemArea_Y, a, 0);
		for (unsigned c = 0; c < 4096; ++c)
		{
			oracle->reset();
			StereoBlock input;
			WideStereoBlock output;
			if (c % 256 == 0)
				eqp.words[8] = int32_t(c / 256) * 0x10000 - 0x80000;
			for (unsigned i = 0; i < 10; ++i)
				memory.set(MemArea_Y, 0x170 + i, uint32_t(eqp.words[i]) & 0xffffff);
			for (unsigned i = 0; i < 32; ++i)
			{
				input.left[i] = c < 3000 ? signedWord(randomWord()) / 64 : 0;
				input.right[i] = c < 3000 ? signedWord(randomWord()) / 64 : 0;
				memory.set(MemArea_X, 0x180 + 2 * i, uint32_t(input.left[i]) & 0xffffff);
				memory.set(MemArea_X, 0x181 + 2 * i, uint32_t(input.right[i]) & 0xffffff);
			}
			oracle->run(0x67c, 0x87f);
			renderMasterEq(eqp, eq, input, output);
			for (unsigned i = 0; i < 32; ++i)
				for (unsigned ch = 0; ch < 2; ++ch)
				{
					const auto address = (ch ? 0x7e : 0x4e) + i;
					const auto expected =
						fixed::pair(signedWord(memory.get(MemArea_X, address)), memory.get(MemArea_Y, address));
					if (expected != output[ch][i])
						throw std::runtime_error("master EQ case " + std::to_string(c) + " sample " +
												 std::to_string(i) + " expected " + std::to_string(expected) +
												 " actual " + std::to_string(output[ch][i]));
				}
		}
		std::puts("Master EQ PASS: 4096 blocks, 262144 stereo samples, 48-bit output exact");
		CompressorControls cp;
		for (unsigned i = 0; i < cp.words.size(); ++i)
			cp.words[i] = signedWord(memory.get(MemArea_Y, 0x17a + i));
		CompressorState compressor;
		for (uint32_t a = 0x143d00; a < 0x143dc0; ++a)
			memory.set(MemArea_X, a, 0);
		for (uint32_t a = 0x1b0; a <= 0x1bd; ++a)
			memory.set(MemArea_Y, a, 0);
		memory.set(MemArea_Y, 0x1b0, 0x143d00);
		memory.set(MemArea_Y, 0x1bb, compressor.root);
		memory.set(MemArea_Y, 0x1bd, compressor.gain);
		for (unsigned c = 0; c < 4096; ++c)
		{
			oracle->reset();
			WideStereoBlock input;
			StereoBlock output;
			if (c % 512 == 0)
				cp.words[4] = int32_t(c / 512) * 0x100000;
			for (unsigned i = 0; i < cp.words.size(); ++i)
				memory.set(MemArea_Y, 0x17a + i, uint32_t(cp.words[i]) & 0xffffff);
			for (unsigned i = 0; i < 32; ++i)
				for (unsigned ch = 0; ch < 2; ++ch)
				{
					input[ch][i] = c < 3000 ? fixed::pair(signedWord(randomWord()) / 8, randomWord()) : 0;
					const auto address = (ch ? 0x7e : 0x4e) + i;
					memory.set(MemArea_X, address, uint32_t(uint64_t(input[ch][i]) >> 24) & 0xffffff);
					memory.set(MemArea_Y, address, uint32_t(input[ch][i]) & 0xffffff);
				}
			oracle->run(0x87f, 0x971);
			renderCompressor(cp, compressor, input, output);
			for (unsigned i = 0; i < 32; ++i)
				for (unsigned ch = 0; ch < 2; ++ch)
				{
					const auto expected = signedWord(memory.get(MemArea_X, 0x180 + i * 2 + ch));
					const auto actual = ch ? output.right[i] : output.left[i];
					if (expected != actual)
						throw std::runtime_error("compressor case " + std::to_string(c) + " sample " +
												 std::to_string(i) + " expected " + std::to_string(expected) +
												 " actual " + std::to_string(actual));
				}
		}
		std::puts("Compressor PASS: 4096 blocks, 262144 stereo samples");
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
