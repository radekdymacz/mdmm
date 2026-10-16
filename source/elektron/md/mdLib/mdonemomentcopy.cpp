#include "mdonemomentcopy.h"

#include "mdhardware.h"

#include <algorithm>

namespace md
{
	void OneMomentCopy::begin(std::vector<Area> _areas)
	{
		m_areas = std::move(_areas);
		m_chunks.clear();
		m_steps = 0;
		size_t total = 0;
		for(size_t a = 0; a < m_areas.size(); ++a)
		{
			auto& area = m_areas[a];
			area.to->clear();
			area.to->reserve(area.size);
			total += area.size;
			// cut where the write marks are cut, so a chunk has one mark
			const size_t step = area.flash ? Microcontroller::g_flashMarkSize : Microcontroller::g_patchRamMarkSize;
			for(size_t at = 0; at < area.size;)
			{
				const auto end = std::min(area.size, at + step - (area.at + at) % step);
				m_chunks.push_back({a, at, end - at});
				at = end;
			}
		}
		m_maxSteps = static_cast<uint32_t>((total + g_partSize - 1) / g_partSize + 1) * g_passes;
	}

	uint64_t OneMomentCopy::markOf(const Hardware& _hardware, const Chunk& _chunk) const
	{
		const auto& area = m_areas[_chunk.area];
		return area.flash ? _hardware.flashMark(area.at + _chunk.at) : _hardware.patchRamMark(area.at + _chunk.at);
	}

	bool OneMomentCopy::copy(Hardware& _hardware, Chunk& _chunk)
	{
		auto& area = m_areas[_chunk.area];
		auto& to = *area.to;
		if(to.size() < _chunk.at + _chunk.size)
			to.resize(_chunk.at + _chunk.size);	// within the reserve: no allocation
		const bool ok = area.flash
			? _hardware.getUC().copyFlashDataRangeRealtime(to.data() + _chunk.at, area.at + _chunk.at, _chunk.size)
			: _hardware.copyPatchRamRange(to.data() + _chunk.at, area.at + _chunk.at, _chunk.size);
		_chunk.mark = markOf(_hardware, _chunk);
		_chunk.copied = true;
		_chunk.stale = false;
		return ok;
	}

	OneMomentCopy::Step OneMomentCopy::step(Hardware& _hardware)
	{
		++m_steps;
		size_t staleBytes = 0;
		for(auto& c : m_chunks)
		{
			if(!c.stale && markOf(_hardware, c) != c.mark)
				c.stale = true;
			if(c.stale)
				staleBytes += c.size;
		}
		const bool all = staleBytes <= g_partSize || m_steps >= m_maxSteps;
		size_t bytes = 0;
		for(auto& c : m_chunks)
		{
			if(!c.stale)
				continue;
			if(!all && bytes && bytes + c.size > g_partSize)
				break;
			if(!copy(_hardware, c))
				return Step::Failed;
			bytes += c.size;
		}
		return all ? Step::Done : Step::More;
	}
}
