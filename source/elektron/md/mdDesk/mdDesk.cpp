#include "mdDesk.h"

#include "mdDeskMachine.h"

#include "elektronData/mdNames.h"
#include "elektronData/mdValidate.h"

#include <array>
#include <cmath>
#include <cstdio>
#include <map>

namespace mdDesk
{
	using Value = elektronData::json::Value;

	Desk::Desk(Port _port, const Profile& _profile) : Desk(defaultAdapter(_profile, _port.device), _port)
	{
	}

	Desk::Desk(std::unique_ptr<MdAdapter> _adapter, Port _port)
		: deskCore::Desk<MdModel, MdAdapter>(std::move(_adapter), _port.toPage, _port.device.nowMs, _port.ready)
		, m_saveSetup(std::move(_port.saveSetup))
	{
	}

	namespace
	{
		const MdMachine* mdMachineOf(const MdAdapter& _a) { return dynamic_cast<const MdMachine*>(&_a); }
	}

	const mdDataLink::Session::State& Desk::linkState() const
	{
		static const mdDataLink::Session::State none;
		const auto* m = mdMachineOf(machine());
		return m ? m->linkState() : none;
	}

	bool Desk::isReady() const
	{
		const auto* m = mdMachineOf(machine());
		return m ? m->replied() : deskCore::takesMidi(lifecycle());
	}

	double Desk::lastRoundTripMs() const
	{
		const auto* m = mdMachineOf(machine());
		return m ? m->lastRoundTripMs() : -1;
	}

	std::unique_ptr<MdAdapter> Desk::defaultAdapter(const Profile& _profile, const DevicePort& _device)
	{
		return std::make_unique<MdMachine>(_profile, _device);
	}

	// ---- the editor's setup: the app modulators and the knob rows ----

	// The table's Owner::Setup rows, one function each.
	const std::map<std::string, void (Desk::*)(const Value&)>& Desk::setups()
	{
		static const std::map<std::string, void (Desk::*)(const Value&)> map{
			{"modSet", &Desk::setModulators}, {"knobs", &Desk::setKnobs}, {"soloSet", &Desk::setSolo}, {"followSet", &Desk::setFollow},
			{"sampleName", &Desk::renameSample}, {"sampleCopy", &Desk::copySample}, {"samplePaste", &Desk::pasteSample},
			{"ramToRom", &Desk::ramToRom}, {"sampleUndo", &Desk::undoSample}, {"sampleWave", &Desk::sampleWave}, {"audition", &Desk::audition}, {"auditionStop", &Desk::auditionStop}};
		return map;
	}

	std::vector<std::string> Desk::setupOps()
	{
		std::vector<std::string> ops;
		for(const auto& [op, f] : setups())
			ops.push_back(op);
		return ops;
	}

	void Desk::onSetup(const Value& _message)
	{
		const auto it = setups().find(deskCore::opOf(_message));
		if(it == setups().end())
			result(_message, {"no such setup"}, {});
		else
			(this->*(it->second))(_message);
		publishSampleHistory(false);
	}

	// App-only LFO and random sources (deskMod.h): the page sends the whole setup.
	void Desk::setModulators(const Value& _message)
	{
		std::vector<std::string> errors;
		if(const auto setup = modSetupFromJson(*_message.find("doc"), errors, g_mdModLimits))
		{
			m_mods.setSetup(*setup);
			m_setup.modulators = *setup;
			saveSetup();
		}
		result(_message, errors, {});
		publishModulators();
	}

	// The Control workspace's knob rows: which CC each row is.
	void Desk::setKnobs(const Value& _message)
	{
		std::vector<int> ccs;
		for(const auto& v : _message.find("ccs")->asArray())
			ccs.push_back(v.isNumber() ? static_cast<int>(v.asNumber()) : -1);
		auto errors = validateKnobCcs(ccs);
		if(errors.empty())
		{
			// one intent, one command: the knob row's any-channel mappings follow its CC (the learned ones stay learned)
			std::vector<uint8_t> from, to;
			for(size_t i = 0; i < m_setup.knobCcs.size() && i < ccs.size(); ++i)
			{
				from.push_back(m_setup.knobCcs[i]);
				to.push_back(static_cast<uint8_t>(ccs[i]));
				m_setup.knobCcs[i] = static_cast<uint8_t>(ccs[i]);
			}
			m_setup.mappings = deskCore::moveKnobCcs(m_setup.mappings, from, to);
			saveSetup();
		}
		result(_message, errors, {});
		publishSetup();
	}

