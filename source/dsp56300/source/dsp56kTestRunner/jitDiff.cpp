// dsp56kJitDiff: runs DSP56300 instructions on the JIT and on the interpreter from the same random state, and reports
// every register or memory word that ends up different. A disagreement is a JIT (or interpreter) bug in that
// instruction. Adapted from G1-Emu's tools/jitdiff.cpp (https://github.com/animatek/G1-Emu, GPL-3, Javier Melgar), which
// found the CMPM and GT/LE bugs this way.
//
//   dsp56kJitDiff [options] [trials] [K] < words.hex
//       one instruction word per line (a two-word instruction takes the next line as its extension word), for example
//       a dump of a firmware's P memory (mdmmPerfGateTest --dump-p). Without K: JIT against interpreter, one
//       instruction at a time. With K: every run of K instructions as one JIT block against the same JIT with one
//       instruction per block, which finds state the JIT carries wrongly between instructions (how CMPM was found).
//   dsp56kJitDiff --selftest
//       the same over a built-in list of instructions (condition codes, CMPM, shifts, short absolute moves), with the
//       accuracy fixes on: exits 1 on any disagreement. Runs in ctest, no ROM.
//
// Options: --legacy runs the JIT without DSP::setAccuracyFixes (the MD/MM default), so the GT/LE cases it fixes show
// up again. Flow the harness cannot contain (loops, calls, returns, jumps, data words) is skipped.
#include "dsp56kEmu/assembler.h"
#include "dsp56kEmu/disasm.h"
#include "dsp56kEmu/dsp.h"
#include "dsp56kEmu/memory.h"
#include "dsp56kEmu/opcodes.h"
#include "dsp56kEmu/peripherals.h"
#include "dsp56kBase/logging.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <memory>
#include <random>
#include <string>
#include <vector>

namespace
{
	using namespace dsp56k;

	constexpr TWord g_code = 0x100;
	constexpr TWord g_data = 0x40;	// r registers point around here

	struct Machine
	{
		DefaultMemoryValidator validator;
		Memory memory{validator, 0x1000, 0x1000, 0x800};
		PeripheralsNop x, y;
		DSP dsp{memory, &x, &y};

		Machine(const uint32_t _block, const bool _fixes)
		{
			dsp.setAccuracyFixes(_fixes);
			auto config = dsp.getJit().getConfig();
			config.linkJitBlocks = false;
			config.dynamicFastInterrupts = true;
			config.maxInstructionsPerBlock = _block;
			config.maxDoIterations = 1;
			dsp.getJit().setConfig(config);
		}
	};

	struct State
	{
		uint64_t a, b, x, y;
		TWord sr, r[8], n[8], mem[2][0x100];
	};

	State randomState(std::mt19937_64& _rng, const TWord _srHigh)
	{
		State s{};
		// accumulators are held left-aligned in 64 bits (the low 8 bits zero): any 56-bit value, or half the time one
		// whose extension byte only repeats the sign (no extension in use), so "normal" values dominate
		auto acc = [&] { return (_rng() & 0x00ffffffffffffffull) << 8; };
		auto accNormal = [&] { const int64_t v = static_cast<int64_t>(_rng()) >> 16; return static_cast<uint64_t>(v) << 8; };
		s.a = (_rng() & 1) ? acc() : accNormal();
		s.b = (_rng() & 1) ? acc() : accNormal();
		s.x = _rng() & 0xffffffffffffull;
		s.y = _rng() & 0xffffffffffffull;
		s.sr = _srHigh | static_cast<TWord>(_rng() & 0xff);
		for(uint32_t i = 0; i < 8; ++i)
		{
			s.r[i] = g_data + static_cast<TWord>(_rng() % 0x40);
			s.n[i] = static_cast<TWord>(_rng() % 8);
		}
		for(auto& area : s.mem)
			for(auto& w : area)
				w = static_cast<TWord>(_rng() & 0xffffff);
		return s;
	}

	void load(Machine& _m, const State& _s, const std::vector<TWord>& _code)
	{
		auto& r = _m.dsp.regs();
		r.a.var = _s.a;
		r.b.var = _s.b;
		r.x.var = _s.x;
		r.y.var = _s.y;
		for(uint32_t i = 0; i < 8; ++i)
		{
			r.r[i].var = _s.r[i];
			r.n[i].var = _s.n[i];
			r.m[i].var = 0xffffff;	// linear addressing
		}
		for(TWord i = 0; i < 0x100; ++i)
		{
			_m.memory.set(MemArea_X, i, _s.mem[0][i]);
			_m.memory.set(MemArea_Y, i, _s.mem[1][i]);
		}
		for(TWord i = 0; i < 48; ++i)
			_m.dsp.memWriteP(g_code + i, i < _code.size() ? _code[i] : 0);
		r.sr.var = _s.sr;
		_m.dsp.getJit().checkModeChange();
		_m.dsp.setPC(g_code);
	}

