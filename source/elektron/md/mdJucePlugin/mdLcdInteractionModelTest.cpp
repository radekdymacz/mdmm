#include "mdLcdInteractionModel.h"
#include "mdLcdGesture.h"
#include "mdLcdViewport.h"
#include "mdLib/mdpanel.h"

#include <array>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>

namespace
{
	using Pixels = std::array<uint8_t,
		md::FrontPanel::g_lcdWidth * md::FrontPanel::g_lcdHeight>;

	void require(const bool _condition, const std::string& _message)
	{
		if(!_condition)
			throw std::runtime_error(_message);
	}

	void setPixel(Pixels& _pixels, const int _x, const int _y,
		const bool _set = true)
	{
		_pixels[static_cast<size_t>(_y) * md::FrontPanel::g_lcdWidth
			+ static_cast<size_t>(_x)] = _set ? 1 : 0;
	}

	void setLedBank(md::FrontPanel& _panel, const uint8_t _bank,
		const uint8_t _value)
	{
		_panel.processByte(_bank);
		_panel.processByte(_value);
	}

	md::FrontPanel makePanel(const Pixels& _pixels)
	{
		md::FrontPanel panel;
		for(unsigned half = 0; half < 2; ++half)
			for(unsigned page = 0; page < 8; ++page)
				for(unsigned base = 0; base < 64; base += 8)
				{
					panel.processByte(static_cast<uint8_t>(0x10 | (half << 3) | page));
					panel.processByte(static_cast<uint8_t>(base));
					for(unsigned column = base; column < base + 8; ++column)
					{
						uint8_t value = 0;
						for(unsigned bit = 0; bit < 8; ++bit)
						{
							const auto x = half * 64 + column;
							const auto y = page * 8 + bit;
							if(_pixels[y * md::FrontPanel::g_lcdWidth + x])
								value |= static_cast<uint8_t>(1u << bit);
						}
						panel.processByte(value);
					}
				}
		return panel;
	}

	Pixels makeStandardPixels(const uint8_t _activeMask)
	{
		using namespace mdJucePlugin::lcdInteraction;
		Pixels pixels{};
		for(unsigned index = 0; index < 8; ++index)
		{
			const auto rect = encoderRect(LayoutKind::Standard, index);
			for(int x = rect.x + 1; x < rect.x + rect.width; x += 2)
				setPixel(pixels, x, rect.y);
			for(int y = rect.y + 2; y < rect.y + 31; y += 2)
				setPixel(pixels, rect.x + rect.width - 1, y);

			if((_activeMask & (1u << index)) == 0)
				continue;
			// Thirty synthetic value pixels meet the conservative occupancy gate
			// without reproducing any firmware-rendered label or glyph.
			for(int y = rect.y + 14; y < rect.y + 29; ++y)
			{
				setPixel(pixels, rect.x + 2, y);
				setPixel(pixels, rect.x + 3, y);
			}
		}
		return pixels;
	}

	md::FrontPanel makeStandardPanel(const md::MachineModel _model,
		const uint8_t _activeMask)
	{
		auto panel = makePanel(makeStandardPixels(_activeMask));
		if(_model == md::MachineModel::Monomachine)
		{
			setLedBank(panel, 0x25, 0xe9);
			setLedBank(panel, 0x26, 0xd7);
			setLedBank(panel, 0x27, 0x01);
		}
		else
		{
			setLedBank(panel, 0x22, 0x74);
			setLedBank(panel, 0x23, 0xf9);
		}
		return panel;
	}

