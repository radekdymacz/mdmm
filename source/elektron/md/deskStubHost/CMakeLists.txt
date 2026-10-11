cmake_minimum_required(VERSION 3.15)

project(deskStubHost)

# The page tier's host (doc/release/DEV-CYCLE.md, scripts/mdmm-page.mjs): the editors' real core (mdDesk, mmDesk) with a
# fake machine that speaks the firmware's SysEx, on stdin and stdout. No JUCE, no emulator, no ROM. A developer tool
# (POSIX: poll on stdin), never shipped.
add_executable(deskStubHost deskStubHost.cpp)
target_link_libraries(deskStubHost PRIVATE mdDesk mmDesk deskHost elektronData)
target_compile_definitions(deskStubHost PRIVATE DESKSTUB_TESTDATA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../elektronData/testdata")
target_compile_features(deskStubHost PRIVATE cxx_std_17)
set_property(TARGET deskStubHost PROPERTY FOLDER "Elektron/test")
