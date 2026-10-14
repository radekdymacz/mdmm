// Extracts only from the caller's pinned ROM; no firmware or generated tables are checked in.
#include "mdLib/mdromcheck.h"
#include "mdLibTest/mdFirmwareSession.h"
#include "mdNativeCorpus.h"

#include <cstdlib>
#include <fstream>
#include <memory>

namespace
{
	using namespace mdNative;
	using namespace mdNative::proof;
	using namespace dsp56k;
	using mdFirmwareSession::require;
	constexpr uint32_t voiceAddress = 0x800, outputAddress = 0x100;
	constexpr uint32_t triggerAddress = 0x1000a4, renderAddress = 0x1000ad, returnAddress = 0x1000dc;

	class Oracle
	{
	public:
		Oracle() : m_memory(m_validator, 0x200000, 0x200000, 0x20000), m_dsp(m_memory, &m_x, &m_y)
		{
		}

		void extract(const char *_path)
		{
			const auto rom = mdFirmwareSession::load(_path);
			require(md::checkRom(rom, md::MachineModel::Machinedrum).ok, "expected canonical MD OS 1.63 ROM");
			auto machine = std::make_unique<mdFirmwareSession::Machine>(rom, _path);
			auto &memory = machine->hardware().getDspProducer().dsp().memory();
			// The DSP dispatch table uses kit model + 1: GND-SIN (model 1) is entry 2.
			require(memory.get(MemArea_Y, 0x145bb6 + 2) == triggerAddress &&
						memory.get(MemArea_Y, 0x145c77 + 2) == renderAddress,
					"GND-SIN dispatch differs");
			for (uint32_t pc = triggerAddress; pc <= returnAddress; ++pc)
				m_memory.set(MemArea_P, pc, memory.get(MemArea_P, pc));
			for (uint32_t i = 0; i < waveSize; ++i)
			{
				const auto word = memory.get(MemArea_X, 0x148000 + i);
				wave[i] = signedWord(word);
				m_memory.set(MemArea_X, 0x148000 + i, word);
			}
			require(wave[8192] > 8000000 && wave[24576] == -8388608, "sine table did not initialize");
		}

		void prepare(const SineParameters &_parameters, const SineState &_state)
		{
			m_dsp.writeReg(Reg_SR, TReg24(0x80000));
			m_dsp.regs().r[6].var = voiceAddress;
			m_dsp.regs().r[7].var = outputAddress;
			m_dsp.writeReg(Reg_M7, TReg24(31));
			put(1, _parameters.pitch);
			put(2, _parameters.decay);
			put(3, _parameters.ramp);
			put(4, _parameters.rampDecay);
			put(6, _state.ramp);
			put(7, uint32_t(_state.phase >> 24));
			put(8, uint32_t(_state.phase));
			put(9, uint32_t(_state.gain));
			put(10, uint32_t(_state.gain >> 24));
		}

		void run(const uint32_t _start, const uint32_t _end)
		{
			m_dsp.setPC(_start);
			for (uint32_t instruction = 0; instruction < 4096; ++instruction)
			{
				if (m_dsp.getPC().toWord() == _end)
					return;
				m_dsp.execInterpreter();
			}
			throw std::runtime_error("original DSP routine did not return within 4096 instructions");
		}

		SineState state() const
		{
			return {(uint64_t(get(7)) << 24) | get(8), (uint64_t(get(10)) << 24) | get(9), signedWord(get(6))};
		}

		Block output() const
		{
			Block result{};
			for (size_t i = 0; i < result.size(); ++i)
				result[i] = signedWord(m_memory.get(MemArea_Y, outputAddress + uint32_t(i)));
			return result;
		}

		std::array<int32_t, waveSize> wave{};

	private:
		void put(const uint32_t _offset, const uint32_t _word)
		{
			m_memory.set(MemArea_Y, voiceAddress + _offset, _word & 0xffffff);
		}
		uint32_t get(const uint32_t _offset) const
		{
			return m_memory.get(MemArea_Y, voiceAddress + _offset);
		}
		DefaultMemoryValidator m_validator;
		Memory m_memory;
		PeripheralsNop m_x, m_y;
		DSP m_dsp;
	};

	uint32_t randomWord()
	{
		static uint32_t state = 0x163c0de;
		state ^= state << 13;
		state ^= state >> 17;
		state ^= state << 5;
		return state & 0xffffff;
	}

