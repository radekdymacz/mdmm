#pragma once

// I-024: the machine memory file's lock (doc/modern-ux/DESIGN-machine-memory.md, section 3). Every read-merge-write,
// every move and the deletion of the file hold it, so two editors never lose each other's saves: a plug-in in a DAW
// and the standalone (two processes), two instances in one DAW, and the VST3 and the AU of one editor loaded in one
// host (one process, two bundles: each has its own statics, so an in-process mutex alone would not see the other).
//
// The lock is an exclusive flock (POSIX) or LockFileEx (Windows) on "machine-memory.lock" beside the file. Both belong
// to the open file, not the process, so a second open in the same process waits too. A mutex per path in this bundle
// comes first, so this bundle's own threads queue before they poll the file lock. A folder where the lock file cannot
// be made or opened (no permission) or a file system without locks gives no lock and no wait (said once): nothing can
// be written there anyway, or there is nothing to wait for. Every wait is at most the timeout (2 s by default), so the
// message thread never waits longer.

#include "juce_core/juce_core.h"

#include <atomic>
#include <cerrno>
#include <chrono>
#include <cstdio>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
#endif

namespace mdJucePlugin::machineMemory
{
	constexpr const char* g_lockName = "machine-memory.lock";

	class FileLock
	{
	public:
		// _file: the machine memory file; waits up to _timeoutMs for the lock (the bundle's mutex and the file lock
		// together). _bundleMutex false: the file lock alone, as another bundle (VST3 beside AU) takes it (tests).
		explicit FileLock(const juce::File& _file, const int _timeoutMs = 2000, const bool _bundleMutex = true)
		{
			const auto end = std::chrono::steady_clock::now() + std::chrono::milliseconds(_timeoutMs);
			if(_bundleMutex)
			{
				m_mutex = &mutexFor(_file.getFullPathName().toStdString());
				if(!m_mutex->try_lock_until(end))
				{
					m_mutex = nullptr;
					return;
				}
			}
			const auto lockFile = _file.getSiblingFile(g_lockName);
			(void)lockFile.getParentDirectory().createDirectory();
#ifdef _WIN32
			const auto path = lockFile.getFullPathName().toWideCharPointer();
			m_handle = CreateFileW(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
				nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
			if(m_handle == INVALID_HANDLE_VALUE)	// a read-only folder with the lock file in it
				m_handle = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
					nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
			if(m_handle == INVALID_HANDLE_VALUE)
			{
				noLock("the lock file cannot be opened");
				return;
			}
			for(;;)
			{
				OVERLAPPED o{};
				if(LockFileEx(m_handle, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &o))
				{
					m_held = m_locked = true;
					return;
				}
				const auto e = GetLastError();
				if(e != ERROR_LOCK_VIOLATION && e != ERROR_IO_PENDING)
				{
					noLock("the file system takes no locks");
					return;
				}
				if(std::chrono::steady_clock::now() >= end)
					return;
				std::this_thread::sleep_for(std::chrono::milliseconds(5));
			}
#else
			const auto path = lockFile.getFullPathName().toRawUTF8();
			m_fd = ::open(path, O_RDWR | O_CREAT | O_CLOEXEC, 0644);
			if(m_fd < 0)	// a read-only folder with the lock file in it: flock works on a read-only file too
				m_fd = ::open(path, O_RDONLY | O_CLOEXEC);
			if(m_fd < 0)
			{
				noLock("the lock file cannot be opened");
				return;
			}
			for(;;)
			{
				if(::flock(m_fd, LOCK_EX | LOCK_NB) == 0)
				{
					m_held = m_locked = true;
					return;
				}
				if(errno != EWOULDBLOCK && errno != EINTR)
				{
					noLock("the file system takes no locks");	// ENOTSUP, ENOLCK, EOPNOTSUPP: no lock, at once
					return;
				}
				if(std::chrono::steady_clock::now() >= end)
					return;
				std::this_thread::sleep_for(std::chrono::milliseconds(5));
			}
#endif
		}

		~FileLock()
		{
#ifdef _WIN32
			if(m_handle != INVALID_HANDLE_VALUE)
			{
				if(m_locked)
				{
					OVERLAPPED o{};
					UnlockFileEx(m_handle, 0, 1, 0, &o);
				}
				CloseHandle(m_handle);
			}
#else
			if(m_fd >= 0)
			{
				if(m_locked)
					::flock(m_fd, LOCK_UN);
				::close(m_fd);
			}
#endif
			if(m_mutex)
				m_mutex->unlock();
		}

		FileLock(const FileLock&) = delete;
		FileLock& operator=(const FileLock&) = delete;

		// false: another editor held the file for the whole timeout (the caller refuses and tries again)
		bool held() const { return m_held; }
		// held, but without a file lock (none can be had here): said once a process on stderr
		bool unlocked() const { return m_held && !m_locked; }

	private:
		void noLock(const char* _why)
		{
			m_held = true;	// nothing to wait for: a write there fails by itself, or the file system has no locks
			static std::atomic<bool> said{false};
			if(!said.exchange(true))
				std::fprintf(stderr, "[MD] machine memory: no file lock (%s); two editors saving at once may lose a save\n", _why);
		}

		static std::timed_mutex& mutexFor(const std::string& _path)
		{
			static std::mutex mapMutex;
			static std::map<std::string, std::unique_ptr<std::timed_mutex>> mutexes;
			const std::lock_guard lock(mapMutex);
			auto& m = mutexes[_path];
			if(!m)
				m = std::make_unique<std::timed_mutex>();
			return *m;
		}

		std::timed_mutex* m_mutex = nullptr;
		bool m_held = false;
		bool m_locked = false;
#ifdef _WIN32
		HANDLE m_handle = INVALID_HANDLE_VALUE;
#else
		int m_fd = -1;
#endif
	};
}