	std::string disasm(const TWord _w0, const TWord _w1)
	{
		static Opcodes opcodes;
		static Disassembler dis(opcodes);
		std::string out;
		dis.disassemble(out, _w0, _w1, 0, 0, g_code);
		return out;
	}

	bool startsWithSkipped(const std::string& _text)
	{
		static const char* const skip[] = {"dc ", "do ", "dor ", "rti", "rts", "jsr", "bsr", "enddo", "wait", "stop",
			"reset", "movec", "movem", "rep", "illegal", "jmp", "jcc", "jscc", "brk", "debug", "trap", "bra", "b", "j"};
		for(const auto* sk : skip)
		{
			const auto len = std::strlen(sk);
			// "b" and "j" alone stand for every branch and jump form; the bit operations bset/bclr/btst/bchg are kept
			if(len == 1)
			{
				if(_text.size() > 1 && _text[0] == sk[0] && _text.compare(0, 4, "bset") && _text.compare(0, 4, "bclr")
					&& _text.compare(0, 4, "btst") && _text.compare(0, 4, "bchg"))
					return true;
				continue;
			}
			if(_text.compare(0, len, sk) == 0)
				return true;
		}
		return false;
	}

	// The DSP56300 manual does not allow a parallel move to write the accumulator the ALU operation writes (for example
	// "add b,a y:(r0)+,a"): the result is undefined, so the JIT and the interpreter may differ there without either
	// being wrong. Read from the disassembly: mnemonic, ALU operands, then up to two moves, separated by spaces.
	bool movesIntoAluDestination(const std::string& _text)
	{
		std::vector<std::string> tokens;
		size_t pos = 0;
		while(pos < _text.size())
		{
			const auto start = _text.find_first_not_of(' ', pos);
			if(start == std::string::npos)
				break;
			const auto end = _text.find(' ', start);
			tokens.push_back(_text.substr(start, end == std::string::npos ? std::string::npos : end - start));
			pos = end == std::string::npos ? _text.size() : end;
		}
		if(tokens.size() < 3)
			return false;
		const auto lastOperand = [](const std::string& _t) { const auto c = _t.rfind(','); return c == std::string::npos ? _t : _t.substr(c + 1); };
		const auto aluDest = lastOperand(tokens[1]);
		if(aluDest != "a" && aluDest != "b")
			return false;
		for(size_t i = 2; i < tokens.size(); ++i)
		{
			const auto moveDest = lastOperand(tokens[i]);
			if(moveDest.empty() || moveDest.find(':') != std::string::npos)
				continue;	// a memory destination
			if(moveDest[0] == aluDest[0] || moveDest == "ab" || moveDest == "ba")
				return true;
		}
		return false;
	}

	struct Options
	{
		uint32_t trials = 500;
		uint32_t window = 0;
		bool fixes = true;
		bool quiet = false;
	};

	// Returns the number of instructions (or windows) that disagree.
	uint32_t run(const std::vector<TWord>& _words, const Options& _o)
	{
		std::mt19937_64 rng(1234);
		uint32_t bad = 0;
		uint32_t tested = 0;
		for(size_t i = 0; i < _words.size(); ++i)
		{
			const size_t span = _o.window ? _o.window : 1;
			bool skipIt = false;
			std::string texts;
			for(size_t k = 0; k < span && !skipIt; ++k)
			{
				if(i + k >= _words.size())
				{
					skipIt = true;
					break;
				}
				const auto tk = disasm(_words[i + k], i + k + 1 < _words.size() ? _words[i + k + 1] : 0);
				if(startsWithSkipped(tk) || movesIntoAluDestination(tk))
					skipIt = true;
				texts += (k ? " | " : "") + tk.substr(0, tk.find_last_not_of(' ') + 1);
			}
			if(skipIt)
				continue;
			++tested;
			const std::vector<TWord> code(_words.begin() + static_cast<std::ptrdiff_t>(i),
				_words.begin() + static_cast<std::ptrdiff_t>(std::min(_words.size(), i + span + 1)));

			uint32_t mismatches = 0;
			std::string first;
			auto jit = std::make_unique<Machine>(_o.window ? _o.window : 1, _o.fixes);
			auto reference = std::make_unique<Machine>(1, true);
			for(uint32_t t = 0; t < _o.trials; ++t)
			{
				const TWord srHigh = (t & 1) ? 0xc10000 : 0xc00000;
				const auto s = randomState(rng, srHigh);
				load(*jit, s, code);
				load(*reference, s, code);
				jit->dsp.exec();
				if(_o.window)
				{
					// step the reference, one instruction per block, to where the block stopped
					for(uint32_t k = 0; k < 3 * _o.window && reference->dsp.getPC().toWord() != jit->dsp.getPC().toWord(); ++k)
						reference->dsp.exec();
				}
				else
				{
					reference->dsp.execInterpreter();
				}

				const auto& rj = jit->dsp.regs();
				const auto& rr = reference->dsp.regs();
				char buf[512];
				std::string diff;
				auto cmp = [&](const char* _name, const uint64_t _j, const uint64_t _r)
				{
					if(_j == _r)
						return;
					std::snprintf(buf, sizeof(buf), " %s jit=%llx ref=%llx", _name, static_cast<unsigned long long>(_j),
						static_cast<unsigned long long>(_r));
					diff += buf;
				};
				cmp("a", rj.a.var, rr.a.var);
				cmp("b", rj.b.var, rr.b.var);
				cmp("x", rj.x.var, rr.x.var);
				cmp("y", rj.y.var, rr.y.var);
				cmp("sr", jit->dsp.getSR().var, reference->dsp.getSR().var);
				cmp("pc", rj.pc.var, rr.pc.var);
				for(uint32_t k = 0; k < 8; ++k)
				{
					char n[8];
					std::snprintf(n, sizeof(n), "r%u", k);
					cmp(n, rj.r[k].var, rr.r[k].var);
				}
				for(TWord k = 0; k < 0x100; ++k)
				{
					cmp("x:mem", jit->memory.get(MemArea_X, k), reference->memory.get(MemArea_X, k));
					cmp("y:mem", jit->memory.get(MemArea_Y, k), reference->memory.get(MemArea_Y, k));
				}
				if(!diff.empty())
				{
					if(!mismatches)
					{
						std::snprintf(buf, sizeof(buf), "   start: a=%llx b=%llx x=%llx y=%llx sr=%06x\n   diff:",
							static_cast<unsigned long long>(s.a), static_cast<unsigned long long>(s.b),
							static_cast<unsigned long long>(s.x), static_cast<unsigned long long>(s.y), s.sr);
						first = buf + diff;
					}
					++mismatches;
				}
			}
			if(mismatches)
			{
				++bad;
				std::printf("%06x  %-40s  %u/%u trials differ\n%s\n", _words[i], texts.c_str(), mismatches, _o.trials, first.c_str());
			}
		}
		if(!_o.quiet)
			std::printf("%u of %u tested (of %zu words) disagree\n", bad, tested, _words.size());
		return bad;
	}

