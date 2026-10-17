#include "mdAudioMidiLink.h"
#include "mdMidiPortRefusal.h"
#include "mdMicPermission.h"
#include "jucePluginLib/processor.h"

#include "deskCore/deskCommands.h"

#include "juce_audio_utils/juce_audio_utils.h"
#include "juce_audio_plugin_client/Standalone/juce_StandaloneFilterWindow.h"

#include <cmath>
#include <optional>
#include <vector>

namespace mdJucePlugin
{
	namespace json = elektronData::json;

	namespace
	{
		std::string str(const juce::String& _s) { return _s.toStdString(); }

		const std::string* stringOf(const json::Value& _m, const char* _key)
		{
			const auto* v = _m.find(_key);
			return v && v->isString() ? &v->asString() : nullptr;
		}

		json::Value named(const std::string& _id, const json::Value& _list)
		{
			json::Value v = json::Value::object();
			v.set("id", _id);
			v.set("list", _list);
			return v;
		}

		json::Value strings(const juce::StringArray& _a)
		{
			json::Value v = json::Value::array();
			for(const auto& s : _a)
				v.push(str(s));
			return v;
		}

		// A MIDI port's name for its identifier (what the page sends), or the identifier when it is not listed.
		std::string portName(const juce::Array<juce::MidiDeviceInfo>& _ports, const std::string& _identifier)
		{
			for(const auto& p : _ports)
				if(p.identifier == juce::String(_identifier))
					return str(p.name);
			return _identifier;
		}

		std::vector<midiHotplug::Port> ports(const juce::Array<juce::MidiDeviceInfo>& _devices)
		{
			std::vector<midiHotplug::Port> out;
			for(const auto& d : _devices)
				out.push_back({str(d.identifier), str(d.name)});
			return out;
		}

		constexpr bool g_windows =
#if JUCE_WINDOWS
			true;
#else
			false;
#endif
	}

	AudioMidiLink::AudioMidiLink(juce::AudioProcessor& _processor, ToPage _toPage, Log _log)
		: m_processor(_processor)
		, m_toPage(std::move(_toPage))
		, m_log(std::move(_log))
		, m_listInputs([] { return ports(juce::MidiInput::getAvailableDevices()); })
		, m_listOutputs([] { return ports(juce::MidiOutput::getAvailableDevices()); })
	{
		m_seenInputs = m_listInputs();
		m_seenOutputs = m_listOutputs();
		if(auto* h = holder())
		{
			m_listening = &h->deviceManager;
			m_listening->addChangeListener(this);
			rememberFromState();
			// message thread; the connection ends with this object (destroyed first, before the listener goes)
			m_midiConnection = juce::MidiDeviceListConnection::make([this] { midiDevicesChanged(); });
		}
		logDevices();
	}

	namespace
	{
		std::optional<midiHotplug::Memory>& leftBehind()
		{
			static std::optional<midiHotplug::Memory> memory;
			return memory;
		}
	}

	bool AudioMidiLink::patchSavedSettings(juce::PropertySet& _settings)
	{
		const auto& memory = leftBehind();
		return memory && patchSettings(_settings, *memory);
	}

	bool AudioMidiLink::patchSettings(juce::PropertySet& _settings, const midiHotplug::Memory& _memory)
	{
		auto xml = _settings.getXmlValue("audioSetup");
		if(!xml)
			return false;
		patchStateXml(*xml, _memory.inputs, _memory.output);
		_settings.setValue("audioSetup", xml.get());
		return true;
	}

	AudioMidiLink::~AudioMidiLink()
	{
		m_midiConnection.reset();
		if(holder())
			leftBehind() = m_memory;
		if(m_listening)
			m_listening->removeChangeListener(this);
	}

	juce::StandalonePluginHolder* AudioMidiLink::holder() const
	{
		auto* const h = juce::StandalonePluginHolder::getInstance();
		return h && h->processor.get() == &m_processor ? h : nullptr;
	}

	void AudioMidiLink::changeListenerCallback(juce::ChangeBroadcaster*)
	{
		syncFromManager();	// any source of a change (the fallback settings dialog too) is what the user wants
		publish();
		logDevices();
	}