	// The page's solo and the mutes the person had before it: kept with the project (B-123). Not echoed: the page
	// knows what it sent; publishSolo says it again when a project is opened, after a reset and when the page is made.
	void Desk::setSolo(const Value& _message)
	{
		std::vector<std::string> errors;
		if(const auto solo = deskCore::solo::fromJson(_message.find("tracks"), _message.find("mutes"), 16, errors, "$"))
		{
			if(m_setup.solo != *solo)
			{
				m_setup.solo = *solo;
				saveSetup();
			}
		}
		result(_message, errors, {});
	}

	// I-003: follow the last played track. Not echoed (the page knows what it sent); the setup message says it again.
	void Desk::setFollow(const Value& _message)
	{
		const auto* on = _message.find("on");
		const bool follow = on && on->isBool() && on->asBool();
		if(m_setup.followPlayed != follow)
		{
			m_setup.followPlayed = follow;
			saveSetup();
		}
		result(_message, {}, {});
	}

	void Desk::publishSolo()
	{
		publish(deskCore::solo::message(m_setup.solo));
	}

	void Desk::onReadyExtra()
	{
		publishSetup();
		publishSolo();
		publishModulators();
		publishSamples();
		publishSampleLoad(true);
		publishSampleHistory(true);
		if(m_audition)
			publishAudition(true);
	}

	// ---- P9: UW samples ----

	void Desk::tick()
	{
		deskCore::Desk<MdModel, MdAdapter>::tick();
		publishSampleLoad();
		pollAudition();
		flush();
	}

	void Desk::onDeviceSysex(const Bytes& _message)
	{
		deskCore::Desk<MdModel, MdAdapter>::onDeviceSysex(_message);
		if(m_sampleLoad)
		{
			publishSampleLoad();
			flush();
		}
	}

	// The page dropped the samples with every other document; they are the machine's, read again.
	void Desk::onStartOver()
	{
		m_samples.reset();
		m_sampleSteps.clear();	// the memory is read anew: what a step would put back may not be what was there
		publishSetup();	// I-003: the follow option is in it
		publishSolo();	// the page dropped its solo with the rest: the project's is said again
	}

	void Desk::onSampleBank(const elektronData::MdSampleBank& _bank)
	{
		if(m_samples && *m_samples == _bank)
			return;
		m_samples = _bank;
		publishSamples();
		flush();
	}

	void Desk::publishSamples()
	{
		if(!m_samples)
			return;
		Value m = Value::object();
		m.set("type", "samples");
		m.set("doc", elektronData::mdSampleBankToJson(*m_samples));
		publish(m);
	}

	// The slot a sampleWave or audition names, or why there is none to read.
	const elektronData::MdSampleSlot* Desk::sampleSlotOf(const Value& _message, std::string& _why) const
	{
		const auto caps = machine().capabilities();
		if(!caps.has("sampleAudio"))
		{
			_why = caps.reason("sampleAudio");
			return nullptr;
		}
		if(!m_samples)
		{
			_why = "The samples are not read yet.";
			return nullptr;
		}
		const bool ram = _message.find("bank")->asString() == "ram";
		const auto slot = static_cast<size_t>(_message.find("slot")->asNumber());
		const auto& list = ram ? m_samples->ram : m_samples->rom;
		if(slot >= list.size())
		{
			_why = ram ? "There are four RAM slots (0-3)." : "There are 48 ROM slots (0-47).";
			return nullptr;
		}
		if(ram && !m_samples->ramReadable)
		{
			_why = m_samples->ramReason;
			return nullptr;
		}
		return &list[slot];
	}

	void Desk::sampleWave(const Value& _message)
	{
		std::string why;
		const auto* s = sampleSlotOf(_message, why);
		if(s)
			publish(elektronData::mdSampleWaveMessage(*s, static_cast<size_t>(_message.find("bins")->asNumber())));
		result(_message, s ? std::vector<std::string>{} : std::vector<std::string>{why}, {});
	}

