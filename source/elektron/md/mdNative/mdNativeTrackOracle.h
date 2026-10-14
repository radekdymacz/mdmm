#pragma once

// Firmware-test helper only; never linked into the portable rendering library.
#include "mdLib/mdromcheck.h"
#include "mdLibTest/mdFirmwareSession.h"
#include "mdNativeTrackCorpus.h"

#include <cstdlib>
#include <fstream>
#include <memory>

namespace
{
	using namespace mdNative;
	using namespace mdNative::proof;
	using namespace dsp56k;
	using mdFirmwareSession::require;
	constexpr uint32_t trackAddress = 0x800;

	class Oracle
	{
	public:
		Oracle() : memory(validator, 0x200000, 0x200000, 0x20000), dsp(memory, &x, &y)
		{
		}
		void extract(const char *_path)
		{
			const auto rom = mdFirmwareSession::load(_path);
			require(md::checkRom(rom, md::MachineModel::Machinedrum).ok, "expected canonical MD OS 1.63");
			auto machine = std::make_unique<mdFirmwareSession::Machine>(rom, _path);
			auto &original = machine->hardware().getDspMixer().dsp().memory();
			require(original.get(MemArea_P, 0x121) == 0x0256be && original.get(MemArea_P, 0x255) == 0x45d2e8,
					"DSP1 kernel differs");
			for (uint32_t a = 0; a < 0x1000; ++a)
				memory.set(MemArea_P, a, original.get(MemArea_P, a));
			for (uint32_t a = 0x150; a < 0x1c2; ++a)
				memory.set(MemArea_Y, a, original.get(MemArea_Y, a));
			auto &producer = machine->hardware().getDspProducer().dsp().memory();
			for (uint32_t a = 0x1000a4; a <= 0x1000dc; ++a)
				memory.set(MemArea_P, a, producer.get(MemArea_P, a));
			for (uint32_t a = 0x140000; a < 0x150000; ++a)
				memory.set(MemArea_X, a, original.get(MemArea_X, a));
			for (uint32_t a = 0x648; a < 0x688; ++a)
				memory.set(MemArea_X, a, original.get(MemArea_X, a));
			for (uint32_t i = 0; i < waveSize; ++i)
				wave[i] = signedWord(original.get(MemArea_X, 0x148000 + i));
			require(wave[8192] > 8000000, "DSP1 sine table missing");
		}
		void extractSnapshot(const std::string &_directory)
		{
			for (auto area : {MemArea_P, MemArea_X, MemArea_Y})
			{
				std::ifstream file(_directory + "/dsp1-" +
									   (area == MemArea_P		? "P"
											: area == MemArea_X ? "X"
																: "Y") +
									   ".bin",
								   std::ios::binary);
				require(bool(file), "missing private snapshot");
				unsigned char bytes[3];
				uint32_t address = 0;
				while (file.read(reinterpret_cast<char *>(bytes), 3))
					memory.set(area, address++, (uint32_t(bytes[0]) << 16) | (uint32_t(bytes[1]) << 8) | bytes[2]);
			}
			std::ifstream voice(_directory + "/dsp2-P.bin", std::ios::binary);
			require(bool(voice), "missing private voice snapshot");
			voice.seekg(0x1000a4 * 3);
			for (uint32_t a = 0x1000a4; a <= 0x1000dc; ++a)
			{
				unsigned char bytes[3];
				require(bool(voice.read(reinterpret_cast<char *>(bytes), 3)), "truncated voice snapshot");
				memory.set(MemArea_P, a, (uint32_t(bytes[0]) << 16) | (uint32_t(bytes[1]) << 8) | bytes[2]);
			}
			for (uint32_t i = 0; i < waveSize; ++i)
				wave[i] = signedWord(memory.get(MemArea_X, 0x148000 + i));
			require(memory.get(MemArea_P, 0x121) == 0x0256be && wave[8192] > 8000000, "snapshot format differs");
		}
		void reset()
		{
			dsp.writeReg(Reg_SR, TReg24(0x80000));
			for (unsigned i = 0; i < 8; ++i)
				dsp.writeReg(static_cast<EReg>(Reg_M0 + i), TReg24(0xffffff));
			dsp.regs().r[6].var = trackAddress;
		}
		void run(const uint32_t _begin, const uint32_t _end)
		{
			dsp.setPC(_begin);
			for (unsigned i = 0; i < 100000; ++i)
			{
				if (dsp.getPC().toWord() == _end)
					return;
				dsp.execInterpreter();
			}
			throw std::runtime_error("DSP1 stage did not finish");
		}
		void put(const unsigned _offset, const int32_t _word)
		{
			memory.set(MemArea_Y, trackAddress + _offset, uint32_t(_word) & 0xffffff);
		}
		int32_t get(const unsigned _offset) const
		{
			return signedWord(memory.get(MemArea_Y, trackAddress + _offset));
		}