	void AudioMidiLink::setPortLists(PortList _inputs, PortList _outputs)
	{
		m_listInputs = std::move(_inputs);
		m_listOutputs = std::move(_outputs);
		m_seenInputs = m_listInputs();
		m_seenOutputs = m_listOutputs();
	}

	namespace
	{
		// The standalone's AudioDeviceManager as midiHotplug::Devices. The lists come from the link (a test replaces them).
		class ManagerDevices final : public midiHotplug::Devices
		{
		public:
			ManagerDevices(juce::StandalonePluginHolder& _h, std::function<std::vector<midiHotplug::Port>()> _in,
				std::function<std::vector<midiHotplug::Port>()> _out) : m_h(_h), m_in(std::move(_in)), m_out(std::move(_out)) {}

			std::vector<midiHotplug::Port> inputs() const override { return m_in(); }
			std::vector<midiHotplug::Port> outputs() const override { return m_out(); }

			std::vector<std::string> enabledInputs() const override
			{
				// JUCE keeps a port open after its device went: those are in its state XML, not in the list
				std::vector<std::string> ids;
				auto& dm = m_h.deviceManager;
				for(const auto& p : m_in())
					if(dm.isMidiInputDeviceEnabled(juce::String(p.id)))
						ids.push_back(p.id);
				if(const auto state = dm.createStateXml())
					for(auto* c : state->getChildWithTagNameIterator("MIDIINPUT"))
					{
						const auto id = str(c->getStringAttribute("identifier"));
						if(dm.isMidiInputDeviceEnabled(juce::String(id)) && !midiHotplug::contains(ids, id))
							ids.push_back(id);
					}
				return ids;
			}

			void setInput(const std::string& _id, const bool _on) override
			{
				m_h.deviceManager.setMidiInputDeviceEnabled(juce::String(_id), _on);
			}

			std::string output() const override { return str(m_h.deviceManager.getDefaultMidiOutputIdentifier()); }

			void setOutput(const std::string& _id) override
			{
				m_h.deviceManager.setDefaultMidiOutputDevice(juce::String(_id));
				m_h.player.setMidiOutput(m_h.deviceManager.getDefaultMidiOutput());
			}

		private:
			juce::StandalonePluginHolder& m_h;
			std::function<std::vector<midiHotplug::Port>()> m_in, m_out;
		};
	}

	void AudioMidiLink::patchStateXml(juce::XmlElement& _xml, const std::vector<midiHotplug::Port>& _inputs, const midiHotplug::Port& _output)
	{
		// the saved state says what the user chose: JUCE's own list of unplugged inputs (from the state it loaded) goes
		_xml.deleteAllChildElementsWithTagName("MIDIINPUT");
		for(const auto& w : _inputs)
		{
			auto* child = _xml.createNewChildElement("MIDIINPUT");
			child->setAttribute("name", juce::String(w.name));
			child->setAttribute("identifier", juce::String(w.id));
		}
		if(_output.id.empty())
		{
			_xml.removeAttribute("defaultMidiOutput");
			_xml.removeAttribute("defaultMidiOutputDevice");
		}
		else
		{
			_xml.setAttribute("defaultMidiOutput", juce::String(_output.name));
			_xml.setAttribute("defaultMidiOutputDevice", juce::String(_output.id));
		}
	}

	void AudioMidiLink::rememberFromState()
	{
		auto* h = holder();
		if(!h)
			return;
		ManagerDevices devices(*h, m_listInputs, m_listOutputs);
		// what the saved state lists (this editor wrote it, with the ports that were not plugged in), then what is on now
		const auto inputs = m_listInputs();
		if(h->settings != nullptr)
			if(const auto saved = h->settings->getXmlValue("audioSetup"))
			{
				for(auto* c : saved->getChildWithTagNameIterator("MIDIINPUT"))
					if(c->getStringAttribute("identifier").isNotEmpty() || c->getStringAttribute("name").isNotEmpty())
						midiHotplug::remember(m_memory.inputs, {str(c->getStringAttribute("identifier")), str(c->getStringAttribute("name"))}, true, inputs);
				m_memory.output = {str(saved->getStringAttribute("defaultMidiOutputDevice")), str(saved->getStringAttribute("defaultMidiOutput"))};
			}
		const auto enabled = devices.enabledInputs();
		for(const auto& p : inputs)
			if(midiHotplug::contains(enabled, p.id))
				midiHotplug::remember(m_memory.inputs, p, true, inputs);
		const auto out = devices.output();
		if(!out.empty())
			for(const auto& o : m_listOutputs())
				if(o.id == out)
					m_memory.output = o;
	}

