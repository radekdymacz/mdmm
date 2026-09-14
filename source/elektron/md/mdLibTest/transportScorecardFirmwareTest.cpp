#include "mdLib/mdhardware.h"
#include "mdLib/mdromloader.h"

#include "baseLib/filesystem.h"

#include <array>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace
{
	void require(const bool _condition, const std::string& _message)
	{
		if(!_condition)
			throw std::runtime_error(_message);
	}

	void verifySchedulerPath(const md::SchedulerPathScore& _score,
		const std::string& _name)
	{
		require(_score.calls == _score.outcomeTotal(),
			_name + " scheduler outcomes do not account for every call");
		require(_score.maximumRequestedCycles <= _score.requestedCycles,
			_name + " maximum requested cycles exceed the total");
		require(_score.maximumExecutedCycles <= _score.executedCycles,
			_name + " maximum executed cycles exceed the total");
	}

	void printSchedulerPath(const md::SchedulerPathScore& _score,
		const std::string& _name)
	{
		std::cout << "  " << _name << ": calls=" << _score.calls
			<< " target=" << _score.reachedTarget
			<< " clamp=" << _score.hitClamp
			<< " backpressure=" << _score.stoppedByBackpressure
			<< " no-work=" << (_score.originUnavailable + _score.timeUnavailable
				+ _score.alreadyAtTarget + _score.reentrant)
			<< " unexpected=" << _score.unexpectedShort
			<< " cycles=" << _score.executedCycles << '/' << _score.requestedCycles
			<< " max=" << _score.maximumExecutedCycles << '/'
			<< _score.maximumRequestedCycles << '\n';
	}

	void verifyFirmware(const char* const _label, const char* const _path,
		const md::MachineModel _model)
	{
		std::vector<uint8_t> firmware;
		require(baseLib::filesystem::readFile(firmware, _path),
			std::string(_label) + " firmware could not be read");
		require(md::RomLoader::isRomForModel(firmware, _model),
			std::string(_label) + " firmware fingerprint mismatch");

		auto hardware = std::make_unique<md::Hardware>(firmware, _path, _model);
		require(hardware->isValid(), std::string(_label) + " hardware is invalid");
		for(uint32_t frames = 0; frames < md::g_samplerate * 30
			&& !hardware->isAudioReady(); frames += 128)
			hardware->advance(128);
		require(hardware->isAudioReady(), std::string(_label) + " DSP boot timed out");
		hardware->advance(md::g_samplerate * 2);

		const auto score = hardware->getTransportScorecard();
		require(score.enabled, "transport diagnostics were not compiled in");
		std::cout << _label << " transport scorecard\n";
		for(size_t direction = 0; direction < score.link.size(); ++direction)
		{
			const auto& link = score.link[direction];
			const std::string name = direction == 0
				? "mixer->producer" : "producer->mixer";
			require(link.transmitFrames == link.dispositionTotal(),
				std::string(_label) + ' ' + name
					+ " dispositions do not account for every transmit frame");
			require(link.receiveCallbacks == link.poppedFrames + link.emptyReads,
				std::string(_label) + ' ' + name
					+ " receives do not account for every callback");
			const auto expectedDepth = static_cast<int64_t>(link.initialRingDepth)
				+ static_cast<int64_t>(link.acceptedFrames)
				- static_cast<int64_t>(link.poppedFrames)
				- static_cast<int64_t>(link.purgedFrames());
			require(expectedDepth == static_cast<int64_t>(link.currentRingDepth),
				std::string(_label) + ' ' + name + " queue conservation failed");
			std::cout << "  " << name << ": tx=" << link.transmitFrames
				<< " accepted=" << link.acceptedFrames
				<< " discarded=" << link.transmitFrames - link.acceptedFrames
				<< " popped=" << link.poppedFrames
				<< " empty=" << link.emptyReads
				<< " purged=" << link.purgedFrames()
				<< " depth=" << link.currentRingDepth
				<< " max-depth=" << link.maximumRingDepth << '\n';
			std::cout << "    drops: rx-off=" << link.receiverDisabledDrops
				<< " mm-dma4=" << link.mmMixerDmaInactiveDrops
				<< " mm-dma1=" << link.mmProducerDmaInactiveDrops
				<< " mm-retained=" << link.mmRetainedPrefixDrops
				<< " md-retained=" << link.mdRendezvousRetainedDrops
				<< " md-unreleased=" << link.mdRendezvousUnreleasedDrops
				<< " md-dma4=" << link.mdRendezvousDmaInactiveDrops
				<< " md-ring-full=" << link.mdRendezvousRingFullDrops
				<< " md-opened-in-catchup="
				<< link.mdWindowOpenedDuringCatchUpDrops
				<< " mm-strobe-in-catchup="
				<< link.mmStrobeChangedDuringCatchUpDrops
				<< " md-overrun=" << link.mdReceiverOverrunDrops
				<< " md-post-flush=" << link.mdPostFlushRetainedDrops
				<< " ring-full=" << link.ringFullDrops << '\n';
			std::cout << "    purges: stall=" << link.stallPurgedFrames
				<< " md-window=" << link.mdWindowPurgedFrames
				<< " mm-strobe=" << link.mmStrobePurgedFrames << '\n';
		}

		verifySchedulerPath(score.backgroundUc, std::string(_label) + " background UC");
		printSchedulerPath(score.backgroundUc, "background UC");
		for(size_t dsp = 0; dsp < 2; ++dsp)
		{
			const auto suffix = std::string(" DSP") + std::to_string(dsp + 1);
			verifySchedulerPath(score.backgroundDsp[dsp],
				std::string(_label) + " background" + suffix);
			verifySchedulerPath(score.coldFireToDsp[dsp],
				std::string(_label) + " ColdFire->" + suffix);
			verifySchedulerPath(score.dspToDsp[dsp],
				std::string(_label) + " link->" + suffix);
			verifySchedulerPath(score.inlineHdi08[dsp],
				std::string(_label) + " inline HI08" + suffix);
			printSchedulerPath(score.backgroundDsp[dsp], "background" + suffix);
			printSchedulerPath(score.coldFireToDsp[dsp], "ColdFire->" + suffix);
			printSchedulerPath(score.dspToDsp[dsp], "link->" + suffix);
			printSchedulerPath(score.inlineHdi08[dsp], "inline HI08" + suffix);
		}
		std::cout << "  idle self-branch instructions="
			<< score.idleSelfBranchInstructions
			<< " MM backpressure parks=" << score.mmBackpressureParkDecisions[0]
			<< ',' << score.mmBackpressureParkDecisions[1] << '\n';
	}
}

int main()
{
	const auto* const mdPath = std::getenv("GEARMULATOR_MD_FIRMWARE_BIN");
	const auto* const mmPath = std::getenv("GEARMULATOR_MM_FIRMWARE_BIN");
	if(!mdPath || !*mdPath || !mmPath || !*mmPath)
	{
		std::cout << "mdTransportScorecardFirmwareTest: SKIP "
			"(both pinned MD and MM firmware images are required)\n";
		return 77;
	}
	try
	{
		verifyFirmware("MD 1.63", mdPath, md::MachineModel::Machinedrum);
		verifyFirmware("MM 1.32b", mmPath, md::MachineModel::Monomachine);
		std::cout << "mdTransportScorecardFirmwareTest: PASS\n";
		return 0;
	}
	catch(const std::exception& _error)
	{
		std::cerr << "mdTransportScorecardFirmwareTest: " << _error.what() << '\n';
		return 1;
	}
}
