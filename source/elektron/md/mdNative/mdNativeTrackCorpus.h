#pragma once

#include "mdNativeCorpus.h"
#include "mdNativeTrack.h"

namespace mdNative::proof
{
	constexpr uint32_t trackMagic = 0x32544e4d; // MNT2
	struct TrackCase
	{
		uint32_t kind = 0; // EQ, amp/DC removal, upper/lower filter, rate reduction, amplitude modulation
		std::array<int32_t, 5> parameters{};
		std::array<int32_t, 8> before{}, after{};
		FilterCoefficients coefficients;
		Block input{}, output{};
	};
	inline std::array<int32_t, 8> words(const EqState &_s)
	{
		return {_s.input1, _s.input2, _s.output1, _s.output2, int32_t(_s.fraction)};
	}
	inline std::array<int32_t, 8> words(const AmpState &_s)
	{
		return {_s.previousGain, _s.previousInput, _s.output, int32_t(_s.fraction), 0};
	}
	inline std::array<int32_t, 8> words(const FilterState &_s)
	{
		return {_s.output1,		  _s.output2,		int32_t(_s.fraction),
				_s.intermediate1, _s.intermediate2, int32_t(_s.intermediateFraction),
				_s.input1,		  _s.input2};
	}
	inline TrackCase native(const TrackCase &_c, const int32_t *_wave = nullptr)
	{
		auto result = _c;
		const auto &s = _c.before;
		if (_c.kind == 0)
		{
			EqState state{s[0], s[1], s[2], s[3], uint32_t(s[4]) & 0xffffff};
			renderEq({_c.parameters}, state, _c.input, result.output);
			result.after = words(state);
		}
		else if (_c.kind == 2 || _c.kind == 3)
		{
			FilterState state{s[0], s[1], uint32_t(s[2]) & 0xffffff, s[3], s[4], uint32_t(s[5]) & 0xffffff, s[6], s[7]};
			if (_c.kind == 2)
				renderUpperFilter(_c.coefficients, state, _c.input, result.output);
			else
				renderLowerFilter(_c.coefficients, state, _c.input, result.output);
			result.after = words(state);
		}
		else if (_c.kind == 4)
		{
			RateReductionState state{s[0], s[1]};
			renderRateReduction(_c.parameters[0], state, _c.input, result.output);
			result.after = {state.phase, state.held};
		}
		else if (_c.kind == 5 && _wave)
		{
			auto phase = uint32_t(s[0]);
			renderAmplitudeModulation(_c.parameters[0], _c.parameters[1], phase, _wave, _c.input, result.output);
			result.after = {int32_t(phase)};
		}
		else if (_c.kind == 1)
		{
			AmpState state{s[0], s[1], s[2], uint32_t(s[3]) & 0xffffff};
			renderAmp({_c.parameters[0], _c.parameters[1]}, state, _c.input, result.output);
			result.after = words(state);
		}
		else
			throw std::runtime_error("unknown track corpus stage");
		return result;
	}
	inline void writeTrackCase(std::ostream &_out, const TrackCase &_case)
	{
		writeWord(_out, _case.kind);
		for (const auto value : _case.parameters)
			writeWord(_out, uint32_t(value));
		for (const auto *values : {&_case.before, &_case.after})
			for (const auto value : *values)
				writeWord(_out, uint32_t(value));
		for (const auto *values :
			 {&_case.input, &_case.output, &_case.coefficients.feedback2, &_case.coefficients.feedback1,
			  &_case.coefficients.feedforward, &_case.coefficients.middle})
			for (const auto value : *values)
				writeWord(_out, uint32_t(value));
	}
	inline TrackCase readTrackCase(std::istream &_in)
	{
		TrackCase c;
		c.kind = readWord(_in);
		for (auto &value : c.parameters)
			value = signedWord(readWord(_in));
		for (auto *values : {&c.before, &c.after})
			for (auto &value : *values)
			{
				const auto word = readWord(_in);
				// Explicit two's-complement decoding, also for the unsigned fractional fields.
				value = static_cast<int32_t>(word & 0x7fffffff) - int32_t(word >> 31) * int64_t(0x80000000);
			}
		for (auto *values : {&c.input, &c.output, &c.coefficients.feedback2, &c.coefficients.feedback1,
							 &c.coefficients.feedforward, &c.coefficients.middle})
			for (auto &value : *values)
				value = signedWord(readWord(_in));
		return c;
	}
} // namespace mdNative::proof
