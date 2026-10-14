#pragma once

#include "mdNativeEngine.h"

namespace mdNative::proof
{
	inline void setupDemo(Engine &_engine, const size_t _tracks = 16)
	{
		_engine.activeTracks = _tracks;
		for (size_t t = 0; t < engineTrackCount; ++t)
		{
			auto &track = _engine.tracks[t];
			track.voice = {int32_t(2615 * (1 + t % 8)), 0x7ffd00, int32_t(t % 3) * 0x10000, 0x7d0000};
			track.mixer = {int32_t(0x100000 / _tracks), int32_t(t * 0x7fffff / 15), 0x300000, 0x300000};
			track.controls[6] = 30 * 128;
		}
	}
	inline bool demoTrigger(const size_t _track, const unsigned _block)
	{
		return _block < 11024 && _block % 689 == (_track % 4) * 172;
	}
	inline void updateDemo(Engine &_engine, const unsigned _block)
	{
		for (size_t t = 0; t < _engine.activeTracks; ++t)
		{
			if (demoTrigger(t, _block))
				_engine.noteOn(t);
			// Exercise filter movement and stereo sends while the notes and effect tails overlap.
			_engine.tracks[t].controls[5] = int32_t(48 + (_block / 172 + t * 5) % 80) * 128;
		}
	}
} // namespace mdNative::proof
