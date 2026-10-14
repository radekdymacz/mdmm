#include "mdNativeFloat.h"

#include <cmath>

namespace mdNative
{
	FloatSineParameters toFloat(const SineParameters &_parameters)
	{
		return {float(_parameters.pitch) / 64.0f, float(_parameters.decay) / 8388608.0f,
				float(_parameters.ramp) / 64.0f, float(_parameters.rampDecay) / 8388608.0f};
	}

	void trigger(FloatSineState &_state)
	{
		_state = {0.0, float(0x7ffff8) / 8388608.0f, float(0x7ffff8) / 8388608.0f};
	}

	void generateSineWave(float *_wave)
	{
		constexpr double twoPi = 6.283185307179586476925286766559;
		for (size_t i = 0; i < 32768; ++i)
			_wave[i] = static_cast<float>(std::sin(twoPi * double(i) / 32768.0) * 0.25);
	}

	void renderSineFloat(const FloatSineParameters &_parameters, FloatSineState &_state, const float *_wave,
						 FloatBlock &_out)
	{
		const double increment = double(_parameters.pitchStep) + double(_parameters.rampStep) * _state.ramp;
		_state.ramp *= _parameters.rampDecay;
		for (auto &sample : _out)
		{
			_state.phase -= std::floor(_state.phase / 32768.0) * 32768.0;
			sample = _wave[static_cast<size_t>(_state.phase)] * _state.gain;
			_state.phase += increment;
			_state.gain *= _parameters.decay;
		}
	}
} // namespace mdNative
