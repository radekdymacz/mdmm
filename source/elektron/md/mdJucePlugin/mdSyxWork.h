#pragma once

#include "mdSyxSession.h"

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

#include <functional>
#include <optional>
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
		// Empty reset: 64 kits, 128 patterns, 32 songs as the library clears a slot (mdDeskLibrary.h); the slot's own
		// document is the base where the editor holds it, another of its kind where not. "" or why not.
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
				auto e = mdDesk::emptyPattern(it != v.patterns.end() ? it->second : v.patterns.begin()->second);
				e.position = p;
				_out.push_back(ed::encodeMdPattern(e));
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
		// Empty reset: 128 kits, 128 patterns, 24 songs as the library clears a slot (mmDeskModel.h).
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
				auto e = mmDesk::emptyPattern(it != v.patterns.end() ? it->second : v.patterns.begin()->second);
				e.position = p;
				_out.push_back(ed::encodeMmPattern(e));
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

		// The page's SysEx rows the session runs: syxImport {kinds, skip, placeAt, checkOnly}, syxCancel, syxPlace
		// {placeAt}, syxExportInfo, machineReset {how: "empty"} (factory is the session's own: false). False: none of them.
		bool handle(DeskT& _desk, const Value& _message, const Reply& _reply, const ToPage& _toPage)
		{
			const auto op = deskCore::opOf(_message);
			if(op == "syxImport")
			{
				if(const auto* p = _message.find("placeAt"); p && p->isObject() && !m_job.running())
					m_job.place(firstSlots(*p), Traits::machine(_desk), Traits::playing(_desk));
				const auto* c = _message.find("checkOnly");
				const auto why = m_job.start(strings(_message, "kinds"), skipOf(_message), Traits::machine(_desk), c && c->isBool() && c->asBool());
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

		// A reset: _messages go to the machine as an import of every kit, pattern and song they hold (no undo), then
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

		// One session step while the machine takes input.
		void step(DeskT& _desk, const double _nowMs, const bool _wire, const ToPage& _toPage)
		{
			if(m_job.running())
				if(auto p = m_job.step(_desk.machine(), _nowMs, _wire))
					_toPage(*p);
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
		}

		void onMachineSysex(const Bytes& _message)
		{
			m_job.onMachineSysex(_message);
			m_waves.onMachineSysex(_message);
		}

		Job& job() { return m_job; }

	private:
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
		SyxWaveRead m_waves;
		Bytes m_export;
		ExportRequest m_exportWords;
		std::function<void(const Bytes&, const std::string&)> m_exportDone;
		double m_waveNewsMs = -1e9;
	};
}
