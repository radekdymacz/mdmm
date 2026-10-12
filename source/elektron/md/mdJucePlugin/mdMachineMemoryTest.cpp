// I-024: the machine memory's slot store: the layout, the file's frame, merge and overlay, when it is written
// (mdMachineMemory.h, pure; no ROM).
// The firmware side (a kit saved in one session is there in the next) is mdMachineMemoryFirmwareTest.

#include "mdMachineMemory.h"

#include <algorithm>
#include <cstdio>
#include <string>

namespace
{
	int g_failures = 0;

	void check(const bool _ok, const char* _what)
	{
		if(!_ok)
		{
			std::printf("FAIL: %s\n", _what);
			++g_failures;
		}
	}

	using namespace mdJucePlugin::machineMemory;
	using Model = md::MachineModel;


	void watch()
	{
		Watch w(10000);
		check(!w.look(1, 0), "no base: no write");
		w.base(1);
		check(!w.look(1, 1000), "the base again: no write");
		check(!w.look(2, 2000), "a change: wait one look");
		check(w.pending(), "a change is pending");
		check(w.look(2, 3000), "the change held still for a look: write");
		w.written(2);
		check(!w.pending() && !w.look(2, 4000), "written: nothing more");
		// a memory that keeps changing (a pattern played into while it records) is written at the latest after 10 s
		uint64_t s = 10;
		double t = 5000;
		check(!w.look(s++, t), "busy: the first change");
		bool wrote = false;
		for(int i = 0; i < 20 && !wrote; ++i)
		{
			t += 1000;
			wrote = w.look(s++, t);
		}
		check(wrote && t - 5000 >= 10000 && t - 5000 < 11001, "busy: written 10 s after the first change");
		w.written(s - 1);
		// a change back to what was written is no change
		w.base(5);
		check(!w.look(6, 100), "a change");
		check(!w.look(5, 200) && !w.pending(), "changed back before the next look: nothing to write");
		w.reset();
		check(!w.based() && !w.look(7, 300) && !w.pending(), "reset: no base, nothing written until the next one");
	}

	std::vector<uint8_t> memoryOf(const uint8_t _seed)
	{
		std::vector<uint8_t> p(md::g_patchRamStateSize);
		for(size_t i = 0; i < p.size(); ++i)
			p[i] = static_cast<uint8_t>(i * 7 + 3 + _seed);
		return p;
	}

	void layout()
	{
		for(const auto model : {Model::Machinedrum, Model::Monomachine})
		{
			// every patch RAM byte is in exactly one slot or unwatched
			std::vector<int> owner(md::g_patchRamStateSize, 0);
			for(const auto& s : patchSlots(model))
			{
				uint32_t size = 0;
				for(const auto& r : s.ranges)
				{
					for(uint32_t i = r.begin; i < r.end; ++i)
						++owner[i];
					size += r.end - r.begin;
				}
				check(size == s.size && size > 0, "a slot's size is its ranges'");
			}
			for(const auto& r : unwatched(model))
				for(uint32_t i = r.begin; i < r.end; ++i)
					++owner[i];
			check(std::all_of(owner.begin(), owner.end(), [](const int _n) { return _n == 1; }), "slots and unwatched ranges cover the patch RAM once");
			const bool mm = model == Model::Monomachine;
			check(findSlot(model, {Kind::Kit, mm ? 127u : 63u}) && !findSlot(model, {Kind::Kit, mm ? 128u : 64u}), "the kits");
			check(findSlot(model, {Kind::Pattern, 127}) && !findSlot(model, {Kind::Pattern, 128}), "128 patterns");
			check(findSlot(model, {Kind::Song, mm ? 23u : 31u}) && !findSlot(model, {Kind::Song, mm ? 24u : 32u}), "the songs");
			check(findSlot(model, {Kind::Global, 7}) && !findSlot(model, {Kind::Global, 8}), "8 globals");
			check(layoutId(model) != 0, "a layout id");
		}
		check(layoutId(Model::Machinedrum) != layoutId(Model::Monomachine), "each machine its layout");
		// measured: MD kit 1 at 0x8ca (0x460 a kit), pattern 1 in three parts; MM kit 1 at 0x59c, pattern 1 at 0x16ae4
		check(findSlot(Model::Machinedrum, {Kind::Kit, 0})->ranges.front().begin == 0x8ca, "MD kit 1");
		check(findSlot(Model::Machinedrum, {Kind::Pattern, 0})->ranges.size() == 3, "an MD pattern has three parts");
		check(findSlot(Model::Monomachine, {Kind::Pattern, 0})->ranges.front().begin == 0x16ae4, "MM pattern 1");
	}

