// 0.8 (WP3): the MIDI monitor's counts (mdMidiMonitor.h): a scripted buffer lands in the right direction, type and
// channel; the hook path (Monitor::onEvent) allocates nothing; the message thread reads while the audio thread writes
// and loses no count; the log line and its pacing. Pure: no JUCE, no ROM.
#include "mdMidiMonitor.h"

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <new>
#include <string>
#include <thread>
#include <vector>

namespace allocationProbe
{
	thread_local bool enabled = false;
	thread_local std::size_t allocations = 0;
}

// This executable owns its allocation functions so a thread-local probe can see every allocation the hook path makes.
void* operator new(const std::size_t _size)
{
	if(allocationProbe::enabled)
		++allocationProbe::allocations;
	if(auto* const p = std::malloc(_size == 0 ? 1 : _size))
		return p;
	throw std::bad_alloc();
}
void* operator new[](const std::size_t _size) { return ::operator new(_size); }
void operator delete(void* const _p) noexcept { std::free(_p); }
void operator delete[](void* const _p) noexcept { std::free(_p); }
void operator delete(void* const _p, std::size_t) noexcept { std::free(_p); }
void operator delete[](void* const _p, std::size_t) noexcept { std::free(_p); }

namespace
{
	int g_failures = 0;
	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}
	using namespace mdJucePlugin::midiMonitor;
}

