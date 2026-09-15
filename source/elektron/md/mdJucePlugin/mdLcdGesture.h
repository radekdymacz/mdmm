#pragma once

#include "mdLcdInteractionModel.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>

namespace mdJucePlugin::lcdInteraction
{
	inline constexpr double commandFineScale = 0.2;

	class DetentAccumulator
	{
	public:
		int add(const double _detents, const int _burstCap)
		{
			m_fraction += _detents;
			const auto whole = static_cast<int>(m_fraction);
			if(whole == 0)
				return 0;
			// Consume the complete input even if emission is capped. This matches
			// the physical knobs and cannot create an unbounded retry backlog.
			m_fraction -= whole;
			return std::clamp(whole, -_burstCap, _burstCap);
		}
		void reset() { m_fraction = 0; }
		double fraction() const { return m_fraction; }
	private:
		double m_fraction = 0;
	};

	class DragGesture
	{
	public:
		bool begin(const State& _state, const unsigned _encoder,
			const double _mouseX, const double _mouseY)
		{
			if(_encoder >= 8 || (_state.activeEncoderMask & (1u << _encoder)) == 0)
				return false;
			m_encoder = _encoder;
			m_identity = _state.identityToken;
			m_lastMouseX = _mouseX;
			m_lastMouseY = _mouseY;
			m_accumulator.reset();
			return true;
		}

		int drag(const State& _state, const double _mouseX, const double _mouseY,
			const double _detentsPerPixel, const int _burstCap)
		{
			if(!validFor(_state))
			{
				cancel();
				return 0;
			}
			// Match ElemKnob: right and up both increase the encoder. Supporting both
			// axes is important because users naturally drag rotary controls either way.
			const auto delta = (_mouseX - m_lastMouseX) - (_mouseY - m_lastMouseY);
			m_lastMouseX = _mouseX;
			m_lastMouseY = _mouseY;
			return m_accumulator.add(delta * _detentsPerPixel, _burstCap);
		}

		bool validFor(const State& _state) const
		{
			return m_encoder && _state.identityToken == m_identity
				&& (_state.activeEncoderMask & (1u << *m_encoder)) != 0;
		}

		void cancel()
		{
			m_encoder.reset();
			m_identity = 0;
			m_accumulator.reset();
		}

		bool active() const { return m_encoder.has_value(); }
		std::optional<unsigned> encoder() const { return m_encoder; }

	private:
		std::optional<unsigned> m_encoder;
		uint64_t m_identity = 0;
		double m_lastMouseX = 0;
		double m_lastMouseY = 0;
		DetentAccumulator m_accumulator;
	};
}
