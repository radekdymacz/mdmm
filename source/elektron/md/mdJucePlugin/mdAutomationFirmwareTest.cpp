#include "mdAutomationTestSupport.h"
#include "mmStudioLink.h"

#include <array>
#include <iostream>
#include <string>

namespace
{
	using namespace mdAutomationTest;

	pluginLib::Parameter& parameter(mdJucePlugin::Controller& _controller)
	{
		auto* const result = _controller.getParameter("Level", 0);
		require(result != nullptr, "test parameter was not registered");
		return *result;
	}

	void verifyMmDeskReplays(Harness& _harness)
	{
		auto& controller = _harness.controller;
		mdJucePlugin::MmStudioLink link(_harness.processor, controller);
		struct Target { const char* name; uint8_t page, index, value; };
		// The working-kit restore uses this same port for values, levels and LFO selections.
		const std::array<Target, 3> targets{{{"AmpVolume", 1, 5, 76}, {"Level", 7, 0, 91}, {"Lfo3Page", 6, 0, 29}}};
		for(const auto& target : targets)
		{
			auto* p = controller.getParameter(target.name, 0);
			require(p != nullptr, std::string("missing MM replay parameter ") + target.name);
			// Model the stale host-side value after a firmware kit reload. The production port
			// must deliver it anyway; the old raw-CC desk rig did not exercise this cache.
			p->setValueFromSynth(target.value, pluginLib::Parameter::Origin::PresetChange);
			for(const auto value : {target.value, target.value, static_cast<uint8_t>(target.value + 1)})
			{
				const auto before = controller.getTransmittedAutomationChangeCount();
				const auto midi = _harness.telemetry();
				require(link.setParam(0, target.page, target.index, value), "the MM desk port accepts its parameter");
				_harness.process(32);
				require(controller.getTransmittedAutomationChangeCount() == before + 1,
					std::string("MM desk replay must emit exactly one CC, including unchanged ") + target.name);
				const auto after = _harness.telemetry();
				require(after.consumed >= midi.consumed + 3 && after.overflows == midi.overflows,
					std::string("MM desk replay was not consumed losslessly: ") + target.name);
			}
		}
		const auto state = controller.createAutomationSnapshot();
		require(state.size() >= 7 && state[3] != 0xff, "MM replay verification has no selected kit");
		link.sendSysex(md::automation::sysex::kitSave(md::MachineModel::Monomachine, state[3]));
		_harness.process(64);
		controller.requestAutomationState();
		require(_harness.synchronize(), "MM replay values were not read back after saving the ephemeral kit");
		for(const auto& target : targets)
			require(controller.getLastFirmwareKitValue(*controller.getParameter(target.name, 0)) == target.value + 1,
				std::string("firmware kit does not hold the delivered MM desk value: ") + target.name);
	}

