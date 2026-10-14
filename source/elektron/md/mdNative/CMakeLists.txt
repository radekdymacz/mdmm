cmake_minimum_required(VERSION 3.22)
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
	project(mdNative LANGUAGES CXX)
endif()

add_library(mdNative STATIC mdNative.cpp mdNative.h mdNativeFloat.cpp mdNativeFloat.h
	mdNativeTrack.cpp mdNativeTrack.h mdNativeChain.cpp mdNativeChain.h mdNativeMixer.cpp mdNativeMixer.h)
target_sources(mdNative PRIVATE mdNativeDelay.cpp mdNativeDelay.h mdNativeFixed.h)
target_sources(mdNative PRIVATE mdNativeReverb.cpp mdNativeReverb.h)
target_sources(mdNative PRIVATE mdNativeMasterEq.cpp mdNativeMasterEq.h)
target_sources(mdNative PRIVATE mdNativeCompressor.cpp mdNativeCompressor.h)
target_sources(mdNative PRIVATE mdNativeEngine.cpp mdNativeEngine.h)
target_compile_features(mdNative PUBLIC cxx_std_17)
target_include_directories(mdNative PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(mdNativeReplay mdNativeReplay.cpp)
target_link_libraries(mdNativeReplay PRIVATE mdNative)

add_executable(mdNativeCompare mdNativeCompare.cpp)
target_link_libraries(mdNativeCompare PRIVATE mdNative)

add_executable(mdNativeRender mdNativeRender.cpp)
target_link_libraries(mdNativeRender PRIVATE mdNative)

add_executable(mdNativeTrackReplay mdNativeTrackReplay.cpp)
target_link_libraries(mdNativeTrackReplay PRIVATE mdNative)
add_executable(mdNativeChainReplay mdNativeChainReplay.cpp)
target_link_libraries(mdNativeChainReplay PRIVATE mdNative)
add_executable(mdNativeChainRender mdNativeChainRender.cpp)
target_link_libraries(mdNativeChainRender PRIVATE mdNative)
add_executable(mdNativeEngineRender mdNativeEngineRender.cpp)
target_link_libraries(mdNativeEngineRender PRIVATE mdNative)

if(EMSCRIPTEN)
	# Node reads a locally generated private corpus. Only the test executable uses a filesystem.
	target_link_options(mdNativeReplay PRIVATE -sNODERAWFS=1 -sENVIRONMENT=node)
	target_link_options(mdNativeCompare PRIVATE -sNODERAWFS=1 -sENVIRONMENT=node)
	target_link_options(mdNativeRender PRIVATE -sNODERAWFS=1 -sENVIRONMENT=node)
	target_link_options(mdNativeTrackReplay PRIVATE -sNODERAWFS=1 -sENVIRONMENT=node)
	target_link_options(mdNativeChainReplay PRIVATE -sNODERAWFS=1 -sENVIRONMENT=node)
	target_link_options(mdNativeChainRender PRIVATE -sNODERAWFS=1 -sENVIRONMENT=node)
	target_link_options(mdNativeEngineRender PRIVATE -sNODERAWFS=1 -sENVIRONMENT=node -sINITIAL_MEMORY=33554432)
endif()

if(TARGET mdLib)
	add_executable(mdNativeEmulatorBench mdNativeEmulatorBench.cpp)
	target_link_libraries(mdNativeEmulatorBench PRIVATE mdLib)
	add_executable(mdNativeEngineFirmwareTest mdNativeEngineFirmwareTest.cpp)
	target_link_libraries(mdNativeEngineFirmwareTest PRIVATE mdNative mdLib)
	add_test(NAME mdNativeEngineFirmwareTest COMMAND mdNativeEngineFirmwareTest)
	set_tests_properties(mdNativeEngineFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest"
		SKIP_RETURN_CODE 77 TIMEOUT 300)
	add_executable(mdNativeOutputFirmwareTest mdNativeOutputFirmwareTest.cpp)
	target_link_libraries(mdNativeOutputFirmwareTest PRIVATE mdNative mdLib)
	add_test(NAME mdNativeOutputFirmwareTest COMMAND mdNativeOutputFirmwareTest)
	set_tests_properties(mdNativeOutputFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest"
		SKIP_RETURN_CODE 77 TIMEOUT 180)
	add_executable(mdNativeFirmwareTest mdNativeFirmwareTest.cpp)
	target_link_libraries(mdNativeFirmwareTest PRIVATE mdNative mdLib)
	add_test(NAME mdNativeFirmwareTest COMMAND mdNativeFirmwareTest)
	set_tests_properties(mdNativeFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest"
		SKIP_RETURN_CODE 77 TIMEOUT 180)
	add_executable(mdNativeTrackFirmwareTest mdNativeTrackFirmwareTest.cpp)
	target_link_libraries(mdNativeTrackFirmwareTest PRIVATE mdNative mdLib)
	add_test(NAME mdNativeTrackFirmwareTest COMMAND mdNativeTrackFirmwareTest)
	set_tests_properties(mdNativeTrackFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest"
		SKIP_RETURN_CODE 77 TIMEOUT 180)
	add_executable(mdNativeChainFirmwareTest mdNativeChainFirmwareTest.cpp)
	target_link_libraries(mdNativeChainFirmwareTest PRIVATE mdNative mdLib)
	add_test(NAME mdNativeChainFirmwareTest COMMAND mdNativeChainFirmwareTest)
	set_tests_properties(mdNativeChainFirmwareTest PROPERTIES LABELS "Integration;FirmwareTest"
		SKIP_RETURN_CODE 77 TIMEOUT 180)
endif()
