// I-070 (AUTO RECEIVE, doc/release/0.9/mm-auto-receive.md): which host SysEx is a Monomachine user-data dump, and the
// inbox the audio thread hands them to the session through (mdHostDumps.h). Pure: no JUCE, no ROM.
#include "mdHostDumps.h"

#include <cstdio>
#include <string>
#include <thread>
#include <vector>

namespace
{
	int g_failures = 0;
	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}
	using Bytes = std::vector<uint8_t>;
	using namespace mdJucePlugin;

	Bytes dump(const uint8_t _product, const uint8_t _id, const size_t _payload = 8, const uint8_t _fill = 0x11)
	{
		Bytes b{0xf0, 0x00, 0x20, 0x3c, _product, 0x00, _id};
		b.insert(b.end(), _payload, _fill);
		b.push_back(0xf7);
		return b;
	}
	bool is(const Bytes& _b) { return isMmUserDump(_b.data(), _b.size()); }
}

int main()
{
	std::printf("mdHostDumpsTest\n");
	check(is(dump(0x03, 0x50)) && is(dump(0x03, 0x52)) && is(dump(0x03, 0x67)) && is(dump(0x03, 0x69)),
		"a Monomachine global, kit, pattern and song dump");
	check(!is(dump(0x03, 0x5d)) && !is(dump(0x03, 0x5e)) && !is(dump(0x03, 0x53)) && !is(dump(0x03, 0x68)),
		"a waveform dump or request, a kit or song request: not one (they go raw)");
	check(!is(dump(0x02, 0x52)) && !is(dump(0x02, 0x67)), "a Machinedrum kit or pattern dump: not one");
	auto open = dump(0x03, 0x52);
	open.pop_back();
	check(!is(open), "no F7 at the end: not one");
	check(!is(Bytes{0xf0, 0x00, 0x20, 0x3c, 0x03, 0x00, 0x52, 0xf7}), "too short to hold anything: not one");
	auto other = dump(0x03, 0x52);
	other[2] = 0x21;
	check(!is(other) && !isMmUserDump(nullptr, 0), "another maker, or nothing: not one");

	{
		HostDumpInbox in(64);
		Bytes out;
		check(in.empty() && !in.pop(out), "an empty inbox gives nothing");
		const auto a = dump(0x03, 0x52, 10, 0x21), b = dump(0x03, 0x67, 20, 0x22);
		check(in.push(a.data(), a.size()) && in.push(b.data(), b.size()), "two dumps fit (18 + 28 bytes and their lengths in 64)");
		const auto c = dump(0x03, 0x69, 4, 0x23);
		check(!in.push(c.data(), c.size()), "a third that does not fit is refused (the caller sends it raw)");
		check(in.pop(out) && out == a && in.pop(out) && out == b && !in.pop(out) && in.empty(), "they come out whole, in order");
		// round the end of the ring several times
		bool same = true;
		for(int i = 0; i < 50; ++i)
		{
			const auto d = dump(0x03, 0x52, static_cast<size_t>(5 + i % 17), static_cast<uint8_t>(i));
			same = same && in.push(d.data(), d.size()) && in.pop(out) && out == d;
		}
		check(same, "messages that wrap round the ring's end come out whole");
		check(!in.push(a.data(), 0), "an empty message is refused");
	}

	{
		// one producer, one consumer on two threads: every message arrives once, in order, whole
		HostDumpInbox in(4096);
		constexpr int n = 5000;
		std::thread producer([&]
		{
			for(int i = 0; i < n; ++i)
			{
				const auto d = dump(0x03, 0x67, static_cast<size_t>(1 + i % 300), static_cast<uint8_t>(i & 0x7f));
				while(!in.push(d.data(), d.size()))
					std::this_thread::yield();
			}
		});
		int got = 0;
		bool ok = true;
		Bytes out;
		while(got < n)
		{
			if(!in.pop(out))
			{
				std::this_thread::yield();
				continue;
			}
			ok = ok && out == dump(0x03, 0x67, static_cast<size_t>(1 + got % 300), static_cast<uint8_t>(got & 0x7f));
			++got;
		}
		producer.join();
		check(ok && got == n && in.empty(), "5000 messages across two threads arrive whole and in order");
	}

	std::printf("%s (%d failures)\n", g_failures ? "FAIL" : "PASS", g_failures);
	return g_failures ? 1 : 0;
}