	bool verifyModel(const md::MachineModel _model)
	{
		Harness harness(_model);
		if(!harness.hasLocalFirmware())
			return allowMissingFirmware("mdAutomationFirmwareTest", _model);
		harness.prepare();

		auto& audioProcessor = harness.audioProcessor;
		auto& controller = harness.controller;
		require(harness.synchronize(),
			"initial firmware synchronization timed out (global "
			+ std::to_string(controller.hasAutomationGlobalSnapshot()) + ", kit "
			+ std::to_string(controller.hasAutomationKitSnapshot()) + ", base "
			+ std::to_string(controller.getAutomationBaseChannel()) + ", requests="
			+ std::to_string(controller.getSynchronizationRequestCount()) + ", "
			+ harness.firmwareReadiness() + ")");
		require(controller.getAutomationBaseChannel() < 16,
			"firmware Global has MIDI base channel set to NONE");

		auto& probe = parameter(controller);
		const auto beforeTransmitCount =
			controller.getTransmittedAutomationChangeCount();

		// Make the cache say zero without touching firmware, then require an explicit
		// repeated/default host write to reach and be consumed by the firmware UART.
		probe.setValueFromSynth(0, pluginLib::Parameter::Origin::PresetChange);
		const auto beforeZero = harness.telemetry();
		hostWrite(probe, 0);
		harness.process(32);
		require(controller.getTransmittedAutomationChangeCount()
			== beforeTransmitCount + 1,
			"host write did not produce exactly one automation CC");
		const auto afterZero = harness.telemetry();
		require(afterZero.consumed >= beforeZero.consumed + 3
			&& afterZero.overflows == beforeZero.overflows,
			"explicit zero automation CC was not consumed losslessly by firmware");

		const auto beforeChanged = harness.telemetry();
		hostWrite(probe, 127);
		harness.process(32);
		require(controller.getTransmittedAutomationChangeCount()
			== beforeTransmitCount + 2,
			"changed host write did not produce exactly one automation CC");
		const auto afterChanged = harness.telemetry();
		require(afterChanged.consumed >= beforeChanged.consumed + 3
			&& afterChanged.overflows == beforeChanged.overflows,
			"changed automation CC was not consumed losslessly by firmware");
		// A numbered Kit request returns the stored slot rather than its unsaved live
		// buffer. Commit this ephemeral test instance, then re-read the selected Kit:
		// the raw dump must prove the firmware actually applied the automation CC.
		const auto beforeSave = controller.createAutomationSnapshot();
		require(beforeSave.size() >= 7 && beforeSave[3] != 0xff,
			"firmware verification has no selected Kit");
		synthLib::SMidiEvent save(synthLib::MidiEventSource::Editor);
		const auto saveMessage =
			md::automation::sysex::kitSave(_model, beforeSave[3]);
		save.sysex.assign(saveMessage.begin(), saveMessage.end());
		harness.processor.addMidiEvent(save);
		harness.process(64);
		controller.requestAutomationState();
		require(harness.synchronize(),
			"firmware did not answer the post-write Kit verification dump");
		require(controller.getLastFirmwareKitValue(probe) == 127,
			"firmware Kit dump did not reflect the host automation write; observed "
			+ std::to_string(controller.getLastFirmwareKitValue(probe)) + ", base channel "
			+ std::to_string(controller.getAutomationBaseChannel()));

		const auto beforeStressCount =
			controller.getTransmittedAutomationChangeCount();
		const auto beforeStressMidi = harness.telemetry();
		size_t expectedWrites = 0;
		int ordinal = 0;
		for(auto* const audioParameter : audioProcessor.getParameters())
		{
			auto* const automationParameter = dynamic_cast<pluginLib::Parameter*>(
				audioParameter);
			if(!automationParameter)
				continue;
			const auto& description = automationParameter->getDescription();
			const auto mutePage = _model == md::MachineModel::Monomachine
				? md::automation::monomachine::Mute
				: md::automation::machinedrum::Mute;
			if(description.page == mutePage)
				continue;
			const auto value = (ordinal * 37 + 19) & 0x7f;
			hostWrite(*automationParameter, value);
			++expectedWrites;
			if((++ordinal & 31) == 0)
				harness.process(4);
		}
		harness.process(64);
		require(controller.getTransmittedAutomationChangeCount()
			== beforeStressCount + expectedWrites,
			"automation stress pass did not transmit every host write");
		const auto afterStressMidi = harness.telemetry();
		require(afterStressMidi.consumed
			>= beforeStressMidi.consumed + expectedWrites * 3
			&& afterStressMidi.overflows == beforeStressMidi.overflows,
			"automation stress stream was not consumed losslessly by firmware");

		hostWrite(probe, 47);
		harness.process(32);
		juce::MemoryBlock savedState;
		audioProcessor.getStateInformation(savedState);
		require(!savedState.isEmpty(), "processor produced empty persisted state");
		hostWrite(probe, 12);
		harness.process(32);
		require(probe.getUnnormalizedValue() == 12,
			"pre-restore control write failed");
		audioProcessor.setStateInformation(savedState.getData(),
			static_cast<int>(savedState.getSize()));
		const auto beforeRestoreFlush =
			controller.getTransmittedAutomationChangeCount();
		require(harness.synchronize(),
			"state restore did not resynchronize automation");
		require(probe.getUnnormalizedValue() == 47,
			"firmware-backed automation value was not restored from DAW state");
		// Synchronization can complete from inside the audio callback while its
		// realtime drain guard is held. The message-thread completion path must not
		// wait on that guard; the next bounded callback performs the replay instead.
		harness.process(32);
		const auto restoredWrites = controller.getTransmittedAutomationChangeCount()
			- beforeRestoreFlush;
		require(restoredWrites >= audioProcessor.getParameters().size(),
			"DAW-state automation snapshot flushed "
			+ std::to_string(restoredWrites) + " of "
			+ std::to_string(audioProcessor.getParameters().size())
			+ " values back to firmware");

		if(_model == md::MachineModel::Monomachine)
			verifyMmDeskReplays(harness);

		std::cout << "mdAutomationFirmwareTest: "
			<< modelName(_model)
			<< " PASS\n";
		return true;
	}
}

int main(const int _argc, const char* const* _argv)
{
	juce::ScopedJuceInitialiser_GUI juce;
	try
	{
		const auto only = _argc > 1 ? std::string(_argv[1]) : std::string();
		bool ranFirmwareCase = false;
		if(only != "--mm")
			ranFirmwareCase = verifyModel(md::MachineModel::Machinedrum)
				|| ranFirmwareCase;
		if(only != "--md")
			ranFirmwareCase = verifyModel(md::MachineModel::Monomachine)
				|| ranFirmwareCase;
		return ranFirmwareCase ? 0 : mdAutomationTest::SkipReturnCode;
	}
	catch(const std::exception& error)
	{
		std::cerr << "mdAutomationFirmwareTest: " << error.what() << '\n';
		return 1;
	}
}
