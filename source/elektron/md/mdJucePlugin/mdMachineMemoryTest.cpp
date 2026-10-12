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
			const auto file = encode(model, payload);
			check(file.size() == g_headerSize + payload.size(), "the frame is 24 bytes and the payload");
			const auto d = decode(file, model);
			check(d.problem == Problem::None && d.payload == payload, "a file reads back as written");
			check(decode(file, model == Model::Machinedrum ? Model::Monomachine : Model::Machinedrum).problem == Problem::Machine,
				"the other machine's file is refused");
		}
		const auto file = encode(Model::Machinedrum, payload);
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
		check(decode(encode(Model::Machinedrum, {}), Model::Machinedrum).problem == Problem::Corrupt, "an empty payload is refused");
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
		check(startOf(true, false, true, true) == Start::Project, "a project state wins, even before the ROM");
		check(startOf(true, true, true, true) == Start::Project, "a project state wins");
		check(startOf(false, true, false, true) == Start::Off, "KEEP MEMORY off: factory memory");
		check(startOf(false, true, true, false) == Start::Off, "no folder: factory memory");
		check(startOf(false, false, true, true) == Start::Wait, "no ROM yet: wait");
		check(startOf(false, true, true, true) == Start::File, "else the file");
		check(stateIsProject(false), "a DAW project's state is a project: it wins over the file");
		check(!stateIsProject(true), "the standalone's own state is not: the file wins");
	}

	void hashing()
	{
		const auto a = payloadOf(1 << 20);
		auto b = a;
		b[123456] ^= 1;
		check(hash(a.data(), a.size()) != hash(b.data(), b.size()), "one bit changes the look's hash");
		check(hash(a.data(), a.size()) == hash(a.data(), a.size()), "the same memory, the same hash");
		check(watchedPatchBytes(Model::Monomachine, 0x100000) == 0xff000, "the Monomachine's stack (the top 4 KiB) is no save");
		check(watchedPatchBytes(Model::Machinedrum, 0x100000) == 0x100000, "the Machinedrum's whole patch RAM is watched");
	}
}

int main()
{
	frame();
	watch();
	start();
	hashing();
	std::printf("mdMachineMemoryTest: %s\n", g_failures ? "FAIL" : "PASS");
	return g_failures ? 1 : 0;
}
