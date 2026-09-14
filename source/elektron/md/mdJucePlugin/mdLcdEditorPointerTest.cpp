#include "mdEditor.h"
#include "mdPluginEditorState.h"
#include "mdPluginProcessor.h"

#include "juceRmlUi/juceRmlComponent.h"
#include "juceRmlUi/rmlElemCanvas.h"
#include "juceRmlUi/rmlInterfaces.h"

#include "RmlUi/Core/Context.h"

#include "mdLib/mdpanel.h"
#include "synthLib/realtimeInstrumentation.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <string>

namespace mdJucePlugin
{
	struct EditorIdentityTestAccess
	{
		static void installSurface(Editor& _editor,
			const std::optional<lcdInteraction::State>& _state)
		{
			_editor.m_frontPanelSnapshotValid = true;
			_editor.m_lcdInteractionInputChanged = false;
			_editor.m_lcdInteractionState = _state;
		}

		static juceRmlUi::ElemCanvas& canvas(Editor& _editor)
		{
			if(!_editor.m_lcdCanvas)
				throw std::runtime_error("editor did not create its LCD canvas");
			return *_editor.m_lcdCanvas;
		}

		static bool dragActive(const Editor& _editor)
		{
			return _editor.m_lcdDragGesture.active();
		}

		static void paintLcd(const Editor& _editor, juce::Image& _image)
		{
			juce::Graphics graphics(_image);
			_editor.paintLcd(_image, graphics);
		}
	};
}

namespace
{
	void require(const bool _condition, const std::string& _message)
	{
		if(!_condition)
			throw std::runtime_error(_message);
	}

	Rml::Vector2i encoderCenter(juceRmlUi::ElemCanvas& _canvas,
		const mdJucePlugin::lcdInteraction::LayoutKind _layout,
		const unsigned _index)
	{
		const auto offset = _canvas.GetAbsoluteOffset(Rml::BoxArea::Content);
		const auto size = _canvas.GetBox().GetSize(Rml::BoxArea::Content);
		const auto scale = std::min(size.x / 128.f, size.y / 64.f);
		const auto contentWidth = 128.f * scale;
		const auto contentHeight = 64.f * scale;
		const auto contentX = (size.x - contentWidth) * 0.5f;
		const auto contentY = (size.y - contentHeight) * 0.5f;
		const auto rect = mdJucePlugin::lcdInteraction::encoderRect(_layout, _index);
		return {static_cast<int>(std::lround(offset.x + contentX
			+ (rect.x + rect.width * 0.5f) * scale)),
			static_cast<int>(std::lround(offset.y + contentY
			+ (rect.y + rect.height * 0.5f) * scale))};
	}

	bool imagesEqual(const juce::Image& _a, const juce::Image& _b)
	{
		if(_a.getBounds() != _b.getBounds())
			return false;
		const juce::Image::BitmapData a(_a, juce::Image::BitmapData::readOnly);
		const juce::Image::BitmapData b(_b, juce::Image::BitmapData::readOnly);
		for(int y = 0; y < _a.getHeight(); ++y)
			if(std::memcmp(a.getLinePointer(y), b.getLinePointer(y),
				static_cast<size_t>(_a.getWidth()) * a.pixelStride) != 0)
				return false;
		return true;
	}

	unsigned requireOnlyEncoderInput(
		synthLib::RealtimeInstrumentation& _instrumentation,
		const md::MachineModel _model, const unsigned _index,
		const std::string& _label)
	{
		const auto encoder = static_cast<md::PanelEncoder>(
			static_cast<unsigned>(md::PanelEncoder::DataEntryA) + _index);
		const auto expected = md::panelEncoderCommand(_model, encoder);
		require(expected.has_value(), _label + ": encoder has no panel command");
		unsigned count = 0;
		synthLib::RealtimeEvent event;
		while(_instrumentation.popTimelineEvent(event))
			if(event.kind == synthLib::RealtimeEventKind::PanelInput)
			{
				require(event.command == *expected,
					_label + ": pointer emitted the wrong DATA ENTRY command");
				require(event.argument == 0x01,
					_label + ": right/up input emitted the wrong sign");
				++count;
			}
		return count;
	}

