#pragma once

#include <cstddef>
#include <cstdint>

namespace synthLib
{
	class Plugin;

	// B-121: the host's Stop as the instrument hears it: MIDI Stop, and where the instrument holds notes (_notesOff: the
	// Monomachine) All Notes Off (CC 123) on all 16 channels after it, so a note whose note off never came (a host that
	// sends none at its stop, a note off lost on its way) does not keep playing or arpeggiating until the next note.
	// _emit(status, data1, data2) for each message, in order.
	template<typename Emit> void hostStopEvents(const bool _notesOff, Emit&& _emit)
	{
		_emit(uint8_t{0xfc}, uint8_t{0}, uint8_t{0});
		if(_notesOff)
			for(uint8_t ch = 0; ch < 16; ++ch)
				_emit(static_cast<uint8_t>(0xb0 | ch), uint8_t{123}, uint8_t{0});
	}

	class MidiClock
	{
	public:
		explicit MidiClock(Plugin& _plugin) : m_plugin(_plugin) {}

		void process(double _bpm, double _ppqPos, bool _isPlaying, size_t _sampleCount, bool _ppqKnown = true);

		void restart();

	private:
		void stop();
		void start(double _ppqPos);

		Plugin& m_plugin;

		bool m_isPlaying = false;
		int64_t m_nextClockTick = 0;
		double m_expectedPpq = 0.0;
		double m_lastBpm = 0.0;
	};
}
