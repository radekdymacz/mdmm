#include "mdDiagnosticsSave.h"

#include "mdDiagnosticsZip.h"
#include "mdPluginProcessor.h"
#include "mdProcessArch.h"
#include "mdmmVersion.h"
#if JUCE_WINDOWS
#include "mdWebView2Page.h"
#endif

#include "juce_audio_utils/juce_audio_utils.h"
#include "juce_audio_plugin_client/Standalone/juce_StandaloneFilterWindow.h"

#include <memory>

namespace mdJucePlugin::diagnosticsSave
{
	namespace
	{
		// the chooser lives until its answer comes (message thread only)
		std::unique_ptr<juce::FileChooser> g_chooser;

		void line(juce::String& _text, const juce::String& _key, const juce::String& _value)
		{
			_text << _key << ": " << _value << "\n";
		}

		juce::String environment(const char* _name)
		{
			const auto value = juce::SystemStats::getEnvironmentVariable(_name, {});
			return value.isEmpty() ? juce::String("(not set)") : value;
		}

#if JUCE_LINUX || JUCE_BSD
		// The WebKitGTK the editor's page runs in (JUCE loads it at run time; the same library answers here)
		juce::String webKitGtkVersion()
		{
			for(const char* name : {"libwebkit2gtk-4.1.so.0", "libwebkit2gtk-4.0.so.37"})
			{
				juce::DynamicLibrary lib;
				if(!lib.open(name))
					continue;
				using Version = unsigned int (*)();
				const auto major = reinterpret_cast<Version>(lib.getFunction("webkit_get_major_version"));
				const auto minor = reinterpret_cast<Version>(lib.getFunction("webkit_get_minor_version"));
				const auto micro = reinterpret_cast<Version>(lib.getFunction("webkit_get_micro_version"));
				if(major && minor && micro)
					return juce::String(major()) + "." + juce::String(minor()) + "." + juce::String(micro()) + " (" + name + ")";
				return juce::String("(version not readable) (") + name + ")";
			}
			return "(not found)";
		}
#endif
	}

	juce::String defaultFileName(const bool _monomachine, const juce::Time& _now)
	{
		return juce::String(_monomachine ? "monomachine-editor" : "machinedrum-editor") + "-diagnostics-"
			+ _now.formatted("%Y-%m-%d") + ".zip";
	}

	juce::String infoText(AudioPluginAudioProcessor& _processor)
	{
		juce::String t;
		t << "Diagnostics of the " << juce::String(_processor.getProductName()) << "\n";
		t << "Saved: " << juce::Time::getCurrentTime().toISO8601(true) << "\n\n";
		line(t, "product", juce::String(_processor.getProductName()));
		line(t, "machine", _processor.getModel() == md::MachineModel::Monomachine ? "Monomachine" : "Machinedrum");
		line(t, "editor version", mdmm::editorVersion());
		line(t, "build revision", MDMM_DIAGNOSTICS_REVISION);
		line(t, "format", juce::AudioProcessor::getWrapperTypeDescription(_processor.wrapperType));
		line(t, "host", juce::PluginHostType().getHostDescription());
		line(t, "standalone", juce::JUCEApplicationBase::isStandaloneApp() ? "yes" : "no");
		line(t, "process", processArch::describe(processArch::current()));
		line(t, "emulation speed-ups", _processor.isLegacyEmulation() ? "off (the slower emulation of before)" : "on");
		line(t, "speed-up levers off (bits)", juce::String(static_cast<int>(_processor.getSpeedUpLeversOff())));
		t << "\n";
		line(t, "os", juce::SystemStats::getOperatingSystemName());
		line(t, "64 bit", juce::SystemStats::isOperatingSystem64Bit() ? "yes" : "no");
		line(t, "cpu", juce::SystemStats::getCpuModel());
		line(t, "cpu vendor", juce::SystemStats::getCpuVendor());
		line(t, "logical cpus", juce::String(juce::SystemStats::getNumCpus()));
		line(t, "cpu mhz", juce::String(juce::SystemStats::getCpuSpeedInMegahertz()));
		line(t, "memory mb", juce::String(juce::SystemStats::getMemorySizeInMegabytes()));
		line(t, "language", juce::SystemStats::getDisplayLanguage());
		t << "\n";
#if JUCE_MAC
		line(t, "web view", "WKWebView (the system's, see the os line)");
#elif JUCE_WINDOWS
		const auto runtime = WebView2Page::installedRuntimeVersion();
		line(t, "web view", "Microsoft Edge WebView2 Runtime " + (runtime.isEmpty() ? juce::String("(none found)") : runtime)
			+ " (the editors need " + WebView2Page::g_minimumRuntime + " or newer)");
#elif JUCE_LINUX || JUCE_BSD
		line(t, "web view", "WebKitGTK " + webKitGtkVersion());
		line(t, "XDG_SESSION_TYPE", environment("XDG_SESSION_TYPE"));
		line(t, "WAYLAND_DISPLAY", environment("WAYLAND_DISPLAY"));
		line(t, "GDK_BACKEND", environment("GDK_BACKEND"));
		line(t, "DISPLAY", environment("DISPLAY"));
		line(t, "WEBKIT_DISABLE_COMPOSITING_MODE", environment("WEBKIT_DISABLE_COMPOSITING_MODE"));
		line(t, "WEBKIT_DISABLE_DMABUF_RENDERER", environment("WEBKIT_DISABLE_DMABUF_RENDERER"));
		line(t, "FLATPAK_ID", environment("FLATPAK_ID"));
#endif
		t << "\n";
		t << "The zip holds: the editor's start-up logs, the last performance capture, the editor's settings file,\n"
			"this text and the audio and MIDI setup. It holds no ROM or firmware, no machine memory, no projects, no samples.\n";
		return t;
	}

