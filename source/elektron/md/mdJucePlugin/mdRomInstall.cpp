#include "mdRomInstall.h"

#include "mdLib/mdromcheck.h"

namespace mdJucePlugin
{
	namespace
	{
		// a SysEx file chosen where the ROM goes (the start-up card, LOAD ROM)
		constexpr const char* g_sysexNotRom = "This is a SysEx file, not the ROM image. Choose the ROM (.bin, 8 MB) here; import SysEx with Import SysEx\xE2\x80\xA6 after start-up.";
	}

	std::optional<std::vector<uint8_t>> readRomImage(const juce::File& _file, std::string& _why)
	{
		if(!_file.existsAsFile())
		{
			_why = "The file is not there any more.";
			return std::nullopt;
		}
		if(_file.hasFileExtension("syx"))
		{
			_why = g_sysexNotRom;
			return std::nullopt;
		}
		if(_file.hasFileExtension("zip"))
		{
			juce::ZipFile zip(_file);
			const juce::ZipFile::ZipEntry* found = nullptr;
			int bins = 0, syx = 0;
			for(int i = 0; i < zip.getNumEntries(); ++i)
			{
				const auto* e = zip.getEntry(i);
				if(e && e->filename.endsWithIgnoreCase(".syx") && !e->filename.contains("__MACOSX"))
					++syx;
				if(!e || !e->filename.endsWithIgnoreCase(".bin") || e->filename.contains("__MACOSX"))
					continue;
				++bins;
				if(e->uncompressedSize == md::g_romSize)
					found = e;
			}
			if(!found)
			{
				_why = !bins && syx ? g_sysexNotRom : bins ? "The .zip holds no 8 MiB .bin." : "The .zip holds no .bin file.";
				return std::nullopt;
			}
			std::unique_ptr<juce::InputStream> in(zip.createStreamForEntry(*found));
			juce::MemoryBlock mb;
			if(!in || in->readIntoMemoryBlock(mb) != static_cast<size_t>(md::g_romSize))
			{
				_why = "The .bin in the .zip could not be read.";
				return std::nullopt;
			}
			return std::vector<uint8_t>(static_cast<const uint8_t*>(mb.getData()), static_cast<const uint8_t*>(mb.getData()) + mb.getSize());
		}
		if(!_file.hasFileExtension("bin"))
		{
			_why = "Choose the firmware image (.bin), or a .zip with it.";
			return std::nullopt;
		}
		if(_file.getSize() > 64 * 1024 * 1024)
		{
			_why = "This file is far larger than a firmware image.";
			return std::nullopt;
		}
		juce::MemoryBlock mb;
		if(!_file.loadFileAsData(mb))
		{
			_why = "The file could not be read.";
			return std::nullopt;
		}
		return std::vector<uint8_t>(static_cast<const uint8_t*>(mb.getData()), static_cast<const uint8_t*>(mb.getData()) + mb.getSize());
	}

	RomInstall installRom(const juce::File& _file, const md::MachineModel _model, const juce::File& _romFolder)
	{
		std::string why;
		const auto image = readRomImage(_file, why);
		if(!image)
			return {false, why, {}};
		const auto check = md::checkRom(*image, _model);
		if(!check.ok)
			return {false, check.text, {}};
		if(_file.hasFileExtension("bin") && _file.getParentDirectory() == _romFolder)
			return {true, check.text + " (already in the ROM folder)", _file};	// used where it is, never copied or touched
		if(!_romFolder.createDirectory())
			return {false, "The ROM folder could not be made: " + _romFolder.getFullPathName().toStdString(), {}};
		// The name the user knows, as a .bin; an existing file of that name is kept (the same image is not copied twice).
		const auto base = _file.hasFileExtension("zip") ? _file.getFileNameWithoutExtension() : _file.getFileNameWithoutExtension();
		auto target = _romFolder.getChildFile(base + ".bin");
		for(int n = 2; target.existsAsFile(); ++n)
		{
			juce::MemoryBlock have;
			if(target.getSize() == static_cast<juce::int64>(image->size()) && target.loadFileAsData(have)
				&& std::memcmp(have.getData(), image->data(), image->size()) == 0)
				return {true, check.text + " (already in the ROM folder)", target};
			target = _romFolder.getChildFile(base + "-" + juce::String(n) + ".bin");
		}
		if(!target.replaceWithData(image->data(), image->size()))
			return {false, "The ROM could not be written to " + target.getFullPathName().toStdString(), {}};
		return {true, check.text, target};
	}

	std::vector<juce::File> romsInFolder(const md::MachineModel _model, const juce::File& _romFolder)
	{
		std::vector<juce::File> found;
		if(!_romFolder.isDirectory())
			return found;
		for(const auto& f : _romFolder.findChildFiles(juce::File::findFiles, false, "*.bin"))
		{
			if(!f.isAChildOf(_romFolder) || f.getSize() != static_cast<juce::int64>(md::g_romSize))
				continue;
			juce::MemoryBlock mb;
			if(!f.loadFileAsData(mb))
				continue;
			const std::vector<uint8_t> bytes(static_cast<const uint8_t*>(mb.getData()), static_cast<const uint8_t*>(mb.getData()) + mb.getSize());
			if(md::checkRom(bytes, _model).ok)
				found.push_back(f);
		}
		return found;
	}

	std::optional<juce::File> findRomByName(const md::MachineModel _model, const juce::File& _romFolder, const std::string& _name)
	{
		if(_name.empty() || _name.find_first_of("/\\") != std::string::npos || _name == "." || _name == "..")
			return std::nullopt;
		for(const auto& f : romsInFolder(_model, _romFolder))
			if(f.getFileName().toStdString() == _name)
				return f;
		return std::nullopt;
	}

	RomRemoval removeRom(const md::MachineModel _model, const juce::File& _romFolder, const std::string& _name)
	{
		RomRemoval r;
		const auto f = findRomByName(_model, _romFolder, _name);
		if(!f)
		{
			r.text = "There is no firmware image of that name in the ROM folder to remove.";
			return r;
		}
		const auto aside = _romFolder.getChildFile(g_removedFolder);
		if(!aside.createDirectory().wasOk())
		{
			r.text = "Could not make the folder " + aside.getFullPathName().toStdString() + ".";
			return r;
		}
		const auto target = aside.getNonexistentChildFile(f->getFileNameWithoutExtension(), ".bin", false);
		if(!f->moveFileTo(target))
		{
			r.text = "Could not move " + f->getFileName().toStdString() + " out of the ROM folder.";
			return r;
		}
		r.removed = 1;
		r.movedTo = target;
		r.text = "Moved " + f->getFileName().toStdString() + " to the folder \"" + g_removedFolder + "\" inside the ROM folder. Nothing was deleted.";
		return r;
	}
}
