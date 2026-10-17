// 0.8 (I-053): mdMidiHotplug.h, the remembered MIDI inputs and output when a device is plugged in or out. No JUCE, no ports.

#include "mdMidiHotplug.h"

#include <algorithm>
#include <cstdio>
#include <string>

namespace
{
	int g_failed = 0;
	void check(const bool _ok, const char* _what)
	{
		std::printf("%s %s\n", _ok ? "ok  " : "FAIL", _what);
		if(!_ok)
			++g_failed;
	}
}

int main()
{
	using namespace mdJucePlugin::midiHotplug;
	using Ports = std::vector<Port>;
	using Ids = std::vector<std::string>;

	const Port kbd{"id-kbd", "USB Keyboard"};
	const Port tm1{"id-tm1", "Elektron TM-1"};

	// the keyboard was on, was unplugged (nothing available, JUCE still has its handle): switch the dead handle off
	{
		Ports wanted{kbd};
		const auto plan = reconcile(wanted, {tm1}, {"id-kbd"});
		check(plan.enable.empty() && plan.disable == Ids{"id-kbd"}, "an unplugged input is switched off, nothing is switched on");
		check(wanted.size() == 1 && wanted[0] == kbd, "an unplugged input stays remembered");
	}
	// the same identifier is back: switched on
	{
		Ports wanted{kbd};
		const auto plan = reconcile(wanted, {kbd, tm1}, {});
		check(plan.enable == Ids{"id-kbd"} && plan.disable.empty(), "a replugged input with its identifier comes back on");
	}
	// the identifier changed on replug: matched by name, the memory learns the new identifier
	{
		Ports wanted{kbd};
		const auto plan = reconcile(wanted, {{"id-kbd-2", "USB Keyboard"}, tm1}, {});
		check(plan.enable == Ids{"id-kbd-2"} && plan.disable.empty(), "a replugged input with a new identifier is matched by name");
		check(wanted[0].id == "id-kbd-2" && wanted[0].name == "USB Keyboard", "the memory keeps the name and learns the new identifier");
		const auto again = reconcile(wanted, {{"id-kbd-2", "USB Keyboard"}, tm1}, {"id-kbd-2"});
		check(again.enable.empty() && again.disable.empty(), "nothing to do when the input is already on");
	}
	// a port the user did not switch on stays off; one that is on but not remembered (JUCE's stale list) goes off
	{
		Ports wanted{kbd};
		const auto plan = reconcile(wanted, {kbd, tm1}, {"id-kbd", "id-tm1"});
		check(plan.enable.empty() && plan.disable == Ids{"id-tm1"}, "an input that is on but not remembered is switched off");
		Ports none;
		const auto plug = reconcile(none, {kbd, tm1}, {});
		check(plug.enable.empty() && plug.disable.empty(), "a newly plugged input that was never on stays off");
	}
	// the user switched it off: forgotten, it does not come back
	{
		Ports wanted{kbd, tm1};
		remember(wanted, kbd, false);
		check(wanted.size() == 1 && wanted[0] == tm1, "switching an input off forgets it");
		const auto plan = reconcile(wanted, {kbd, tm1}, {"id-tm1"});
		check(plan.enable.empty() && plan.disable.empty(), "a forgotten input is not switched on by a replug");
	}
	// switching on twice does not double the memory; an old identifier of the same name is replaced
	{
		Ports wanted;
		remember(wanted, kbd, true);
		remember(wanted, kbd, true);
		remember(wanted, {"id-kbd-2", "USB Keyboard"}, true);
		check(wanted.size() == 1 && wanted[0].id == "id-kbd-2", "the memory has one entry per name, the latest identifier");
	}
	// two ports of the same name: each wanted entry takes its own
	{
		Ports wanted{{"a", "USB MIDI"}, {"b", "USB MIDI"}};
		const auto plan = reconcile(wanted, {{"a", "USB MIDI"}, {"c", "USB MIDI"}}, {"a"});
		check(plan.enable == Ids{"c"} && plan.disable.empty(), "two ports with one name are matched one to one");
		check(wanted[0].id == "a" && wanted[1].id == "c", "the second entry learns the free identifier");
	}
	// the output
	{
		const Ports outs{{"o1", "Elektron TM-1"}, {"o2", "IAC Driver Bus 1"}};
		check(outputFor(outs, {"o2", "IAC Driver Bus 1"}) == "o2", "the output is found by identifier");
		check(outputFor(outs, {"gone", "Elektron TM-1"}) == "o1", "the output is found by name when the identifier changed");
		check(outputFor(outs, {"o9", "Other"}).empty(), "an output that is not listed gives nothing");
		check(outputFor(outs, {}).empty(), "no remembered output gives nothing");
	}

	// what changed between two lists
	{
		const auto c = change({kbd, tm1}, {tm1, {"id-x", "New"}});
		check(c.added.size() == 1 && c.added[0].name == "New" && c.removed.size() == 1 && c.removed[0].name == "USB Keyboard",
			"the change lists the port that came and the one that went");
		const auto none = change({kbd}, {kbd});
		check(none.added.empty() && none.removed.empty(), "the same list is no change");
	}

	// twins: a second identical device switched on does not switch the first off
	{
		const Ports twins{{"a", "USB MIDI"}, {"b", "USB MIDI"}};
		Ports wanted;
		remember(wanted, twins[0], true, twins);
		remember(wanted, twins[1], true, twins);
		check(wanted.size() == 2, "two identical devices are two entries in the memory");
		const auto plan = reconcile(wanted, twins, {"a", "b"});
		check(plan.enable.empty() && plan.disable.empty(), "and the next hot-plug leaves both on");
	}

	// the devices as a fake
	struct Fake final : Devices
	{
		Ports in, out;
		Ids on;
		std::string current;
		std::vector<std::string> calls;
		Ports inputs() const override { return in; }
		Ports outputs() const override { return out; }
		Ids enabledInputs() const override { return on; }
		void setInput(const std::string& _id, const bool _on) override
		{
			calls.push_back((_on ? "on " : "off ") + _id);
			if(_on)
			{
				if(!contains(on, _id) && listed(in, _id))
					on.push_back(_id);
			}
			else
				on.erase(std::remove(on.begin(), on.end(), _id), on.end());
		}
		std::string output() const override { return current; }
		void setOutput(const std::string& _id) override { calls.push_back("out " + _id); current = _id; }
	};
	{
		// the output the user chose, not the start-up one, is what comes back
		Fake f;
		f.out = {{"o1", "TM-1"}, {"o2", "IAC Bus"}};
		f.current = "o2";
		Memory m;
		m.output = f.out[1];
		auto o = apply(m, f);
		check(!o.outputChanged && f.calls.empty(), "the chosen output already open: nothing to do");
		f.out = {{"o1", "TM-1"}};	// the IAC bus goes
		o = apply(m, f);
		check(o.outputChanged && f.current.empty(), "an output that went is closed");
		check(m.output.id == "o2", "and stays remembered");
		f.out.push_back({"o2", "IAC Bus"});
		o = apply(m, f);
		check(o.outputBack && f.current == "o2", "it comes back when listed again");
		// the user chose none: a stale list that brings one back is undone
		m.output = {};
		f.current = "o1";
		o = apply(m, f);
		check(o.outputChanged && f.current.empty(), "none chosen: an output that JUCE brought back is closed");
	}
	{
		// the user switched an input off, JUCE's stale list switched it on: off again; a dead handle goes; twins stay
		Fake f;
		f.in = {{"a", "USB MIDI"}, {"b", "USB MIDI"}, {"k", "Keys"}};
		f.on = {"a", "b", "k", "dead"};
		Memory m;
		m.inputs = {{"a", "USB MIDI"}, {"b", "USB MIDI"}};
		const auto o = apply(m, f);
		check(f.on == Ids({"a", "b"}) && o.switchedOff.size() == 2, "unremembered and dead inputs go off, twins stay on");
		f.on = {};
		const auto back = apply(m, f);
		check(back.switchedOn.size() == 2 && f.on.size() == 2, "both twins come back");
	}
	{
		// a change from another source (the settings dialog) is taken into the memory
		Fake f;
		f.in = {{"a", "Keys"}, {"b", "Pads"}};
		f.on = {"b"};
		f.out = {{"o1", "TM-1"}};
		f.current = "o1";
		Memory m;
		m.inputs = {{"a", "Keys"}};
		sync(m, f);
		check(m.inputs.size() == 1 && m.inputs[0].id == "b", "an input switched on elsewhere is remembered, one switched off is forgotten");
		check(m.output.id == "o1", "the output chosen elsewhere is remembered");
		f.current.clear();
		sync(m, f);
		check(m.output.id.empty(), "none chosen elsewhere is remembered");
		Memory away;
		away.inputs = {{"gone", "Away"}};
		away.output = {"og", "Away out"};
		sync(away, f);
		check(listed(away.inputs, "gone") && away.output.id == "og", "ports that are away are left alone");
	}

	std::printf("mdMidiHotplugTest: %s (%d failure(s))\n", g_failed ? "FAIL" : "PASS", g_failed);
	return g_failed ? 1 : 0;
}
