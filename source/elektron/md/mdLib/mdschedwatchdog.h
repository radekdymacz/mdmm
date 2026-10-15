#pragma once

#include <cstdint>

namespace md
{
	// The audio thread's bound on one Hardware::advance() (1.0 review, real time 1). The scheduler loop ends when
	// the ColdFire and both DSPs reach the shared clock; each step moves the one furthest behind by at most one
	// background quantum (MD 125 us = 5.5 frames, MM 30 us = 1.3 frames), so a running machine needs about three
	// steps per quantum: under 3 a frame on the Monomachine, under 1 on the Machinedrum, plus a few hundred for a
	// DSP released after a backpressure park. The budget is 64 a frame plus 4096: far above that, so it never ends
	// a running machine's loop (the sound stays bit-exact), and small enough that a machine that stops moving
	// (its clock no longer advances) gives the host its thread back within the block instead of freezing the DAW
	// with the device lock held. A spent budget mutes the machine for good (Hardware::schedulerStalled).
	constexpr uint64_t g_schedStepsPerFrame = 64;
	constexpr uint64_t g_schedStepsBase = 4096;

	constexpr uint64_t schedStepBudget(const uint32_t _frames)
	{
		return g_schedStepsBase + g_schedStepsPerFrame * static_cast<uint64_t>(_frames);
	}

	// Runs _step until it says it is done (returns false) or _budget steps ran. True: done; false: the budget is
	// spent (the machine is stuck).
	template<typename Step>
	bool runBoundedSteps(Step&& _step, const uint64_t _budget)
	{
		for(uint64_t i = 0; i < _budget; ++i)
		{
			if(!_step())
				return true;
		}
		return false;
	}
}
