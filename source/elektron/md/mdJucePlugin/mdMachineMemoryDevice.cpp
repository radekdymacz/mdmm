#include "mdMachineMemoryDevice.h"

#include "mdPluginProcessor.h"

#include "juceUiLib/messageBox.h"
#include "juceUiLib/messageRoute.h"

#include "jucePluginLib/controller.h"

#include "mdLib/mddevice.h"
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

	// DESIGN-audio-lock.md step 1: a copy larger than one part is taken a part per hold, the plug-in's lock released
	// between, and is the flash of one moment when the flash's write count did not move while it was taken (else it is
	// taken again, a few times). _patch: the patch RAM copied in the last part's hold, with the check (startMemory).
	bool MachineMemoryDevice::copyFlashInParts(uint8_t* const _to, const size_t _at, const size_t _size,
		std::optional<uint64_t>& _machine, double& _copyMs, std::vector<uint8_t>* const _patch)
	{
		_copyMs = 0;
		if(_size == 0)
			return true;
		for(uint32_t attempt = 0; attempt < g_flashCopyAttempts; ++attempt)
		{
			uint64_t writesAtStart = 0;
			bool consistent = false;
			bool ok = true;
			for(size_t done = 0; ok && !consistent && done < _size;)
			{
				const auto part = std::min(g_flashCopyPart, _size - done);
				const bool last = done + part >= _size;
				ok = m_processor.getPlugin().withDeviceLocked([&](synthLib::Device* const _device)
				{
					auto* const device = dynamic_cast<md::Device*>(_device);
					if(!device || !device->isValid())
						return false;
					const auto machine = machineOf(*device);
					if(_machine && *_machine != machine)
						return false;
					_machine = machine;
					auto& hw = device->getHardware();
					if(done == 0)
						writesAtStart = hw.flashWrites();
					const auto t0 = std::chrono::steady_clock::now();
					if(part && !hw.getUC().copyFlashDataRangeRealtime(_to + done, _at + done, part))
						return false;
					if(last)
					{
						consistent = hw.flashWrites() == writesAtStart;
						if(consistent && _patch)
							hw.copyPatchRamTo(*_patch);
					}
					_copyMs = std::max(_copyMs, msBetween(t0, std::chrono::steady_clock::now()));
					return true;
				});
				done += part;
			}
			if(!ok)
				return false;
			if(consistent)
				return true;
		}
		return false;	// the firmware kept writing the flash: the caller tries again later, as for a machine that changed
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
