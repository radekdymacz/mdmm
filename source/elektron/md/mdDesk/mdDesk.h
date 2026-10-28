#pragma once

#include "mdDeskAdapter.h"
#include "mdDeskModel.h"
#include "mdDeskSetup.h"
#include "mdDeskTelemetry.h"

#include "deskCore/deskDesk.h"

#include "elektronData/json.h"
#include "elektronData/mdSamples.h"
#include "mdDataLink/mdDataLink.h"

#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace mdDesk
{
	// The Machinedrum Editor behind its page (P6): deskCore's Desk (core, one adapter from the
	// engine map, the table's router) plus what is the Machinedrum's own: the editor's setup (app
	// modulators, knob rows) and the device facts it forwards to its adapter. The plug-in's session
	// owns one, so it outlives the editor window; the firmware smoke tests drive one directly.
	class Desk final : public deskCore::Desk<MdModel, MdAdapter>
	{
	public:
		using Bytes = std::vector<uint8_t>;
		using Value = elektronData::json::Value;
		using Probe = MdAdapter::Probe;
		using Adapter = MdAdapter;
		using Profile = mdDesk::Profile;
		using DevicePort = mdDesk::DevicePort;

		// The device edge (the engine's) plus the page and the project's setup store.
		struct Port
		{
			DevicePort device;
			std::function<void(const Value& _message)> toPage;
			// The editor's setup (md-desk/setup) changed: keep it with the project.
			std::function<void(const Value& _setup)> saveSetup;
			// After every ready of a page, once the desk has published its own documents.
			std::function<void()> ready;
		};

		// With the Machinedrum adapter both engines use (MdMachine), for this profile.
		explicit Desk(Port _port, const Profile& _profile = emulatorProfile());
		// With an engine's own adapter.
		Desk(std::unique_ptr<MdAdapter> _adapter, Port _port);

		// The adapter both engines of the engine map use today: mdDataLink over the device edge.
		static std::unique_ptr<MdAdapter> defaultAdapter(const Profile& _profile, const DevicePort& _device);

		// deskCore's, plus the progress of a sample on its way (P9: the wire engine feeds no telemetry).
		void tick();
		void onDeviceSysex(const Bytes& _message);

		// A kit parameter changed outside the desk (host automation, MIDI learn). _index 24 = level.
		void onHostKitParam(uint8_t _track, uint8_t _index, uint8_t _value);
		void onHostMute(uint8_t _track, bool _muted);
		// Every tick, also without telemetry (valid = false).
		void onTelemetry(const Telemetry& _telemetry);
		// The working-kit region read from the machine's memory (elektronData::mdWorkingKitFromMemory).
		void onWorkingKitMemory(const Bytes& _region);
		void setProbe(Probe _probe);
		// P9, UW samples. The bank read from the emulated machine's memory (md::DeskDevice): published to
		// the page as {"type":"samples","doc"} (md-desk/samples) when it changed and after every ready. A reset
		// (the machine started over: the page drops every document) forgets it: the next bank is published,
		// also when it is the same (B-012).
		void onSampleBank(const elektronData::MdSampleBank& _bank);
		// Whether the desk holds a bank: without one, the engine hands it the device's current bank again.
		bool hasSamples() const { return m_samples.has_value(); }
		// The page's ops on them (Owner::Setup rows, the desk's own): sampleWave {bank, slot, bins} answers
		// {"type":"sampleWave"} (the slot at up to bins min, max pairs, 16-bit: the overview's 128 are for the
		// list); audition {bank, slot} plays the slot once on the plug-in's own output through the adapter
		// (the emulator mixes it in; another engine cannot), auditionStop stops it. {"type":"audition"}
		// says playing, then stopped (stopped, played out, replaced or the device gone).
		// A sample file the user chose for ROM slot _slot (0-47; the plug-in read it, it never passes
		// through the page): decoded (WAV, AIFF), made mono 16-bit at 44.1 kHz at most and cut to the
		// sample memory left, then sent as SDS with its name (0x73, from the file name). The page hears
		// {"type":"sampleLoad", ...} as it goes. The reason when it does not start ("" = it started).
		std::string loadSample(uint8_t _slot, const std::string& _fileName, const Bytes& _file);
		// 0.9, the sample manager (doc/release/0.9/md-sample-manager.md). Export: the samples of _bank ("rom"|"ram") slot _slot
		// (0-47, 0-3), or every slot of the bank that holds one (_all), as WAV files (16-bit mono at the slot's own rate,
		// exactly the samples the bank read from the machine). Pure: the plug-in's session writes the files. Empty, with
		// _why, when there is nothing to export (a real machine, an empty slot, the samples not read yet).
		struct ExportFile
		{
			std::string name;
			Bytes data;
		};
		// _format "syx" (ROM slots only): the SDS dump the machine's own SEND makes (header, name, packets), the slot's position in it,
		// so an ORG receive puts it back where it was.
		std::vector<ExportFile> exportSamples(const std::string& _bank, int _slot, bool _all, const std::string& _format, std::string& _why) const;
		// The setup stored with the project (md-desk/setup): what of it this version can use, the default for the rest
		// (never the previous project's); errors say what was left out.
		std::vector<std::string> loadSetup(const Value& _setup);
		const DeskSetup& setup() const { return m_setup; }
		// MIDI Learn (0.8): the learned CCs, part of the setup. setMappings keeps them with the project and says so on the
		// setup document.
		const std::vector<deskCore::LearnMapping>& mappings() const { return m_setup.mappings; }
		void setMappings(std::vector<deskCore::LearnMapping> _mappings);

		// MIDI Learn's global targets (B-169), by id (append-only: a saved project names them): the four master effects
		// (RHYTHM ECHO 0-7, GATE BOX 8-15, MASTER EQ 16-23, DYNAMIX 24-31, in the page's knob order), the tempo (32) and
		// the playing pattern's SWING (33) and ACCENT amount (34). Applied by deskCore::Desk::applyLearnGlobals.
		static const std::vector<deskCore::LearnGlobalSpec>& learnGlobals();

		bool isBusy() const { return machine().busy(); }
		// The default adapter's protocol facts (MdMachine), for tests and diagnostics; empty, false
		// and -1 for another adapter. Not part of MdAdapter: an engine with its own protocol has none.
		const mdDataLink::Session::State& linkState() const;
		bool isReady() const;
		double lastRoundTripMs() const;

		// The Owner::Setup ops the desk has a function for (checked against the table).
		static std::vector<std::string> setupOps();

	protected:
		const std::vector<deskCore::LearnGlobalSpec>& learnGlobalSpecs() const override { return learnGlobals(); }
		std::optional<int> learnGlobalValue(int _id, const Value& _state) const override;
		Value learnGlobalMessage(int _id, int _value, const Value& _state) const override;

	private:
		static const std::map<std::string, void (Desk::*)(const Value&)>& setups();
		void onSetup(const Value& _message) override;
		void setModulators(const Value& _message);
		void setKnobs(const Value& _message);
		void setSolo(const Value& _message);
		void setFollow(const Value& _message);
		void publishSolo();
		void onReadyExtra() override;
		void onStartOver() override;
		void publishSetup();
		void publishModulators();
		void saveSetup() const;
		void runModulators();
		void publishSampleLoad(bool _force = false);
		void publishSamples();
		// P9: a slot's detail and the audition (the desk's own: they read the bank it holds).
		void renameSample(const Value& _message);
		// 0.9: copy, paste, RAM to ROM and undo of a slot's samples
		void copySample(const Value& _message);
		void pasteSample(const Value& _message);
		void ramToRom(const Value& _message);
		void undoSample(const Value& _message);
		void sampleWave(const Value& _message);
		void audition(const Value& _message);
		void auditionStop(const Value& _message);
		const elektronData::MdSampleSlot* sampleSlotOf(const Value& _message, std::string& _why) const;
		void pollAudition();
		void publishAudition(bool _playing);

		// What a copy holds (the samples, shared and never changed) and what a step replaced (the undo).
		struct SampleClip
		{
			bool ram = false;
			uint8_t slot = 0;
			std::string name;
			uint32_t rate = 0;
			bool loop = false;
			std::shared_ptr<const std::vector<int16_t>> pcm;
			uint32_t length() const { return pcm ? static_cast<uint32_t>(pcm->size()) : 0; }
		};
		struct SampleStep
		{
			uint8_t slot = 0;
			std::string what;
			SampleClip before;
		};
		static constexpr size_t g_sampleUndoSteps = 16;
		// The memory ROM slot _slot may fill (the other slots and a second for each RAM buffer kept), in samples.
		uint32_t sampleRoom(uint8_t _slot) const;
		// The step that puts back what ROM slot _slot holds now, or none (empty slot, samples not read).
		std::optional<SampleStep> sampleStepOf(uint8_t _slot, const std::string& _what) const;
		// _clip to ROM slot _slot as SDS; _record: a step to undo it when it ends done. The reason it did not start.
		std::string sendClip(uint8_t _slot, const SampleClip& _clip, const std::string& _file, const std::string& _what, bool _record);
		std::string copyFrom(const std::string& _bank, size_t _slot);
		void publishSampleHistory(bool _force);

		std::optional<elektronData::MdSampleBank> m_samples;
		std::optional<SampleClip> m_clip;
		std::vector<SampleStep> m_sampleSteps;
		std::string m_historyKey;
		// The sample on its way, for the page's progress (what the adapter's sender says, plus the file).
		struct SampleLoad
		{
			uint8_t slot = 0;
			std::string file, name;
			uint32_t rate = 0, length = 0;
			std::vector<std::string> notes;
			int last = -1;				// the last published state and per cent
			std::optional<SampleStep> step;	// kept for the undo when the send ends done
			bool undoing = false;			// this send is an undo: its step goes when it ends done
		};
		std::optional<SampleLoad> m_sampleLoad;
		// The audition the page asked for, until the device says it stopped or played out.
		struct Audition
		{
			bool ram = false;
			uint8_t slot = 0;
			uint32_t length = 0, rate = 0;
			uint64_t id = 0;
		};
		std::optional<Audition> m_audition;
		std::function<void(const Value&)> m_saveSetup;
		DeskSetup m_setup;
		ModEngine m_mods;
	};
}