	void testSyntheticStandardClassification()
	{
		using namespace mdJucePlugin::lcdInteraction;
		for(const auto model : {md::MachineModel::Machinedrum,
			md::MachineModel::Monomachine})
		{
			for(const auto mask : {uint8_t{0xff}, uint8_t{0x55}, uint8_t{0x81}})
			{
				const auto state = classify(makeStandardPanel(model, mask), model);
				require(state && state->surface == SurfaceKind::EditGrid,
					"synthetic synthesis surface was not recognized");
				require(state->layout == LayoutKind::Standard
					&& state->activeEncoderMask == mask,
					"synthetic sparse-cell mask was not preserved");
			}

			const auto full = makeStandardPanel(model, 0xff);
			auto changedBankGroup = full;
			if(model == md::MachineModel::Monomachine)
				setLedBank(changedBankGroup, 0x26, 0xcf);
			else
				setLedBank(changedBankGroup, 0x23, 0xf5);
			const auto originalState = classify(full, model);
			const auto changedBankState = classify(changedBankGroup, model);
			require(originalState && changedBankState
				&& changedBankState->activeEncoderMask == originalState->activeEncoderMask
				&& changedBankState->identityToken == originalState->identityToken,
				"bank-group LEDs changed synthesis recognition");
			require(!classify(full, model, true),
				"held DATA ENTRY switch did not suppress LCD targets");
			if(model == md::MachineModel::Monomachine)
			{
				for(const auto lowTrackBits : {uint8_t{0x0}, uint8_t{0x6}, uint8_t{0xd}})
				{
					auto otherTrack = full;
					setLedBank(otherTrack, 0x25,
						static_cast<uint8_t>(0xe0 | lowTrackBits));
					require(classify(otherTrack, model).has_value(),
						"MM track-colour LEDs disabled the EDIT grid");
				}
				for(const auto page25 : {uint8_t{0xd9}, uint8_t{0xb9}, uint8_t{0x79}})
				{
					auto page = full;
					setLedBank(page, 0x25, page25);
					require(classify(page, model).has_value(),
						"MM DATA page 1-3 was not recognized");
				}
				for(const auto page26 : {uint8_t{0xd6}, uint8_t{0xd5}, uint8_t{0xd3}})
				{
					auto page = full;
					setLedBank(page, 0x25, 0xf9);
					setLedBank(page, 0x26, page26);
					require(classify(page, model).has_value(),
						"MM DATA page 4-6 was not recognized");
				}
			}
			else
			{
				for(const auto bank22 : {uint8_t{0x74}, uint8_t{0xb4}, uint8_t{0xd4}})
				{
					auto page = full;
					setLedBank(page, 0x22, bank22);
					require(classify(page, model).has_value(),
						"MD DATA page was not recognized");
				}
			}
			require(!classify(makeStandardPanel(model, 0), model),
				"empty synthesis grid was interactive");
		}

		auto brokenPixels = makeStandardPixels(0xff);
		const auto first = encoderRect(LayoutKind::Standard, 0);
		setPixel(brokenPixels, first.x + 1, first.y, false);
		auto broken = makePanel(brokenPixels);
		setLedBank(broken, 0x22, 0x74);
		setLedBank(broken, 0x23, 0xf9);
		require(!classify(broken, md::MachineModel::Machinedrum),
			"damaged standard frame did not fail closed");

		auto wrongIdentity = makeStandardPanel(md::MachineModel::Machinedrum, 0xff);
		setLedBank(wrongIdentity, 0x22, 0);
		require(!classify(wrongIdentity, md::MachineModel::Machinedrum),
			"wrong page LEDs did not fail closed");

		auto changedLabels = makeStandardPixels(0xff);
		setPixel(changedLabels, first.x + 2, first.y + 1);
		auto changedPanel = makePanel(changedLabels);
		setLedBank(changedPanel, 0x22, 0x74);
		setLedBank(changedPanel, 0x23, 0xf9);
		const auto original = classify(
			makeStandardPanel(md::MachineModel::Machinedrum, 0xff),
			md::MachineModel::Machinedrum);
		const auto changed = classify(changedPanel, md::MachineModel::Machinedrum);
		require(original && changed && original->identityToken != changed->identityToken,
			"label change did not change the drag identity");
	}