	void Desk::audition(const Value& _message)
	{
		std::string why;
		const auto* s = sampleSlotOf(_message, why);
		if(s && (s->empty || !s->pcm || s->pcm->empty() || !s->rate))
		{
			why = "The slot is empty.";
			s = nullptr;
		}
		uint64_t id = 0;
		if(s && !(id = machine().audition({s->pcm, s->rate})))
			why = "This engine cannot play a sample.";
		if(!id)
		{
			result(_message, {why}, {});
			return;
		}
		m_audition = Audition{s->ram, s->slot, s->length, s->rate, id};
		publishAudition(true);
		result(_message, {}, {});
	}

	void Desk::auditionStop(const Value& _message)
	{
		machine().audition({});
		if(m_audition)
			publishAudition(false);
		m_audition.reset();
		result(_message, {}, {});
	}

	// Event-driven: a message when it starts and one when it stops, never per frame (the page moves
	// its playhead from the rate itself).
	void Desk::pollAudition()
	{
		if(!m_audition)
			return;
		const auto st = machine().auditionStatus();
		if(st.id == m_audition->id && st.playing)
			return;
		publishAudition(false);
		m_audition.reset();
	}

	void Desk::publishAudition(const bool _playing)
	{
		const auto& a = *m_audition;
		Value m = Value::object();
		m.set("type", "audition");
		m.set("state", _playing ? "playing" : "stopped");
		m.set("bank", a.ram ? "ram" : "rom");
		m.set("slot", static_cast<int>(a.slot));
		m.set("length", a.length);
		m.set("rate", a.rate);
		publish(m);
	}

	namespace
	{
		std::string romLabel(const uint8_t _slot)
		{
			char t[16];
			std::snprintf(t, sizeof(t), "ROM-%02d", _slot + 1);
			return t;
		}
	}

	// B-128: the firmware takes 0x73 only as the name of the NEXT sample received and renames no slot. So Rename sends the
	// name, then the slot's own sample again by SDS into the same slot (the samples as the bank read them from memory, so
	// the audio stays as it was; only the name changes). A machine whose audio cannot be read back (a real one ignores SDS
	// dump requests) is refused with that reason: the name alone would change nothing.
	void Desk::renameSample(const Value& _message)
	{
		namespace ed = elektronData;
		const auto refuse = [&](const std::string& _why) { result(_message, {_why}, {}); };
		const auto slot = static_cast<uint8_t>(_message.find("slot")->asNumber());
		const auto* name = _message.find("name");
		if(!name || !name->isString() || ed::mdSetSampleName(slot, name->asString()).empty())
			return refuse("A sample name is 1-4 letters (A-Z, 0-9, space, punctuation) for ROM slot 1-48");
		if(!isInputReady())
			return refuse(MdModel::lifecycleText(lifecycle()));
		if(!m_samples)
			return refuse("Rename needs the slot's audio, and this machine cannot send it back over MIDI (it ignores SDS dump requests): "
				"the Machinedrum renames a sample only when it receives the sample again. Rename it in SAMPLE MGR on the machine, "
				"or load the file again with Load sample.");
		const auto& s = m_samples->rom[slot];
		if(s.empty || !s.pcm || s.pcm->empty() || !s.rate)
			return refuse("ROM-" + std::to_string(slot + 1) + " holds no sample: there is nothing to name.");
		ed::MdSampleUpload upload;
		upload.samples = *s.pcm;
		upload.rate = s.rate;
		upload.name = name->asString();
		if(s.loop)
			upload.notes.push_back("The slot's loop points are not sent again.");
		if(const auto why = machine().sendSample(slot, upload); !why.empty())
			return refuse(why);
		SampleLoad l;
		l.slot = slot;
		l.file = "Rename";
		l.name = upload.name;
		l.rate = upload.rate;
		l.length = static_cast<uint32_t>(upload.samples.size());
		l.notes = upload.notes;
		l.notes.insert(l.notes.begin(), "Rename sends the name, then the slot's own sample again: the machine renames a sample only when it receives it.");
		l.step = sampleStepOf(slot, "Rename " + romLabel(slot));
		m_sampleLoad = std::move(l);
		publishSampleLoad(true);
		result(_message, {}, {});
	}

	// ---- 0.9: the sample manager (doc/release/0.9/md-sample-manager.md) ----

	uint32_t Desk::sampleRoom(const uint8_t _slot) const
	{
		namespace ed = elektronData;
		constexpr uint32_t reserve = 4 * 44100;
		uint32_t others = 0;
		if(m_samples)
			for(const auto& s : m_samples->rom)
				if(s.slot != _slot)
					others += s.length;
		return ed::g_mdSampleCapacity > others + reserve ? ed::g_mdSampleCapacity - others - reserve : 0;
	}

