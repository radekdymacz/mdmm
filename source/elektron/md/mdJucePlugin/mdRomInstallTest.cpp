// P7: the ROM install validator (mdRomInstall, md::checkRom): wrong size, not a .bin, a .zip without a .bin,
// an unknown 8 MiB image, the other machine's firmware, and a copy that never overwrites. With the real
// firmware images (the user's own, only when GEARMULATOR_MD_FIRMWARE_BIN / GEARMULATOR_MM_FIRMWARE_BIN are
// set) also the accepted case; they are read in place, never copied into the repository.
#include "mdRomInstall.h"

#include "mdLib/mdromcheck.h"

#include <cstdio>
#include <cstdlib>

namespace
{
	int g_failures = 0;
	void check(const bool _ok, const std::string& _what, const std::string& _text = {})
	{
		std::printf("  %s %s%s\n", _ok ? "ok  " : "FAIL", _what.c_str(), _text.empty() ? "" : (": " + _text).c_str());
		if(!_ok) ++g_failures;
	}
	bool has(const std::string& _s, const char* _part) { return _s.find(_part) != std::string::npos; }

	juce::File zipWith(const juce::File& _dir, const juce::String& _name, const juce::String& _entry, const juce::MemoryBlock& _data)
	{
		juce::ZipFile::Builder b;
		b.addEntry(new juce::MemoryInputStream(_data, true), 0, _entry, juce::Time::getCurrentTime());
		auto f = _dir.getChildFile(_name);
		f.deleteFile();
		juce::FileOutputStream out(f);
		b.writeToStream(out, nullptr);
		return f;
	}
}

