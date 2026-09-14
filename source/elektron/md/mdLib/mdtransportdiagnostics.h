#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#ifndef MD_TRANSPORT_DIAGNOSTICS
#define MD_TRANSPORT_DIAGNOSTICS 0
#endif

namespace md
{
	inline constexpr bool g_transportDiagnosticsEnabled =
		MD_TRANSPORT_DIAGNOSTICS != 0;

	// One and only one disposition is recorded for every inter-DSP ESSI0
	// transmit callback. Direction 0 is mixer -> producer; direction 1 is
	// producer -> mixer.
	struct LinkDirectionScore
	{
		uint64_t transmitFrames = 0;
		uint64_t acceptedFrames = 0;
		uint64_t receiverDisabledDrops = 0;
		uint64_t mmMixerDmaInactiveDrops = 0;
		uint64_t mmProducerDmaInactiveDrops = 0;
		uint64_t mmRetainedPrefixDrops = 0;
		uint64_t mdRendezvousRetainedDrops = 0;
		uint64_t mdRendezvousUnreleasedDrops = 0;
		uint64_t mdRendezvousDmaInactiveDrops = 0;
		uint64_t mdRendezvousRingFullDrops = 0;
		uint64_t mdWindowOpenedDuringCatchUpDrops = 0;
		uint64_t mmStrobeChangedDuringCatchUpDrops = 0;
		uint64_t mdReceiverOverrunDrops = 0;
		uint64_t mdPostFlushRetainedDrops = 0;
		uint64_t ringFullDrops = 0;

		uint64_t receiveCallbacks = 0;
		uint64_t poppedFrames = 0;
		uint64_t emptyReads = 0;
		uint64_t stallPurgedFrames = 0;
		uint64_t mdWindowPurgedFrames = 0;
		uint64_t mmStrobePurgedFrames = 0;
		size_t initialRingDepth = 0;
		size_t currentRingDepth = 0;
		size_t maximumRingDepth = 0;

		uint64_t dispositionTotal() const noexcept
		{
			return acceptedFrames + receiverDisabledDrops
				+ mmMixerDmaInactiveDrops + mmProducerDmaInactiveDrops
				+ mmRetainedPrefixDrops + mdRendezvousRetainedDrops
				+ mdRendezvousUnreleasedDrops + mdRendezvousDmaInactiveDrops
				+ mdRendezvousRingFullDrops + mdWindowOpenedDuringCatchUpDrops
				+ mmStrobeChangedDuringCatchUpDrops + mdReceiverOverrunDrops
				+ mdPostFlushRetainedDrops + ringFullDrops;
		}

		uint64_t purgedFrames() const noexcept
		{
			return stallPurgedFrames + mdWindowPurgedFrames
				+ mmStrobePurgedFrames;
		}
	};

	struct SchedulerPathScore
	{
		uint64_t calls = 0;
		uint64_t originUnavailable = 0;
		uint64_t timeUnavailable = 0;
		uint64_t alreadyAtTarget = 0;
		uint64_t reentrant = 0;
		uint64_t reachedTarget = 0;
		uint64_t hitClamp = 0;
		uint64_t stoppedByBackpressure = 0;
		uint64_t unexpectedShort = 0;
		uint64_t requestedCycles = 0;
		uint64_t executedCycles = 0;
		uint64_t maximumRequestedCycles = 0;
		uint64_t maximumExecutedCycles = 0;

		uint64_t outcomeTotal() const noexcept
		{
			return originUnavailable + timeUnavailable + alreadyAtTarget
				+ reentrant + reachedTarget + hitClamp
				+ stoppedByBackpressure + unexpectedShort;
		}
	};

	struct TransportScorecard
	{
		bool enabled = g_transportDiagnosticsEnabled;
		std::array<LinkDirectionScore, 2> link;
		SchedulerPathScore backgroundUc;
		std::array<SchedulerPathScore, 2> backgroundDsp;
		std::array<SchedulerPathScore, 2> coldFireToDsp;
		std::array<SchedulerPathScore, 2> dspToDsp;
		// Bounded runs inside the HI08 bridge are separate from the three
		// machine scheduler paths above.
		std::array<SchedulerPathScore, 2> inlineHdi08;
		std::array<uint64_t, 2> mmBackpressureParkDecisions{};
		uint64_t idleSelfBranchInstructions = 0;

		bool mdRendezvousActive = false;
		bool mdPortCEdgePending = false;
		uint64_t mdFlushEpoch = 0;
		uint64_t mdPortCReleaseEpoch = 0;
		bool mmAwaitingFreshResponse = false;
		uint64_t mmStrobeEpoch = 0;
	};
}
