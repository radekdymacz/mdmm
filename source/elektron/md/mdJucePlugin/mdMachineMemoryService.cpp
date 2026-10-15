#include "mdMachineMemoryService.h"

#include "mdMachineMemoryLock.h"

#include "mdLib/mdstate.h"
#include "synthLib/deviceTypes.h"
#include "synthLib/plugin.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <set>
#include <utility>

// ===== I-024: machine memory (doc/modern-ux/DESIGN-machine-memory.md, mdMachineMemory.h) =====
// The file is a store of saved slots: a save writes only the slots it changed (read, merge, write), a session with
// no project state lays the file's slots over the memory it starts with.

namespace mdJucePlugin
{
	// The watch's state, behind m_memoryMutex: the policy, the machine it watches (its hardware epoch: a restore or a
	// restart is a new machine, with a new base), the memory at the base and at the last look, the cost measured.
	struct MachineMemoryService::WatchState
	{
		machineMemory::Watch watch;
		std::optional<uint64_t> epoch;		// the machine the base is of
		std::optional<uint64_t> settling;	// a new machine's first signature: the base once a look sees it again
		uint32_t settleLooks = 0;
		Cost cost;
		// the patch RAM (and the MM's user flash) at the base, at the last look of this machine, and the look being taken
		std::vector<uint8_t> base, patch, scratch;
		std::vector<uint8_t> baseUserFlash, userFlash, scratchUserFlash;
		// MD: the flash at the base and at the last sample store (the sample sectors; sector n at n x 64 KiB)
		std::vector<uint8_t> baseFlash, flash;
		std::set<machineMemory::Key> forced;	// written at the next look whatever changed (the standalone's own saves, a seed)
		bool rebaseNext = false;			// the next machine's memory replaces this one (a project, the file's slots, factory)
		bool clearFileOnBase = false;		// Start from factory memory: the file goes once the new machine runs
		bool lastWriteFailed = false;
		bool writeWarned = false;			// a failed write was said this session
		double retryAtMs = 0;				// a failed write is tried again from then (every 5 s)
		bool prevValid = false;				// scratch holds the previous look of this machine (two looks to compare)
		bool clearFilePending = false;		// Start from factory memory: the file's slots saved before it go, once its lock is had
		uint64_t factoryAtMs = 0;			// when Start from factory memory was asked for (ms since 1970)
		// MD: a sample the page sent was stored (sampleStored): written once the flash is still
		uint64_t flashMark = 0;				// the cycle of the last flash write (0: none since the start)
		double flashChangedMs = 0;			// when that mark last moved
		std::optional<double> sampleArmedMs;	// a sample sent, its flash store not written yet
		uint64_t sampleArmMark = 0;

		// the sectors a save writes and their base: the MM's user flash, the MD's sample flash
		std::vector<uint8_t>& sectors(const machineMemory::Shape& _shape) { return _shape.userFlash ? userFlash : flash; }
		std::vector<uint8_t>& baseSectors(const machineMemory::Shape& _shape) { return _shape.userFlash ? baseUserFlash : baseFlash; }
	};

	// The "machine memory" thread: one look a second (lookOnce), never on the audio thread.
	class MachineMemoryService::Thread final : public juce::Thread
	{
	public:
		explicit Thread(MachineMemoryService& _service) : juce::Thread("machine memory"), m_service(_service) {}

		void run() override
		{
			while(!threadShouldExit())
			{
				m_service.lookOnce();
				wait(m_ms.load(std::memory_order_relaxed));
			}
		}

		std::atomic<int> m_ms{1000};

	private:
		MachineMemoryService& m_service;
	};

	MachineMemoryService::MachineMemoryService(MachineMemoryPort& _port, const md::MachineModel _model)
		: m_port(_port), m_shape(machineMemory::shapeOf(_model))
	{
	}

	MachineMemoryService::~MachineMemoryService()
	{
		stop();
	}

	void MachineMemoryService::start(Setup _setup)
	{
		m_folder = std::move(_setup.folder);
		changeSession([&](Session& _s)
		{
			_s.keep = _setup.keep;
			// Radek, 2026-10-12: one memory for everything, like a real machine. The standalone's own state (JUCE's, saved
			// when it quits) does not win over the file; a DAW project's does.
			_s.standaloneState = _setup.standaloneState;
			_s.plugIn = _setup.plugIn;
			// a plug-in in a DAW: the machine follows the host's tempo and transport (mdDeskSession.h, followHost)
			_s.followsHost = !_s.standaloneState && _s.plugIn;
		});
		m_watch = std::make_unique<WatchState>();
		if(m_folder.empty())
			return;
		m_thread = std::make_unique<Thread>(*this);
		m_thread->m_ms = m_lookMs.load();
		m_thread->startThread(juce::Thread::Priority::low);
	}

	// The thread is told to stop and waited for (never killed: it may hold the file or the plug-in's lock), then one last
	// look writes a save it has not written yet.
	void MachineMemoryService::stop()
	{
		if(!m_thread)
			return;
		m_thread->signalThreadShouldExit();
		m_thread->notify();
		(void)m_thread->waitForThreadToExit(-1);
		m_thread.reset();
		flush(FlushMode::Close);
	}

	void MachineMemoryService::wake()
	{
		if(m_thread)
			m_thread->notify();
	}

	MachineMemoryService::Session MachineMemoryService::session() const
	{
		const std::lock_guard lock(m_sessionMutex);
		return m_session;
	}

	bool MachineMemoryService::keep() const
	{
		return session().keep;
	}

	bool MachineMemoryService::started() const
	{
		return session().startDone;
	}

	bool MachineMemoryService::projectStateSeen() const
	{
		return session().projectState;
	}

	void MachineMemoryService::setFollowsHostForTest(const bool _follows)
	{
		changeSession([&](Session& _s) { _s.followsHost = _follows; });
	}