	void checkBlock(Oracle &_oracle, const SineParameters &_parameters, SineState &_state, std::ostream *_corpus,
					uint64_t &_hash, std::vector<int32_t> *_audio = nullptr,
					std::vector<int32_t> *_referenceAudio = nullptr)
	{
		const auto before = _state;
		_oracle.prepare(_parameters, before);
		_oracle.run(renderAddress, returnAddress);
		const auto expectedState = _oracle.state();
		const auto expected = _oracle.output();
		Block actual{};
		renderSine(_parameters, _state, _oracle.wave.data(), actual);
		require(sameState(_state, expectedState), "native GND-SIN state differs from DSP");
		require(actual == expected, "native GND-SIN audio differs from DSP");
		if (_corpus)
		{
			for (const auto value : {_parameters.pitch, _parameters.decay, _parameters.ramp, _parameters.rampDecay})
				writeWord(*_corpus, uint32_t(value) & 0xffffff);
			writeState(*_corpus, before);
			writeState(*_corpus, expectedState);
			for (const auto value : expected)
				writeWord(*_corpus, uint32_t(value) & 0xffffff);
		}
		for (const auto value : actual)
			_hash = hashWord(_hash, uint32_t(value) & 0xffffff);
		if (_audio)
			_audio->insert(_audio->end(), actual.begin(), actual.end());
		if (_referenceAudio)
			_referenceAudio->insert(_referenceAudio->end(), expected.begin(), expected.end());
	}
} // namespace

int main(const int _argc, char **_argv)
{
	const char *path = _argc > 1 ? _argv[1] : std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
	if (!path || !*path)
	{
		std::puts("mdNativeFirmwareTest: SKIP (GEARMULATOR_MD_FIRMWARE_BIN not set)");
		return 77;
	}
	try
	{
		if (_argc > 3)
			throw std::runtime_error("usage: mdNativeFirmwareTest [ROM [existing-output-directory]]");
		auto oracle = std::make_unique<Oracle>();
		oracle->extract(path);
		std::ofstream corpus;
		if (_argc == 3)
		{
			corpus.open(std::string(_argv[2]) + "/gnd-sin-corpus.bin", std::ios::binary);
			writeWord(corpus, magic);
			writeWord(corpus, waveSize);
			writeWord(corpus, corpusCases);
			for (const auto word : oracle->wave)
				writeWord(corpus, uint32_t(word) & 0xffffff);
		}
		SineState triggered{0x123456789abc, 0x654321fedcba, -1};
		oracle->prepare({}, triggered);
		oracle->run(triggerAddress, renderAddress - 1);
		trigger(triggered);
		require(sameState(triggered, oracle->state()), "trigger state differs from DSP");

		uint64_t hash = 14695981039346656037ull;
		SineState state = triggered;
		constexpr std::array<int32_t, 8> edges{0, 1, 63, 64, 0x3fffff, 0x7fffff, -1, -0x800000};
		for (uint32_t c = 0; c < stressCases; ++c)
		{
			SineParameters parameters;
			if (c < 4096)
			{
				parameters = {edges[c & 7], edges[(c >> 3) & 7], edges[(c >> 6) & 7], edges[(c >> 9) & 7]};
				state = {(uint64_t(randomWord()) << 24) | randomWord(), (uint64_t(randomWord()) << 24) | randomWord(),
						 signedWord(randomWord())};
			}
			else if (c < 8192)
			{
				parameters = {signedWord(randomWord()), signedWord(randomWord()), signedWord(randomWord()),
							  signedWord(randomWord())};
				state = {(uint64_t(randomWord()) << 24) | randomWord(), (uint64_t(randomWord()) << 24) | randomWord(),
						 signedWord(randomWord())};
			}
			else
			{
				// Carry oscillator/envelope state between calls; retrigger and change parameters at block boundaries.
				if (c % 257 == 0)
					trigger(state);
				parameters = {int32_t(randomWord() & 0xffff), 0x7ffff0 - int32_t(c % 1024),
							  int32_t(randomWord() & 0x1ffff), 0x7f0000 + int32_t(c % 65536)};
			}
			try
			{
				checkBlock(*oracle, parameters, state, corpus.is_open() ? &corpus : nullptr, hash);
			}
			catch (const std::exception &e)
			{
				throw std::runtime_error("case " + std::to_string(c) + ": " + e.what());
			}
		}
		std::vector<int32_t> audio, referenceAudio;
		constexpr std::array<int32_t, demoNotes> pitches{5231, 10462, 20924, 41848, 10462, 10462, 10462, 10462};
		for (size_t note = 0; note < pitches.size(); ++note)
		{
			trigger(state);
			const SineParameters parameters{pitches[note], 0x7ff800, note >= 4 ? int32_t(0x20000 * (note - 3)) : 0,
											0x7c0000};
			for (size_t b = 0; b < demoBlocksPerNote; ++b)
				checkBlock(*oracle, parameters, state, corpus.is_open() ? &corpus : nullptr, hash, &audio,
						   &referenceAudio);
		}
		if (_argc == 3)
		{
			std::ofstream wav(std::string(_argv[2]) + "/gnd-sin-native.wav", std::ios::binary);
			writeWav(wav, audio);
			std::ofstream reference(std::string(_argv[2]) + "/gnd-sin-dsp.wav", std::ios::binary);
			writeWav(reference, referenceAudio);
		}
		std::printf("GND-SIN PASS: %u blocks, %u samples, all final states exact; audio FNV64=%016llx\n", corpusCases,
					corpusCases * uint32_t(blockSize), static_cast<unsigned long long>(hash));
		return 0;
	}
	catch (const std::exception &e)
	{
		std::fprintf(stderr, "mdNativeFirmwareTest: %s\n", e.what());
		return 1;
	}
}
