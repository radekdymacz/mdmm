#pragma once

#include "elektronData/json.h"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace deskCore
{
	// The generic step-set moves both editors' pure edits use (DESIGN-UNIFY.md 4.2): a track's steps as bits
	// (bit s = step s) and as rows (a value per step: notes, lock values). Pure and header-only; what a step
	// holds is the machine's (mdDeskEdit.cpp, mmDeskEdit.cpp), how steps move is here, once.

	// What the generic edits below share (DESIGN-UNIFY.md 4.2): the step-set moves (bits and rows of steps), the song
	// rows (contract rows as JSON values: one row semantics for both machines) and the library's slot actions over
	// any model's kinds (copy, paste, copy-to, clear, rename). What a step, a row or a slot holds is the machine's.

	// Step _s moved _by steps later (earlier when negative), wrapping inside [0, _len).
	inline size_t rotatedStep(const size_t _s, const int _by, const size_t _len)
	{
		const int len = static_cast<int>(_len);
		return static_cast<size_t>(((static_cast<int>(_s) + _by) % len + len) % len);
	}

	// The bits of [0, _len) moved _by steps, wrapping inside [0, _len); the bits from _len on stay.
	inline uint64_t rotatedBits(const uint64_t _bits, const int _by, const size_t _len)
	{
		const uint64_t inside = _len >= 64 ? ~uint64_t{0} : (uint64_t{1} << _len) - 1;
		uint64_t out = _bits & ~inside;
		for(size_t s = 0; s < _len; ++s)
			if(_bits >> s & 1)
				out |= uint64_t{1} << rotatedStep(s, _by, _len);
		return out;
	}

	// A row's values of [0, _len) moved _by steps, wrapping inside [0, _len); the values from _len on stay.
	template<typename Row>
	void rotateRow(Row& _row, const int _by, const size_t _len)
	{
		const Row was = _row;
		for(size_t s = 0; s < _len; ++s)
			_row[rotatedStep(s, _by, _len)] = was[s];
	}

	// The steps [_len, 2 _len) a copy of [0, _len), after [_clearFrom, _clearTo) was cleared (steps a longer
	// pattern would show that held hidden residue); the steps from 2 _len on otherwise stay.
	inline uint64_t doubledBits(uint64_t _bits, const size_t _len, const size_t _clearFrom = 0, const size_t _clearTo = 0)
	{
		const auto bit = [](const size_t _s) { return uint64_t{1} << _s; };
		for(size_t s = _clearFrom; s < _clearTo && s < 64; ++s)
			_bits &= ~bit(s);
		for(size_t s = 0; s < _len && _len + s < 64; ++s)
			_bits = (_bits & ~bit(_len + s)) | ((_bits >> s & 1) << (_len + s));
		return _bits;
	}

	// The row's values of [_len, 2 _len) a copy of [0, _len), after [_clearFrom, _clearTo) was set to _empty.
	template<typename Row, typename V>
	void doubleRow(Row& _row, const size_t _len, const V _empty, const size_t _clearFrom = 0, const size_t _clearTo = 0)
	{
		for(size_t s = _clearFrom; s < _clearTo && s < _row.size(); ++s)
			_row[s] = _empty;
		for(size_t s = 0; s < _len && _len + s < _row.size(); ++s)
			_row[_len + s] = _row[s];
	}

	// The bits of steps [_from, _to).
	inline uint64_t stepRange(const size_t _from, const size_t _to)
	{
		uint64_t r = 0;
		for(size_t s = _from; s < _to && s < 64; ++s)
			r |= uint64_t{1} << s;
		return r;
	}

	// ---- song rows: the contract's rows ({kind, target?...} JSON values), edited as rows (DESIGN-UNIFY.md 4.2) ----
	// kind "end" is the last row; loop, jump and halt rows that carry a target follow the row they name when rows
	// move. The machine's codec turns the rows back into its song (and refuses what it cannot hold).
	namespace songRows
	{
		using Value = elektronData::json::Value;
		using Rows = std::vector<Value>;

		// What one row edit gets: the command, where its errors and note go, the clipboard's row, and how many rows a
		// song holds (END included).
		struct Edit
		{
			const Value& command;
			std::vector<std::string>& errors;
			std::string& note;
			std::optional<Value>& clip;
			size_t maxRows;
		};

		inline Value withMember(const Value& _object, const std::string& _key, Value _value)
		{
			Value out = Value::object();
			bool replaced = false;
			for(const auto& [k, v] : _object.asObject())
			{
				if(k == _key)
				{
					out.set(k, _value);
					replaced = true;
				}
				else
					out.set(k, v);
			}
			if(!replaced)
				out.set(_key, std::move(_value));
			return out;
		}

		inline bool isEnd(const Value& _row)
		{
			const auto* kind = _row.find("kind");
			return kind && kind->isString() && kind->asString() == "end";
		}

		// Loop, jump and halt targets follow their rows: _map[old] = new index.
		inline Rows remapTargets(Rows _rows, const std::vector<size_t>& _map)
		{
			for(auto& row : _rows)
			{
				const auto* kind = row.find("kind");
				const auto* target = row.find("target");
				if(!kind || !target || !target->isNumber() || !kind->isString())
					continue;
				if(kind->asString() != "loop" && kind->asString() != "jump" && kind->asString() != "halt")
					continue;
				const auto old = static_cast<size_t>(target->asNumber());
				if(old < _map.size())
					row = withMember(row, "target", static_cast<int>(_map[old]));
			}
			return _rows;
		}

		// The integer argument _key, inside [_min, _max] (the errors as the command table words them).
		inline std::optional<int> within(const Edit& _e, const char* _key, const int _min, const int _max)
		{
			const auto* v = _e.command.find(_key);
			if(!v || !v->isNumber())
			{
				_e.errors.push_back(std::string(_key) + ": missing number");
				return {};
			}
			const auto i = static_cast<int>(v->asNumber());
			if(i < _min || i > _max)
			{
				_e.errors.push_back(std::string(_key) + ": " + std::to_string(i) + " is outside " + std::to_string(_min) + ".." + std::to_string(_max));
				return {};
			}
			return i;
		}
		inline std::optional<int> rowArg(const Rows& _rows, const Edit& _e, const char* _key)
		{
			return within(_e, _key, 0, static_cast<int>(_rows.size()) - 1);
		}

		inline std::optional<Rows> copyRow(Rows _rows, const Edit& _e)
		{
			const auto i = rowArg(_rows, _e, "i");
			if(!i)
				return {};
			if(isEnd(_rows[size_t(*i)]))
			{
				_e.errors.push_back("END cannot be copied");
				return {};
			}
			_e.clip = _rows[size_t(*i)];
			_e.note = "Copied row " + std::to_string(*i + 1);
			return _rows;
		}

		inline std::optional<Rows> rowSet(Rows _rows, const Edit& _e)
		{
			const auto i = rowArg(_rows, _e, "i");
			if(!i)
				return {};
			_rows[size_t(*i)] = *_e.command.find("row");
			return _rows;
		}

		// Insert at i; the END row can only move down.
		inline std::optional<Rows> insertRow(Rows _rows, const Edit& _e, const Value& _row)
		{
			if(_rows.size() >= _e.maxRows)
			{
				_e.errors.push_back("A song holds " + std::to_string(_e.maxRows) + " rows");
				return {};
			}
			const auto at = size_t(_e.command.find("i")->asNumber());
			std::vector<size_t> map(_rows.size());
			for(size_t j = 0; j < map.size(); ++j)
				map[j] = j < at ? j : j + 1;
			_rows = remapTargets(std::move(_rows), map);
			_rows.insert(_rows.begin() + static_cast<std::ptrdiff_t>(at), _row);
			return _rows;
		}

		inline std::optional<Rows> rowInsert(Rows _rows, const Edit& _e)
		{
			if(!rowArg(_rows, _e, "i"))
				return {};
			const auto* row = _e.command.find("row");
			if(!row)
			{
				_e.errors.push_back("row: missing object");
				return {};
			}
			return insertRow(std::move(_rows), _e, *row);
		}

		inline std::optional<Rows> pasteRow(Rows _rows, const Edit& _e)
		{
			if(!rowArg(_rows, _e, "i"))
				return {};
			if(!_e.clip)
			{
				_e.errors.push_back("Copy a song row first");
				return {};
			}
			return insertRow(std::move(_rows), _e, *_e.clip);
		}

		inline std::optional<Rows> rowDelete(Rows _rows, const Edit& _e)
		{
			const auto i = rowArg(_rows, _e, "i");
			if(!i)
				return {};
			if(isEnd(_rows[size_t(*i)]))
			{
				_e.errors.push_back("END cannot be deleted");
				return {};
			}
			const auto at = size_t(*i);
			std::vector<size_t> map(_rows.size());
			for(size_t j = 0; j < map.size(); ++j)
				map[j] = j <= at ? j : j - 1;
			_rows.erase(_rows.begin() + static_cast<std::ptrdiff_t>(at));
			return remapTargets(std::move(_rows), map);
		}

		inline std::optional<Rows> rowMove(Rows _rows, const Edit& _e)
		{
			const auto from = rowArg(_rows, _e, "from"), to = rowArg(_rows, _e, "to");
			if(!from || !to)
				return {};
			if(isEnd(_rows[size_t(*from)]) || isEnd(_rows[size_t(*to)]))
			{
				_e.errors.push_back("END stays the last row");
				return {};
			}
			std::vector<size_t> order(_rows.size());
			for(size_t j = 0; j < order.size(); ++j)
				order[j] = j;
			const auto moved = order[size_t(*from)];
			order.erase(order.begin() + *from);
			order.insert(order.begin() + *to, moved);
			std::vector<size_t> map(_rows.size());
			for(size_t j = 0; j < order.size(); ++j)
				map[order[j]] = j;
			_rows = remapTargets(std::move(_rows), map);
			Rows reordered;
			for(const auto j : order)
				reordered.push_back(_rows[j]);
			return reordered;
		}

		using Fn = std::optional<Rows> (*)(Rows, const Edit&);
		// The row ops, one function each (the same op names on both machines).
		inline const std::map<std::string, Fn>& edits()
		{
			static const std::map<std::string, Fn> e{
				{"copyRow", copyRow}, {"rowSet", rowSet}, {"rowInsert", rowInsert}, {"pasteRow", pasteRow},
				{"rowDelete", rowDelete}, {"rowMove", rowMove}};
			return e;
		}
	}

	// ---- the library: slot actions over a model's kinds (DESIGN-UNIFY.md 4.2) ----
	// One shelf a kind of slot (the kits, the patterns, the songs): what differs between them and between the machines
	// is data here (the shelf's functions), the actions are the same. Commands: <kit|pat|song|global>Copy {k|p|s|slot}, Paste
	// {k|p|s|slot}, CopyTo {from, to} (songCopyTo may carry a name: "Save to..."), Clear {k|p|s}, kitRename {k, name},
	// songRename {s, name}. The command table has checked the arguments. A slot write is validated and
	// is no change when it is the same; asking before it loses something is the machine's (its review).
	namespace library
	{
		template<typename M>
		struct Shelf
		{
			using Document = typename M::Document;
			using Documents = typename M::Documents;
			using Clipboard = typename M::Clipboard;
			using Context = typename M::Context;

			typename M::Kind kind;
			const char* key;					// the slot argument
			const char* noun;					// "kit is not loaded yet"
			std::string (*label)(int);			// K01, A01
			// What a copy takes from slot _slot (nothing when it is not loaded): the kit that plays as it sounds.
			std::optional<Document> (*source)(const Documents&, const Context&, int);
			std::optional<Document> (*clipped)(const Clipboard&);
			void (*keep)(Clipboard&, const Document&);
			const char* nothingCopied;
			std::string (*copied)(int, const Document&);	// the copy's note
			std::string (*title)(const Document&);			// what a paste names
			Document (*placed)(const Document& _src, const Document& _dst, int _slot);
			Document (*cleared)(const Document&, int _slot);
			const char* clearedNote;
			// The stored form of what a copy read (the kit that plays as a stored kit).
			Document (*stored)(const Document&);
			// Rename (kits): whether slot _slot is the kit that plays (refused: the live rename is kitName), and the
			// slot's document with the new name (an error when the name cannot be one).
			bool (*plays)(const Context&, int);
			std::optional<Document> (*renamed)(const Document&, const std::string& _name, std::string& _error);
			std::vector<std::string> (*problems)(const Document&);
		};

		template<typename M>
		struct Lib
		{
			using Document = typename M::Document;

			const typename M::Documents& docs;
			const elektronData::json::Value& command;
			typename M::Clipboard& clip;
			const typename M::Context& context;
			const Shelf<M>& shelf;
			typename M::EditResult& r;

			int integer(const char* _key) const { return static_cast<int>(command.find(_key)->asNumber()); }
			int slot() const { return integer(shelf.key); }

			std::optional<Document> at(const int _slot) const
			{
				auto d = M::get(docs, {shelf.kind, static_cast<uint8_t>(_slot)});
				if(!d)
					r.errors.push_back(std::string(shelf.noun) + " " + shelf.label(_slot) + " is not loaded yet");
				return d;
			}
			std::optional<Document> from(const int _slot) const
			{
				auto d = shelf.source(docs, context, _slot);
				if(!d)
					r.errors.push_back(std::string(shelf.noun) + " " + shelf.label(_slot) + " is not loaded yet");
				return d;
			}
			// A slot write: validated, and no change when it is the same.
			void put(const Document& _before, Document _after) const
			{
				if(auto p = shelf.problems(_after); !p.empty())
				{
					r.errors = std::move(p);
					return;
				}
				if(!(_before == _after))
					r.changes.push_back({_before, std::move(_after)});
			}
		};

		template<typename M>
		void copy(const Lib<M>& _l)
		{
			const auto s = _l.slot();
			if(const auto d = _l.from(s))
			{
				_l.shelf.keep(_l.clip, _l.shelf.stored(*d));
				_l.r.note = _l.shelf.copied(s, _l.shelf.stored(*d));
			}
		}

		// Writes _src into slot _target; _verb says how the user did it.
		// _name (a copy that names its target: songCopyTo "Save to...") is the target's name after the write.
		template<typename M>
		void place(const Lib<M>& _l, const std::optional<typename M::Document>& _src, const int _target, const char* _verb,
			const std::string* _name = nullptr)
		{
			const auto dst = _l.at(_target);
			if(!dst || !_src)
				return;
			const auto src = _l.shelf.stored(*_src);
			auto placed = _l.shelf.placed(src, *dst, _target);
			if(_name && _l.shelf.renamed)
			{
				std::string error;
				const auto named = _l.shelf.renamed(placed, *_name, error);
				if(!named)
				{
					_l.r.errors.push_back(error);
					return;
				}
				placed = *named;
			}
			_l.r.note = std::string(_verb) + _l.shelf.title(_name ? placed : src) + " into " + _l.shelf.label(_target);
			_l.put(*dst, std::move(placed));
		}

		template<typename M>
		void paste(const Lib<M>& _l)
		{
			const auto src = _l.shelf.clipped(_l.clip);
			if(!src)
				_l.r.errors.emplace_back(_l.shelf.nothingCopied);
			place(_l, src, _l.slot(), "Pasted ");
		}

		template<typename M>
		void copyTo(const Lib<M>& _l)
		{
			const auto from = _l.integer("from"), to = _l.integer("to");
			if(from == to)
			{
				_l.r.errors.emplace_back("That is the same slot");
				return;
			}
			const auto* name = _l.command.find("name");
			const auto text = name && name->isString() ? name->asString() : std::string();
			place(_l, _l.from(from), to, "Copied ", name && name->isString() ? &text : nullptr);
		}

		template<typename M>
		void clear(const Lib<M>& _l)
		{
			const auto s = _l.slot();
			if(const auto d = _l.at(s))
			{
				_l.r.note = "Cleared " + _l.shelf.label(s) + _l.shelf.clearedNote;
				_l.put(*d, _l.shelf.cleared(*d, s));
			}
		}

		// A stored slot's rename (its dump with the new name). The kit that plays is renamed live with kitName.
		template<typename M>
		void rename(const Lib<M>& _l)
		{
			const auto s = _l.slot();
			if(_l.shelf.plays(_l.context, s))
			{
				_l.r.errors.push_back(_l.shelf.label(s) + " plays: kitRename renames a stored kit; kitName renames the kit that plays");
				return;
			}
			const auto d = _l.at(s);
			if(!d || !_l.shelf.renamed)
				return;
			std::string error;
			const auto named = _l.shelf.renamed(*d, _l.command.find("name")->asString(), error);
			if(!named)
			{
				_l.r.errors.push_back(error);
				return;
			}
			_l.r.note = "Renamed " + _l.shelf.label(s) + " on the machine";
			_l.put(*d, *named);
		}

		// The library ops (the same names on both machines) and the action each runs.
		enum class Action : uint8_t { Copy, Paste, CopyTo, Clear, Rename };
		inline const std::map<std::string, Action>& actions()
		{
			static const std::map<std::string, Action> a{
				{"kitCopy", Action::Copy}, {"kitPaste", Action::Paste}, {"kitCopyTo", Action::CopyTo}, {"kitClear", Action::Clear},
				{"kitRename", Action::Rename}, {"patCopy", Action::Copy}, {"patPaste", Action::Paste}, {"patCopyTo", Action::CopyTo},
				{"patClear", Action::Clear}, {"songCopy", Action::Copy}, {"songPaste", Action::Paste}, {"songCopyTo", Action::CopyTo},
				{"songClear", Action::Clear}, {"songRename", Action::Rename}, {"globalCopy", Action::Copy}, {"globalPaste", Action::Paste}};
			return a;
		}
		inline std::vector<std::string> ops()
		{
			std::vector<std::string> o;
			for(const auto& [op, a] : actions())
				o.push_back(op);
			return o;
		}

		// One library command on the shelf its row's kind names (nullptr: not a library kind).
		template<typename M>
		typename M::EditResult apply(const typename M::Documents& _docs, const elektronData::json::Value& _command, const std::string& _op,
			const Shelf<M>* _shelf, typename M::Clipboard& _clipboard, const typename M::Context& _context)
		{
			typename M::EditResult r;
			const auto it = actions().find(_op);
			if(it == actions().end() || !_shelf)
			{
				r.errors.push_back(std::string("unknown library command ") + _op);
				return r;
			}
			const Lib<M> l{_docs, _command, _clipboard, _context, *_shelf, r};
			switch(it->second)
			{
			case Action::Copy: copy(l); break;
			case Action::Paste: paste(l); break;
			case Action::CopyTo: copyTo(l); break;
			case Action::Clear: clear(l); break;
			case Action::Rename: rename(l); break;
			}
			return r;
		}
	}
}

