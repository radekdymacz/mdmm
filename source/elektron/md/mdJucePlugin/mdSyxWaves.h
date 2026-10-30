#pragma once

#include "mmDesk/mmDeskAdapter.h"

#include "deskCore/deskPacer.h"

#include "elektronData/json.h"
#include "elektronData/mdSamples.h"
#include "elektronData/mmWave.h"
#include "elektronData/syxImport.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <deque>
#include <functional>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

namespace mdJucePlugin
{
	// The DigiPRO manager's session side (0.9 wave 2, doc/release/0.9/mm-digipro.md 5): what the GLOBAL page's DigiPRO
	// card shows and does, as the SysEx work of a session (SyxWork runs it; the plug-in and the page tier's stub host
	// both). The waveforms are no documents of the core: the machine holds them, the manager reads them (0x5E, one at a
	// time, as the export does), sends them (the adapter's sendWaves: DIGIPRO MGR > RECEIVE > ORG), erases them (the
	// panel's ERASE) and reads the positions it touched again, so the card shows what the machine holds. Its own undo
	// list keeps each touched position's dump (or "factory") before a change.
	//
	// Page commands (deskHost rows): waveList {again}, waveLoad, waveRename {wave, name}, waveCopy {from, to}, waveErase
	// {wave | all}, waveUndo, waveSendNow. The file of a Load comes from the window (chooseWave {wave}) through open*.
	// Messages: waveList (the 64 positions and the news), waveFile (an open file's preview).
	class SyxWaves
	{
	public:
		using Bytes = std::vector<uint8_t>;
		using Value = elektronData::json::Value;
		using ToPage = std::function<void(const Value&)>;
		using Reply = std::function<void(const Value& _message, bool _ok, const std::string& _note)>;
		using Adapter = mmDesk::MmAdapter;

		static constexpr size_t g_undoSteps = 16;
		static constexpr size_t g_points = 128;		// a waveform's drawing on the card
		// B-195: the read-back of a position a job has just sent a waveform to waits this long for its answer (the
		// emulator's time; the cable's dump time is added over HW MIDI). The firmware answers a 0x5E later the more
		// waveform records its flash holds (it looks the position up through them): from the 14th record on, measured,
		// later than the 700 ms a list read waits for a position that may be factory, and the new waveform read as
		// factory. A position that must hold a user waveform gets the long wait; one that may be factory keeps the short
		// one, and an answer that comes later still updates the card.
		static constexpr double g_writtenAnswerMs = 15000.0;

		// ---- the page's commands; false: not one of them
		bool handle(Adapter& _machine, const Value& _message, const Reply& _reply, const ToPage& _toPage, const std::string& _busy)
		{
			const auto op = opOf(_message);
			if(op.rfind("wave", 0) != 0 || op == "waveFile")
				return false;
			if(!_busy.empty() && op != "waveList")
			{
				_reply(_message, false, _busy);
				return true;
			}
			std::string why;
			if(op == "waveList")
			{
				const auto* again = _message.find("again");
				if(!reading() && (!m_listed || (again && again->isBool() && again->asBool())))
				{
					m_listed = true;
					readAll();
					m_text = "Reading the waveforms from the machine.";
				}
			}
			else if(op == "waveSendNow")
				why = _machine.wavesSendNow();
			else if(op == "waveUndo")
				why = undo(_machine);
			else if(working() || reading())
				why = "The waveforms are still being sent or read: try again in a moment.";
			else if(op == "waveLoad")
				why = load(_machine);
			else if(op == "waveRename")
				why = rename(_machine, intOf(_message, "wave"), stringOf(_message, "name"));
			else if(op == "waveCopy")
				why = copy(_machine, intOf(_message, "from"), intOf(_message, "to"));
			else if(op == "waveErase")
			{
				const auto* all = _message.find("all");
				why = erase(_machine, all && all->isBool() && all->asBool() ? -1 : intOf(_message, "wave"));
			}
			else
				return false;
			_reply(_message, why.empty(), why);
			if(!why.empty())
				m_text = why;
			_toPage(list(_machine));
			return true;
		}

