#include "mdLcdInteractionModel.h"

#include <array>
#include <stdexcept>

namespace mdJucePlugin::lcdInteraction
{
	namespace
	{
		constexpr uint64_t g_fnvOffset = 1469598103934665603ull;
		constexpr uint64_t g_fnvPrime = 1099511628211ull;
		constexpr uint32_t g_minimumOccupiedSlotInk = 30;

		// These are fingerprints of publicly observable LCD/LED output from the
		// two firmware versions accepted by RomLoader (MD 1.63 and MM 1.32b).
		// They were collected through ordinary front-panel input and contain no
		// firmware bytes, memory addresses, or disassembly-derived state.
		constexpr uint64_t g_mdOs163LfoContext = 0x11f7ceecc74c8d84ull;
		constexpr std::array<std::pair<uint64_t, SurfaceKind>, 4>
			g_mdOs163MasterFxContexts{{
				{0x10981a1368a02892ull, SurfaceKind::MasterFxEcho},
				{0x9d35c108aedc61e2ull, SurfaceKind::MasterFxReverb},
				{0xd9623bb2a680e5faull, SurfaceKind::MasterFxEq},
				{0x410a0c01f890b9a6ull, SurfaceKind::MasterFxDynamics},
			}};
		constexpr uint64_t g_mdOs163SynthesisIdentity = 0x9bf30200c6972b84ull;
		constexpr uint64_t g_mmOs132bSynthesisIdentity = 0x94c9044e9e2b8651ull;
		constexpr uint64_t g_mdOs163Ctr8pLabels = 0x519d0ad13d054c45ull;

		void addHashByte(uint64_t& _hash, const uint8_t _value)
		{
			_hash ^= _value;
			_hash *= g_fnvPrime;
		}

		uint64_t panelIdentity(const md::FrontPanel& _panel, const md::MachineModel _model)
		{
			uint64_t hash = g_fnvOffset;
			if(_model == md::MachineModel::Monomachine)
			{
				addHashByte(hash, static_cast<uint8_t>(_panel.getLedBankRaw(0x25) & 0xf0));
				addHashByte(hash, static_cast<uint8_t>(_panel.getLedBankRaw(0x26) & 0x7f));
				addHashByte(hash, _panel.getLedBankRaw(0x27));
			}
			else
			{
				addHashByte(hash, _panel.getLedBankRaw(0x22));
				addHashByte(hash, static_cast<uint8_t>(_panel.getLedBankRaw(0x23) & ~(1u << 5)));
			}
			return hash;
		}

		uint64_t contextFingerprint(const md::FrontPanel& _panel,
			const md::MachineModel _model, const unsigned _height)
		{
			uint64_t hash = g_fnvOffset;
			for(unsigned y = 0; y < _height; ++y)
				for(unsigned x = 0; x < md::FrontPanel::g_lcdWidth; ++x)
					addHashByte(hash, _panel.getLcdPixel(x, y) ? 1u : 0u);
			const auto identity = panelIdentity(_panel, _model);
			for(unsigned shift = 0; shift < 64; shift += 8)
				addHashByte(hash, static_cast<uint8_t>(identity >> shift));
			return hash;
		}

		uint32_t slotInk(const md::FrontPanel& _panel, const NativeRect& _rect,
			const bool _standard)
		{
			uint32_t count = 0;
			for(int y = _rect.y; y < _rect.y + _rect.height; ++y)
			{
				if(_standard)
				{
					if(y == _rect.y || y >= _rect.y + 31)
						continue;
					if(y >= _rect.y + 11 && y <= _rect.y + 13)
						continue;
				}
				for(int x = _rect.x + (_standard ? 2 : 0);
					x < _rect.x + _rect.width - (_standard ? 1 : 0); ++x)
					count += _panel.getLcdPixel(static_cast<unsigned>(x),
						static_cast<unsigned>(y)) ? 1u : 0u;
			}
			return count;
		}

		uint8_t occupancy(const md::FrontPanel& _panel, const LayoutKind _layout)
		{
			uint8_t result = 0;
			for(unsigned index = 0; index < 8; ++index)
			{
				const auto rect = encoderRect(_layout, index);
				if(slotInk(_panel, rect, _layout == LayoutKind::Standard)
					>= g_minimumOccupiedSlotInk)
					result |= static_cast<uint8_t>(1u << index);
			}
			return result;
		}

		bool hasStandardFrame(const md::FrontPanel& _panel)
		{
			// Every qualified engine capture shares these firmware-drawn dotted
			// top/right cell edges. Parameter labels and value glyphs are excluded.
			for(unsigned index = 0; index < 8; ++index)
			{
				const auto rect = encoderRect(LayoutKind::Standard, index);
				for(int x = rect.x + 1; x < rect.x + rect.width; x += 2)
					if(!_panel.getLcdPixel(static_cast<unsigned>(x),
						static_cast<unsigned>(rect.y)))
						return false;
				for(int y = rect.y + 2; y < rect.y + 31; y += 2)
					if(!_panel.getLcdPixel(static_cast<unsigned>(rect.x + rect.width - 1),
						static_cast<unsigned>(y)))
						return false;
			}
			return true;
		}

