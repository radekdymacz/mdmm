#pragma once

// I-024 (wave 11 of 0.6): the machine's memory that stays for every new session, like a real machine's battery-backed
// memory (doc/modern-ux/DESIGN-machine-memory.md). Pure: the file's frame and when to write it. The processor reads
// and writes the file and runs the watch on its "machine memory" thread (mdPluginProcessor.cpp); mdMachineMemoryTest.

#include "mdLib/mdstate.h"
#include "mdLib/mdtypes.h"

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
	constexpr size_t g_headerSize = 24;
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

		inline uint32_t getU32(const std::vector<uint8_t>& _in, const size_t _at)
		{
			uint32_t v = 0;
			for(int i = 0; i < 4; ++i)
				v |= static_cast<uint32_t>(_in[_at + static_cast<size_t>(i)]) << (8 * i);
			return v;
		}
	}

	// The file: the frame (magic, version, machine, size, CRC-32), then the payload as the device state of a project's
	// "MIDI" chunk (synthLib::Plugin::getState(StateTypeGlobal)).
	inline std::vector<uint8_t> encode(const md::MachineModel _model, const std::vector<uint8_t>& _payload)
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
		detail::putU32(out, md::crc32(_payload.data(), _payload.size()));
		out.insert(out.end(), _payload.begin(), _payload.end());
		return out;
	}

	struct Decoded
	{
		Problem problem = Problem::Empty;
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
			|| detail::getU32(_file, 20) != md::crc32(_file.data() + g_headerSize, size))
		{
			d.problem = Problem::Corrupt;
			return d;
		}
		d.problem = Problem::None;
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

	// The part of the patch RAM the watch looks at. The Monomachine's firmware keeps its stack at the top of the patch RAM
	// (measured, OS 1.32B: 0x0ffd38-0x0ffd43 change by themselves seconds after the start and now and then while idle,
	// mdMachineMemoryFirmwareTest), so its top 4 KiB are no save: a change there alone writes nothing (the file still
	// holds them, as a project does). The Machinedrum's patch RAM holds still while idle (measured, OS 1.63).
	constexpr size_t g_mmStackBytes = 0x1000;
	inline size_t watchedPatchBytes(const md::MachineModel _model, const size_t _size)
	{
		return _model == md::MachineModel::Monomachine && _size > g_mmStackBytes ? _size - g_mmStackBytes : _size;
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

		void written(const uint64_t _signature) { base(_signature); }

		// A change seen that is not written yet (the instance going away writes it).
		bool pending() const { return m_based && m_seen != m_written; }

	private:
		double m_maxDelayMs;
		uint64_t m_written = 0;
		uint64_t m_seen = 0;
		std::optional<double> m_changedAt;
		bool m_based = false;
	};

	// Whether a state given to the plug-in is a project whose memory wins over the file: a DAW project's is; the
	// standalone's own state (JUCE saves it when the app quits) is not (Radek, 2026-10-12: one memory for everything, like
	// a real machine; with KEEP MEMORY on the standalone starts from the file, and keeps its own state when there is none).
	inline bool stateIsProject(const bool _standalone) { return !_standalone; }

	// How a session's memory starts (the processor's decision, pure): a project state wins; else the file when the
	// setting is on.
	enum class Start : uint8_t
	{
		Wait,		// no machine with a ROM yet
		Project,	// a project state came: it is the memory
		Off,		// the setting is off, or no folder (an isolated test)
		File,		// read the file
	};

	inline Start startOf(const bool _projectState, const bool _machineReady, const bool _keep, const bool _folder)
	{
		if(_projectState)
			return Start::Project;
		if(!_keep || !_folder)
			return Start::Off;
		if(!_machineReady)
			return Start::Wait;
		return Start::File;
	}
}