		// ---- a Load's file (the window read it): its preview, kept for waveLoad
		// A .syx (it starts with F0) or a WAV / AIFF of one cycle, its channels mixed.
		Value openFile(const Bytes& _bytes, const std::string& _fileName, const int _wave)
		{
			if(!_bytes.empty() && _bytes.front() == 0xf0)
				return openSyx(_bytes, _fileName, _wave);
			std::string why;
			const auto clip = elektronData::decodeAudioFile(_bytes, why);
			if(!clip || clip->channels.empty() || !clip->frames())
				return refusedFile(_fileName, why.empty() ? "The file is no .syx, WAV or AIFF the editor can read." : why);
			std::vector<float> mono(clip->frames(), 0.f);
			for(const auto& c : clip->channels)
				for(size_t i = 0; i < mono.size() && i < c.size(); ++i)
					mono[i] += c[i] / static_cast<float>(clip->channels.size());
			return openAudio(mono, _fileName, _wave);
		}
		// A .syx: its waveform dumps, placed from _wave on in file order.
		Value openSyx(const Bytes& _bytes, const std::string& _fileName, const int _wave)
		{
			std::vector<elektronData::MmWave> waves;
			size_t other = 0, broken = 0;
			for(const auto& m : split(_bytes))
			{
				if(m.size() > 6 && m[6] == elektronData::g_mmWaveDump)
				{
					if(auto w = elektronData::decodeMmWave(m))
						waves.push_back(std::move(*w));
					else
						++broken;
				}
				else
					++other;
			}
			std::string note;
			if(broken)
				note += " " + std::to_string(broken) + (broken == 1 ? " waveform dump is" : " waveform dumps are") + " damaged and left out.";
			if(other)
				note += " " + std::to_string(other) + (other == 1 ? " other message is" : " other messages are") + " left out (Import SysEx… takes those).";
			return openWaves(std::move(waves), _fileName, _wave, note);
		}

		// One cycle of audio (a WAV or AIFF the window decoded, mixed to mono), named from _name.
		Value openAudio(const std::vector<float>& _cycle, const std::string& _fileName, const int _wave)
		{
			std::string why;
			auto w = elektronData::mmWaveFromCycle(_cycle, static_cast<uint8_t>(std::clamp(_wave, 0, 63)), nameFrom(_fileName), why);
			if(!w)
				return refusedFile(_fileName, why);
			return openWaves({std::move(*w)}, _fileName, _wave, {});
		}

		Value refusedFile(const std::string& _fileName, const std::string& _why)
		{
			m_file.clear();
			Value m = Value::object();
			m.set("type", "waveFile");
			m.set("ok", false);
			m.set("file", _fileName);
			m.set("text", _why);
			m.set("waves", Value::array());
			return m;
		}

		// ---- the session's step: the reads, and the read-back once the machine's job ended
		void step(Adapter& _machine, const double _nowMs, const bool _wire, const ToPage& _toPage)
		{
			// B-195: a position answered after its read had moved on: the card shows it now
			bool changed = m_late;
			m_late = false;
			if(m_waiting)
			{
				const auto w = _machine.waveWork();
				if(w.waitsFor != m_waitsFor)
				{
					m_waitsFor = w.waitsFor;
					changed = true;
				}
				if(w.queued == 0 && !w.busy)
				{
					m_waiting = false;
					changed = true;
					if(w.gaveUp != m_gaveUpBase)
						m_text = "The Monomachine did not open GLOBAL > FILE > DIGIPRO MGR, so not everything was done. Showing what it holds.";
					if(_wire)
					{
						for(const auto p : m_touched)
							m_slots[p].reset();
						m_text = "Sent. Press [EXIT/NO] on the Monomachine to write the waveforms, then Read.";
					}
					else
						for(const auto p : m_touched)
							m_reads.push_back(p);
					m_touched.clear();
				}
			}
			if(!m_waiting && !m_reads.empty())
				changed = readStep(_machine, _nowMs, _wire) || changed;
			if(changed && (_nowMs - m_newsMs > 250 || (!working() && !reading())))
			{
				m_newsMs = _nowMs;
				if(!working() && !reading() && m_text.rfind("Reading", 0) == 0)
					m_text = "Done.";
				_toPage(list(_machine));
			}
		}