	void MachineMemoryService::setLookHookForTest(std::function<void(size_t)> _hook)
	{
		const std::lock_guard lock(m_lookHookMutex);
		m_hasLookHookForTest = static_cast<bool>(_hook);
		m_lookHookForTest = std::move(_hook);
	}

	void MachineMemoryService::setHostClock(const bool _on)
	{
		changeSession([&](Session& _s) { _s.followsHost = !_s.standaloneState && _s.plugIn && _on; });
	}

	void MachineMemoryService::stateComes()
	{
		changeSession([](Session& _s)
		{
			if(machineMemory::stateIsProject(_s.standaloneState))
				_s.projectState = true;	// a DAW project's memory wins over the machine memory file (also a late one)
			else
				_s.ownState = true;		// the standalone's own state: the file's slots are laid over it
		});
		willBeReplaced();
	}

	void MachineMemoryService::setLoadedMark(std::optional<machineMemory::Mark> _mark)
	{
		changeSession([&](Session& _s) { _s.loadedMark = std::move(_mark); });
	}

	juce::File MachineMemoryService::file() const
	{
		if(m_folder.empty())
			return {};
		return juce::File(juce::String::fromUTF8(m_folder.c_str())).getChildFile(machineMemory::g_fileName);
	}

	void MachineMemoryService::setLookMs(const int _ms)
	{
		m_lookMs = std::max(10, _ms);
		if(m_thread)
		{
			m_thread->m_ms = m_lookMs.load();
			m_thread->notify();
		}
	}

	void MachineMemoryService::setNote(std::string _note)
	{
		{
			const std::lock_guard lock(m_memoryMutex);
			m_note = std::move(_note);
		}
		m_version.fetch_add(1, std::memory_order_acq_rel);
	}

	MachineMemoryService::Status MachineMemoryService::status() const
	{
		Status s;
		s.keep = keep();
		s.available = !m_folder.empty();
		const std::lock_guard lock(m_memoryMutex);
		s.saved = s.available && file().existsAsFile();
		s.note = m_note;
		return s;
	}

	MachineMemoryService::Cost MachineMemoryService::cost() const
	{
		const std::lock_guard lock(m_memoryMutex);
		return m_watch ? m_watch->cost : Cost{};
	}

	// The saves this memory holds that the file lacks (the last look against the base, and what is still forced)
	machineMemory::Mark MachineMemoryService::mark() const
	{
		const std::lock_guard lock(m_memoryMutex);
		machineMemory::Mark mark;
		if(!m_watch || !m_watch->watch.based())
			return mark;
		auto& w = *m_watch;
		std::set<machineMemory::Key> keys(w.forced.begin(), w.forced.end());
		for(const auto& k : machineMemory::changedSlots(m_shape.model, w.base, w.patch))
			keys.insert(k);
		if(m_shape.userFlash)
			for(const auto& k : machineMemory::changedSectors(m_shape.model, w.baseUserFlash, w.userFlash))
				keys.insert(k);
		mark.pending.assign(keys.begin(), keys.end());
		return mark;
	}

	void MachineMemoryService::setKeep(const bool _keep)
	{
		{
			const std::lock_guard lock(m_memoryMutex);
			changeSession([&](Session& _s) { _s.keep = _keep; });
			// on again: the saves made while it was off (the watch kept its base) are merged into the file at once
			if(_keep && m_watch)
				m_watch->watch.writeSoon();
		}
		wake();
		m_version.fetch_add(1, std::memory_order_acq_rel);
	}

	// The machine refused the file's slots (a restore that failed): the file stays as it is (its slots are fine for a
	// later session: a refusal is this machine's), the session goes on with the memory it has, the notice says why.
	void MachineMemoryService::unusable(const std::string& _why)
	{
		const std::string text = _why + " The saved machine memory was kept as it is; this session goes on without it.";
		setNote(text);
		std::fprintf(stderr, "[MD] machine memory: %s\n", text.c_str());
		m_port.notice(text);
	}

	// I-024: the machine refused a restore. The file's payload (the Machinedrum's ROM changed, a bad state in a good
	// frame): the machine stays on factory memory, the notice says why. Factory memory: the file stays.
	bool MachineMemoryService::restoreFailed(const uint64_t _generation, const std::string& _error)
	{
		{
			// a refused restore changed nothing: the memory there is still the base
			const std::lock_guard lock(m_memoryMutex);
			if(m_watch)
				m_watch->rebaseNext = false;
		}
		bool memory = false, factory = false;
		changeSession([&](Session& _s)
		{
			if(_s.restoreGeneration != 0 && _generation == _s.restoreGeneration)
			{
				_s.restoreGeneration = 0;
				memory = true;
			}
			else if(_s.factoryGeneration != 0 && _generation == _s.factoryGeneration)
			{
				_s.factoryGeneration = 0;
				factory = true;
			}
		});
		if(memory)
		{
			unusable("The machine could not use it: " + _error);
			return true;
		}
		if(factory)
			factoryRefused();
		return false;
	}

	// A file the editor may replace (damaged, not ours, the previews' version 1): renamed to
	// machine-memory.unusable-<date-time>.bin beside it (never deleted, never over another), with the file lock held.
	std::string MachineMemoryService::moveFileAside(std::string _text)
	{
		const auto f = file();
		if(f.existsAsFile())
		{
			const auto stamp = juce::Time::getCurrentTime().formatted("%Y%m%d-%H%M%S");
			const auto aside = f.getParentDirectory().getChildFile(juce::String(machineMemory::g_unusableName) + "-" + stamp + ".bin")
				.getNonexistentSibling(false);
			if(f.moveFileTo(aside))
				_text += " The old file was kept as " + aside.getFullPathName().toStdString() + ".";
		}
		return _text;
	}

