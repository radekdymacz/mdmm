#pragma once

// 0.8 (WP4): what the standalone's AUDIO / MIDI panel says about a MIDI loop (B-154) and about an input that stays on
// NONE (B-155), as plain values: tested by mdMidiLoopTest (no JUCE, no ROM, no ports).
//   - midiLoop::warning: a MIDI port that is switched on as an input and also chosen as the output. Whatever the
//     editor sends (its notes, CCs, clock and transport) comes straight back in, through macOS's IAC driver or a
//     loopMIDI port. Found by WP2 (B-154): the noise comes only with the app's MIDI out fed back into its in. Two
//     different buses are no loop. The names are compared as the system lists them (case, spaces at the ends and
//     doubled spaces do not matter).
//   - audioInput::note: why the External Input drop-down went back to NONE: macOS microphone permission, the
//     device setup error JUCE returned, or a device with no input channels.

#include <algorithm>
#include <cctype>
#include <string>
#include <vector>

namespace mdJucePlugin
{
	namespace midiLoop
	{
		enum class Family
		{
			Other,
			Iac,		// macOS: "IAC Driver Bus 1"
			LoopMidi	// Windows: "loopMIDI Port"
		};

		// The name without spaces at the ends, doubled spaces and capitals.
		inline std::string normalised(const std::string& _name)
		{
			std::string out;
			bool space = false;
			for(const char c : _name)
			{
				if(std::isspace(static_cast<unsigned char>(c)))
				{
					space = !out.empty();
					continue;
				}
				if(space)
					out += ' ';
				space = false;
				out += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
			}
			return out;
		}

		inline Family familyOf(const std::string& _name)
		{
			const auto n = normalised(_name);
			if(n.find("loopmidi") != std::string::npos)
				return Family::LoopMidi;
			if(n.find("iac driver") != std::string::npos || n.rfind("iac ", 0) == 0)
				return Family::Iac;
			return Family::Other;
		}

		// "" when nothing loops, otherwise the line the panel shows. _enabledInputs: the names of the inputs that are
		// on; _output: the name of the chosen output ("" = none).
		inline std::string warning(const std::vector<std::string>& _enabledInputs, const std::string& _output)
		{
			const auto out = normalised(_output);
			if(out.empty())
				return {};
			const bool loops = std::any_of(_enabledInputs.begin(), _enabledInputs.end(),
				[&](const std::string& _in) { return normalised(_in) == out; });
			if(!loops)
				return {};
			const char* what = "port";
			switch(familyOf(_output))
			{
			case Family::Iac: what = "IAC bus"; break;
			case Family::LoopMidi: what = "loopMIDI port"; break;
			case Family::Other: break;
			}
			return "MIDI loop: " + _output + " is on as an input and is also the output. Everything the editor sends "
				"comes straight back in and the sound can turn to noise. Switch the input off, or send to another "
				+ std::string(what) + ".";
		}
	}

	namespace audioInput
	{
		enum class Permission
		{
			Unknown,	// not macOS, or the system did not say
			NotAsked,	// macOS has not asked yet: it does when an input first opens
			Denied,		// the user said no (or a policy did)
			Granted
		};

		inline const char* name(const Permission _p)
		{
			switch(_p)
			{
			case Permission::NotAsked: return "notAsked";
			case Permission::Denied: return "denied";
			case Permission::Granted: return "granted";
			case Permission::Unknown: break;
			}
			return "unknown";
		}

		// "" when the input is as asked. _chosen: an input device is chosen; _active: it delivers input channels;
		// _setupError: what JUCE's setAudioDeviceSetup returned last (or "").
		inline std::string note(const Permission _permission, const bool _chosen, const bool _active,
			const std::string& _setupError)
		{
			if(_permission == Permission::Denied && _chosen && !_active)
				return "macOS gives this app no input: microphone access is off. Open System Settings > Privacy & "
					"Security > Microphone, switch it on for this app, then start the app again.";
			if(!_setupError.empty())
				return "The input could not be opened: " + _setupError;
			if(_chosen && !_active)
			{
				if(_permission == Permission::NotAsked)
					return "No input yet: macOS asks for microphone access when an input first opens. Allow it, then "
						"choose the device again.";
				return "The device gives no input channels at this sample rate, or another program holds it. Try "
					"another sample rate or device.";
			}
			return {};
		}
	}
}