		// A message from the machine: the dump of the position being read, or one the person sent from the machine's
		// own SEND (taken as what that position holds).
		void onMachineSysex(const Bytes& _message)
		{
			const auto p = elektronData::mmWaveDumpSlot(_message);
			if(p < 0 || !elektronData::decodeMmWave(_message))
				return;
			m_slots[static_cast<size_t>(p)] = Slot{true, _message};
			if(!m_reads.empty() && m_reads.front() == p)
				m_answered = true;
			else
				m_late = true;
		}

		bool running() const { return reading() || working() || m_late; }
		// An import or an export uses the machine: the position being read is asked again when the reads go on.
		void pause()
		{
			m_asked = false;
			m_answered = false;
		}
		bool reading() const { return !m_reads.empty(); }
		bool working() const { return m_waiting; }

		// The card's message: the 64 positions as the editor knows them, the undo steps, the news.
		Value list(const Adapter& _machine) const
		{
			Value m = Value::object();
			m.set("type", "waveList");
			m.set("ok", true);
			m.set("running", running());
			m.set("total", static_cast<int>(m_readTotal));
			m.set("done", static_cast<int>(m_readTotal - std::min(m_readTotal, m_reads.size())));
			m.set("undo", static_cast<int>(m_undo.size()));
			m.set("waitsFor", _machine.waveWork().waitsFor);
			m.set("text", m_text);
			Value waves = Value::array();
			for(size_t p = 0; p < m_slots.size(); ++p)
			{
				Value w = Value::object();
				w.set("wave", static_cast<int>(p));
				const auto& s = m_slots[p];
				w.set("known", s.has_value());
				w.set("user", s && s->user);
				std::string name;
				Value points = Value::array();
				if(s && s->user)
					if(const auto d = elektronData::decodeMmWave(s->dump))
					{
						name = elektronData::mmWaveName(*d);
						for(const auto v : elektronData::mmWavePoints(*d, g_points))
							points.push(static_cast<int>(std::lround(std::clamp(v, -1.0, 1.0) * 127.0)));
					}
				w.set("name", name);
				w.set("points", std::move(points));
				waves.push(std::move(w));
			}
			m.set("waves", std::move(waves));
			return m;
		}

		// what the editor knows of a position: a user waveform's dump; nothing for factory or not read
		const Bytes* dumpOf(const int _wave) const
		{
			if(_wave < 0 || _wave > 63 || !m_slots[static_cast<size_t>(_wave)] || !m_slots[static_cast<size_t>(_wave)]->user)
				return nullptr;
			return &m_slots[static_cast<size_t>(_wave)]->dump;
		}

	private:
		struct Slot
		{
			bool user = false;		// false: the factory waveform (the position answers no 0x5E)
			Bytes dump;
		};
		// A change taken back by Undo: each position it touched, as it was (a dump, or nothing for factory).
		using Step = std::vector<std::pair<uint8_t, std::optional<Bytes>>>;

