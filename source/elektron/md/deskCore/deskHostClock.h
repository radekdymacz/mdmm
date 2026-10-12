#pragma once

// Review 1 (Radek, 2026-10-12, I-026): in a DAW, the active GLOBAL's TEMPO IN is the switch between the host's clock and
// the machine's own. EXT (the default of a new plug-in instance): the machine follows the DAW's tempo and transport, the
// desk sets the global for it (followHost) and keeps it so. INT: the person set the machine's own clock (GLOBAL, Tempo in
// INT, or clock in off on the Monomachine): the desk no longer sets EXT again, and the plug-in stops sending the host's
// clock and transport. The global is the machine's, saved with the project, so the choice is too: a project that comes
// back with INT keeps it (projectRestored). Pure: the machines feed it what the active global says.
namespace deskCore
{
	struct HostClock
	{
		bool on = true;		// the machine follows the host
		bool seen = false;	// the active global was seen following the host (or a project brought its own)
		bool started = false;

		// The active global follows the host now (_following) or not; true when the desk should set it to follow.
		bool wants(const bool _following, const bool _projectRestored)
		{
			if(!started)
			{
				started = true;
				seen = _projectRestored;
			}
			if(_following)
			{
				seen = true;
				on = true;
				return false;
			}
			if(seen)
				on = false;		// it followed and now does not: the person chose INT
			return on;
		}
	};
}