	std::optional<Desk::SampleStep> Desk::sampleStepOf(const uint8_t _slot, const std::string& _what) const
	{
		if(!m_samples || _slot >= m_samples->rom.size())
			return std::nullopt;
		const auto& s = m_samples->rom[_slot];
		if(s.empty || !s.pcm || s.pcm->empty() || !s.rate)
			return std::nullopt;
		SampleStep step;
		step.slot = _slot;
		step.what = _what;
		step.before.slot = _slot;
		step.before.name = s.name;
		step.before.rate = s.rate;
		step.before.loop = s.loop.has_value();
		step.before.pcm = s.pcm;
		return step;
	}

	std::string Desk::sendClip(const uint8_t _slot, const SampleClip& _clip, const std::string& _file, const std::string& _what, const bool _record)
	{
		namespace ed = elektronData;
		if(_slot >= ed::g_mdRomSlots)
			return "A sample goes into a ROM slot (1-48).";
		if(!isInputReady())
			return MdModel::lifecycleText(lifecycle());
		if(!_clip.pcm || _clip.pcm->empty() || !_clip.rate)
			return "There is nothing to send.";
		if(const auto room = sampleRoom(_slot); _clip.length() > room)
		{
			char t[200];
			std::snprintf(t, sizeof(t), "It does not fit: it is %u samples and %s has room for %u with the other slots as they are.",
				static_cast<unsigned>(_clip.length()), romLabel(_slot).c_str(), static_cast<unsigned>(room));
			return t;
		}
		std::string name = _clip.name;
		while(!name.empty() && name.back() == ' ')
			name.pop_back();
		if(name.size() > 4)
			name.resize(4);
		if(ed::mdSetSampleName(_slot, name).empty())
			name = "SMPL";
		ed::MdSampleUpload upload;
		upload.samples = *_clip.pcm;
		upload.rate = _clip.rate;
		upload.name = name;
		if(_clip.loop)
			upload.notes.push_back("The loop points are not sent.");
		if(const auto why = machine().sendSample(_slot, upload); !why.empty())
			return why;
		SampleLoad l;
		l.slot = _slot;
		l.file = _file;
		l.name = upload.name;
		l.rate = upload.rate;
		l.length = static_cast<uint32_t>(upload.samples.size());
		l.notes = upload.notes;
		if(_record)
			l.step = sampleStepOf(_slot, _what);
		m_sampleLoad = std::move(l);
		publishSampleLoad(true);
		return {};
	}

	// A slot's samples into the clipboard, or why not. A RAM take is copied as it is now.
	std::string Desk::copyFrom(const std::string& _bank, const size_t _slot)
	{
		const auto caps = machine().capabilities();
		if(!caps.has("sampleAudio"))
			return caps.reason("sampleAudio");
		if(!m_samples)
			return "The samples are not read yet.";
		const bool ram = _bank == "ram";
		const auto& list = ram ? m_samples->ram : m_samples->rom;
		if(_slot >= list.size())
			return ram ? "There are four RAM slots (1-4)." : "There are 48 ROM slots (1-48).";
		if(ram && !m_samples->ramReadable)
			return m_samples->ramReason;
		const auto& s = list[_slot];
		if(s.empty || !s.pcm || s.pcm->empty() || !s.rate)
			return (ram ? "RAM " + std::to_string(_slot + 1) : romLabel(static_cast<uint8_t>(_slot))) + " holds no sample: there is nothing to copy.";
		SampleClip c;
		c.ram = ram;
		c.slot = static_cast<uint8_t>(_slot);
		c.name = ram ? "RAM" + std::to_string(_slot + 1) : s.name;
		c.rate = s.rate;
		c.loop = s.loop.has_value();
		c.pcm = s.pcm;
		m_clip = std::move(c);
		return {};
	}

	void Desk::copySample(const Value& _message)
	{
		const auto why = copyFrom(_message.find("bank")->asString(), static_cast<size_t>(_message.find("slot")->asNumber()));
		result(_message, why.empty() ? std::vector<std::string>{} : std::vector<std::string>{why}, {});
	}

