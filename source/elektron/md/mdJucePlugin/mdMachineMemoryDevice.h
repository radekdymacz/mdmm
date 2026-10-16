#pragma once

// I-024: the machine memory's port to the machine (mdMachineMemoryService.h) over the processor's emulated machine:
// every read and restore under the plug-in's device lock, the notices in this instance's window.

#include "mdMachineMemoryService.h"

#include <functional>
#include <optional>
#include <string>
#include <vector>

#include "mdLib/mdonemomentcopy.h"

namespace md
{
	class Device;
}

namespace mdJucePlugin
{
	class AudioPluginAudioProcessor;

	class MachineMemoryDevice final : public MachineMemoryPort
	{
	public:
		// _noticeTitle: the product's name, the title of its notices
		MachineMemoryDevice(AudioPluginAudioProcessor& _processor, md::MachineModel _model, std::string _noticeTitle);

		bool ready() override;
		bool look(const Piece& _piece, std::optional<uint64_t>& _machine, double& _heldMs) override;
		bool copyFlash(uint8_t* _to, size_t _at, size_t _size, std::optional<uint64_t>& _machine, double& _copyMs) override;
		bool startMemory(StartMemory& _memory) override;
		uint64_t restoreGeneration() override;
		bool restore(const std::vector<uint8_t>& _state) override;
		void restored() override;
		bool factoryState(std::vector<uint8_t>& _state, std::shared_ptr<void>& _fresh, std::string& _note) override;
		void notice(const std::string& _text) override;

	private:
		// A copy of the machine's memory as it was at one moment, a part per hold of the plug-in's lock
		// (md::OneMomentCopy, DESIGN-audio-lock.md). _check: every hold, before anything is copied (false: no copy).
		// _last: in the hold the copy is of. _heldMs: the longest hold. False: no machine, another machine, or _check
		// said no.
		bool copyAtOneMoment(std::vector<md::OneMomentCopy::Area> _areas, std::optional<uint64_t>& _machine, double& _heldMs,
			double& _copyMs, const std::function<bool(md::Device&)>& _check = {}, const std::function<void(md::Device&)>& _last = {});
		bool copyFlashInParts(uint8_t* _to, size_t _at, size_t _size, std::optional<uint64_t>& _machine, double& _copyMs,
			std::vector<uint8_t>* _patch);

		AudioPluginAudioProcessor& m_processor;
		const machineMemory::Shape m_shape;
		const std::string m_noticeTitle;
	};
}
