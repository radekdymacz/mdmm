// I-024: the machine memory file's frame and when it is written (mdMachineMemory.h, pure; no ROM).
// The firmware side (a kit saved in one session is there in the next) is mdMachineMemoryFirmwareTest.

#include "mdMachineMemory.h"

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

	std::vector<uint8_t> payloadOf(const size_t _size)
	{
		std::vector<uint8_t> p(_size);
		for(size_t i = 0; i < _size; ++i)
			p[i] = static_cast<uint8_t>(i * 7 + 3);
		return p;
	}

	void frame()
	{
		const auto payload = payloadOf(4096);
		for(const auto model : {Model::Machinedrum, Model::Monomachine})
		{
			const auto file = encode(model, 0x1234567890abcdefull, payload);
			check(file.size() == g_headerSize + payload.size(), "the frame is 32 bytes and the payload");
			const auto d = decode(file, model);
			check(d.problem == Problem::None && d.payload == payload && d.stamp == 0x1234567890abcdefull, "a file reads back as written, its stamp too");
			check(decode(file, model == Model::Machinedrum ? Model::Monomachine : Model::Machinedrum).problem == Problem::Machine,
				"the other machine's file is refused");
		}
		const auto file = encode(Model::Machinedrum, 7, payload);
		auto stamped = file;
		stamped[24] ^= 1;
		check(decode(stamped, Model::Machinedrum).problem == Problem::Corrupt, "the CRC covers the stamp");
		check(decode({}, Model::Machinedrum).problem == Problem::Empty, "no bytes: empty");
		check(decode({1, 2, 3}, Model::Machinedrum).problem == Problem::NotOurs, "a short file is not ours");
		auto other = file;
		other[0] = 'X';
		check(decode(other, Model::Machinedrum).problem == Problem::NotOurs, "another magic is not ours");
		auto newer = file;
		newer[8] = static_cast<uint8_t>(g_version + 1);
		check(decode(newer, Model::Machinedrum).problem == Problem::Version, "a newer format is refused");
		auto flipped = file;
		flipped[g_headerSize + 100] ^= 1;
		check(decode(flipped, Model::Machinedrum).problem == Problem::Corrupt, "one bit off in the payload: corrupt (CRC)");
		auto cut = file;
		cut.pop_back();
		check(decode(cut, Model::Machinedrum).problem == Problem::Corrupt, "a cut file: corrupt (size)");
		auto longer = file;
		longer.push_back(0);
		check(decode(longer, Model::Machinedrum).problem == Problem::Corrupt, "a longer file: corrupt (size)");
		auto reserved = file;
		reserved[13] = 1;
		check(decode(reserved, Model::Machinedrum).problem == Problem::Corrupt, "the reserved bytes are zero");
		auto huge = file;
		huge[19] = 0x7f;	// a payload size of about 2 GiB
		check(decode(huge, Model::Machinedrum).problem == Problem::Corrupt, "a huge size field is refused, nothing read past the bytes");
		check(decode(encode(Model::Machinedrum, 7, {}), Model::Machinedrum).problem == Problem::Corrupt, "an empty payload is refused");
		for(const auto p : {Problem::Empty, Problem::NotOurs, Problem::Version, Problem::Machine, Problem::Corrupt})
			check(!describe(p).empty() && describe(p).find("machine memory") != std::string::npos, "each problem has its words");
		check(describe(Problem::None).empty(), "no problem, no words");
	}

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

	void start()
	{
		StartFacts f;
		f.machineReady = true;
		f.file = true;
		f.fileStamp = 42;
		auto with = [&](auto _change) { auto g = f; _change(g); return startOf(g); };
		check(with([](StartFacts& g) { g.projectState = true; g.machineReady = false; }) == Start::Project, "a DAW project's state wins, even before the ROM");
		check(with([](StartFacts& g) { g.projectState = true; }) == Start::Project, "a DAW project's state wins over the file");
		check(with([](StartFacts& g) { g.keep = false; }) == Start::Off, "KEEP MEMORY off: the memory the session has");
		check(with([](StartFacts& g) { g.folder = false; }) == Start::Off, "no folder: the memory the session has");
		check(with([](StartFacts& g) { g.machineReady = false; }) == Start::Wait, "no ROM yet: wait");
		check(with([](StartFacts&) {}) == Start::File, "no own state: the file");
		check(with([](StartFacts& g) { g.file = false; }) == Start::Off, "no file: the memory the session has");
		check(with([](StartFacts& g) { g.own = Mark{42, false}; }) == Start::Own, "the standalone's own state holds the file's saves (the same stamp): it wins, its unsaved kit edits stay");
		check(with([](StartFacts& g) { g.own = Mark{41, false}; }) == Start::File, "another instance saved since (another stamp): the file's saves win");
		check(with([](StartFacts& g) { g.own = Mark{41, true}; }) == Start::Own, "own saves the file lacks (a write failed): the own state wins, it is written");
		check(with([](StartFacts& g) { g.own = Mark{0, true}; g.file = false; }) == Start::Own, "no file, own saves never written: the own state, written");
		check(with([](StartFacts& g) { g.own = Mark{0, false}; }) == Start::File, "a state that knows no file: the file");
		check(stateIsProject(false), "a DAW project's state is a project");
		check(!stateIsProject(true), "the standalone's own state is not");
	}

	void watched()
	{
		for(const auto model : {Model::Machinedrum, Model::Monomachine})
		{
			std::vector<uint8_t> p = payloadOf(0x100000);
			const auto base = signature(model, p, nullptr, 0);
			auto knob = p;
			knob[0x40] ^= 1;	// the kit that plays (a knob, a CC, automation)
			check(signature(model, knob, nullptr, 0) == base, "a change of the kit that plays is no save");
			auto stored = p;
			stored[0x3000] ^= 1;	// a stored kit slot
			check(signature(model, stored, nullptr, 0) != base, "a change of a stored slot is a save");
			auto top = p;
			top[0x0ffd40] ^= 1;
			check((signature(model, top, nullptr, 0) == base) == (model == Model::Monomachine), "the Monomachine's stack is no save");
			const uint8_t more = 1;
			check(signature(model, p, &more, 1) != base, "the user flash or the flash write mark counts");
		}
		std::vector<uint8_t> p = payloadOf(0x100000);
		auto loaded = p;
		loaded[0x272be] ^= 1;
		check(signature(Model::Machinedrum, loaded, nullptr, 0) == signature(Model::Machinedrum, p, nullptr, 0), "the MD's last loaded pattern is no save");
		auto playing = p;
		playing[0x7fff3] ^= 1;
		check(signature(Model::Machinedrum, playing, nullptr, 0) == signature(Model::Machinedrum, p, nullptr, 0), "the MD's byte that moves while it plays is no save");
		auto slot1 = p;
		slot1[0x8c8] ^= 1;
		check(signature(Model::Machinedrum, slot1, nullptr, 0) != signature(Model::Machinedrum, p, nullptr, 0), "the MD's kit slot 1 is watched from its first byte");
		auto mmSlot1 = p;
		mmSlot1[0x5a2] ^= 1;
		check(signature(Model::Monomachine, mmSlot1, nullptr, 0) != signature(Model::Monomachine, p, nullptr, 0), "the MM's kit slot 1 is watched");
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

	void hashing()
	{
		const auto a = payloadOf(1 << 20);
		auto b = a;
		b[123456] ^= 1;
		check(hash(a.data(), a.size()) != hash(b.data(), b.size()), "one bit changes the look's hash");
		check(hash(a.data(), a.size()) == hash(a.data(), a.size()), "the same memory, the same hash");
	}
}

int main()
{
	frame();
	watch();
	start();
	watched();
	soon();
	hashing();
	std::printf("mdMachineMemoryTest: %s\n", g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