	void changed()
	{
		for(const auto model : {Model::Machinedrum, Model::Monomachine})
		{
			const auto base = memoryOf(0);
			auto now = base;
			now[0x40] ^= 1;	// the working kit: a knob, automation
			check(changedSlots(model, base, now).empty(), "a change of the kit that plays is no save");
			const auto* kit5 = findSlot(model, {Kind::Kit, 4});
			now[kit5->ranges.front().begin + 3] ^= 1;
			const auto* pat9 = findSlot(model, {Kind::Pattern, 8});
			now[pat9->ranges.back().end - 1] ^= 1;
			const auto keys = changedSlots(model, base, now);
			check(keys.size() == 2 && keys[0] == Key{Kind::Kit, 4} && keys[1] == Key{Kind::Pattern, 8}, "a saved kit and a pattern edit: those two slots");
			const uint8_t more = 1;
			check(signature(model, now, &more, 1) != signature(model, now, nullptr, 0), "the user flash counts in the look");
		}
	}

	void frame()
	{
		for(const auto model : {Model::Machinedrum, Model::Monomachine})
		{
			const auto mem = memoryOf(5);
			StoreFile f;
			f.romFingerprint = 0x1234567890abcdefull;
			std::vector<uint8_t> sectors(md::g_romSize, 0x5a);
			const Key sector{Kind::Sector, model == Model::Monomachine ? 3u : 40u};
			merge(f.slots, model, {{Kind::Kit, 2}, {Kind::Song, 1}, sector}, mem, sectors, 42);
			check(f.slots.size() == 3, "three slots merged");
			const auto file = encode(model, f);
			const auto d = decode(file, model);
			check(d.problem == Problem::None && d.file.romFingerprint == f.romFingerprint && d.file.slots.size() == 3
				&& d.file.slots.at({Kind::Kit, 2}).bytes == slotBytes(*findSlot(model, {Kind::Kit, 2}), mem)
				&& d.file.slots.at({Kind::Kit, 2}).savedAt == 42, "a file reads back as written");
			check(decode(file, model == Model::Machinedrum ? Model::Monomachine : Model::Machinedrum).problem == Problem::Machine,
				"the other machine's file is refused");
			auto bad = file;
			bad[bad.size() - 1] ^= 1;
			check(decode(bad, model).problem == Problem::Corrupt, "one bit: damaged");
			bad = file;
			bad[16] ^= 1;
			check(decode(bad, model).problem == Problem::Layout, "another layout id: another layout");
			StoreFile wrongSize;
			wrongSize.slots[{Kind::Kit, 2}].bytes = {1, 2, 3};
			check(decode(encode(model, wrongSize), model).problem == Problem::Corrupt, "an entry of the wrong size is refused");
			StoreFile noSuch;
			noSuch.slots[{Kind::Kit, 999}].bytes = {1};
			check(decode(encode(model, noSuch), model).problem == Problem::Corrupt, "an entry that names no slot is refused");
			check(decode(encode(model, {}), model).problem == Problem::None, "an empty store is a store");
		}
		{
			auto newer = encode(Model::Machinedrum, {});
			newer[8] = 3;
			const auto d = decode(newer, Model::Machinedrum);
			check(d.problem == Problem::Version && d.version == 3 && !replaceable(d), "a newer editor's file is never replaced");
			newer[8] = 1;
			check(replaceable(decode(newer, Model::Machinedrum)), "the previews' version 1 may be moved aside");
			auto other = encode(Model::Monomachine, {});
			check(!replaceable(decode(other, Model::Machinedrum)), "the other machine's file is never replaced");
		}
		{
			// the MD global's tempo alone is no save
			const auto base = memoryOf(0);
			auto now = base;
			const auto* g = findSlot(Model::Machinedrum, {Kind::Global, 0});
			now[g->ranges.front().begin + 0xa4] ^= 1;
			check(changedSlots(Model::Machinedrum, base, now).empty(), "a tempo change alone is no save");
			now[g->ranges.front().begin + 0xa0] ^= 1;
			check(changedSlots(Model::Machinedrum, base, now).size() == 1, "with another global change it is");
		}
		check(decode({}, Model::Machinedrum).problem == Problem::Empty, "no bytes: empty");
		check(decode({1, 2, 3}, Model::Machinedrum).problem == Problem::NotOurs, "a short file is not ours");
		auto v1 = encode(Model::Machinedrum, {});
		v1[8] = 1;
		check(decode(v1, Model::Machinedrum).problem == Problem::Version, "the previews' whole-memory file (version 1) is another version");
		for(const auto p : {Problem::Empty, Problem::NotOurs, Problem::Version, Problem::Machine, Problem::Corrupt, Problem::Layout})
			check(!describe(p).empty() && describe(p).find("machine memory") != std::string::npos, "each problem has its words");
		check(describe(Problem::None).empty(), "no problem, no words");
	}