	// The file's saved slots (m_memoryMutex held). An unusable file is moved aside (the note says why) and counts as
	// none, so the next save starts a new one; a file that cannot be read stays and the write is refused (_ok false).
	machineMemory::StoreFile MachineMemoryService::readStore(bool& _ok, std::string& _note)
	{
		_ok = true;
		const auto f = file();
		if(!f.existsAsFile())
			return {};
		juce::MemoryBlock raw;
		if(!f.loadFileAsData(raw))
		{
			_ok = false;
			_note = "The saved machine memory could not be read (" + f.getFullPathName().toStdString() + ").";
			return {};
		}
		const auto* bytes = static_cast<const uint8_t*>(raw.getData());
		auto decoded = machineMemory::decode(std::vector<uint8_t>(bytes, bytes + raw.getSize()), m_shape.model);
		if(decoded.problem == machineMemory::Problem::None)
			return std::move(decoded.file);
		if(!machineMemory::replaceable(decoded))
		{
			// a newer editor's file, another layout, the other machine's: never written over
			_ok = false;
			_note = machineMemory::describe(decoded.problem) + " It is kept as it is and nothing is saved over it; move "
				+ f.getFullPathName().toStdString() + " away (or use that editor) to keep saving here.";
			return {};
		}
		_note = moveFileAside(machineMemory::describe(decoded.problem) + " Its saves are not used; the next save starts a new memory file.");
		return {};
	}

	// The whole store written to a temporary file in the folder, flushed to the disk (FileOutputStream::flush: fsync on
	// POSIX, FlushFileBuffers on Windows) and renamed over the old one: a crash leaves the old file or the new one.
	bool MachineMemoryService::writeFile(const juce::File& _file, const std::vector<uint8_t>& _bytes, std::string& _error)
	{
		const auto folder = _file.getParentDirectory().createDirectory();
		if(folder.failed())
		{
			_error = "The machine memory folder could not be made: " + folder.getErrorMessage().toStdString();
			return false;
		}
		juce::TemporaryFile temporary(_file, juce::TemporaryFile::useHiddenFile);
		auto out = temporary.getFile().createOutputStream();
		const bool wrote = out && out->openedOk() && out->write(_bytes.data(), _bytes.size());
		if(out)
			out->flush();
		const bool streamOk = out && out->getStatus().wasOk();
		out.reset();
		if(!wrote || !streamOk || temporary.getFile().getSize() != static_cast<juce::int64>(_bytes.size()))
		{
			_error = "The machine memory could not be written (disk full, or no permission?): " + _file.getFullPathName().toStdString();
			return false;
		}
		if(!temporary.overwriteTargetFileWithTemporary())
		{
			_error = "The machine memory file could not be replaced: " + _file.getFullPathName().toStdString();
			return false;
		}
		return true;
	}

	// A save (m_memoryMutex held): the file read, the slots _keys merged in from _patch and _sectors, written back.
	bool MachineMemoryService::write(const std::vector<machineMemory::Key>& _keys, const std::vector<uint8_t>& _base,
		const std::vector<uint8_t>& _patch, const std::vector<uint8_t>& _sectors)
	{
		const auto begin = std::chrono::steady_clock::now();
		auto& w = *m_watch;
		const auto& model = m_shape.model;
		bool readOk = true;
		std::string error;
		const machineMemory::FileLock fileLock(file());	// read, merge and rename: one at a time
		if(!fileLock.held())
		{
			readOk = false;
			error = "The machine memory file is busy (another editor holds it); the save is tried again.";
		}
		auto store = readOk ? readStore(readOk, error) : machineMemory::StoreFile{};
		const bool clearing = readOk && w.clearFilePending;
		if(clearing)
		{
			// Start from factory memory not done yet: its clear goes first, in this same hold of the lock (the slots
			// saved before it go; a newer save another editor made stays)
			machineMemory::dropSavedBefore(store, w.factoryAtMs);
		}
		std::vector<uint8_t> bytes;
		if(readOk)
		{
			const auto romFingerprint = session().romFingerprint;
			const bool hasSector = std::any_of(_keys.begin(), _keys.end(), [](const machineMemory::Key& _k) { return _k.kind == machineMemory::Kind::Sector; });
			if(hasSector && m_shape.sampleFlash && store.romFingerprint != romFingerprint)
			{
				// the file's samples belong to another ROM: they are kept in a file of their own before this ROM's go in
				machineMemory::StoreFile other;
				other.romFingerprint = store.romFingerprint;
				for(auto it = store.slots.begin(); it != store.slots.end();)
				{
					if(it->first.kind != machineMemory::Kind::Sector) { ++it; continue; }
					other.slots.insert(*it);
					it = store.slots.erase(it);
				}
				if(!other.slots.empty())
				{
					const auto keep = file().getSiblingFile(juce::String("machine-memory.samples-")
						+ juce::String::toHexString(static_cast<juce::int64>(other.romFingerprint)) + ".bin").getNonexistentSibling(false);
					std::string keepError;
					if(writeFile(keep, machineMemory::encode(model, other), keepError))
					{
						m_note = "The samples saved with another ROM were kept in " + keep.getFullPathName().toStdString() + ".";
						m_noticePending.store(true, std::memory_order_release);	// the timer shows it (message thread)
					}
					else
					{
						readOk = false;
						error = keepError + " (the samples saved with another ROM could not be kept, so none were replaced)";
					}
				}
				store.romFingerprint = romFingerprint;
			}
		}
		if(readOk)
		{
			machineMemory::mergeSaved(store.slots, model, _keys, _base, _patch, _sectors, static_cast<uint64_t>(juce::Time::currentTimeMillis()),
				session().followsHost);
			bytes = machineMemory::encode(model, store);
			if(writeFile(file(), bytes, error))
				error.clear();
			else if(error.empty())
				error = "The machine memory could not be written.";
		}
		const auto ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count();
		w.cost.writeMs = ms;
		const bool ok = readOk && error.empty();
		if(ok)
		{
			if(clearing)
				w.clearFilePending = false;
			++w.cost.writes;
			w.cost.fileBytes = bytes.size();
			w.cost.lastSlots = _keys.size();
		}
		else
			++w.cost.failedWrites;
		w.lastWriteFailed = !ok;
		const bool hadNote = !m_note.empty();
		if(!ok)
			m_note = error;
		else if(m_note.find("another ROM were kept") == std::string::npos)
			m_note.clear();
		if(!ok && !std::exchange(w.writeWarned, true))
			m_writeFailed.store(true, std::memory_order_release);	// the timer's notice, once a session
		if(!ok || hadNote || w.cost.writes == 1)
			m_version.fetch_add(1, std::memory_order_acq_rel);
		std::string names;
		for(size_t i = 0; i < _keys.size() && i < 6; ++i)
			names += (i ? ", " : "") + machineMemory::describe(_keys[i]);
		if(_keys.size() > 6)
			names += ", ...";
		std::fprintf(stderr, "[MD] machine memory: %s (%zu slots: %s; %zu bytes, %.2f ms)\n", ok ? "written" : error.c_str(), _keys.size(),
			names.c_str(), bytes.size(), ms);
		return ok;
	}

