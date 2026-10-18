// 0.8 (MIDI Learn L1, doc/midilearn/DESIGN-learn-0.8.md "Tests" 1, 2 and 8's value half): the realtime router on its
// own. The values of the three modes and Inv; override (a mapped CC is consumed, so it never reaches the firmware),
// any channel, chains; learning captures CCs on the audio thread and the mapping appears only when the message thread
// drains and runs the pure learn step; the ring's bound; the touched bits; the table refreshed at block start only; no
// allocation on the audio path. Pure: no JUCE (a stand-in Parameter), no ROM.
#include "mdLearnRouter.h"

#include "deskCore/deskLearn.h"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <new>
#include <optional>
#include <string>
#include <thread>
#include <vector>

namespace allocationProbe
{
	thread_local bool enabled = false;
	thread_local std::size_t allocations = 0;
}

// This executable owns its allocation functions so a thread-local probe can see every allocation the audio path makes.
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

// The stand-in for the plug-in parameter: a value in a range, moved by the test's applier. This executable never links
// jucePluginLib, so the name is free here.
namespace pluginLib
{
	class Parameter
	{
	public:
		int value = 0;
		int min = 0;
		int max = 127;
		int sets = 0;
	};
}

namespace
{
	using namespace mdJucePlugin;
	using deskCore::LearnMode;