	// Instructions where the JIT keeps lazy flags or cached registers, plus the forms the accuracy fixes touch.
	const char* const g_selftest[] = {
		"tgt x1,a", "tle x0,b", "tlt y0,a", "tge y1,b", "teq x0,a", "tne x1,b", "tcs x0,a", "tcc y0,b",
		"tgt x1,a r0,r1",
		"cmp x0,a", "cmp b,a", "cmpm x1,b", "cmpm b,a", "cmpm a,b", "cmpu x0,a",
		"asl a", "asr b", "lsl a", "lsr b", "asl #3,a,b", "asr #5,b,a",
		"add x0,a", "sub y1,b", "addl a,b", "addr b,a", "addr a,b", "subl a,b", "subr b,a", "subr a,b", "neg a", "abs b", "tst a", "rnd b", "clr a",
		"mac x0,y0,a", "mpy x1,y1,b", "macr -x0,y1,a",
		"move x:$10,a", "move y:$11,b", "move a,x:$12", "move b,y:$13", "move x:(r0)+,x0", "move y:(r1)-,y1",
		"add x0,a x:(r0)+,x1", "tfr a,b y:(r4)+,y0",
		"and x0,a", "or y1,b", "eor x1,a", "not b",
	};

	int selftest(const Options& _base)
	{
		Assembler assembler;
		uint32_t bad = 0;
		for(const uint32_t window : {0u, 2u, 3u})
		{
			std::vector<TWord> words;
			for(const auto* line : g_selftest)
			{
				const auto r = assembler.assemble(line);
				if(!r.success())
				{
					std::printf("selftest: cannot assemble \"%s\"\n", line);
					return 2;
				}
				for(uint32_t i = 0; i < r.wordCount; ++i)
					words.push_back(r.word[i]);
			}
			auto o = _base;
			o.window = window;
			o.trials = 200;
			o.quiet = true;
			const auto b = run(words, o);
			std::printf("selftest, %s: %u disagree\n", window ? ("blocks of " + std::to_string(window)).c_str() : "JIT against interpreter", b);
			bad += b;
		}
		return bad ? 1 : 0;
	}
}

int main(int _argc, char** _argv)
{
	Logging::setLogFunc([](const std::string&) {});

	Options o;
	bool selftestMode = false;
	std::vector<uint32_t> numbers;
	for(int i = 1; i < _argc; ++i)
	{
		if(!std::strcmp(_argv[i], "--selftest"))
			selftestMode = true;
		else if(!std::strcmp(_argv[i], "--legacy"))
			o.fixes = false;
		else
			numbers.push_back(static_cast<uint32_t>(std::strtoul(_argv[i], nullptr, 10)));
	}
	if(numbers.size() > 0)
		o.trials = numbers[0];
	if(numbers.size() > 1)
		o.window = numbers[1];

	if(selftestMode)
		return selftest(o);

	std::vector<TWord> words;
	std::string line;
	while(std::getline(std::cin, line))
	{
		if(!line.empty())
			words.push_back(static_cast<TWord>(std::stoul(line, nullptr, 16)));
	}
	return run(words, o) ? 1 : 0;
}
