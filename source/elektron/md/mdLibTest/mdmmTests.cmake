# The editors' firmware rigs and unit tests beside upstream's in mdLibTest/ (doc/modern-ux/UPSTREAM.md).
# Included from mdmmEditors.cmake when BUILD_TESTING is on. The executables land in mdLibTest's own
# build folder, as they did when they were declared in its CMakeLists.

function(mdmm_add_lib_tests _dir)
	set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/mdLibTest")

	# P0 modern-UX proof: live pattern edits by SysEx against MD 1.63 firmware.
	# Manual: needs a user-supplied ROM (no firmware is bundled), writes WAVs.
	add_executable(mdPatternLiveEditFirmwareTest ${_dir}/patternLiveEditFirmwareTest.cpp)
	target_link_libraries(mdPatternLiveEditFirmwareTest PRIVATE mdLib elektronData)
	set_property(TARGET mdPatternLiveEditFirmwareTest PROPERTY FOLDER "Elektron/test")

	# P1 data layer: capture MD 1.63 user-data dumps (all slots, or a scripted
	# sequence of SysEx edits) for the elektronData codec corpus. Manual: needs a
	# user-supplied ROM.
	add_executable(mdDataCaptureFirmwareTest ${_dir}/mdDataCaptureFirmwareTest.cpp)
	target_link_libraries(mdDataCaptureFirmwareTest PRIVATE mdLib)
	set_property(TARGET mdDataCaptureFirmwareTest PROPERTY FOLDER "Elektron/test")

	# P1 data layer: corpus round trip and behaviour probes (queue, kit link,
	# kit/song push timing and continuity) against MD 1.63 firmware. Manual:
	# needs a user-supplied ROM.
	add_executable(mdDataLayerFirmwareTest ${_dir}/mdDataLayerFirmwareTest.cpp ${_dir}/mdFirmwareSession.h)
	target_link_libraries(mdDataLayerFirmwareTest PRIVATE mdLib mdDataLink)
	set_property(TARGET mdDataLayerFirmwareTest PROPERTY FOLDER "Elektron/test")

	# P2 MD Desk smoke test: page commands through mdDesk::Desk into MD 1.63
	# firmware, read back by dump (patterns, songs, globals) and SAVE KIT (the
	# working kit). Manual: needs a user-supplied ROM.
	add_executable(mdDeskFirmwareTest ${_dir}/mdDeskFirmwareTest.cpp ${_dir}/mdFirmwareSession.h ${_dir}/contractCheck.h)
	target_link_libraries(mdDeskFirmwareTest PRIVATE mdLib mdDesk deskWire)
	target_compile_definitions(mdDeskFirmwareTest PRIVATE MDDESK_SCHEMA="${_dir}/../../../../doc/modern-ux/md-data-contract.schema.json"
		MDDESK_INTENT_CASES="${_dir}/../../../../doc/modern-ux/intent-cases.json")
	set_property(TARGET mdDeskFirmwareTest PROPERTY FOLDER "Elektron/test")
	# B-031: the user's own backup imported, then patterns picked while and after it runs. The backup from MD_SYX
	# (never in the repo), the ROM from GEARMULATOR_MD_FIRMWARE_BIN; skipped without them (the local gate gives both).
	# DEV-CYCLE: the Machinedrum's intent cases (doc/modern-ux/intent-cases.json, "md") through the desk to the firmware
	add_test(NAME mdIntentCasesFirmwareTest COMMAND mdDeskFirmwareTest --env intentcases)
	set_tests_properties(mdIntentCasesFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 900)
	# wave 2: pause, resume, play from a song row, panic and the tempo nudge through the desk to the firmware
	add_test(NAME mdTransportFirmwareTest COMMAND mdDeskFirmwareTest --env transport)
	set_tests_properties(mdTransportFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
	# wave 7: erase while live recording (EXIT/NO + TRIG held) through the desk to the firmware
	add_test(NAME mdLiveEraseFirmwareTest COMMAND mdDeskFirmwareTest --env liveerase)
	set_tests_properties(mdLiveEraseFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
	add_test(NAME mdCtrLfoFirmwareTest COMMAND mdDeskFirmwareTest --env ctrlfo)
	set_tests_properties(mdCtrLfoFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
	# review 1 (B-096): the factory song plays in SONG mode; in a DAW (TEMPO IN EXT) PLAY waits for the host's clock
	add_test(NAME mdFactorySongFirmwareTest COMMAND mdDeskFirmwareTest --env factorysong)
	set_tests_properties(mdFactorySongFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
	add_test(NAME mdSyxPickFirmwareTest COMMAND mdDeskFirmwareTest --env syxpick)
	set_tests_properties(mdSyxPickFirmwareTest PROPERTIES
		LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 1200)

	# P3 Machinedrum Editor discovery probes (working kit in memory, live
	# recording, sample names, SDS). Manual: needs a user-supplied ROM.
	add_executable(mdEditorProbeFirmwareTest ${_dir}/mdEditorProbeFirmwareTest.cpp ${_dir}/mdFirmwareSession.h)
	target_link_libraries(mdEditorProbeFirmwareTest PRIVATE mdLib elektronData)
	set_property(TARGET mdEditorProbeFirmwareTest PROPERTY FOLDER "Elektron/test")

	# DESIGN-edit-flow.md: the firmware and the desk under a stream of page edits (manual: needs a ROM).
	add_executable(editFlowBenchTest ${_dir}/editFlowBenchTest.cpp ${_dir}/mdFirmwareSession.h)
	target_link_libraries(editFlowBenchTest PRIVATE mdLib mdDesk mmDesk deskWire)
	set_property(TARGET editFlowBenchTest PROPERTY FOLDER "Elektron/test")

	# P4: CPU per emulated MD instance, headless (manual: needs a user-supplied ROM).
	add_executable(mdCpuBenchTest ${_dir}/mdCpuBenchTest.cpp ${_dir}/mdFirmwareSession.h)
	target_link_libraries(mdCpuBenchTest PRIVATE mdLib elektronData)
	set_property(TARGET mdCpuBenchTest PROPERTY FOLDER "Elektron/test")

	# MM-P3: the same measurement for the Monomachine OS 1.32B. Manual: needs a ROM.
	add_executable(mmCpuBenchTest ${_dir}/mmCpuBenchTest.cpp ${_dir}/mdFirmwareSession.h)
	target_link_libraries(mmCpuBenchTest PRIVATE mdLib elektronData)
	set_property(TARGET mmCpuBenchTest PROPERTY FOLDER "Elektron/test")

	# The gate of the emulation CPU plan (doc/modern-ux/RESEARCH-emulation-cpu.md, section 5): bit-exact audio and
	# RAM hashes plus host instructions and cycles per frame, MD or MM, stopped and playing. Manual: needs a ROM.
	# The local release gate (doc/release/LOCAL-GATE.md) runs it against recorded goldens (--golden, goldens/).
	add_executable(mdmmPerfGateTest ${_dir}/mdmmPerfGateTest.cpp ${_dir}/mdFirmwareSession.h ${_dir}/mmSysexRecv.h)
	target_link_libraries(mdmmPerfGateTest PRIVATE mdLib mmDesk)
	set_property(TARGET mdmmPerfGateTest PROPERTY FOLDER "Elektron/test")

	# The local release gate's ROM check: each supported image boots and answers SysEx, a truncated and a garbage
	# image are refused. Manual: needs a user-supplied ROM.
	add_executable(mdmmRomLoadTest ${_dir}/mdmmRomLoadTest.cpp ${_dir}/mdFirmwareSession.h)
	target_link_libraries(mdmmRomLoadTest PRIVATE mdLib elektronData)
	set_property(TARGET mdmmRomLoadTest PROPERTY FOLDER "Elektron/test")

	# The local release gate's SysEx round trip: a machine's full dump imported into a fresh one as the editors
	# import a file, dumped again, byte for byte; real backups (fixtures, never in the repo) document by document.
	# Manual: needs a user-supplied ROM.
	add_executable(mdmmSysexRoundTripTest
		${_dir}/mdmmSysexRoundTripTest.cpp ${_dir}/mdFirmwareSession.h ${_dir}/mmSysexRecv.h)
	target_link_libraries(mdmmSysexRoundTripTest PRIVATE mdLib mmDesk)
	set_property(TARGET mdmmSysexRoundTripTest PROPERTY FOLDER "Elektron/test")

	# P4 Machinedrum Editor discovery probes (start-up animation, chaining,
	# mutes, kit and pattern library). Manual: needs a user-supplied ROM.
	add_executable(mdP4ProbeFirmwareTest ${_dir}/mdP4ProbeFirmwareTest.cpp ${_dir}/mdFirmwareSession.h)
	target_link_libraries(mdP4ProbeFirmwareTest PRIVATE mdLib elektronData)
	set_property(TARGET mdP4ProbeFirmwareTest PROPERTY FOLDER "Elektron/test")

	add_executable(mdSequencerStateTest ${_dir}/mdSequencerStateTest.cpp)
	target_link_libraries(mdSequencerStateTest PRIVATE mdLib)
	add_test(NAME mdSequencerStateTest COMMAND mdSequencerStateTest)
	set_tests_properties(mdSequencerStateTest PROPERTIES LABELS "UnitTest")
	set_property(TARGET mdSequencerStateTest PROPERTY FOLDER "Elektron/test")

	# Manual-gap probes P1-P6 (SPP + Continue, MM CONTROL OUT 1, MD trig in A/B, MM DigiPRO, MD stop twice and panic,
	# the factory baseline): doc/modern-ux/PROBES-manual-gaps.md. Manual: needs both user-supplied ROMs.
	add_executable(gapProbesFirmwareTest ${_dir}/gapProbesFirmwareTest.cpp ${_dir}/mdFirmwareSession.h ${_dir}/sysexPanelDriver.h)
	target_link_libraries(gapProbesFirmwareTest PRIVATE mdLib elektronData)
	set_property(TARGET gapProbesFirmwareTest PROPERTY FOLDER "Elektron/test")

	# MM-P0 Monomachine Editor discovery probes (SYSEX RECV gate, dumps, playhead,
	# CC live edits) against MM OS 1.32B firmware. Manual: needs a user-supplied ROM.
	add_executable(mmEditorProbeFirmwareTest ${_dir}/mmEditorProbeFirmwareTest.cpp ${_dir}/mdFirmwareSession.h ${_dir}/sysexPanelDriver.h)
	target_link_libraries(mmEditorProbeFirmwareTest PRIVATE mdLib elektronData)
	set_property(TARGET mmEditorProbeFirmwareTest PROPERTY FOLDER "Elektron/test")

	# MM-P2 Monomachine Editor smoke test: mmDesk::Desk against MM OS 1.32B firmware
	# (SYSEX RECV session, pattern/kit/song delivery, queue). Manual: needs a ROM.
	add_executable(mmDeskFirmwareTest ${_dir}/mmDeskFirmwareTest.cpp ${_dir}/mdFirmwareSession.h)
	target_link_libraries(mmDeskFirmwareTest PRIVATE mdLib mmDesk deskWire)
	target_compile_definitions(mmDeskFirmwareTest PRIVATE MMDESK_SCHEMA="${_dir}/../../../../doc/modern-ux/mm-data-contract.schema.json"
		MMDESK_INTENT_CASES="${_dir}/../../../../doc/modern-ux/intent-cases.json")
	set_property(TARGET mmDeskFirmwareTest PROPERTY FOLDER "Elektron/test")
	# The default sections (smoke, p4, hw, chain, record, kitlink, reclock ...): the ROM from GEARMULATOR_MM_FIRMWARE_BIN
	# like the sections below; skips (77) without it. Never a bare ${GEARMULATOR_MM_ROM} (unset in temp/dev = a silent skip).
	add_test(NAME mmDeskFirmwareTest COMMAND mmDeskFirmwareTest --env)
	set_tests_properties(mmDeskFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 1800)
	# B-049: the amp envelope the editor draws against the firmware's (one note per value, the output's level).
	# B-027 and B-050: a kit's unsaved edits stay over a step or a piano-roll note (a dump of the pattern that plays).
	if(TRUE)
		add_test(NAME mmAmpEnvelopeFirmwareTest COMMAND mmDeskFirmwareTest --env ampenv)
		set_tests_properties(mmAmpEnvelopeFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
		add_test(NAME mmKitEditsStayFirmwareTest COMMAND mmDeskFirmwareTest --env machine)
		set_tests_properties(mmKitEditsStayFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 900)
		# I-010: the piano roll's note lengths as the machine stores them (its own dump) and plays them (T1's gates from
		# the output, M1's LEN on the MIDI out)
		add_test(NAME mmNoteLengthFirmwareTest COMMAND mmDeskFirmwareTest --env notelength)
		set_tests_properties(mmNoteLengthFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
		# B-060: a transpose edited while the pattern plays is heard at once (T1's pitch from the output, M1 and M2 on the
		# MIDI out), the stored values as edited
		add_test(NAME mmTransposeLiveFirmwareTest COMMAND mmDeskFirmwareTest --env transpose)
		set_tests_properties(mmTransposeLiveFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
		# B-121: the host's Stop lets go of a note held into a track (All Notes Off after MIDI Stop), judged by the output
		add_test(NAME mmHostStopFirmwareTest COMMAND mmDeskFirmwareTest --env hoststop)
		set_tests_properties(mmHostStopFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
	endif()
	# B-031 on the Monomachine: the backup from MM_SYX, the ROM from GEARMULATOR_MM_FIRMWARE_BIN; skipped without them.
	# DEV-CYCLE: the Monomachine's intent cases (doc/modern-ux/intent-cases.json, "mm") through the desk to the firmware
	add_test(NAME mmIntentCasesFirmwareTest COMMAND mmDeskFirmwareTest --env intentcases)
	set_tests_properties(mmIntentCasesFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 900)
	add_test(NAME mmTransportFirmwareTest COMMAND mmDeskFirmwareTest --env transport)
	set_tests_properties(mmTransportFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
	# wave 7: LIVE RECORDING's erase (EXIT held) and STEP RECORDING through the desk to the firmware
	add_test(NAME mmStepRecordFirmwareTest COMMAND mmDeskFirmwareTest --env steprec)
	set_tests_properties(mmStepRecordFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
	# 0.6 wave 9 (B-064): POLY, key tracking and the MULTI ENV through the desk, judged by the output
	add_test(NAME mmPerformSoundFirmwareTest COMMAND mmDeskFirmwareTest --env perform)
	set_tests_properties(mmPerformSoundFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
	# review 1 (B-093): LIVE RECORDING's erase leaves chord notes without a trig; the pattern stays editable
	add_test(NAME mmChordEraseFirmwareTest COMMAND mmDeskFirmwareTest --env chorderase)
	set_tests_properties(mmChordEraseFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
	add_test(NAME mmSyxPickFirmwareTest COMMAND mmDeskFirmwareTest --env syxpick)
	set_tests_properties(mmSyxPickFirmwareTest PROPERTIES
		LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 1200)

	# Unit test: mdDesk::wirePort and mmDesk::wirePort send the right bytes (kit param, mute, NRPN,
	# panel keys) on the base channel. No ROM, no emulator - links the two wirePort INTERFACE
	# targets only.
	add_executable(deskWirePortTest ${_dir}/deskWirePortTest.cpp)
	target_link_libraries(deskWirePortTest PRIVATE mdDeskWirePort mmDeskWirePort)
	add_test(NAME deskWirePortTest COMMAND deskWirePortTest)
	set_tests_properties(deskWirePortTest PROPERTIES LABELS "UnitTest;Midi")
	set_property(TARGET deskWirePortTest PROPERTY FOLDER "Elektron/test")

	# P9: the sample list is copied raw on the audio thread (no allocation) and built by its reader (RESEARCH-emulation-cpu.md,
	# "Around the core"). Needs GEARMULATOR_MD_FIRMWARE_BIN; skips without it.
	add_executable(mdSampleScanFirmwareTest ${_dir}/mdSampleScanFirmwareTest.cpp)
	target_link_libraries(mdSampleScanFirmwareTest PRIVATE mdLib)
	add_test(NAME mdSampleScanFirmwareTest COMMAND mdSampleScanFirmwareTest)
	set_tests_properties(mdSampleScanFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest" SKIP_RETURN_CODE 77 TIMEOUT 600)
	set_property(TARGET mdSampleScanFirmwareTest PROPERTY FOLDER "Elektron/test")

	# A state save captured under the plug-in's lock and encoded after it (codex review 2026-10, item 3): the
	# table-driven CRC-32, and the capture's bytes against the encoder's (the firmware part needs
	# GEARMULATOR_MD_FIRMWARE_BIN / GEARMULATOR_MM_FIRMWARE_BIN and says SKIP without them).
	add_executable(mdStateCaptureTest ${_dir}/mdStateCaptureTest.cpp)
	target_link_libraries(mdStateCaptureTest PRIVATE mdLib)
	add_test(NAME mdStateCaptureTest COMMAND mdStateCaptureTest)
	set_tests_properties(mdStateCaptureTest PROPERTIES LABELS "UnitTest")
	set_property(TARGET mdStateCaptureTest PROPERTY FOLDER "Elektron/test")

	# .syx import and export (P7): synthetic dumps; no firmware.
	add_executable(syxImportTest ${_dir}/syxImportTest.cpp)
	target_link_libraries(syxImportTest PRIVATE elektronData)
	add_test(NAME syxImportTest COMMAND syxImportTest)
	set_tests_properties(syxImportTest PROPERTIES LABELS "UnitTest")
	set_property(TARGET syxImportTest PROPERTY FOLDER "Elektron/test")

	# The same on two local third-party backups (never in the repo); skips (77) when they are absent.
	add_executable(syxImportFileTest ${_dir}/syxImportFileTest.cpp)
	target_link_libraries(syxImportFileTest PRIVATE elektronData)
	add_test(NAME syxImportFileTest COMMAND syxImportFileTest)
	set_tests_properties(syxImportFileTest PROPERTIES LABELS "UnitTest" SKIP_RETURN_CODE 77)
	set_property(TARGET syxImportFileTest PROPERTY FOLDER "Elektron/test")
endfunction()

mdmm_add_lib_tests("${CMAKE_CURRENT_LIST_DIR}")
