#pragma once

#include "mdNativeEngine.h"
#include "mdNativeTrackOracle.h"

namespace
{
	EngineProfile referenceProfile(Oracle &_oracle)
	{
		EngineProfile p;
		p.tables.resize(trackTableSize);
		for (uint32_t i = 0; i < p.tables.size(); ++i)
			p.tables[i] = signedWord(_oracle.memory.get(MemArea_X, 0x140000 + i));
		p.delay = {80000, 16384, 0, 0, 0x200000, 0x7000, 0x100000, 0x600000, 0x400000};
		for (unsigned i = 0; i < 10; ++i)
			p.eq.words[i] = signedWord(_oracle.memory.get(MemArea_Y, 0x170 + i));
		for (unsigned i = 0; i < 11; ++i)
			p.compressor.words[i] = signedWord(_oracle.memory.get(MemArea_Y, 0x17a + i));
		return p;
	}
	void initializeOutputReference(Oracle &_oracle, const EngineProfile &_p)
	{
		auto &m = _oracle.memory;
		for (uint32_t a = 0x10011a; a < 0x138000; ++a)
			m.set(MemArea_X, a, 0);
		for (uint32_t a = 0x14397d; a <= 0x14398a; ++a)
			m.set(MemArea_Y, a, 0);
		for (uint32_t a = 0x143d00; a < 0x143dc0; ++a)
			m.set(MemArea_X, a, 0);
		for (uint32_t a = 0x150; a < 0x1be; ++a)
			m.set(MemArea_Y, a, 0);
		for (unsigned i = 0; i < 9; ++i)
			m.set(MemArea_Y, 0x150 + i, uint32_t(_p.delay[i]) & 0xffffff);
		m.set(MemArea_Y, 0x15a, _p.delay[0]);
		m.set(MemArea_Y, 0x15b, _p.delay[1]);
		const auto &r = _p.reverb;
		const std::array<int32_t, 8> rev{r.highpass, r.lowpass,	   r.decay,		r.damping,
										 r.level,	 r.gateBlocks, r.delaySend, r.predelayWords};
		for (unsigned i = 0; i < rev.size(); ++i)
			m.set(MemArea_Y, 0x185 + i, uint32_t(rev[i]) & 0xffffff);
		for (unsigned i = 0; i < 10; ++i)
			m.set(MemArea_Y, 0x170 + i, uint32_t(_p.eq.words[i]) & 0xffffff);
		for (unsigned i = 0; i < 11; ++i)
			m.set(MemArea_Y, 0x17a + i, uint32_t(_p.compressor.words[i]) & 0xffffff);
		m.set(MemArea_Y, 0x143979, 0x134000);
		constexpr std::array<uint32_t, 5> diffusionBase{0x1319c0, 0x131a00, 0x131a80, 0x131b00, 0x131c00};
		constexpr std::array<uint32_t, 6> tankBase{0x130000, 0x131000, 0x132000, 0x132800, 0x133000, 0x130c00};
		for (unsigned l = 0; l < 5; ++l)
		{
			m.set(MemArea_X, 0x143992 + l, diffusionBase[l]);
			m.set(MemArea_X, 0x14399c + l, 0);
		}
		for (unsigned l = 0; l < 6; ++l)
		{
			m.set(MemArea_X, 0x1439a1 + l, tankBase[l]);
			m.set(MemArea_X, 0x1439a7 + l, tankBase[l] + 32);
			m.set(MemArea_X, 0x1439b4 + l, 0);
			m.set(MemArea_X, 0x1439ba + l, 0);
		}
		m.set(MemArea_X, 0x1439b3, 0x148000);
		m.set(MemArea_Y, 0x1b0, 0x143d00);
		m.set(MemArea_Y, 0x1bb, 0x266666);
		m.set(MemArea_Y, 0x1bd, 0x266666);
		m.set(MemArea_X, 0x640, 0x400);
	}
} // namespace
