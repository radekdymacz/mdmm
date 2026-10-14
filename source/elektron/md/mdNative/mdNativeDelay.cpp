#include "mdNativeDelay.h"
#include "mdNativeFixed.h"

#include <cstdlib>

namespace mdNative
{
	void renderDelay(DelayState &_state, const StereoBlock &_input, StereoBlock &_output)
	{
		using namespace fixed;
		auto &s = _state.words;
		std::array<size_t, blockSize> writes{}, reads{};
		int64_t speed = pair(s[11]);
		const auto difference = pair(s[1] - s[11]);
		if (difference)
			speed += pair(s[13]);
		s[11] = word(speed);
		s[13] = word(floorDivide(difference, 2));
		const auto writeStep = floorDivide(speed, 16384);
		auto position = pair(s[9]);
		int64_t distance = 0;
		for (size_t i = 0; i < blockSize; ++i)
		{
			position += writeStep;
			if (position >= pair(delayRingSize - 1))
				position = 0;
			writes[i] = size_t(word(position));
			distance += writeStep;
		}
		s[9] = word(position);
		s[20] = word(distance);
		speed = pair(s[11]);
		const auto offsetDifference = pair(s[0] - s[10]);
		if (offsetDifference > 0)
			speed += floorDivide(offsetDifference, 2) + pair(512);
		else if (offsetDifference < 0)
			speed += floorDivide(offsetDifference, 4) - pair(512);
		s[21] = signedWord(uint32_t(s[21] + s[3]));
		speed += product(word(pair(std::abs(s[21])) - pair(0x400000)), s[2]);
		speed = std::min(speed, pair(32768));
		if ((s[10] <= 160 && speed > pair(16384)) || (s[10] >= 96859 && speed < pair(16384)))
			speed = pair(s[11]);
		const auto readStep = floorDivide(speed, 16384);
		position = pair(s[9] + s[10]);
		if (position >= pair(delayRingSize - 1))
			position -= pair(delayRingSize);
		position += readStep;
		distance = 0;
		for (size_t i = 0; i < blockSize; ++i)
		{
			if (position >= pair(delayRingSize - 1))
				position = 0;
			distance += readStep;
			reads[i] = size_t(word(position));
			position += readStep;
		}
		s[10] = word(pair(s[10]) + distance - pair(s[20]));
		StereoBlock feedback;
		for (size_t i = 0; i < blockSize; ++i)
		{
			const auto l = _state.left[reads[i]], r = _state.right[reads[i]];
			_output.left[i] = word(product(l, s[8]));
			_output.right[i] = word(product(r, s[8]));
			const auto a = word((pair(_input.left[i]) + product(l, s[4])) * 2);
			const auto b = word((pair(_input.right[i]) + product(r, s[4])) * 2);
			feedback.left[i] = word(product(a, 0x7eb852 - s[7]) + product(b, s[7]));
			feedback.right[i] = word(product(b, 0x7eb852 - s[7]) + product(a, s[7]));
		}
		for (unsigned channel = 0; channel < 2; ++channel)
		{
			auto &input = channel ? feedback.right : feedback.left;
			auto high = pair(s[16 + channel]);
			auto previous = s[18 + channel];
			for (auto &sample : input)
			{
				high += pair(sample - previous) - product(s[5], word(high));
				previous = sample;
				sample = word(high);
			}
			s[16 + channel] = word(high);
			s[18 + channel] = previous;
			auto low = pair(s[14 + channel]);
			auto &ring = channel ? _state.right : _state.left;
			for (size_t i = 0; i < blockSize; ++i)
			{
				ring[writes[i]] = word(low);
				low += product(s[6], input[i]) - product(s[6], word(low));
			}
			s[14 + channel] = word(low);
		}
	}
} // namespace mdNative
