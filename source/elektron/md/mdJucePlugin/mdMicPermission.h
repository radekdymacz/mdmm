#pragma once

// The microphone permission the system holds for this app (B-155): without it macOS gives an input device but no
// input, and the AUDIO / MIDI panel's External Input goes back to NONE. macOS only (mdMicPermission.mm); anywhere else
// Unknown. Read-only: it never asks (the system asks when an input first opens).

#include "mdMidiLoop.h"

namespace mdJucePlugin::micPermission
{
	audioInput::Permission state();
}
