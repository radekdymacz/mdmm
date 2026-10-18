#pragma once

// MIDI Learn, the audio thread's view (doc/midilearn/DESIGN-learn-0.8.md, decision C, slice L1): a fixed-size,
// trivially copyable table the message thread builds from the setup's mappings and publishes through a
// synthLib::Seqlock (LearnRouter::publish). The audio thread copies it at block start when it changed and reads only
// its own copy. No pointer in it is owned by the table, no strings, nothing to free.
//
// Invariant: every param in a published table belongs to the controller that lives while the table can be read; the
// session rebuilds and republishes the table whenever the controller is made, before audio can run with it.

#include <array>
#include <cstddef>
#include <cstdint>
#include <type_traits>

namespace pluginLib
{
	class Parameter;
}

namespace mdJucePlugin
{
	struct LearnTarget					// one mapping, resolved
	{
		pluginLib::Parameter* param = nullptr;	// null for a global target
		int16_t global = -1;			// the model's global id (B-169): the value goes to the message thread, not to a parameter
		uint8_t mode = 0;				// deskCore::LearnMode: Absolute, RelativeSigned, RelativeOffset
		uint8_t invert = 0;
		uint8_t next = 0xff;			// the next target of the same (channel, CC); 0xff ends the chain
		uint8_t mapping = 0xff;			// its index in DeskSetup::mappings (for the touched bits)
	};

	struct LearnTable					// trivially copyable, about 4.2 KiB
	{
		static constexpr size_t MaxTargets = 128;
		static constexpr size_t AnyChannel = 16;
		static constexpr uint8_t None = 0xff;

		uint32_t generation = 0;		// the session's count of tables built
		uint8_t count = 0;
		std::array<std::array<uint8_t, 128>, 17> head = emptyHeads();	// [channel 0-15 or AnyChannel][cc] -> first target, None: none
		std::array<LearnTarget, MaxTargets> targets{};

		static constexpr std::array<std::array<uint8_t, 128>, 17> emptyHeads()
		{
			std::array<std::array<uint8_t, 128>, 17> h{};
			for(auto& row : h)
			{
				for(auto& v : row)
					v = None;
			}
			return h;
		}

		// Builder (message thread): appends a target to the chain of (_channel, _cc); _channel 0-15 or AnyChannel. False
		// when the table is full or an argument is out of range (nothing changed). The chain keeps the order of adding.
		bool add(const size_t _channel, const uint8_t _cc, const LearnTarget& _target)
		{
			if(count >= MaxTargets || _channel > AnyChannel || _cc > 127)
				return false;
			const auto index = count++;
			targets[index] = _target;
			targets[index].next = None;
			auto* link = &head[_channel][_cc];
			while(*link != None)
				link = &targets[*link].next;
			*link = index;
			return true;
		}
	};

	static_assert(std::is_trivially_copyable_v<LearnTable>, "the learn table crosses threads as a plain value");
}
