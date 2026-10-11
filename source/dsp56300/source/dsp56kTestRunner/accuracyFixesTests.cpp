// Tests for DSP::setAccuracyFixes and the JIT failure path: places where the emulation did not follow the DSP56300
// manual, found by G1-Emu (https://github.com/animatek/G1-Emu, GPL-3, Javier Melgar) on the Nord Modular G1, which runs
// on this core. The host-command and idle-port tests are adapted from its tools/g1dspcheck.cpp. Synthetic programs,
// no ROM. Each fix is checked both ways: off is the legacy emulation exactly (the MD/MM goldens), on is the manual.
#include "dsp56kEmu/assembler.h"
#include "dsp56kEmu/dsp.h"
#include "dsp56kEmu/esaiclock.h"
#include "dsp56kEmu/essi.h"
#include "dsp56kEmu/memory.h"
#include "dsp56kEmu/opcodes.h"
#include "dsp56kEmu/peripherals.h"

#include <cstdint>
#include <cstdio>
#include <initializer_list>
#include <stdexcept>
#include <string>

namespace
{
	using namespace dsp56k;

	void require(const bool _condition, const std::string& _message)
	{
		if(!_condition)
			throw std::runtime_error(_message);
	}

	struct Machine
	{
		DefaultMemoryValidator validator;
		Memory memory{validator, 0x1000, 0x1000, 0x800};
		PeripheralsNop x, y;
		DSP dsp{memory, &x, &y};
		Assembler assembler;

		Machine(const bool _fixes, const uint32_t _blockSize)
		{
			dsp.setAccuracyFixes(_fixes);
			auto config = dsp.getJit().getConfig();
			config.linkJitBlocks = false;
			config.maxInstructionsPerBlock = _blockSize;
			dsp.getJit().setConfig(config);
			setSR(0);
		}

		void setSR(const TWord _sr)
		{
			// writeReg does not implement SR; also update the JIT's cached mode
			dsp.regs().sr.var = _sr;
			dsp.getJit().checkModeChange();
		}

		TWord program(TWord _address, const std::initializer_list<const char*> _lines)
		{
			for(const auto* line : _lines)
			{
				const auto r = assembler.assemble(line);
				require(r.success(), std::string("cannot assemble: ") + line);
				for(uint32_t i = 0; i < r.wordCount; ++i)
					dsp.memWriteP(_address++, r.word[i]);
			}
			return _address;
		}

		void untilJit(const TWord _pc)
		{
			for(unsigned i = 0; dsp.getPC().toWord() != _pc && i < 100; ++i)
				dsp.exec();
			require(dsp.getPC().toWord() == _pc, "expected PC not reached (JIT)");
		}

		void untilInterpreter(const TWord _pc)
		{
			for(unsigned i = 0; dsp.getPC().toWord() != _pc && i < 100; ++i)
				dsp.execInterpreter();
			require(dsp.getPC().toWord() == _pc, "expected PC not reached (interpreter)");
		}
	};

	std::string ccrName(const bool _z, const bool _n, const bool _v)
	{
		return std::string("Z=") + (_z ? "1" : "0") + " N=" + (_n ? "1" : "0") + " V=" + (_v ? "1" : "0");
	}

	// GT is Z + (N ^ V) == 0 and LE its opposite (DSP56300 family manual, table of condition codes). The x86-64 JIT
	// tested the parity of Z, N and V and AArch64 tested LE for exactly 1: both wrong when Z = 1 and N != V, which a
	// compare never produces but ASL of $80:000000:000000 (result 0, V set, N clear) or a MOVE to CCR does.
	void greaterThanLessEqual()
	{
		for(const bool fixes : {false, true})
		for(const uint32_t blockSize : {1u, 8u})
		for(unsigned bits = 0; bits < 8; ++bits)
		{
			const bool z = bits & 1, n = bits & 2, v = bits & 4;
			const bool gt = !z && (n == v);
			const auto name = ccrName(z, n, v) + (fixes ? " fixes on" : " fixes off") + " block " + std::to_string(blockSize);

			Machine m(fixes, blockSize);
			// a = 0; if GT, a = x1; then if LE, b = x0. One of the two moves, never both.
			m.program(0x100, {"tgt x1,a", "tle x0,b", "jmp $102"});
			m.dsp.regs().x.var = 0x111111222222ull;	// x1 = $111111, x0 = $222222
			m.dsp.regs().a.var = 0;
			m.dsp.regs().b.var = 0;
			m.setSR((z ? CCR_Z : 0) | (n ? CCR_N : 0) | (v ? CCR_V : 0));

			m.dsp.setPC(0x100);
			m.untilJit(0x102);
			const bool jitGt = m.dsp.regs().a.var != 0;
			const bool jitLe = m.dsp.regs().b.var != 0;

			const bool legacyCase = z && n != v;
			if(fixes || !legacyCase)
			{
				require(jitGt == gt, "JIT GT, " + name);
				require(jitLe == !gt, "JIT LE, " + name);
				continue;
			}
			// off: the legacy emulation, wrong in this one case, as the MD/MM goldens were recorded
#ifdef HAVE_ARM64
			require(jitGt == gt, "legacy JIT GT (AArch64 was right), " + name);
			require(!jitLe, "legacy JIT LE (AArch64 tested for exactly 1), " + name);
#else
			require(jitGt, "legacy JIT GT (x86-64 parity: two bits set is even), " + name);
			require(!jitLe, "legacy JIT LE (x86-64 parity), " + name);
#endif
		}
		std::puts("GT/LE: the JIT follows Z + (N ^ V) with the fixes on, and is the legacy JIT without");
	}

