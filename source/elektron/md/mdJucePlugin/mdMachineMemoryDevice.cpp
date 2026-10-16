#include "mdMachineMemoryDevice.h"

#include "mdPluginProcessor.h"

#include "juceUiLib/messageBox.h"
#include "juceUiLib/messageRoute.h"

#include "jucePluginLib/controller.h"

#include "mdLib/mddevice.h"
#include "mdLib/mdonemomentcopy.h"
#include "mdLib/mdfactorybaseline.h"
#include "mdLib/mdrom.h"
#include "mdLib/mdmemorymap.h"
#include "mdLib/mdstate.h"

#include <algorithm>
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
		// the facts the audio thread published (DESIGN-audio-lock.md step 2)
		const auto f = m_processor.machineFacts();
		if(f.kind != MachineFacts::Kind::Machine || !f.valid || f.restorePending)
			return false;
		// the firmware has booted: a first start's memory is formatted by then (before, the patch RAM is not yet the
		// factory memory the slots are laid over, and the firmware would format it again)
		if(!f.firmwareMidiReady)
			return false;
		if(m_shape.sampleFlash)
			return f.factoryFlashBaseline && !f.factoryFlashInitializationExpected;
		return true;
	}

	bool MachineMemoryDevice::copyAtOneMoment(std::vector<md::OneMomentCopy::Area> _areas, std::optional<uint64_t>& _machine,
		double& _heldMs, double& _copyMs, const std::function<bool(md::Device&)>& _check,
		const std::function<void(md::Device&)>& _last)
	{
		_heldMs = 0;
		_copyMs = 0;
		md::OneMomentCopy copy;
		copy.begin(std::move(_areas));	// reserves: outside the lock
		for(;;)
		{
			auto result = md::OneMomentCopy::Step::Failed;
			const bool ok = m_processor.getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
			{
				const auto held = std::chrono::steady_clock::now();
				struct Released
				{
					std::chrono::steady_clock::time_point from;
					double& max;
					~Released() { max = std::max(max, msBetween(from, std::chrono::steady_clock::now())); }
				} released{held, _heldMs};
				auto* const device = dynamic_cast<md::Device*>(_device);
				if(!device || !device->isValid())
					return false;
				const auto machine = machineOf(*device);
				if(_machine && *_machine != machine)
					return false;
				_machine = machine;
				if(_check && !_check(*device))
					return false;
				const auto t0 = std::chrono::steady_clock::now();
				result = copy.step(device->getHardware());
				_copyMs = std::max(_copyMs, msBetween(t0, std::chrono::steady_clock::now()));
				if(result == md::OneMomentCopy::Step::Done && _last)
					_last(*device);
				return true;
			});
			if(!ok || result == md::OneMomentCopy::Step::Failed)
				return false;
			if(result == md::OneMomentCopy::Step::Done)
				return true;
		}
	}

	bool MachineMemoryDevice::look(const Piece& _piece, std::optional<uint64_t>& _machine, double& _heldMs)
	{
		// the piece's buffers are the caller's: copied into vectors of ours, then out (the copy grows its buffers)
		std::vector<uint8_t> patch, userFlash;
		std::vector<md::OneMomentCopy::Area> areas;
		if(_piece.patch && _piece.patchSize)
			areas.push_back({false, &patch, _piece.patchAt, _piece.patchSize});
		if(_piece.userFlash && _piece.userFlashSize)
		{
			const auto userBase = md::memorymap::g_flashFull.offset(md::memorymap::g_mmUserFlash.begin);
			areas.push_back({true, &userFlash, userBase + _piece.userFlashAt, _piece.userFlashSize});
		}
		const auto check = [&](md::Device& _device)
		{
			if(_device.isProjectStateRestorePending())
				return false;
			auto& hw = _device.getHardware();
			if(!hw.isFirmwareMidiReady())
				return false;
			// whether there is a factory baseline, without making one (that copies the factory cache): every hold
			if(_piece.flashMark && (!hw.hasFactoryFlashBaseline() || hw.isFactoryFlashInitializationExpected()))
				return false;
			if(_piece.userFlash)
			{
				const auto userBase = md::memorymap::g_flashFull.offset(md::memorymap::g_mmUserFlash.begin);
				if(hw.getUC().flashSize() < userBase + _piece.userFlashAt + _piece.userFlashSize)
					return false;
			}
			return true;
		};
		const auto last = [&](md::Device& _device)
		{
			if(!_piece.flashMark)
				return;
			auto& uc = _device.getHardware().getUC();
			*_piece.flashMark = uc.flashDirty() ? uc.getCycles() - uc.flashIdleCycles() : 0;
		};
		double copyMs = 0;
		if(!copyAtOneMoment(std::move(areas), _machine, _heldMs, copyMs, check, last))
			return false;
		if(_piece.patch && _piece.patchSize)
			std::copy(patch.begin(), patch.end(), _piece.patch);
		if(_piece.userFlash && _piece.userFlashSize)
			std::copy(userFlash.begin(), userFlash.end(), _piece.userFlash);
		return true;
	}

	// DESIGN-audio-lock.md: the flash (and with it the patch RAM: startMemory) as of one moment, a part per hold
	bool MachineMemoryDevice::copyFlashInParts(uint8_t* const _to, const size_t _at, const size_t _size,
		std::optional<uint64_t>& _machine, double& _copyMs, std::vector<uint8_t>* const _patch)
	{
		std::vector<uint8_t> flash;
		std::vector<md::OneMomentCopy::Area> areas;
		if(_size)
			areas.push_back({true, &flash, _at, _size});
		if(_patch)
			areas.push_back({false, _patch, 0, md::g_patchRamStateSize});
		double heldMs = 0;
		if(!copyAtOneMoment(std::move(areas), _machine, heldMs, _copyMs))
			return false;
		std::copy(flash.begin(), flash.end(), _to);
		return true;
	}

	bool MachineMemoryDevice::copyFlash(uint8_t* _to, const size_t _at, const size_t _size, std::optional<uint64_t>& _machine, double& _copyMs)
	{
		return copyFlashInParts(_to, _at, _size, _machine, _copyMs, nullptr);
	}

	bool MachineMemoryDevice::startMemory(StartMemory& _memory)
	{
		// The checks and what is immutable per Hardware (the ROM, the factory baseline: shared, decoded below without
		// the lock), then the flash a part per hold and the patch RAM with the last part (copyFlashInParts)
		std::shared_ptr<const md::Rom> rom;
		std::shared_ptr<md::FactoryFlashBaseline> factory;
		std::optional<uint64_t> machine;
		size_t flashAt = 0, flashSize = 0;
		const bool ready = m_processor.getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
		{
			auto* const device = dynamic_cast<md::Device*>(_device);
			if(!device || !device->isValid() || device->isProjectStateRestorePending())
				return false;
			machine = machineOf(*device);
			auto& hw = device->getHardware();
			if(m_shape.userFlash)
			{
				flashAt = md::memorymap::g_flashFull.offset(md::memorymap::g_mmUserFlash.begin);
				flashSize = md::memorymap::g_mmUserFlash.size();
				return hw.getUC().flashSize() >= flashAt + flashSize;
			}
			flashSize = hw.getUC().flashSize();
			rom = hw.sharedRom();
			factory = hw.factoryFlashBaseline();
			return rom && factory;
		});
		if(!ready)
			return false;
		_memory.sectors.resize(flashSize);
		double copyMs = 0;
		if(!copyFlashInParts(_memory.sectors.data(), flashAt, flashSize, machine, copyMs, &_memory.patch))
			return false;
		if(!m_shape.userFlash)
		{
			uint64_t fingerprint = 0;
			std::shared_ptr<const std::vector<uint8_t>> baseline;
			if(!factory->get(baseline, fingerprint))
				return false;
			_memory.factory = std::move(baseline);
			_memory.rom = std::shared_ptr<const std::vector<uint8_t>>(rom, &rom->data());
		}
		return _memory.patch.size() == md::g_patchRamStateSize;
	}

	uint64_t MachineMemoryDevice::restoreGeneration()
	{
		const auto f = m_processor.machineFacts();
		return f.kind == MachineFacts::Kind::Machine ? f.restoreGeneration : uint64_t{0};
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
