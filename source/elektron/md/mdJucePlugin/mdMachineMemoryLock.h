#pragma once

// I-024: the machine memory file's lock (doc/modern-ux/DESIGN-machine-memory.md, section 3). Every read-merge-write,
// every move and the deletion of the file hold it, so two editors never lose each other's saves: a plug-in in a DAW
// and the standalone (two processes), two instances in one DAW, and the VST3 and the AU of one editor loaded in one
// host (one process, two bundles: each has its own statics, so an in-process mutex alone would not see the other).
//
// The lock is an exclusive flock (POSIX) or LockFileEx (Windows) on "machine-memory.lock" beside the file. Both belong
// to the open file, not the process, so a second open in the same process waits too. A mutex per path in this bundle
// comes first, so this bundle's own threads queue before they poll the file lock. A folder where the lock file cannot
// be made (read-only, no permission) gives no lock and no error: nothing can be written there anyway, and reading
// needs no lock (the file is replaced by a rename, whole).

#include "juce_core/juce_core.h"

#include <chrono>
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
		// _file: the machine memory file; waits up to _timeoutMs for the lock
		explicit FileLock(const juce::File& _file, const int _timeoutMs = 10000)
			: m_lock(mutexFor(_file.getFullPathName().toStdString()))
		{
			const auto lockFile = _file.getSiblingFile(g_lockName);
			(void)lockFile.getParentDirectory().createDirectory();
			const auto end = std::chrono::steady_clock::now() + std::chrono::milliseconds(_timeoutMs);
#ifdef _WIN32
			m_handle = CreateFileW(lockFile.getFullPathName().toWideCharPointer(), GENERIC_READ | GENERIC_WRITE,
				FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
			if(m_handle == INVALID_HANDLE_VALUE)
			{
				m_held = true;	// no lock file can be made here: nothing can be written either
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
				if(std::chrono::steady_clock::now() >= end)
					return;
				std::this_thread::sleep_for(std::chrono::milliseconds(5));
			}
#else
			m_fd = ::open(lockFile.getFullPathName().toRawUTF8(), O_RDWR | O_CREAT | O_CLOEXEC, 0644);
			if(m_fd < 0)
			{
				m_held = true;	// no lock file can be made here: nothing can be written either
				return;
			}
			for(;;)
			{
				if(::flock(m_fd, LOCK_EX | LOCK_NB) == 0)
				{
					m_held = m_locked = true;
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
		}

		FileLock(const FileLock&) = delete;
		FileLock& operator=(const FileLock&) = delete;

		// false: another editor held the file for the whole timeout (the caller refuses and tries again)
		bool held() const { return m_held; }

	private:
		static std::mutex& mutexFor(const std::string& _path)
		{
			static std::mutex mapMutex;
			static std::map<std::string, std::unique_ptr<std::mutex>> mutexes;
			const std::lock_guard lock(mapMutex);
			auto& m = mutexes[_path];
			if(!m)
				m = std::make_unique<std::mutex>();
			return *m;
		}

		std::unique_lock<std::mutex> m_lock;
		bool m_held = false;
		bool m_locked = false;
#ifdef _WIN32
		HANDLE m_handle = INVALID_HANDLE_VALUE;
#else
		int m_fd = -1;
#endif
	};
}
