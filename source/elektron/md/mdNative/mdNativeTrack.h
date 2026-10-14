#pragma once

#include "mdNative.h"

namespace mdNative
{
	// MD OS 1.63 DSP1 P:$121..$133. Coefficients are the original signed 24-bit words.
	// This reconstructs the recursive kernel; the firmware's knob-to-coefficient calculation is separate.
	struct EqCoefficients
	{
		std::array<int32_t, 5> words{};
	};
	struct EqState
	{
		int32_t input1 = 0, input2 = 0, output1 = 0, output2 = 0;
		uint32_t fraction = 0;
	};
	void renderEq(const EqCoefficients &_coefficients, EqState &_state, const Block &_input, Block &_output);

	// MD OS 1.63 DSP1 P:$243..$25d: table-controlled gain followed by a DC-removal recurrence.
	struct AmpParameters
	{
		int32_t inputGain = 0, outputGain = 0;
	};
	struct AmpState
	{
		int32_t previousGain = 0, previousInput = 0, output = 0;
		uint32_t fraction = 0;
	};
	void renderAmp(const AmpParameters &_parameters, AmpState &_state, const Block &_input, Block &_output);

	// The two cascaded recursive sections at DSP1 P:$17a..$19f (upper cutoff) and $1ea..$21e
	// (lower cutoff). Each coefficient is smoothed per sample by an earlier firmware stage.
	struct FilterCoefficients
	{
		Block feedback2{}, feedback1{}, feedforward{}, middle{};
	};
	struct FilterState
	{
		int32_t output1 = 0, output2 = 0;
		uint32_t fraction = 0;
		int32_t intermediate1 = 0, intermediate2 = 0;
		uint32_t intermediateFraction = 0;
		int32_t input1 = 0, input2 = 0;
	};
	void renderUpperFilter(const FilterCoefficients &_coefficients, FilterState &_state, const Block &_input,
						   Block &_output);
	void renderLowerFilter(const FilterCoefficients &_coefficients, FilterState &_state, const Block &_input,
						   Block &_output);

	struct RateReductionState
	{
		int32_t phase = 0, held = 0;
	};
	void renderRateReduction(int32_t _control, RateReductionState &_state, const Block &_input, Block &_output);
	void renderAmplitudeModulation(int32_t _depth, int32_t _rate, uint32_t &_phase, const int32_t *_wave,
								   const Block &_input, Block &_output);
} // namespace mdNative
