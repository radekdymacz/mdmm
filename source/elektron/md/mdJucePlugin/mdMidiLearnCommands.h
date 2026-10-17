#pragma once

#include "mdLearnRouter.h"

#include "deskCore/deskLearn.h"

#include "deskHost/deskHost.h"

#include "elektronData/json.h"

#include <array>
#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <vector>

namespace pluginLib
{
	class Controller;
	class Parameter;
	class Processor;
}

namespace mdJucePlugin
{
	// The page's MIDI learn commands (P6: one implementation for both editors), on the setup's mappings and the realtime
	// LearnRouter (doc/midilearn/DESIGN-learn-0.8.md, decision C, slice L2). Message thread only.
	//   learnStart {t, [pg,] i}, learnAdd {cc, t, [pg,] i, [ch]}, learnCancel, learnRemove {index}, learnInvert {index}
	// The mappings are the desk's (DeskSetup::mappings, saved with the project); this class edits them with the pure
	// functions of deskLearn.h through the host's accessors, derives the audio thread's table from them and publishes it
	// to the router. Learning is pulled: the audio thread only captures CCs into the router's ring, step() drains it. There
	// is no callback, so nothing can free a closure that is running.
	//
	// The published document: {"type":"learn","doc":{"enabled", "mappings":[{index,t,[pg],i,name,cc,ch,mode,invert,
	// overrides:[{ch,t,[pg],i}]}], "learning":{name,t,[pg],i,got,need}|null, "limits":{tracks,params:[{[pg,]i,name}],max},
	// "left":[...]}}; the limits are exactly the learnable targets.
	class MidiLearnCommands
	{
	public:
		using Value = elektronData::json::Value;
		using Ref = deskCore::LearnRef;

		// One learnable parameter of a track (at.t is left -1).
		struct Param
		{
			Ref at;
			std::string name;		// the plug-in parameter
		};

		struct Model
		{
			bool pages = false;			// targets carry pg (Monomachine)
			int tracks = 16;
			deskCore::LearnLimits limits;	// the setup spec's learn limits (the codec's bounds)
			std::vector<Param> params;
			const char* refusal = "learn: expected a track and a parameter";
			int span = 4;				// the channels from the base channel that carry the machine's CCs (MD 4, MM 6)
			bool enabled = deskHost::midiMappingEnabled;	// off: commands refused, no mapping applied (deskHost.h)
		};

		// What the session gives (all message thread)
		struct Host
		{
			std::function<const std::vector<deskCore::LearnMapping>&()> mappings;
			std::function<void(std::vector<deskCore::LearnMapping>)> setMappings;
			// The plug-in parameter of a target (null: none). The model's names and the controller; the table leaves out
			// a target whose parameter is null or not realtime-capable.
			std::function<pluginLib::Parameter*(const Ref&)> parameter;
			std::function<int()> baseChannel;				// the machine's global base channel
			// Why Learn is off now ("" when it is on): with the HW MIDI engine the host's MIDI in carries the real machine's own
			// MIDI out, so nothing is translated or captured; the document says why (paused)
			std::function<std::string()> pausedReason;
			deskCore::FirmwareCcMap firmwareCcMap;			// what the firmware's own CC map drives (pure)
			std::function<double()> nowMs;
		};

		// The host's gesture ends this long after the last learned CC moved a parameter (design: Values, the host)
		static constexpr double g_gestureMs = 250;

		MidiLearnCommands(LearnRouter& _router, Model _model, Host _host, std::function<void(const Value&)> _publish);
		// The table stays published when the session goes (its parameters are the controller's, which outlives it); the
		// processor publishes the empty one before the controller goes (AudioPluginAudioProcessor::~AudioPluginAudioProcessor).
		~MidiLearnCommands();

		MidiLearnCommands(const MidiLearnCommands&) = delete;
		MidiLearnCommands& operator=(const MidiLearnCommands&) = delete;

		// A learn command (deskHost's LearnStart..LearnInvert): the reply (a result message) and the new document are
		// published.
		void handle(deskHost::Action _action, const Value& _message);

		// One session step: learning (the router's captured CCs), the table when the mappings changed, the host's
		// notification of what the audio thread moved. Nothing when the switch is off.
		void step();

		// The audio thread's table from the mappings now, published to the router (the session calls it when it learns the
		// mappings changed: a project load, a knob row's CC; handle() and step() do it themselves).
		void rebuild();
		// The document, to the page
		void publish();
		// What the last project load left out (setup mappings and the alpha MDLN import), for the document; republishes.
		void setLeft(std::vector<std::string> _left);

		// Learning ends (the page went away); the mappings stay
		void cancelLearning();

		bool enabled() const { return m_model.enabled; }
		bool learning() const { return m_capture.target.t >= 0; }
		const Model& model() const { return m_model; }
		uint32_t tablesBuilt() const { return m_generation; }

		// The model without the parameters that cannot be moved from the audio thread (the realtime host-automation
		// path): a learned CC would otherwise run the non-realtime parameter path on the audio thread. _realtime(name, track)
		// says whether the plug-in's parameter of that name on that track takes it (false: none).
		using RealtimeCheck = std::function<bool(const std::string& _name, int _track)>;
		static Model onlyRealtime(Model _model, const RealtimeCheck& _realtime);
		// The same, against a controller's parameters
		static Model onlyRealtime(Model _model, const pluginLib::Controller& _controller);

	private:
		std::string parameterOf(const Ref& _t) const;
		Value limits() const;
		Value targetJson(const Ref& _at) const;
		void reply(const Value& _message, bool _ok, const std::string& _note) const;
		Ref targetOf(const Value& _message) const;
		void edit(std::vector<deskCore::LearnMapping> _list);
		void stopLearning();
		std::string pausedNow() const;
		void takeCaptured();
		void notifyHost();
		void closeGestures();

		LearnRouter& m_router;
		Model m_model;
		Host m_host;
		std::function<void(const Value&)> m_publish;

		deskCore::LearnCapture m_capture;			// target.t < 0: not learning
		std::vector<deskCore::LearnMapping> m_built;	// the list the router's table was built from
		bool m_builtValid = false;
		bool m_discardTouched = false;		// the last rebuild's settle timed out: the next step drops the touched bits again
		int m_publishedBase = -1;			// what the published document was made with: it is made again when these change
		std::string m_publishedPaused;
		uint32_t m_generation = 0;
		std::vector<pluginLib::Parameter*> m_params;	// by mapping index, for the host's notification
		std::vector<std::string> m_left;

		struct Touch
		{
			double lastMs = 0;
			bool open = false;
		};
		std::array<Touch, deskCore::g_learnMaxMappings> m_touch{};
	};
}