	int g_failures = 0;
	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}

	bool apply(pluginLib::Parameter& _p, const LearnTarget& _t, const uint8_t _value)
	{
		const auto next = learnedValue(_t.mode, _t.invert != 0, _value, _p.value, _p.min, _p.max);
		if(next == _p.value)
			return false;
		_p.value = next;
		++_p.sets;
		return true;
	}

	LearnTarget target(pluginLib::Parameter& _p, const LearnMode _mode, const bool _invert, const uint8_t _mapping)
	{
		LearnTarget t;
		t.param = &_p;
		t.mode = static_cast<uint8_t>(_mode);
		t.invert = _invert ? 1 : 0;
		t.mapping = _mapping;
		return t;
	}

	constexpr auto Abs = static_cast<uint8_t>(LearnMode::Absolute);
	constexpr auto Signed = static_cast<uint8_t>(LearnMode::RelativeSigned);
	constexpr auto Offset = static_cast<uint8_t>(LearnMode::RelativeOffset);

	void values()
	{
		std::printf("values\n");
		check(learnedValue(Abs, false, 0, 50, 0, 127) == 0 && learnedValue(Abs, false, 127, 50, 0, 127) == 127 && learnedValue(Abs, false, 64, 0, 0, 127) == 64, "absolute: 0..127 is the range 0..127");
		check(learnedValue(Abs, true, 0, 50, 0, 127) == 127 && learnedValue(Abs, true, 127, 50, 0, 127) == 0, "absolute inverted: 127..0");
		check(learnedValue(Abs, false, 0, 5, -64, 63) == -64 && learnedValue(Abs, false, 127, 5, -64, 63) == 63, "absolute over a signed range");
		check(learnedValue(Abs, false, 64, 0, 0, 3) == 2 && learnedValue(Abs, false, 127, 0, 0, 3) == 3 && learnedValue(Abs, false, 21, 0, 0, 3) == 0, "absolute over a short range rounds to the nearest step");
		check(learnedValue(Abs, false, 127, 0, 0, 0) == 0, "absolute over a one-value range");
		check(learnedValue(Signed, false, 1, 10, 0, 127) == 11 && learnedValue(Signed, false, 127, 10, 0, 127) == 9, "relative signed: 1 up, 127 down");
		check(learnedValue(Signed, false, 5, 10, 0, 127) == 11 && learnedValue(Signed, false, 120, 10, 0, 127) == 9, "relative signed: a faster turn is still one step");
		check(learnedValue(Signed, false, 0, 10, 0, 127) == 10 && learnedValue(Signed, false, 64, 10, 0, 127) == 10, "relative signed: 0 and 64 do nothing");
		check(learnedValue(Signed, true, 1, 10, 0, 127) == 9 && learnedValue(Signed, true, 127, 10, 0, 127) == 11, "relative signed inverted steps the other way");
		check(learnedValue(Signed, false, 1, 127, 0, 127) == 127 && learnedValue(Signed, false, 127, 0, 0, 127) == 0, "relative signed stays in the range");
		check(learnedValue(Offset, false, 65, 10, 0, 127) == 11 && learnedValue(Offset, false, 63, 10, 0, 127) == 9 && learnedValue(Offset, false, 64, 10, 0, 127) == 10, "relative offset: 65 up, 63 down, 64 nothing");
		check(learnedValue(Offset, true, 65, 10, 0, 127) == 9 && learnedValue(Offset, true, 63, 10, 0, 127) == 11, "relative offset inverted");
		check(learnedValue(Offset, false, 63, -64, -64, 63) == -64 && learnedValue(Offset, false, 65, 63, -64, 63) == 63, "relative offset stays in the range");
	}

	void routing()
	{
		std::printf("routing\n");
		pluginLib::Parameter a, b, c, d;
		LearnRouter router(&apply);
		LearnTable t;
		t.generation = 1;
		t.add(0, 21, target(a, LearnMode::Absolute, false, 0));				// ch 1, CC 21 -> a
		t.add(0, 21, target(b, LearnMode::Absolute, true, 1));				// ch 1, CC 21 -> b inverted (a chain)
		t.add(LearnTable::AnyChannel, 22, target(c, LearnMode::Absolute, false, 2));	// any channel CC 22 -> c
		t.add(3, 22, target(d, LearnMode::RelativeSigned, false, 70));		// ch 4, CC 22 -> d, also the any-channel c
		router.publish(t);

		router.beginBlock();
		check(router.table().generation == 1 && router.table().count == 4, "the published table is the block's copy");

		check(router.translate(0xb0, 21, 100) && a.value == 100 && b.value == 27, "a mapped CC is consumed and moves both targets of its chain (Inv: 127 - v)");
		check(!router.translate(0xb1, 21, 5) && a.value == 100, "the same CC on another channel is not consumed and moves nothing");
		check(router.translate(0xb7, 22, 90) && c.value == 90 && d.value == 0, "an any-channel mapping takes its CC on every channel");
		check(router.translate(0xb3, 22, 1) && c.value == 1 && d.value == 1, "a channel mapping and an any-channel mapping of one CC both move");
		check(!router.translate(0xb0, 23, 5), "an unmapped CC is not consumed (it goes to the firmware)");
		check(!router.translate(0x90, 21, 100) && !router.translate(0x80, 21, 0) && !router.translate(0xe0, 21, 64) && !router.translate(0xf8, 0, 0), "notes, pitch bend and clock are never consumed");
		check(router.translate(0xb0, 21, 100), "a mapped CC that changes nothing is still consumed (the mapping owns its message)");

		const auto touched = router.takeTouched();
		check(touched[0] == 0b111 && touched[1] == (uint64_t{1} << (70 - 64)), "the touched bits name the moved mappings");
		const auto again = router.takeTouched();
		check(again[0] == 0 && again[1] == 0, "taking the touched bits clears them");
		check(router.counts().applied == 5, "applied counts each target that moved");

		// a new table only acts from the next block
		LearnTable empty;
		empty.generation = 2;
		router.publish(empty);
		check(router.translate(0xb0, 21, 5) && a.value == 5, "until the next block the old copy is used");
		router.beginBlock();
		check(router.table().generation == 2 && !router.translate(0xb0, 21, 7) && a.value == 5, "after the block start the new table applies: the CC goes to the firmware again");

		// a table refresh is only taken when a write happened
		router.beginBlock();
		check(router.table().generation == 2, "no write: the copy stays");

		// a target without a parameter is consumed but moves nothing
		LearnTable unresolved;
		unresolved.add(0, 30, LearnTarget{});
		router.publish(unresolved);
		router.beginBlock();
		check(router.translate(0xb0, 30, 64) && router.counts().applied == 7, "a target without a parameter is consumed, nothing applied");
	}

	void tableBuilder()
	{
		std::printf("table\n");
		pluginLib::Parameter p;
		LearnTable t;
		bool ok = true;
		for(size_t i = 0; i < LearnTable::MaxTargets; ++i)
			ok = ok && t.add(i % 17, static_cast<uint8_t>(i), target(p, LearnMode::Absolute, false, static_cast<uint8_t>(i)));
		check(ok && t.count == LearnTable::MaxTargets, "128 targets fit");
		check(!t.add(0, 1, target(p, LearnMode::Absolute, false, 0)) && t.count == LearnTable::MaxTargets, "the 129th is refused");
		LearnTable u;
		check(!u.add(17, 1, LearnTarget{}) && !u.add(0, 128, LearnTarget{}) && u.count == 0, "a channel past any-channel or a CC past 127 is refused");
	}

	void learning()
	{
		std::printf("learning\n");
		pluginLib::Parameter a;
		LearnRouter router(&apply);
		LearnTable t;
		t.add(0, 21, target(a, LearnMode::Absolute, false, 0));
		router.publish(t);

		// The audio thread is a thread of its own; the learn step runs only where the ring is drained.
		std::atomic<int> stepsOnAudioThread{0};
		router.setLearning(true);
		std::thread audio([&]
		{
			router.beginBlock();
			const bool cc1 = router.translate(0xb2, 40, 10);
			const bool note = router.translate(0x92, 36, 100);
			const bool mapped = router.translate(0xb0, 21, 99);			// mapped, but learning takes it
			const bool allOff = router.translate(0xb0, 123, 0);			// a channel mode message passes
			const bool cc2 = router.translate(0xb2, 40, 90);
			if(!(cc1 && !note && mapped && !allOff && cc2))
				stepsOnAudioThread.store(-1);
		});
		audio.join();
		check(stepsOnAudioThread.load() == 0, "while learning CCs are consumed; notes and channel mode messages pass");
		check(a.value == 0, "a mapped CC while learning is captured, not applied");

		deskCore::LearnCapture capture;
		capture.target = deskCore::LearnRef{2, -1, 5};
		std::optional<deskCore::LearnMapping> learned;
		const auto mainThread = std::this_thread::get_id();
		bool allOnMain = true;
		std::vector<uint32_t> seen;
		router.drainCaptured([&](const uint8_t _s, const uint8_t _cc, const uint8_t _v)
		{
			allOnMain = allOnMain && std::this_thread::get_id() == mainThread;
			seen.push_back(static_cast<uint32_t>(_s) << 16 | static_cast<uint32_t>(_cc) << 8 | _v);
			if(learned)
				return;
			auto step = deskCore::learnStep(capture, _s, _cc, _v);
			capture = step.next;
			learned = step.learned;
		});
		check(seen.size() == 3 && seen[0] == (0xb2u << 16 | 40u << 8 | 10u) && seen[1] == (0xb0u << 16 | 21u << 8 | 99u) && seen[2] == (0xb2u << 16 | 40u << 8 | 90u), "the ring gives the captured CCs in order");
		check(allOnMain && learned && learned->ch == 2 && learned->cc == 40 && learned->at == (deskCore::LearnRef{2, -1, 5}), "the mapping is learned on the message thread, from the channel and CC that came first");
		check(router.counts().captured == 3 && router.counts().capturedDropped == 0, "the capture counts");

		// bounded: what does not fit is dropped and counted, still consumed
		router.beginBlock();
		bool allConsumed = true;
		for(int i = 0; i < 300; ++i)
			allConsumed = router.translate(0xb0, 1, static_cast<uint8_t>(i & 0x7f)) && allConsumed;
		size_t drained = 0;
		router.drainCaptured([&](uint8_t, uint8_t, uint8_t) { ++drained; });
		check(allConsumed && drained == LearnRouter::CaptureCapacity && router.counts().capturedDropped == 300 - LearnRouter::CaptureCapacity, "a full ring drops and counts the rest");

		// switching on again empties what an earlier learn left
		router.translate(0xb0, 1, 1);
		router.setLearning(false);
		router.setLearning(true);
		drained = 0;
		router.drainCaptured([&](uint8_t, uint8_t, uint8_t) { ++drained; });
		check(drained == 0, "learning switched on starts with an empty ring");

		router.setLearning(false);
		check(router.translate(0xb0, 21, 99) && a.value == 99, "learning off: the mapping applies again");
	}

	void threads()
	{
		std::printf("threads\n");
		pluginLib::Parameter a;
		LearnRouter router(&apply);
		LearnTable t;
		t.add(0, 21, target(a, LearnMode::Absolute, false, 0));
		router.publish(t);
		check(!router.translate(0xb0, 21, 5) && a.value == 0, "before any block start nothing is translated");
		router.beginBlock();
		bool other = true;
		std::thread([&] { other = router.translate(0xb0, 21, 5); }).join();
		check(!other && a.value == 0 && router.counts().notOnAudioThread == 2, "a CC from another thread passes on untouched and is counted");
	}

	void noAllocation()
	{
		std::printf("allocation\n");
		pluginLib::Parameter a, b;
		LearnRouter router(&apply);
		LearnTable t;
		t.add(0, 21, target(a, LearnMode::Absolute, false, 0));
		t.add(LearnTable::AnyChannel, 22, target(b, LearnMode::RelativeOffset, true, 1));
		router.publish(t);

		allocationProbe::allocations = 0;
		allocationProbe::enabled = true;
		router.beginBlock();										// a refresh (a write happened)
		router.translate(0xb0, 21, 64);								// mapped
		router.translate(0xb5, 22, 63);								// any channel
		router.translate(0xb0, 50, 1);								// unmapped
		router.translate(0x90, 36, 100);							// a note
		router.beginBlock();										// no write: no refresh
		allocationProbe::enabled = false;
		router.setLearning(true);
		allocationProbe::enabled = true;
		router.beginBlock();
		for(int i = 0; i < 400; ++i)								// learning, past the ring's end
			router.translate(0xb0, 21, static_cast<uint8_t>(i & 0x7f));
		allocationProbe::enabled = false;
		check(allocationProbe::allocations == 0, "beginBlock and translate allocate nothing (mapped, unmapped, learning, a full ring)");
	}

	// B-169: a CC for a global target is consumed and handed to the message thread (no parameter, no lock, no allocation)
	void globals()
	{
		std::printf("globals\n");
		pluginLib::Parameter a;
		LearnRouter router(&apply);
		// the builder: a global mapping needs no parameter, an id the model does not have is left out
		std::vector<deskCore::LearnMapping> list;
		deskCore::LearnMapping m;
		m.ch = 2;
		m.cc = 70;
		m.at = deskCore::LearnRef::global(3);
		m.mode = LearnMode::RelativeSigned;
		m.invert = true;
		list.push_back(m);
		m.cc = 71;
		m.at = deskCore::LearnRef::global(40);
		list.push_back(m);
		m.cc = 72;
		m.at = {1, -1, 5};
		list.push_back(m);
		std::vector<pluginLib::Parameter*> by;
		const auto table = buildLearnTable(list, [&](const deskCore::LearnRef&) { return &a; }, 1, &by, 8);
		check(table.count == 2 && table.targets[0].global == 3 && table.targets[0].param == nullptr && table.targets[1].global == -1 && table.targets[1].param == &a,
			"the table holds the global (by id, no parameter) and the track target, not the id past the model's count");
		check(by.size() == 3 && by[0] == nullptr && by[1] == nullptr && by[2] == &a, "the host's notification list names parameters only");

		router.publish(table);
		router.beginBlock();
		allocationProbe::allocations = 0;
		allocationProbe::enabled = true;
		const bool consumed = router.translate(0xb2, 70, 127);
		allocationProbe::enabled = false;
		check(consumed && allocationProbe::allocations == 0, "a mapped CC of a global target is consumed, no allocation");
		check(!router.translate(0xb3, 70, 127), "on another channel it is not");
		router.translate(0xb2, 70, 1);
		std::vector<deskCore::LearnGlobalEvent> events;
		router.drainGlobals([&](const deskCore::LearnGlobalEvent& _e) { events.push_back(_e); });
		check(events.size() == 2 && events[0].id == 3 && events[0].value == 127 && events[0].invert && events[0].mode == static_cast<uint8_t>(LearnMode::RelativeSigned)
			&& events[1].value == 1, "the message thread gets the events in order with id, mode, inversion and value");
		events.clear();
		router.drainGlobals([&](const deskCore::LearnGlobalEvent& _e) { events.push_back(_e); });
		check(events.empty() && router.counts().globalQueued == 2 && router.counts().globalDropped == 0, "drained once; counted");
		check(router.takeTouched()[0] == 0, "a global moves no parameter, so no touched bit");

		// a full ring drops and counts, never blocks
		for(size_t i = 0; i < LearnRouter::GlobalCapacity + 10; ++i)
			router.translate(0xb2, 70, 1);
		check(router.counts().globalDropped == 10, "a full ring drops the newest and counts it");
		router.drainGlobals([](const deskCore::LearnGlobalEvent&) {});

		// part 2: ids above 255 (the Monomachine's list has 591) cross the ring whole
		{
			LearnRouter big(&apply);
			std::vector<deskCore::LearnMapping> bl;
			deskCore::LearnMapping x;
			x.cc = 10;
			x.at = deskCore::LearnRef::global(590);
			x.mode = LearnMode::RelativeOffset;
			bl.push_back(x);
			x.cc = 11;
			x.at = deskCore::LearnRef::global(300);
			x.invert = true;
			bl.push_back(x);
			big.publish(buildLearnTable(bl, [&](const deskCore::LearnRef&) { return &a; }, 1, nullptr, 591));
			big.beginBlock();
			big.translate(0xb0, 10, 100);
			big.translate(0xb0, 11, 5);
			std::vector<deskCore::LearnGlobalEvent> ev;
			big.drainGlobals([&](const deskCore::LearnGlobalEvent& _e) { ev.push_back(_e); });
			check(ev.size() == 2 && ev[0].id == 590 && ev[0].value == 100 && ev[0].mode == static_cast<uint8_t>(LearnMode::RelativeOffset) && !ev[0].invert
				&& ev[1].id == 300 && ev[1].value == 5 && ev[1].invert, "a global id above 255 crosses the ring with its mode, inversion and value");
		}
	}

	// L2: the table from the setup's mappings; the empty table and the block boundary before parameters are freed; the
	// port CCs counted
	void sessionSide()
	{
		std::printf("session side\n");
		pluginLib::Parameter a, b;
		auto mapping = [](const uint8_t _ch, const uint8_t _cc, const int _t, const int _i)
		{
			deskCore::LearnMapping m;
			m.ch = _ch;
			m.cc = _cc;
			m.at = {_t, -1, _i};
			return m;
		};
		const std::vector<deskCore::LearnMapping> list{mapping(0, 21, 0, 0), mapping(255, 21, 1, 0), mapping(0, 22, 9, 0), mapping(3, 21, 0, 1)};
		std::vector<pluginLib::Parameter*> by;
		const auto table = buildLearnTable(list, [&](const deskCore::LearnRef& _r) -> pluginLib::Parameter*
		{
			return _r.t == 9 ? nullptr : _r.i == 0 ? &a : &b;
		}, 7, &by);
		check(table.generation == 7 && table.count == 3, "the table has the mappings whose parameter exists, in order");
		check(by.size() == 4 && by[0] == &a && by[1] == &a && by[2] == nullptr && by[3] == &b, "and each mapping's parameter by its index");
		check(table.head[0][21] != LearnTable::None && table.targets[table.head[0][21]].mapping == 0
			&& table.head[LearnTable::AnyChannel][21] != LearnTable::None && table.targets[table.head[LearnTable::AnyChannel][21]].mapping == 1
			&& table.head[3][21] != LearnTable::None && table.head[0][22] == LearnTable::None, "the heads: channel, any channel, and the one left out has none");
		std::vector<deskCore::LearnMapping> many;
		for(int i = 0; i < 200; ++i)
			many.push_back(mapping(static_cast<uint8_t>(i % 16), static_cast<uint8_t>(i % 128), i % 16, i % 8));
		check(buildLearnTable(many, [&](const deskCore::LearnRef&) { return &a; }, 1).count == LearnTable::MaxTargets, "past 128 mappings the rest is left out");

		// the empty table and the block boundary
		LearnRouter router(&apply);
		router.publish(table);
		router.beginBlock();
		check(router.table().count == 3, "the block took the table");
		std::atomic<bool> published{false};
		std::thread publisher([&]
		{
			published.store(router.publishEmptyAndSettle(2000));
		});
		std::this_thread::sleep_for(std::chrono::milliseconds(60));
		check(!published.load(), "the empty table is not settled while a block that read the old one runs");
		router.endBlock();
		publisher.join();
		check(published.load(), "it settles when the block ends");
		router.beginBlock();
		check(router.table().count == 0 && !router.translate(0xb0, 21, 5), "the next block reads the empty table: nothing is mapped");
		check(!router.publishEmptyAndSettle(20), "a block that never ends: the wait is bounded, and says so");
		router.endBlock();
		check(router.publishEmptyAndSettle(20), "no block running: settled at once");

		router.countPhysicalPassed();
		router.countPhysicalPassed();
		check(router.counts().physicalPassed == 2, "CCs from a port are counted");
	}
}

int main()
{
	std::printf("mdLearnRouterTest\n");
	values();
	tableBuilder();
	routing();
	learning();
	threads();
	noAllocation();
	globals();
	sessionSide();
	if(g_failures)
	{
		std::printf("mdLearnRouterTest: %d FAILED\n", g_failures);
		return 1;
	}
	std::printf("mdLearnRouterTest: all passed\n");
	return 0;
}