namespace deskCore
{
	// ---- a track's parts: COPY / PASTE / CLEAR what (the machines' SUPER COPY and SUPER CLEAR, DESIGN-machine-menus.md 2) ----
	// trackCopy {p?, k?, t, what}, trackPaste {p?, k?, to, what}, trackClear {p?, k?, t, what}: the parts of one track
	// that "what" names (the machine's part names), over the whole track: every step of pattern p, and for the parts
	// a kit holds the kit that plays (k). Which parts a machine has, and what each one takes, puts and clears, is the
	// machine's (its Spec: mdDeskEdit.cpp, mmDeskEdit.cpp); naming the parts, the paste targets, what the clipboard
	// holds and the result's note are here, once. One command is one undo step, however many documents it changes.
	namespace trackParts
	{
		using Value = elektronData::json::Value;

		// Where a part lives: the pattern or the kit that plays.
		enum class Home : uint8_t { Pattern, Kit };
		struct Part
		{
			const char* name;	// the command's word (and the page's)
			Home home;
		};
		// A set of a machine's parts: bit i = its part i.
		using Mask = uint32_t;
		constexpr Mask bit(const size_t _i) { return Mask{1} << _i; }

		inline bool touches(const Mask _m, const std::vector<Part>& _parts, const Home _home)
		{
			for(size_t i = 0; i < _parts.size(); ++i)
				if((_m & bit(i)) && _parts[i].home == _home)
					return true;
			return false;
		}

