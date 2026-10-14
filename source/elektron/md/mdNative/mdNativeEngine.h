#pragma once

#include "mdNativeChain.h"
#include "mdNativeCompressor.h"
#include "mdNativeDelay.h"
#include "mdNativeReverb.h"

namespace mdNative
{
	constexpr size_t engineTrackCount = 16;
	struct EngineProfile
	{
		std::vector<int32_t> tables;
		std::array<int32_t, 9> delay{};
		ReverbControls reverb;
		MasterEqControls eq;
		CompressorControls compressor;
	};
	struct EngineTrack
	{
		SineParameters voice{5231, 0x7ff800, 0, 0};
		SineState oscillator{};
		TrackControls controls{0, 0, 8192, 8192, 0, 16383, 0, 0, 0};
		TrackState processing;
		MixerControls mixer;
		EngineTrack();
	};
	class Engine
	{
	public:
		explicit Engine(EngineProfile _profile);
		EngineProfile profile;
		std::array<EngineTrack, engineTrackCount> tracks;
		size_t activeTracks = engineTrackCount;
		bool returnsEnabled = true;
		void noteOn(size_t _track);
		// Fixed 32-frame/44.1 kHz reference block. No allocation, file access, locks or emulator calls.
		void render(StereoBlock &_output);
		// The same mixer/returns/master path can also process externally supplied mono track blocks.
		void renderOutput(const Block *_processedTracks, StereoBlock &_output);

	private:
		DelayState m_delay;
		ReverbState m_reverb;
		MasterEqState m_eq;
		CompressorState m_compressor;
	};
} // namespace mdNative