	// The slots that changed since the base (and the forced ones) merged into the file; the base takes them on (m_memoryMutex
	// held, w.patch the last look). _consistent: w.patch was read whole (one hold of the plug-in's lock); else only a slot
	// whose bytes were the same in the last two looks is written (a look taken in pieces can see a save half done), the
	// others are held back for the next look. A failed write leaves the base, so its slots stay pending: tried again
	// 5 s later (w.retryAtMs), with the next save and when the instance closes.
	MachineMemoryService::WriteResult MachineMemoryService::writeChanges(const bool _withForced, const bool _consistent)
	{
		auto& w = *m_watch;
		const auto& model = m_shape.model;
		const bool host = session().followsHost;
		std::set<machineMemory::Key> keys;
		if(_withForced)
			keys.insert(w.forced.begin(), w.forced.end());
		for(const auto& k : machineMemory::changedSlots(model, w.base, w.patch, host))
			keys.insert(k);
		if(m_shape.userFlash)
			for(const auto& k : machineMemory::changedSectors(model, w.baseUserFlash, w.userFlash))
				keys.insert(k);
		if(keys.empty())
			return WriteResult::Done;
		// MD sample sectors: copied twice now (or once in one hold), only sectors the same in both are taken
		const bool sampleSectors = m_shape.sampleFlash && std::any_of(keys.begin(), keys.end(), [](const machineMemory::Key& _k) { return _k.kind == machineMemory::Kind::Sector; });
		std::vector<uint8_t> flashAgain;
		bool flashOk = true;
		if(sampleSectors)
			flashOk = copyFlash(w.flash, _consistent) && (_consistent || copyFlash(flashAgain, false));
		std::vector<machineMemory::Key> list;
		bool heldBack = false;
		for(const auto& k : keys)
		{
			bool whole = _consistent;
			if(k.kind == machineMemory::Kind::Sector && m_shape.sampleFlash)
			{
				const size_t at = size_t{k.index} * machineMemory::g_sectorSize;
				whole = flashOk && (_consistent || (flashAgain.size() >= at + machineMemory::g_sectorSize
					&& std::memcmp(w.flash.data() + at, flashAgain.data() + at, machineMemory::g_sectorSize) == 0));
			}
			else if(!whole && w.prevValid)
			{
				if(k.kind != machineMemory::Kind::Sector)
					whole = machineMemory::slotSame(model, k, w.patch, w.scratch, host);
				else
				{
					const size_t at = size_t{k.index} * machineMemory::g_sectorSize;
					whole = w.scratchUserFlash.size() >= at + machineMemory::g_sectorSize
						&& std::memcmp(w.userFlash.data() + at, w.scratchUserFlash.data() + at, machineMemory::g_sectorSize) == 0;
				}
			}
			if(whole)
				list.push_back(k);
			else
				heldBack = true;
		}
		if(list.empty())
			return WriteResult::HeldBack;
		const auto& sectors = w.sectors(m_shape);
		// (while the machine follows the host, mergeSaved keeps the host bytes as the file has them)
		if(!write(list, w.base, w.patch, sectors))
		{
			w.retryAtMs = juce::Time::getMillisecondCounterHiRes() + 5000.0;
			return WriteResult::Failed;
		}
		for(const auto& k : list)
		{
			if(k.kind == machineMemory::Kind::Sector)
			{
				auto& base = w.baseSectors(m_shape);
				const size_t at = size_t{k.index} * machineMemory::g_sectorSize;
				if(base.size() >= at + machineMemory::g_sectorSize && sectors.size() >= at + machineMemory::g_sectorSize)
					std::copy_n(sectors.begin() + static_cast<std::ptrdiff_t>(at), machineMemory::g_sectorSize, base.begin() + static_cast<std::ptrdiff_t>(at));
			}
			else if(const auto* slot = machineMemory::findSlot(model, k))
				machineMemory::putSlot(*slot, w.base, machineMemory::slotBytes(*slot, w.patch));
			w.forced.erase(k);
		}
		return heldBack ? WriteResult::HeldBack : WriteResult::Done;
	}

	void MachineMemoryService::serviceTimer()
	{
		serviceStart();
		serviceNotices();
	}

	// I-024: what the thread had to say, said on the message thread: a write that failed (once), another note
	void MachineMemoryService::serviceNotices()
	{
		if(m_writeFailed.exchange(false))
			m_port.notice(status().note + " Your saves stay in this session; the editor tries again every few seconds and when it closes.");
		if(m_noticePending.exchange(false))
			m_port.notice(status().note);
	}

