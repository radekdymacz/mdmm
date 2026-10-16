// The microphone permission, anywhere but macOS: the system does not say (mdMicPermission.h).

#include "mdMicPermission.h"

namespace mdJucePlugin::micPermission
{
	audioInput::Permission state()
	{
		return audioInput::Permission::Unknown;
	}
}
