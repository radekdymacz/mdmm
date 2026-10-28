#pragma once

#include "mdSyxSession.h"

#include "deskCore/deskKinds.h"

#include "mdDesk/mdDesk.h"
#include "mdDesk/mdDeskLibrary.h"
#include "mmDesk/mmDesk.h"
#include "mmDesk/mmDeskModel.h"

#include "elektronData/mdKit.h"
#include "elektronData/mdPattern.h"
#include "elektronData/mdSong.h"
#include "elektronData/mmKit.h"
#include "elektronData/mmPattern.h"
#include "elektronData/mmSong.h"

#include <algorithm>
#include <functional>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace mdJucePlugin
{
	// The SysEx work of a session (0.6, wave 6), both models, without JUCE: the import (P7, B-019: SyxJob) with its
	// SPECIFIC place and VERIFY ONLY, a part of what the editor holds for an export (kinds and ranges), the
	// Monomachine's DigiPRO waveforms read for an export, and Reset machine… as an import of the slots it clears.
	// The plug-in's session (mdDeskSession.h) and the page tier's deskStubHost both run it; the files stay theirs.

	// A model's SysEx traits: its documents' type, the file's and the desk's documents, what plays, and what an empty
	// reset sends (every kit, pattern and song slot as the library's Clear leaves it).
	template<typename DeskT> struct SyxTraits;

	// An empty pattern as the machine keeps one (measured 2026-10-12 on a machine started with no patch RAM: the MD's
	// 64 empty factory slots, the MM's 63): no trigs or locks, length 16, speed 1x, kit 1, no swing, no transpose, and
	// on the MD accent 64 with every EDIT ALL on, on the MM each arpeggiator at length 8, speed 5, every step 64 (TRIG
	// 7 on the synth tracks). The library's Clear keeps a slot's kit, length and speed (as the machine's CLEAR); a reset
	// does not. _base gives only what the editor does not name (format bytes, the firmware's own fields).
	inline elektronData::MdPattern emptyPatternMd(const elektronData::MdPattern& _base, const uint8_t _slot)
	{
		auto p = mdDesk::emptyPattern(_base);
		p.position = _slot;
		p.length = 16;
		p.tempoMultiplier = 0;
		p.scale = 0;
		p.kit = 0;
		p.swingAmount = 0;
		p.accentAmount = 64;
		p.accentEditAll = p.slideEditAll = p.swingEditAll = 1;
		p.lockedRows = 0;
		return p;
	}
	inline elektronData::MmPattern emptyPatternMm(const elektronData::MmPattern& _base, const uint8_t _slot)
	{
		auto p = mmDesk::emptyPattern(_base);
		p.position = _slot;
		p.length = 16;
		p.multiplier = 0;
		p.kit = 0;
		p.swingAmount = 0;
		p.patternTranspose = 0;
		p.transpose = p.midiTranspose = {};
		for(auto* a : {&p.arp, &p.midiArp})
		{
			a->playOjmp.fill(0);
			a->mode.fill(0);
			a->range.fill(0);
			a->speed.fill(5);
			a->length.fill(8);
			a->trigs.fill(a == &p.arp ? 7 : 0);
			for(auto& st : a->steps)
				st.fill(64);
		}
		return p;
	}

	template<> struct SyxTraits<mdDesk::Desk>
	{
		using Docs = elektronData::MdDocuments;
		using Bytes = std::vector<uint8_t>;
		static constexpr elektronData::SyxModel model = elektronData::SyxModel::Md;
		static constexpr const char* name = "Machinedrum";
		static constexpr bool waves = false;
		static const Docs& docs(const elektronData::SyxFile& _f) { return _f.md; }
		static Docs machine(const mdDesk::Desk& _d)
		{
			const auto& v = _d.documents();
			Docs o;
			o.patterns = v.patterns;
			o.kits = v.kits;
			o.songs = v.songs;
			if(v.global)
				o.globals[v.global->position] = *v.global;
			return o;
		}
		// The slots the machine is on (B-019: the preview marks the imported items that land in what plays).
		static SyxPlaying playing(const mdDesk::Desk& _d)
		{
			const auto& s = _d.linkState();
			const auto of = [](const std::optional<uint8_t>& _v) { return _v ? static_cast<int>(*_v) : -1; };
			return {of(s.pattern), of(s.kit), of(s.song), of(s.globalSlot)};
		}
		// B-130: the desk's document an item is (kits, patterns and songs: what its undo holds); none for the rest.
		using Model = mdDesk::MdModel;
		using Ref = mdDesk::DocRef;
		static std::optional<Ref> ref(const elektronData::SyxKind _kind, const uint8_t _slot)
		{
			namespace ed = elektronData;
			if(_kind == ed::SyxKind::Kit || _kind == ed::SyxKind::Pattern || _kind == ed::SyxKind::Song)
				return Ref{_kind == ed::SyxKind::Kit ? mdDesk::DocKind::Kit : _kind == ed::SyxKind::Pattern ? mdDesk::DocKind::Pattern
					: mdDesk::DocKind::Song, _slot};
			return std::nullopt;
		}
		static Ref workingRef() { return {mdDesk::DocKind::WorkingKit, 0}; }
		// B-174: the desk reads a slot an import wrote again (its load queue, in the background). The Machinedrum's
		// desk holds the active global alone, which it reads on its own.
		static void reread(mdDesk::Desk& _d, const elektronData::SyxKind _kind, const uint8_t _slot)
		{
			namespace ed = elektronData;
			if(_kind == ed::SyxKind::Kit || _kind == ed::SyxKind::Pattern || _kind == ed::SyxKind::Song)
				_d.machine().reread({_kind == ed::SyxKind::Kit ? mdDesk::DocKind::Kit : _kind == ed::SyxKind::Pattern ? mdDesk::DocKind::Pattern
					: mdDesk::DocKind::Song, _slot});
		}
		// Empty reset: 64 kits and 32 songs as the library clears a slot (mdDeskLibrary.h; the slot's own document is the
		// base where the editor holds it, another of its kind where not), 128 patterns as the machine's own empty one
		// (emptyPatternMd). "" or why not.
		static std::string empties(const mdDesk::Desk& _d, std::vector<Bytes>& _out)
		{
			namespace ed = elektronData;
			const auto& v = _d.documents();
			if(v.kits.empty() || v.patterns.empty() || v.songs.empty())
				return "The editor has not read the machine's kits, patterns and songs yet: try again in a moment.";
			for(uint8_t k = 0; k < ed::MdKit::g_slots; ++k)
			{
				const auto it = v.kits.find(k);
				_out.push_back(ed::encodeMdKit(mdDesk::emptyKit(it != v.kits.end() ? it->second : v.kits.begin()->second, k)));
			}
			for(uint8_t p = 0; p < 128; ++p)
			{
				const auto it = v.patterns.find(p);
				_out.push_back(ed::encodeMdPattern(emptyPatternMd(it != v.patterns.end() ? it->second : v.patterns.begin()->second, p)));
			}
			for(uint8_t s = 0; s < ed::MdSong::g_slots; ++s)
			{
				const auto it = v.songs.find(s);
				_out.push_back(ed::encodeMdSong(mdDesk::emptySong(it != v.songs.end() ? it->second : v.songs.begin()->second, s)));
			}
			return {};
		}
	};

	template<> struct SyxTraits<mmDesk::Desk>
	{
		using Docs = elektronData::MmDocuments;
		using Bytes = std::vector<uint8_t>;
		static constexpr elektronData::SyxModel model = elektronData::SyxModel::Mm;
		static constexpr const char* name = "Monomachine";
		static constexpr bool waves = true;
		static const Docs& docs(const elektronData::SyxFile& _f) { return _f.mm; }
		static Docs machine(const mmDesk::Desk& _d)
		{
			const auto& v = _d.documents();
			Docs o;
			o.patterns = v.patterns;
			o.kits = v.kits;
			o.songs = v.songs;
			o.globals = v.globals;
			return o;
		}
		static SyxPlaying playing(const mmDesk::Desk& _d)
		{
			return {_d.currentPattern(), _d.currentKit(), _d.currentSong(), _d.currentGlobal()};
		}
		// B-130: the desk's document an item is (kits, patterns and songs: what its undo holds); none for the rest.
		using Model = mmDesk::MmModel;
		using Ref = mmDesk::Ref;
		static std::optional<Ref> ref(const elektronData::SyxKind _kind, const uint8_t _slot)
		{
			namespace ed = elektronData;
			using K = mmDesk::Kind;
			if(_kind == ed::SyxKind::Kit || _kind == ed::SyxKind::Pattern)
				return Ref{_kind == ed::SyxKind::Kit ? K::Kit : K::Pattern, static_cast<uint8_t>(_slot & 127)};
			if(_kind == ed::SyxKind::Song)
				return Ref{K::Song, deskCore::slotIn<mmDesk::MmModel>(K::Song, _slot)};
			return std::nullopt;
		}
		static Ref workingRef() { return {mmDesk::Kind::WorkingKit, 0}; }
		// B-174: the desk reads a slot an import wrote again (its load queue, in the background); a song's or a
		// global's position byte folded into its range as the desk reads its dump.
		static void reread(mmDesk::Desk& _d, const elektronData::SyxKind _kind, const uint8_t _slot)
		{
			namespace ed = elektronData;
			using K = mmDesk::Kind;
			const auto kind = _kind == ed::SyxKind::Kit ? K::Kit : _kind == ed::SyxKind::Pattern ? K::Pattern : _kind == ed::SyxKind::Song ? K::Song
				: _kind == ed::SyxKind::Global ? K::Global : K::WorkingKit;
			if(kind == K::WorkingKit)
				return;
			_d.machine().reread({kind, kind == K::Kit || kind == K::Pattern ? static_cast<uint8_t>(_slot & 127) : deskCore::slotIn<mmDesk::MmModel>(kind, _slot)});
		}
		// Empty reset: 128 kits and 24 songs as the library clears a slot (mmDeskModel.h), 128 patterns as the machine's
		// own empty one (emptyPatternMm).
		static std::string empties(const mmDesk::Desk& _d, std::vector<Bytes>& _out)
		{
			namespace ed = elektronData;
			const auto& v = _d.documents();
			if(v.kits.empty() || v.patterns.empty() || v.songs.empty())
				return "The editor has not read the machine's kits, patterns and songs yet: try again in a moment.";
			for(uint8_t k = 0; k < 128; ++k)
			{
				const auto it = v.kits.find(k);
				_out.push_back(ed::encodeMmKit(mmDesk::emptyKit(it != v.kits.end() ? it->second : v.kits.begin()->second, k)));
			}
			for(uint8_t p = 0; p < 128; ++p)
			{
				const auto it = v.patterns.find(p);
				_out.push_back(ed::encodeMmPattern(emptyPatternMm(it != v.patterns.end() ? it->second : v.patterns.begin()->second, p)));
			}
			for(uint8_t s = 0; s < 24; ++s)
			{
				const auto it = v.songs.find(s);
				_out.push_back(ed::encodeMmSong(mmDesk::emptySong(it != v.songs.end() ? it->second : v.songs.begin()->second, s)));
			}
			return {};
		}
	};

	template<typename DeskT>
	class SyxWork
	{
	public:
		using Traits = SyxTraits<DeskT>;
		using Value = elektronData::json::Value;
		using Bytes = std::vector<uint8_t>;
		using ToPage = std::function<void(const Value&)>;
		using Reply = std::function<void(const Value& _message, bool _ok, const std::string& _note)>;
		using Job = SyxJob<Traits>;
		using Snapshot = std::vector<typename Traits::Model::Document>;

		// What syxExport asks for: everything the editor holds (no kinds), or the kinds named with their ranges; the
		// Monomachine's waveforms as one more kind ("wave"), read from the machine.
		struct ExportRequest
		{
			bool all = true;
			elektronData::SyxSelection select;
			std::optional<elektronData::SyxRange> waves;
		};

		static ExportRequest exportRequest(const Value& _message)
		{
			namespace ed = elektronData;
			ExportRequest r;
			const auto* kinds = _message.find("kinds");
			if(!kinds || !kinds->isArray())
				return r;
			r.all = false;
			const auto* ranges = _message.find("ranges");
			for(const auto& k : kinds->asArray())
			{
				if(!k.isString())
					continue;
				const auto id = k.asString();
				const auto kind = kindOf(id);
				const size_t slots = id == "wave" ? ed::g_mmWaves : kind ? ed::syxSlotCount(Traits::model, *kind) : 0;
				if(!slots)
					continue;
				ed::SyxRange range{0, static_cast<uint8_t>(slots - 1)};
				if(const auto* rr = ranges && ranges->isObject() ? ranges->find(id) : nullptr; rr && rr->isArray() && rr->asArray().size() == 2
					&& rr->asArray()[0].isNumber() && rr->asArray()[1].isNumber())
				{
					const auto clamp = [&](const double _v) { return static_cast<uint8_t>(std::clamp<double>(_v, 0, static_cast<double>(slots - 1))); };
					const auto a = clamp(rr->asArray()[0].asNumber()), b = clamp(rr->asArray()[1].asNumber());
					range = {std::min(a, b), std::max(a, b)};
				}
				if(id == "wave")
				{
					if(Traits::waves)
						r.waves = range;
				}
				else
					r.select[*kind] = range;
			}
			return r;
		}

		// The documents of an export, as one .syx (the waveforms come from the machine: exportStart).
		static Bytes exportBytes(const DeskT& _desk, const ExportRequest& _r)
		{
			const auto docs = Traits::machine(_desk);
			return elektronData::writeSyx(_r.all ? docs : elektronData::syxSelect(docs, _r.select));
		}

		// What an export holds, in words: "12 kits, 18 patterns, 4 songs, 1 global".
		static std::string exportWords(const DeskT& _desk, const ExportRequest& _r, const size_t _waves = 0)
		{
			const auto d = _r.all ? Traits::machine(_desk) : elektronData::syxSelect(Traits::machine(_desk), _r.select);
			std::string t;
			const auto add = [&t](const size_t _n, const char* _one, const char* _many)
			{
				if(!_n)
					return;
				t += (t.empty() ? "" : ", ") + std::to_string(_n) + " " + (_n == 1 ? _one : _many);
			};
			add(d.kits.size(), "kit", "kits");
			add(d.patterns.size(), "pattern", "patterns");
			add(d.songs.size(), "song", "songs");
			add(d.globals.size(), "global", "globals");
			add(_waves, "waveform", "waveforms");
			return t.empty() ? "nothing" : t;
		}

		// The export panel's facts ({"type":"syxExportInfo"}): per kind its slots, how many the editor holds, how many
		// hold data and the first and last of those (the panel's default range).
		static Value exportInfo(const DeskT& _desk)
		{
			namespace ed = elektronData;
			const auto docs = Traits::machine(_desk);
			Value m = Value::object();
			m.set("type", "syxExportInfo");
			m.set("model", Traits::name);
			Value kinds = Value::object();
			for(const auto kind : {ed::SyxKind::Kit, ed::SyxKind::Pattern, ed::SyxKind::Song, ed::SyxKind::Global})
			{
				const auto slots = ed::syxSlotCount(Traits::model, kind);
				int held = 0, used = 0, first = -1, last = -1;
				for(size_t s = 0; s < slots; ++s)
				{
					const auto slot = static_cast<uint8_t>(s);
					if(ed::syxCanonical(docs, kind, slot).empty())
						continue;
					++held;
					if(!ed::syxHoldsData(docs, kind, slot))
						continue;
					++used;
					if(first < 0)
						first = static_cast<int>(s);
					last = static_cast<int>(s);
				}
				Value k = Value::object();
				k.set("slots", static_cast<int>(slots));
				k.set("held", held);
				k.set("used", used);
				k.set("first", first);
				k.set("last", last);
				kinds.set(kindName(kind), k);
			}
			if(Traits::waves)
			{
				Value w = Value::object();
				w.set("slots", static_cast<int>(ed::g_mmWaves));
				kinds.set("wave", w);
			}
			m.set("kinds", kinds);
			return m;
		}

		// A .syx opened: its preview.
		Value open(const DeskT& _desk, const Bytes& _bytes, const std::string& _name)
		{
			m_job.setWord("imported");
			return m_job.open(_bytes, _name, Traits::machine(_desk), Traits::playing(_desk));
		}

		// The page's SysEx rows the session runs: syxImport {kinds, skip, placeAt, checkOnly, readBack}, syxCancel, syxPlace
		// {placeAt}, syxExportInfo, machineReset {how: "empty"} (factory is the session's own: false). False: none of them.
		bool handle(DeskT& _desk, const Value& _message, const Reply& _reply, const ToPage& _toPage)
		{
			const auto op = deskCore::opOf(_message);
			if(op == "syxImport")
			{
				if(const auto* p = _message.find("placeAt"); p && p->isObject() && !m_job.running())
					m_job.place(firstSlots(*p), Traits::machine(_desk), Traits::playing(_desk));
				const auto* c = _message.find("checkOnly");
				const auto* r = _message.find("readBack");	// I-038: absent = on
				const auto why = m_job.start(strings(_message, "kinds"), skipOf(_message), Traits::machine(_desk), c && c->isBool() && c->asBool(),
					!(r && r->isBool() && !r->asBool()));
				if(why.empty())
					begin(_desk);
				_reply(_message, why.empty(), why);
				_toPage(m_job.progress());
				return true;
			}
			if(op == "syxCancel")
			{
				m_job.cancel();
				_toPage(m_job.progress());
				_reply(_message, true, "Import stopped.");
				return true;
			}
			if(op == "syxPlace")
			{
				const auto* p = _message.find("placeAt");
				auto preview = m_job.place(p && p->isObject() ? firstSlots(*p) : std::map<std::string, int>{}, Traits::machine(_desk),
					Traits::playing(_desk));
				const bool ok = preview.find("ok") && preview.find("ok")->asBool();
				_reply(_message, ok, ok ? std::string() : preview.find("text")->asString());
				if(ok)
					_toPage(preview);
				return true;
			}
			if(op == "syxExportInfo")
			{
				_toPage(exportInfo(_desk));
				_reply(_message, true, "");
				return true;
			}
			if(op == "machineReset")
			{
				const auto* how = _message.find("how");
				if(!how || !how->isString() || how->asString() != "empty")
					return false;
				std::vector<Bytes> messages;
				auto why = Traits::empties(_desk, messages);
				if(why.empty())
					why = reset(_desk, messages, "Empty reset", "cleared", _toPage);
				_reply(_message, why.empty(), why);
				return true;
			}
			return false;
		}

		// A reset: _messages go to the machine as an import of every kit, pattern and song they hold (one undo step), then
		// each slot is read back and reported. The page hears the preview (reset: _label, running) and the progress.
		std::string reset(DeskT& _desk, const std::vector<Bytes>& _messages, const std::string& _label, const std::string& _word,
			const ToPage& _toPage)
		{
			if(m_job.running() || m_waves.running())
				return "An import or export is running.";
			Bytes file;
			for(const auto& m : _messages)
				file.insert(file.end(), m.begin(), m.end());
			m_job.setWord(_word);
			auto preview = m_job.open(file, _label, Traits::machine(_desk), Traits::playing(_desk));
			if(!preview.find("ok")->asBool())
				return preview.find("text")->asString();
			const auto why = m_job.start({"kit", "pattern", "song"}, {}, Traits::machine(_desk));
			if(!why.empty())
				return why;
			begin(_desk);
			preview.set("reset", _label);
			preview.set("running", true);
			_toPage(preview);
			_toPage(m_job.progress());
			return {};
		}

		// An export with waveforms: the documents now, the waveforms read from the machine, then _done(bytes, words).
		// False when one runs already.
		bool exportStart(const DeskT& _desk, const ExportRequest& _r, std::function<void(const Bytes&, const std::string&)> _done)
		{
			if(m_waves.running() || m_job.running())
				return false;
			m_export = exportBytes(_desk, _r);
			m_exportWords = _r;
			m_exportDone = std::move(_done);
			m_waves.start(_r.waves ? _r.waves->from : 0, _r.waves ? _r.waves->to : 0);
			return true;
		}

		bool running() const { return m_job.running() || m_waves.running(); }
		// Work for the session's step: what runs, or the slots an import wrote that the desk is still to read again.
		bool due() const { return running() || !m_reread.empty() || m_undoOpen; }

		// One session step while the machine takes input.
		void step(DeskT& _desk, const double _nowMs, const bool _wire, const ToPage& _toPage)
		{
			if(!undoReady(_desk, _nowMs))
				return;
			if(m_job.running())
			{
				if(auto p = m_job.step(_desk.machine(), _nowMs, _wire))
					_toPage(*p);
				// B-174: an import that did not read back what it sent (the read-back off, a slot given up) left the
				// desk with what those slots held before (a previous import's kit names in the library): the desk reads
				// them again once the cable has carried the dumps.
				if(!m_job.running())
				{
					const auto unread = m_job.unread();
					m_reread.insert(m_reread.end(), unread.begin(), unread.end());
					m_rereadAtMs = std::max(_nowMs, m_job.quietAtMs());
				}
			}
			end(_desk);
			if(!m_reread.empty() && _nowMs >= m_rereadAtMs && !m_job.running())
			{
				for(const auto& i : m_reread)
					Traits::reread(_desk, i.kind, i.slot);
				m_reread.clear();
			}
			if(m_waves.running())
			{
				if(m_waves.step(_desk.machine(), _nowMs, _wire) && _nowMs - m_waveNewsMs > 250 && m_waves.running())
				{
					m_waveNewsMs = _nowMs;
					Value m = Value::object();
					m.set("type", "syxExport");
					m.set("running", true);
					m.set("ok", true);
					m.set("text", "Reading the DigiPRO waveforms: " + std::to_string(m_waves.done()) + " of " + std::to_string(m_waves.total()));
					_toPage(m);
				}
				if(!m_waves.running() && m_exportDone)
				{
					auto bytes = m_export;
					const auto dumps = m_waves.dumps();
					for(const auto& d : dumps)
						bytes.insert(bytes.end(), d.begin(), d.end());
					auto done = std::move(m_exportDone);
					m_exportDone = nullptr;
					done(bytes, exportWords(_desk, m_exportWords, dumps.size()));
				}
			}
			if(!due())
				_desk.machine().importing(false);
		}

		void onMachineSysex(const Bytes& _message)
		{
			m_job.onMachineSysex(_message);
			m_waves.onMachineSysex(_message);
		}

		Job& job() { return m_job; }

	private:
		// B-130: an import or a reset starts (it was accepted, nothing has gone yet). The documents it will write are
		// copied from the desk (only those slots, and the kit that plays: its live edits), the first of the step so
		// that undo puts it back last; and the adapter is told an import is at work (B-045).
		void begin(DeskT& _desk)
		{
			m_undoOpen = false;
			m_undo.clear();
			if(m_job.checkOnly())
				return;	// VERIFY ONLY sends nothing: nothing to put back, nothing stale
			_desk.machine().importing(true);
			m_refs = {Traits::workingRef()};
			m_wait.clear();
			m_waitUntilMs = -1;
			for(const auto& i : m_job.written())
				if(const auto r = Traits::ref(i.kind, i.slot))
				{
					m_refs.push_back(*r);
					// not read yet: the desk reads it now, the job waits for it (undoReady) so that nothing is imported unsaved
					if(_desk.core().snapshot({*r}).empty())
					{
						m_wait.push_back({i.kind, i.slot});
						Traits::reread(_desk, i.kind, i.slot);
					}
				}
			m_undo = m_wait.empty() ? _desk.core().snapshot(m_refs) : Snapshot{};
			m_undoOpen = true;
		}

		// B-130: the slots the editor had not read when the job was accepted are read first. True when the copies are
		// taken (every slot arrived, or 60 s passed: the report then says how many cannot be undone).
		bool undoReady(DeskT& _desk, const double _nowMs)
		{
			if(!m_undoOpen || m_wait.empty())
				return true;
			if(m_waitUntilMs < 0)
				m_waitUntilMs = _nowMs + 60000.0;
			std::vector<elektronData::SyxItem> left;
			for(const auto& i : m_wait)
				if(const auto r = Traits::ref(i.kind, i.slot); r && _desk.core().snapshot({*r}).empty())
					left.push_back(i);
			m_wait = left;
			if(!m_wait.empty() && _nowMs < m_waitUntilMs)
				return false;
			m_undo = _desk.core().snapshot(m_refs);
			if(!m_wait.empty())
				m_job.setNote(std::to_string(m_wait.size()) + (m_wait.size() == 1 ? " slot cannot" : " slots cannot")
					+ " be undone: the editor could not read " + (m_wait.size() == 1 ? "it" : "them") + " first.");
			m_wait.clear();
			return true;
		}

		// B-130: the job is over (done, stopped, or given up): what it sent is one undo step, the copies of the slots it
		// wrote (not those it never sent), and the kit that plays when any was. Nothing sent: no step.
		void end(DeskT& _desk)
		{
			if(!m_undoOpen || m_job.running())
				return;
			m_undoOpen = false;
			std::set<typename Traits::Ref> sent;
			for(const auto& i : m_job.written(true))
				if(const auto r = Traits::ref(i.kind, i.slot))
					sent.insert(*r);
			if(sent.empty())
			{
				m_undo.clear();
				return;
			}
			Snapshot keep;
			for(auto& d : m_undo)
			{
				const auto r = Traits::Model::refOf(d);
				if(r == Traits::workingRef() || sent.count(r))
					keep.push_back(std::move(d));
			}
			m_undo.clear();
			_desk.core().recordBulk(keep);
		}

		static std::optional<elektronData::SyxKind> kindOf(const std::string& _id)
		{
			for(const auto k : {elektronData::SyxKind::Global, elektronData::SyxKind::Kit, elektronData::SyxKind::Pattern, elektronData::SyxKind::Song})
				if(_id == elektronData::syxKindName(k))
					return k;
			return std::nullopt;
		}
		static const char* kindName(const elektronData::SyxKind _k) { return elektronData::syxKindName(_k); }

		static std::vector<std::string> strings(const Value& _m, const char* _key)
		{
			std::vector<std::string> out;
			if(const auto* k = _m.find(_key); k && k->isArray())
				for(const auto& v : k->asArray())
					if(v.isString())
						out.push_back(v.asString());
			return out;
		}
		static std::set<std::string> skipOf(const Value& _m)
		{
			const auto s = strings(_m, "skip");
			return {s.begin(), s.end()};
		}
		static std::map<std::string, int> firstSlots(const Value& _p)
		{
			std::map<std::string, int> out;
			for(const auto& [k, v] : _p.asObject())
				if(v.isNumber())
					out[k] = static_cast<int>(v.asNumber());
			return out;
		}

		Job m_job;
		Snapshot m_undo;
		std::vector<typename Traits::Ref> m_refs;
		std::vector<elektronData::SyxItem> m_wait;	// B-130: slots read before the job goes
		double m_waitUntilMs = -1;	// B-130: the copies, until the job is over
		bool m_undoOpen = false;
		std::vector<elektronData::SyxItem> m_reread;	// B-174: the slots the desk reads again at m_rereadAtMs
		double m_rereadAtMs = 0;
		SyxWaveRead m_waves;
		Bytes m_export;
		ExportRequest m_exportWords;
		std::function<void(const Bytes&, const std::string&)> m_exportDone;
		double m_waveNewsMs = -1e9;
	};
}