	// At the start of a session (the timer, message thread), once the machine runs with its ROM: a DAW project's state
	// wins; else the file's saved slots are laid over the memory the session starts with (factory memory, or the
	// standalone's own state), restored the way a project is.
	void MachineMemoryService::serviceStart()
	{
		const auto facts0 = session();
		if(facts0.startDone)
			return;
		machineMemory::StartFacts facts;
		facts.projectState = facts0.projectState;
		facts.keep = facts0.keep;
		facts.folder = !m_folder.empty();
		facts.machineReady = !facts.projectState && facts.keep && facts.folder && m_port.ready();
		const auto start = machineMemory::startOf(facts);
		if(start == machineMemory::Start::Wait)
			return;
		const auto startDone = [this](const bool _done) { changeSession([&](Session& _s) { _s.startDone = _done; }); };
		startDone(true);
		if(start != machineMemory::Start::Overlay)
			return;

		// the memory the session starts with, and (MD) what its flash is made of
		const auto& model = m_shape.model;
		MachineMemoryPort::StartMemory memory;
		if(!m_port.startMemory(memory))
		{
			startDone(false);	// the machine is changing: the next tick tries again
			return;
		}
		auto& patch = memory.patch;
		auto& sectors = memory.sectors;
		const auto& factory = memory.factory;
		const auto& rom = memory.rom;
		uint64_t romFingerprint = 0;
		if(m_shape.sampleFlash)
		{
			romFingerprint = machineMemory::hash(rom.data(), rom.size());
			changeSession([&](Session& _s) { _s.romFingerprint = romFingerprint; });
		}

		std::string note;
		machineMemory::StoreFile store;
		std::optional<machineMemory::Mark> mark;
		bool oldOwnState = false;
		{
			const std::lock_guard lock(m_memoryMutex);
			bool readOk = true;
			const machineMemory::FileLock fileLock(file(), 2000);
			if(!fileLock.held())
			{
				startDone(false);	// another editor holds the file: the next tick tries again
				return;
			}
			store = readStore(readOk, note);
			const auto now = session();
			if(now.standaloneState)
				mark = now.loadedMark;
			oldOwnState = now.standaloneState && now.ownState && !mark;
		}
		if(m_shape.sampleFlash && store.romFingerprint != 0 && store.romFingerprint != romFingerprint)
		{
			// the samples were saved with another ROM: its sectors are not laid over this one's flash
			for(auto it = store.slots.begin(); it != store.slots.end();)
				it = it->first.kind == machineMemory::Kind::Sector ? store.slots.erase(it) : std::next(it);
			note += std::string(note.empty() ? "" : " ") + "The saved samples belong to another ROM; they are not used.";
		}

		// the standalone's own saves the file lacks win over its slots and are written now
		std::set<machineMemory::Key> skip, forced;
		if(mark)
			skip.insert(mark->pending.begin(), mark->pending.end());
		forced = skip;
		if(oldOwnState)
		{
			// a standalone state from before I-024 (or the 0.6 previews): its slots that the file has too and differ are
			// replaced by the file's (the file was written later, by this editor) but kept aside first; every slot the
			// file lacks is seeded into it from the state
			const auto clash = machineMemory::conflicts(store.slots, model, patch, sectors);
			if(!clash.empty())
			{
				machineMemory::StoreFile kept;
				kept.romFingerprint = m_shape.sampleFlash ? romFingerprint : uint64_t{0};
				machineMemory::merge(kept.slots, model, clash, patch, sectors, static_cast<uint64_t>(juce::Time::currentTimeMillis()));
				const auto keptFile = file().getSiblingFile(machineMemory::g_keptName);
				std::string error;
				if(writeFile(keptFile, machineMemory::encode(model, kept), error))
					note += std::string(note.empty() ? "" : " ") + "The standalone's own " + std::to_string(clash.size())
						+ " slots that differ from the saved machine memory were replaced by the saved ones and kept in " + keptFile.getFullPathName().toStdString() + ".";
				else
					note += std::string(note.empty() ? "" : " ") + error;
			}
			for(const auto& s : machineMemory::patchSlots(model))
				if(!store.slots.count(s.key))
					forced.insert(s.key);
			for(uint32_t i = m_shape.firstSector; i < m_shape.endSector; ++i)
			{
				const machineMemory::Key k{machineMemory::Kind::Sector, i};
				const size_t at = size_t{i} * machineMemory::g_sectorSize;
				// MD: only the sectors the user's samples changed (not the factory's)
				const bool user = !m_shape.sampleFlash || (factory.size() >= at + machineMemory::g_sectorSize
					&& std::memcmp(factory.data() + at, sectors.data() + at, machineMemory::g_sectorSize) != 0);
				if(user && !store.slots.count(k))
					forced.insert(k);
			}
		}

		const bool changed = machineMemory::overlay(store.slots, model, patch, &sectors, skip);
		{
			const std::lock_guard lock(m_memoryMutex);
			m_watch->forced = forced;
			if(!forced.empty())
				m_watch->watch.writeSoon();
		}
		if(!note.empty())
		{
			setNote(note);
			m_port.notice(note);
		}
		if(!changed)
		{
			std::fprintf(stderr, "[MD] machine memory: %zu saved slots, the memory already holds them\n", store.slots.size());
			return;
		}
		std::vector<uint8_t> state{synthLib::g_stateVersion, synthLib::StateTypeGlobal};
		const bool encoded = m_shape.sampleFlash
			? md::encodeStateWithFactoryBaseline(state, patch, sectors, factory, rom, model, synthLib::StateTypeGlobal)
			: md::encodeState(state, patch, model, synthLib::StateTypeGlobal, sectors);
		if(!encoded)
		{
			unusable("The saved machine memory could not be laid over the memory.");
			return;
		}
		bool restored = false, began = false;
		willBeReplaced();
		{
			const std::lock_guard lock(m_memoryMutex);	// no write while the machine changes to it
			const auto before = m_port.restoreGeneration();
			restored = !m_refuseNextRestoreForTest.exchange(false) && m_port.restore(state);
			const auto after = m_port.restoreGeneration();
			// a refusal is reported by restoreFailed, by this generation (only when the restore began one)
			changeSession([&](Session& _s) { _s.restoreGeneration = after != before ? after : 0; });
			began = after != before;
			// refused at once: the memory there stays the base (a pending save is never taken into a new base)
			if(!restored)
				m_watch->rebaseNext = false;
		}
		if(!restored && !began)	// (a restore that began and failed is reported by restoreFailed)
			unusable("The machine did not take the saved machine memory.");
		std::fprintf(stderr, "[MD] machine memory: %zu saved slots laid over the memory%s\n", store.slots.size(), restored ? "" : ", refused");
		m_port.restored();
	}