		// The parts' names, in the machine's order.
		inline Value names(const Mask _m, const std::vector<Part>& _parts)
		{
			Value a = Value::array();
			for(size_t i = 0; i < _parts.size(); ++i)
				if(_m & bit(i))
					a.push(_parts[i].name);
			return a;
		}

		// "trigs, accent and locks"
		inline std::string say(const Mask _m, const std::vector<Part>& _parts)
		{
			std::vector<std::string> n;
			for(size_t i = 0; i < _parts.size(); ++i)
				if(_m & bit(i))
					n.emplace_back(_parts[i].name);
			std::string s;
			for(size_t i = 0; i < n.size(); ++i)
				s += (i == 0 ? "" : i + 1 == n.size() ? " and " : ", ") + n[i];
			return s;
		}

		// The command's "what": names of the machine's parts, each once; at least one.
		inline std::optional<Mask> parse(const Value* _what, const std::vector<Part>& _parts, std::vector<std::string>& _errors)
		{
			if(!_what || !_what->isArray() || _what->asArray().empty())
			{
				_errors.push_back("what: name at least one part (" + say(bit(_parts.size()) - 1, _parts) + ")");
				return {};
			}
			Mask m = 0;
			for(const auto& v : _what->asArray())
			{
				size_t i = 0;
				while(i < _parts.size() && !(v.isString() && v.asString() == _parts[i].name))
					++i;
				if(i == _parts.size())
				{
					_errors.push_back("what: " + (v.isString() ? v.asString() : std::string("a non-text value")) + " is not a part of a track ("
						+ say(bit(_parts.size()) - 1, _parts) + ")");
					return {};
				}
				if(m & bit(i))
				{
					_errors.push_back(std::string("what: ") + _parts[i].name + " is named twice");
					return {};
				}
				m |= bit(i);
			}
			return m;
		}

