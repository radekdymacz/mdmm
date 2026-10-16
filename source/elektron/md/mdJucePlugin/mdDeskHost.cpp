#include "mdDeskHost.h"

#include "mdController.h"
#include "mdDeskSession.h"
#include "mdPluginProcessor.h"
#if MDMM_EDITFLOW_DRIVER
#include "mdEditFlowDriver.h"
#endif

#include "baseLib/binarystream.h"
#include "juceUiLib/messageRoute.h"
#include "jucePluginLib/dummydevice.h"

#include <algorithm>
#include <array>
#include <optional>

namespace mdJucePlugin
{
	synthLib::Device* makeNoRomDevice()
	{
		return new pluginLib::DummyDevice({});
	}

	bool isNoRomDevice(const synthLib::Device* const _device)
	{
		return dynamic_cast<const pluginLib::DummyDevice*>(_device) != nullptr;
	}

	DeskHost::DeskHost(AudioPluginAudioProcessor& _processor) : m_processor(_processor)
	{
		genericUI::messageRoute::enable();	// no native alerts: the page shows what the plug-in has to say
	}

	DeskHost::~DeskHost()
	{
		genericUI::messageRoute::forget(static_cast<const void*>(&m_processor));	// its notices that wait for a window
		m_editFlowDriver.reset();
	}

	std::vector<uint8_t> DeskHost::automationSnapshot() const
	{
		if(!m_processor.hasController())
			return {};
		return dynamic_cast<const Controller&>(m_processor.getController()).createAutomationSnapshot();
	}

	namespace
	{
		// The project's chunks that live without a machine: the editor's setup, the DAW's automation parameters, the MIDI
		// mapping. The rest (the device state "MIDI", the machine memory's mark "MMEM", ...) is the machine's or is
		// taken from the project when the machine comes.
		constexpr std::array<std::array<char, 4>, 3> g_machineFree{pluginLib::fourCC("MDSK"), pluginLib::fourCC("AUTO"), pluginLib::fourCC("MDLN")};
	}

	// Those chunks as the plug-in writes them now (the processor's own writers: saveChunks, pluginLib's MIDI learn).
	std::vector<pluginLib::ProjectChunk> DeskHost::machineFreeChunks() const
	{
		baseLib::BinaryStream s;
		saveChunks(s);
		if(auto* learn = m_processor.getMidiLearnTranslator())
			learn->saveChunkData(s);
		std::vector<uint8_t> block;
		s.toVector(block);
		auto chunks = pluginLib::parseChunks(block);
		return chunks ? std::move(*chunks) : std::vector<pluginLib::ProjectChunk>{};
	}

	// A project's chunks of those kinds, read by the processor's own readers (none: the setup is the default, the others
	// stay as they are, as with any project load).
	void DeskHost::applyMachineFreeChunks(const pluginLib::ProjectState& _project)
	{
		std::vector<pluginLib::ProjectChunk> given;
		for(const auto& k : g_machineFree)
			if(const auto* c = pluginLib::findChunk(_project.chunks, k))
				given.push_back(*c);
		beginProjectLoad();
		baseLib::BinaryStream s(pluginLib::writeChunks(given));
		baseLib::ChunkReader reader(s);
		addChunkReaders(reader);
		if(auto* learn = m_processor.getMidiLearnTranslator())
			learn->loadChunkData(reader);
		(void)reader.tryRead();
	}

	bool DeskHost::holdState(const void* const _data, const int _size)
	{
		if(m_processor.machineFacts().kind != MachineFacts::Kind::NoRom)
			return false;
		std::vector<uint8_t> project(static_cast<const uint8_t*>(_data), static_cast<const uint8_t*>(_data) + std::max(_size, 0));
		// What lives without a machine follows the project at once: the editor's setup, the DAW's parameters, the MIDI mapping.
		if(const auto p = pluginLib::parseProject(project))
			applyMachineFreeChunks(*p);
		auto free = machineFreeChunks();
		const std::lock_guard lock(m_heldMutex);
		m_held = std::move(project);
		m_heldFree = std::move(free);
		return true;
	}

	// The held project with every machine-free chunk that moved since it was given rewritten (the rest byte for byte);
	// none when something moved and no project is held.
	std::optional<std::vector<uint8_t>> DeskHost::heldProject() const
	{
		std::vector<uint8_t> held;
		std::vector<pluginLib::ProjectChunk> heldFree;
		{
			const std::lock_guard lock(m_heldMutex);
			held = m_held;
			heldFree = m_heldFree;
		}
		const auto now = machineFreeChunks();
		if(now == heldFree)
			return held;
		if(held.empty())
			return std::nullopt;	// no project to keep: the plug-in's own state saves them
		auto project = pluginLib::parseProject(held);
		if(!project)
			return held;
		pluginLib::putMoved(project->chunks, heldFree, now);
		return pluginLib::writeProject(*project);
	}

	bool DeskHost::heldState(juce::MemoryBlock& _out) const
	{
		if(m_processor.machineFacts().kind != MachineFacts::Kind::NoRom)
			return false;
		const auto project = heldProject();
		if(!project)
			return false;
		_out.append(project->data(), project->size());
		return true;
	}

	bool DeskHost::takeHeldState(std::vector<uint8_t>& _out)
	{
		// what moved while it was held goes to the machine with it
		auto project = heldProject();
		const std::lock_guard lock(m_heldMutex);
		_out = project && !m_held.empty() ? std::move(*project) : std::move(m_held);
		m_held.clear();
		m_heldFree.clear();
		return !_out.empty();
	}

	void DeskHost::startSession()
	{
		m_session = DeskSession::create(m_processor);
#if MDMM_EDITFLOW_DRIVER
		m_editFlowDriver = startEditFlowDriver(m_processor, *m_session);
#endif
	}

	void DeskHost::saveChunks(baseLib::BinaryStream& _stream) const
	{
		if(const auto s = setup(); !s.empty())
		{
			baseLib::ChunkWriter chunk(_stream, "MDSK", 1);
			_stream.write(s);
		}
		if(const auto snapshot = automationSnapshot(); !snapshot.empty())
		{
			baseLib::ChunkWriter chunk(_stream, "AUTO", 1);
			_stream.write(snapshot);
		}
	}

	void DeskHost::addChunkReaders(baseLib::ChunkReader& _reader)
	{
		_reader.add("MDSK", 1, [this](baseLib::BinaryStream& _stream, uint32_t)
		{
			setSetup(_stream.readString());
		});
		_reader.add("AUTO", 1, [this](baseLib::BinaryStream& _stream, uint32_t)
		{
			std::vector<uint8_t> snapshot;
			_stream.read(snapshot);
			if(m_processor.hasController())
				(void)dynamic_cast<Controller&>(m_processor.getController()).restoreAutomationSnapshot(snapshot);
		});
	}

	std::string DeskHost::setup() const
	{
		const std::lock_guard lock(m_setupMutex);
		return m_setup;
	}

	void DeskHost::setSetup(std::string _json)
	{
		const std::lock_guard lock(m_setupMutex);
		m_setup = std::move(_json);
		// The session picks it up on the message thread, whichever thread set it.
		m_setupVersion.fetch_add(1, std::memory_order_release);
	}
}
