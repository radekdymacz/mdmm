#pragma once

// B-205 (0.9.1, doc/release/0.9.1/control-matrix-host-params.md): the Control page's eight knob rows as host parameters
// Knob 1-8, so a DAW can map them (an Ableton Rack macro, Push 2). Plain JUCE parameters appended after the
// controller's (their own group, ids control_knob_1..8): the existing ids, their order and the controller's automation
// snapshot do not change.
//
// Host to lane: setValue stores the value and, when it changed, marks the knob; the audio thread takes the marks at the
// block's start (takeHostMoves) and the learn router runs the knob row's chain (LearnRouter::driveKnob).
// Lane to host: showLaneValue (message thread) stores the value and tells the host, never through setValue, so it never
// marks the knob: no loop, and a host that sends the value back sends what is stored already.

#include "juce_audio_processors/juce_audio_processors.h"

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>

namespace mdJucePlugin
{
	class ControlKnobs;

	class ControlKnob final : public juce::AudioProcessorParameterWithID
	{
	public:
		ControlKnob(ControlKnobs& _owner, size_t _index);

		float getValue() const override;
		void setValue(float _newValue) override;	// the host: drives the knob row (at the next block's start)
		float getDefaultValue() const override { return 0.0f; }
		int getNumSteps() const override { return 128; }
		bool isDiscrete() const override { return true; }
		juce::String getText(float _normalised, int _maximumLength) const override;
		float getValueForText(const juce::String& _text) const override;

		// Message thread: the knob row moved (a CC on the host's MIDI in, the page's drag): the host hears the value.
		// The caller opens and closes the change gesture.
		void showLaneValue(uint8_t _value);
		uint8_t value127() const;
		size_t index() const { return m_index; }

		static float toNormalised(uint8_t _value) { return static_cast<float>(_value & 0x7f) / 127.0f; }
		static uint8_t fromNormalised(float _value);

	private:
		ControlKnobs& m_owner;
		const size_t m_index;
	};

	class ControlKnobs
	{
	public:
		static constexpr size_t Count = 8;

		ControlKnobs() = default;
		ControlKnobs(const ControlKnobs&) = delete;
		ControlKnobs& operator=(const ControlKnobs&) = delete;

		// Once, after every other parameter is registered: the group "Control" goes last (the processor owns the parameters)
		void addTo(juce::AudioProcessor& _processor);

		ControlKnob* knob(size_t _index) const { return _index < Count ? m_knobs[_index] : nullptr; }

		// Audio thread: the knobs the host moved since the last call, as a bit mask (bit k: Knob k + 1); _values gets every
		// knob's value
		uint32_t takeHostMoves(std::array<uint8_t, Count>& _values) noexcept;

		static juce::String parameterId(size_t _index);

	private:
		friend class ControlKnob;

		std::array<ControlKnob*, Count> m_knobs{};
		std::array<std::atomic<uint8_t>, Count> m_values{};
		std::atomic<uint32_t> m_hostMoved{0};
	};
}