		// A paste's target tracks ("to"): tracks 0 to _tracks - 1, each once, at least one.
		inline std::optional<std::vector<int>> targets(const Value* _to, const int _tracks, std::vector<std::string>& _errors)
		{
			if(!_to || !_to->isArray() || _to->asArray().empty())
			{
				_errors.push_back("to: the tracks to paste into, at least one");
				return {};
			}
			std::vector<int> out;
			for(const auto& v : _to->asArray())
			{
				const auto t = v.isNumber() ? static_cast<int>(v.asNumber()) : -1;
				if(!v.isNumber() || v.asNumber() != t || t < 0 || t >= _tracks)
				{
					_errors.push_back("to: tracks are 0.." + std::to_string(_tracks - 1));
					return {};
				}
				if(std::find(out.begin(), out.end(), t) != out.end())
				{
					_errors.push_back("to: track " + std::to_string(t + 1) + " is named twice");
					return {};
				}
				out.push_back(t);
			}
			return out;
		}

		// What a track copy keeps: the track it came from, the parts copied and their values (the machine's).
		template<typename Values>
		struct Clip
		{
			int t = 0;
			Mask what = 0;
			Values values{};

			bool operator==(const Clip& _o) const { return t == _o.t && what == _o.what && values == _o.values; }
		};

