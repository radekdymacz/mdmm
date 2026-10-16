#pragma once

// DESIGN-audio-lock.md: a copy of the machine's memory (patch RAM, flash) as it was at one moment, taken a part per hold
// of the plug-in's device lock so the audio thread never waits for a whole memory. Each step (one hold) first marks
// stale every piece written since it was copied (md::Microcontroller::patchRamMark, flashMark); when what is stale is
// no more than one part, it is copied in that hold and the copy is of that moment (Done). Else one more part is copied
// (More). After the steps a few full passes would take, the rest is copied in one hold, whatever its size.

#include <cstddef>
#include <cstdint>
#include <vector>

namespace md
{
	class Hardware;

	class OneMomentCopy
	{
	public:
		static constexpr size_t g_partSize = 64 * 1024;
		static constexpr uint32_t g_passes = 4;	// full passes' worth of steps before the rest goes in one hold

		struct Area
		{
			bool flash = false;					// the flash (offsets as copyFlashDataRangeRealtime) or the patch RAM
			std::vector<uint8_t>* to = nullptr;	// grows to size as it is copied (reserved by begin)
			size_t at = 0;
			size_t size = 0;
		};

		enum class Step { More, Done, Failed };

		// The areas to copy; reserves their buffers (no copy yet)
		void begin(std::vector<Area> _areas);
		// One hold's work, under the device lock, on the Hardware the copy is of
		Step step(Hardware& _hardware);
		bool empty() const { return m_chunks.empty(); }
		uint32_t steps() const { return m_steps; }

	private:
		struct Chunk
		{
			size_t area = 0, at = 0, size = 0;
			uint64_t mark = 0;
			bool copied = false;	// ever (the buffer has grown over it)
			bool stale = true;
		};
		uint64_t markOf(const Hardware& _hardware, const Chunk& _chunk) const;
		bool copy(Hardware& _hardware, Chunk& _chunk);

		std::vector<Area> m_areas;
		std::vector<Chunk> m_chunks;
		uint32_t m_steps = 0;
		uint32_t m_maxSteps = 0;
	};
}