	void testClassificationLedInvalidation()
	{
		using mdJucePlugin::lcdInteraction::classificationLedsChanged;
		md::FrontPanel before;
		md::FrontPanel after;
		setLedBank(before, 0x22, 0x00);
		setLedBank(before, 0x23, 0x00);
		setLedBank(after, 0x22, 0x00);
		setLedBank(after, 0x23, 0x00);
		setLedBank(after, 0x23, 0x20);
		require(!classificationLedsChanged(before, after,
			md::MachineModel::Machinedrum), "ignored MD LED changed classification");
		setLedBank(after, 0x23, 0x0c);
		require(!classificationLedsChanged(before, after,
			md::MachineModel::Machinedrum), "MD bank-group LEDs changed classification");
		setLedBank(after, 0x22, 0x01);
		require(!classificationLedsChanged(before, after,
			md::MachineModel::Machinedrum), "MD pattern-page LED changed classification");
		setLedBank(after, 0x22, 0x08);
		require(classificationLedsChanged(before, after,
			md::MachineModel::Machinedrum), "MD song-mode LED did not invalidate classification");
		setLedBank(after, 0x22, 0x20);
		require(classificationLedsChanged(before, after,
			md::MachineModel::Machinedrum), "MD data-page LED did not invalidate classification");
		setLedBank(after, 0x22, 0x00);
		setLedBank(after, 0x23, 0x10);
		require(classificationLedsChanged(before, after,
			md::MachineModel::Machinedrum), "MD record LED did not invalidate classification");

		before = {};
		after = {};
		setLedBank(before, 0x25, 0x00);
		setLedBank(before, 0x26, 0x00);
		setLedBank(before, 0x27, 0x00);
		setLedBank(after, 0x25, 0x00);
		setLedBank(after, 0x26, 0x00);
		setLedBank(after, 0x27, 0x00);
		setLedBank(after, 0x25, 0x0b);
		setLedBank(after, 0x26, 0xb8);
		setLedBank(after, 0x27, 0xfe);
		require(!classificationLedsChanged(before, after,
			md::MachineModel::Monomachine), "ignored MM LEDs changed classification");
		setLedBank(after, 0x25, 0x04);
		require(!classificationLedsChanged(before, after,
			md::MachineModel::Monomachine), "MM track LED invalidated classification");
		setLedBank(after, 0x25, 0x10);
		require(classificationLedsChanged(before, after,
			md::MachineModel::Monomachine), "relevant MM LED did not invalidate classification");
		setLedBank(after, 0x25, 0x00);
		setLedBank(after, 0x26, 0x40);
		require(classificationLedsChanged(before, after,
			md::MachineModel::Monomachine), "MM song-mode LED did not invalidate classification");
		setLedBank(after, 0x26, 0x00);
		setLedBank(after, 0x27, 0x01);
		require(classificationLedsChanged(before, after,
			md::MachineModel::Monomachine), "MM record LED did not invalidate classification");
	}

	void testGeometry()
	{
		using namespace mdJucePlugin::lcdInteraction;
		for(const auto layout : {LayoutKind::Standard, LayoutKind::Lfo,
			LayoutKind::MasterFx})
		{
			State state{SurfaceKind::EditGrid, layout, 0xff, 1};
			for(int y = -1; y <= 64; ++y)
				for(int x = -1; x <= 128; ++x)
				{
					std::optional<unsigned> expected;
					for(unsigned index = 0; index < 8; ++index)
						if(encoderRect(layout, index).contains(x, y))
						{
							require(!expected, "overlapping LCD encoder rectangles");
							expected = index;
						}
					require(hitTest(state, x, y) == expected,
						"LCD hit-test mismatch");
				}

			state.activeEncoderMask = 0x55;
			for(unsigned index = 0; index < 8; ++index)
			{
				const auto rect = encoderRect(layout, index);
				const auto hit = hitTest(state, rect.x + rect.width / 2,
					rect.y + rect.height / 2);
				require(hit.has_value()
					== ((state.activeEncoderMask & (1u << index)) != 0),
					"inactive encoder rectangle accepted");
			}
		}
	}