	void Desk::pasteSample(const Value& _message)
	{
		const auto slot = static_cast<uint8_t>(_message.find("slot")->asNumber());
		const auto why = !m_clip ? std::string("Nothing is copied. Copy a slot first.")
			: sendClip(slot, *m_clip, "Paste", "Paste into " + romLabel(slot), true);
		result(_message, why.empty() ? std::vector<std::string>{} : std::vector<std::string>{why}, {});
	}

	// RAM to ROM (the manual: copy the RAM machine, paste it into a ROM slot): the take as it is now, sent to the ROM slot.
	void Desk::ramToRom(const Value& _message)
	{
		const auto ram = static_cast<size_t>(_message.find("ram")->asNumber());
		const auto slot = static_cast<uint8_t>(_message.find("slot")->asNumber());
		auto why = copyFrom("ram", ram);
		if(why.empty())
			why = sendClip(slot, *m_clip, "RAM " + std::to_string(ram + 1), "Copy of RAM " + std::to_string(ram + 1) + " into " + romLabel(slot), true);
		result(_message, why.empty() ? std::vector<std::string>{} : std::vector<std::string>{why}, {});
	}

	// Puts back what the last step replaced (no redo). The step goes when the machine has taken the sample.
	void Desk::undoSample(const Value& _message)
	{
		std::string why;
		if(m_sampleSteps.empty())
			why = "Nothing to undo.";
		else
		{
			const auto step = m_sampleSteps.back();
			why = sendClip(step.slot, step.before, "Undo", "", false);
			if(why.empty() && m_sampleLoad)
				m_sampleLoad->undoing = true;
		}
		result(_message, why.empty() ? std::vector<std::string>{} : std::vector<std::string>{why}, {});
	}

	// The clipboard and the last step, for the page's keys; when it changed (or _force: after a ready).
	void Desk::publishSampleHistory(const bool _force)
	{
		Value m = Value::object();
		m.set("type", "sampleHistory");
		if(m_clip)
		{
			Value c = Value::object();
			c.set("bank", m_clip->ram ? "ram" : "rom");
			c.set("slot", static_cast<int>(m_clip->slot));
			c.set("name", m_clip->name);
			c.set("length", m_clip->length());
			c.set("rate", m_clip->rate);
			m.set("clip", c);
		}
		else
			m.set("clip", nullptr);
		if(!m_sampleSteps.empty())
		{
			Value u = Value::object();
			u.set("slot", static_cast<int>(m_sampleSteps.back().slot));
			u.set("what", m_sampleSteps.back().what);
			u.set("depth", static_cast<int>(m_sampleSteps.size()));
			m.set("undo", u);
		}
		else
			m.set("undo", nullptr);
		const auto key = elektronData::json::write(m, 0);
		if(!_force && key == m_historyKey)
			return;
		m_historyKey = key;
		publish(m);
	}

	std::vector<Desk::ExportFile> Desk::exportSamples(const std::string& _bank, const int _slot, const bool _all, std::string& _why) const
	{
		namespace ed = elektronData;
		const auto caps = machine().capabilities();
		if(!caps.has("sampleAudio"))
		{
			_why = caps.reason("sampleAudio");
			return {};
		}
		if(!m_samples)
		{
			_why = "The samples are not read yet.";
			return {};
		}
		const bool ram = _bank == "ram";
		if(ram && !m_samples->ramReadable)
		{
			_why = m_samples->ramReason;
			return {};
		}
		const auto& list = ram ? m_samples->ram : m_samples->rom;
		static const std::string notInFileNames = "/\\:*?\"<>|";
		std::vector<ExportFile> files;
		for(const auto& s : list)
		{
			if((!_all && s.slot != _slot) || s.empty || !s.pcm || s.pcm->empty() || !s.rate)
				continue;
			char number[16];
			if(ram)
				std::snprintf(number, sizeof(number), "RAM-%d", s.slot + 1);
			else
				std::snprintf(number, sizeof(number), "ROM-%02d", s.slot + 1);
			std::string name = number;
			std::string label;
			for(const char c : s.name)
				label.push_back(c < 0x20 || c > 0x7e || notInFileNames.find(c) != std::string::npos ? '_' : c);
			while(!label.empty() && label.back() == ' ')
				label.pop_back();
			if(!label.empty())
				name += " " + label;
			files.push_back({name + ".wav", ed::encodeWavMono16(*s.pcm, s.rate)});
		}
		if(files.empty())
			_why = _all ? "No slot of this bank holds a sample." : "The slot holds no sample.";
		return files;
	}