	void AudioMidiLink::saveState()
	{
		auto* h = holder();
		if(!h)
			return;
		h->saveAudioDeviceState();
		if(h->settings == nullptr)
			return;
		if(auto xml = h->settings->getXmlValue("audioSetup"))
		{
			patchStateXml(*xml, m_memory.inputs, m_memory.output);
			h->settings->setValue("audioSetup", xml.get());
		}
	}

	void AudioMidiLink::logPlugs()
	{
		const auto inputs = m_listInputs();
		const auto outputs = m_listOutputs();
		if(m_log)
		{
			const auto report = [&](const char* _kind, const midiHotplug::Change& _c)
			{
				for(const auto& p : _c.removed)
					m_log(std::string("MIDI: ") + _kind + " unplugged: " + p.name);
				for(const auto& p : _c.added)
					m_log(std::string("MIDI: ") + _kind + " plugged in: " + p.name);
			};
			report("input", midiHotplug::change(m_seenInputs, inputs));
			report("output", midiHotplug::change(m_seenOutputs, outputs));
		}
		m_seenInputs = inputs;
		m_seenOutputs = outputs;
	}

	void AudioMidiLink::reconcileMidi()
	{
		auto* h = holder();
		if(!h)
			return;
		ManagerDevices devices(*h, m_listInputs, m_listOutputs);
		const auto o = midiHotplug::apply(m_memory, devices);
		if(m_log)
		{
			for(const auto& p : o.switchedOn)
				m_log("MIDI: input switched back on: " + p.name);
			for(const auto& p : o.notOpened)
				m_log("MIDI: input " + p.name + " is back but did not open");
			if(o.outputBack)
				m_log("MIDI: output switched back on: " + m_memory.output.name);
		}
		if(!o.switchedOn.empty() || !o.switchedOff.empty() || !o.notOpened.empty())
			if(auto* p = dynamic_cast<pluginLib::Processor*>(&m_processor))
				p->midiInputsChanged();	// a note held on a port that went gets no note off
		saveState();
	}

	void AudioMidiLink::syncFromManager()
	{
		auto* h = holder();
		if(!h)
			return;
		ManagerDevices devices(*h, m_listInputs, m_listOutputs);
		midiHotplug::sync(m_memory, devices);
	}

	void AudioMidiLink::midiDevicesChanged()
	{
		logPlugs();
		reconcileMidi();
		publish();
		logDevices();
	}

	std::string AudioMidiLink::summary() const
	{
		auto* h = holder();
		if(!h)
			return {};
		auto& dm = h->deviceManager;
		auto* dev = dm.getCurrentAudioDevice();
		juce::String line = "audio: " + (dm.getCurrentAudioDeviceType().isNotEmpty() ? dm.getCurrentAudioDeviceType()
			: juce::String("no driver"));
		if(dev)
		{
			const auto rate = dev->getCurrentSampleRate();
			const auto buffer = dev->getCurrentBufferSizeSamples();
			line << ", " << dev->getName() << ", " << juce::String(rate, 0) << " Hz, buffer " << buffer
				<< (rate > 0 ? " (" + juce::String(1000.0 * buffer / rate, 1) + " ms)" : juce::String())
				<< ", output latency " << dev->getOutputLatencyInSamples() << ", "
					<< (dev->isPlaying() ? "running" : "NOT running");
		}
		else
		{
			line << ", no device open";
		}
		line << "; MIDI in:";
		const auto inputs = juce::MidiInput::getAvailableDevices();
		if(inputs.isEmpty())
			line << " none";
		for(const auto& m : inputs)
			line << " " << m.name << (dm.isMidiInputDeviceEnabled(m.identifier) ? " (on)" : " (off)");
		const auto outputs = juce::MidiOutput::getAvailableDevices();
		const auto out = dm.getDefaultMidiOutputIdentifier();
		line << "; MIDI out: " << (out.isEmpty() ? juce::String("none") : juce::String(portName(outputs, str(out))))
			<< " (of " << outputs.size() << ")";
		return str(line);
	}

