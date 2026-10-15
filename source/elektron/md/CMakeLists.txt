cmake_minimum_required(VERSION 3.15)

add_subdirectory(mdLib)
include(mdmmEditors.cmake)  # the Machinedrum/Monomachine Editors (doc/modern-ux/UPSTREAM.md)

if(BUILD_TESTING)
	add_subdirectory(mdLibTest)
endif()

if(${CMAKE_PROJECT_NAME}_BUILD_JUCEPLUGIN)
	add_subdirectory(mdJucePlugin)
endif()

include(optimization.cmake)