	std::string Desk::loadSample(const uint8_t _slot, const std::string& _fileName, const Bytes& _file)
	{
		namespace ed = elektronData;
		const auto refuse = [&](const std::string& _why)
		{
			Value m = Value::object();
			m.set("type", "sampleLoad");
			m.set("slot", static_cast<int>(_slot));
			m.set("state", "failed");
			m.set("file", _fileName);
			m.set("text", _why);
			publish(m);
			flush();
			return _why;
		};
		if(_slot >= ed::g_mdRomSlots)
			return refuse("A sample goes into a ROM slot (1-48). The RAM slots take only what RAM-R records: "
				"the machine does not answer an SDS sample for them (measured on OS 1.63).");
		if(!isInputReady())
			return refuse(MdModel::lifecycleText(lifecycle()));
		std::string error;
		const auto clip = ed::decodeAudioFile(_file, error);
		if(!clip)
			return refuse(error);
		// The memory left: the emulated machine's bank says what the other slots hold; a real one does not
		// say. One second is kept for each RAM buffer (they share the same memory).
		const uint32_t left = sampleRoom(_slot);
		auto upload = ed::prepareMdSample(*clip, _fileName, left, error);
		if(!upload)
			return refuse(error);
		if(const auto why = machine().sendSample(_slot, *upload); !why.empty())
			return refuse(why);
		SampleLoad l;
		l.slot = _slot;
		l.file = _fileName;
		l.name = upload->name;
		l.rate = upload->rate;
		l.length = static_cast<uint32_t>(upload->samples.size());
		l.notes = upload->notes;
		l.step = sampleStepOf(_slot, "Load into " + romLabel(_slot));
		if(!m_samples)
			l.notes.push_back("A real Machinedrum does not say how much sample memory is free; if it is full, it keeps the slot as it was.");
		m_sampleLoad = std::move(l);
		publishSampleLoad(true);
		flush();
		return {};
	}

	// The transfer's progress, when it changed (or _force: after a ready).
	void Desk::publishSampleLoad(const bool _force)
	{
		if(!m_sampleLoad)
			return;
		using S = SdsSender::State;
		const auto& p = machine().sampleProgress();
		auto& l = *m_sampleLoad;
		Value m = Value::object();
		m.set("type", "sampleLoad");
		m.set("slot", static_cast<int>(l.slot));
		m.set("state", p.state == S::Sending ? "sending" : p.state == S::Done ? "done" : p.state == S::Cancelled ? "cancelled" : "failed");
		m.set("file", l.file);
		m.set("name", l.name);
		m.set("rate", l.rate);
		m.set("length", l.length);
		m.set("sent", static_cast<int>(p.sent));
		m.set("total", static_cast<int>(p.total));
		m.set("handshake", p.handshake);
		m.set("retries", static_cast<int>(p.retries));
		Value notes = Value::array();
		for(const auto& n : l.notes)
			notes.push(n);
		m.set("notes", notes);
		std::string text = p.text;
		if(p.state == S::Done)
		{
			char t[160];
			std::snprintf(t, sizeof(t), "Sent to ROM-%02d: %s, %.2f s at %u Hz. The machine stores it now.", l.slot + 1, l.name.c_str(),
				l.length / double(l.rate ? l.rate : 1), l.rate);
			text = t;
		}
		m.set("text", text);
		// At most a message a per cent.
		const int key = static_cast<int>(p.state) * 1000 + static_cast<int>(p.total ? p.sent * 100 / p.total : 0);
		if(!_force && key == l.last)
			return;
		l.last = key;
		publish(m);
		if(p.state != S::Sending)
		{
			// the step to undo it is kept only when the machine took the sample; an undo takes its step off
			if(p.state == S::Done)
			{
				if(l.undoing)
				{
					if(!m_sampleSteps.empty())
						m_sampleSteps.pop_back();
				}
				else if(l.step)
				{
					m_sampleSteps.push_back(std::move(*l.step));
					if(m_sampleSteps.size() > g_sampleUndoSteps)
						m_sampleSteps.erase(m_sampleSteps.begin());
				}
			}
			m_sampleLoad.reset();
			publishSampleHistory(false);
		}
	}

	std::vector<std::string> Desk::loadSetup(const Value& _setup)
	{
		// never the previous project's setup: what this one holds that can be used, else the default (errors say what not)
		std::vector<std::string> errors;
		m_setup = deskSetupFromJson(_setup, errors);
		m_mods.setSetup(m_setup.modulators);
		publishSetup();
		publishSolo();
		publishModulators();
		return errors;
	}