	juce::String audioMidiText(AudioPluginAudioProcessor& _processor)
	{
		juce::String t;
		const double rate = _processor.getSampleRate();
		line(t, "sample rate", rate > 0 ? juce::String(rate) : juce::String("(not started)"));
		line(t, "block size", juce::String(_processor.getBlockSize()));
		line(t, "latency (samples)", juce::String(_processor.getLatencySamples()));
		for(const bool isInput : {true, false})
		{
			for(int i = 0; i < _processor.getBusCount(isInput); ++i)
			{
				const auto* const bus = _processor.getBus(isInput, i);
				if(bus)
					line(t, juce::String(isInput ? "input bus " : "output bus ") + juce::String(i),
						bus->getName() + ", " + (bus->isEnabled() ? "enabled, " : "disabled, ") + bus->getCurrentLayout().getDescription());
			}
		}
		t << "\n";

		auto* const holder = juce::StandalonePluginHolder::getInstance();
		if(!holder || holder->processor.get() != &_processor)
		{
			t << "Plug-in: the host owns audio and MIDI.\n";
			return t;
		}
		auto& manager = holder->deviceManager;
		line(t, "audio device type", manager.getCurrentAudioDeviceType());
		if(auto* const device = manager.getCurrentAudioDevice())
		{
			line(t, "audio device", device->getName());
			line(t, "device sample rate", juce::String(device->getCurrentSampleRate()));
			line(t, "device buffer (samples)", juce::String(device->getCurrentBufferSizeSamples()));
			line(t, "device input latency (samples)", juce::String(device->getInputLatencyInSamples()));
			line(t, "device output latency (samples)", juce::String(device->getOutputLatencyInSamples()));
			line(t, "active inputs", device->getActiveInputChannels().toString(2));
			line(t, "active outputs", device->getActiveOutputChannels().toString(2));
		}
		else
			line(t, "audio device", "(none open)");
		const auto setup = manager.getAudioDeviceSetup();
		line(t, "chosen output", setup.outputDeviceName.isEmpty() ? juce::String("(default)") : setup.outputDeviceName);
		line(t, "chosen input", setup.inputDeviceName.isEmpty() ? juce::String("(none)") : setup.inputDeviceName);
		line(t, "chosen sample rate", juce::String(setup.sampleRate));
		line(t, "chosen buffer", juce::String(setup.bufferSize));
		t << "\n";
		for(const auto& port : juce::MidiInput::getAvailableDevices())
			line(t, "midi in", port.name + (manager.isMidiInputDeviceEnabled(port.identifier) ? " (enabled)" : " (off)"));
		for(const auto& port : juce::MidiOutput::getAvailableDevices())
			line(t, "midi out", port.name + (port.identifier == manager.getDefaultMidiOutputIdentifier() ? " (chosen)" : ""));
		return t;
	}

	void run(AudioPluginAudioProcessor& _processor)
	{
		const auto zip = juce::File::getSpecialLocation(juce::File::userDesktopDirectory).getChildFile(
			defaultFileName(_processor.getModel() == md::MachineModel::Monomachine, juce::Time::getCurrentTime()));
		// everything is read now, on the message thread, so the answer of the chooser needs no processor
		diagnosticsZip::Input input;
		input.logsFolder = _processor.performanceDiagnosticsFolder();
		input.settingsFile = juce::File(_processor.getConfigFile());
		input.info = infoText(_processor);
		input.audioMidi = audioMidiText(_processor);
		g_chooser = std::make_unique<juce::FileChooser>("Save the diagnostics (one zip to send with a report)", zip, "*.zip");
		g_chooser->launchAsync(juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles
			| juce::FileBrowserComponent::warnAboutOverwriting,
			[input](const juce::FileChooser& _c)
			{
				auto target = _c.getResult();
				if(target == juce::File())
					return;	// cancelled
				if(!target.hasFileExtension("zip"))
					target = target.withFileExtension("zip");
				const auto result = diagnosticsZip::write(input, target);
				if(result.failed())
				{
					juce::AlertWindow::showMessageBoxAsync(juce::MessageBoxIconType::WarningIcon, "Save Diagnostics",
						result.getErrorMessage());
					return;
				}
				target.revealToUser();
			});
	}
}
