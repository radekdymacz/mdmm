#pragma once

#include "mdNative.h"

namespace mdNative
{
	// Experimental sound-oriented variant. Keep phase in double to avoid float accumulation drift;
	// signal, gain and pitch-envelope arithmetic use float. It deliberately omits DSP truncation.
	struct FloatSineParameters
	{
		float pitchStep = 0, decay = 0, rampStep = 0, rampDecay = 0;
	};
	struct FloatSineState
	{
		double phase = 0;
		float gain = 0, ramp = 0;
	};
	using FloatBlock = std::array<float, blockSize>;

	FloatSineParameters toFloat(const SineParameters &_parameters);
	void trigger(FloatSineState &_state);
	// Once at initialization, outside the audio callback. Produces an ordinary sine with no ROM input.
	void generateSineWave(float *_wave);
	// _wave: the same 32768 entries as renderSine, normalized by 2^25 during initialization.
	// Parameters and state must be finite; coefficients are in [0,1]. This variant targets ordinary
	// musical states and does not reproduce arbitrary 24-bit register corruption or overflow.
	void renderSineFloat(const FloatSineParameters &_parameters, FloatSineState &_state, const float *_wave,
						 FloatBlock &_out);
} // namespace mdNative