	std::string AudioMidiLink::midiLoopWarning() const
	{
		auto* h = holder();
		if(!h)
			return {};
		auto& dm = h->deviceManager;
		std::vector<std::string> inputs;
		for(const auto& m : juce::MidiInput::getAvailableDevices())
			if(dm.isMidiInputDeviceEnabled(m.identifier))
				inputs.push_back(str(m.name));
		const auto out = dm.getDefaultMidiOutputIdentifier();
		if(out.isEmpty())
			return {};
		return midiLoop::warning(inputs, portName(juce::MidiOutput::getAvailableDevices(), str(out)));
	}

	std::string AudioMidiLink::inputNote() const
	{
		auto* h = holder();
		if(!h)
			return {};
		auto& dm = h->deviceManager;
		auto* dev = dm.getCurrentAudioDevice();
		const bool chosen = dm.getAudioDeviceSetup().inputDeviceName.isNotEmpty();
		const bool active = dev && !dev->getActiveInputChannels().isZero();
		return audioInput::note(micPermission::state(), chosen, active, m_setupError);
	}

	void AudioMidiLink::logDevices()
	{
		if(!m_log)
			return;
		const auto loop = midiLoopWarning();
		if(loop != m_loopLogged)
		{
			m_loopLogged = loop;
			if(!loop.empty())
				m_log(loop);
		}
		auto line = summary();
		if(line.empty() || line == m_logged)
			return;
		m_logged = line;
		m_log(line);
	}

	void AudioMidiLink::publish()
	{
		json::Value m = json::Value::object();
		m.set("type", "audio");
		m.set("doc", document());
		m_toPage(std::move(m));
	}

	json::Value AudioMidiLink::document() const
	{
		json::Value d = json::Value::object();
		d.set("schema", "gm-audio/devices");
		d.set("version", 1);
		auto* h = holder();
		d.set("standalone", h != nullptr);
		if(!h)
			return d;
		auto& dm = h->deviceManager;
		const auto setup = dm.getAudioDeviceSetup();
		auto* dev = dm.getCurrentAudioDevice();
		auto* type = dm.getCurrentDeviceTypeObject();

		juce::StringArray types;
		for(const auto* t : dm.getAvailableDeviceTypes())
			types.add(t->getTypeName());
		d.set("driver", named(str(dm.getCurrentAudioDeviceType()), strings(types)));
		d.set("output", named(str(setup.outputDeviceName), type ? strings(type->getDeviceNames(false)) : json::Value::array()));

		const bool inputActive = dev && !dev->getActiveInputChannels().isZero();
		json::Value in = named(inputActive ? str(setup.inputDeviceName) : std::string(), type ? strings(type->getDeviceNames(true)) : json::Value::array());
		in.set("muted", static_cast<bool>(h->getMuteInputValue().getValue()));
		d.set("input", std::move(in));

		json::Value outs = json::Value::array();
		if(dev)
		{
			const auto names = dev->getOutputChannelNames();
			const auto active = dev->getActiveOutputChannels();
			for(int i = 0; i < names.size(); ++i)
			{
				json::Value c = json::Value::object();
				c.set("name", str(names[i]));
				c.set("on", active[i]);
				outs.push(std::move(c));
			}
		}
		d.set("outputChannels", std::move(outs));

		json::Value rate = json::Value::object(), buffer = json::Value::object();
		json::Value rates = json::Value::array(), buffers = json::Value::array();
		if(dev)
		{
			for(const auto r : dev->getAvailableSampleRates())
				rates.push(r);
			for(const auto b : dev->getAvailableBufferSizes())
				buffers.push(b);
		}
		rate.set("value", dev ? dev->getCurrentSampleRate() : 0.0);
		rate.set("list", std::move(rates));
		buffer.set("value", dev ? dev->getCurrentBufferSizeSamples() : 0);
		buffer.set("list", std::move(buffers));
		d.set("sampleRate", std::move(rate));
		d.set("bufferSize", std::move(buffer));
		const double sr = dev ? dev->getCurrentSampleRate() : 0.0;
		d.set("latencyMs", dev && sr > 0 ? std::round((dev->getOutputLatencyInSamples() + dev->getCurrentBufferSizeSamples()) * 10000.0 / sr) / 10.0 : 0.0);
		d.set("running", dev != nullptr && dev->isPlaying());

		json::Value midiIn = json::Value::array();
		for(const auto& m : juce::MidiInput::getAvailableDevices())
		{
			json::Value v = json::Value::object();
			v.set("id", str(m.identifier));
			v.set("name", str(m.name));
			v.set("on", dm.isMidiInputDeviceEnabled(m.identifier));
			midiIn.push(std::move(v));
		}
		d.set("midiInputs", std::move(midiIn));
		json::Value outList = json::Value::array();
		for(const auto& m : juce::MidiOutput::getAvailableDevices())
		{
			json::Value v = json::Value::object();
			v.set("id", str(m.identifier));
			v.set("name", str(m.name));
			outList.push(std::move(v));
		}
		d.set("midiOutput", named(str(dm.getDefaultMidiOutputIdentifier()), outList));
		d.set("bluetooth", juce::BluetoothMidiDevicePairingDialogue::isAvailable());
		d.set("setupError", m_setupError);
		d.set("inputPermission", audioInput::name(micPermission::state()));
		d.set("inputNote", inputNote());
		d.set("midiLoop", midiLoopWarning());
		return d;
	}