	void testViewport()
	{
		using mdJucePlugin::lcdInteraction::Viewport;
		const auto ordinary = Viewport::create(228, 124, 228, 124, false);
		const auto center = ordinary.displayToNative(114, 62);
		require(center && std::abs(center->x - 64.0) < 0.01
			&& std::abs(center->y - 32.0) < 0.01,
			"ordinary center mapping failed");
		require(!ordinary.displayToNative(114, 4.999), "top letterbox accepted");
		require(!ordinary.displayToNative(114, 119), "bottom letterbox accepted");

		const auto padded = Viewport::create(160, 80, 256, 128, false);
		const auto paddedCenter = padded.displayToNative(80, 40);
		require(paddedCenter && std::abs(paddedCenter->x - 64.0) < 0.01
			&& std::abs(paddedCenter->y - 32.0) < 0.01,
			"padded texture mapping failed");

		const auto integer = Viewport::create(228, 124, 228, 124, true);
		const auto integerRect = integer.contentInPaintSpace();
		require(integerRect.width == 128 && integerRect.height == 64
			&& integerRect.x == 50 && integerRect.y == 30,
			"integer LCD viewport was not centred");
		const auto topLeft = integer.displayToNative(50, 30);
		require(topLeft && topLeft->x == 0 && topLeft->y == 0,
			"integer viewport first pixel rejected");
		require(!integer.displayToNative(49.999, 30),
			"integer letterbox edge accepted");
		require(!integer.displayToNative(178, 30),
			"half-open LCD right edge accepted");

		const auto oddInteger = Viewport::create(229, 125, 229, 125, true);
		const auto oddRect = oddInteger.contentInPaintSpace();
		require(oddRect.x == 50 && oddRect.y == 30
			&& oddRect.width == 128 && oddRect.height == 64,
			"odd integer viewport disagrees with pixel-snapped painting");
		const auto leftOfBoundary = oddInteger.displayToNative(117.999, 40);
		const auto onBoundary = oddInteger.displayToNative(118, 40);
		require(leftOfBoundary && onBoundary
			&& static_cast<int>(std::floor(leftOfBoundary->x)) == 67
			&& static_cast<int>(std::floor(onBoundary->x)) == 68
			&& static_cast<int>(std::floor(onBoundary->y)) == 10,
			"odd integer viewport shifted a painted cell boundary");

		const auto fractionalDisplay = Viewport::create(114.5, 62.5, 229, 125, true);
		const auto fractionalLeft = fractionalDisplay.displayToNative(58.9995, 20);
		const auto fractionalBoundary = fractionalDisplay.displayToNative(59, 20);
		require(fractionalLeft && fractionalBoundary
			&& static_cast<int>(std::floor(fractionalLeft->x)) == 67
			&& static_cast<int>(std::floor(fractionalBoundary->x)) == 68,
			"fractional display scaling shifted a painted cell boundary");

		const auto subNative = Viewport::create(80.5, 40.5, 80, 40, true);
		const auto subNativeCenter = subNative.displayToNative(40.25, 20.25);
		require(subNativeCenter && std::abs(subNativeCenter->x - 64.0) < 0.01
			&& std::abs(subNativeCenter->y - 32.0) < 0.01,
			"sub-native integer viewport mapping failed");
	}

	void testGestureMath()
	{
		using namespace mdJucePlugin::lcdInteraction;
		static_assert(commandFineScale == 0.2);
		State state{SurfaceKind::EditGrid, LayoutKind::Standard, 0xff, 42};
		DragGesture drag;
		require(drag.begin(state, 2, 50, 100), "qualified drag did not begin");
		require(drag.drag(state, 50, 99.5, 1.0, 8) == 0,
			"fractional drag emitted early");
		require(drag.drag(state, 50, 99.0, 1.0, 8) == 1,
			"upward drag sign is wrong");
		require(drag.drag(state, 50, 101.0, 1.0, 8) == -2,
			"downward drag sign is wrong");
		require(drag.drag(state, 70, 101.0, 1.0, 8) == 8,
			"rightward drag was not accepted");
		require(std::abs(drag.drag(state, 70.25, 101.0, 1.0, 8)) == 0,
			"capped drag created a retry backlog");

		auto changed = state;
		changed.identityToken = 43;
		require(drag.drag(changed, 80, 101, 1.0, 8) == 0 && !drag.active(),
			"identity change did not cancel drag");
		require(!drag.begin(state, 8, 0, 0),
			"out-of-range encoder began drag");
		state.activeEncoderMask = 0xfb;
		require(!drag.begin(state, 2, 0, 0),
			"inactive encoder began drag");

		DetentAccumulator wheel;
		require(wheel.add(0.25, 8) == 0 && wheel.add(0.75, 8) == 1,
			"high-resolution wheel accumulation failed");
		require(wheel.add(-20.0, 8) == -8, "wheel burst cap failed");
		require(wheel.add(0.5, 8) == 0,
			"wheel cap left an event backlog");

		for(unsigned index = 0; index < 8; ++index)
		{
			const auto encoder = static_cast<md::PanelEncoder>(
				static_cast<unsigned>(md::PanelEncoder::DataEntryA) + index);
			for(const auto model : {md::MachineModel::Machinedrum,
				md::MachineModel::Monomachine})
			{
				const auto command = md::panelEncoderCommand(model, encoder);
				require(command && *command == 0x30 + index,
					"LCD target did not map to its physical DATA ENTRY command");
			}
		}
	}
}

int main()
{
	try
	{
		testSyntheticStandardClassification();
		testClassificationLedInvalidation();
		testGeometry();
		testViewport();
		testGestureMath();
		std::cout << "PASS: synthetic classification, exclusions, geometry, viewport, and gestures\n";
		return 0;
	}
	catch(const std::exception& error)
	{
		std::cerr << "FAIL: " << error.what() << '\n';
		return 1;
	}
}