	// The review's scenarios (DESIGN-machine-memory.md, "Why slots")
	void mergeOverlay()
	{
		const auto model = Model::Machinedrum;
		const auto factory = memoryOf(0);
		// session 1 saves kit 3; session 2 (an old project, other memory everywhere) saves only kit 7
		auto s1 = factory;
		putSlot(*findSlot(model, {Kind::Kit, 2}), s1, std::vector<uint8_t>(0x460, 0x11));
		auto project = memoryOf(9);
		auto s2 = project;
		putSlot(*findSlot(model, {Kind::Kit, 6}), s2, std::vector<uint8_t>(0x460, 0x22));
		Store store;
		merge(store, model, changedSlots(model, factory, s1), s1, {}, 1);
		merge(store, model, changedSlots(model, project, s2), s2, {}, 2);
		check(store.size() == 2, "D: the old project's save wrote only its kit");
		auto fresh = factory;
		check(overlay(store, model, fresh, nullptr), "a new session lays the slots over factory memory");
		check(slotBytes(*findSlot(model, {Kind::Kit, 2}), fresh) == std::vector<uint8_t>(0x460, 0x11)
			&& slotBytes(*findSlot(model, {Kind::Kit, 6}), fresh) == std::vector<uint8_t>(0x460, 0x22), "both saves are there");
		check(slotBytes(*findSlot(model, {Kind::Pattern, 0}), fresh) == slotBytes(*findSlot(model, {Kind::Pattern, 0}), factory),
			"the old project's unsaved memory did not reach the file");
		// the standalone's own saves the file lacks win over the file's
		auto own = factory;
		putSlot(*findSlot(model, {Kind::Kit, 2}), own, std::vector<uint8_t>(0x460, 0x33));
		overlay(store, model, own, nullptr, {Key{Kind::Kit, 2}});
		check(slotBytes(*findSlot(model, {Kind::Kit, 2}), own) == std::vector<uint8_t>(0x460, 0x33), "a skipped slot keeps the own state's");
		check(conflicts(store, model, factory, {}).size() == 2, "conflicts: the saved slots that differ");
		// D: SAVE KIT in an old project also sets the playing pattern's kit: only that byte goes to the saved pattern
		{
			Store st;
			auto saved = factory;
			const auto* pat = findSlot(model, {Kind::Pattern, 0});
			putSlot(*pat, saved, std::vector<uint8_t>(pat->size, 0x44));
			merge(st, model, {{Kind::Pattern, 0}}, saved, {}, 1);
			auto base = memoryOf(9), now = base;
			now[pat->ranges.front().begin + pat->links.front()] ^= 0x7f;
			putSlot(*findSlot(model, {Kind::Kit, 1}), now, std::vector<uint8_t>(0x460, 0x55));
			mergeSaved(st, model, changedSlots(model, base, now), base, now, {}, 2);
			auto expect = std::vector<uint8_t>(pat->size, 0x44);
			expect[pat->links.front()] = now[pat->ranges.front().begin + pat->links.front()];
			check(st.at({Kind::Pattern, 0}).bytes == expect && st.count({Kind::Kit, 1}), "a pattern's kit byte alone is merged byte by byte, the kit whole");
			now[pat->ranges.front().begin + 5] ^= 1;
			mergeSaved(st, model, {{Kind::Pattern, 0}}, base, now, {}, 3);
			check(st.at({Kind::Pattern, 0}).bytes == slotBytes(*pat, now), "a pattern edit takes the pattern whole");
		}
		std::vector<uint8_t> sectors(md::g_romSize, 0);
		Store flash;
		std::vector<uint8_t> saved(md::g_romSize, 0);
		std::fill_n(saved.begin() + 40 * 0x10000, 0x10000, uint8_t{7});
		check(changedSectors(model, sectors, saved).size() == 1, "a sample: its sector changed");
		merge(flash, model, changedSectors(model, sectors, saved), {}, saved, 3);
		check(overlay(flash, model, fresh, &sectors) && sectors[40 * 0x10000] == 7, "a saved sector laid over the flash");
		check(!sectorValid(model, 3), "MD: no firmware sector is ever saved");
	}

	void start()
	{
		StartFacts f;
		f.machineReady = true;
		auto with = [&](auto _change) { auto g = f; _change(g); return startOf(g); };
		check(with([](StartFacts& g) { g.projectState = true; g.machineReady = false; }) == Start::Project, "a DAW project's state wins, even before the ROM");
		check(with([](StartFacts& g) { g.projectState = true; }) == Start::Project, "a DAW project's state wins over the file");
		check(with([](StartFacts& g) { g.keep = false; }) == Start::Off, "KEEP MEMORY off: the memory the session has");
		check(with([](StartFacts& g) { g.folder = false; }) == Start::Off, "no folder: the memory the session has");
		check(with([](StartFacts& g) { g.machineReady = false; }) == Start::Wait, "no ROM yet: wait");
		check(with([](StartFacts&) {}) == Start::Overlay, "else the file's slots over the memory");
		check(stateIsProject(false), "a DAW project's state is a project");
		check(!stateIsProject(true), "the standalone's own state is not");
	}

	void soon()
	{
		Watch w;
		w.base(1);
		w.writeSoon();
		check(w.wantsWrite() && w.pending() && w.differs(1), "write soon: pending though nothing changed");
		check(w.look(1, 0), "the next look writes");
		w.written(1);
		check(!w.pending() && !w.differs(1) && w.differs(2), "written: only a change differs");
		Watch v;
		v.writeSoon();
		check(!v.wantsWrite(), "no base: it waits for one");
		v.base(3);
		check(v.wantsWrite(), "then writes");
	}
}

int main()
{
	layout();
	changed();
	frame();
	watch();
	mergeOverlay();
	start();
	soon();
	std::printf("mdMachineMemoryTest: %s\n", g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
