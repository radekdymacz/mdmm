#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace elektronData
{
	// A Monomachine MKII DigiPRO user waveform (0.9 wave 2, doc/release/0.9/mm-digipro.md): its 0x5D dump as a value.
	//
	//   F0 00 20 3C 03 00 5D <version> <revision> <position 0-63> <name, 4 bytes> <6132 bytes, 7-bit packed> <sum> <length> F7
	//
	// 7027 bytes. The sum is the 14-bit sum of bytes 10 to the sum's own (the position byte is outside it), the length
	// is size - 10; both high 7 bits first. The data is 2044 signed 24-bit big-endian samples: one cycle at 1024 points,
	// then the same cycle at 512, 256, ... 4 points (the levels a higher note plays).
	constexpr size_t g_mmWaveDumpSize = 7027;
	constexpr size_t g_mmWaveDataSize = 6132;
	constexpr size_t g_mmWavePoints = 1024;		// level 0
	constexpr size_t g_mmWaveLevels = 9;		// 1024 to 4 points
	constexpr size_t g_mmWaveNameSize = 4;
	constexpr uint8_t g_mmWaveSlots = 64;

	struct MmWave
	{
		uint8_t version = 1;		// the machine took 1.1 (PROBES-manual-gaps.md P4)
		uint8_t revision = 1;
		uint8_t position = 0;		// 0-63
		std::array<uint8_t, g_mmWaveNameSize> name{};	// as the dump carries it (7-bit)
		std::vector<uint8_t> data;	// g_mmWaveDataSize bytes

		bool operator==(const MmWave& _o) const
		{
			return version == _o.version && revision == _o.revision && position == _o.position && name == _o.name && data == _o.data;
		}
	};

	// A complete, valid 0x5D dump (framing, size, 7-bit data, sum and length): its value, else nothing.
	std::optional<MmWave> decodeMmWave(const std::vector<uint8_t>& _sysex);
	std::vector<uint8_t> encodeMmWave(const MmWave& _wave);

	// The dump with its position byte set to _position (0-63); the position is outside the sum, so nothing else
	// changes. Unchanged when it is no waveform dump.
	std::vector<uint8_t> mmWavePlaced(const std::vector<uint8_t>& _sysex, uint8_t _position);

	// The name as the page shows it: the four characters, a byte outside the LCD's printable range as a space, the
	// spaces at the end left off ("" for a name of zeros).
	std::string mmWaveName(const MmWave& _wave);
	// "" when _name can be a waveform's name (at most four characters of the LCD's: A-Z, 0-9, space and - + . / # ),
	// lower case counting as upper; else why not.
	std::string mmWaveNameProblem(const std::string& _name);
	// Sets the name: upper case, padded with spaces to four. The caller checked it (mmWaveNameProblem).
	void setMmWaveName(MmWave& _wave, const std::string& _name);

	// The first sample of each level in the data, and its points: level 0 is 1024 points at 0, level 1 512 at 1024 ...
	constexpr size_t mmWaveLevelPoints(const size_t _level) { return g_mmWavePoints >> _level; }
	constexpr size_t mmWaveLevelStart(const size_t _level) { return 2 * g_mmWavePoints - 2 * mmWaveLevelPoints(_level); }

	// A level of the waveform as values from -1 to just under 1 (empty for a level past the last or a short data).
	std::vector<double> mmWaveLevel(const MmWave& _wave, size_t _level = 0);
	// _count points of level 0 for a drawing (each the sample at that place), -1 to 1.
	std::vector<double> mmWavePoints(const MmWave& _wave, size_t _count);

	// A waveform from one cycle of audio (the whole of _cycle, mono, any length from 8 to 65536 frames), the way C6
	// expects a file: band-limited by harmonic (level k keeps the harmonics below half its points), the DC left off,
	// the peak of level 0 at full scale less 0.1 dB, 24-bit. Nothing when the audio cannot be one (too short, too long,
	// silent, not finite); _why says which.
	std::optional<MmWave> mmWaveFromCycle(const std::vector<float>& _cycle, uint8_t _position, const std::string& _name,
		std::string& _why);
	constexpr size_t g_mmWaveMaxFrames = 65536;
}
