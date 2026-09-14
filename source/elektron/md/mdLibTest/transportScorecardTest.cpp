#include "mdLib/mdtransportdiagnostics.h"

#include <array>
#include <iostream>
#include <stdexcept>
#include <type_traits>

namespace
{
	void require(const bool condition, const char* message)
	{
		if(!condition)
			throw std::runtime_error(message);
	}

	void testLinkTotals()
	{
		using Score = md::LinkDirectionScore;
		constexpr std::array<uint64_t Score::*, 14> dispositions{{
			&Score::acceptedFrames, &Score::receiverDisabledDrops,
			&Score::mmMixerDmaInactiveDrops, &Score::mmProducerDmaInactiveDrops,
			&Score::mmRetainedPrefixDrops, &Score::mdRendezvousRetainedDrops,
			&Score::mdRendezvousUnreleasedDrops, &Score::mdRendezvousDmaInactiveDrops,
			&Score::mdRendezvousRingFullDrops, &Score::mdWindowOpenedDuringCatchUpDrops,
			&Score::mmStrobeChangedDuringCatchUpDrops, &Score::mdReceiverOverrunDrops,
			&Score::mdPostFlushRetainedDrops, &Score::ringFullDrops
		}};
		Score score;
		uint64_t expected = 0;
		for(size_t i = 0; i < dispositions.size(); ++i)
		{
			const uint64_t value = uint64_t{1} << (32 + i);
			score.*dispositions[i] = value;
			expected += value;
			require(score.dispositionTotal() == expected,
				"link disposition omitted, duplicated or truncated");
		}
		score.stallPurgedFrames = uint64_t{1} << 34;
		score.mdWindowPurgedFrames = 7;
		score.mmStrobePurgedFrames = 11;
		require(score.purgedFrames() == (uint64_t{1} << 34) + 18,
			"queue purge total omitted, duplicated or truncated");
		require(score.dispositionTotal() == expected,
			"queue purges were incorrectly counted as transmit dispositions");
	}

	void testSchedulerTotals()
	{
		using Score = md::SchedulerPathScore;
		constexpr std::array<uint64_t Score::*, 8> outcomes{{
			&Score::originUnavailable, &Score::timeUnavailable,
			&Score::alreadyAtTarget, &Score::reentrant, &Score::reachedTarget,
			&Score::hitClamp, &Score::stoppedByBackpressure, &Score::unexpectedShort
		}};
		Score score;
		uint64_t expected = 0;
		for(size_t i = 0; i < outcomes.size(); ++i)
		{
			const uint64_t value = uint64_t{1} << (32 + i);
			score.*outcomes[i] = value;
			expected += value;
			require(score.outcomeTotal() == expected,
				"scheduler outcome omitted, duplicated or truncated");
		}
		score.requestedCycles = 123;
		score.executedCycles = 456;
		require(score.outcomeTotal() == expected,
			"scheduler cycle totals were counted as call outcomes");
	}

	void testSnapshotValueSemantics()
	{
		static_assert(std::is_trivially_copyable_v<md::TransportScorecard>);
		md::TransportScorecard score;
		require(score.enabled == (MD_TRANSPORT_DIAGNOSTICS != 0),
			"scorecard feature flag does not match its build configuration");
		require(score.link[0].dispositionTotal() == 0
			&& score.link[1].dispositionTotal() == 0
			&& score.backgroundUc.outcomeTotal() == 0,
			"new scorecard contains nonzero counters");
		auto snapshot = score;
		snapshot.link[0].acceptedFrames = 17;
		snapshot.inlineHdi08[1].reachedTarget = 23;
		require(score.link[0].acceptedFrames == 0
			&& snapshot.link[1].acceptedFrames == 0
			&& score.inlineHdi08[1].reachedTarget == 0
			&& snapshot.inlineHdi08[0].reachedTarget == 0,
			"snapshot or direction counters alias one another");
	}
}

int main()
{
	try
	{
		testLinkTotals();
		testSchedulerTotals();
		testSnapshotValueSemantics();
		std::cout << "Transport scorecard arithmetic and value semantics passed; diagnostics="
			<< md::g_transportDiagnosticsEnabled << '\n';
		return 0;
	}
	catch(const std::exception& error)
	{
		std::cerr << error.what() << '\n';
		return 1;
	}
}
