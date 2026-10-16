#pragma once

// I-024: the machine memory's port to the machine (mdMachineMemoryService.h) over the processor's emulated machine:
// every read and restore under the plug-in's device lock, the notices in this instance's window.

#include "mdMachineMemoryService.h"

#include <string>
#include <vector>

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
		static constexpr size_t g_flashCopyPart = 256 * 1024;
		static constexpr uint32_t g_flashCopyAttempts = 4;
		bool copyFlashInParts(uint8_t* _to, size_t _at, size_t _size, std::optional<uint64_t>& _machine, double& _copyMs,
			std::vector<uint8_t>* _patch);

		AudioPluginAudioProcessor& m_processor;
		const machineMemory::Shape m_shape;
		const std::string m_noticeTitle;
	};
}