		// A machine's parts and what each one does. Pattern and kit are null when the mask names none of their parts.
		template<typename Pattern, typename Kit, typename Values>
		struct Spec
		{
			const std::vector<Part>& parts;
			int tracks;
			std::string (*trackName)(int);
			// Why track _t cannot take the parts _m (copied from track _from; for a copy or a clear _from is _t): empty
			// when it can.
			std::string (*refuse)(Mask _m, int _from, int _t);
			void (*take)(const Pattern*, const Kit*, int _t, Mask, Values&);
			// Puts the parts _m of _v (copied from track _from) onto track _t; what it had to leave out goes to _skipped.
			void (*put)(Pattern*, Kit*, const Values&, int _from, int _t, Mask, std::vector<std::string>& _skipped);
			void (*clear)(Pattern*, Kit*, int _t, Mask);
		};

		enum class Action : uint8_t { Copy, Paste, Clear };
		inline const std::map<std::string, Action>& actions()
		{
			static const std::map<std::string, Action> a{{"trackCopy", Action::Copy}, {"trackPaste", Action::Paste}, {"trackClear", Action::Clear}};
			return a;
		}
		inline std::vector<std::string> ops()
		{
			std::vector<std::string> o;
			for(const auto& [op, a] : actions())
				o.push_back(op);
			return o;
		}