	// The same program on the JIT and on the interpreter must end in the same state: a differential check over the
	// case the condition-code bug lives in, through real instructions rather than the decoder alone.
	void greaterThanLessEqualJitMatchesInterpreter()
	{
		for(const uint32_t blockSize : {1u, 8u})
		for(unsigned bits = 0; bits < 8; ++bits)
		{
			const bool z = bits & 1, n = bits & 2, v = bits & 4;
			const auto name = ccrName(z, n, v) + " block " + std::to_string(blockSize);
			uint64_t a[2], b[2];
			for(const bool interpreter : {false, true})
			{
				Machine m(true, blockSize);
				m.program(0x100, {"tgt x1,a", "tle x0,b", "jmp $102"});
				m.dsp.regs().x.var = 0x111111222222ull;
				m.dsp.regs().a.var = 0;
				m.dsp.regs().b.var = 0;
				m.setSR((z ? CCR_Z : 0) | (n ? CCR_N : 0) | (v ? CCR_V : 0));
				m.dsp.setPC(0x100);
				if(interpreter)
					m.untilInterpreter(0x102);
				else
					m.untilJit(0x102);
				a[interpreter] = m.dsp.regs().a.var;
				b[interpreter] = m.dsp.regs().b.var;
			}
			// the interpreter is right in every case (its LE was wrong the same way; fixed for good: MD/MM never run the
			// interpreter, it only serves tests and hosts without a JIT)
			const bool gt = !z && (n == v);
			require((a[1] != 0) == gt && (b[1] != 0) == !gt, "interpreter GT/LE, " + name);
			require(a[0] == a[1] && b[0] == b[1], "JIT and interpreter disagree, " + name);
		}
		std::puts("GT/LE: the interpreter follows Z + (N ^ V), and the JIT matches it in all eight Z/N/V cases with the fixes on");
	}

	// MOVE X:aa / Y:aa (short absolute address) take one cycle; the table charged two. A firmware filled to its cycle
	// budget then went past it and lost sample clocks (G1-Emu, WavetableSynth.pch).
	void shortAbsoluteMoveCycles()
	{
		for(const bool fixes : {false, true})
		{
			Machine m(fixes, 8);
			const auto end = m.program(0x100, {"move x:$10,a", "move y:$10,b", "move a,x:$11"});
			require(end == 0x103, "short absolute moves are one word each");

			for(TWord pc = 0x100; pc < end; ++pc)
			{
				TWord opA, opB;
				m.memory.getOpcode(pc, opA, opB);
				Instruction instA, instB;
				m.dsp.opcodes().getInstructionTypes(opA, instA, instB);
				require(instA == Movex_aa || instA == Movey_aa || instB == Movex_aa || instB == Movey_aa,
					"test program is not a short absolute move at $" + std::to_string(pc));
				const auto cycles = m.dsp.calcOpcodeCycles(pc);
				require(cycles == (fixes ? 1u : 2u), "MOVE X:aa/Y:aa cycles with fixes " + std::string(fixes ? "on" : "off")
					+ ": " + std::to_string(cycles));
			}

			// and the JIT charges what the table says, one block of three moves and a jump
			m.program(0x103, {"jmp $103"});
			m.dsp.setPC(0x100);
			const auto before = m.dsp.getCycles();
			m.untilJit(0x103);
			// the block runs the three moves and the jump at $103 (which jumps to itself)
			const auto charged = m.dsp.getCycles() - before - m.dsp.calcOpcodeCycles(0x103);
			require(charged == (fixes ? 3u : 6u), "JIT cycles for three short absolute moves with fixes "
				+ std::string(fixes ? "on" : "off") + ": " + std::to_string(charged));
		}
		std::puts("MOVE X:aa/Y:aa: one cycle with the fixes on, two (legacy) off; the JIT charges the same");
	}