	// One audioSet: deskHost's table checked the names (set, do) and the argument types; what each
	// setting needs is checked here.
	std::string AudioMidiLink::apply(const json::Value& _c)
	{
		using S = deskHost::AudioSetting;
		using D = deskHost::AudioAction;
		auto* h = holder();
		if(!h)
			return "The host owns audio and MIDI in the plug-in";
		auto& dm = h->deviceManager;
		const auto* device = stringOf(_c, "device");
		const auto* on = _c.find("on");
		const auto* index = _c.find("index");
		const auto* value = _c.find("value");
		const bool onValue = on && (on->isBool() ? on->asBool() : on->isNumber() && on->asNumber() != 0);
		const auto setup = [&](const std::function<void(juce::AudioDeviceManager::AudioDeviceSetup&)>& _f) -> std::string
		{
			auto s = dm.getAudioDeviceSetup();
			_f(s);
			const auto error = dm.setAudioDeviceSetup(s, true);
			saveState();
			m_setupError = str(error);	// B-155: shown by the panel, not only as this command's result
			return m_setupError;
		};
		const auto saved = [&]
		{
			saveState();
			return std::string();
		};

		if(const auto* act = stringOf(_c, "do"))
		{
			const auto d = deskHost::audioActionOf(*act);
			if(!d)
				return "audioSet: unknown action " + *act;
			switch(*d)
			{
			case D::Test:
				dm.playTestSound();
				return {};
			case D::Bluetooth:
				return juce::BluetoothMidiDevicePairingDialogue::open() ? std::string() : "Bluetooth MIDI is not available on this computer";
			case D::Count: break;
			}
			return {};
		}
		const auto* what = stringOf(_c, "set");
		if(!what)
			return "audioSet: set or do";
		const auto setting = deskHost::audioSettingOf(*what);
		if(!setting)
			return "audioSet: unknown setting " + *what;
		const auto needs = [&](const char* _args) { return "audioSet " + *what + ": needs " + _args; };
		switch(*setting)
		{
		case S::Driver:
			if(!device)
				return needs("device");
			dm.setCurrentAudioDeviceType(juce::String(*device), true);
			m_setupError = dm.getCurrentAudioDevice() ? std::string() : "No audio device opened on " + *device;
			return saved();
		case S::Output:
			if(!device)
				return needs("device");
			return setup([&](auto& _s) { _s.outputDeviceName = juce::String(*device); _s.useDefaultOutputChannels = true; });
		case S::Input:
			if(!device)
				return needs("device");
			return setup([&](auto& _s)
			{
				_s.inputDeviceName = juce::String(*device);
				_s.useDefaultInputChannels = !device->empty();
				if(device->empty())
					_s.inputChannels.clear();
			});
		case S::Mute:
			if(!on)
				return needs("on");
			h->getMuteInputValue().setValue(onValue);
			return saved();
		case S::OutputChannel:
		{
			if(!on || !index)
				return needs("index and on");
			auto* dev = dm.getCurrentAudioDevice();
			const int i = static_cast<int>(index->asNumber());
			if(!dev || i >= dev->getOutputChannelNames().size())
				return "No such output channel";
			auto active = dev->getActiveOutputChannels();
			active.setBit(i, onValue);
			if(active.isZero())
				return "At least one output channel stays on";
			return setup([&](auto& _s) { _s.useDefaultOutputChannels = false; _s.outputChannels = active; });
		}
		case S::SampleRate:
			if(!value)
				return needs("value");
			return setup([&](auto& _s) { _s.sampleRate = value->asNumber(); });
		case S::BufferSize:
			if(!value)
				return needs("value");
			return setup([&](auto& _s) { _s.bufferSize = static_cast<int>(value->asNumber()); });
		case S::MidiInput:
		{
			if(!device || !on)
				return needs("device and on");
			dm.setMidiInputDeviceEnabled(juce::String(*device), onValue);
			// the remembered ports follow what the user chose (an input that did not open is not remembered)
			midiHotplug::remember(m_memory.inputs, {*device, portName(juce::MidiInput::getAvailableDevices(), *device)},
				onValue && dm.isMidiInputDeviceEnabled(juce::String(*device)), m_listInputs());
			if(auto* p = dynamic_cast<pluginLib::Processor*>(&m_processor))
				p->midiInputsChanged();	// a note held on a port that went gets no note off
			saved();
			// B-037: a port the system did not open stays off without a word from JUCE (on Windows: in use elsewhere)
			const auto refused = midiPortRefusal::text(midiPortRefusal::Kind::Input,
				portName(juce::MidiInput::getAvailableDevices(), *device),
				onValue, dm.isMidiInputDeviceEnabled(juce::String(*device)), g_windows);
			if(!refused.empty() && m_log)
				m_log("MIDI: " + refused);
			return refused;
		}
		case S::MidiOutput:
		{
			if(!device)
				return needs("device");
			dm.setDefaultMidiOutputDevice(juce::String(*device));
			h->player.setMidiOutput(dm.getDefaultMidiOutput());
			// what the manager holds now is what is remembered (none when the port did not open or none was chosen)
			{
				const auto held = str(dm.getDefaultMidiOutputIdentifier());
				m_memory.output = held.empty() ? midiHotplug::Port() : midiHotplug::Port{held, portName(juce::MidiOutput::getAvailableDevices(), held)};
			}
			saved();
			// B-037: JUCE goes back to no output when the port did not open
			const auto refused = midiPortRefusal::text(midiPortRefusal::Kind::Output,
				portName(juce::MidiOutput::getAvailableDevices(), *device),
				!device->empty(), dm.getDefaultMidiOutputIdentifier() == juce::String(*device), g_windows);
			if(!refused.empty() && m_log)
				m_log("MIDI: " + refused);
			return refused;
		}
		case S::Count: break;
		}
		return "audioSet: unknown setting " + *what;
	}