	// RESET MACHINE… > Start from factory memory: a fresh machine's state; the file goes only once the machine runs on
	// it (the thread's next base), so a machine that refuses it leaves the file as it was.
	bool MachineMemoryService::startFromFactoryMemory(std::string& _note)
	{
		std::vector<uint8_t> state{synthLib::g_stateVersion, synthLib::StateTypeGlobal};
		std::shared_ptr<void> fresh;
		if(!m_port.factoryState(state, fresh, _note))
			return false;
		willBeReplaced();
		{
			const std::lock_guard lock(m_memoryMutex);
			m_watch->factoryAtMs = static_cast<uint64_t>(juce::Time::currentTimeMillis());
			const auto before = m_port.restoreGeneration();
			if(m_refuseNextRestoreForTest.exchange(false) || !m_port.restore(state))
			{
				m_watch->rebaseNext = false;
				_note = "The machine did not take the factory memory. Nothing was changed.";
				return false;
			}
			const auto after = m_port.restoreGeneration();
			changeSession([&](Session& _s) { _s.factoryGeneration = after != before ? after : 0; });
			// the saves made before it are written first (the new machine's first look), then the file goes
			m_watch->clearFileOnBase = true;
			m_watch->forced.clear();
			m_note.clear();
		}
		fresh.reset();
		changeSession([](Session& _s) { _s.restoreGeneration = 0; });
		wake();
		m_port.restored();
		m_version.fetch_add(1, std::memory_order_acq_rel);
		std::fprintf(stderr, "[MD] machine memory: starting from factory memory\n");
		_note = "The machine starts from factory memory.";
		return true;
	}

	// The machine refused the factory state (restoreFailed): the file stays.
	void MachineMemoryService::factoryRefused()
	{
		{
			const std::lock_guard lock(m_memoryMutex);
			m_watch->clearFileOnBase = false;
			m_watch->rebaseNext = false;
		}
		setNote("The machine did not take the factory memory; the saved machine memory was kept.");
	}

	// MD (any thread but the audio thread): the flash's sample sectors copied, one 64 KiB sector at a time under the
	// plug-in's lock (released between), every one checked to be of the same machine
	bool MachineMemoryService::copyFlash(std::vector<uint8_t>& _flash, const bool _atomic)
	{
		_flash.resize(md::g_romSize);
		double holdMax = 0;
		struct Measure
		{
			MachineMemoryService& s; double& max;
			~Measure() { if(s.m_watch) { s.m_watch->cost.flashHoldLastMs = max; s.m_watch->cost.flashHoldMaxMs = std::max(s.m_watch->cost.flashHoldMaxMs, max); } }
		} measure{*this, holdMax};
		std::optional<uint64_t> machine;
		const size_t step = _atomic ? _flash.size() - md::g_mdFirmwareFlashEnd : machineMemory::g_sectorSize;
		for(size_t at = md::g_mdFirmwareFlashEnd; at < _flash.size(); at += step)
		{
			double copyMs = 0;
			const bool ok = m_port.copyFlash(_flash.data() + at, at, step, machine, copyMs);
			holdMax = std::max(holdMax, copyMs);
			if(!ok)
				return false;
		}
		return true;
	}

