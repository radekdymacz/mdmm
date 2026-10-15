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
			// another slot layout: refused whole (a slot's bytes could land on other RAM) and never written over
			bad = file;
			bad[16] ^= 1;
			check(decode(bad, model).problem == Problem::Layout && !replaceable(decode(bad, model)), "another layout id: refused, kept as it is");
			// one entry this editor cannot use is skipped alone and kept
			StoreFile wrongSize = f;
			wrongSize.slots[{Kind::Kit, 3}].bytes = {1, 2, 3};
			const auto dw = decode(encode(model, wrongSize), model);
			check(dw.problem == Problem::None && dw.file.slots.size() == 3 && dw.file.foreign.size() == 1 && dw.file.foreign[0].index == 3
				&& dw.file.foreign[0].entry.bytes.size() == 3, "an entry of another size is skipped alone (kept), the rest loads");
			StoreFile noSuch = f;
			noSuch.slots[{Kind::Kit, 999}].bytes = {1};
			const auto dn = decode(encode(model, noSuch), model);
			check(dn.problem == Problem::None && dn.file.slots.size() == 3 && dn.file.foreign.size() == 1, "an entry that names no slot is skipped alone");
			check(decode(encode(model, {}), model).problem == Problem::None, "an empty store is a store");
		}
		{
			// a 0.7 file, made byte by byte as 0.7 wrote it (format 2 as one u32): it loads, and this editor writes it the same
			const auto model = Model::Machinedrum;
			const auto mem = memoryOf(7);
			const auto kit = slotBytes(*findSlot(model, {Kind::Kit, 5}), mem);
			std::vector<uint8_t> old(g_magic, g_magic + 8);
			detail::putU32(old, 2);
			old.insert(old.end(), {0, 0, 0, 0});
			detail::putU32(old, layoutId(model));
			detail::putU32(old, 0);
			detail::putU64(old, 0);
			detail::putU32(old, 1);
			detail::putU32(old, static_cast<uint32_t>(g_entryHeaderSize + kit.size()));
			old.insert(old.end(), {static_cast<uint8_t>(Kind::Kit), 0, 0, 0});
			detail::putU32(old, 5);
			detail::putU64(old, 99);
			detail::putU32(old, static_cast<uint32_t>(kit.size()));
			old.insert(old.end(), kit.begin(), kit.end());
			const auto crc = md::crc32(old.data() + 24, old.size() - 24);
			for(int i = 0; i < 4; ++i)
				old[20 + static_cast<size_t>(i)] = static_cast<uint8_t>(crc >> (8 * i));
			const auto d = decode(old, model);
			check(d.problem == Problem::None && d.version == 2 && d.minor == 0 && d.file.slots.size() == 1 && d.file.slots.at({Kind::Kit, 5}).bytes == kit
				&& d.file.slots.at({Kind::Kit, 5}).savedAt == 99, "a 0.7 file loads");
			check(encode(model, d.file) == old, "and is written back byte for byte (2.0 is 0.7's format, so 0.7 reads this editor's file)");
		}
		{
			// a newer minor: entry kinds and flags this editor does not know are skipped, kept on every rewrite, and replaced
			// only by this editor's own save of the same slot
			const auto model = Model::Monomachine;
			const auto mem = memoryOf(3);
			StoreFile f;
			merge(f.slots, model, {{Kind::Kit, 1}}, mem, {}, 10);
			ForeignEntry unknownKind;
			unknownKind.kind = 9;
			unknownKind.index = 4;
			unknownKind.entry.savedAt = 11;
			unknownKind.entry.bytes = {1, 2, 3, 4, 5};
			ForeignEntry flagged;
			flagged.kind = static_cast<uint8_t>(Kind::Kit);
			flagged.flags[0] = 1;	// say, compressed
			flagged.index = 2;
			flagged.entry.savedAt = 12;
			flagged.entry.bytes = {7, 7};
			f.foreign = {unknownKind, flagged};
			auto file = encode(model, f);
			file[10] = 3;	// minor 3
			file[13] = 0xab;	// and a header byte of its own
			auto d = decode(file, model);
			check(d.problem == Problem::None && d.minor == 3 && d.file.slots.size() == 1 && d.file.foreign.size() == 2
				&& d.file.foreign[0].kind == 9 && d.file.foreign[0].entry.bytes.size() == 5 && d.file.foreign[1].flags[0] == 1,
				"a newer minor's file loads: its known slots used, the entries it cannot use skipped and kept");
			auto target = memoryOf(0);
			overlay(d.file.slots, model, target, nullptr);
			check(slotBytes(*findSlot(model, {Kind::Kit, 1}), target) == slotBytes(*findSlot(model, {Kind::Kit, 1}), mem)
				&& slotBytes(*findSlot(model, {Kind::Kit, 2}), target) == slotBytes(*findSlot(model, {Kind::Kit, 2}), memoryOf(0)),
				"only the known slots are laid over the memory");
			merge(d.file.slots, model, {{Kind::Kit, 6}}, mem, {}, 20);
			const auto again = decode(encode(model, d.file), model);
			check(again.problem == Problem::None && again.file.slots.size() == 2 && again.file.foreign.size() == 2, "a save keeps them in the file");
			const auto rewritten = encode(model, d.file);
			check(rewritten[10] == 3 && rewritten[11] == 0 && rewritten[13] == 0xab && rewritten[14] == 0 && rewritten[15] == 0,
				"with the newer minor's label and header bytes (an older editor sees a newer file, not a damaged one)");
			merge(d.file.slots, model, {{Kind::Kit, 2}}, mem, {}, 21);
			const auto replaced = decode(encode(model, d.file), model);
			check(replaced.file.slots.count({Kind::Kit, 2}) && replaced.file.foreign.size() == 1 && replaced.file.foreign[0].kind == 9,
				"this editor's save of the same slot replaces the newer editor's entry");
			StoreFile own = d.file;
			own.foreign.clear();
			const auto plain = encode(model, own);
			check(plain[10] == 0 && plain[13] == 0, "no newer entries left: its own minor and zero header bytes");
			StoreFile cleared = d.file;
			dropSavedBefore(cleared, 12);
			check(cleared.foreign.size() == 1 && cleared.foreign[0].index == 2, "start from factory: the newer editor's older entries go too");
		}
		{
			auto newer = encode(Model::Machinedrum, {});
			newer[8] = 3;
			const auto d = decode(newer, Model::Machinedrum);
			check(d.problem == Problem::Version && d.version == 3 && !replaceable(d), "a newer major's file is never used nor replaced");
			newer[8] = 1;
			check(replaceable(decode(newer, Model::Machinedrum)), "the previews' version 1 may be moved aside");
			auto other = encode(Model::Monomachine, {});
			check(!replaceable(decode(other, Model::Machinedrum)), "the other machine's file is never replaced");
		}
		{
			// the MD global's tempo: a save, but not while the machine follows the host (then never written)
			const auto base = memoryOf(0);
			auto now = base;
			const auto* g = findSlot(Model::Machinedrum, {Kind::Global, 0});
			now[g->ranges.front().begin + 0xa4] ^= 1;
			now[g->ranges.front().begin + 0xad] ^= 1;
			check(changedSlots(Model::Machinedrum, base, now).size() == 1, "a tempo change is a save");
			check(changedSlots(Model::Machinedrum, base, now, true).empty(), "following the host: the tempo and sync alone are none");
			now[g->ranges.front().begin + 0xa0] ^= 1;
			check(changedSlots(Model::Machinedrum, base, now, true).size() == 1, "with another global change it is");
			auto kept = now;
			keepHostBytes(Model::Machinedrum, kept, base);
			check(kept[g->ranges.front().begin + 0xa4] == base[g->ranges.front().begin + 0xa4] && kept[g->ranges.front().begin + 0xa0] == now[g->ranges.front().begin + 0xa0],
				"written while following: the host's bytes as they were");
			check(slotSame(Model::Machinedrum, {Kind::Global, 0}, now, now) && !slotSame(Model::Machinedrum, {Kind::Global, 0}, base, now), "two looks compared per slot");
			auto ramp = now;
			ramp[g->ranges.front().begin + 0xa5] ^= 3;	// the DAW's tempo moved between two looks
			check(slotSame(Model::Machinedrum, {Kind::Global, 0}, now, ramp, true) && !slotSame(Model::Machinedrum, {Kind::Global, 0}, now, ramp),
				"following the host, a tempo ramp does not hold a global save back");
			// written while following: the host bytes from the stored slot (another instance's newer tempo), else the base's
			Store st;
			auto other = base;
			other[g->ranges.front().begin + 0xa4] = 0x42;
			merge(st, Model::Machinedrum, {{Kind::Global, 0}}, other, {}, 1);
			mergeSaved(st, Model::Machinedrum, {{Kind::Global, 0}}, base, now, {}, 2, true);
			const auto& b = st.at({Kind::Global, 0}).bytes;
			check(b[0xa4] == 0x42 && b[0xad] == other[g->ranges.front().begin + 0xad] && b[0xa0] == now[g->ranges.front().begin + 0xa0],
				"the stored slot's tempo and sync stay, the real change goes in");
			Store empty;
			mergeSaved(empty, Model::Machinedrum, {{Kind::Global, 0}}, base, now, {}, 2, true);
			check(empty.at({Kind::Global, 0}).bytes[0xa4] == base[g->ranges.front().begin + 0xa4], "no stored slot: the base's");
			Store notFollowing;
			mergeSaved(notFollowing, Model::Machinedrum, {{Kind::Global, 0}}, base, now, {}, 2, false);
			check(notFollowing.at({Kind::Global, 0}).bytes[0xa4] == now[g->ranges.front().begin + 0xa4], "not following: the tempo is saved");
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
