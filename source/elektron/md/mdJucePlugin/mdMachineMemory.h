#pragma once

// I-024 (wave 11 of 0.6): the machine's memory that stays for every new session, like a real machine's battery-backed
// memory (doc/modern-ux/DESIGN-machine-memory.md). The file is a store of SAVED SLOTS: each save writes only the slots
// it changed into it (read, merge, write), never the whole memory; a session with no project state starts from factory
// memory (or the standalone's own) with the file's slots laid over it. Pure: the slot layout of each machine's patch
// RAM, the file's frame, what changed, when to write and how a session starts. MachineMemoryService reads and writes the
// file and runs the watch on its "machine memory" thread (mdMachineMemoryService.h); mdMachineMemoryTest.

#include "mdLib/mdstate.h"
#include "mdLib/mdtypes.h"

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace mdJucePlugin::machineMemory
{
	// The file's name in the machine's data folder (<data folder>/memory/), where an unusable one is moved, and where a
	// standalone's slots that the file replaced at its first start are kept (a state from before I-024)
	constexpr const char* g_folder = "memory";
	constexpr const char* g_fileName = "machine-memory.bin";
	constexpr const char* g_unusableName = "machine-memory.unusable";	// + "-<date-time>.bin"
	constexpr const char* g_keptName = "machine-memory.standalone-kept.bin";

	constexpr char g_magic[8] = {'M', 'D', 'M', 'M', 'M', 'E', 'M', '\0'};
	// The format's version is two numbers (FOUNDATION.md, "What 1.0 promises to read"): the major changes only with an
	// incompatible change (an editor reads no other major); the minor counts additions an editor of the same major reads
	// past (new entry kinds or entry flags: skipped on read and written back as they were). A 0.7 file is 2.0.
	constexpr uint16_t g_major = 2;
	constexpr uint16_t g_minor = 0;
	constexpr size_t g_headerSize = 40;
	constexpr size_t g_entryHeaderSize = 20;
	// Larger than any store of either machine (MD: 1 MiB patch RAM and 6 MiB of sample flash; MM: 3 MiB), so a size
	// field from a broken file never asks for gigabytes.
	constexpr uint32_t g_maxPayload = 16u * 1024u * 1024u;

	// The settings key of "KEEP MEMORY" (the editor's config, default on).
	constexpr const char* g_keepKey = "keepMachineMemory";

	enum class Problem : uint8_t
	{
		None,
		Empty,		// no bytes
		NotOurs,	// another file (the magic is not ours)
		Version,	// another major version than this editor reads (newer, or the 0.6 previews' whole-memory file)
		Machine,	// the other machine's
		Corrupt,	// size or CRC wrong, an entry cut short or twice: a broken write, a damaged or crafted file
		Layout		// written for another slot layout than this editor knows (a layout change is a major version)
	};

	inline uint8_t machineByte(const md::MachineModel _model)
	{
		return _model == md::MachineModel::Monomachine ? 1 : 0;
	}

	// ---- The slot layout (measured on MD OS 1.63 and MM OS 1.32B: mdMachineMemoryFirmwareTest, MDMM_MEMORY_LAYOUT=1:
	// a changed dump sent to slots 0, 1 and the last and the bytes it changed; the MM's dumps' raw payloads found in
	// the patch RAM as they are)

	struct Range
	{
		uint32_t begin;
		uint32_t end;
	};

	enum class Kind : uint8_t
	{
		Kit = 1,
		Pattern = 2,
		Song = 3,
		Global = 4,
		Other = 5,	// watched patch RAM in no known slot, in 256-byte blocks (written when a save changes it)
		Sector = 6	// a 64 KiB flash sector: the MD's sample flash (UW), the MM's DigiPRO user flash
	};

	struct Key
	{
		Kind kind = Kind::Kit;
		uint32_t index = 0;
		bool operator<(const Key& _o) const { return kind != _o.kind ? kind < _o.kind : index < _o.index; }
		bool operator==(const Key& _o) const { return kind == _o.kind && index == _o.index; }
	};

	inline std::string describe(const Key& _k)
	{
		const char* n = "block";
		switch(_k.kind)
		{
		case Kind::Kit: n = "kit"; break;
		case Kind::Pattern: n = "pattern"; break;
		case Kind::Song: n = "song"; break;
		case Kind::Global: n = "global"; break;
		case Kind::Other: n = "block"; break;
		case Kind::Sector: n = "flash sector"; break;
		}
		return std::string(n) + " " + std::to_string(_k.index + 1);
	}

	struct Slot
	{
		Key key;
		std::vector<Range> ranges;
		uint32_t size = 0;
		// Bytes another save changes as a side effect (offsets in the slot's bytes): a pattern's kit, which SAVE KIT and
		// LOAD KIT set in the pattern that plays (measured: MD 0x94, MM 0x426). A change of these alone is merged byte by
		// byte, so a kit saved in an old project does not bring back the rest of that project's pattern.
		std::vector<uint32_t> links;
		// The bytes a plug-in that follows its DAW sets in the active global (offsets in the slot's bytes; measured with
		// MDMM_MEMORY_OTHER=1): MD the tempo (+0xa4, two bytes) and TEMPO IN / CTRL IN (+0xad); MM TEMPO SYNC (+5) and
		// TRANSPORT ACCEPT (+6). While the machine follows the host they are never a save and never written (the file
		// keeps what the session started with); elsewhere (the standalone) a tempo change is a save, as on the machine.
		std::vector<uint32_t> hostBytes;
	};

	constexpr uint32_t g_otherBlock = 0x100;
	constexpr uint32_t g_sectorSize = md::g_uwFlashSectorSize;	// 0x10000
	// The MD's sample sectors (B-054: the OS writes only 0x2c0000-0x7bffff; every sector from 0x200000 up is kept)
	constexpr uint32_t g_mdFirstSector = md::g_mdFirmwareFlashEnd / g_sectorSize;	// 32
	constexpr uint32_t g_mdSectors = md::g_romSize / g_sectorSize;					// 128
	constexpr uint32_t g_mmSectors = md::g_mmUserFlashStateSize / g_sectorSize;	// 32

	// The memory a save changes on each machine, chosen once (MachineMemory asks this, never which machine it is).
	// Both: the patch RAM. The Monomachine: its user flash (the DigiPRO waveforms), looked at with the patch RAM, part
	// of the signature, its sectors the file's sector slots. The Machinedrum: its sample flash (the ROM-xx slots), not
	// watched (the OS writes it by itself while the factory patterns play) but copied when the page stores a sample;
	// the samples belong to the ROM (its fingerprint), and its memory is known only once its factory flash is.
	struct Shape
	{
		md::MachineModel model = md::MachineModel::Machinedrum;
		bool userFlash = false;			// MM: the user flash is looked at and saved
		bool sampleFlash = false;		// MD: the sample sectors, the ROM's fingerprint, the factory flash first
		uint32_t firstSector = 0;		// the sector slots a state from before I-024 seeds into the file
		uint32_t endSector = 0;
	};

	inline Shape shapeOf(const md::MachineModel _model)
	{
		if(_model == md::MachineModel::Monomachine)
			return {_model, true, false, 0, g_mmSectors};
		return {_model, false, true, g_mdFirstSector, g_mdSectors};
	}

	// What a save never is: the working areas and bytes that move by themselves (the working kit and its copy, the
	// working song, the last loaded pattern, the MD's byte that moves while it plays, the MM's stack). Knobs, CCs and
	// automation land here.
	inline std::vector<Range> unwatched(const md::MachineModel _model)
	{
		// measured further (MDMM_MEMORY_OTHER=1: tempo, track, song mode, the active global, mutes, play): the active
		// global's number (MD 0x120ca, MM 0x1629f), the MD's sequencer mode and its 16 tracks' run state with their mutes
		// (0x723c0-0x724bf)
		if(_model == md::MachineModel::Monomachine)
			return {{0x000000, 0x00059c}, {0x01629c, 0x0162a0}, {0x016ae3, 0x016ae4}, {0x0e26e8, 0x0e39b8}, {0x0ffd38, 0x100000}};
		return {{0x000000, 0x0008ca}, {0x0120ca, 0x0120cc}, {0x0126ae, 0x0130be}, {0x0272be, 0x0272c0}, {0x0723c0, 0x0724c0},
			{0x07fff0, 0x07fff8}};
	}

	namespace detail
	{
		inline void addArray(std::vector<struct Slot>& _out, const Kind _kind, const uint32_t _count,
			const std::vector<std::pair<uint32_t, uint32_t>>& _parts, const std::vector<uint32_t>& _links = {},
			const std::vector<uint32_t>& _host = {})	// (base, size = stride) per part
		{
			for(uint32_t i = 0; i < _count; ++i)
			{
				Slot s;
				s.key = {_kind, i};
				s.links = _links;
				s.hostBytes = _host;
				for(const auto& [base, size] : _parts)
				{
					s.ranges.push_back({base + i * size, base + (i + 1) * size});
					s.size += size;
				}
				_out.push_back(std::move(s));
			}
		}

		inline std::vector<Slot> build(const md::MachineModel _model)
		{
			std::vector<Slot> out;
			if(_model == md::MachineModel::Monomachine)
			{
				addArray(out, Kind::Kit, 128, {{0x00059c, 0x2ba}});
				addArray(out, Kind::Global, 8, {{0x0162a0, 0x108}}, {}, {5, 6});
				addArray(out, Kind::Pattern, 128, {{0x016ae4, 0x1978}}, {0x426});
				addArray(out, Kind::Song, 24, {{0x0e39b8, 0x12d0}});
			}
			else
			{
				addArray(out, Kind::Kit, 64, {{0x0008ca, 0x460}});
				addArray(out, Kind::Global, 8, {{0x0120cc, 0xb2}}, {}, {0xa4, 0xa5, 0xad});
				addArray(out, Kind::Song, 32, {{0x0130be, 0xa10}});
				// a UW pattern is three parts: its steps and locks, a 204-byte record, its extended part
				addArray(out, Kind::Pattern, 128, {{0x0272c0, 0x896}, {0x06bdc0, 0xcc}, {0x080000, 0x90c}}, {0x94});
			}
			// every other watched byte: in 256-byte blocks
			std::vector<uint8_t> taken(md::g_patchRamStateSize, 0);
			for(const auto& s : out)
				for(const auto& r : s.ranges)
					std::fill(taken.begin() + r.begin, taken.begin() + r.end, uint8_t{1});
			for(const auto& r : unwatched(_model))
				std::fill(taken.begin() + r.begin, taken.begin() + r.end, uint8_t{1});
			for(uint32_t b = 0; b < md::g_patchRamStateSize; b += g_otherBlock)
			{
				Slot s;
				s.key = {Kind::Other, b / g_otherBlock};
				for(uint32_t i = b; i < b + g_otherBlock; ++i)
				{
					if(taken[i])
						continue;
					if(!s.ranges.empty() && s.ranges.back().end == i)
						++s.ranges.back().end;
					else
						s.ranges.push_back({i, i + 1});
					++s.size;
				}
				if(s.size)
					out.push_back(std::move(s));
			}
			return out;
		}

		inline void putU16(std::vector<uint8_t>& _out, const uint16_t _v)
		{
			_out.push_back(static_cast<uint8_t>(_v));
			_out.push_back(static_cast<uint8_t>(_v >> 8));
		}
		inline void putU32(std::vector<uint8_t>& _out, const uint32_t _v)
		{
			for(int i = 0; i < 4; ++i)
				_out.push_back(static_cast<uint8_t>(_v >> (8 * i)));
		}
		inline void putU64(std::vector<uint8_t>& _out, const uint64_t _v)
		{
			for(int i = 0; i < 8; ++i)
				_out.push_back(static_cast<uint8_t>(_v >> (8 * i)));
		}
		inline uint32_t getU32(const uint8_t* _p)
		{
			uint32_t v = 0;
			for(int i = 0; i < 4; ++i)
				v |= static_cast<uint32_t>(_p[i]) << (8 * i);
			return v;
		}
		inline uint64_t getU64(const uint8_t* _p)
		{
			uint64_t v = 0;
			for(int i = 0; i < 8; ++i)
				v |= static_cast<uint64_t>(_p[i]) << (8 * i);
			return v;
		}
	}

	// The patch RAM's slots of a machine, built once (known slots, then the other blocks)
	inline const std::vector<Slot>& patchSlots(const md::MachineModel _model)
	{
		static const std::vector<Slot> mdSlots = detail::build(md::MachineModel::Machinedrum);
		static const std::vector<Slot> mmSlots = detail::build(md::MachineModel::Monomachine);
		return _model == md::MachineModel::Monomachine ? mmSlots : mdSlots;
	}

	inline const Slot* findSlot(const md::MachineModel _model, const Key& _key)
	{
		static const auto index = [](const md::MachineModel _m)
		{
			std::map<Key, size_t> m;
			const auto& s = patchSlots(_m);
			for(size_t i = 0; i < s.size(); ++i)
				m[s[i].key] = i;
			return m;
		};
		static const auto mdIndex = index(md::MachineModel::Machinedrum);
		static const auto mmIndex = index(md::MachineModel::Monomachine);
		const auto& idx = _model == md::MachineModel::Monomachine ? mmIndex : mdIndex;
		const auto it = idx.find(_key);
		return it == idx.end() ? nullptr : &patchSlots(_model)[it->second];
	}

	inline bool sectorValid(const md::MachineModel _model, const uint32_t _index)
	{
		return _model == md::MachineModel::Monomachine ? _index < g_mmSectors : _index >= g_mdFirstSector && _index < g_mdSectors;
	}

	// The size an entry of _key must have (0: no such slot)
	inline uint32_t sizeOf(const md::MachineModel _model, const Key& _key)
	{
		if(_key.kind == Kind::Sector)
			return sectorValid(_model, _key.index) ? g_sectorSize : 0;
		const auto* s = findSlot(_model, _key);
		return s ? s->size : 0;
	}

	// 64-bit FNV-1a, for the watch's looks and the layout's name
	inline uint64_t hash(const uint8_t* _data, const size_t _size, uint64_t _h = 0xcbf29ce484222325ull)
	{
		for(size_t i = 0; i < _size; ++i)
		{
			_h ^= _data[i];
			_h *= 0x100000001b3ull;
		}
		return _h;
	}

	// The layout's name in the file: a file of another layout is not laid over this machine's memory
	inline uint32_t layoutId(const md::MachineModel _model)
	{
		uint64_t h = 0xcbf29ce484222325ull;
		for(const auto& s : patchSlots(_model))
		{
			uint8_t k[9] = {static_cast<uint8_t>(s.key.kind)};
			for(int i = 0; i < 4; ++i)
			{
				k[1 + i] = static_cast<uint8_t>(s.key.index >> (8 * i));
				k[5 + i] = static_cast<uint8_t>(s.size >> (8 * i));
			}
			h = hash(k, sizeof(k), h);
			for(const auto& r : s.ranges)
			{
				uint8_t b[8];
				for(int i = 0; i < 4; ++i)
				{
					b[i] = static_cast<uint8_t>(r.begin >> (8 * i));
					b[4 + i] = static_cast<uint8_t>(r.end >> (8 * i));
				}
				h = hash(b, sizeof(b), h);
			}
		}
		return static_cast<uint32_t>(h ^ (h >> 32));
	}

	inline std::vector<uint8_t> slotBytes(const Slot& _slot, const std::vector<uint8_t>& _patch)
	{
		std::vector<uint8_t> out;
		out.reserve(_slot.size);
		for(const auto& r : _slot.ranges)
			out.insert(out.end(), _patch.begin() + r.begin, _patch.begin() + r.end);
		return out;
	}

	inline void putSlot(const Slot& _slot, std::vector<uint8_t>& _patch, const std::vector<uint8_t>& _bytes)
	{
		size_t at = 0;
		for(const auto& r : _slot.ranges)
		{
			std::copy(_bytes.begin() + static_cast<std::ptrdiff_t>(at), _bytes.begin() + static_cast<std::ptrdiff_t>(at + (r.end - r.begin)),
				_patch.begin() + r.begin);
			at += r.end - r.begin;
		}
	}

	// _followsHost: a change of the slot's host bytes alone is no change
	inline bool slotDiffers(const Slot& _slot, const std::vector<uint8_t>& _a, const std::vector<uint8_t>& _b, const bool _followsHost = false)
	{
		bool any = false;
		for(const auto& r : _slot.ranges)
			if(std::memcmp(_a.data() + r.begin, _b.data() + r.begin, r.end - r.begin) != 0)
				any = true;
		if(!any || !_followsHost || _slot.hostBytes.empty())
			return any;
		size_t at = 0;
		for(const auto& r : _slot.ranges)
		{
			for(uint32_t i = r.begin; i < r.end; ++i, ++at)
				if(_a[i] != _b[i] && std::find(_slot.hostBytes.begin(), _slot.hostBytes.end(), static_cast<uint32_t>(at)) == _slot.hostBytes.end())
					return true;
		}
		return false;
	}

	// The host bytes of every slot put back from _from into _to (a write while the machine follows the host)
	inline void keepHostBytes(const md::MachineModel _model, std::vector<uint8_t>& _to, const std::vector<uint8_t>& _from)
	{
		for(const auto& s : patchSlots(_model))
		{
			if(s.hostBytes.empty())
				continue;
			size_t at = 0;
			for(const auto& r : s.ranges)
				for(uint32_t i = r.begin; i < r.end; ++i, ++at)
					if(std::find(s.hostBytes.begin(), s.hostBytes.end(), static_cast<uint32_t>(at)) != s.hostBytes.end())
						_to[i] = _from[i];
		}
	}

	// The slots whose bytes are the same in two memories (two looks: a slot read whole, not torn by a save under way)
	// (_followsHost: the host bytes may differ: a DAW's tempo ramp never holds back a real save of the global)
	inline bool slotSame(const md::MachineModel _model, const Key& _key, const std::vector<uint8_t>& _a, const std::vector<uint8_t>& _b,
		const bool _followsHost = false)
	{
		const auto* s = findSlot(_model, _key);
		return s && _a.size() == md::g_patchRamStateSize && _b.size() == md::g_patchRamStateSize && !slotDiffers(*s, _a, _b, _followsHost);
	}

	// The patch RAM slots that differ between two memories (what saves changed since the base)
	inline std::vector<Key> changedSlots(const md::MachineModel _model, const std::vector<uint8_t>& _base, const std::vector<uint8_t>& _now,
		const bool _followsHost = false)
	{
		std::vector<Key> out;
		if(_base.size() != md::g_patchRamStateSize || _now.size() != md::g_patchRamStateSize)
			return out;
		for(const auto& s : patchSlots(_model))
			if(slotDiffers(s, _base, _now, _followsHost))
				out.push_back(s.key);
		return out;
	}

	// The flash sectors that differ between two copies (n at n x 64 KiB), within the machine's saved sectors
	inline std::vector<Key> changedSectors(const md::MachineModel _model, const std::vector<uint8_t>& _base, const std::vector<uint8_t>& _now)
	{
		std::vector<Key> out;
		const auto n = static_cast<uint32_t>(std::min(_base.size(), _now.size()) / g_sectorSize);
		for(uint32_t i = 0; i < n; ++i)
			if(sectorValid(_model, i) && std::memcmp(_base.data() + size_t{i} * g_sectorSize, _now.data() + size_t{i} * g_sectorSize, g_sectorSize) != 0)
				out.push_back({Kind::Sector, i});
		return out;
	}

	// The look's signature of what a save changes: the patch RAM but the unwatched ranges, then _more (the MM's user
	// flash: its DigiPRO waveforms)
	inline uint64_t signature(const md::MachineModel _model, const std::vector<uint8_t>& _patch, const uint8_t* _more, const size_t _moreSize)
	{
		uint64_t h = 0xcbf29ce484222325ull;
		size_t at = 0;
		for(const auto& r : unwatched(_model))
		{
			const size_t b = std::min<size_t>(r.begin, _patch.size()), e = std::min<size_t>(r.end, _patch.size());
			if(b > at)
				h = hash(_patch.data() + at, b - at, h);
			at = std::max(at, e);
		}
		if(at < _patch.size())
			h = hash(_patch.data() + at, _patch.size() - at, h);
		return hash(_more, _moreSize, h);
	}

	// ---- The file: the saved slots

	struct Entry
	{
		uint64_t savedAt = 0;			// when it was saved (ms since 1970)
		std::vector<uint8_t> bytes;
	};
	using Store = std::map<Key, Entry>;

	// An entry this editor cannot use: a kind or flags it does not know (a newer minor's), a slot of another size or one
	// it does not have. It is not laid over the memory and is written back as it was, so a newer editor's saves
	// survive an older one's writes; a save of the same slot by this editor replaces it.
	struct ForeignEntry
	{
		uint8_t kind = 0;
		uint8_t flags[3] = {0, 0, 0};
		uint32_t index = 0;
		Entry entry;
	};

	struct StoreFile
	{
		uint64_t romFingerprint = 0;	// MD: the ROM its flash sectors belong to (0: none)
		Store slots;
		std::vector<ForeignEntry> foreign;
		// The file's minor version and reserved header bytes (13-15) as read: written back while its foreign entries
		// are, so a newer minor's file keeps its label and header (an older editor then sees "newer", not "damaged")
		uint16_t minor = 0;
		uint8_t reserved[3] = {0, 0, 0};
	};

	// offset  size  field
	// 0       8     magic "MDMMMEM\0"
	// 8       2     major version (2; 0.7 wrote this and the minor as one u32 2)
	// 10      2     minor version
	// 12      1     machine: 0 Machinedrum, 1 Monomachine
	// 13      3     zero (not read: a newer minor may use them; kept with its entries)
	// 16      4     layout id (layoutId: the slot table it was written with; another one is refused)
	// 20      4     CRC-32 of everything from 24 on (md::crc32, as zlib's)
	// 24      8     the MD ROM's fingerprint (its flash sectors belong to that ROM), else 0
	// 32      4     entry count
	// 36      4     payload size (everything after the header)
	// 40      ...   entries, each sized: kind u8, flags u8 u8 u8 (zero), index u32, saved at u64, size u32, then the bytes
	inline std::vector<uint8_t> encode(const md::MachineModel _model, const StoreFile& _f)
	{
		// the foreign entries but those this editor saved again
		std::vector<const ForeignEntry*> foreign;
		for(const auto& f : _f.foreign)
			if(std::none_of(_f.slots.begin(), _f.slots.end(), [&](const auto& _s)
				{ return static_cast<uint8_t>(_s.first.kind) == f.kind && _s.first.index == f.index; }))
				foreign.push_back(&f);
		std::vector<uint8_t> out;
		size_t payload = 0;
		for(const auto& [k, e] : _f.slots)
			payload += g_entryHeaderSize + e.bytes.size();
		for(const auto* f : foreign)
			payload += g_entryHeaderSize + f->entry.bytes.size();
		out.reserve(g_headerSize + payload);
		out.insert(out.end(), g_magic, g_magic + sizeof(g_magic));
		const bool keepsNewer = !foreign.empty();
		detail::putU16(out, g_major);
		detail::putU16(out, keepsNewer ? std::max(g_minor, _f.minor) : g_minor);
		out.push_back(machineByte(_model));
		for(const auto r : _f.reserved)
			out.push_back(keepsNewer ? r : uint8_t{0});
		detail::putU32(out, layoutId(_model));
		detail::putU32(out, 0);	// the CRC, below
		detail::putU64(out, _f.romFingerprint);
		detail::putU32(out, static_cast<uint32_t>(_f.slots.size() + foreign.size()));
		detail::putU32(out, static_cast<uint32_t>(payload));
		const auto putEntry = [&out](const uint8_t _kind, const uint8_t* _flags, const uint32_t _index, const Entry& _e)
		{
			out.push_back(_kind);
			out.insert(out.end(), _flags, _flags + 3);
			detail::putU32(out, _index);
			detail::putU64(out, _e.savedAt);
			detail::putU32(out, static_cast<uint32_t>(_e.bytes.size()));
			out.insert(out.end(), _e.bytes.begin(), _e.bytes.end());
		};
		constexpr uint8_t noFlags[3] = {0, 0, 0};
		for(const auto& [k, e] : _f.slots)
			putEntry(static_cast<uint8_t>(k.kind), noFlags, k.index, e);
		for(const auto* f : foreign)
			putEntry(f->kind, f->flags, f->index, f->entry);
		const auto crc = md::crc32(out.data() + 24, out.size() - 24);
		for(int i = 0; i < 4; ++i)
			out[20 + static_cast<size_t>(i)] = static_cast<uint8_t>(crc >> (8 * i));
		return out;
	}

	struct Decoded
	{
		Problem problem = Problem::Empty;
		uint32_t version = 0;		// the file's major version (Problem::Version: older or newer than g_major)
		uint32_t minor = 0;
		StoreFile file;
	};

	// What the editor does with a file it cannot use: one it may replace (damaged, not ours, the previews' version 1:
	// moved aside with a time stamp, never deleted) or one it must leave alone (a newer version, another layout, the other
	// machine's: kept, and no write goes over it until it is moved by the person)
	inline bool replaceable(const Decoded& _d)
	{
		switch(_d.problem)
		{
		case Problem::Version: return _d.version < g_major;
		case Problem::Layout:
		case Problem::Machine: return false;
		default: return true;
		}
	}

	// The saved slots of a file of this machine, or why there are none. Never throws, reads nothing past the bytes.
	// Any minor version of this major: an entry it cannot use is skipped alone and kept (StoreFile::foreign). A file
	// written with another slot layout is refused (a slot's bytes could land on other RAM): a layout change is a major.
	inline Decoded decode(const std::vector<uint8_t>& _file, const md::MachineModel _model)
	{
		Decoded d;
		if(_file.empty())
			return d;
		if(_file.size() < 16 || std::memcmp(_file.data(), g_magic, sizeof(g_magic)) != 0)
		{
			d.problem = Problem::NotOurs;
			return d;
		}
		d.version = detail::getU32(_file.data() + 8) & 0xffffu;
		d.minor = detail::getU32(_file.data() + 8) >> 16;
		if(d.version != g_major)
		{
			d.problem = Problem::Version;
			return d;
		}
		if(_file.size() < g_headerSize)
		{
			d.problem = Problem::Corrupt;
			return d;
		}
		if(_file[12] != machineByte(_model))
		{
			d.problem = Problem::Machine;
			return d;
		}
		const auto payload = detail::getU32(_file.data() + 36);
		if(payload > g_maxPayload || _file.size() != g_headerSize + static_cast<size_t>(payload)
			|| detail::getU32(_file.data() + 20) != md::crc32(_file.data() + 24, _file.size() - 24))
		{
			d.problem = Problem::Corrupt;
			return d;
		}
		if(detail::getU32(_file.data() + 16) != layoutId(_model))
		{
			d.problem = Problem::Layout;
			return d;
		}
		StoreFile f;
		f.romFingerprint = detail::getU64(_file.data() + 24);
		f.minor = static_cast<uint16_t>(d.minor);
		std::copy(_file.begin() + 13, _file.begin() + 16, f.reserved);
		const auto count = detail::getU32(_file.data() + 32);
		size_t at = g_headerSize;
		for(uint32_t i = 0; i < count; ++i)
		{
			if(_file.size() - at < g_entryHeaderSize)
			{
				d.problem = Problem::Corrupt;
				return d;
			}
			const auto* p = _file.data() + at;
			const auto size = detail::getU32(p + 16);
			if(_file.size() - at - g_entryHeaderSize < size)
			{
				d.problem = Problem::Corrupt;
				return d;
			}
			Entry e;
			e.savedAt = detail::getU64(p + 8);
			e.bytes.assign(_file.begin() + static_cast<std::ptrdiff_t>(at + g_entryHeaderSize),
				_file.begin() + static_cast<std::ptrdiff_t>(at + g_entryHeaderSize + size));
			at += g_entryHeaderSize + size;
			const bool kindOk = p[0] >= static_cast<uint8_t>(Kind::Kit) && p[0] <= static_cast<uint8_t>(Kind::Sector);
			const Key k{static_cast<Kind>(kindOk ? p[0] : 1), detail::getU32(p + 4)};
			const bool usable = kindOk && p[1] == 0 && p[2] == 0 && p[3] == 0 && size != 0 && size == sizeOf(_model, k);
			if(!usable)
			{
				ForeignEntry fe;
				fe.kind = p[0];
				std::copy(p + 1, p + 4, fe.flags);
				fe.index = detail::getU32(p + 4);
				fe.entry = std::move(e);
				f.foreign.push_back(std::move(fe));
				continue;
			}
			if(f.slots.count(k))
			{
				d.problem = Problem::Corrupt;
				return d;
			}
			f.slots.emplace(k, std::move(e));
		}
		if(at != _file.size())
		{
			d.problem = Problem::Corrupt;
			return d;
		}
		d.problem = Problem::None;
		d.file = std::move(f);
		return d;
	}

	// Start from factory memory: every save older than _ms goes, a newer editor's entries too
	inline void dropSavedBefore(StoreFile& _f, const uint64_t _ms)
	{
		for(auto it = _f.slots.begin(); it != _f.slots.end();)
			it = it->second.savedAt < _ms ? _f.slots.erase(it) : std::next(it);
		_f.foreign.erase(std::remove_if(_f.foreign.begin(), _f.foreign.end(), [&](const ForeignEntry& _e) { return _e.entry.savedAt < _ms; }),
			_f.foreign.end());
	}

	// The notice's words for a file that cannot be used (its slots are not laid over the memory).
	inline std::string describe(const Problem _p)
	{
		switch(_p)
		{
		case Problem::None: return {};
		case Problem::Empty: return "The saved machine memory is empty.";
		case Problem::NotOurs: return "The saved machine memory is not a machine memory file.";
		case Problem::Version: return "The saved machine memory was written by another version of the editor.";
		case Problem::Machine: return "The saved machine memory belongs to the other machine.";
		case Problem::Corrupt: return "The saved machine memory is damaged (an interrupted write, or the file was changed).";
		case Problem::Layout: return "The saved machine memory was written for another memory layout.";
		}
		return {};
	}

	// A save: the slots it changed, their bytes now, merged into the store (every other slot stays as it is).
	// _sectors: the MD's whole flash or the MM's user flash (sector n at n x 64 KiB), for Sector keys.
	inline void merge(Store& _store, const md::MachineModel _model, const std::vector<Key>& _keys, const std::vector<uint8_t>& _patch,
		const std::vector<uint8_t>& _sectors, const uint64_t _savedAt)
	{
		for(const auto& k : _keys)
		{
			Entry e;
			e.savedAt = _savedAt;
			if(k.kind == Kind::Sector)
			{
				const size_t at = static_cast<size_t>(k.index) * g_sectorSize;
				if(!sectorValid(_model, k.index) || _sectors.size() < at + g_sectorSize)
					continue;
				e.bytes.assign(_sectors.begin() + static_cast<std::ptrdiff_t>(at), _sectors.begin() + static_cast<std::ptrdiff_t>(at + g_sectorSize));
			}
			else
			{
				const auto* s = findSlot(_model, k);
				if(!s || _patch.size() != md::g_patchRamStateSize)
					continue;
				e.bytes = slotBytes(*s, _patch);
			}
			_store[k] = std::move(e);
		}
	}

	// A save of patch RAM slots with the memory they changed from: a slot whose change is in its link bytes alone, and
	// that the store has, takes only those bytes; any other changed slot is taken whole.
	// _followsHost: the slots' host bytes are not this session's to save: they keep the stored slot's (another
	// instance may have saved a newer tempo), or the base's when the store has no such slot.
	inline void mergeSaved(Store& _store, const md::MachineModel _model, const std::vector<Key>& _keys, const std::vector<uint8_t>& _base,
		const std::vector<uint8_t>& _patch, const std::vector<uint8_t>& _sectors, const uint64_t _savedAt, const bool _followsHost = false)
	{
		// the host bytes as they were before this save: the stored slot's, else the base's
		std::map<Key, std::vector<uint8_t>> hostBefore;
		if(_followsHost)
		{
			for(const auto& k : _keys)
			{
				const auto* s = k.kind == Kind::Sector ? nullptr : findSlot(_model, k);
				if(!s || s->hostBytes.empty())
					continue;
				const auto it = _store.find(k);
				hostBefore[k] = it != _store.end() ? it->second.bytes : (_base.size() == md::g_patchRamStateSize ? slotBytes(*s, _base) : std::vector<uint8_t>{});
			}
		}
		std::vector<Key> whole;
		for(const auto& k : _keys)
		{
			const auto* s = k.kind == Kind::Sector ? nullptr : findSlot(_model, k);
			const auto it = _store.find(k);
			if(!s || s->links.empty() || it == _store.end() || _base.size() != md::g_patchRamStateSize)
			{
				whole.push_back(k);
				continue;
			}
			const auto before = slotBytes(*s, _base), now = slotBytes(*s, _patch);
			bool linksOnly = true;
			for(size_t i = 0; i < now.size() && linksOnly; ++i)
				if(before[i] != now[i] && std::find(s->links.begin(), s->links.end(), static_cast<uint32_t>(i)) == s->links.end())
					linksOnly = false;
			if(!linksOnly)
			{
				whole.push_back(k);
				continue;
			}
			for(const auto at : s->links)
				if(at < now.size() && before[at] != now[at])
					it->second.bytes[at] = now[at];
			it->second.savedAt = _savedAt;
		}
		merge(_store, _model, whole, _patch, _sectors, _savedAt);
		for(const auto& [k, before] : hostBefore)
		{
			const auto* s = findSlot(_model, k);
			auto& bytes = _store[k].bytes;
			for(const auto at : s->hostBytes)
				if(at < bytes.size() && at < before.size())
					bytes[at] = before[at];
		}
	}

	// The store laid over a memory: each saved slot's bytes in place, but the _skip ones (the standalone's own saves
	// the file lacks). _sectors as for merge (null: none). Returns whether anything changed.
	inline bool overlay(const Store& _store, const md::MachineModel _model, std::vector<uint8_t>& _patch, std::vector<uint8_t>* _sectors,
		const std::set<Key>& _skip = {})
	{
		bool changed = false;
		for(const auto& [k, e] : _store)
		{
			if(_skip.count(k))
				continue;
			if(k.kind == Kind::Sector)
			{
				const size_t at = static_cast<size_t>(k.index) * g_sectorSize;
				if(!_sectors || _sectors->size() < at + g_sectorSize || e.bytes.size() != g_sectorSize)
					continue;
				if(std::memcmp(_sectors->data() + at, e.bytes.data(), g_sectorSize) != 0)
				{
					std::copy(e.bytes.begin(), e.bytes.end(), _sectors->begin() + static_cast<std::ptrdiff_t>(at));
					changed = true;
				}
				continue;
			}
			const auto* s = findSlot(_model, k);
			if(!s || e.bytes.size() != s->size || _patch.size() != md::g_patchRamStateSize)
				continue;
			if(slotBytes(*s, _patch) != e.bytes)
			{
				putSlot(*s, _patch, e.bytes);
				changed = true;
			}
		}
		return changed;
	}

	// The saved slots whose bytes differ from a memory's (a standalone state from before I-024 against the file)
	inline std::vector<Key> conflicts(const Store& _store, const md::MachineModel _model, const std::vector<uint8_t>& _patch,
		const std::vector<uint8_t>& _sectors)
	{
		std::vector<Key> out;
		for(const auto& [k, e] : _store)
		{
			if(k.kind == Kind::Sector)
			{
				const size_t at = static_cast<size_t>(k.index) * g_sectorSize;
				if(_sectors.size() >= at + g_sectorSize && std::memcmp(_sectors.data() + at, e.bytes.data(), g_sectorSize) != 0)
					out.push_back(k);
				continue;
			}
			const auto* s = findSlot(_model, k);
			if(s && _patch.size() == md::g_patchRamStateSize && slotBytes(*s, _patch) != e.bytes)
				out.push_back(k);
		}
		return out;
	}

	// ---- When to write. One look a second gives the memory's signature (its hash); the watch writes when the memory
	// differs from what was last written and has been quiet for one look, or at the latest maxDelayMs after the first
	// change while it keeps changing. The write itself takes only the slots that differ from the base.
	class Watch
	{
	public:
		explicit Watch(const double _maxDelayMs = 10000.0) : m_maxDelayMs(_maxDelayMs) {}

		void base(const uint64_t _signature)
		{
			m_written = _signature;
			m_seen = _signature;
			m_changedAt.reset();
			m_based = true;
		}

		void reset()
		{
			m_based = false;
			m_changedAt.reset();
		}

		bool based() const { return m_based; }

		// One look; true: write now (then call written with the signature the write saved).
		bool look(const uint64_t _signature, const double _nowMs)
		{
			if(!m_based)
				return false;
			if(m_soon)
			{
				m_seen = _signature;
				return true;
			}
			if(_signature == m_written)
			{
				m_seen = _signature;
				m_changedAt.reset();
				return false;
			}
			if(!m_changedAt)
				m_changedAt = _nowMs;
			const bool quiet = _signature == m_seen;
			m_seen = _signature;
			return quiet || _nowMs - *m_changedAt >= m_maxDelayMs;
		}

		void written(const uint64_t _signature) { base(_signature); m_soon = false; }

		// Look for saves to write at the next look that has a base, changed or not (KEEP MEMORY turned on again)
		void writeSoon() { m_soon = true; }
		bool wantsWrite() const { return m_based && m_soon; }

		// A change seen that is not written yet
		bool pending() const { return m_based && (m_soon || m_seen != m_written); }
		bool differs(const uint64_t _signature) const { return m_based && (m_soon || _signature != m_written); }

	private:
		double m_maxDelayMs;
		uint64_t m_written = 0;
		uint64_t m_seen = 0;
		std::optional<double> m_changedAt;
		bool m_based = false;
		bool m_soon = false;
	};

	// Whether a state given to the plug-in is a project whose memory wins over the file: a DAW project's is; the
	// standalone's own state (JUCE saves it when the app quits) is not (Radek, 2026-10-12: one memory for everything, like
	// a real machine).
	inline bool stateIsProject(const bool _standalone) { return !_standalone; }

	// What the standalone's own state knows of the file (its "MMEM" chunk, version 2; a DAW project's is never read):
	// the saves it holds that the file lacks (a write failed, or KEEP MEMORY was off). At its next start they win over
	// the file's slots and are written.
	struct Mark
	{
		std::vector<Key> pending;
	};

	// How a session's memory starts (the processor's decision, pure)
	enum class Start : uint8_t
	{
		Wait,		// no machine with a ROM (and, MD, its factory flash) yet
		Project,	// a DAW project's state came: it is the memory
		Off,		// KEEP MEMORY off, or no folder (an isolated test): the memory the session has
		Overlay,	// the file's slots laid over the memory the session has (factory, or the standalone's own)
	};

	struct StartFacts
	{
		bool projectState = false;		// a DAW project's state came
		bool machineReady = false;
		bool keep = true;
		bool folder = true;
	};

	inline Start startOf(const StartFacts& _f)
	{
		if(_f.projectState)
			return Start::Project;
		if(!_f.keep || !_f.folder)
			return Start::Off;
		if(!_f.machineReady)
			return Start::Wait;
		return Start::Overlay;
	}
}
