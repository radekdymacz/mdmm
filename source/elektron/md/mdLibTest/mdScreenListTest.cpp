// B-133: the screen list repair (mdLib/mdscreenlist.h) with a fake memory, no ROM.
#include "mdLib/mdscreenlist.h"

#include <cstdio>
#include <map>

namespace
{
	int g_failures = 0;
	void check(const bool _ok, const char* _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what);
		g_failures += !_ok;
	}
}

int main()
{
	using md::ScreenListFix;
	std::map<uint32_t, uint32_t> mem;
	const auto rd = [&](const uint32_t _a) { return mem[_a]; };
	const auto wr = [&](const uint32_t _a, const uint32_t _v) { mem[_a] = _v; };

	// the main screen: head g_mainFirst, tail g_mainLast: left alone for as long as you like
	{
		ScreenListFix f;
		mem[ScreenListFix::g_headAddress] = ScreenListFix::g_mainFirst;
		mem[ScreenListFix::g_tailAddress] = ScreenListFix::g_mainLast;
		for(int i = 0; i < 1000; ++i)
			f.update(64, rd, wr);
		check(f.fixes() == 0 && mem[ScreenListFix::g_headAddress] == ScreenListFix::g_mainFirst, "a good list is never written");
	}
	// the receiving screen's list (its own node as the tail): left alone
	{
		ScreenListFix f;
		mem[ScreenListFix::g_headAddress] = ScreenListFix::g_mainLast;
		mem[ScreenListFix::g_tailAddress] = 0x28153e;
		for(int i = 0; i < 1000; ++i)
			f.update(64, rd, wr);
		check(f.fixes() == 0 && mem[ScreenListFix::g_headAddress] == ScreenListFix::g_mainLast, "the receiving screen's list is left alone");
	}
	// what the OS leaves after the receiving screen: one node, g_mainLast; put right after a hold
	{
		ScreenListFix f;
		mem[ScreenListFix::g_headAddress] = ScreenListFix::g_mainLast;
		mem[ScreenListFix::g_tailAddress] = ScreenListFix::g_mainLast;
		bool early = false;
		for(uint32_t t = 0; t + 64 < ScreenListFix::g_holdFrames; t += 64)
			early |= f.update(64, rd, wr);
		check(!early && mem[ScreenListFix::g_headAddress] == ScreenListFix::g_mainLast, "not at once: the OS may be in the middle of its swap");
		bool fixed = false;
		for(int i = 0; i < 10 && !fixed; ++i)
			fixed = f.update(64, rd, wr);
		check(fixed && mem[ScreenListFix::g_headAddress] == ScreenListFix::g_mainFirst && f.fixes() == 1, "after the hold the head is the first node again");
		check(!f.update(4800, rd, wr) && f.fixes() == 1, "and the list is left alone from then on");
	}
	// a swap that ends within the hold resets it
	{
		ScreenListFix f;
		mem[ScreenListFix::g_headAddress] = ScreenListFix::g_mainLast;
		mem[ScreenListFix::g_tailAddress] = ScreenListFix::g_mainLast;
		f.update(4000, rd, wr);
		mem[ScreenListFix::g_tailAddress] = 0x28153e;
		f.update(64, rd, wr);
		mem[ScreenListFix::g_tailAddress] = ScreenListFix::g_mainLast;
		f.update(4000, rd, wr);
		check(f.fixes() == 0, "the hold starts again after the list changed");
	}
	std::printf("mdScreenListTest: %s (%d failure(s))\n", g_failures ? "FAIL" : "PASS", g_failures);
	return g_failures ? 1 : 0;
}