	void Desk::setMappings(std::vector<deskCore::LearnMapping> _mappings)
	{
		if(_mappings == m_setup.mappings)
			return;
		const bool had = !m_setup.mappings.empty();
		m_setup.mappings = std::move(_mappings);
		m_setup.mappingsKept = m_setup.mappings.empty() && (m_setup.mappingsKept || had);
		saveSetup();
		publishSetup();
	}

	void Desk::publishSetup()
	{
		Value m = Value::object();
		m.set("type", "setup");
		m.set("doc", deskSetupToJson(m_setup));
		publish(m);
	}

	void Desk::saveSetup() const
	{
		if(m_saveSetup)
			m_saveSetup(deskSetupToJson(m_setup));
	}

	void Desk::publishModulators()
	{
		publish(m_mods.message(g_mdModLimits, now()));
	}


	// App modulators move on the machine's own steps.
	void Desk::runModulators()
	{
		const auto& t = machine().telemetry();
		if(auto m = m_mods.step(machine(), documents(), g_mdModLimits, t.step, t.playing, now()))
			publish(*m);
	}

	// ---- device facts -> the adapter ----

	void Desk::onHostKitParam(const uint8_t _track, const uint8_t _index, const uint8_t _value)
	{
		machine().onHostKitParam(_track, _index, _value, documents());
		flush();
	}

	void Desk::onHostMute(const uint8_t _track, const bool _muted)
	{
		machine().onHostMute(_track, _muted);
	}

	void Desk::onTelemetry(const Telemetry& _telemetry)
	{
		const auto e = machine().onTelemetry(_telemetry);
		if(e.stepped)
			runModulators();
		publishSampleLoad();
		pollAudition();
		flush();
	}

	void Desk::onWorkingKitMemory(const Bytes& _region)
	{
		machine().onWorkingKitMemory(_region, documents());
		flush();
	}

	void Desk::setProbe(const Probe _probe)
	{
		machine().setProbe(_probe);
		flush();
	}
}

namespace mdDesk
{
	// ---- MIDI Learn's global targets (B-169) ----

	namespace
	{
		namespace ed = elektronData;
		using Value = elektronData::json::Value;

		struct FxCard
		{
			const char* group;
			const char* fx;		// the kit's name for it (g_mdMasterFx)
			std::array<const char*, 8> knobs;	// the page's names, in the order of the stored values
		};
		constexpr std::array<FxCard, 4> g_fxCards{{
			{"RHYTHM ECHO", "rhythmEcho", {"TIME", "MOD", "MFRQ", "FB", "FILTF", "FILTW", "MONO", "LEV"}},
			{"GATE BOX", "gateBox", {"DVOL", "PRED", "DEC", "DAMP", "HP", "LP", "GATE", "LEV"}},
			{"MASTER EQ", "eq", {"LF", "LG", "HF", "HG", "PF", "PG", "PQ", "GAIN"}},
			{"DYNAMIX", "dynamix", {"ATCK", "REL", "TRHD", "RTIO", "KNEE", "HP", "OUTG", "MIX"}}}};
		constexpr int g_fxTargets = 32, g_tempoTarget = 32, g_swingTarget = 33, g_accentTarget = 34;
		// 35.. the LFO page of every track (B-169 part 2): track t's five settings (TRCK PARAM SHP1 SHP2 UPDTE, the lfo command's
		// fields in order) are 35 + 5 t + field; SPD, DEPTH and SHMIX are kit parameters of the routing page and were learnable
		// per track already. A choice (a shape, UPDTE, the target) is learned by spreading the CC over its entries.
		constexpr int g_lfoFirst = 35, g_lfoFields = 5;
		static_assert(g_lfoFirst + 16 * g_lfoFields == g_mdLearnGlobals);
	}