		uint64_t standardLabelFingerprint(const md::FrontPanel& _panel)
		{
			uint64_t hash = g_fnvOffset;
			for(unsigned index = 0; index < 8; ++index)
			{
				const auto rect = encoderRect(LayoutKind::Standard, index);
				for(int y = rect.y + 1; y < rect.y + 11; ++y)
					for(int x = rect.x + 2; x < rect.x + 19; ++x)
						addHashByte(hash, _panel.getLcdPixel(static_cast<unsigned>(x),
							static_cast<unsigned>(y)) ? 1u : 0u);
			}
			return hash;
		}

		uint64_t identityToken(const SurfaceKind _surface, const uint64_t _panelIdentity,
			const uint64_t _stableContent = 0)
		{
			uint64_t result = g_fnvOffset;
			addHashByte(result, static_cast<uint8_t>(_surface));
			for(unsigned shift = 0; shift < 64; shift += 8)
				addHashByte(result, static_cast<uint8_t>(_panelIdentity >> shift));
			for(unsigned shift = 0; shift < 64; shift += 8)
				addHashByte(result, static_cast<uint8_t>(_stableContent >> shift));
			return result;
		}
	}

	NativeRect encoderRect(const LayoutKind _layout, const unsigned _encoderIndex)
	{
		if(_encoderIndex >= 8)
			throw std::out_of_range("LCD encoder index");
		const auto column = static_cast<int>(_encoderIndex % 4);
		const auto row = static_cast<int>(_encoderIndex / 4);
		switch(_layout)
		{
		case LayoutKind::Standard:
			return {48 + 20 * column, 32 * row, 20, 32};
		case LayoutKind::Lfo:
			return {9 + 24 * column, row == 0 ? 9 : 34, 24, row == 0 ? 25 : 26};
		case LayoutKind::MasterFx:
			return {5 + 21 * column, 20 + 20 * row, 21, 20};
		}
		throw std::logic_error("unknown LCD layout");
	}

	std::optional<State> classify(const md::FrontPanel& _panel,
		const md::MachineModel _model, const bool _dataEntrySwitchHeld)
	{
		if(_dataEntrySwitchHeld)
			return std::nullopt;

		const auto identity = panelIdentity(_panel, _model);
		if(_model == md::MachineModel::Machinedrum)
		{
			if(contextFingerprint(_panel, _model, 9) == g_mdOs163LfoContext)
			{
				const auto mask = occupancy(_panel, LayoutKind::Lfo);
				if(mask == 0xff)
					return State{SurfaceKind::Lfo, LayoutKind::Lfo, mask,
						identityToken(SurfaceKind::Lfo, identity)};
				return std::nullopt;
			}

			const auto masterContext = contextFingerprint(_panel, _model, 20);
			for(const auto& [fingerprint, surface] : g_mdOs163MasterFxContexts)
				if(masterContext == fingerprint)
				{
					const auto mask = occupancy(_panel, LayoutKind::MasterFx);
					if(mask == 0xff)
						return State{surface, LayoutKind::MasterFx, mask,
							identityToken(surface, identity)};
					return std::nullopt;
				}
		}

		const auto expectedIdentity = _model == md::MachineModel::Monomachine
			? g_mmOs132bSynthesisIdentity : g_mdOs163SynthesisIdentity;
		if(identity != expectedIdentity || !hasStandardFrame(_panel))
			return std::nullopt;

		auto mask = occupancy(_panel, LayoutKind::Standard);
		const auto labels = standardLabelFingerprint(_panel);
		// CTR-8P is assignment-dependent. Its held-switch overlay made A-D/F look
		// responsive in the original census, but unheld product-style turns did
		// not reliably redraw their own cells. Suppress the entire page until a
		// fixture with explicit P1-P8 assignments is independently qualified.
		if(_model == md::MachineModel::Machinedrum
			&& labels == g_mdOs163Ctr8pLabels)
			return std::nullopt;

		if(mask == 0)
			return std::nullopt;
		return State{SurfaceKind::Synthesis, LayoutKind::Standard, mask,
			identityToken(SurfaceKind::Synthesis, identity, labels)};
	}

	bool classificationLedsChanged(const md::FrontPanel& _before,
		const md::FrontPanel& _after, const md::MachineModel _model)
	{
		if(_model == md::MachineModel::Monomachine)
			return (_before.getLedBankRaw(0x25) & 0xf0)
					!= (_after.getLedBankRaw(0x25) & 0xf0)
				|| (_before.getLedBankRaw(0x26) & 0x7f)
					!= (_after.getLedBankRaw(0x26) & 0x7f)
				|| _before.getLedBankRaw(0x27) != _after.getLedBankRaw(0x27);
		return _before.getLedBankRaw(0x22) != _after.getLedBankRaw(0x22)
			|| (_before.getLedBankRaw(0x23) & ~(1u << 5))
				!= (_after.getLedBankRaw(0x23) & ~(1u << 5));
	}

	std::optional<unsigned> hitTest(const State& _state, const int _nativeX,
		const int _nativeY)
	{
		if(_nativeX < 0 || _nativeY < 0
			|| _nativeX >= static_cast<int>(md::FrontPanel::g_lcdWidth)
			|| _nativeY >= static_cast<int>(md::FrontPanel::g_lcdHeight))
			return std::nullopt;
		for(unsigned index = 0; index < 8; ++index)
			if((_state.activeEncoderMask & (1u << index)) != 0
				&& encoderRect(_state.layout, index).contains(_nativeX, _nativeY))
				return index;
		return std::nullopt;
	}
}
