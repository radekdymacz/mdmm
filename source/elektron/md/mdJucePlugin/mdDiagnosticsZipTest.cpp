// 1.0 review M5 (Save Diagnostics): the zip holds the logs, the text and the settings, and never a ROM or the machine's
// memory. A temp folder holds fake logs (two generations of each), a fake performance capture, a fake ROM image and a
// fake machine-memory file in the logs folder itself and beside it; the zip must hold the newest logs and none of the
// others. No ROM, no machine.
#include "mdDiagnosticsZip.h"

#include <cstdio>
#include <set>
#include <string>

namespace
{
	int g_failures = 0;
	void check(const bool _ok, const std::string& _what)
	{
		std::printf("  %s %s\n", _ok ? "ok  " : "FAIL", _what.c_str());
		if(!_ok)
			++g_failures;
	}

	void put(const juce::File& _file, const juce::String& _text, const juce::Time& _time)
	{
		_file.getParentDirectory().createDirectory();
		_file.replaceWithText(_text);
		_file.setLastModificationTime(_time);
	}

	std::set<std::string> names(const juce::File& _zip)
	{
		std::set<std::string> result;
		juce::ZipFile zip(_zip);
		for(int i = 0; i < zip.getNumEntries(); ++i)
			result.insert(zip.getEntry(i)->filename.toStdString());
		return result;
	}

	juce::String textOf(const juce::File& _zip, const juce::String& _name)
	{
		juce::ZipFile zip(_zip);
		const auto* const entry = zip.getEntry(_name);
		if(!entry)
			return {};
		const std::unique_ptr<juce::InputStream> in(zip.createStreamForEntry(*entry));
		return in ? in->readEntireStreamAsString() : juce::String();
	}
}

int main()
{
	std::printf("mdDiagnosticsZipTest\n");
	const auto root = juce::File::createTempFile("mdDiagnosticsZipTest");
	const auto logs = root.getChildFile("data/logs");
	const auto now = juce::Time::getCurrentTime();
	const auto old = now - juce::RelativeTime::days(2);

	put(logs.getChildFile("editor-md.log"), "NEW LOG", now);
	put(logs.getChildFile("editor-md-previous.log"), "PREVIOUS LOG", now);
	put(logs.getChildFile("editor-mm.log"), "OLD LOG OF ANOTHER RUN", old);
	put(logs.getChildFile("editor-mm-previous.log"), "OLD PREVIOUS", old);
	put(logs.getChildFile("standalone-startup-last.log"), "STARTUP", now);
	put(logs.getChildFile("performance-20261101-100000-a.jsonl"), "OLD CAPTURE", old);
	put(logs.getChildFile("performance-20261101-110000-b.jsonl"), "NEW CAPTURE", now);
	// what must never be in: a ROM and the machine's memory, in the logs folder (a mistake of a user, a future bug) and
	// where they really live; a project and a sample too
	put(logs.getChildFile("MD-firmware.bin"), "FAKE ROM BYTES", now);
	put(logs.getChildFile("rom.zip"), "FAKE ROM ZIP", now);
	put(logs.getChildFile("machine-memory.mdmem"), "FAKE MACHINE MEMORY", now);
	put(root.getChildFile("data/ROMs/MD-firmware.bin"), "FAKE ROM BYTES", now);
	put(root.getChildFile("data/machine-memory/md.mem"), "FAKE MACHINE MEMORY", now);
	put(root.getChildFile("data/projects/song.mdproject"), "FAKE PROJECT", now);
	put(root.getChildFile("data/samples/kick.wav"), "FAKE SAMPLE", now);
	put(root.getChildFile("data/settings.settings"), "<PROPERTIES><VALUE name=\"scale\" val=\"100\"/></PROPERTIES>", now);

	mdJucePlugin::diagnosticsZip::Input input;
	input.logsFolder = logs;
	input.settingsFile = root.getChildFile("data/settings.settings");
	input.info = "version: 1.2.3\nos: Test OS";
	input.audioMidi = "sample rate: 44100";

	check(mdJucePlugin::diagnosticsZip::isLogName("editor-md.log"), "editor-md.log is a log name");
	check(!mdJucePlugin::diagnosticsZip::isLogName("MD-firmware.bin"), "a ROM is not a log name");
	check(!mdJucePlugin::diagnosticsZip::isLogName("machine-memory.mdmem"), "the machine memory is not a log name");

	const auto zip = root.getChildFile("out/machinedrum-editor-diagnostics-2026-11-01.zip");
	const auto result = mdJucePlugin::diagnosticsZip::write(input, zip);
	check(result.wasOk(), "the zip is written: " + result.getErrorMessage().toStdString());
	check(zip.existsAsFile() && zip.getSize() > 0, "the zip exists");

	const auto in = names(zip);
	check(in.count("info.txt") == 1, "info.txt is in");
	check(in.count("audio-midi.txt") == 1, "audio-midi.txt is in");
	check(in.count("logs/editor-md.log") == 1, "the newest log is in");
	check(in.count("logs/editor-md-previous.log") == 1, "the newest previous log is in");
	check(in.count("logs/standalone-startup-last.log") == 1, "the standalone's start-up log is in");
	check(in.count("performance/performance-20261101-110000-b.jsonl") == 1, "the newest performance capture is in");
	check(in.count("settings/settings.settings") == 1, "the settings are in");
	check(in.count("logs/editor-mm.log") == 0 && in.count("logs/editor-mm-previous.log") == 0, "older logs are left out");
	check(in.count("performance/performance-20261101-100000-a.jsonl") == 0, "an older capture is left out");

	bool rom = false, memory = false, project = false, sample = false;
	for(const auto& n : in)
	{
		const juce::String s(n);
		rom = rom || s.containsIgnoreCase("firmware") || s.endsWithIgnoreCase(".bin") || s.containsIgnoreCase("rom.zip");
		memory = memory || s.containsIgnoreCase("memory") || s.endsWithIgnoreCase(".mem") || s.endsWithIgnoreCase(".mdmem");
		project = project || s.containsIgnoreCase("project") || s.containsIgnoreCase("song");
		sample = sample || s.endsWithIgnoreCase(".wav");
	}
	check(!rom, "no ROM or firmware file is in");
	check(!memory, "no machine-memory file is in");
	check(!project && !sample, "no project or sample is in");
	check(in.size() == 7, "the zip holds exactly the seven entries: " + std::to_string(in.size()));

	check(textOf(zip, "logs/editor-md.log") == "NEW LOG", "the log's text is whole");
	check(textOf(zip, "info.txt").contains("Test OS"), "the info text is in");
	for(const auto& n : in)
	{
		const auto text = textOf(zip, n);
		check(!text.contains("FAKE ROM") && !text.contains("FAKE MACHINE MEMORY"), "no entry carries a ROM or memory byte: " + n);
	}

	root.deleteRecursively();
	std::printf(g_failures ? "mdDiagnosticsZipTest: FAIL (%d)\n" : "mdDiagnosticsZipTest: PASS\n", g_failures);
	return g_failures ? 1 : 0;
}