	// One look, with m_memoryMutex held: a copy of the memory a save changes (the patch RAM, the Monomachine's user
	// flash) into the scratch buffers, then its signature (machineMemory::signature: the working areas, knobs and
	// automation left out). The copy is taken in 64 KiB chunks, the plug-in's lock taken for each and released between,
	// so the audio thread never waits for more than one chunk; every chunk checks it is still the same machine. A save
	// that lands while the chunks are taken changes the next look too, and a write waits for two looks that agree.
	// False: no machine to look at (none, starting, restoring, changed while it was looked at).
	bool MachineMemoryService::look(uint64_t& _signature, uint64_t& _epoch, const bool _atomic)
	{
		const size_t chunk = _atomic ? md::g_mmUserFlashStateSize : 0x10000;
		uint64_t flashMark = 0;
		auto& w = *m_watch;
		auto& patch = w.scratch;
		auto& userFlash = w.scratchUserFlash;
		patch.resize(md::g_patchRamStateSize);	// no allocation under the lock
		if(m_shape.userFlash)
			userFlash.resize(md::g_mmUserFlashStateSize);
		const auto begin = std::chrono::steady_clock::now();
		double lockMax = 0;
		std::optional<uint64_t> machine;
		// one piece under the lock
		const auto piece = [&](const MachineMemoryPort::Piece& _piece)
		{
			double heldMs = 0;
			const bool ok = m_port.look(_piece, machine, heldMs);
			lockMax = std::max(lockMax, heldMs);
			return ok;
		};
		// the state checks and (MD) the last flash write: only once the factory flash is known (a first start that
		// prepares it writes flash itself and is replaced by the processor: no save). The flash is not watched (OS 1.63
		// writes it by itself while the factory patterns play); a sample the page sends is (serviceSampleStore).
		{
			MachineMemoryPort::Piece first;
			if(m_shape.sampleFlash)
				first.flashMark = &flashMark;
			if(!piece(first))
				return false;
		}
		if(_atomic)
		{
			// one hold: the patch RAM and the user flash as they are at one moment
			MachineMemoryPort::Piece all;
			all.patch = patch.data();
			all.patchSize = patch.size();
			if(m_shape.userFlash)
			{
				all.userFlash = userFlash.data();
				all.userFlashSize = userFlash.size();
			}
			if(!piece(all))
				return false;
		}
		else
		{
			for(size_t at = 0; at < patch.size(); at += chunk)
			{
				MachineMemoryPort::Piece p;
				p.patch = patch.data() + at;
				p.patchAt = at;
				p.patchSize = std::min(chunk, patch.size() - at);
				if(!piece(p))
					return false;
				if(m_hasLookHookForTest.load(std::memory_order_acquire))
				{
					std::function<void(size_t)> hook;
					{
						const std::lock_guard hookLock(m_lookHookMutex);
						hook = m_lookHookForTest;
					}
					if(hook)
						hook(at);
				}
			}
			if(m_shape.userFlash)
			{
				for(size_t at = 0; at < userFlash.size(); at += chunk)
				{
					MachineMemoryPort::Piece p;
					p.userFlash = userFlash.data() + at;
					p.userFlashAt = at;
					p.userFlashSize = std::min(chunk, userFlash.size() - at);
					if(!piece(p))
						return false;
				}
			}
		}
		_epoch = *machine;
		const auto now = juce::Time::getMillisecondCounterHiRes();
		if(flashMark != w.flashMark)
		{
			w.flashMark = flashMark;
			w.flashChangedMs = now;
		}
		_signature = machineMemory::signature(m_shape.model, patch, m_shape.userFlash ? userFlash.data() : nullptr, m_shape.userFlash ? userFlash.size() : 0);
		// the longest time the audio thread could wait: one piece, from taking the lock to releasing it
		w.cost.lookLockLastMs = lockMax;
		w.cost.lookLockMaxMs = std::max(w.cost.lookLockMaxMs, lockMax);
		w.cost.lookMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count();
		++w.cost.looks;
		return true;
	}

	// A look of a new machine (another epoch), m_memoryMutex held. A machine that took over the same memory (a reboot,
	// a ROM reinstalled, the MD's factory flash prepared) or a storage image keeps the base: what differs from it is a
	// save, written as one. A memory replaced on purpose (willBeReplaced: a project, the file's slots, factory memory)
	// is the new base once it holds still for a look. False: not yet (still settling).
	bool MachineMemoryService::rebase(const uint64_t _signature, const uint64_t _epoch)
	{
		auto& w = *m_watch;
		if(w.watch.based() && !w.rebaseNext)
		{
			w.epoch = _epoch;
			std::swap(w.patch, w.scratch);
			std::swap(w.userFlash, w.scratchUserFlash);
			w.prevValid = false;
			return true;
		}
		if(w.settling != _signature && w.settleLooks < 2)
		{
			w.settling = _signature;
			++w.settleLooks;
			return false;
		}
		// the base is read whole (one hold of the plug-in's lock), so no half-done save is taken into it
		uint64_t signature = 0, epoch = 0;
		if(!look(signature, epoch, true) || epoch != _epoch)
			return false;
		w.rebaseNext = false;
		w.prevValid = false;
		w.base = w.scratch;
		std::swap(w.patch, w.scratch);
		if(m_shape.userFlash)
		{
			w.baseUserFlash = w.scratchUserFlash;
			std::swap(w.userFlash, w.scratchUserFlash);
		}
		else if(copyFlash(w.baseFlash, true))
			w.flash = w.baseFlash;
		const bool soon = w.watch.wantsWrite() || !w.forced.empty();
		w.watch.base(signature);
		if(soon)
			w.watch.writeSoon();
		w.epoch = _epoch;
		w.settling.reset();
		w.settleLooks = 0;
		w.sampleArmedMs.reset();
		if(w.clearFileOnBase)
		{
			// Start from factory memory: the machine runs on it now, so the file goes (once its lock is had)
			w.clearFileOnBase = false;
			w.forced.clear();
			w.clearFilePending = true;
			clearFile();
		}
		return true;
	}

	// Start from factory memory's end (m_memoryMutex held), inside the file's lock: the slots saved before it was asked
	// for go; a slot another instance saved since stays (the file is written back with it, or deleted when nothing is
	// left). A file this editor may not replace (a newer editor's, another layout's) is moved aside with a time stamp,
	// never deleted. Not had the lock: tried again at the next look and at the close.
	void MachineMemoryService::clearFile()
	{
		auto& w = *m_watch;
		const auto f = file();
		const machineMemory::FileLock fileLock(f, 200);
		if(!fileLock.held())
			return;
		w.clearFilePending = false;
		if(!f.existsAsFile())
			return;
		juce::MemoryBlock raw;
		const bool read = f.loadFileAsData(raw);
		const auto* bytes = static_cast<const uint8_t*>(raw.getData());
		auto decoded = machineMemory::decode(read ? std::vector<uint8_t>(bytes, bytes + raw.getSize()) : std::vector<uint8_t>{}, m_shape.model);
		std::string error;
		if(read && decoded.problem != machineMemory::Problem::None && !machineMemory::replaceable(decoded))
			m_note = moveFileAside("The saved machine memory was written by another editor; it was not deleted.");
		else if(decoded.problem == machineMemory::Problem::None)
		{
			machineMemory::dropSavedBefore(decoded.file, w.factoryAtMs);
			const bool empty = decoded.file.slots.empty() && decoded.file.foreign.empty();
			const bool gone = empty ? f.deleteFile() : writeFile(f, machineMemory::encode(m_shape.model, decoded.file), error);
			if(!gone && !writeFile(f, machineMemory::encode(m_shape.model, {}), error))
				m_note = "The machine memory file could not be cleared: " + f.getFullPathName().toStdString();
		}
		else if(!f.deleteFile())	// damaged: nothing in it to keep
			m_note = "The machine memory file could not be deleted: " + f.getFullPathName().toStdString();
		m_version.fetch_add(1, std::memory_order_acq_rel);
	}