int main()
{
	std::printf("mdMidiMonitorTest\n");

	// the types and channels by status byte
	check(typeOf(0x90, false) == Type::Note && typeOf(0x83, false) == Type::Note, "note on and note off are notes");
	check(typeOf(0xb5, false) == Type::Cc && typeOf(0xc2, false) == Type::ProgramChange, "CC and program change");
	check(typeOf(0xa0, false) == Type::Other && typeOf(0xd0, false) == Type::Other && typeOf(0xe7, false) == Type::Other, "poly pressure, aftertouch, pitch bend are other");
	check(typeOf(0xf8, false) == Type::Clock, "timing clock");
	check(typeOf(0xfa, false) == Type::Transport && typeOf(0xfb, false) == Type::Transport && typeOf(0xfc, false) == Type::Transport && typeOf(0xf2, false) == Type::Transport, "start, continue, stop, song position are transport");
	check(typeOf(0xf0, false) == Type::SysEx && typeOf(0x00, true) == Type::SysEx, "SysEx by its start byte or by its bytes");
	check(typeOf(0xfe, false) == Type::Other && typeOf(0xff, false) == Type::Other && typeOf(0x40, false) == Type::Other, "active sensing, reset, a data byte are other");
	check(channelOf(0x90, false) == 0 && channelOf(0xbf, false) == 15 && channelOf(0xf8, false) == -1 && channelOf(0xf0, true) == -1 && channelOf(0x20, false) == -1, "a channel message has its channel, the rest none");

	// a scripted buffer
	Monitor m;
	struct Ev { Direction d; uint8_t status; bool sysex; };
	const std::vector<Ev> script = {
		{Direction::InHost, 0x90, false}, {Direction::InHost, 0x80, false}, {Direction::InHost, 0xb0, false},
		{Direction::InHost, 0xf8, false}, {Direction::InHost, 0xf0, true},
		{Direction::InFirmware, 0x90, false}, {Direction::InFirmware, 0x95, false}, {Direction::InFirmware, 0xc1, false},
		{Direction::OutMachine, 0xf8, false}, {Direction::OutMachine, 0xf8, false}, {Direction::OutMachine, 0xfa, false}, {Direction::OutMachine, 0xfc, false},
		{Direction::OutHost, 0xe3, false}, {Direction::OutHost, 0xf0, true},
	};
	// the hook path: no allocation
	allocationProbe::allocations = 0;
	allocationProbe::enabled = true;
	for(const auto& e : script)
		m.onEvent(e.d, e.status, e.sysex);
	const auto c0 = m.take();
	allocationProbe::enabled = false;
	check(allocationProbe::allocations == 0, "the hook path allocates nothing (" + std::to_string(allocationProbe::allocations) + " allocations for " + std::to_string(script.size()) + " events)");

	const auto& c = c0;
	check(c.total(Direction::InHost) == 5 && c.total(Direction::InFirmware) == 3 && c.total(Direction::OutMachine) == 4 && c.total(Direction::OutHost) == 2, "totals by direction: 5, 3, 4, 2");
	check(c.count(Direction::InHost, Type::Note) == 2 && c.count(Direction::InHost, Type::Cc) == 1 && c.count(Direction::InHost, Type::Clock) == 1 && c.count(Direction::InHost, Type::SysEx) == 1, "in from the host: 2 notes, a CC, a clock, a SysEx");
	check(c.count(Direction::InFirmware, Type::Note) == 2 && c.count(Direction::InFirmware, Type::ProgramChange) == 1, "in to the firmware: 2 notes, a program change");
	check(c.count(Direction::OutMachine, Type::Clock) == 2 && c.count(Direction::OutMachine, Type::Transport) == 2, "out of the machine: 2 clocks, 2 transport");
	check(c.count(Direction::OutHost, Type::Other) == 1 && c.count(Direction::OutHost, Type::SysEx) == 1, "out to the host: a pitch bend (other), a SysEx");
	check(c.channel[static_cast<size_t>(Direction::InHost)][0] == 3 && c.channel[static_cast<size_t>(Direction::InFirmware)][0] == 1
		&& c.channel[static_cast<size_t>(Direction::InFirmware)][5] == 1 && c.channel[static_cast<size_t>(Direction::InFirmware)][1] == 1
		&& c.channel[static_cast<size_t>(Direction::OutHost)][3] == 1, "channels: the host's three on channel 1, the firmware's on 1, 6 and 2, the pitch bend on 4");
	uint64_t chanSum = 0;
	for(size_t d = 0; d < g_directions; ++d)
		for(const auto n : c.channel[d])
			chanSum += n;
	check(chanSum == 3 + 3 + 0 + 1, "the system messages and SysEx have no channel (" + std::to_string(chanSum) + " channel messages)");
	check(c.fingerprint() == script.size(), "the fingerprint grows with every count");
	Counts withDrops = c;
	withDrops.dropped.scheduledOverflow = 2;
	withDrops.dropped.allocationFallback = 1;
	check(withDrops.fingerprint() == script.size() + 3, "and with every drop");

	// the message thread reads while the audio thread writes: counts only grow, none is lost
	{
		Monitor live;
		constexpr uint64_t perType = 200000;
		std::atomic<bool> go{false};
		std::thread writer([&]
		{
			while(!go.load())
			{
			}
			for(uint64_t i = 0; i < perType; ++i)
			{
				live.onEvent(Direction::InHost, 0x90, false);
				live.onEvent(Direction::OutMachine, 0xb2, false);
				live.onEvent(Direction::OutHost, 0xf8, false);
			}
		});
		go = true;
		uint64_t last = 0;
		bool monotone = true;
		int reads = 0;
		while(last < perType)
		{
			const auto r = live.take();
			const auto n = r.count(Direction::InHost, Type::Note);
			monotone = monotone && n >= last && n <= perType;
			last = n;
			++reads;
		}
		writer.join();
		const auto done = live.take();
		check(monotone && reads > 1, "a reader on another thread only ever sees counts grow (" + std::to_string(reads) + " reads)");
		check(done.count(Direction::InHost, Type::Note) == perType && done.count(Direction::OutMachine, Type::Cc) == perType && done.count(Direction::OutHost, Type::Clock) == perType
			&& done.channel[static_cast<size_t>(Direction::OutMachine)][2] == perType, "and the writer's counts are all there afterwards");
		// two writers (the audio thread and a port's thread) lose nothing either
		Monitor two;
		std::thread a([&] { for(uint64_t i = 0; i < perType; ++i) two.onEvent(Direction::InHost, 0x91, false); });
		std::thread b([&] { for(uint64_t i = 0; i < perType; ++i) two.onEvent(Direction::InHost, 0x91, false); });
		a.join();
		b.join();
		check(two.take().count(Direction::InHost, Type::Note) == 2 * perType, "two writing threads lose no count");
	}

	// the log line and its pacing
	{
		const auto line = logLine(c0);
		std::printf("    %s\n", line.c_str());
		check(line.rfind("midi: in host=5", 0) == 0 && line.find(" out machine=4") != std::string::npos && line.find(" dropped sched=0") != std::string::npos, "the line names in, out and dropped");
		check(line.find("note=2") != std::string::npos && line.find("clock=2") != std::string::npos, "and the kinds that counted");
		LogPacer p;
		check(!p.due(0, 0), "nothing counted: no line");
		check(p.due(1000, 5), "the first change is logged at once");
		check(!p.due(5000, 6), "a change within 10 s waits");
		check(!p.due(11000, 5), "an unchanged count is not logged");
		check(p.due(11000, 6), "a change after 10 s is logged");
		check(!p.due(30000, 6), "and then quiet again");
	}

	std::printf(g_failures ? "FAILED: %d\n" : "all ok\n", g_failures);
	return g_failures ? 1 : 0;
}