	void requireNoPanelInput(synthLib::RealtimeInstrumentation& _instrumentation,
		const std::string& _label)
	{
		synthLib::RealtimeEvent event;
		while(_instrumentation.popTimelineEvent(event))
			require(event.kind != synthLib::RealtimeEventKind::PanelInput,
				_label + ": inactive LCD cell emitted panel input");
	}

	void exerciseCells(mdJucePlugin::Editor& _editor, Rml::Context& _context,
		juceRmlUi::ElemCanvas& _canvas,
		synthLib::RealtimeInstrumentation& _instrumentation,
		const md::MachineModel _model,
		const mdJucePlugin::lcdInteraction::LayoutKind _layout,
		const uint8_t _activeMask, const std::string& _label)
	{
		using namespace mdJucePlugin::lcdInteraction;
		if(_activeMask == 0)
			mdJucePlugin::EditorIdentityTestAccess::installSurface(_editor, std::nullopt);
		else
		{
			const auto surface = _layout == LayoutKind::Lfo ? SurfaceKind::Lfo
				: _layout == LayoutKind::MasterFx ? SurfaceKind::MasterFxEcho
				: SurfaceKind::Synthesis;
			mdJucePlugin::EditorIdentityTestAccess::installSurface(_editor,
				State{surface, _layout, _activeMask,
					static_cast<uint64_t>(_layout) + 1});
		}

		for(unsigned index = 0; index < 8; ++index)
		{
			const auto point = encoderCenter(_canvas, _layout, index);
			const auto active = (_activeMask & (1u << index)) != 0;

			// Plain clicks acquire/release a target but never turn or press it.
			_instrumentation.reset();
			_context.ProcessMouseMove(point.x, point.y, 0);
			_context.ProcessMouseButtonDown(0, 0);
			_context.ProcessMouseButtonUp(0, 0);
			require(!mdJucePlugin::EditorIdentityTestAccess::dragActive(_editor),
				_label + ": click left a gesture active");
			requireNoPanelInput(_instrumentation, _label + " plain click");

			_instrumentation.reset();
			_context.ProcessMouseMove(point.x, point.y, 0);
			_context.ProcessMouseButtonDown(0, 0);
			require(mdJucePlugin::EditorIdentityTestAccess::dragActive(_editor) == active,
				_label + ": pointer acquisition disagrees with mask at cell "
					+ std::to_string(index));
			_context.ProcessMouseMove(point.x + 30, point.y, 0);
			_context.ProcessMouseButtonUp(0, 0);
			require(!mdJucePlugin::EditorIdentityTestAccess::dragActive(_editor),
				_label + ": gesture remained active after release");
			if(active)
				require(requireOnlyEncoderInput(_instrumentation, _model, index,
					_label + " drag") != 0, _label + ": active cell ignored drag");
			else
				requireNoPanelInput(_instrumentation, _label + " drag");

			_instrumentation.reset();
			_context.ProcessMouseMove(point.x, point.y, 0);
			_context.ProcessMouseWheel(Rml::Vector2f{0.f, -1.f}, 0);
			if(active)
				require(requireOnlyEncoderInput(_instrumentation, _model, index,
					_label + " wheel") != 0, _label + ": active cell ignored wheel");
			else
				requireNoPanelInput(_instrumentation, _label + " wheel");
		}
	}
}