		static std::string opOf(const Value& _m)
		{
			const auto* op = _m.find("op");
			return op && op->isString() ? op->asString() : std::string();
		}
		static int intOf(const Value& _m, const char* _key)
		{
			const auto* v = _m.find(_key);
			return v && v->isNumber() ? static_cast<int>(v->asNumber()) : -1;
		}
		static std::string stringOf(const Value& _m, const char* _key)
		{
			const auto* v = _m.find(_key);
			return v && v->isString() ? v->asString() : std::string();
		}
		static std::string label(const int _wave)
		{
			char t[8];
			std::snprintf(t, sizeof(t), "W%02d", _wave + 1);
			return t;
		}
		static std::vector<Bytes> split(const Bytes& _bytes)
		{
			std::vector<Bytes> out;
			for(size_t i = 0; i < _bytes.size(); ++i)
			{
				if(_bytes[i] != 0xf0)
					continue;
				const auto end = std::find(_bytes.begin() + static_cast<std::ptrdiff_t>(i), _bytes.end(), uint8_t{0xf7});
				if(end == _bytes.end())
					break;
				out.emplace_back(_bytes.begin() + static_cast<std::ptrdiff_t>(i), end + 1);
				i = static_cast<size_t>(end - _bytes.begin());
			}
			return out;
		}
		// four characters of the file's name a waveform can carry ("Saw 1.wav" -> "SAW1")
		static std::string nameFrom(const std::string& _fileName)
		{
			std::string n;
			for(const auto c : _fileName.substr(0, _fileName.find_last_of('.')))
			{
				if(n.size() == elektronData::g_mmWaveNameSize)
					break;
				const std::string one(1, c);
				if(c != ' ' && elektronData::mmWaveNameProblem(one).empty())
					n += c >= 'a' && c <= 'z' ? static_cast<char>(c - 'a' + 'A') : c;
			}
			return n;
		}

		Value openWaves(std::vector<elektronData::MmWave> _waves, const std::string& _fileName, const int _wave, const std::string& _note)
		{
			m_file.clear();
			Value m = Value::object();
			m.set("type", "waveFile");
			m.set("file", _fileName);
			if(_wave < 0 || _wave > 63)
				return refusedFile(_fileName, "Choose the position the waveforms go to first.");
			if(_waves.empty())
				return refusedFile(_fileName, "No DigiPRO waveform in this file." + _note);
			Value items = Value::array();
			size_t left = 0;
			for(size_t i = 0; i < _waves.size(); ++i)
			{
				const int to = _wave + static_cast<int>(i);
				if(to > 63)
				{
					++left;
					continue;
				}
				auto& w = _waves[i];
				w.position = static_cast<uint8_t>(to);
				m_file.push_back(elektronData::encodeMmWave(w));
				Value it = Value::object();
				it.set("wave", to);
				it.set("name", elektronData::mmWaveName(w));
				const auto* was = dumpOf(to);
				std::string replaces;
				if(was)
					if(const auto d = elektronData::decodeMmWave(*was))
						replaces = elektronData::mmWaveName(*d).empty() ? label(to) : elektronData::mmWaveName(*d);
				it.set("replaces", replaces);
				items.push(std::move(it));
			}
			std::string text = std::to_string(m_file.size()) + (m_file.size() == 1 ? " waveform" : " waveforms") + " from " + _fileName + " into "
				+ label(_wave) + (m_file.size() > 1 ? " to " + label(_wave + static_cast<int>(m_file.size()) - 1) : std::string()) + ".";
			if(left)
				text += " " + std::to_string(left) + " more would go past W64 and are left out.";
			m.set("ok", true);
			m.set("text", text + _note);
			m.set("waves", std::move(items));
			return m;
		}

		void readAll()
		{
			m_reads.clear();
			for(uint8_t p = 0; p < elektronData::g_mmWaveSlots; ++p)
				m_reads.push_back(p);
			m_readTotal = m_reads.size();
			m_asked = false;
		}

