#include "mdDiagnosticsZip.h"

namespace mdJucePlugin::diagnosticsZip
{
	namespace
	{
		bool isPreviousLog(const juce::String& _name)
		{
			return _name.startsWith("editor-") && _name.endsWith("-previous.log");
		}

		bool isCurrentLog(const juce::String& _name)
		{
			return _name.startsWith("editor-") && _name.endsWith(".log") && !isPreviousLog(_name);
		}

		bool isStartupLog(const juce::String& _name)
		{
			return _name == "standalone-startup-last.log";
		}

		// The newest file of the folder whose name _accept takes (an unset File when none)
		template<typename Accept>
		juce::File newest(const juce::File& _folder, const Accept& _accept)
		{
			juce::File best;
			if(!_folder.isDirectory())
				return best;
			for(const auto& entry : juce::RangedDirectoryIterator(_folder, false, "*", juce::File::findFiles))
			{
				const auto f = entry.getFile();
				if(!_accept(f.getFileName()) || entry.getFileSize() > g_maxFileBytes)
					continue;
				if(best == juce::File() || f.getLastModificationTime() > best.getLastModificationTime())
					best = f;
			}
			return best;
		}
	}

	bool isLogName(const juce::String& _name)
	{
		return isCurrentLog(_name) || isPreviousLog(_name) || isStartupLog(_name);
	}

	bool isPerformanceName(const juce::String& _name)
	{
		return _name.startsWith("performance-") && _name.endsWith(".jsonl");
	}

	std::vector<std::pair<juce::String, juce::File>> selectFiles(const Input& _input)
	{
		std::vector<std::pair<juce::String, juce::File>> files;
		const auto add = [&files](const char* _dir, const juce::File& _file)
		{
			if(_file != juce::File())
				files.emplace_back(juce::String(_dir) + "/" + _file.getFileName(), _file);
		};
		add("logs", newest(_input.logsFolder, isCurrentLog));
		add("logs", newest(_input.logsFolder, isPreviousLog));
		add("logs", newest(_input.logsFolder, isStartupLog));
		add("performance", newest(_input.logsFolder, isPerformanceName));
		if(_input.settingsFile.existsAsFile() && _input.settingsFile.getSize() <= g_maxFileBytes)
			add("settings", _input.settingsFile);
		return files;
	}

	juce::Result write(const Input& _input, const juce::File& _zip)
	{
		juce::ZipFile::Builder builder;
		const auto now = juce::Time::getCurrentTime();
		const auto addText = [&](const char* _name, const juce::String& _text)
		{
			juce::MemoryOutputStream block;
			block.writeText(_text, false, false, "\n");
			builder.addEntry(new juce::MemoryInputStream(block.getData(), block.getDataSize(), true), 9, _name, now);
		};
		addText("info.txt", _input.info);
		addText("audio-midi.txt", _input.audioMidi);
		for(const auto& [name, file] : selectFiles(_input))
		{
			const auto stream = file.createInputStream();
			if(!stream)
				continue;
			juce::MemoryBlock data;
			stream->readIntoMemoryBlock(data);
			builder.addEntry(new juce::MemoryInputStream(data, true), 9, name, file.getLastModificationTime());
		}

		_zip.getParentDirectory().createDirectory();
		_zip.deleteFile();
		juce::FileOutputStream out(_zip);
		if(out.failedToOpen())
			return juce::Result::fail("Could not write " + _zip.getFullPathName() + ": " + out.getStatus().getErrorMessage());
		if(!builder.writeToStream(out, nullptr))
			return juce::Result::fail("Could not write the zip: " + out.getStatus().getErrorMessage());
		out.flush();
		return juce::Result::ok();
	}
}
