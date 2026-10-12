#pragma once

// I-024 (wave 11 of 0.6): the machine's memory that stays for every new session, like a real machine's battery-backed
// memory (doc/modern-ux/DESIGN-machine-memory.md). Pure: the file's frame, what a save is, when to write and how a
// session starts. The processor reads
// and writes the file and runs the watch on its "machine memory" thread (mdPluginProcessor.cpp); mdMachineMemoryTest.

#include "mdLib/mdstate.h"
#include "mdLib/mdtypes.h"

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <optional>
#include <string>
#include <vector>

namespace mdJucePlugin::machineMemory
{
	// The file's name in the machine's data folder (<data folder>/memory/), and where an unusable one is moved.
	constexpr const char* g_folder = "memory";
	constexpr const char* g_fileName = "machine-memory.bin";
	constexpr const char* g_unusableName = "machine-memory.unusable.bin";

	constexpr char g_magic[8] = {'M', 'D', 'M', 'M', 'M', 'E', 'M', '\0'};
	constexpr uint32_t g_version = 1;
	constexpr size_t g_headerSize = 32;
	// Larger than any state of either machine (MD: 1 MiB patch RAM and at most 8 MiB of flash sectors with their
	// headers; MM: 3 MiB), so a size field from a broken file never asks for gigabytes.
	constexpr uint32_t g_maxPayload = 16u * 1024u * 1024u;

	// The settings key of "KEEP MEMORY" (the editor's config, default on).
	constexpr const char* g_keepKey = "keepMachineMemory";

	enum class Problem : uint8_t
	{
		None,
		Empty,		// no bytes
		NotOurs,	// another file (the magic is not ours)
		Version,	// a newer format than this editor reads
		Machine,	// the other machine's
		Corrupt		// size or CRC wrong: a broken write, a damaged or crafted file
	};

	inline uint8_t machineByte(const md::MachineModel _model)
	{
		return _model == md::MachineModel::Monomachine ? 1 : 0;
	}

	namespace detail
	{
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

		inline uint64_t getU64(const std::vector<uint8_t>& _in, const size_t _at)
		{
			uint64_t v = 0;
			for(int i = 0; i < 8; ++i)
				v |= static_cast<uint64_t>(_in[_at + static_cast<size_t>(i)]) << (8 * i);
			return v;
		}

		inline uint32_t getU32(const std::vector<uint8_t>& _in, const size_t _at)
		{
			uint32_t v = 0;
			for(int i = 0; i < 4; ++i)
				v |= static_cast<uint32_t>(_in[_at + static_cast<size_t>(i)]) << (8 * i);
			return v;
		}
	}

	// The file: the frame (magic, version, machine, the payload's size, a CRC-32 of the stamp and the payload, the stamp),
	// then the payload as the device state of a project's "MIDI" chunk (synthLib::Plugin::getState(StateTypeGlobal)).
	// The stamp names this write (never 0): a standalone's own state that knows it holds the same saved memory.
	inline std::vector<uint8_t> encode(const md::MachineModel _model, const uint64_t _stamp, const std::vector<uint8_t>& _payload)
	{
		std::vector<uint8_t> out;
		out.reserve(g_headerSize + _payload.size());
		out.insert(out.end(), g_magic, g_magic + sizeof(g_magic));
		detail::putU32(out, g_version);
		out.push_back(machineByte(_model));
		out.push_back(0);
		out.push_back(0);
		out.push_back(0);
		detail::putU32(out, static_cast<uint32_t>(_payload.size()));
		detail::putU32(out, 0);	// the CRC, below
		detail::putU64(out, _stamp);
		out.insert(out.end(), _payload.begin(), _payload.end());
		const auto crc = md::crc32(out.data() + 24, out.size() - 24);
		for(int i = 0; i < 4; ++i)
			out[20 + static_cast<size_t>(i)] = static_cast<uint8_t>(crc >> (8 * i));
		return out;
	}

	struct Decoded
	{
		Problem problem = Problem::Empty;
		uint64_t stamp = 0;
		std::vector<uint8_t> payload;
	};

	// The payload of a file of this machine, or why there is none. Never throws, reads nothing past the bytes.
	inline Decoded decode(const std::vector<uint8_t>& _file, const md::MachineModel _model)
	{
		Decoded d;
		if(_file.empty())
			return d;
		if(_file.size() < g_headerSize || std::memcmp(_file.data(), g_magic, sizeof(g_magic)) != 0)
		{
			d.problem = Problem::NotOurs;
			return d;
		}
		if(detail::getU32(_file, 8) != g_version)
		{
			d.problem = Problem::Version;
			return d;
		}
		if(_file[12] != machineByte(_model))
		{
			d.problem = Problem::Machine;
			return d;
		}
		const auto size = detail::getU32(_file, 16);
		if(_file[13] != 0 || _file[14] != 0 || _file[15] != 0 || size == 0 || size > g_maxPayload
			|| _file.size() != g_headerSize + static_cast<size_t>(size)
			|| detail::getU32(_file, 20) != md::crc32(_file.data() + 24, _file.size() - 24))
		{
			d.problem = Problem::Corrupt;
			return d;
		}
		d.problem = Problem::None;
		d.stamp = detail::getU64(_file, 24);
		d.payload.assign(_file.begin() + static_cast<std::ptrdiff_t>(g_headerSize), _file.end());
		return d;
	}

