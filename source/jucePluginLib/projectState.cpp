#include "projectState.h"

#include "baseLib/binarystream.h"

#include <algorithm>
#include <exception>

namespace pluginLib
{
	std::optional<ProjectState> parseProject(const std::vector<uint8_t>& _bytes)
	{
		try
		{
			baseLib::BinaryStream s(_bytes);
			if(!s.checkString(g_projectMagic))
				return {};
			(void)s.readString();
			const auto version = s.read<uint32_t>();
			if(version < 1 || version > g_projectVersion)
				return {};
			if(version == 1)
			{
				std::vector<uint8_t> deviceState;
				s.read(deviceState);
			}
			ProjectState p;
			const auto headerEnd = s.getReadPos();
			p.header.assign(_bytes.begin(), _bytes.begin() + static_cast<std::ptrdiff_t>(headerEnd));
			std::vector<uint8_t> block;
			s.read(block);
			if(s.getReadPos() != _bytes.size())
				return {};
			auto chunks = parseChunks(block);
			if(!chunks)
				return {};
			p.chunks = std::move(*chunks);
			return p;
		}
		catch(const std::exception&)
		{
			return {};
		}
	}

	std::vector<uint8_t> writeProject(const ProjectState& _project)
	{
		baseLib::BinaryStream out;
		out.write(_project.header.data(), _project.header.size());
		out.write(writeChunks(_project.chunks));
		std::vector<uint8_t> result;
		out.toVector(result);
		return result;
	}

	std::optional<std::vector<ProjectChunk>> parseChunks(const std::vector<uint8_t>& _block)
	{
		std::vector<ProjectChunk> chunks;
		if(_block.empty())
			return chunks;
		try
		{
			baseLib::BinaryStream s(_block);
			while(!s.endOfStream())
			{
				baseLib::Chunk c;
				c.read(s);	// throws when the chunk runs past the block
				ProjectChunk p;
				std::copy(c.fourCC, c.fourCC + 4, p.fourCC.begin());
				p.version = c.version;
				p.data.resize(c.length);
				c.data.read(p.data.data(), p.data.size());
				chunks.push_back(std::move(p));
			}
			return chunks;
		}
		catch(const std::exception&)
		{
			return {};
		}
	}

	std::vector<uint8_t> writeChunks(const std::vector<ProjectChunk>& _chunks)
	{
		baseLib::BinaryStream s;
		for(const auto& c : _chunks)
		{
			s.write(c.fourCC.data(), c.fourCC.size());
			s.write(c.version);
			s.write(static_cast<baseLib::Chunk::SizeType>(c.data.size()));
			s.write(c.data.data(), c.data.size());
		}
		std::vector<uint8_t> block;
		s.toVector(block);
		return block;
	}

	const ProjectChunk* findChunk(const std::vector<ProjectChunk>& _chunks, const std::array<char, 4>& _fourCC)
	{
		const auto it = std::find_if(_chunks.begin(), _chunks.end(), [&](const ProjectChunk& _c) { return _c.fourCC == _fourCC; });
		return it == _chunks.end() ? nullptr : &*it;
	}

	void putChunk(std::vector<ProjectChunk>& _chunks, const std::array<char, 4>& _fourCC, const std::optional<ProjectChunk>& _chunk)
	{
		const auto it = std::find_if(_chunks.begin(), _chunks.end(), [&](const ProjectChunk& _c) { return _c.fourCC == _fourCC; });
		if(it == _chunks.end())
		{
			if(_chunk)
				_chunks.push_back(*_chunk);
			return;
		}
		if(_chunk)
			*it = *_chunk;
		else
			_chunks.erase(it);
	}

	void putMoved(std::vector<ProjectChunk>& _chunks, const std::vector<ProjectChunk>& _before, const std::vector<ProjectChunk>& _now)
	{
		for(const auto* list : {&_before, &_now})
		{
			for(const auto& c : *list)
			{
				const auto* a = findChunk(_now, c.fourCC);
				const auto* b = findChunk(_before, c.fourCC);
				if(a && b && *a == *b)
					continue;
				putChunk(_chunks, c.fourCC, a ? std::optional<ProjectChunk>(*a) : std::nullopt);
			}
		}
	}
}