int main()
{
	using md::MachineModel;
	const auto dir = juce::File::createTempFile("mdRomInstallTest");
	dir.createDirectory();
	const auto roms = dir.getChildFile("roms");

	auto small = dir.getChildFile("small.bin");
	small.replaceWithData("abc", 3);
	auto r = mdJucePlugin::installRom(small, MachineModel::Machinedrum, roms);
	check(!r.ok && has(r.text, "exactly 8 MiB"), "a file of the wrong size is refused", r.text);

	auto txt = dir.getChildFile("notes.txt");
	txt.replaceWithText("hello");
	r = mdJucePlugin::installRom(txt, MachineModel::Machinedrum, roms);
	check(!r.ok && has(r.text, ".bin"), "a file that is not a .bin or .zip is refused", r.text);

	juce::MemoryBlock text("readme", 6);
	auto noBin = zipWith(dir, "nobin.zip", "readme.txt", text);
	r = mdJucePlugin::installRom(noBin, MachineModel::Machinedrum, roms);
	check(!r.ok && has(r.text, "holds no .bin"), "a .zip without a .bin is refused", r.text);

	// a SysEx file chosen where the ROM goes: said so, with where SysEx goes instead
	juce::MemoryBlock sysex("\xF0\x00\x20\x3C\x02\x00\xF7", 7);
	auto syx = dir.getChildFile("backup.syx");
	syx.replaceWithData(sysex.getData(), sysex.getSize());
	r = mdJucePlugin::installRom(syx, MachineModel::Machinedrum, roms);
	check(!r.ok && has(r.text, "This is a SysEx file, not the ROM image"), "a .syx is refused as SysEx, not the ROM", r.text);
	auto syxZip = zipWith(dir, "backup.zip", "backup/kits.syx", sysex);
	r = mdJucePlugin::installRom(syxZip, MachineModel::Monomachine, roms);
	check(!r.ok && has(r.text, "This is a SysEx file, not the ROM image"), "and so is a .zip holding .syx files and no ROM", r.text);

	juce::MemoryBlock zeros(md::g_romSize, true);
	auto unknown = zipWith(dir, "unknown.zip", "unknown.bin", zeros);
	r = mdJucePlugin::installRom(unknown, MachineModel::Machinedrum, roms);
	check(!r.ok && has(r.text, "not the Machinedrum OS 1.63"), "an unknown 8 MiB image is refused", r.text);
	check(!roms.exists() || roms.getNumberOfChildFiles(juce::File::findFiles) == 0, "nothing was copied for a refused file");

	// the real images, when the user's own are given
	for(const auto& [var, model, other] : {std::tuple{"GEARMULATOR_MD_FIRMWARE_BIN", MachineModel::Machinedrum, MachineModel::Monomachine},
		std::tuple{"GEARMULATOR_MM_FIRMWARE_BIN", MachineModel::Monomachine, MachineModel::Machinedrum}})
	{
		const char* path = std::getenv(var);
		if(!path || !juce::File(path).existsAsFile())
		{
			std::printf("  skip %s not set: the accepted case is not checked\n", var);
			continue;
		}
		const juce::File rom(path);
		r = mdJucePlugin::installRom(rom, other, roms);
		check(!r.ok && has(r.text, "This is the"), std::string("the ") + md::firmwareName(model) + " is refused by the other editor", r.text);
		r = mdJucePlugin::installRom(rom, model, roms);
		check(r.ok && r.installed.existsAsFile() && has(r.text, "found"), std::string("the ") + md::firmwareName(model) + " is accepted and copied", r.text);
		const auto first = r.installed;
		r = mdJucePlugin::installRom(rom, model, roms);
		check(r.ok && r.installed == first && has(r.text, "already"), "the same image is not copied twice", r.text);
		first.replaceWithText("another file of that name");
		r = mdJucePlugin::installRom(rom, model, roms);
		check(r.ok && r.installed != first && first.loadFileAsString() == "another file of that name", "another file of that name is kept (no overwrite)", r.installed.getFileName().toStdString());
		juce::MemoryBlock img;
		rom.loadFileAsData(img);
		auto zipped = zipWith(dir, "zipped.zip", "inside/" + rom.getFileName(), img);
		r = mdJucePlugin::installRom(zipped, model, roms.getChildFile("z"));
		check(r.ok, "the image inside a .zip is accepted", r.text);

		// Several images sit in the folder; nothing is ever deleted (I-071)
		// a folder per machine: the other machine's pass must not leave its images here
		const auto mine = dir.getChildFile(std::string("manage-") + var);
		const auto folder = mine.getChildFile("roms");
		folder.createDirectory();
		const auto decoy = mine.getChildFile("outside.bin");		// an image outside the folder: never touched
		decoy.replaceWithData(img.getData(), img.getSize());
		const auto note = folder.getChildFile("readme.txt");		// not an image: never touched
		note.replaceWithText("keep me");
		const auto oldName = folder.getChildFile("old-name.bin");
		oldName.replaceWithData(img.getData(), img.getSize());
		check(mdJucePlugin::romsInFolder(model, folder).size() == 1, "the folder holds one image of this machine");
		check(mdJucePlugin::romsInFolder(other, folder).empty(), "and none of the other machine's");
		const auto fresh = dir.getChildFile("new-dump.bin");
		fresh.replaceWithData(img.getData(), img.getSize());
		r = mdJucePlugin::installRom(fresh, model, folder);
		auto now = mdJucePlugin::romsInFolder(model, folder);
		check(r.ok && now.size() == 2 && oldName.existsAsFile() && fresh.existsAsFile() && r.installed.getFileName() == "new-dump.bin",
			"a second image joins the first: the earlier one is not deleted, the chosen file stays where it was", r.text);
		// the user's own copy made in the folder (the report): choosing it deletes nothing
		const auto copy = folder.getChildFile("my-copy.bin");
		oldName.copyFileTo(copy);
		r = mdJucePlugin::installRom(copy, model, folder);
		check(r.ok && r.installed == copy && mdJucePlugin::romsInFolder(model, folder).size() == 3 && oldName.existsAsFile() && copy.existsAsFile(),
			"a copy the user made in the folder is used where it is and every other file stays", r.text);
		const auto chosen = mdJucePlugin::findRomByName(model, folder, "my-copy.bin");
		check(chosen && *chosen == copy, "an image is found by its file name");
		check(!mdJucePlugin::findRomByName(model, folder, "../outside.bin") && !mdJucePlugin::findRomByName(model, folder, "readme.txt")
			&& !mdJucePlugin::findRomByName(model, folder, "") && !mdJucePlugin::findRomByName(other, folder, "my-copy.bin"),
			"a name with a path, a file that is no image, an empty name and the other machine's are never found");
		r = mdJucePlugin::installRom(dir.getChildFile("nothing.bin"), model, folder);
		check(!r.ok && mdJucePlugin::romsInFolder(model, folder).size() == 3, "a failed install leaves the images");
		// REMOVE moves the named image into the folder "removed"; nothing is deleted
		const auto gone = mdJucePlugin::removeRom(model, folder, "my-copy.bin");
		check(gone.removed == 1 && !copy.existsAsFile() && gone.movedTo.existsAsFile() && gone.movedTo.getParentDirectory().getFileName() == mdJucePlugin::g_removedFolder
			&& mdJucePlugin::romsInFolder(model, folder).size() == 2, "REMOVE moves the image aside, it is not deleted", gone.text);
		check(gone.movedTo.getSize() == static_cast<juce::int64>(img.getSize()), "and the moved file is whole");
		check(decoy.existsAsFile() && fresh.existsAsFile() && note.existsAsFile() && oldName.existsAsFile(), "REMOVE touched nothing else");
		check(mdJucePlugin::removeRom(model, folder, "my-copy.bin").removed == 0, "REMOVE of a name that is not there says so");
		check(mdJucePlugin::removeRom(model, folder, "../outside.bin").removed == 0 && decoy.existsAsFile(), "REMOVE never reaches outside the folder");
		// the same name removed twice keeps both files
		oldName.copyFileTo(copy);
		const auto again = mdJucePlugin::removeRom(model, folder, "my-copy.bin");
		check(again.removed == 1 && again.movedTo != gone.movedTo && again.movedTo.existsAsFile() && gone.movedTo.existsAsFile(), "a second image of the same name does not overwrite the first");
	}
	dir.deleteRecursively();
	std::printf("mdRomInstallTest: %s (%d failures)\n", g_failures ? "FAIL" : "PASS", g_failures);
	return g_failures ? 1 : 0;
}
