#include "mdMachineMemoryDevice.h"

#include "mdPluginProcessor.h"

#include "juceUiLib/messageBox.h"
#include "juceUiLib/messageRoute.h"

#include "jucePluginLib/controller.h"

#include "mdLib/mddevice.h"
#include "mdLib/mdmemorymap.h"
#include "mdLib/mdstate.h"

#include <chrono>
#include <exception>

namespace mdJucePlugin
{
	namespace
	{
		double msBetween(const std::chrono::steady_clock::time_point _from, const std::chrono::steady_clock::time_point _to)
		{
			return std::chrono::duration<double, std::milli>(_to - _from).count();
		}

		// The machine a piece of a look belongs to: a rebooted machine is another one
		uint64_t machineOf(const md::Device& _device)
		{
			return _device.deviceId() << 40 ^ _device.hardwareEpoch();
		}
	}

	MachineMemoryDevice::MachineMemoryDevice(AudioPluginAudioProcessor& _processor, const md::MachineModel _model, std::string _noticeTitle)
		: m_processor(_processor), m_shape(machineMemory::shapeOf(_model)), m_noticeTitle(std::move(_noticeTitle))
	{
	}

	// A machine whose memory can be read and restored: valid, booted, no restore under way, and (MD) its factory flash known,
	// so its flash is the user's samples over the factory's
	bool MachineMemoryDevice::ready()
	{
		return m_processor.getPlugin().withDeviceLocked([this](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || !device->isValid() || device->isProjectStateRestorePending())
				return false;
			auto& hw = device->getHardware();
			// the firmware has booted: a first start's memory is formatted by then (before, the patch RAM is not yet the
			// factory memory the slots are laid over, and the firmware would format it again)
			if(!hw.isFirmwareMidiReady())
				return false;
			if(m_shape.sampleFlash)
				return hw.factoryFlashBaseline() != nullptr && !hw.isFactoryFlashInitializationExpected();
			return true;
		});
	}

	bool MachineMemoryDevice::look(const Piece& _piece, std::optional<uint64_t>& _machine, double& _heldMs)
	{
		bool ok = false;
		std::chrono::steady_clock::time_point held, released;
		m_processor.getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			held = std::chrono::steady_clock::now();
			struct Released { std::chrono::steady_clock::time_point& at; ~Released() { at = std::chrono::steady_clock::now(); } } done{released};
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || !device->isValid() || device->isProjectStateRestorePending())
				return;
			auto& hw = device->getHardware();
			if(!hw.isFirmwareMidiReady())
				return;
			const auto machine = machineOf(*device);
			if(_machine && *_machine != machine)
				return;
			_machine = machine;
			if(_piece.flashMark)
			{
				if(!hw.factoryFlashBaseline() || hw.isFactoryFlashInitializationExpected())
					return;
				auto& uc = hw.getUC();
				*_piece.flashMark = uc.flashDirty() ? uc.getCycles() - uc.flashIdleCycles() : 0;
			}
			if(_piece.patch && !hw.copyPatchRamRange(_piece.patch, _piece.patchAt, _piece.patchSize))
				return;
			if(_piece.userFlash)
			{
				const auto userBase = md::memorymap::g_flashFull.offset(md::memorymap::g_mmUserFlash.begin);
				if(!hw.getUC().copyFlashDataRangeRealtime(_piece.userFlash, userBase + _piece.userFlashAt, _piece.userFlashSize))
					return;
			}
			ok = true;
		});
		_heldMs = msBetween(held, released);
		return ok;
	}

	bool MachineMemoryDevice::copyFlash(uint8_t* _to, const size_t _at, const size_t _size, std::optional<uint64_t>& _machine, double& _copyMs)
	{
		return m_processor.getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || !device->isValid())
				return false;
			const auto machine = machineOf(*device);
			if(_machine && *_machine != machine)
				return false;
			_machine = machine;
			const auto t0 = std::chrono::steady_clock::now();
			const bool copied = device->getHardware().getUC().copyFlashDataRangeRealtime(_to, _at, _size);
			_copyMs = msBetween(t0, std::chrono::steady_clock::now());
			return copied;
		});
	}

	bool MachineMemoryDevice::startMemory(StartMemory& _memory)
	{
		return m_processor.getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || !device->isValid() || device->isProjectStateRestorePending())
				return false;
			auto& hw = device->getHardware();
			_memory.patch = hw.copyPatchRam();
			if(m_shape.userFlash)
				_memory.sectors = hw.copyUserFlash();
			else
			{
				_memory.sectors = hw.copyFlashData();
				_memory.rom = hw.flashBaseline();
				if(!hw.copyFactoryFlashBaseline(_memory.factory))
					return false;
			}
			return _memory.patch.size() == md::g_patchRamStateSize;
		});
	}

	uint64_t MachineMemoryDevice::restoreGeneration()
	{
		return m_processor.getPlugin().withDeviceLocked([](synthLib::Device* const _device)
		{
			const auto* const device = dynamic_cast<const md::Device*>(_device);
			return device ? device->deferredStateGeneration() : uint64_t{0};
		});
	}

	bool MachineMemoryDevice::restore(const std::vector<uint8_t>& _state)
	{
		return m_processor.getPlugin().setState(_state);
	}

	void MachineMemoryDevice::restored()
	{
		if(m_processor.hasController())
			m_processor.getController().onStateLoaded();
		m_processor.updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withNonParameterStateChanged(true));
	}

	bool MachineMemoryDevice::factoryState(std::vector<uint8_t>& _state, std::shared_ptr<void>& _fresh, std::string& _note)
	{
		std::shared_ptr<synthLib::Device> fresh;
		try
		{
			fresh.reset(m_processor.createDevice());
		}
		catch(const std::exception& _e)
		{
			_note = std::string("The machine could not be made again: ") + _e.what();
			return false;
		}
		auto* const freshMachine = dynamic_cast<md::Device*>(fresh.get());
		if(!freshMachine || !freshMachine->isValid())
		{
			_note = "The machine needs its ROM to start from factory memory. Nothing was changed.";
			return false;
		}
		if(!freshMachine->getState(_state, synthLib::StateTypeGlobal))
		{
			_note = "The factory memory could not be read. Nothing was changed.";
			return false;
		}
		_fresh = std::move(fresh);
		return true;
	}

	void MachineMemoryDevice::notice(const std::string& _text)
	{
		const genericUI::messageRoute::OwnerScope owner(static_cast<const void*>(&m_processor));	// this instance's window shows it
		genericUI::MessageBox::showOk(genericUI::MessageBox::Icon::Warning,	// the page shows it (messageRoute.h)
			m_noticeTitle + " machine memory", _text);
	}
}
