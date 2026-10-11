#pragma once

#include <array>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace md
{
	// The speed-ups of the emulation one by one (doc/md_mm_performance_diagnostics.md, "Switches for testers";
	// doc/modern-ux/RESEARCH-emulation-cpu.md). Each is bit-exact, so any set of them off gives the same machine
	// state as all on, only at another host CPU. The umbrella switch (Hardware::setSpeedUps) turns all off at once;
	// with it on, a lever in the "off" mask (Hardware::setSpeedUpLeversOff) stays off alone. All on by default.
	enum class SpeedUpLever : uint32_t
	{
		L1		= 1u << 0,	// the UC idle skip tests its inputs once per batch
		L11		= 1u << 1,	// the ColdFire memory fast lane
		L2b		= 1u << 2,	// the MD's DSP catch-ups under one execUntilCycles entry
		L5		= 1u << 3,	// the SIM steps timers and UART transmitters at their next event
		L4Nop	= 1u << 4,	// L4: NOP-only DO loop bodies skipped (silent voices)
		L4Poll	= 1u << 5,	// L4: one-block DMA poll loops skipped
		L4Cycle	= 1u << 6,	// L4: poll loops over several blocks skipped (the MD's p:3c)
		L4PortC	= 1u << 7,	// L4: poll loops on the Port C data register (block sync, MD p:bb, MM p:195)
		Cmpm	= 1u << 8,	// the JIT's cmpm fix
		// the small wins of 0.6 (RESEARCH-emulation-cpu.md, "Small wins (0.6)")
		LinkRings	= 1u << 9,	// the rings between the DSPs and the codec output ring skip their semaphores
		UcIdleProbe	= 1u << 10,	// the UC idle skip is probed right after a BRA.B -2, not at every 16th step
	};

	constexpr uint32_t g_allSpeedUpLevers = 0x7ffu;

	constexpr uint32_t bit(const SpeedUpLever _lever) { return static_cast<uint32_t>(_lever); }

	struct SpeedUpLeverInfo
	{
		SpeedUpLever lever;
		const char* key;		// the environment variable's suffix and the config key's
		const char* label;		// the Developer menu's
	};

	inline const std::array<SpeedUpLeverInfo, 11>& speedUpLevers()
	{
		static const std::array<SpeedUpLeverInfo, 11> levers{{
			{SpeedUpLever::L1,		"L1",		"L1 UC idle skip: inputs tested once per batch"},
			{SpeedUpLever::L11,		"L11",		"L11 ColdFire memory fast lane"},
			{SpeedUpLever::L2b,		"L2B",		"L2b MD DSP catch-ups in one entry"},
			{SpeedUpLever::L5,		"L5",		"L5 SIM timers and UARTs stepped at events"},
			{SpeedUpLever::L4Nop,	"L4_NOP",	"L4 skip silent-voice NOP loops"},
			{SpeedUpLever::L4Poll,	"L4_POLL",	"L4 skip one-block DMA poll loops"},
			{SpeedUpLever::L4Cycle,	"L4_CYCLE",	"L4 skip multi-block poll loops (MD p:3c)"},
			{SpeedUpLever::L4PortC,	"L4_PORTC",	"L4 skip Port C block-sync polls"},
			{SpeedUpLever::Cmpm,	"CMPM",		"CMPM fix"},
			{SpeedUpLever::LinkRings,	"LINK_RINGS",	"DSP link rings without semaphores (one thread)"},
			{SpeedUpLever::UcIdleProbe,	"UC_IDLE_PROBE",	"UC idle skip probed right after BRA.B -2"},
		}};
		return levers;
	}

	// The levers the environment turns off: GEARMULATOR_MDMM_<key>=0 for each, and the older
	// GEARMULATOR_MDMM_SIM_DEFERRAL=0 for L5. Read when a Hardware is made.
	inline uint32_t speedUpLeversOffFromEnvironment()
	{
		const auto isZero = [](const char* _name)
		{
			const auto* const v = std::getenv(_name);
			return v != nullptr && std::strcmp(v, "0") == 0;
		};
		uint32_t off = 0;
		char name[64];
		for(const auto& l : speedUpLevers())
		{
			std::snprintf(name, sizeof(name), "GEARMULATOR_MDMM_%s", l.key);
			if(isZero(name))
				off |= bit(l.lever);
		}
		if(isZero("GEARMULATOR_MDMM_SIM_DEFERRAL"))
			off |= bit(SpeedUpLever::L5);
		return off;
	}
}
