#include "mdNativeEngine.h"
#include "mdNativeFixed.h"

#include <stdexcept>
#include <utility>

namespace mdNative
{
	EngineTrack::EngineTrack()
	{
		processing.words[0x25] = 0x148000;
	}

	Engine::Engine(EngineProfile _profile) : profile(std::move(_profile))
	{
		if (profile.tables.size() != trackTableSize)
			throw std::invalid_argument("expected private engine numeric tables");
		std::copy(profile.delay.begin(), profile.delay.end(), m_delay.words.begin());
		m_delay.words[10] = profile.delay[0];
		m_delay.words[11] = profile.delay[1];
	}

	void Engine::noteOn(const size_t _track)
	{
		if (_track < tracks.size())
			trigger(tracks[_track].oscillator);
	}

	void Engine::render(StereoBlock &_output)
	{
		std::array<Block, engineTrackCount> processed;
		for (size_t t = 0; t < std::min(activeTracks, tracks.size()); ++t)
		{
			auto &track = tracks[t];
			Block voice;
			renderSine(track.voice, track.oscillator, profile.tables.data() + 0x8000, voice);
			track.processing.words[0x29] = track.processing.words[0x24];
			track.processing.words[0x2d] = track.processing.words[0x22];
			renderTrack(track.controls, track.processing, {profile.tables.data()}, voice, processed[t]);
		}
		renderOutput(processed.data(), _output);
	}

	void Engine::renderOutput(const Block *_tracks, StereoBlock &_output)
	{
		std::array<MixerControls, engineTrackCount> controls;
		for (size_t i = 0; i < tracks.size(); ++i)
			controls[i] = tracks[i].mixer;
		MixerBuses buses;
		mixTracks(_tracks, controls.data(), std::min(activeTracks, tracks.size()), profile.tables.data() + 0x8000,
				  buses);
		StereoBlock delay, reverb, mixed;
		if (returnsEnabled)
		{
			std::copy(profile.delay.begin(), profile.delay.end(), m_delay.words.begin());
			renderDelay(m_delay, buses.delay, delay);
			renderReverb(profile.reverb, m_reverb, {profile.tables.data()}, buses.reverb, delay, reverb);
		}
		for (size_t i = 0; i < blockSize; ++i)
		{
			mixed.left[i] =
				fixed::word(fixed::pair(buses.main.left[i]) + fixed::pair(delay.left[i]) + fixed::pair(reverb.left[i]));
			mixed.right[i] = fixed::word(fixed::pair(buses.main.right[i]) + fixed::pair(delay.right[i]) +
										 fixed::pair(reverb.right[i]));
		}
		WideStereoBlock equalized;
		renderMasterEq(profile.eq, m_eq, mixed, equalized);
		renderCompressor(profile.compressor, m_compressor, equalized, _output);
	}
} // namespace mdNative
