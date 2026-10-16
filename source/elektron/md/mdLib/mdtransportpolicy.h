#pragma once

#include "mdtypes.h"

#include <cstddef>
#include <cstdint>

namespace md
{
	// Scheduling and host-port limits used to interleave the ColdFire and two
	// DSPs on one host thread. These values preserve the current runtime
	// behavior; keeping them together makes model differences and units explicit.
	struct TransportPolicy
	{
		double backgroundQuantumMicroseconds;
		uint64_t catchUpMaxDspCycles;
		size_t hostReceiveIrqMinWords;
		size_t hostReceiveQueueCapacityWords;
		size_t hostTransmitBackpressureThresholdWords;
		uint64_t hostTransmitBackpressureReleaseUcCycles;
		// The serial clock wakes the DSP at the exact cycle of its next slot instead of at half the remaining
		// cycles converted to instructions (dsp56k::EsxiClock::usesExactCycleDeadline). The first value is the
		// default emulation, the second the one with L3 opted in (md::Hardware::setExactEssiTiming, and only with
		// the speed-ups on): on the Machinedrum L3 (doc/modern-ux/RESEARCH-emulation-cpu.md 3.4) changes its
		// audio, so it is off unless asked for; the Monomachine has always run exact.
		bool exactEssiCycleDeadlines;
		bool exactEssiCycleDeadlinesL3;

		bool exactEssiCycleDeadlinesFor(const bool _l3) const
		{
			return _l3 ? exactEssiCycleDeadlinesL3 : exactEssiCycleDeadlines;
		}
	};

	// The background quantum bounds how far one processor runs ahead of the others between two host-port accesses.
	// A DSP that runs ahead of the ColdFire takes the ColdFire's host words late in its own time: on the Machinedrum at
	// 125 us (upstream's value until 0.8) a trig and the LFO values that come with it could land on either side of the
	// DSP's start of the note, and a kick whose PTCH three LFOs move in TRIG mode played some hits without its sweep
	// (beta report 2026-10-16, stackedLfoFirmwareTest: at 64-frame host blocks 11 of 64 hits had no sweep and 10 half of
	// it; how many moved with the host's block size). 30 us, the Monomachine's value, plays every hit at every block size;
	// the host cost stays the same (mdmmPerfGateTest instructions per frame). It changes the MD's playing goldens.
	constexpr TransportPolicy transportPolicy(const MachineModel _model)
	{
		return _model == MachineModel::Monomachine
			? TransportPolicy{30.0, 100'000, 1, 16, 4, 200'000, true, true}
			: TransportPolicy{30.0, 100'000, 3, 16, 4, 200'000, false, true};
	}
}