		// One read: ask for the next position, or wait for its answer until the time is out (a factory one answers
		// nothing). True when it moved on.
		bool readStep(Adapter& _machine, const double _nowMs, const bool _wire)
		{
			if(m_readTotal < m_reads.size())
				m_readTotal = m_reads.size();
			const auto p = m_reads.front();
			if(m_answered)
				return nextRead();
			if(!m_asked)
			{
				if(!_machine.sendAsIs(elektronData::mmWaveRequest(p), false).empty())
				{
					m_slots[p].reset();
					return nextRead();
				}
				m_asked = true;
				m_askedMs = _nowMs;
				return false;
			}
			if(_machine.asIs().busy)
			{
				m_askedMs = _nowMs;	// the request still waits in the stream: its clock starts when it goes
				return false;
			}
			// as the export's reads (SyxWaveRead): the emulator answers within a few blocks; a 7 KB dump takes about
			// 2.3 s on a MIDI cable
			const double timeout = (m_expectUser.count(p) ? g_writtenAnswerMs : 700.0) + (_wire ? 800.0 + 2.0 * deskCore::DinPacer::wireMs(7100) : 0.0);
			if(_nowMs - m_askedMs <= timeout)
				return false;
			m_slots[p] = Slot{false, {}};
			return nextRead();
		}
		bool nextRead()
		{
			m_expectUser.erase(m_reads.front());
			m_reads.pop_front();
			m_asked = false;
			m_answered = false;
			if(m_reads.empty())
				m_readTotal = 0;
			return true;
		}

		// ---- the changes

		std::string knownFirst(const int _wave) const
		{
			if(_wave < 0 || _wave > 63)
				return "There is no such waveform.";
			if(!m_slots[static_cast<size_t>(_wave)])
				return "The editor has not read " + label(_wave) + " from the machine yet: press Read.";
			return {};
		}

		std::optional<Bytes> before(const int _wave) const
		{
			if(const auto* d = dumpOf(_wave))
				return *d;
			return std::nullopt;
		}

		void remember(Step _step)
		{
			m_undo.push_back(std::move(_step));
			while(m_undo.size() > g_undoSteps)
				m_undo.erase(m_undo.begin());
		}

		std::string sent(Adapter& _machine, const std::vector<Bytes>& _dumps, const std::vector<uint8_t>& _touched)
		{
			if(auto why = _machine.sendWaves(_dumps); !why.empty())
				return why;
			started(_machine, _touched);
			for(const auto& d : _dumps)
				if(d.size() > 9)
					m_expectUser.insert(d[9]);
			return {};
		}

		void started(const Adapter& _machine, const std::vector<uint8_t>& _touched)
		{
			m_waiting = true;
			m_gaveUpBase = _machine.waveWork().gaveUp;
			m_touched.insert(_touched.begin(), _touched.end());
		}

		std::string load(Adapter& _machine)
		{
			if(m_file.empty())
				return "Choose a file with Load… first.";
			Step step;
			std::vector<uint8_t> touched;
			for(const auto& d : m_file)
			{
				const auto p = d[9];
				if(auto why = knownFirst(p); !why.empty())
					return why;
				step.emplace_back(p, before(p));
				touched.push_back(p);
			}
			if(auto why = sent(_machine, m_file, touched); !why.empty())
				return why;
			remember(std::move(step));
			m_text = "Sending " + std::to_string(m_file.size()) + (m_file.size() == 1 ? " waveform" : " waveforms") + " to the machine.";
			m_file.clear();
			return {};
		}

		std::string rename(Adapter& _machine, const int _wave, const std::string& _name)
		{
			if(auto why = knownFirst(_wave); !why.empty())
				return why;
			const auto* d = dumpOf(_wave);
			if(!d)
				return label(_wave) + " holds a factory waveform: the machine renames user waveforms only.";
			if(auto why = elektronData::mmWaveNameProblem(_name); !why.empty())
				return why;
			auto w = elektronData::decodeMmWave(*d);
			if(!w)
				return "The editor cannot read " + label(_wave) + "'s dump.";
			elektronData::setMmWaveName(*w, _name);
			Step step{{static_cast<uint8_t>(_wave), *d}};
			if(auto why = sent(_machine, {elektronData::encodeMmWave(*w)}, {static_cast<uint8_t>(_wave)}); !why.empty())
				return why;
			remember(std::move(step));
			m_text = "Renaming " + label(_wave) + ".";
			return {};
		}