	void MachineMemoryService::lookOnce()
	{
		const std::lock_guard lock(m_memoryMutex);
		auto& w = *m_watch;
		uint64_t signature = 0, epoch = 0;
		if(!look(signature, epoch, false))
			return;	// starting or restoring: the base and the last look of the old machine stay for its rebase
		if(w.epoch != epoch)
		{
			if(!rebase(signature, epoch))
				return;
		}
		else
		{
			std::swap(w.patch, w.scratch);
			std::swap(w.userFlash, w.scratchUserFlash);
			w.prevValid = true;
		}
		if(w.clearFilePending)
			clearFile();
		serviceSampleStore();
		// KEEP MEMORY off: nothing is written; the base stays, so turning it on writes the saves made meanwhile
		if(!keep())
			return;
		const auto now = juce::Time::getMillisecondCounterHiRes();
		const bool retryDue = w.lastWriteFailed && now >= w.retryAtMs;
		const bool wants = w.watch.look(signature, now);
		// after a failed write: nothing before its 5 s are up (a new save waits for them too)
		if(w.lastWriteFailed && !retryDue)
			return;
		if(!wants && !retryDue)
			return;
		switch(writeChanges(true, false))
		{
		case WriteResult::Done: w.watch.written(signature); break;
		case WriteResult::HeldBack: w.watch.writeSoon(); break;	// slots seen changing: the next look tries again
		case WriteResult::Failed: w.watch.written(signature); break;	// the 5 s retry takes it (the base keeps it pending)
		}
	}

	// MD (m_memoryMutex held, after a look): a sample the page sent is a save of a slot (ROM-xx), stored by the machine
	// into its flash after the transfer ends. The flash itself is not watched (the OS writes it by itself while the
	// factory patterns play); a sample sent from the page is written once the flash has been still for a second after
	// its store began, or 30 s after the transfer at the latest: the sectors that differ from the base. A sample sent by
	// another program (SDS over MIDI) is written with the next sample the page sends.
	void MachineMemoryService::serviceSampleStore()
	{
		auto& w = *m_watch;
		const auto now = juce::Time::getMillisecondCounterHiRes();
		if(m_sampleStored.exchange(false))
		{
			w.sampleArmedMs = now;
			w.sampleArmMark = w.flashMark;
		}
		if(!w.sampleArmedMs)
			return;
		const bool stored = w.flashMark != w.sampleArmMark && now - w.flashChangedMs >= 1000.0;
		if(!stored && now - *w.sampleArmedMs < 30000.0)
			return;
		w.sampleArmedMs.reset();
		takeSampleSectors(false);
	}

	// The sample sectors that differ from the base become forced (written at the next write, and named in the state
	// until then; writeChanges takes a sector only when two copies of it agree, or from one copy in one hold).
	void MachineMemoryService::takeSampleSectors(const bool _atomic)
	{
		auto& w = *m_watch;
		if(!m_shape.sampleFlash || !copyFlash(w.flash, _atomic))
			return;
		for(const auto& k : machineMemory::changedSectors(m_shape.model, w.baseFlash, w.flash))
			w.forced.insert(k);
		w.watch.writeSoon();
	}

	void MachineMemoryService::sampleStored()
	{
		m_sampleStored.store(true);
		wake();
	}

	// The memory is about to be replaced by another (a project's, the file's slots, factory memory): the saves of this
	// one are written now, and the next machine's memory is the new base, not a save.
	void MachineMemoryService::willBeReplaced()
	{
		flush(FlushMode::Replace);
		const std::lock_guard lock(m_memoryMutex);
		if(m_watch)
			m_watch->rebaseNext = true;
	}

	// Saves not written yet are written now. FlushMode::Close (the instance going away) and Replace (a memory about to be
	// replaced: a project, the file's slots, factory memory) take one last look whole, in one hold of the plug-in's lock
	// (about 0.1 ms, 0.3 ms with the MM's user flash); HostSave (the host saving its state, often while it plays, at 32
	// sample buffers) takes no look: it writes what the last two looks agree on, as the thread would.
	void MachineMemoryService::flush(const FlushMode _mode)
	{
		if(m_folder.empty() || !m_watch)
			return;
		const std::lock_guard lock(m_memoryMutex);
		auto& w = *m_watch;
		if(w.clearFilePending)
			clearFile();
		if(_mode == FlushMode::HostSave)
		{
			if(keep() && w.watch.based() && w.epoch)
				(void)writeChanges(true, false);
			return;
		}
		uint64_t signature = 0, epoch = 0;
		if(!look(signature, epoch, true))
			return;
		if(w.epoch != epoch)
		{
			// a new machine: as the thread's look would take it (a memory replaced on purpose waits for its base)
			if(!w.watch.based() || w.rebaseNext)
				return;
			w.epoch = epoch;
		}
		std::swap(w.patch, w.scratch);
		std::swap(w.userFlash, w.scratchUserFlash);
		w.prevValid = false;	// scratch: a look of another kind; the thread's next look compares again
		// closing: a sample sent and maybe not stored yet is written as it is (the close itself ends its store)
		if(_mode == FlushMode::Close && (w.sampleArmedMs || m_sampleStored.exchange(false)))
		{
			w.sampleArmedMs.reset();
			takeSampleSectors(true);
		}
		if(!keep() || !w.watch.based())
			return;
		if(writeChanges(true, true) == WriteResult::Done)
			w.watch.written(signature);
	}
}
