#pragma once

// I-018: the CPU meter in the top bar (both editors, plug-in and standalone). What it measures: the share of each
// audio block's real-time budget (frames / sample rate) the host's processBlock call spends, the whole call: the
// emulation, the resampler, MIDI in and out. Two halves, both pure (no JUCE, no lock):
//   - Meter, the audio thread's: one call a block (two clock reads around processBlock are the processor's), a few
//     relaxed atomic adds and a compare-exchange for the worst block. No allocation, no lock, never waits.
//   - Smoother, the message thread's: a few times a second it takes the totals, and makes them a Reading: the load
//     smoothed over about half a second, the worst single block in the last three seconds (what clicks), and whether
//     the host runs the audio at all (stopped, bypassed, offline: the meter says so instead of 0 %).
// The page gets a Reading as the "cpuLoad" message (mdDeskSession.cpp cpuLoadOf, skins/shared/deskCpu.js).

#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>

namespace mdJucePlugin::cpuLoad
{
	// A share of the budget as an integer, for the worst block's atomic maximum: 10000 = the whole budget.
	constexpr double g_shareScale = 10000.0;

	// What the audio thread counted since the meter was made (busy and budget: realtime blocks only), and the
	// largest single block's share since the previous take().
	struct Totals
	{
		uint64_t busyNs = 0;		// processBlock's time, summed
		uint64_t budgetNs = 0;		// the blocks' real-time budgets, summed
		uint64_t blocks = 0;		// realtime blocks
		uint64_t offline = 0;		// blocks while the host renders offline (not in busy or budget)
		uint64_t bypassed = 0;		// processBlockBypassed calls
		double worst = 0;			// the largest single realtime block's share since the previous take()
	};

	// The audio thread's half. Single writer (the audio thread), any number of readers; take() is the smoother's.
	class Meter
	{
	public:
		// One processBlock: its time and its budget. Offline blocks are counted, never measured against a budget
		// (an offline render may run faster or slower than real time).
		void onBlock(const uint64_t _busyNs, const int _frames, const double _sampleRate, const bool _offline) noexcept
		{
			if(_offline)
			{
				m_offline.fetch_add(1, std::memory_order_relaxed);
				return;
			}
			if(_frames <= 0 || !(_sampleRate > 0))
				return;
			const auto budget = static_cast<uint64_t>(static_cast<double>(_frames) * 1e9 / _sampleRate);
			if(budget == 0)
				return;
			m_busyNs.fetch_add(_busyNs, std::memory_order_relaxed);
			m_budgetNs.fetch_add(budget, std::memory_order_relaxed);
			m_blocks.fetch_add(1, std::memory_order_relaxed);
			const double share = static_cast<double>(_busyNs) / static_cast<double>(budget) * g_shareScale;
			const auto scaled = share >= 4e9 ? 4000000000u : static_cast<uint32_t>(share);
			// the worst since the last take(): a lock-free maximum (the reader swaps in 0)
			auto cur = m_worst.load(std::memory_order_relaxed);
			while(cur < scaled && !m_worst.compare_exchange_weak(cur, scaled, std::memory_order_relaxed))
			{
			}
		}
		void onBypassed() noexcept { m_bypassed.fetch_add(1, std::memory_order_relaxed); }

		// The totals so far, and the worst block since the previous take() (which this call starts again). The
		// counters are read one by one: a block that lands between two reads shows up in the next take().
		Totals take() noexcept
		{
			Totals t;
			t.blocks = m_blocks.load(std::memory_order_relaxed);
			t.busyNs = m_busyNs.load(std::memory_order_relaxed);
			t.budgetNs = m_budgetNs.load(std::memory_order_relaxed);
			t.offline = m_offline.load(std::memory_order_relaxed);
			t.bypassed = m_bypassed.load(std::memory_order_relaxed);
			t.worst = static_cast<double>(m_worst.exchange(0, std::memory_order_relaxed)) / g_shareScale;
			return t;
		}

	private:
		std::atomic<uint64_t> m_busyNs{0};
		std::atomic<uint64_t> m_budgetNs{0};
		std::atomic<uint64_t> m_blocks{0};
		std::atomic<uint64_t> m_offline{0};
		std::atomic<uint64_t> m_bypassed{0};
		std::atomic<uint32_t> m_worst{0};
	};