	const std::vector<deskCore::LearnGlobalSpec>& Desk::learnGlobals()
	{
		static const std::vector<deskCore::LearnGlobalSpec> list = []
		{
			std::vector<deskCore::LearnGlobalSpec> v;
			for(const auto& card : g_fxCards)
				for(const auto* knob : card.knobs)
					v.push_back({std::string(card.group) + " " + knob, card.group, 0, 127});
			v.push_back({"TEMPO", "TEMPO", 30, 300});
			v.push_back({"SWING", "PATTERN", 50, 80});
			v.push_back({"ACCENT", "PATTERN", 0, 15});
			for(size_t t = 0; t < 16; ++t)
				for(size_t f = 0; f < g_lfoFields; ++f)
				{
					static constexpr std::array<const char*, g_lfoFields> label{"TRCK", "PARAM", "SHP1", "SHP2", "UPDTE"};
					v.push_back({"T" + std::to_string(t + 1) + " LFO " + label[f], "LFO T" + std::to_string(t + 1), 0, ed::g_mdLfoFieldMax[f]});
				}
			return v;
		}();
		return list;
	}

	std::optional<int> Desk::learnGlobalValue(const int _id, const Value& _state) const
	{
		const int kit = stateInt(_state, "kit", "current");
		if(_id >= 0 && _id < g_fxTargets)
		{
			if(kit < 0 || kit > 255)
				return std::nullopt;
			const auto* k = documents().workingKitOf(static_cast<uint8_t>(kit));
			if(!k)
			{
				const auto it = documents().kits.find(static_cast<uint8_t>(kit));
				if(it == documents().kits.end())
					return std::nullopt;
				k = &it->second;
			}
			const auto& name = g_fxCards[static_cast<size_t>(_id / 8)].fx;
			for(size_t f = 0; f < ed::g_mdMasterFx.size(); ++f)
				if(std::string(ed::g_mdMasterFx[f]) == name)
					return k->masterFx[f][static_cast<size_t>(_id % 8)];
			return std::nullopt;
		}
		if(_id >= g_lfoFirst && _id < g_lfoFirst + 16 * g_lfoFields)
		{
			if(kit < 0 || kit > 255)
				return std::nullopt;
			const auto* k = documents().workingKitOf(static_cast<uint8_t>(kit));
			if(!k)
			{
				const auto it = documents().kits.find(static_cast<uint8_t>(kit));
				if(it == documents().kits.end())
					return std::nullopt;
				k = &it->second;
			}
			const auto& l = k->lfos[static_cast<size_t>((_id - g_lfoFirst) / g_lfoFields)];
			const std::array<int, g_lfoFields> fields{l.track, l.param, l.shape1, l.shape2, l.update};
			return fields[static_cast<size_t>((_id - g_lfoFirst) % g_lfoFields)];
		}
		if(_id == g_tempoTarget)
		{
			if(!documents().global)
				return std::nullopt;
			return static_cast<int>(std::lround(documents().global->tempo / 24.0));
		}
		const int pattern = stateInt(_state, "pattern", "current");
		const auto it = pattern >= 0 && pattern <= 255 ? documents().patterns.find(static_cast<uint8_t>(pattern)) : documents().patterns.end();
		if(it == documents().patterns.end())
			return std::nullopt;
		if(_id == g_swingTarget)
			return ed::swingPercent(it->second.swingAmount);
		if(_id == g_accentTarget)
			return ed::accentDisplay(it->second.accentAmount);
		return std::nullopt;
	}

	Value Desk::learnGlobalMessage(const int _id, const int _value, const Value& _state) const
	{
		Value m = Value::object();
		if(_id >= 0 && _id < g_fxTargets)
		{
			m.set("op", "masterFx");
			m.set("k", stateInt(_state, "kit", "current"));
			m.set("fx", g_fxCards[static_cast<size_t>(_id / 8)].fx);
			m.set("i", _id % 8);
			m.set("v", _value);
		}
		else if(_id >= g_lfoFirst && _id < g_lfoFirst + 16 * g_lfoFields)
		{
			m.set("op", "lfo");
			m.set("k", stateInt(_state, "kit", "current"));
			m.set("t", (_id - g_lfoFirst) / g_lfoFields);
			m.set("field", ed::g_mdLfoFields[static_cast<size_t>((_id - g_lfoFirst) % g_lfoFields)]);
			m.set("v", _value);
		}
		else if(_id == g_tempoTarget)
		{
			m.set("op", "tempo");
			m.set("bpm", _value);
		}
		else if(_id == g_swingTarget || _id == g_accentTarget)
		{
			m.set("op", _id == g_swingTarget ? "swing" : "accentAmount");
			m.set("p", stateInt(_state, "pattern", "current"));
			m.set("v", _value);
		}
		else
			return Value();
		return m;
	}
}
