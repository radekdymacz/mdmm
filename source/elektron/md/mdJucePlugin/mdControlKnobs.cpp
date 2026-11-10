#include "mdControlKnobs.h"

#include <algorithm>
#include <cmath>
#include <memory>

namespace mdJucePlugin
{
	ControlKnob::ControlKnob(ControlKnobs& _owner, const size_t _index)
		: juce::AudioProcessorParameterWithID(juce::ParameterID(ControlKnobs::parameterId(_index), 1),
			juce::String("Knob ") + juce::String(static_cast<int>(_index) + 1))
		, m_owner(_owner)
		, m_index(_index)
	{
	}

	uint8_t ControlKnob::fromNormalised(const float _value)
	{
		if(!(_value > 0.0f))	// also NaN
			return 0;
		return static_cast<uint8_t>(std::clamp(static_cast<int>(std::lround(_value * 127.0f)), 0, 127));
	}

	float ControlKnob::getValue() const
	{
		return toNormalised(value127());
	}

	uint8_t ControlKnob::value127() const
	{
		return m_owner.m_values[m_index].load(std::memory_order_relaxed);
	}

	void ControlKnob::setValue(const float _newValue)
	{
		const auto v = fromNormalised(_newValue);
		// only a change drives the row: a host that sends back what the plug-in told it (showLaneValue) moves nothing
		if(m_owner.m_values[m_index].exchange(v, std::memory_order_relaxed) == v)
			return;
		m_owner.m_hostMoved.fetch_or(1u << m_index, std::memory_order_release);
	}

	void ControlKnob::showLaneValue(const uint8_t _value)
	{
		const auto v = static_cast<uint8_t>(_value & 0x7f);
		m_owner.m_values[m_index].store(v, std::memory_order_relaxed);
		sendValueChangedMessageToListeners(toNormalised(v));
	}

	juce::String ControlKnob::getText(const float _normalised, const int _maximumLength) const
	{
		return juce::String(static_cast<int>(fromNormalised(_normalised))).substring(0, std::max(1, _maximumLength));
	}

	float ControlKnob::getValueForText(const juce::String& _text) const
	{
		return toNormalised(static_cast<uint8_t>(std::clamp(_text.trim().getIntValue(), 0, 127)));
	}

	juce::String ControlKnobs::parameterId(const size_t _index)
	{
		return juce::String("control_knob_") + juce::String(static_cast<int>(_index) + 1);
	}

	void ControlKnobs::addTo(juce::AudioProcessor& _processor)
	{
		auto group = std::make_unique<juce::AudioProcessorParameterGroup>("control", "Control", "|");
		for(size_t k = 0; k < Count; ++k)
		{
			auto knob = std::make_unique<ControlKnob>(*this, k);
			m_knobs[k] = knob.get();
			group->addChild(std::move(knob));
		}
		_processor.addParameterGroup(std::move(group));
	}

	uint32_t ControlKnobs::takeHostMoves(std::array<uint8_t, Count>& _values) noexcept
	{
		const auto moved = m_hostMoved.exchange(0, std::memory_order_acq_rel);
		for(size_t k = 0; k < Count; ++k)
			_values[k] = m_values[k].load(std::memory_order_relaxed);
		return moved;
	}
}