	enum class State
	{
		None,		// no block yet (the host has not started the audio)
		Running,	// realtime blocks arrive
		Stopped,	// they did, and none came for g_stoppedMs (the host stopped the engine)
		Bypassed,	// only processBlockBypassed calls
		Offline		// only offline (rendering) blocks
	};

	inline const char* stateName(const State _s)
	{
		switch(_s)
		{
		case State::Running:	return "running";
		case State::Stopped:	return "stopped";
		case State::Bypassed:	return "bypassed";
		case State::Offline:	return "offline";
		case State::None:		break;
		}
		return "none";
	}

	// What the page shows (a value).
	struct Reading
	{
		State state = State::None;
		double load = 0;		// the smoothed share of the budget (1 = all of it)
		double worst = 0;		// the largest single block's share in the last g_worstMs
		double window = 0;		// the share over the blocks since the previous reading, unsmoothed
	};

	// The message thread's half: totals in, a Reading out. Pure (the time is the caller's).
	class Smoother
	{
	public:
		static constexpr double g_tauMs = 500;		// the smoothing's time constant
		static constexpr double g_worstMs = 3000;	// how long the worst block stays marked
		static constexpr double g_stoppedMs = 500;	// no block for this long: stopped

		Reading add(const Totals& _t, const double _nowMs)
		{
			Reading r;
			if(!m_have)
			{
				// the first totals: nothing to compare yet, only whether the audio ran before
				m_have = true;
				m_prev = _t;
				m_prevMs = _nowMs;
				m_ranMs = _t.blocks > 0 ? _nowMs : -1e300;
				m_ever = _t.blocks > 0;
				r.state = m_ever ? State::Running : State::None;
				if(_t.blocks > 0)
					remember(_nowMs, _t.worst);
				r.worst = worstSince(_nowMs);
				return r;
			}
			const uint64_t blocks = _t.blocks - m_prev.blocks;
			const uint64_t busy = _t.busyNs - m_prev.busyNs;
			const uint64_t budget = _t.budgetNs - m_prev.budgetNs;
			const bool offline = _t.offline != m_prev.offline;
			const bool bypassed = _t.bypassed != m_prev.bypassed;
			const double dt = _nowMs - m_prevMs;
			m_prev = _t;
			m_prevMs = _nowMs;

			if(blocks > 0 && budget > 0)
			{
				const double window = static_cast<double>(busy) / static_cast<double>(budget);
				const double k = m_fresh || dt <= 0 ? 1.0 : 1.0 - std::exp(-dt / g_tauMs);
				m_load += (window - m_load) * k;
				m_window = window;
				m_fresh = false;
				m_ranMs = _nowMs;
				m_ever = true;
				remember(_nowMs, _t.worst);
			}

			if(_nowMs - m_ranMs < g_stoppedMs)
				r.state = State::Running;
			else
			{
				// the next run starts its average again, and the old worst blocks are forgotten
				m_fresh = true;
				m_worst = {};
				r.state = offline ? State::Offline : bypassed ? State::Bypassed : m_ever ? State::Stopped : State::None;
			}
			if(r.state == State::Running)
			{
				r.load = m_load;
				r.window = m_window;
				r.worst = worstSince(_nowMs);
				if(r.worst < r.load)
					r.worst = r.load;
			}
			return r;
		}

	private:
		struct Mark
		{
			double ms = -1e300;
			double worst = 0;
		};

		void remember(const double _ms, const double _worst)
		{
			m_worst[m_next] = {_ms, _worst};
			m_next = (m_next + 1) % m_worst.size();
		}
		double worstSince(const double _nowMs) const
		{
			double w = 0;
			for(const auto& m : m_worst)
				if(_nowMs - m.ms <= g_worstMs && m.worst > w)
					w = m.worst;
			return w;
		}

		Totals m_prev;
		bool m_have = false;
		bool m_ever = false;
		bool m_fresh = true;
		double m_prevMs = 0;
		double m_ranMs = -1e300;
		double m_load = 0;
		double m_window = 0;
		// one mark a reading: at 4 readings a second, 3 s is 12; room for a faster caller
		std::array<Mark, 64> m_worst{};
		size_t m_next = 0;
	};
}