int main()
{
	try
	{
		juce::ScopedJuceInitialiser_GUI gui;
		#if defined(MD_LCD_POINTER_TEST_MM)
		constexpr auto model = md::MachineModel::Monomachine;
		constexpr auto product = "MM";
		#else
		constexpr auto model = md::MachineModel::Machinedrum;
		constexpr auto product = "MD";
		#endif

		mdJucePlugin::AudioPluginAudioProcessor processor(
			model,
			mdJucePlugin::AudioPluginAudioProcessor::EphemeralConfig{std::string{}}, false);
		processor.setForceSoftwareRendererForSession(true);
		require(!processor.getConfig().containsKey(
			mdJucePlugin::lcdInteraction::configKey),
			"ephemeral config unexpectedly contains the LCD interaction setting");
		require(processor.getConfig().getBoolValue(
			mdJucePlugin::lcdInteraction::configKey,
			mdJucePlugin::lcdInteraction::defaultEnabled),
			"fresh product config silently disables LCD rotary interaction");

		auto& editorState = static_cast<mdJucePlugin::PluginEditorState&>(
			processor.getOrCreateEditorState());
		auto* editor = dynamic_cast<mdJucePlugin::Editor*>(editorState.getEditor());
		require(editor != nullptr, "processor did not create the editor");
		auto* component = editor->getRmlComponent();
		require(component && component->getContext(), "editor has no RmlUi context");

		auto& instrumentation = processor.getPlugin().getRealtimeInstrumentation();
		instrumentation.setEnabled(true);
		instrumentation.reset();

		juceRmlUi::RmlInterfaces::ScopedAccess access(*component);
		auto& context = *component->getContext();
		context.Update();
		auto& canvas = mdJucePlugin::EditorIdentityTestAccess::canvas(*editor);
		require(canvas.GetBox().GetSize(Rml::BoxArea::Content).x > 0,
			"LCD canvas was not laid out");

		using namespace mdJucePlugin::lcdInteraction;
		mdJucePlugin::EditorIdentityTestAccess::installSurface(*editor,
			State{SurfaceKind::Synthesis, LayoutKind::Standard, 0xff, 1});
		const auto start = encoderCenter(canvas, LayoutKind::Standard, 0);
		const auto canvasSize = canvas.GetBox().GetSize(Rml::BoxArea::Content);
		juce::Image beforeHover(juce::Image::ARGB,
			static_cast<int>(canvasSize.x), static_cast<int>(canvasSize.y), true);
		juce::Image duringHover(juce::Image::ARGB,
			static_cast<int>(canvasSize.x), static_cast<int>(canvasSize.y), true);
		mdJucePlugin::EditorIdentityTestAccess::paintLcd(*editor, beforeHover);
		context.ProcessMouseMove(start.x, start.y, 0);
		mdJucePlugin::EditorIdentityTestAccess::paintLcd(*editor, duringHover);
		require(imagesEqual(beforeHover, duringHover),
			"LCD pixels changed merely because a field was hovered");
		require(instrumentation.snapshot().timelineEvents == 0,
			"LCD hover touched the firmware/audio-facing panel path");

		context.ProcessMouseButtonDown(0, 0);
		context.ProcessMouseMove(start.x, start.y - 30, 0);
		require(requireOnlyEncoderInput(instrumentation, model, 0,
			"vertical drag") != 0,
			"vertical drag did not emit DATA ENTRY A");
		context.ProcessMouseButtonUp(0, 0);

		instrumentation.reset();
		context.ProcessMouseMove(start.x, start.y, 0);
		context.ProcessMouseButtonDown(0, 0);
		context.ProcessMouseMove(start.x + 30, start.y, 0);
		const auto ordinarySteps = requireOnlyEncoderInput(
			instrumentation, model, 0, "horizontal drag");
		context.ProcessMouseButtonUp(0, 0);
		require(ordinarySteps != 0, "horizontal drag did not emit DATA ENTRY A");

		instrumentation.reset();
		context.ProcessMouseMove(start.x, start.y, 0);
		context.ProcessMouseButtonDown(0, 0);
		context.ProcessMouseMove(start.x + 30, start.y, Rml::Input::KM_META);
		const auto fineSteps = requireOnlyEncoderInput(
			instrumentation, model, 0, "fine horizontal drag");
		context.ProcessMouseButtonUp(0, Rml::Input::KM_META);
		require(fineSteps != 0 && fineSteps < ordinarySteps,
			"Command-drag did not produce a slower turn");

		exerciseCells(*editor, context, canvas, instrumentation, model,
			LayoutKind::Standard, 0xff, "standard full");
		exerciseCells(*editor, context, canvas, instrumentation, model,
			LayoutKind::Standard, 0x55, "standard sparse");
		exerciseCells(*editor, context, canvas, instrumentation, model,
			LayoutKind::Lfo, 0xff, "LFO");
		exerciseCells(*editor, context, canvas, instrumentation, model,
			LayoutKind::MasterFx, 0xff, "Master FX");
		exerciseCells(*editor, context, canvas, instrumentation, model,
			LayoutKind::Standard, 0, "disabled surface");

		std::printf("%s LcdEditorPointerTest: PASS\n", product);
		return 0;
	}
	catch(const std::exception& error)
	{
		std::fprintf(stderr, "mdLcdEditorPointerTest: %s\n", error.what());
		return 1;
	}
}
