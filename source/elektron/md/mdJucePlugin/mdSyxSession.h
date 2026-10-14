#pragma once

#include "elektronData/json.h"
#include "elektronData/syxImport.h"

#include "deskCore/deskPacer.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace mdJucePlugin
{
	// The slots the machine is on now (-1: not known); its imported dumps land in what plays.
	struct SyxPlaying
	{
		int pattern = -1, kit = -1, song = -1, global = -1;
	};

	// P7, B-019: a .syx import as a MIDI cable into the machine. The file is parsed (elektronData::parseSyx) and
	// shown as a preview that informs (what is in it, which slots it writes, what plays now) and lets the person
	// leave out kinds and items; it is no gate. Import sends the chosen messages to the machine unchanged, in file
	// order, through the adapter (sendAsIs: the stream, the Monomachine's SYSEX RECV), and the firmware decides what
	// it takes. Then each document is read back from the machine and compared with the file and with what the
	// editor knew of the slot before: the report says per item what the machine did. Only what cannot be sent at
	// all (not this machine's SysEx, broken framing) is left out up front, with the reason. No undo step: a dump
	// to a machine is not an edit (the preview says so; Export SysEx first keeps a way back).
	// 0.6 (wave 6): SPECIFIC place (place: each kind's items, in slot order, from a first slot of the person's; the dumps
	// go with their position byte and checksum made for the slot they land on, elektronData::syxPlaced, and the preview
	// shows where each lands and whether it overwrites data there), and VERIFY ONLY (start with _checkOnly: nothing is
	// sent; each item's landing slot is read back and compared with the file).
	// Traits (one per model, mdSyxTraits.h): using Docs; model; name; docs(file).
	template<typename Traits>
	class SyxJob
	{
	public:
		using Value = elektronData::json::Value;
		using Bytes = std::vector<uint8_t>;
		using Docs = typename Traits::Docs;

		// Before: the slots the editor does not know yet are read first (the report's before); Sending; Reading: every
		// document read back; Done: the report.
		enum class Phase { Idle, Before, Sending, Reading, Done };

		// The file's preview for the page ({"type":"syxPreview", ...}); remembers the file for an import. Each item lands
		// in its own slot until place() says otherwise.
		Value open(const Bytes& _bytes, const std::string& _fileName, const Docs& _machine, const SyxPlaying& _playing)
		{
			namespace ed = elektronData;
			m_queue.clear();
			m_phase = Phase::Idle;
			m_text.clear();
			m_bytes = _bytes;
			m_fileName = _fileName;
			m_file = ed::parseSyx(m_bytes);
			m_items.clear();
			m_skipped.clear();
			m_place.clear();
			Value m = Value::object();
			m.set("type", "syxPreview");
			m.set("file", _fileName);

			std::map<ed::SyxModel, size_t> models;
			for(const auto& r : m_file.messages)
				++models[r.model];
			if(!models[Traits::model])
			{
				const auto count = m_file.messages.size();
				m_bytes.clear();
				m_file = {};
				const auto other = models[ed::SyxModel::Md] ? ed::SyxModel::Md : models[ed::SyxModel::Mm] ? ed::SyxModel::Mm : ed::SyxModel::Unknown;
				m.set("ok", false);
				m.set("text", other == ed::SyxModel::Unknown
					? std::string("No ") + Traits::name + " SysEx in this file (" + std::to_string(count) + " messages of other devices)."
					: std::string("This is a ") + ed::syxModelName(other) + " file; this is the " + Traits::name + " Editor.");
				if(!count)
					m.set("text", std::string("No SysEx in this file."));
				return m;
			}

			const auto summary = ed::summarizeSyx(m_file);
			const auto& docs = Traits::docs(m_file);
			size_t others = 0;
			for(const auto& r : m_file.messages)
			{
				const auto why = ed::syxUnsendable(r, m_bytes, Traits::model);
				if(!why.empty())
				{
					m_skipped.push_back("message " + std::to_string(r.index + 1) + ": " + why);
					continue;
				}
				const bool dump = r.kind != ed::SyxKind::Other && r.slot >= 0;
				const auto kind = dump ? r.kind : ed::SyxKind::Other;
				const auto slot = static_cast<uint8_t>(dump ? r.slot : static_cast<int>(others++ & 0xff));
				auto& item = itemOf(kind, slot, dump ? -1 : static_cast<int>(r.index));
				item.messages.push_back(r.index);
				item.version = r.version;
				item.revision = r.revision;
				item.size = r.size;
				item.command = r.command;
				item.readable = r.status == ed::SyxStatus::Ok || r.status == ed::SyxStatus::DuplicateSlot;
			}
			if(m_items.empty())
			{
				// nothing can go: say why once (an OS update file, a damaged file)
				std::map<std::string, size_t> why;
				for(const auto& r : m_file.messages)
					++why[ed::syxUnsendable(r, m_bytes, Traits::model)];
				const auto top = std::max_element(why.begin(), why.end(), [](const auto& _a, const auto& _b) { return _a.second < _b.second; });
				const bool os = top != why.end() && top->first.find("OS update") != std::string::npos;
				m_bytes.clear();
				m_file = {};
				m.set("ok", false);
				m.set("text", os ? std::string("This file is a ") + Traits::name + " OS update (firmware), not patterns, kits or songs: there is "
					"nothing in it to import. The editor's machine runs the ROM it was given; update a real machine as Elektron describes."
					: "Nothing in this file can be sent to the " + std::string(Traits::name) + ": " + (top != why.end() ? top->first : std::string("no messages")) + ".");
				return m;
			}
			for(auto& i : m_items)
			{
				i.name = nameOf(summary, i);
				i.target = i.slot;
				if(i.kind == ed::SyxKind::Pattern)
					if(const auto it = docs.patterns.find(i.slot); it != docs.patterns.end())
						i.kit = it->second.kit;
			}
			m_fullBackup = summary.fullBackup;
			return preview(_machine, _playing);
		}

		// SPECIFIC place (0.6): per kind ("kit", "pattern", "song", "global") the first slot its items land in, in the
		// file's slot order; a kind not named keeps its own slots (ORIGINAL); empty: every item back to its own slot. The
		// new preview: each item at the slot it lands in (its "from": the file's slot), whether it overwrites data there
		// and plays there; an item past the last slot does not land (left out, said).
		Value place(const std::map<std::string, int>& _firstSlots, const Docs& _machine, const SyxPlaying& _playing)
		{
			if(m_bytes.empty() || running())
			{
				Value m = Value::object();
				m.set("type", "syxPreview");
				m.set("ok", false);
				m.set("file", m_fileName);
				m.set("text", running() ? "An import is running." : "Open a .syx file first.");
				return m;
			}
			m_place.clear();
			for(const auto& [k, first] : _firstSlots)
				for(const auto kind : {elektronData::SyxKind::Kit, elektronData::SyxKind::Pattern, elektronData::SyxKind::Song, elektronData::SyxKind::Global})
					if(k == kindKey(kind) && first >= 0)
						m_place[kind] = first;
			for(const auto kind : {elektronData::SyxKind::Kit, elektronData::SyxKind::Pattern, elektronData::SyxKind::Song, elektronData::SyxKind::Global})
			{
				std::vector<Item*> list;
				for(auto& i : m_items)
					if(i.kind == kind)
						list.push_back(&i);
				std::sort(list.begin(), list.end(), [](const Item* _a, const Item* _b) { return _a->slot < _b->slot; });
				const auto p = m_place.find(kind);
				int next = p == m_place.end() ? -1 : p->second;
				for(auto* i : list)
					i->target = next < 0 ? i->slot : static_cast<uint8_t>(std::min(next++, 255));
			}
			return preview(_machine, _playing);
		}
		bool placed() const { return !m_place.empty(); }

		// The preview of the open file as it would land now: per kind its items at their landing slot (with "from" when
		// placed elsewhere), what they overwrite and what plays there; "place": the first slots of a SPECIFIC place.
		Value preview(const Docs& _machine, const SyxPlaying& _playing)
		{
			namespace ed = elektronData;
			Value m = Value::object();
			m.set("type", "syxPreview");
			m.set("file", m_fileName);
			if(m_bytes.empty())
			{
				m.set("ok", false);
				m.set("text", "Open a .syx file first.");
				return m;
			}
			std::vector<std::string> outside;
			for(auto& i : m_items)
			{
				i.overwrites = i.kind != ed::SyxKind::Other && fits(i) && ed::syxHoldsData(_machine, i.kind, i.target);
				i.plays = fits(i) && plays(i, _playing);
				if(!fits(i))
					outside.push_back(label(i) + ": it would land past the last slot (" + std::to_string(i.target + 1) + " of "
						+ std::to_string(ed::syxSlotCount(Traits::model, i.kind)) + "), so it is not sent");
			}
			m.set("ok", true);
			m.set("model", Traits::name);
			m.set("fullBackup", m_fullBackup);
			Value items = Value::object();
			for(const auto kind : {ed::SyxKind::Kit, ed::SyxKind::Pattern, ed::SyxKind::Song, ed::SyxKind::Global, ed::SyxKind::Other})
			{
				Value list = Value::array();
				for(const auto& i : m_items)
				{
					if(i.kind != kind || !fits(i))
						continue;
					Value v = Value::object();
					v.set("slot", i.target);
					if(i.target != i.slot)
						v.set("from", i.slot);
					v.set("name", i.name);
					if(i.kind == ed::SyxKind::Pattern && i.kit >= 0)
						v.set("kit", i.kit);
					v.set("overwrites", i.overwrites);
					v.set("plays", i.plays);
					v.set("format", formatOf(i));
					v.set("readable", i.readable);
					list.push(v);
				}
				items.set(kindKey(kind), list);
			}
			m.set("items", items);
			Value place = Value::object();
			for(const auto& [kind, first] : m_place)
				place.set(kindKey(kind), first);
			m.set("place", place);
			Value skipped = Value::array();
			for(size_t i = 0; i < outside.size() && skipped.asArray().size() < 40; ++i)
				skipped.push(outside[i]);
			for(size_t i = 0; i < m_skipped.size() && skipped.asArray().size() < 40; ++i)
				skipped.push(m_skipped[i]);
			m.set("skipped", skipped);
			m.set("skippedCount", static_cast<int>(m_skipped.size() + outside.size()));
			m.set("messages", static_cast<int>(m_file.messages.size()));
			m.set("text", "");
			return m;
		}
		const std::string& fileName() const { return m_fileName; }

		// Queue the chosen kinds (all when empty) but the items in _skip ("kit:3", "pattern:0", "other:1": kind and the
		// slot it lands in, as the preview shows it), in file order. _machine is what the editor knows of the slots now
		// (the before of the report). _checkOnly (VERIFY ONLY): nothing is sent; every chosen item's slot is read and
		// compared with the file.
		std::string start(const std::vector<std::string>& _kinds, const std::set<std::string>& _skip, const Docs& _machine,
			const bool _checkOnly = false)
		{
			namespace ed = elektronData;
			if(running())
				return "An import is running.";
			if(m_bytes.empty())
				return "Open a .syx file first.";
			m_check = _checkOnly;
			std::set<size_t> chosen;
			m_placedBytes.clear();
			for(auto& i : m_items)
			{
				const auto key = std::string(kindKey(i.kind));
				i.chosen = (_kinds.empty() ? i.kind != ed::SyxKind::Other : std::find(_kinds.begin(), _kinds.end(), key) != _kinds.end())
					&& !_skip.count(key + ":" + std::to_string(i.target)) && fits(i) && (!m_check || i.kind != ed::SyxKind::Other);
				i.before.reset();
				i.after.reset();
				i.sent = 0;
				i.asked = 0;
				i.gaveUp = false;
				i.readBefore = false;
				if(!i.chosen)
					continue;
				if(!m_check)
					chosen.insert(i.messages.begin(), i.messages.end());
				if(i.kind == ed::SyxKind::Other)
					continue;
				// SPECIFIC: the item's dumps go with the slot they land in
				if(i.target != i.slot)
					for(const auto index : i.messages)
						m_placedBytes[index] = ed::syxPlaced(ed::syxBytes(m_bytes, m_file.messages[index]), i.target);
				if(!m_check)
				{
					const auto before = ed::syxCanonical(_machine, i.kind, i.target);
					if(!before.empty())
						i.before = before;
					else
						i.readBefore = true;	// not known to the editor (a slot not read yet, the MD's other globals): read first
				}
				i.file = ed::syxCanonical(Traits::model, messageBytes(i.messages.back())).value_or(ed::SyxCanonical{}).bytes;
			}
			m_queue.assign(chosen.begin(), chosen.end());
			m_total = m_queue.size();
			m_done = 0;
			m_reading = 0;
			m_handedBytes = 0;
			m_quietAtMs = -1e9;
			if(m_check)
			{
				if(!readCount(Phase::Reading))
					return "Nothing to verify.";
				m_phase = Phase::Reading;
				m_text = "";
				return "";
			}
			if(m_queue.empty())
				return "Nothing to import.";
			m_phase = readCount(Phase::Before) ? Phase::Before : Phase::Sending;
			m_text = "";
			return "";
		}
		bool checkOnly() const { return m_check; }
		// The report's word for an item taken ("imported"; a reset's "cleared" or "restored").
		void setWord(std::string _word) { m_word = std::move(_word); }

		// Stop: nothing more is sent; what went is read back and reported.
		void cancel()
		{
			if(m_phase == Phase::Before)
			{
				m_queue.clear();
				m_phase = Phase::Done;
				m_text = "Stopped: nothing was sent.";
			}
			else if(m_phase == Phase::Sending)
			{
				m_queue.clear();
				m_phase = Phase::Reading;
				m_text = "Stopped: reading back what was sent.";
			}
			else if(m_phase == Phase::Reading)
			{
				for(auto& i : m_items)
					if(i.chosen && i.sent && !i.after && i.kind != elektronData::SyxKind::Other)
						i.gaveUp = true;
				m_phase = Phase::Done;
			}
		}
		bool running() const { return m_phase == Phase::Before || m_phase == Phase::Sending || m_phase == Phase::Reading; }
		Phase phase() const { return m_phase; }

		// One session step (the machine takes input): the next messages to the adapter while its queue is short
		// (the stream paces them; the editor's own edits are not stuck behind a whole file), then one read-back at
		// a time. The progress message when there is news.
		template<typename Machine>
		std::optional<Value> step(Machine& _machine, const double _nowMs, const bool _wire)
		{
			namespace ed = elektronData;
			if(m_phase == Phase::Sending)
			{
				const auto a = _machine.asIs();
				// over HW MIDI with the person's SEND to come, everything waits for it together
				size_t room = !a.waitsFor.empty() ? m_queue.size() : a.queued < 2 ? 2 - a.queued : 0;
				bool news = false;
				while(room-- && !m_queue.empty())
				{
					const auto index = m_queue.front();
					m_queue.erase(m_queue.begin());
					const auto& r = m_file.messages[index];
					m_handedBytes += r.size;
					const auto why = _machine.sendAsIs(messageBytes(index), r.kind != ed::SyxKind::Other);
					if(!why.empty())
					{
						m_queue.clear();
						m_phase = Phase::Done;
						m_text = why;
						return progress();
					}
					for(auto& i : m_items)
						if(i.chosen && std::find(i.messages.begin(), i.messages.end(), index) != i.messages.end())
							++i.sent;
					++m_done;
					news = true;
				}
				// what the import waits for (the person's SEND) reaches the page at once, as does the next phase
				bool now = false;
				const auto& after = _machine.asIs();
				if(after.waitsFor != m_text && m_queue.empty())
				{
					m_text = after.waitsFor;
					now = true;
				}
				if(m_queue.empty() && !after.busy && after.queued == 0)
				{
					m_phase = Phase::Reading;
					m_text = "";
					now = true;
					// Over HW MIDI the plug-in's wire paces at DIN speed behind the adapter: what was handed over is on
					// the cable for its time yet (a full backup about 4 minutes), and a read-back asked now would wait
					// behind it and time out. The reads start once it has passed (the cable's time from now: an upper
					// bound, the dumps went to the wire at the earliest when the first was handed over).
					if(_wire)
						m_quietAtMs = _nowMs + deskCore::DinPacer::wireMs(m_handedBytes);
				}
				if(now || (news && _nowMs - m_progressMs > 100))
				{
					m_progressMs = _nowMs;
					return progress();
				}
				return std::nullopt;
			}
			if(m_phase != Phase::Reading && m_phase != Phase::Before)
				return std::nullopt;
			if(_nowMs < m_quietAtMs)
			{
				const auto left = static_cast<int>((m_quietAtMs - _nowMs) / 1000.0 + 0.999);
				const auto text = "The dumps are on the MIDI cable: reading back in about " + std::to_string(left) + " s";
				if(text == m_text)
					return std::nullopt;
				m_text = text;
				return progress();
			}
			if(m_text.rfind("The dumps are on the MIDI cable", 0) == 0)
				m_text.clear();

			// one read at a time: the firmware answers one dump at a time (B-016)
			auto* item = reading();
			if(!item)
			{
				m_phase = m_phase == Phase::Before ? Phase::Sending : Phase::Done;
				m_reading = 0;
				for(auto& i : m_items)
					i.asked = 0;
				m_text = "";
				return progress();
			}
			if(m_phase == Phase::Before ? item->before.has_value() : item->after.has_value())
			{
				++m_reading;
				return progress();
			}
			const auto a = _machine.asIs();
			if(item->asked == 0 || (_nowMs - m_askedMs > timeoutMs(*item, _wire) * item->asked && !a.busy))
			{
				// three requests without a reply, each waited for longer (a machine still storing the dumps before them answers
				// late): given up (before: the slot stays not known)
				if(item->asked >= 3)
				{
					item->gaveUp = m_phase == Phase::Reading;
					++m_reading;
					return progress();
				}
				const auto why = _machine.sendAsIs(ed::syxRequest(Traits::model, item->kind, item->target), false);
				if(!why.empty())
				{
					item->gaveUp = m_phase == Phase::Reading;
					++m_reading;
					return progress();
				}
				++item->asked;
				m_askedMs = _nowMs;
			}
			else if(a.busy)
				m_askedMs = _nowMs;	// the request still waits in the stream: its clock starts when it goes
			return std::nullopt;
		}

		// Every SysEx the machine sends (the desk's tap): the read-back the job waits for.
		void onMachineSysex(const Bytes& _message)
		{
			namespace ed = elektronData;
			if(m_phase != Phase::Reading && m_phase != Phase::Before)
				return;
			auto* item = reading();
			if(!item || _message.size() < 15 || _message[6] != dumpCommand(item->kind) || _message[9] != item->target)
				return;
			const uint8_t product = Traits::model == ed::SyxModel::Md ? 0x02 : 0x03;
			if(_message[1] != 0x00 || _message[2] != 0x20 || _message[3] != 0x3c || _message[4] != product)
				return;
			const auto c = ed::syxCanonical(Traits::model, _message);
			(m_phase == Phase::Before ? item->before : item->after) = c ? c->bytes : _message;
		}

		Value progress() const
		{
			namespace ed = elektronData;
			Value m = Value::object();
			m.set("type", "syxProgress");
			const bool reading = m_phase == Phase::Before || m_phase == Phase::Reading || m_phase == Phase::Done;
			const auto toRead = readCount(m_phase == Phase::Before ? Phase::Before : Phase::Reading);
			m.set("phase", m_phase == Phase::Before ? "before" : m_phase == Phase::Sending ? "send" : m_phase == Phase::Reading ? "read"
				: m_phase == Phase::Done ? "done" : "idle");
			m.set("done", static_cast<int>(m_phase == Phase::Done ? toRead : reading ? std::min(m_reading, toRead) : m_done));
			m.set("total", static_cast<int>(reading ? toRead : m_total));
			m.set("running", running());
			// 0.3.5: per kind, the phase's items done of its total, and the kind of the item at work (data only)
			if(running())
			{
				Value kinds = Value::object();
				for(const auto kind : {ed::SyxKind::Kit, ed::SyxKind::Pattern, ed::SyxKind::Song, ed::SyxKind::Global, ed::SyxKind::Other})
				{
					const auto [done, total] = kindProgress(kind);
					if(!total)
						continue;
					Value k = Value::object();
					k.set("done", static_cast<int>(done));
					k.set("total", static_cast<int>(total));
					kinds.set(kindKey(kind), k);
				}
				m.set("kinds", kinds);
				if(const auto* c = atWork())
					m.set("kind", kindKey(c->kind));
			}
			std::string text = m_text;
			if(text.empty() && m_phase == Phase::Before)
				text = "Reading what the machine holds in the slots the editor has not read yet: " + std::to_string(std::min(m_reading + 1, toRead))
					+ " of " + std::to_string(toRead);
			else if(text.empty() && m_phase == Phase::Sending)
				text = m_queue.empty() ? "All " + std::to_string(m_total) + " messages are on their way; the machine reads them"
					: std::to_string(m_done) + " of " + std::to_string(m_total) + " messages sent to the machine";
			else if(text.empty() && m_phase == Phase::Reading)
				text = (m_check ? "Verify only: reading " : "Reading back ") + std::to_string(std::min(m_reading + 1, toRead)) + " of " + std::to_string(toRead);
			m.set("check", m_check);
			if(m_phase == Phase::Done && m_check)
			{
				m.set("report", checkReport());
				if(text.empty())
					text = checkText();
			}
			else if(m_phase == Phase::Done)
			{
				Value report = Value::object();
				std::map<ed::SyxOutcome, int> counts;
				Value items = Value::array();
				int sentOther = 0;
				for(const auto& i : m_items)
				{
					if(!i.chosen || !i.sent)
						continue;
					if(i.kind == ed::SyxKind::Other)
					{
						++sentOther;
						continue;
					}
					const auto o = outcomeOf(i);
					++counts[o];
					if(o == ed::SyxOutcome::Taken || items.asArray().size() >= 300)
						continue;
					Value v = Value::object();
					v.set("kind", kindKey(i.kind));
					v.set("slot", i.target);
					v.set("name", i.name);
					v.set("outcome", ed::syxOutcomeName(o));
					v.set("text", outcomeText(i, o));
					items.push(v);
				}
				for(const auto o : {ed::SyxOutcome::Taken, ed::SyxOutcome::Converted, ed::SyxOutcome::Ignored, ed::SyxOutcome::Differs,
						ed::SyxOutcome::Changed, ed::SyxOutcome::Unknown, ed::SyxOutcome::NoReply})
					report.set(ed::syxOutcomeName(o), counts[o]);
				report.set("commands", sentOther);
				report.set("unsent", static_cast<int>(unsent()));
				report.set("items", items);
				m.set("report", report);
				if(text.empty())
					text = summaryText(counts, sentOther);
				// B-026: what an imported global changed (its MIDI base channel first: where the editor sends)
				for(const auto& i : m_items)
				{
					if(!i.chosen || !i.sent || i.kind != elektronData::SyxKind::Global)
						continue;
					const auto changes = elektronData::syxGlobalChanges(Traits::model, i.before, i.after);
					if(changes.empty())
						continue;
					text += " Global " + std::to_string(i.target + 1) + " changed: ";
					for(size_t c = 0; c < changes.size(); ++c)
						text += (c ? ", " : "") + changes[c];
					text += ".";
				}
			}
			m.set("text", text);
			return m;
		}

		// For tests: the outcome per chosen item (kind, slot) once done.
		std::vector<std::pair<elektronData::SyxItem, elektronData::SyxOutcome>> outcomes() const
		{
			std::vector<std::pair<elektronData::SyxItem, elektronData::SyxOutcome>> out;
			for(const auto& i : m_items)
				if(i.chosen && (i.sent || m_check) && i.kind != elektronData::SyxKind::Other)
					out.push_back({{i.kind, i.target}, outcomeOf(i)});
			return out;
		}

	private:
		struct Item
		{
			elektronData::SyxKind kind = elektronData::SyxKind::Other;
			uint8_t slot = 0;				// the file's slot
			uint8_t target = 0;				// the slot it lands in (SPECIFIC: another than its own)
			int otherIndex = -1;			// an Other: its message's index (one item per message)
			std::vector<size_t> messages;	// its messages, file order (a later dump of a slot replaces the earlier)
			int version = -1, revision = -1, command = -1;
			size_t size = 0;
			bool readable = false;			// the editor's codec reads the (last) dump
			std::string name;
			int kit = -1;					// a pattern: the kit it plays (-1: the codec cannot read it)
			bool overwrites = false, plays = false;
			// the import
			bool chosen = false;
			bool readBefore = false;		// the editor does not know the slot: read before the import
			size_t sent = 0;				// its messages handed to the machine
			int asked = 0;					// read-back requests sent
			bool gaveUp = false;
			Bytes file;						// the last dump, canonical (empty: the codec cannot read it)
			std::optional<Bytes> before, after;
		};

		static const char* kindKey(const elektronData::SyxKind _k)
		{
			return _k == elektronData::SyxKind::Other ? "other" : elektronData::syxKindName(_k);
		}

		static uint8_t dumpCommand(const elektronData::SyxKind _k)
		{
			switch(_k)
			{
			case elektronData::SyxKind::Global: return 0x50;
			case elektronData::SyxKind::Kit: return 0x52;
			case elektronData::SyxKind::Pattern: return 0x67;
			case elektronData::SyxKind::Song: return 0x69;
			default: return 0;
			}
		}

		Item& itemOf(const elektronData::SyxKind _kind, const uint8_t _slot, const int _otherIndex)
		{
			for(auto& i : m_items)
				if(i.kind == _kind && i.slot == _slot && (_kind != elektronData::SyxKind::Other || i.otherIndex == _otherIndex))
					return i;
			Item i;
			i.kind = _kind;
			i.slot = _slot;
			i.otherIndex = _otherIndex;
			m_items.push_back(i);
			return m_items.back();
		}

		static std::string nameOf(const elektronData::SyxSummary& _s, const Item& _i)
		{
			namespace ed = elektronData;
			char hex[8];
			switch(_i.kind)
			{
			case ed::SyxKind::Kit:
				for(const auto& k : _s.kitNames)
					if(k.slot == _i.slot)
						return k.name;
				return {};
			case ed::SyxKind::Song:
				for(const auto& k : _s.songNames)
					if(k.slot == _i.slot)
						return k.name;
				return {};
			case ed::SyxKind::Pattern: return ed::syxPatternLabel(_i.slot);
			case ed::SyxKind::Global: return "Global " + std::to_string(_i.slot + 1);
			default:
				std::snprintf(hex, sizeof(hex), "%02X", _i.command & 0xff);
				return "message " + std::to_string(_i.otherIndex + 1) + " (command " + hex + ")";
			}
		}

		static bool plays(const Item& _i, const SyxPlaying& _p)
		{
			switch(_i.kind)
			{
			case elektronData::SyxKind::Pattern: return _p.pattern == _i.target;
			case elektronData::SyxKind::Kit: return _p.kit == _i.target;
			case elektronData::SyxKind::Song: return _p.song == _i.target;
			case elektronData::SyxKind::Global: return _p.global == _i.target;
			default: return false;
			}
		}

		static std::string formatOf(const Item& _i)
		{
			return _i.version < 0 ? std::string() : std::to_string(_i.version) + "." + std::to_string(_i.revision);
		}

		static std::string label(const Item& _i)
		{
			namespace ed = elektronData;
			const auto at = _i.kind == ed::SyxKind::Pattern ? ed::syxPatternLabel(_i.target)
				: std::string(ed::syxKindName(_i.kind)) + " " + std::to_string(_i.target + 1);
			const auto n = _i.kind == ed::SyxKind::Pattern ? at
				: at + (_i.name.empty() || _i.kind == ed::SyxKind::Global ? std::string() : " " + _i.name);
			return _i.target == _i.slot ? n : n + " (from " + (_i.kind == ed::SyxKind::Pattern ? _i.name : std::to_string(_i.slot + 1)) + ")";
		}

		// The items a reading phase reads: before, those the editor does not know; after, every one sent.
		bool reads(const Item& _i, const Phase _phase) const
		{
			return _i.chosen && _i.kind != elektronData::SyxKind::Other && (_phase == Phase::Before ? _i.readBefore : m_check || _i.sent > 0);
		}

		// The item lands inside the machine's slots (a SPECIFIC place can push the last ones past the end).
		static bool fits(const Item& _i)
		{
			return _i.kind == elektronData::SyxKind::Other || _i.target < elektronData::syxSlotCount(Traits::model, _i.kind);
		}

		// A message as it goes: the file's bytes, or placed in another slot (SPECIFIC).
		Bytes messageBytes(const size_t _index) const
		{
			if(const auto it = m_placedBytes.find(_index); it != m_placedBytes.end())
				return it->second;
			return elektronData::syxBytes(m_bytes, m_file.messages[_index]);
		}

		Item* reading()
		{
			size_t n = 0;
			for(auto& i : m_items)
			{
				if(!reads(i, m_phase))
					continue;
				if(n++ < m_reading)
					continue;
				return &i;
			}
			return nullptr;
		}

		// The item the job works on: sending, the one the next queued message belongs to; reading, the one read now.
		const Item* atWork() const
		{
			if(m_phase == Phase::Sending)
			{
				if(m_queue.empty())
					return nullptr;
				for(const auto& i : m_items)
					if(i.chosen && std::find(i.messages.begin(), i.messages.end(), m_queue.front()) != i.messages.end())
						return &i;
				return nullptr;
			}
			size_t n = 0;
			for(const auto& i : m_items)
				if(reads(i, m_phase) && n++ == m_reading)
					return &i;
			return nullptr;
		}

		// A kind's items done of its total in this phase: sending, the chosen items whose every message went; reading
		// (before or after), the items of the phase read so far.
		std::pair<size_t, size_t> kindProgress(const elektronData::SyxKind _kind) const
		{
			size_t done = 0, total = 0, n = 0;
			for(const auto& i : m_items)
			{
				if(m_phase == Phase::Sending)
				{
					if(!i.chosen || i.kind != _kind)
						continue;
					++total;
					done += i.sent >= i.messages.size();
					continue;
				}
				if(!reads(i, m_phase))
					continue;
				const bool read = n++ < m_reading;
				if(i.kind != _kind)
					continue;
				++total;
				done += read;
			}
			return {done, total};
		}

		size_t readCount(const Phase _phase) const
		{
			size_t n = 0;
			for(const auto& i : m_items)
				n += reads(i, _phase);
			return n;
		}

		size_t unsent() const
		{
			size_t n = 0;
			for(const auto& i : m_items)
				n += i.chosen && !i.sent;
			return n;
		}

		double timeoutMs(const Item& _i, const bool _wire) const
		{
			// the reply's time on a cable, both ways over HW MIDI, plus the firmware's time to build it
			return 2000.0 + (_wire ? 2.0 * deskCore::DinPacer::wireMs(std::max<size_t>(_i.size, 512)) : 0.0);
		}

		elektronData::SyxOutcome outcomeOf(const Item& _i) const
		{
			if(_i.gaveUp && !_i.after)
				return elektronData::SyxOutcome::NoReply;
			return elektronData::syxOutcome(_i.file, _i.before, _i.after);
		}

		// VERIFY ONLY's words for an outcome: the machine's slot is the file's item, or not.
		static const char* checkName(const elektronData::SyxOutcome _o)
		{
			switch(_o)
			{
			case elektronData::SyxOutcome::Taken: return "same";
			case elektronData::SyxOutcome::NoReply: return "no reply";
			case elektronData::SyxOutcome::Unknown:
			case elektronData::SyxOutcome::Changed: return "unknown";
			default: return "differs";
			}
		}

		// VERIFY ONLY: per name the count, and every item that is not the same, with its words.
		Value checkReport() const
		{
			namespace ed = elektronData;
			std::map<std::string, int> counts;
			Value items = Value::array();
			for(const auto& i : m_items)
			{
				if(!reads(i, Phase::Reading))
					continue;
				const auto o = outcomeOf(i);
				const std::string name = checkName(o);
				++counts[name];
				if(name == "same" || items.asArray().size() >= 300)
					continue;
				Value v = Value::object();
				v.set("kind", kindKey(i.kind));
				v.set("slot", i.target);
				v.set("name", i.name);
				v.set("outcome", name);
				v.set("text", label(i) + (name == "differs" ? ": the machine holds something else than the file"
					: name == "unknown" ? ": the editor cannot read the file's dump to compare (" + std::to_string(i.size) + " bytes)"
					: ": the machine did not answer: what it holds is not known"));
				items.push(v);
			}
			Value r = Value::object();
			for(const char* n : {"same", "differs", "unknown", "no reply"})
				r.set(n, counts[n]);
			r.set("items", items);
			r.set("check", true);
			return r;
		}

		std::string checkText() const
		{
			std::map<std::string, int> counts;
			int total = 0;
			for(const auto& i : m_items)
				if(reads(i, Phase::Reading))
				{
					++counts[checkName(outcomeOf(i))];
					++total;
				}
			std::string t = "Verify only: " + std::to_string(counts["same"]) + " of " + std::to_string(total) + " the same as the file";
			if(counts["differs"])
				t += ", " + std::to_string(counts["differs"]) + " different";
			if(counts["unknown"])
				t += ", " + std::to_string(counts["unknown"]) + " not comparable";
			if(counts["no reply"])
				t += ", " + std::to_string(counts["no reply"]) + " not read";
			return t + ". Nothing was written.";
		}

		std::string outcomeText(const Item& _i, const elektronData::SyxOutcome _o) const
		{
			namespace ed = elektronData;
			const auto format = _i.version >= 0 ? "format " + formatOf(_i) + ", " + std::to_string(_i.size) + " bytes" : std::to_string(_i.size) + " bytes";
			const auto what = label(_i) + ": ";
			switch(_o)
			{
			case ed::SyxOutcome::Taken: return what + m_word;
			case ed::SyxOutcome::Converted: return what + "the machine took it and holds it in its own form (the file's dump: " + format + ")";
			case ed::SyxOutcome::Ignored: return what + "the machine ignored this dump and kept what it held (" + format + ")";
			case ed::SyxOutcome::Differs: return what + "the machine holds something else than the file's dump: it took it in its own form or ignored it (" + format + "; the editor had not read the slot before)";
			case ed::SyxOutcome::Changed: return what + "the machine took it; the editor cannot read the file's dump to compare (" + format + ")";
			case ed::SyxOutcome::Unknown: return what + "sent; the editor can neither read the file's dump (" + format + ") nor knew the slot before";
			case ed::SyxOutcome::NoReply: return what + "sent, but the machine did not answer the read-back: what it holds is not known";
			}
			return what;
		}

		std::string summaryText(std::map<elektronData::SyxOutcome, int>& _c, const int _commands) const
		{
			namespace ed = elektronData;
			std::string t = std::to_string(_c[ed::SyxOutcome::Taken]) + " " + m_word;
			const auto add = [&](const ed::SyxOutcome _o, const char* _what)
			{
				if(_c[_o])
					t += ", " + std::to_string(_c[_o]) + " " + _what;
			};
			add(ed::SyxOutcome::Converted, "taken in the machine's own form");
			add(ed::SyxOutcome::Ignored, "ignored by the machine");
			add(ed::SyxOutcome::Differs, "different on the machine");
			add(ed::SyxOutcome::Changed, "taken (not comparable)");
			add(ed::SyxOutcome::Unknown, "sent (not comparable)");
			add(ed::SyxOutcome::NoReply, "not read back");
			if(_commands)
				t += ", " + std::to_string(_commands) + " other message" + (_commands > 1 ? "s" : "") + " sent";
			if(const auto u = unsent())
				t += "; " + std::to_string(u) + " not sent (stopped)";
			return t + ".";
		}

		Bytes m_bytes;
		std::string m_fileName;
		bool m_fullBackup = false;
		std::map<elektronData::SyxKind, int> m_place;	// SPECIFIC: each kind's first slot
		std::map<size_t, Bytes> m_placedBytes;			// the messages that go placed, by index
		bool m_check = false;							// VERIFY ONLY: nothing sent, read and compared
		std::string m_word = "imported";
		elektronData::SyxFile m_file;
		std::vector<Item> m_items;
		std::vector<std::string> m_skipped;
		std::vector<size_t> m_queue;		// message indexes still to send, file order
		size_t m_total = 0, m_done = 0;		// messages
		size_t m_reading = 0;				// items read back (or given up)
		Phase m_phase = Phase::Idle;
		std::string m_text;
		double m_askedMs = 0;
		double m_progressMs = -1e9;
		size_t m_handedBytes = 0;			// the messages' bytes handed to the adapter
		double m_quietAtMs = -1e9;			// HW MIDI: the cable has carried them by then
	};

	// The Monomachine's DigiPRO waveforms for an export (P4): one request (0x5E) at a time, the dump that answers
	// (0x5D) kept as it came; a waveform that does not answer in time is empty (the firmware answers only a used one).
	class SyxWaveRead
	{
	public:
		using Bytes = std::vector<uint8_t>;

		void start(const uint8_t _from, const uint8_t _to)
		{
			m_waves.clear();
			for(int w = _from; w <= _to && w < elektronData::g_mmWaves; ++w)
				m_waves.push_back(static_cast<uint8_t>(w));
			m_next = 0;
			m_asked = false;
			m_dumps.clear();
		}
		bool running() const { return m_next < m_waves.size(); }
		size_t total() const { return m_waves.size(); }
		size_t done() const { return m_next; }
		// The used waveforms' dumps, in waveform order.
		std::vector<Bytes> dumps() const
		{
			std::vector<Bytes> out;
			for(const auto& [w, d] : m_dumps)
				out.push_back(d);
			return out;
		}

		// One step: ask for the next waveform, or wait for its answer until the time is out. True when it moved on.
		template<typename Machine>
		bool step(Machine& _machine, const double _nowMs, const bool _wire)
		{
			if(!running())
				return false;
			const auto w = m_waves[m_next];
			if(m_dumps.count(w))
			{
				next();
				return true;
			}
			const auto a = _machine.asIs();
			if(!m_asked)
			{
				if(!_machine.sendAsIs(elektronData::mmWaveRequest(w), false).empty())
				{
					next();
					return true;
				}
				m_asked = true;
				m_askedMs = _nowMs;
				return false;
			}
			if(a.busy)
			{
				m_askedMs = _nowMs;	// the request still waits in the stream: its clock starts when it goes
				return false;
			}
			// the emulator answers within a few blocks; over HW MIDI a 7 KB dump takes about 2.3 s on the cable
			const double timeout = _wire ? 1500.0 + 2.0 * deskCore::DinPacer::wireMs(7100) : 700.0;
			if(_nowMs - m_askedMs > timeout)
			{
				next();
				return true;
			}
			return false;
		}

		void onMachineSysex(const Bytes& _message)
		{
			if(!running())
				return;
			const auto w = elektronData::mmWaveDumpSlot(_message);
			if(w == m_waves[m_next])
				m_dumps[static_cast<uint8_t>(w)] = _message;
		}

	private:
		void next()
		{
			++m_next;
			m_asked = false;
		}

		std::vector<uint8_t> m_waves;
		size_t m_next = 0;
		bool m_asked = false;
		double m_askedMs = 0;
		std::map<uint8_t, Bytes> m_dumps;
	};
}