		inline std::string tracksSay(const std::vector<int>& _ts, std::string (*_name)(int))
		{
			std::string s;
			for(size_t i = 0; i < _ts.size(); ++i)
				s += (i == 0 ? "" : i + 1 == _ts.size() ? " and " : ", ") + _name(_ts[i]);
			return s;
		}

		// One track command on _pattern and _kit (the machine fetched the ones the mask needs: either may be null
		// otherwise), with the clipboard's track part _clip. False, with the errors, when it was refused; nothing
		// changed then.
		template<typename Pattern, typename Kit, typename Values>
		bool run(const Action _action, const Value& _command, const Mask _m, Pattern* _pattern, Kit* _kit, std::optional<Clip<Values>>& _clip,
			const Spec<Pattern, Kit, Values>& _spec, std::vector<std::string>& _errors, std::string& _note)
		{
			const auto* t = _command.find("t");
			const int track = t && t->isNumber() ? static_cast<int>(t->asNumber()) : 0;
			switch(_action)
			{
			case Action::Copy:
			{
				if(const auto why = _spec.refuse(_m, track, track); !why.empty())
				{
					_errors.push_back(why);
					return false;
				}
				Clip<Values> c;
				c.t = track;
				c.what = _m;
				_spec.take(_pattern, _kit, track, _m, c.values);
				_clip = std::move(c);
				_note = "Copied the " + say(_m, _spec.parts) + " of " + _spec.trackName(track);
				return true;
			}
			case Action::Paste:
			{
				const auto to = targets(_command.find("to"), _spec.tracks, _errors);
				if(!to)
					return false;
				if(!_clip)
				{
					_errors.emplace_back("Copy a track's parts first (COPY what)");
					return false;
				}
				if(const auto missing = _m & ~_clip->what)
				{
					_errors.push_back("Not copied from " + _spec.trackName(_clip->t) + ": " + say(missing, _spec.parts));
					return false;
				}
				for(const auto x : *to)
					if(const auto why = _spec.refuse(_m, _clip->t, x); !why.empty())
					{
						_errors.push_back(why);
						return false;
					}
				std::vector<std::string> skipped;
				for(const auto x : *to)
					_spec.put(_pattern, _kit, _clip->values, _clip->t, x, _m, skipped);
				_note = "Pasted the " + say(_m, _spec.parts) + " of " + _spec.trackName(_clip->t) + " into " + tracksSay(*to, _spec.trackName);
				for(const auto& s : skipped)
					_note += ". " + s;
				return true;
			}
			case Action::Clear:
				if(const auto why = _spec.refuse(_m, track, track); !why.empty())
				{
					_errors.push_back(why);
					return false;
				}
				_spec.clear(_pattern, _kit, track, _m);
				_note = "Cleared the " + say(_m, _spec.parts) + " of " + _spec.trackName(track);
				return true;
			}
			return false;
		}
	}
}