	// The window's audio actions (deskHost's table: the arguments are checked there).
	bool AudioMidiLink::handle(const deskHost::Action _action, const json::Value& _message)
	{
		using A = deskHost::Action;
		switch(_action)
		{
		case A::AudioPublish:
			publish();
			m_toPage(deskCore::resultMessage(_message, {}, {}));
			return true;
		case A::AudioMeter:
		{
			const auto* on = _message.find("on");
			m_meter = on && (on->isBool() ? on->asBool() : on->isNumber() && on->asNumber() != 0) && holder();
			if(m_meter && !m_inputLevel)
				m_inputLevel = holder()->deviceManager.getInputLevelGetter();
			if(!m_meter)
				m_inputLevel = nullptr;
			m_toPage(deskCore::resultMessage(_message, {}, {}));
			return true;
		}
		case A::AudioSet:
		{
			// Its error is the result's (one channel); the document is the devices as they are now.
			const auto error = apply(_message);
			m_toPage(deskCore::resultMessage(_message, error.empty() ? std::vector<std::string>{} : std::vector<std::string>{error}, {}));
			publish();
			return true;
		}
		default:
			return false;
		}
	}

	void AudioMidiLink::tick()
	{
		if(!m_meter || !m_inputLevel || ++m_meterTicks % 2)
			return;
		json::Value m = json::Value::object();
		m.set("type", "audioLevel");
		m.set("in", std::round(static_cast<double>(m_inputLevel->getCurrentLevel()) * 1000.0) / 1000.0);
		m_toPage(std::move(m));
	}
}
