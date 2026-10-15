#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <vector>

namespace pluginLib
{
	// A project as Processor::getStateInformation writes it, as a value: the frame (the magic, the version and, in
	// version 1, the device state) and the processor's chunks (baseLib::ChunkWriter: a 4CC, a version, the data). The one
	// reader and writer of that frame besides Processor itself: parse, change chunks, write back; every byte that is not
	// a changed chunk stays as it was.
	constexpr char g_projectMagic[] = "DSP56300";
	constexpr uint32_t g_projectVersion = 2;

	struct ProjectChunk
	{
		std::array<char, 4> fourCC{};
		uint32_t version = 1;
		std::vector<uint8_t> data;

		bool operator==(const ProjectChunk& _o) const { return fourCC == _o.fourCC && version == _o.version && data == _o.data; }
		bool operator!=(const ProjectChunk& _o) const { return !(*this == _o); }
	};

	struct ProjectState
	{
		std::vector<uint8_t> header;	// the frame before the chunk block, as it was
		std::vector<ProjectChunk> chunks;
	};

	// nullopt: not such a project (another magic, a newer version, damaged)
	std::optional<ProjectState> parseProject(const std::vector<uint8_t>& _bytes);
	std::vector<uint8_t> writeProject(const ProjectState& _project);

	// A chunk block as Processor::saveCustomData writes it; nullopt when damaged
	std::optional<std::vector<ProjectChunk>> parseChunks(const std::vector<uint8_t>& _block);
	std::vector<uint8_t> writeChunks(const std::vector<ProjectChunk>& _chunks);

	const ProjectChunk* findChunk(const std::vector<ProjectChunk>& _chunks, const std::array<char, 4>& _fourCC);
	// _chunk in place of the chunk of its 4CC (at the end when there is none); none: the chunk of _fourCC removed
	void putChunk(std::vector<ProjectChunk>& _chunks, const std::array<char, 4>& _fourCC, const std::optional<ProjectChunk>& _chunk);

	// The chunks that moved from _before to _now (by 4CC) put into _chunks: changed or added ones replaced or appended,
	// gone ones removed; every other chunk stays as it is.
	void putMoved(std::vector<ProjectChunk>& _chunks, const std::vector<ProjectChunk>& _before, const std::vector<ProjectChunk>& _now);

	constexpr std::array<char, 4> fourCC(const char (&_s)[5]) { return {_s[0], _s[1], _s[2], _s[3]}; }
}