		std::string copy(Adapter& _machine, const int _from, const int _to)
		{
			if(auto why = knownFirst(_from); !why.empty())
				return why;
			if(auto why = knownFirst(_to); !why.empty())
				return why;
			const auto* d = dumpOf(_from);
			if(!d)
				return label(_from) + " holds a factory waveform: the machine sends user waveforms only.";
			if(_from == _to)
				return "That is the same position.";
			Step step{{static_cast<uint8_t>(_to), before(_to)}};
			if(auto why = sent(_machine, {elektronData::mmWavePlaced(*d, static_cast<uint8_t>(_to))}, {static_cast<uint8_t>(_to)}); !why.empty())
				return why;
			remember(std::move(step));
			m_text = "Copying " + label(_from) + " to " + label(_to) + ".";
			return {};
		}

		std::string erase(Adapter& _machine, const int _wave)
		{
			Step step;
			std::vector<uint8_t> touched;
			if(_wave < 0)
			{
				for(uint8_t p = 0; p < elektronData::g_mmWaveSlots; ++p)
				{
					if(!m_slots[p])
						return "The editor has not read every waveform from the machine yet: press Read.";
					if(m_slots[p]->user)
					{
						step.emplace_back(p, m_slots[p]->dump);
						touched.push_back(p);
					}
				}
				if(step.empty())
					return "The machine holds no user waveform: nothing to erase.";
			}
			else
			{
				if(auto why = knownFirst(_wave); !why.empty())
					return why;
				if(!dumpOf(_wave))
					return label(_wave) + " holds a factory waveform: nothing to erase.";
				step.emplace_back(static_cast<uint8_t>(_wave), *dumpOf(_wave));
				touched.push_back(static_cast<uint8_t>(_wave));
			}
			if(auto why = _machine.eraseWave(_wave); !why.empty())
				return why;
			started(_machine, touched);
			for(const auto t : touched)
				m_expectUser.erase(t);
			remember(std::move(step));
			m_text = _wave < 0 ? "Erasing every user waveform." : "Erasing " + label(_wave) + ".";
			return {};
		}

		// The last change taken back: each position as it was, a dump sent again or the position erased (it was factory).
		std::string undo(Adapter& _machine)
		{
			if(m_undo.empty())
				return "Nothing to undo on the waveforms.";
			if(working() || reading())
				return "The waveforms are still being sent or read: try again in a moment.";
			const auto step = m_undo.back();
			std::vector<Bytes> dumps;
			std::vector<uint8_t> touched;
			for(const auto& [p, d] : step)
			{
				touched.push_back(p);
				if(d)
					dumps.push_back(*d);
			}
			// the erases first: over HW MIDI the editor cannot erase, and then nothing of the step goes
			for(const auto& [p, d] : step)
				if(!d)
					if(auto why = _machine.eraseWave(p); !why.empty())
						return why;
			if(!dumps.empty())
				if(auto why = _machine.sendWaves(dumps); !why.empty())
					return why;
			started(_machine, touched);
			for(const auto& [p, d] : step)
			{
				if(d)
					m_expectUser.insert(p);
				else
					m_expectUser.erase(p);
			}
			m_undo.pop_back();
			m_text = "Undo: " + std::to_string(step.size()) + (step.size() == 1 ? " waveform" : " waveforms") + " back as they were.";
			return {};
		}

		std::array<std::optional<Slot>, elektronData::g_mmWaveSlots> m_slots{};
		std::deque<uint8_t> m_reads;		// positions still to read, in order
		size_t m_readTotal = 0;
		bool m_listed = false;				// the whole list was asked for once
		bool m_asked = false, m_answered = false;
		double m_askedMs = 0;
		std::vector<Bytes> m_file;			// the open file's dumps, placed
		std::vector<Step> m_undo;
		bool m_waiting = false;				// a job of the adapter's runs
		uint32_t m_gaveUpBase = 0;
		std::set<uint8_t> m_touched;		// read again once it ends
		std::set<uint8_t> m_expectUser;		// B-195: of those, the positions sent a waveform: their read-back waits longer
		bool m_late = false;				// B-195: a position answered after its read moved on (the card is told)
		std::string m_waitsFor;
		std::string m_text;
		double m_newsMs = -1e9;
	};
}
