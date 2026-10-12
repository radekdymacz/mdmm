#pragma once

#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

namespace mdJucePlugin
{
	// The Machinedrum's factory data from the user's own ROM (PROBES-manual-gaps.md P6): a machine started with no
	// patch RAM holds the factory kits, patterns and songs, the same at every start. A second machine is started here
	// on a thread of its own, headless (no audio device, nothing heard), and its 64 kits, 128 patterns and 32 songs are
	// read as dumps, which Reset machine… > Factory reset sends to the machine the editor plays as an import. The
	// machine that plays is not touched while this runs; the second one is gone when it ends.
	class MdFactorySource
	{
	public:
		using Bytes = std::vector<uint8_t>;

		struct Result
		{
			std::vector<Bytes> dumps;	// kits 0-63, patterns 0-127, songs 0-31, in that order
			std::string error;			// why not, or ""
		};

		MdFactorySource() = default;
		~MdFactorySource();
		MdFactorySource(const MdFactorySource&) = delete;
		MdFactorySource& operator=(const MdFactorySource&) = delete;

		// Start reading (false: one runs already). _rom: the firmware image, as the editor's machine runs it.
		bool start(Bytes _rom, std::string _romName);
		bool running() const { return m_running.load(); }
		// The dumps read so far, of all (for the progress); 0 while the second machine starts.
		int progress() const { return m_progress.load(); }
		static constexpr int g_total = 64 + 128 + 32;
		// The result once the thread ended (then it is taken: nullopt next time).
		std::optional<Result> take();

		// The work itself, on the calling thread (the firmware test runs it so): start the machine, read the dumps.
		static Result read(const Bytes& _rom, const std::string& _romName, std::atomic<int>* _progress = nullptr,
			const std::atomic<bool>* _stop = nullptr);

	private:
		std::thread m_thread;
		std::atomic<bool> m_running{false};
		std::atomic<bool> m_stop{false};
		std::atomic<int> m_progress{0};
		std::mutex m_mutex;
		std::optional<Result> m_result;
	};
}
