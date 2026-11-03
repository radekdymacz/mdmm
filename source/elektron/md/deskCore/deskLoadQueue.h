#pragma once

#include <algorithm>
#include <cstddef>
#include <deque>
#include <map>
#include <optional>
#include <set>

namespace deskCore
{
	// Reading documents from a machine, one request in flight (P1: a burst of requests
	// costs step jitter, and a dump answer is large). Urgent reads go to the front; a
	// request without an answer is sent again (Policy::retries); after that it goes back to
	// the front of the queue but waits Policy::backoffMs (a slow wire, a cable pulled for a
	// while) while the others go, Policy::rounds times, and then it is given up: next() says
	// so (Step::gaveUp), so the adapter can report it. Pure: the caller gives the time and sends what next()
	// returns.
	template<typename Ref>
	class LoadQueue
	{
	public:
		struct Policy
		{
			double gapMs = 30;			// between two requests
			int retries = 1;			// resends of one request in a row
			int rounds = 2;				// times a request goes back into the queue once its resends ran out
			double backoffMs = 2000;	// a request back in the queue waits this long before it goes again
		};

		// What next() asks of the caller: a request to send, and a request given up (no reply
		// after every resend and every round). Both can be set.
		struct Step
		{
			std::optional<Ref> send;
			std::optional<Ref> gaveUp;
		};

		// Read _ref. Already queued or in flight: urgent moves it to the front (a request
		// waiting out its backoff keeps waiting).
		void want(const Ref& _ref, const bool _urgent)
		{
			if(m_loading == _ref)
				return;
			const auto it = std::find_if(m_queue.begin(), m_queue.end(), [&](const Entry& _e) { return _e.ref == _ref; });
			Entry e{_ref, 0};
			if(it != m_queue.end())
			{
				if(!_urgent)
					return;
				e = *it;
				m_queue.erase(it);
			}
			if(_urgent)
				m_queue.push_front(e);
			else
				m_queue.push_back(e);
		}

		// Read _ref with a request sent from now on (a push's read-back, B-202): one already in flight was asked
		// before, so its reply may hold the document as it was before the dump that is to be confirmed. That
		// request is not sent twice at once (one in flight): _ref is asked again, first, once it is answered.
		// A request of _ref waiting out its backoff is a new request from now on (B-202, full CI run 41572548038): a late
		// reply to the older one does not end it (arrived), and it has rounds of its own.
		void wantFresh(const Ref& _ref)
		{
			if(m_loading == _ref)
			{
				m_again.insert(_ref);
				return;
			}
			m_rounds.erase(_ref);
			want(_ref, true);
		}

		bool contains(const Ref& _ref) const
		{
			return m_loading == _ref
				|| std::any_of(m_queue.begin(), m_queue.end(), [&](const Entry& _e) { return _e.ref == _ref; });
		}

		// A document arrived: the request for it is answered (a late reply to one waiting out its
		// backoff too: it is not asked for again).
		void arrived(const Ref& _ref)
		{
			const bool inFlight = m_loading == _ref;
			if(inFlight)
				m_loading.reset();
			if(m_rounds.erase(_ref))
				m_queue.erase(std::remove_if(m_queue.begin(), m_queue.end(), [&](const Entry& _e) { return _e.ref == _ref; }), m_queue.end());
			// the reply to the request asked before wantFresh: now the fresh one
			if(inFlight && m_again.erase(_ref))
				m_queue.push_front({_ref, 0});
		}

		// The request to send now, if any: the one in flight again after _timeoutMs without
		// an answer, or (when _mayStart and the gap has passed) the next queued one whose
		// backoff is over. A request out of resends goes back into the queue, or is given up.
		Step next(const double _nowMs, const double _timeoutMs, const bool _mayStart, const Policy& _policy)
		{
			Step step;
			if(m_loading)
			{
				if(_nowMs - m_sentMs < _timeoutMs)
					return step;
				if(m_retries++ < _policy.retries)
				{
					// sent again now: its reply is a fresh one, and the rounds from here are the fresh request's own
					if(m_again.erase(*m_loading))
						m_rounds.erase(*m_loading);
					m_sentMs = m_lastRequestMs = _nowMs;
					step.send = m_loading;
					return step;
				}
				const auto ref = *m_loading;
				m_loading.reset();
				// B-202 (full CI run 41572548038): wanted fresh while its older request was in flight, after that one's last
				// send (a push's read-back asked while the machine had answered nothing for seconds): asked now as a request of
				// its own, with rounds of its own, not given up with the older one (the read-back was never sent, the push
				// timed out)
				if(m_again.erase(ref))
				{
					m_rounds.erase(ref);
					m_queue.push_front({ref, 0});
				}
				else if(++m_rounds[ref] <= _policy.rounds)
					m_queue.push_front({ref, _nowMs + _policy.backoffMs});	// first once its backoff is over
				else
				{
					m_rounds.erase(ref);
					step.gaveUp = ref;
				}
			}
			if(!_mayStart || _nowMs - m_lastRequestMs < _policy.gapMs)
				return step;
			const auto it = std::find_if(m_queue.begin(), m_queue.end(), [&](const Entry& _e) { return _e.notBeforeMs <= _nowMs; });
			if(it == m_queue.end())
				return step;
			m_loading = it->ref;
			m_queue.erase(it);
			m_retries = 0;
			m_sentMs = m_lastRequestMs = _nowMs;
			step.send = m_loading;
			return step;
		}

		// Why next() sends nothing at _nowMs (a status line's evidence, B-202): what holds the queue and for how much longer
		// (ms; for one in flight: how long it has been on its way). Null when next() would send.
		struct Held
		{
			const char* why = "";
			double ms = 0;
		};
		std::optional<Held> held(const double _nowMs, const Policy& _policy) const
		{
			if(m_loading)
				return Held{"in flight", _nowMs - m_sentMs};
			if(m_queue.empty())
				return Held{"nothing queued", 0};
			if(_nowMs - m_lastRequestMs < _policy.gapMs)
				return Held{"gap", _policy.gapMs - (_nowMs - m_lastRequestMs)};
			double soonest = m_queue.front().notBeforeMs;
			for(const auto& e : m_queue)
				soonest = std::min(soonest, e.notBeforeMs);
			if(soonest > _nowMs)
				return Held{"backoff", soonest - _nowMs};
			return std::nullopt;
		}

		// A queued read goes at once, its backoff dropped (a push's read-back that has waited long enough)
		void hurry(const Ref& _ref)
		{
			for(auto& e : m_queue)
				if(e.ref == _ref)
					e.notBeforeMs = 0;
		}

		const std::optional<Ref>& loading() const { return m_loading; }
		// Queued plus in flight.
		size_t pending() const { return m_queue.size() + (m_loading ? 1 : 0); }
		bool idle() const { return !pending(); }

	private:
		struct Entry
		{
			Ref ref;
			double notBeforeMs = 0;
		};

		std::deque<Entry> m_queue;
		std::optional<Ref> m_loading;
		std::map<Ref, int> m_rounds;	// rounds a request without a reply has had so far
		std::set<Ref> m_again;			// in flight, wanted fresh: asked again once answered (wantFresh)
		double m_sentMs = 0;
		double m_lastRequestMs = -1e9;
		int m_retries = 0;
	};
}