	// A host command (an external interrupt) must be serviced even when the DSP always has another internal interrupt
	// waiting. Adapted from G1-Emu's externalInterruptWhileBusy: the core collected external interrupts only on the
	// idle path, so a DSP whose sample routine filled the block never saw its host command (G1-Emu #4).
	void externalInterruptWhileBusy()
	{
		for(const bool fixes : {false, true})
		{
			Machine m(fixes, 8);
			m.program(0x16, {"nop", "nop"});		// a fast interrupt that does nothing, always pending
			m.program(0x76, {"move #$55,x0", "nop"});	// the host command (fast): x0 = $550000
			m.program(0x100, {"jmp $100"});
			m.dsp.regs().x.var = 0;
			m.dsp.setPC(0x100);
			m.dsp.injectInterrupt(0x16);
			m.dsp.injectExternalInterrupt(0x76);
			for(unsigned i = 0; i < 200; ++i)
			{
				m.dsp.injectInterrupt(0x16);	// there is always another one pending
				m.dsp.exec();
			}
			const bool serviced = (m.dsp.regs().x.var & 0xffffff) == 0x550000;
			if(fixes)
				require(serviced, "a host command starves while other interrupts keep coming (fixes on)");
			else
				std::printf("host command while busy, fixes off (legacy): %s\n", serviced ? "serviced" : "starved");
		}
		std::puts("host command while busy: serviced with the fixes on");
	}

	// An ESSI on the fine schedule (MD: the link between the two DSPs) that sat idle owes nothing for that time. Without
	// the cap the clock emitted every frame of the gap in one call. Adapted from G1-Emu's idleLinkPort.
	void idleLinkPort()
	{
		for(const uint32_t limit : {0u, 64u})
		{
			DefaultMemoryValidator validator;
			Memory memory{validator, 0x1000, 0x1000, 0x800};
			Peripherals56303 periph;
			PeripheralsNop nop;
			DSP dsp{memory, &periph, &nop};

			auto& clock = periph.getEssiClock();
			clock.setClockSource(EsxiClock::ClockSource::Cycles);
			clock.setSamplerate(96000 * 2);
			clock.setCyclesPerSample(432);
			clock.setFineCatchUpLimit(limit);

			auto& essi = periph.getEssi0();
			essi.setFineLinkMode(true);
			uint64_t frames = 0;
			essi.setWriteTxCallback([&frames](uint64_t&, const Audio::TxFrame&) { ++frames; });
			essi.setReadRxCallback([](uint64_t&, Audio::RxFrame& _frame) { _frame.resize(2); });
			essi.writeCRA(0x181801);	// 96 cycles per word
			essi.writeCRB(0x0328b0);	// transmitter on
			require(essi.hasEnabledTransmitters() != 0, "the transmitter did not turn on");

			const auto runNormally = [&]
			{
				frames = 0;
				for(uint32_t i = 0; i < 100; ++i)
				{
					dsp.fastForward(0, 96);
					clock.exec();
				}
				require(frames >= 48 && frames <= 52, "a port running normally emits one frame per two word periods: "
					+ std::to_string(frames));
			};

			runNormally();

			// idle for 4 million cycles (nothing served the clock), then it wakes up
			frames = 0;
			dsp.fastForward(0, 4000000);
			clock.exec();
			if(limit)
				require(frames <= limit, "an idle port emitted the frames of its whole idle time at once: " + std::to_string(frames));
			else
				require(frames > 10000, "legacy: the idle port catches up its whole idle time: " + std::to_string(frames));

			runNormally();
		}
		std::puts("idle fine-schedule port: at most 64 periods owed with the limit, the whole idle time without");
	}

	// A block the JIT cannot generate must not recurse into create() until the stack overflows (G1-Emu #17): the DSP
	// returns, and the JIT records the failure for the host.
	void jitFailureDoesNotRecurse()
	{
		Machine m(false, 8);
		m.program(0x100, {"nop", "jmp $100"});
		m.dsp.setPC(0x100);
		m.dsp.getJit().setFailEmitsFrom(1);
		for(unsigned i = 0; i < 10; ++i)
			m.dsp.exec();
		require(m.dsp.getJit().hasFailed(), "the JIT failure was not recorded");
		require(m.dsp.getJit().getFailurePC() == 0x100, "the JIT failure names the wrong PC");
		require(m.dsp.getPC().toWord() == 0x100, "the DSP moved past code that was never generated");

		// and it recovers once code can be generated again
		m.dsp.getJit().setFailEmitsFrom(0);
		m.dsp.exec();
		std::puts("JIT failure: recorded and returned, no recursion");
	}
}

int main()
{
	try
	{
		greaterThanLessEqual();
		greaterThanLessEqualJitMatchesInterpreter();
		shortAbsoluteMoveCycles();
		externalInterruptWhileBusy();
		idleLinkPort();
		jitFailureDoesNotRecurse();
	}
	catch(const std::exception& e)
	{
		std::fprintf(stderr, "FAILED: %s\n", e.what());
		return 1;
	}
	std::puts("accuracy fixes: all tests passed");
	return 0;
}
