// The microphone permission the system holds for this app: mdMicPermission.h.

#include "mdMicPermission.h"

#import <AVFoundation/AVFoundation.h>

namespace mdJucePlugin::micPermission
{
	audioInput::Permission state()
	{
		switch([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio])
		{
		case AVAuthorizationStatusNotDetermined: return audioInput::Permission::NotAsked;
		case AVAuthorizationStatusAuthorized: return audioInput::Permission::Granted;
		case AVAuthorizationStatusDenied:
		case AVAuthorizationStatusRestricted: return audioInput::Permission::Denied;
		}
		return audioInput::Permission::Unknown;
	}
}
