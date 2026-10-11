#include "mmKit.h"

#include "mmDump.h"
#include "mmLayout.h"

#include <algorithm>

namespace elektronData
{
	namespace
	{
		template<typename IO, typename K>
		void layout(IO& _io, K& _k)
		{
			_io.bytes(_k.name);
			_io.bytes(_k.levels);
			for(auto& t : _k.tracks)
			{
				_io.bytes(t.pages);
				_io.bytes(t.midi);
				_io.bytes(t.multiEnv);
				_io.bytes(t.extra);
			}
			_io.bytes(_k.machines);
			_io.bytes(_k.routing);
			_io.bytes(_k.x1cd);
			_io.u8(_k.mirrorMask);
			_io.u8(_k.x1d1);
			_io.bytes(_k.assignPage);
			_io.bytes(_k.assignDest);
			_io.bytes(_k.assignAdd);
			_io.u8(_k.lpfMask);
			_io.u8(_k.hpfMask);
			_io.u8(_k.portamentoMask);
			_io.bytes(_k.trigPos);
			_io.u8(_k.legatoAmp);
			_io.u8(_k.legatoFilter);
			_io.u8(_k.legatoLfo);
			_io.u8(_k.multiTrigMode);
			_io.u8(_k.multiTrigTiming);
			_io.u8(_k.splitKey);
			_io.u8(_k.splitTrack);
		}
	}

	bool MmKit::operator==(const MmKit& _o) const
	{
		return mmKitRaw(*this) == mmKitRaw(_o) && version == _o.version && revision == _o.revision && position == _o.position;
	}

	std::optional<MmKit> mmKitFromRaw(const std::vector<uint8_t>& _raw, const uint8_t _position)
	{
		if(_raw.size() != MmKit::g_rawSize)
			return std::nullopt;
		MmKit k;
		k.position = _position;
		mmLayout::Reader r(_raw);
		layout(r, k);
		return r.position() == MmKit::g_rawSize ? std::optional<MmKit>(k) : std::nullopt;
	}

	MmKit mmKitAsLoaded(MmKit _kit)
	{
		if(_kit.name[0] != 0xff)
			return _kit;
		static constexpr char g_new[8] = {'N', 'E', 'W', ' ', 'K', 'I', 'T', 0};
		for(size_t i = 0; i < sizeof(g_new); ++i)
			_kit.name[i] = static_cast<uint8_t>(g_new[i]);
		return _kit;
	}

	namespace
	{
		constexpr uint8_t g_inputBus = 0x08;
		constexpr uint8_t g_inputAudio = 0x10;

		uint16_t busWord(const MmKit& _kit) { return static_cast<uint16_t>((_kit.x1cd[1] << 8) | _kit.x1cd[2]); }
	}

	std::optional<uint8_t> mmKitInput(const MmKit& _kit, const size_t _track)
	{
		const auto r = _kit.routing[_track];
		if(r & g_inputBus)
		{
			const auto bus = (busWord(_kit) >> (2 * _track)) & 3;
			return static_cast<uint8_t>(3 + (bus ? bus : 1));
		}
		if(r & g_inputAudio)
			return static_cast<uint8_t>((r >> 6) & 3);
		return std::nullopt;
	}

	void mmSetKitInput(MmKit& _kit, const size_t _track, const std::optional<uint8_t> _input)
	{
		uint8_t r = mmRoutingOutputs(_kit.routing[_track]);
		uint16_t bus = 0;
		if(_input && *_input >= 4)
		{
			r |= g_inputBus;
			bus = static_cast<uint16_t>(std::min<int>(*_input, 6) - 3);
		}
		else if(_input)
			r |= static_cast<uint8_t>(g_inputAudio | ((*_input & 3) << 6));
		_kit.routing[_track] = r;
		if(!_input)
			return;	// none: the bus word stays (0x5C on a machine that takes no input leaves it)
		const auto shift = 2 * _track;
		const auto word = static_cast<uint16_t>((busWord(_kit) & ~(3u << shift)) | (bus << shift));
		_kit.x1cd[1] = static_cast<uint8_t>(word >> 8);
		_kit.x1cd[2] = static_cast<uint8_t>(word & 0xff);
	}

	std::vector<uint8_t> mmKitRaw(const MmKit& _kit)
	{
		mmLayout::Writer w;
		layout(w, _kit);
		return w.raw();
	}

	std::optional<MmKit> decodeMmKit(const std::vector<uint8_t>& _sysex)
	{
		const auto dump = unpackMmDump(_sysex);
		if(!dump || dump->command != g_mmKitDump)
			return std::nullopt;
		auto k = mmKitFromRaw(dump->raw, dump->position);
		if(k)
		{
			k->version = dump->version;
			k->revision = dump->revision;
		}
		return k;
	}

	std::vector<uint8_t> encodeMmKit(const MmKit& _kit)
	{
		return packMmDump({g_mmKitDump, _kit.version, _kit.revision, _kit.position, mmKitRaw(_kit)});
	}

	std::vector<uint8_t> mmKitRequest(const uint8_t _slot) { return mmRequest(0x53, _slot); }
}
