#!/bin/bash
# The macOS unit and plug-in tests (no firmware): builds their programs in a configured build tree and runs them by
# name. One list for both callers: scripts/macos/build_mdmm.sh (the package build, unless
# GEARMULATOR_MDMM_PACKAGE_TESTS=0) and CI's macOS test job (.github/workflows/mdmm-editors-macos.yml: an arm64 tree
# without ThinLTO, in parallel with the package; doc/release/DEV-CYCLE.md). Then the node page tests (label Page) and
# the cores' own tests when the tree has them.
#
#   scripts/macos/mdmm_unit_tests.sh <build dir>
#
# The caller sets HOME and GEARMULATOR_DATA_ROOT to a scratch folder (JUCE loads each VST3 while it builds it).
set -euo pipefail
build_dir="${1:?usage: mdmm_unit_tests.sh <build dir>}"

cmake --build "${build_dir}" --parallel 4 --target \
  mdJucePlugin_VST3 \
  mmJucePlugin_VST3 \
  pluginTester \
  latency_host \
  baseLibBinaryStreamTest \
  synthLibAudioTest \
  synthLibMidiQueueTest \
  synthLibMidiClockTimingTest \
  mdLibTest \
  mdStateTest \
  mdStateCaptureTest \
  synthLibStateCaptureTest \
  synthLibDeviceCommandTest \
  synthLibSeqlockTest \
  mdMemoryFastLaneTest \
  mdFlashTest \
  mdUwFirmwareTest \
  mdAudioQueueTest \
  mdAudioFirmwareTest \
  mdAudioIoLayoutTest \
  mdProcessorHooksTest \
  mdWindowsPolicyTest \
  mdMachineMidiOutTest \
  mdMidiLoopTest \
  mdMidiHotplugTest \
  mdAudioMidiLinkTest \
  mdProcessArchTest \
  mdDeskSetupStateTest \
  mdLearnRouterTest \
  mdLearnRouterStressTest \
  mdLearnRouterStressTestTsan \
  mdRosettaNoticeTest \
  mdDroppedFilesTest \
  mdWebFileDropTest \
  mdProjectStateRestoreTest \
  mdAudioProbePlugin_VST3 \
  vst3ProgramChangeTest \
  mdProgramChangeProbe_VST3 \
  mdStandaloneRendererPolicyTest \
  juceRmlMouseInputTest \
  mdFirmwareImageTest \
  mc68kColdFireDivideTest \
  midiOutputDispatcherTest \
  mdAutomationMidiTest \
  mdAutomationParameterTest \
  mdProgramChangeFirmwareTest \
  mdAutomationRobustnessTest

# deskDropPageTest runs under node: CMake registers it only when node is on the PATH, and the loop fails without it.
for test_name in \
  baseLibBinaryStreamTest \
  synthLibAudioTest \
  synthLibMidiQueueTest \
  synthLibMidiClockTimingTest \
  mdLibTests \
  mdStateTest \
  mdStateCaptureTest \
  synthLibStateCaptureTest \
  synthLibDeviceCommandTest \
  synthLibSeqlockTest \
  mdMemoryFastLaneTest \
  mdFlashTest \
  mdStandaloneRendererPolicyTest \
  juceRmlMouseInputTest \
  mdAudioQueueTest \
  mdAudioIoLayoutTest \
  mdProcessorHooksTest \
  mdWindowsPolicyTest \
  mdMachineMidiOutTest \
  mdMidiLoopTest \
  mdMidiHotplugTest \
  mdAudioMidiLinkTest \
  mdProcessArchTest \
  mdDeskSetupStateTest \
  mdLearnRouterTest \
  mdLearnRouterStressTest \
  mdLearnRouterStressTestTsan \
  mdRosettaNoticeTest \
  mdDroppedFilesTest \
  mdWebFileDropTest \
  deskDropPageTest \
  mdAudioProbePluginVST3IdentityTest \
  mdVst3ProgramChangeTest \
  mdVst3ProgramChangeOptOutTest \
  mdJucePlugin_VST3ProgramChangeTest \
  mmJucePlugin_VST3ProgramChangeTest \
  mdFirmwareImageTest \
  mc68kColdFireDivideTest \
  midiOutputDispatcherTest \
  mdAutomationMidiTest \
  mdAutomationParameterTest \
  mdAutomationArchitectureTest; do
  ctest --test-dir "${build_dir}" -C Release --output-on-failure \
    --no-tests=error --tests-regex "^${test_name}$"
done

# without firmware these skip (the package build runs them with it, GEARMULATOR_REQUIRE_FIRMWARE_TESTS=1)
if [[ "${GEARMULATOR_REQUIRE_FIRMWARE_TESTS:-0}" != "1" ]]; then
  ctest --test-dir "${build_dir}" -C Release --output-on-failure \
    --no-tests=error \
    --tests-regex '^(mdUwFirmwareTest|mdAudioFirmwareTest)$'
fi

# MDMM_UNIT_TESTS_MORE=1 (CI's test job): also the cores (no JUCE) and the node page tests
if [[ "${MDMM_UNIT_TESTS_MORE:-0}" == "1" ]]; then
  # (and the focused processor and built-VST3 tests mdmm-audio-io.yml ran on macos-14 until it was folded in here)
  cmake --build "${build_dir}" --parallel 4 --target deskCoreTest deskLearnTest mdDeskTest mmDeskTest deskWireTest mdDataLinkTest \
    elektronDataTest mmDataTest mmDataCorpusTest syxImportTest deskStubHost midiLearnTest \
    dsp56kAccumulatorTests
  ctest --test-dir "${build_dir}" -C Release --output-on-failure --no-tests=error -j 4 \
    --tests-regex '^(deskCoreTest|deskLearnTest|mdDeskTest|mmDeskTest|deskWireTest|mdDataLinkTest|elektronDataTest|mmDataTest|syxImportTest|midiLearnTests|(md|mm)JucePlugin_VST3AudioIoTest|dsp56300_accumulatorTests)$'
  ctest --test-dir "${build_dir}" -C Release --output-on-failure --no-tests=error -j 4 -L Page
fi
