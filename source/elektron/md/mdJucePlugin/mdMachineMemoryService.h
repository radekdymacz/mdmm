#pragma once

// I-024: the machine's memory that stays for every new session (doc/modern-ux/DESIGN-machine-memory.md). The impure
// half of mdMachineMemory.h: the "machine memory" thread and its watch, the file's reads and writes, the start's overlay,
// Start from factory memory, the flushes. It talks to the machine only through MachineMemoryPort (the processor's side:
// mdMachineMemoryDevice.h); the processor owns one and forwards the host's events to it. What differs between the
// machines is machineMemory::Shape, chosen once.
//
// Threads and locks: the thread (a look a second, never the audio thread) and the flushes hold m_memoryMutex for a look
// and a write (the watch, the note, the cost, the file); the session's facts are one value behind m_sessionMutex, taken
// alone or inside m_memoryMutex, never across a look or a file. The atomics only wake the thread or the timer.

#include "mdMachineMemory.h"

#include "juce_core/juce_core.h"

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace mdJucePlugin
{
	// The machine a look belongs to: the device and its hardware epoch (a rebooted machine is another one), compared
	// exactly as a pair
	struct MachineId
	{
		uint64_t device = 0;
		uint64_t epoch = 0;
		friend bool operator==(const MachineId& _a, const MachineId& _b) { return _a.device == _b.device && _a.epoch == _b.epoch; }
		friend bool operator!=(const MachineId& _a, const MachineId& _b) { return !(_a == _b); }
	};

	// What the machine memory needs from the machine. Any thread but the audio thread, unless said otherwise.
	class MachineMemoryPort
	{
	public:
		virtual ~MachineMemoryPort() = default;

		// A machine whose memory can be read and restored: valid, booted, no restore under way, and (sample flash) its
		// factory flash known, so its flash is the user's samples over the factory's
		virtual bool ready() = 0;

		// One piece of a look, in one hold of the plug-in's lock, of a booted machine with no restore under way that is
		// the machine _machine names (the first piece names it: a rebooted machine is another one). False: none, or another.
		struct Piece
		{
			uint8_t* patch = nullptr;		// the patch RAM's [patchAt, patchAt + patchSize) copied here
			size_t patchAt = 0;
			size_t patchSize = 0;
			uint8_t* userFlash = nullptr;	// the user flash's [userFlashAt, userFlashAt + userFlashSize) copied here
			size_t userFlashAt = 0;
			size_t userFlashSize = 0;
			// sample flash: only once the factory flash is known; the cycle of the flash's last write (0: none)
			uint64_t* flashMark = nullptr;
		};
		// A piece as of one moment, a part per hold of the plug-in's lock (md::OneMomentCopy). _heldMs: the longest hold,
		// from taking the lock to releasing it
		virtual bool look(const Piece& _piece, std::optional<MachineId>& _machine, double& _heldMs) = 0;

		// Sample flash: the flash's [_at, _at + _size), of a valid machine that is the one _machine names, as it was at
		// one moment: a part of up to 64 KiB per hold, the pieces written meanwhile copied again (md::OneMomentCopy,
		// DESIGN-audio-lock.md). _copyMs: the longest hold's copy.
		virtual bool copyFlash(uint8_t* _to, size_t _at, size_t _size, std::optional<MachineId>& _machine, double& _copyMs) = 0;

		// The memory a session starts with: the patch RAM, the sectors (the user flash, or the whole flash), and (sample
		// flash) what the flash is made of: the factory flash and the ROM's flash, shared and immutable (the machine's own;
		// the factory flash decoded outside the plug-in's lock)
		struct StartMemory
		{
			std::vector<uint8_t> patch, sectors;
			std::shared_ptr<const std::vector<uint8_t>> factory, rom;
		};
		virtual bool startMemory(StartMemory& _memory) = 0;

		// The machine's restore generation (0: no machine)
		virtual uint64_t restoreGeneration() = 0;
		// A state restored the way a project is
		virtual bool restore(const std::vector<uint8_t>& _state) = 0;
		// After a restore: the controller and the host hear that the state changed (message thread)
		virtual void restored() = 0;
		// A fresh machine's state (factory memory); _fresh keeps that machine until the restore is done. False: _note says why.
		virtual bool factoryState(std::vector<uint8_t>& _state, std::shared_ptr<void>& _fresh, std::string& _note) = 0;
		// A warning in this instance's window (message thread)
		virtual void notice(const std::string& _text) = 0;
	};

	class MachineMemoryService
	{
	public:
		struct Status
		{
			bool keep = false;			// the setting (KEEP MEMORY), default on
			bool available = false;		// a folder for the file (none in an isolated test)
			bool saved = false;			// the file is there
			std::string note;			// the last thing to say (a write that failed, a file that could not be used)
		};

		// What the watch measured (tests and the design note): the look's time under the plug-in's lock (the worst
		// and the last), a look's whole time with its hash, the last write's time, how many looks and writes.
		struct Cost
		{
			double lookLockMaxMs = 0, lookLockLastMs = 0, lookMs = 0, writeMs = 0;
			uint32_t looks = 0, writes = 0, failedWrites = 0;
			size_t lastSlots = 0;		// how many slots the last write merged in
			double flashHoldMaxMs = 0, flashHoldLastMs = 0;	// MD: the sample flash copy's longest hold of the plug-in's lock
			size_t fileBytes = 0;
		};

		// One last look now and a write when a save is not in the file yet (the instance going away, a state save)
		enum class FlushMode : uint8_t { Close, Replace, HostSave };

		// Where it runs, decided once by the processor when it starts the service
		struct Setup
		{
			std::string folder;				// the file's folder; empty: off (an isolated test, a processor no wrapper made)
			bool keep = true;				// the setting as the config holds it
			bool standaloneState = false;	// the state at the start is the standalone's own: the file's slots are laid over it
			bool plugIn = false;			// a plug-in wrapper made the processor (in a DAW unless standalone)
		};

		MachineMemoryService(MachineMemoryPort& _port, md::MachineModel _model);
		~MachineMemoryService();

		// The watch made and (with a folder) the thread started
		void start(Setup _setup);
		// The thread is told to stop and waited for, then one last look writes a save it has not written yet
		void stop();

		Status status() const;
		// Changes whenever the status may have changed (any thread): the session republishes it to the page.
		uint32_t version() const { return m_version.load(std::memory_order_acquire); }
		bool keep() const;
		void setKeep(bool _keep);
		// The start's decision is made (the file's slots laid over, or not needed): tests wait for it
		bool started() const;
		bool projectStateSeen() const;
		juce::File file() const;
		Cost cost() const;
		// The saves this memory holds that the file lacks (the "MMEM" chunk of the standalone's state)
		machineMemory::Mark mark() const;

		// The host's events. A state comes (setStateInformation with a state): a DAW project's or the standalone's own;
		// then the memory is about to be replaced.
		void stateComes();
		// The memory is about to be replaced by another (a project's, the file's slots, factory memory)
		void willBeReplaced();
		// The last state's "MMEM" chunk (version 2), or none (a state from before I-024 knows nothing of the file)
		void setLoadedMark(std::optional<machineMemory::Mark> _mark);
		// Review 1 (I-026): in a DAW the machine follows the host's clock (the global's host bytes are never saved) or not
		void setHostClock(bool _on);
		// A restore of generation _generation failed (_error). True: it was this memory's own (the file's slots: the
		// notice said why); false: the processor reports it as a project's.
		bool restoreFailed(uint64_t _generation, const std::string& _error);
		void flush(FlushMode _mode);
		// MD: the page's sample transfer ended; the machine stores it into a ROM slot (a save, written once stored)
		void sampleStored();
		// RESET MACHINE… > Start from factory memory. False with the reason in _note.
		bool startFromFactoryMemory(std::string& _note);

		// The timer (message thread): the start once the machine runs, and the notices the thread left
		void serviceTimer();

		// The thread's one look and maybe a write (the thread calls it)
		void lookOnce();
		// The thread runs once a second; a test may run it faster (milliseconds between looks).
		void setLookMs(int _ms);

		// Tests: the next restore it asks for (the start's overlay, factory memory) is refused at once
		void refuseNextRestoreForTest() { m_refuseNextRestoreForTest = true; }
		// Tests: the machine follows the host (a plug-in in a DAW: tempo and sync are the host's, never saved)
		void setFollowsHostForTest(bool _follows);
		// Tests: called by the thread after each piece of a look (the offset of the piece it copied)
		void setLookHookForTest(std::function<void(size_t)> _hook);

	private:
		// The session's facts: where its memory came from and what the start decided. One value (m_sessionMutex).
		struct Session
		{
			bool standaloneState = false;
			bool plugIn = false;
			bool projectState = false;	// a DAW project's state came this session (any thread)
			bool ownState = false;		// the standalone's own state came
			std::optional<machineMemory::Mark> loadedMark;	// the last state's "MMEM" chunk, version 2
			bool keep = true;			// the setting, cached for the thread (the config is the message thread's)
			bool followsHost = false;	// a plug-in in a DAW: the global's host bytes are never saved
			bool startDone = false;
			uint64_t romFingerprint = 0;		// MD: the ROM's (the file's flash sectors belong to it)
			uint64_t restoreGeneration = 0;		// the device's restore generation of the file's payload, 0: none
			uint64_t factoryGeneration = 0;		// Start from factory memory's restore, 0: none
		};
		Session session() const;
		template<typename F> void changeSession(F&& _change)
		{
			const std::lock_guard lock(m_sessionMutex);
			_change(m_session);
		}

		struct WatchState;
		class Thread;
		enum class WriteResult : uint8_t { Done, HeldBack, Failed };

		void serviceStart();
		void serviceNotices();
		bool write(const std::vector<machineMemory::Key>& _keys, const std::vector<uint8_t>& _base, const std::vector<uint8_t>& _patch,
			const std::vector<uint8_t>& _sectors);
		WriteResult writeChanges(bool _withForced, bool _consistent);
		bool look(uint64_t& _signature, MachineId& _epoch, bool _atomic);
		bool rebase(uint64_t _signature, const MachineId& _epoch);
		void clearFile();
		void serviceSampleStore();
		void takeSampleSectors(bool _atomic);
		bool copyFlash(std::vector<uint8_t>& _flash, bool _atomic = false);
		machineMemory::StoreFile readStore(bool& _ok, std::string& _note);
		static bool writeFile(const juce::File& _file, const std::vector<uint8_t>& _bytes, std::string& _error);
		std::string moveFileAside(std::string _text);
		void factoryRefused();
		void unusable(const std::string& _why);
		void setNote(std::string _note);
		void wake();

		MachineMemoryPort& m_port;
		const machineMemory::Shape m_shape;
		std::string m_folder;		// set once by start; empty: off

		mutable std::mutex m_sessionMutex;
		Session m_session;

		mutable std::mutex m_memoryMutex;	// the file, the note, the watch, the cost
		std::string m_note;
		std::unique_ptr<WatchState> m_watch;
		std::unique_ptr<Thread> m_thread;

		std::atomic<uint32_t> m_version{1};
		std::atomic<int> m_lookMs{1000};
		std::atomic<bool> m_sampleStored{false};	// sampleStored, for the thread's next look
		std::atomic<bool> m_noticePending{false};	// a note for the timer to show (written on the thread)
		std::atomic<bool> m_writeFailed{false};		// a failed write for the timer to say (once a session)
		std::atomic<bool> m_refuseNextRestoreForTest{false};
		std::function<void(size_t)> m_lookHookForTest;	// (m_lookHookMutex)
		std::mutex m_lookHookMutex;
		std::atomic<bool> m_hasLookHookForTest{false};
	};
}
