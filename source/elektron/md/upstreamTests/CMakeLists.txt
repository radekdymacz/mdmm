# Tests the fork carries for upstream's code (doc/modern-ux/UPSTREAM.md): synthLib's plug-in wrapper, which the fork
# fixed and upstream has no tests for. Added from mdmmEditors.cmake when BUILD_TESTING is on; the ctest names are the
# ones the CI lists use. (The MCP server, the DSP bridge and their tests were deleted in 0.5.)

# synthLib::Plugin: a state save encodes after the process lock is released (Device::StateCapture), and a full MIDI
# ring never replays a stale event
add_executable(synthLibStateCaptureTest synthLibStateCaptureTest.cpp)
target_link_libraries(synthLibStateCaptureTest PRIVATE synthLib)
add_test(NAME synthLibStateCaptureTest COMMAND synthLibStateCaptureTest)
set_tests_properties(synthLibStateCaptureTest PROPERTIES LABELS "UnitTest")
set_property(TARGET synthLibStateCaptureTest PROPERTY FOLDER "Tests")

add_executable(synthLibMidiQueueTest synthLibMidiQueueTest.cpp)
target_link_libraries(synthLibMidiQueueTest PRIVATE synthLib)
add_test(NAME synthLibMidiQueueTest COMMAND synthLibMidiQueueTest)
set_tests_properties(synthLibMidiQueueTest PROPERTIES LABELS "UnitTest;Midi" TIMEOUT 60)
set_property(TARGET synthLibMidiQueueTest PROPERTY FOLDER "Tests")


# synthLib::Seqlock: the facts the audio thread publishes, read without the device lock (DESIGN-audio-lock.md)
add_executable(synthLibSeqlockTest synthLibSeqlockTest.cpp)
target_link_libraries(synthLibSeqlockTest PRIVATE synthLib)
add_test(NAME synthLibSeqlockTest COMMAND synthLibSeqlockTest)
set_tests_properties(synthLibSeqlockTest PROPERTIES LABELS "UnitTest" TIMEOUT 60)
set_property(TARGET synthLibSeqlockTest PROPERTY FOLDER "Tests")

# The same test under ThreadSanitizer, where the compiler and linker have it (clang and gcc on macOS and Linux, not
# MSVC). The seqlock is header-only: the target takes synthLib's include path but does not link it, so nothing else
# is built with the sanitizer.
if(NOT MSVC)
	include(CheckCXXSourceCompiles)
	set(CMAKE_REQUIRED_FLAGS "-fsanitize=thread")
	set(CMAKE_REQUIRED_LINK_OPTIONS "-fsanitize=thread")
	check_cxx_source_compiles("int main() { return 0; }" MDMM_HAVE_TSAN)
	unset(CMAKE_REQUIRED_FLAGS)
	unset(CMAKE_REQUIRED_LINK_OPTIONS)
	if(MDMM_HAVE_TSAN)
		add_executable(synthLibSeqlockTsanTest synthLibSeqlockTest.cpp)
		target_include_directories(synthLibSeqlockTsanTest PRIVATE
			$<TARGET_PROPERTY:synthLib,INTERFACE_INCLUDE_DIRECTORIES>)
		target_compile_options(synthLibSeqlockTsanTest PRIVATE -fsanitize=thread -g -O1)
		target_link_options(synthLibSeqlockTsanTest PRIVATE -fsanitize=thread)
		add_test(NAME synthLibSeqlockTsanTest COMMAND synthLibSeqlockTsanTest)
		set_tests_properties(synthLibSeqlockTsanTest PROPERTIES LABELS "UnitTest" TIMEOUT 120
			ENVIRONMENT "TSAN_OPTIONS=halt_on_error=1;MDMM_SEQLOCK_TEST_MS=300")
		set_property(TARGET synthLibSeqlockTsanTest PROPERTY FOLDER "Tests")
	endif()
endif()

# synthLib::Plugin::sendCommands: the device's commands, queued for the audio thread without the device lock, and the
# lock blame (DESIGN-audio-lock.md step 3)
add_executable(synthLibDeviceCommandTest synthLibDeviceCommandTest.cpp)
target_link_libraries(synthLibDeviceCommandTest PRIVATE synthLib)
add_test(NAME synthLibDeviceCommandTest COMMAND synthLibDeviceCommandTest)
set_tests_properties(synthLibDeviceCommandTest PROPERTIES LABELS "UnitTest" TIMEOUT 60)
set_property(TARGET synthLibDeviceCommandTest PROPERTY FOLDER "Tests")
