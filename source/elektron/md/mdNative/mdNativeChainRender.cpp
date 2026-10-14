// Standalone adjustable renderer. Loads only the private numeric tables, never firmware instructions.
#include "mdNativeChain.h"
#include "mdNativeCorpus.h"

#include <cstdio>
#include <fstream>

int main(const int _argc, char **_argv)
{
	try
	{
		using namespace mdNative;
		using namespace mdNative::proof;
		if (_argc != 3 && _argc != 12)
			throw std::runtime_error(
				"usage: mdNativeChainRender tables.bin output.wav [AMD AMF EQF EQG FLTF FLTW FLTQ SRR DRIVE]");
		TrackControls controls{0, 0, 64, 64, 0, 127, 0, 0, 0};
		if (_argc == 12)
			for (size_t i = 0; i < controls.size(); ++i)
			{
				size_t consumed = 0;
				controls[i] = std::stoi(_argv[3 + i], &consumed);
				if (consumed != std::string(_argv[3 + i]).size() || controls[i] < 0 || controls[i] > 127)
					throw std::runtime_error("each control must be an integer from 0 to 127");
			}
		for (auto &c : controls)
			c *= 128;
		std::ifstream in(_argv[1], std::ios::binary);
		std::vector<int32_t> tables(trackTableSize);
		for (auto &value : tables)
			value = signedWord(readWord(in));
		if (in.peek() != std::char_traits<char>::eof())
			throw std::runtime_error("unexpected table file size");
		TrackState state;
		state.words[0x25] = 0x148000;
		std::array<SineState, 3> voices{};
		std::vector<int32_t> audio;
		for (unsigned block = 0; block < 5512; ++block)
		{
			Block input{}, output;
			for (size_t v = 0; v < voices.size(); ++v)
			{
				if (block % 689 == 0)
					trigger(voices[v]);
				Block tone;
				renderSine({int32_t(5231 *
									(v == 0		  ? 1
										 : v == 1 ? 4
												  : 16)),
							0x7ffc00, 0, 0},
						   voices[v], tables.data() + 0x8000, tone);
				for (size_t i = 0; i < blockSize; ++i)
					input[i] += tone[i] / 3;
			}
			state.words[0x29] = state.words[0x24];
			state.words[0x2d] = state.words[0x22];
			renderTrack(controls, state, {tables.data()}, input, output);
			audio.insert(audio.end(), output.begin(), output.end());
		}
		std::ofstream wav(_argv[2], std::ios::binary);
		writeWav(wav, audio);
		std::printf("Native track: %zu samples at 44.1 kHz; numeric tables only, no emulator\n", audio.size());
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "%s\n", e.what());
		return 1;
	}
}
