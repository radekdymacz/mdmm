#include "mdpanelsequence.h"

namespace md
{
	namespace
	{
		std::vector<PanelPacket> chainSequence(const MachineModel _model, const std::string& _spec)
		{
			// _spec = "<k>:<t>,<t>,..." (the Machinedrum's and, MM-P8, the Monomachine's: the same gesture,
			// its own bank key packets; mmEditorProbeFirmwareTest chain)
			if(_spec.size() < 3 || _spec[1] != ':' || _spec[0] < '0' || _spec[0] > '3')
				return {};
			const auto bank = panelPacket(_model, static_cast<PanelControl>(static_cast<int>(PanelControl::BankA) + (_spec[0] - '0')));
			if(!bank)
				return {};
			std::vector<int> trigs;
			int n = -1;
			for(size_t i = 2; i <= _spec.size(); ++i)
			{
				const char c = i < _spec.size() ? _spec[i] : ',';
				if(c == ',')
				{
					if(n < 0 || n > 15)
						return {};
					trigs.push_back(n);
					n = -1;
				}
				else if(c >= '0' && c <= '9')
					n = (n < 0 ? 0 : n * 10) + (c - '0');
				else
					return {};
			}
			if(trigs.empty() || trigs.size() > 16)
				return {};
			std::vector<PanelPacket> states{*bank};
			uint8_t rows[2] = {0, 0};
			for(const int t : trigs)
			{
				rows[t >> 3] = static_cast<uint8_t>(rows[t >> 3] | (1u << (t & 7)));
				states.push_back({static_cast<uint8_t>(0x20 + (t >> 3)), rows[t >> 3]});
			}
			for(uint8_t r = 0; r < 2; ++r)
				if(rows[r])
					states.push_back({static_cast<uint8_t>(0x20 + r), 0});
			states.push_back({bank->row, 0});
			return states;
		}
	}

	std::vector<PanelPacket> panelKeySequence(const MachineModel _model, const std::string& _key)
	{
		if(_key.compare(0, 6, "chain:") == 0)
			return chainSequence(_model, _key.substr(6));
		// A key held down and let go later (Control All: FUNCTION held while a DATA ENTRY knob turns).
		const bool hold = _key.compare(0, 5, "hold:") == 0, release = _key.compare(0, 8, "release:") == 0;
		if(hold || release)
		{
			const auto name = _key.substr(hold ? 5 : 8);
			std::optional<PanelControl> held;
			if(name == "function")
				held = PanelControl::Function;
			else if(name == "exit")
				held = PanelControl::Exit;
			else if(name.size() > 4 && name.compare(0, 4, "trig") == 0 && name.find_first_not_of("0123456789", 4) == std::string::npos
				&& name.size() <= 6)
			{
				const int n = std::stoi(name.substr(4));
				if(n >= 1 && n <= 16)
					held = static_cast<PanelControl>(static_cast<int>(PanelControl::Trigger1) + n - 1);
			}
			// A DATA ENTRY knob's switch (knobA..knobH): EXIT/NO + a knob held removes that parameter's locks while live
			// recording (MD manual p.48; mdEditorProbeFirmwareTest liveunlock).
			if(!held && name.size() == 5 && name.compare(0, 4, "knob") == 0 && name[4] >= 'A' && name[4] <= 'H')
			{
				const auto knob = panelEncoderPressPacket(_model, static_cast<PanelEncoder>(name[4] - 'A'));
				if(!knob)
					return {};
				return {hold ? *knob : PanelPacket{knob->row, 0}};
			}
			if(!held)
				return {};
			const auto packet = panelPacket(_model, *held);
			if(!packet)
				return {};
			return {hold ? *packet : PanelPacket{packet->row, 0}};
		}
		std::optional<PanelControl> control;
		if(_key == "play")
			control = PanelControl::Play;
		else if(_key == "stop")
			control = PanelControl::Stop;
		else if(_key == "record" || _key == "recordPlay")
			control = PanelControl::Record;
		else if(_key == "page")
			control = PanelControl::SynthesisEffectsRouting;
		else if(_key == "bankGroup")
			control = PanelControl::BankGroup;
		else if(_key == "kit")
			control = PanelControl::Kit;
		else if(_key == "enter")
			control = PanelControl::Enter;
		else if(_key == "exit")
			control = PanelControl::Exit;
		else if(_key == "up")
			control = PanelControl::Up;
		else if(_key == "down")
			control = PanelControl::Down;
		else if(_key.size() > 4 && _key.compare(0, 4, "trig") == 0)
		{
			int n = 0;
			for(size_t i = 4; i < _key.size(); ++i)
			{
				if(_key[i] < '0' || _key[i] > '9')
					return {};
				n = n * 10 + (_key[i] - '0');
			}
			if(n < 1 || n > 16)
				return {};
			control = static_cast<PanelControl>(static_cast<int>(PanelControl::Trigger1) + n - 1);
		}
		if(!control)
			return {};
		const auto packet = panelPacket(_model, *control);
		if(!packet)
			return {};
		std::vector<PanelPacket> states{*packet};
		if(_key == "recordPlay")
		{
			const auto play = panelPacket(_model, PanelControl::Play);
			if(!play || play->row != packet->row)
				return {};
			states.push_back({packet->row, static_cast<uint8_t>(packet->mask | play->mask)});
			states.push_back(*packet);
		}
		states.push_back({packet->row, 0});
		return states;
	}
}