		TrackCase reference(TrackCase _c)
		{
			reset();
			const auto &s = _c.before;
			if (_c.kind == 0)
			{
				dsp.regs().r[0].var = 8;
				dsp.regs().r[2].var = 9;
				dsp.regs().r[5].var = 0x50;
				dsp.regs().n[0].var = 0xfffffd;
				dsp.writeReg(Reg_M5, TReg24(4));
				put(0x14, s[2]);
				put(0x15, s[4]);
				put(0x16, s[3]);
				for (unsigned i = 0; i < 4; ++i)
					memory.set(MemArea_X, 8 + i, uint32_t(s[3 - i]) & 0xffffff);
				for (unsigned i = 0; i < 5; ++i)
					memory.set(MemArea_Y, 0x50 + i, uint32_t(_c.parameters[i]) & 0xffffff);
				for (unsigned i = 0; i < 32; ++i)
					memory.set(MemArea_X, 12 + i, uint32_t(_c.input[i]) & 0xffffff);
				run(0x121, 0x134);
				_c.after = {_c.input[31], _c.input[30], get(0x14), get(0x16),
							int32_t(memory.get(MemArea_Y, trackAddress + 0x15))};
				for (unsigned i = 0; i < 32; ++i)
					_c.output[i] = signedWord(memory.get(MemArea_X, 10 + i));
			}
			else if (_c.kind == 1)
			{
				dsp.regs().r[0].var = 0x1000;
				dsp.regs().n[0].var = 0;
				dsp.regs().r[1].var = 0x100;
				dsp.regs().r[2].var = 0x3d;
				dsp.regs().r[4].var = 3;
				dsp.regs().r[5].var = trackAddress + 0x1e;
				dsp.regs().r[7].var = trackAddress + 0x1e;
				memory.set(MemArea_X, 0x3c, uint32_t(_c.parameters[0]) & 0xffffff);
				memory.set(MemArea_X, 0x1000, uint32_t(_c.parameters[1]) & 0xffffff);
				for (unsigned i = 0; i < 4; ++i)
					put(0x1e + i, s[i]);
				for (unsigned i = 0; i < 32; ++i)
					memory.set(MemArea_Y, 3 + i, uint32_t(_c.input[i]) & 0xffffff);
				run(0x243, 0x25e);
				_c.after = {get(0x1e), get(0x1f), get(0x20), int32_t(memory.get(MemArea_Y, trackAddress + 0x21)), 0};
				for (unsigned i = 0; i < 32; ++i)
					_c.output[i] = signedWord(memory.get(MemArea_X, 0x100 + i));
			}
			else if (_c.kind == 2 || _c.kind == 3)
			{
				const auto &c = _c.coefficients;
				for (unsigned i = 0; i < 32; ++i)
				{
					memory.set(MemArea_Y, (_c.kind == 2 ? 0x80 : 0xa0) + i, uint32_t(c.feedback2[i]) & 0xffffff);
					memory.set(MemArea_Y, 0xc0 + i, uint32_t(c.feedback1[i]) & 0xffffff);
					if (_c.kind == 2)
						memory.set(MemArea_Y, 0xa0 + i, uint32_t(c.feedforward[i]) & 0xffffff);
					else
					{
						memory.set(MemArea_Y, 0x60 + 2 * i, uint32_t(c.feedforward[i]) & 0xffffff);
						memory.set(MemArea_Y, 0x61 + 2 * i, uint32_t(c.middle[i]) & 0xffffff);
					}
					memory.set(MemArea_X, (_c.kind == 2 ? 10 : 6) + i, uint32_t(_c.input[i]) & 0xffffff);
				}
				if (_c.kind == 2)
				{
					memory.set(MemArea_X, 6, uint32_t(s[1]) & 0xffffff);
					dsp.regs().r[3].var = 7;
					put(0x17, s[0]);
					put(0x18, s[1]);
					put(0x27, s[2]);
					put(0xa, s[3]);
					put(0xc, s[4]);
					put(0xb, s[5]);
					run(0x17a, 0x1a0);
					_c.after = {get(0x17), get(0x18), get(0x27) & 0xffffff, get(0xa), get(0xc), get(0xb) & 0xffffff,
								s[6],	   s[7]};
				}
				else
				{
					memory.set(MemArea_X, 0, uint32_t(s[1]) & 0xffffff);
					dsp.regs().r[0].var = 1;
					put(0x19, s[0]);
					put(0x1b, s[1]);
					put(0x1a, s[2]);
					put(0xd, s[3]);
					put(0xf, s[4]);
					put(0xe, s[5]);
					put(0x10, s[6]);
					put(0x11, s[7]);
					run(0x1ea, 0x21f);
					_c.after = {get(0x19), get(0x1b), get(0x1a) & 0xffffff, get(0xd), get(0xf), get(0xe) & 0xffffff,
								get(0x10), get(0x11)};
				}
				for (unsigned i = 0; i < 32; ++i)
					_c.output[i] = signedWord(memory.get(MemArea_X, (_c.kind == 2 ? 8 : 2) + i));
			}
			else if (_c.kind == 4)
			{
				put(7, _c.parameters[0]);
				put(0x1c, s[0]);
				put(0x1d, s[1]);
				for (unsigned i = 0; i < 32; ++i)
					memory.set(MemArea_X, 2 + i, uint32_t(_c.input[i]) & 0xffffff);
				run(0x21f, 0x234);
				_c.after = {get(0x1c), signedWord(memory.get(MemArea_Y, 0x22))};
				for (unsigned i = 0; i < 32; ++i)
					_c.output[i] = signedWord(memory.get(MemArea_Y, 3 + i));
			}
			else
			{
				put(0, _c.parameters[0]);
				put(1, _c.parameters[1]);
				dsp.regs().r[1].var = 0x148000 + uint32_t(s[0]);
				dsp.writeReg(Reg_M1, TReg24(0x7fff));
				dsp.regs().r[3].var = 0xb;
				dsp.regs().r[4].var = trackAddress + 0x25;
				dsp.regs().r[7].var = 0x100;
				for (unsigned i = 0; i < 32; ++i)
					memory.set(MemArea_Y, 0x100 + i, uint32_t(_c.input[i]) & 0xffffff);
				run(0xbd, 0xd2);
				_c.after = {get(0x25) & 0x7fff};
				for (unsigned i = 0; i < 32; ++i)
					_c.output[i] = signedWord(memory.get(MemArea_X, 0xc + i));
			}
			return _c;
		}
		DefaultMemoryValidator validator;
		Memory memory;
		PeripheralsNop x, y;
		DSP dsp;
		std::array<int32_t, waveSize> wave{};
	};
	uint32_t randomWord()
	{
		static uint32_t s = 0xa163abcd;
		s ^= s << 13;
		s ^= s >> 17;
		s ^= s << 5;
		return s & 0xffffff;
	}
} // namespace