	// The notice's words for a file that cannot be used (the machine then starts from factory memory).
	inline std::string describe(const Problem _p)
	{
		switch(_p)
		{
		case Problem::None: return {};
		case Problem::Empty: return "The saved machine memory is empty.";
		case Problem::NotOurs: return "The saved machine memory is not a machine memory file.";
		case Problem::Version: return "The saved machine memory was written by a newer version of the editor.";
		case Problem::Machine: return "The saved machine memory belongs to the other machine.";
		case Problem::Corrupt: return "The saved machine memory is damaged (an interrupted write, or the file was changed).";
		}
		return {};
	}

	// 64-bit FNV-1a, for the watch's looks (not stored anywhere)
	inline uint64_t hash(const uint8_t* _data, const size_t _size, uint64_t _h = 0xcbf29ce484222325ull)
	{
		for(size_t i = 0; i < _size; ++i)
		{
			_h ^= _data[i];
			_h *= 0x100000001b3ull;
		}
		return _h;
	}

	// What a save is (Radek, 2026-10-12): a kit, pattern, song or global stored into a slot, from the page or the machine's
	// own keys. Knob moves, automation and unsaved edits of the kit that plays are none. The watch looks at the patch RAM
	// but these ranges, measured on the firmware (mdMachineMemoryFirmwareTest's probe, MDMM_MEMORY_PROBE=1):
	//   the working area at the bottom: the kit that plays with its unsaved edits, its second copy (what LOAD KIT and
	//     SAVE KIT go through) and the current slot numbers; every knob, CC and automation lands here. The stored kit
	//     slots start right after it (MD slot 1 at 0x8c8, 0x460 a kit; MM slot 1 at 0x5a2, 0x2b4 a kit);
	//   the pattern that was loaded last (two bytes LOAD PATTERN writes, MD 0x272be, MM 0x16ae3): no save;
	//   MD 0x7fff0-0x7fff7: a byte that moves while it plays; MM: the firmware's stack, the top 4 KiB (it changes by
	//     itself, now and then).
	// The file still holds the whole memory, as a project does: what the watch skips is written with the next save.
	struct Range
	{
		uint32_t begin;
		uint32_t end;
	};

	inline std::vector<Range> unwatched(const md::MachineModel _model)
	{
		if(_model == md::MachineModel::Monomachine)
			return {{0x000000, 0x0005a0}, {0x016ae3, 0x016ae5}, {0x0ff000, 0x100000}};
		return {{0x000000, 0x0008c8}, {0x0272be, 0x0272c0}, {0x07fff0, 0x07fff8}};
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

	// When to write. One look a second gives the memory's signature (its hash); the watch writes when the memory
	// differs from what was last written and has been quiet for one look, or at the latest maxDelayMs after the first
	// change while it keeps changing. A base is the memory a session has when the watch starts (after the machine
	// started, a project or the file was restored, or a write).
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

		// Write at the next look that has a base, changed or not (KEEP MEMORY turned on again, a standalone's own saves
		// the file does not have)
		void writeSoon() { m_soon = true; }
		bool wantsWrite() const { return m_based && m_soon; }

		// A change seen that is not written yet (the instance going away writes it).
		bool pending() const { return m_based && (m_soon || m_seen != m_written); }
		// A signature (a last look's) that differs from what was written
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

	// What a memory knows of the file (the processor's "MMEM" chunk, in the standalone's own state and in projects): the
	// stamp of the file it holds the saves of (0: none) and whether it holds saves the file does not have (a write
	// failed: no permission, disk full).
	struct Mark
	{
		uint64_t stamp = 0;
		bool unsaved = false;
	};

	// How a session's memory starts (the processor's decision, pure)
	enum class Start : uint8_t
	{
		Wait,		// no machine with a ROM yet
		Project,	// a DAW project's state came: it is the memory
		Off,		// KEEP MEMORY off, no folder (an isolated test), or no file: the memory the session has
		File,		// the file's memory
		Own,		// the standalone's own state: it holds the file's saves (the same stamp) and maybe unsaved edits of the
					// kit that plays, or saves the file does not have (then it is written at once)
	};

	struct StartFacts
	{
		bool projectState = false;		// a DAW project's state came
		bool machineReady = false;
		bool keep = true;
		bool folder = true;
		bool file = false;				// a usable file is there
		uint64_t fileStamp = 0;
		std::optional<Mark> own;		// the standalone's own state's mark (none: no own state, or one from before I-024)
	};

	// Never loses a save: the standalone's own state wins when it holds every save of the file (the same stamp) or saves
	// the file lacks (unsaved); else the file is newer (another instance saved since), and its saves win.
	inline Start startOf(const StartFacts& _f)
	{
		if(_f.projectState)
			return Start::Project;
		if(!_f.keep || !_f.folder)
			return Start::Off;
		if(!_f.machineReady)
			return Start::Wait;
		if(_f.own && (_f.own->unsaved || (_f.file && _f.own->stamp == _f.fileStamp)))
			return Start::Own;
		return _f.file ? Start::File : Start::Off;
	}
}
