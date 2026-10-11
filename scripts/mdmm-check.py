#!/usr/bin/env python3
"""The development cycle's checks in one command (doc/release/DEV-CYCLE.md): what the change touches decides what runs
(scripts/mdmm-affected.tsv). Called by scripts/mdmm-check.sh; see there for the usage."""
import fnmatch
import glob
import json
import os
import re
import shlex
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.environ.get("MDMM_DEV_BUILD", os.path.join(ROOT, "temp", "dev"))
MAP = os.path.join(ROOT, "scripts", "mdmm-affected.tsv")
GOLDENS = os.path.join(ROOT, "source/elektron/md/mdLibTest/goldens/mdmm-goldens.json")
# never in a unit lane: the firmware tests (ROM), the plug-in bundles' tests, the AU and VST packaging checks
NOT_UNIT_LABELS = "FirmwareTest|PluginTest"
NOT_UNIT_NAMES = "_AU|VST|Plugin_|PluginTest"
DEFAULT_ROW = {"path": "(no row)", "ctest": "all", "firmware": "-", "page": "*", "machine": "-", "goldens": "no"}


def say(text):
	print(text, flush=True)


def load_map():
	rows = []
	with open(MAP, encoding="utf-8") as f:
		for line in f:
			line = line.rstrip("\n")
			if not line or line.startswith("#"):
				continue
			cols = line.split("\t")
			if len(cols) != 6:
				raise SystemExit(f"{MAP}: a row without 6 columns: {line!r}")
			rows.append(dict(zip(["path", "ctest", "firmware", "page", "machine", "goldens"], cols)))
	return rows


def row_for(path, rows):
	for r in rows:
		if fnmatch.fnmatchcase(path, r["path"]):
			return r
	return DEFAULT_ROW


def git(*args):
	return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True).stdout.split("\n")


def changed_files(scope):
	"""save: what is not committed yet; branch: also every commit since main"""
	files = set(f for f in git("diff", "--name-only", "HEAD") if f)
	files |= set(f for f in git("ls-files", "--others", "--exclude-standard") if f)
	if scope != "save":
		base = (git("merge-base", "HEAD", os.environ.get("MDMM_CHECK_BASE", "main")) or [""])[0].strip()
		if base:
			files |= set(f for f in git("diff", "--name-only", base, "HEAD") if f)
	return sorted(files)


class Plan:
	def __init__(self, files, rows):
		self.files = files
		self.per_file = [(f, row_for(f, rows)) for f in files]
		used = [r for _, r in self.per_file]
		self.ctest_all = any(r["ctest"] == "all" for r in used)
		self.ctest = sorted({r["ctest"] for r in used if r["ctest"] not in ("-", "all")})
		self.firmware = sorted({r["firmware"] for r in used if r["firmware"] != "-"})
		self.page = sorted({p for r in used if r["page"] != "-" for p in r["page"].split(",")})
		self.machine = sorted({p for r in used if r["machine"] != "-" for p in r["machine"].split(",")})
		self.goldens = any(r["goldens"] == "yes" for r in used)
		self.contract = any(f.startswith("source/elektron/md/mdJucePlugin/skins/") or f.startswith("doc/modern-ux/") for f in files)

	def describe(self):
		lines = []
		for f, r in self.per_file:
			lines.append(f"  {f}  ->  {r['path']}")
		return "\n".join(lines)


def editors_of(selectors):
	"""md, mm or both, and the selector for scripts/mdmm-page.mjs and mdmm-journeys.sh"""
	if "*" in selectors or "journey" in selectors:
		return "both", "journey"
	which = {s[:2] for s in selectors}
	editor = "md" if which == {"md"} else "mm" if which == {"mm"} else "both"
	return editor, "journey-" + ",".join(selectors)


def ctest_tests():
	"""{name: {"labels": [...], "command": [...]}} from the build tree"""
	out = subprocess.run(["ctest", "--test-dir", BUILD, "-N", "--show-only=json-v1"], capture_output=True, text=True).stdout
	tests = {}
	for t in json.loads(out or '{"tests": []}').get("tests", []):
		labels = []
		for p in t.get("properties", []):
			if p["name"] == "LABELS":
				labels = p["value"]
		tests[t["name"]] = {"labels": labels, "command": t.get("command", []), "disabled": any(p["name"] == "DISABLED" and p["value"] for p in t.get("properties", []))}
	return tests


def ninja_targets():
	out = subprocess.run(["ninja", "-C", BUILD, "-t", "targets", "all"], capture_output=True, text=True).stdout
	return {l.split(":")[0] for l in out.split("\n") if l}


def rom(machine):
	env = os.environ.get("GEARMULATOR_MD_FIRMWARE_BIN" if machine == "md" else "GEARMULATOR_MM_FIRMWARE_BIN")
	if env and os.path.isfile(env):
		return env
	folder = os.path.expanduser(f"~/Documents/Gearmulator Preview/{'Machinedrum' if machine == 'md' else 'Monomachine'}/roms")
	found = sorted(glob.glob(os.path.join(folder, "*")))
	return found[0] if found else None


class Runner:
	def __init__(self, dry):
		self.dry = dry
		self.steps = []
		self.failed = []
		self.t0 = time.time()

	def run(self, name, cmd, env=None, cwd=ROOT):
		say(f"-- {name}: {' '.join(shlex.quote(c) for c in cmd)}")
		if self.dry:
			self.steps.append((name, "planned", 0.0))
			return True
		t = time.time()
		r = subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})})
		secs = time.time() - t
		ok = r.returncode == 0
		self.steps.append((name, "ok" if ok else f"FAIL (exit {r.returncode})", secs))
		if not ok:
			self.failed.append(name)
		return ok

	def note(self, name, text):
		say(f"-- {name}: {text}")
		self.steps.append((name, text, 0.0))

	def summary(self, tier):
		say("")
		for name, result, secs in self.steps:
			say(f"   {secs:6.1f} s  {name}: {result}")
		total = time.time() - self.t0
		verdict = "FAILED: " + ", ".join(self.failed) if self.failed else "green"
		say(f"CHECK {tier}: {verdict} in {total:.0f} s")
		return 1 if self.failed else 0


def ensure_configured(runner):
	if not os.path.isfile(os.path.join(BUILD, "build.ninja")):
		runner.run("configure", [os.path.join(ROOT, "scripts", "mdmm-dev.sh"), "configure"])


def unit_tests(runner, plan, tier, tests, targets):
	"""build the test programs the chosen tests run, then run them in parallel (save: not the Slow and Timing ones)"""
	def unit(n):
		t = tests[n]
		return not t["disabled"] and not set(t["labels"]) & set(NOT_UNIT_LABELS.split("|")) and not re.search(NOT_UNIT_NAMES, n) \
			and not (tier == "save" and set(t["labels"]) & {"Slow", "Timing"})
	if plan.ctest_all or tier == "branch":
		selected = [n for n in tests if unit(n)]
	else:
		chosen = set()
		for sel in plan.ctest:
			chosen |= {n for n, t in tests.items() if (sel[2:] in t["labels"] if sel.startswith("L:") else re.search(sel, n))}
		selected = sorted(n for n in chosen if unit(n))
	if not selected:
		runner.note("unit tests", "none for these files")
		return
	build = set()
	for n in selected:
		for arg in tests[n]["command"]:
			for part in arg.split("="):
				if part.startswith(BUILD) and os.path.basename(part) in targets:
					build.add(os.path.basename(part))
	if build:
		runner.run(f"build {len(build)} test program(s)", ["cmake", "--build", BUILD, "--target", *sorted(build)],
			env={"GEARMULATOR_DATA_ROOT": os.path.join(BUILD, "build-data") + "/"})
	regex = "^(" + "|".join(sorted(selected)) + ")$"
	jobs = str(os.cpu_count() or 8)
	os.makedirs(os.path.join(BUILD, "build-data"), exist_ok=True)
	runner.run(f"unit tests ({len(selected)})", ["ctest", "--test-dir", BUILD, "-j", jobs, "--output-on-failure", "-R", regex],
		env={"GEARMULATOR_DATA_ROOT": os.path.join(BUILD, "build-data") + "/"})


def page_journeys(runner, selectors):
	if not selectors:
		runner.note("page journeys", "none for these files")
		return
	editor, sel = editors_of(selectors)
	runner.run("build deskStubHost", ["cmake", "--build", BUILD, "--target", "deskStubHost"])
	runner.run(f"page journeys ({editor}: {sel})", ["node", os.path.join(ROOT, "scripts", "mdmm-page.mjs"), "--jobs", "4", editor, sel],
		env={"MDMM_STUB_HOST": os.path.join(BUILD, "source/elektron/md/deskStubHost/deskStubHost")})


def goldens_quick(runner):
	tool = os.path.join(BUILD, "source/elektron/md/mdLibTest/mdmmPerfGateTest")
	roms = {m: rom(m) for m in ("md", "mm")}
	if not all(roms.values()):
		runner.note("goldens", "skipped: no ROM here (GEARMULATOR_MD_FIRMWARE_BIN / GEARMULATOR_MM_FIRMWARE_BIN)")
		return
	runner.run("build mdmmPerfGateTest", ["cmake", "--build", BUILD, "--target", "mdmmPerfGateTest"])
	for m in ("md", "mm"):
		runner.run(f"golden {m} (one, 8 s)", [tool, roms[m], m, "8", "--golden", GOLDENS])


def main():
	args = sys.argv[1:]
	tier, dry, files, watch = "quick", False, None, False
	while args:
		a = args.pop(0)
		if a in ("--save", "--quick", "--branch"):
			tier = a[2:]
		elif a == "--dry-run":
			dry = True
		elif a == "--watch":
			watch = True
		elif a == "--files":
			files, args = args, []
		else:
			raise SystemExit(f"unknown argument {a} (scripts/mdmm-check.sh --help)")
	rows = load_map()
	if watch:
		return watch_loop(rows)
	files = files if files is not None else changed_files(tier)
	plan = Plan(files, rows)
	say(f"== check {tier}: {len(files)} changed file(s)")
	if files:
		say(plan.describe())
	runner = Runner(dry)
	if not files and tier != "branch":
		say("nothing changed")
		return 0
	ensure_configured(runner)
	tests = ctest_tests() if not dry or os.path.isdir(BUILD) else {}
	targets = ninja_targets() if os.path.isfile(os.path.join(BUILD, "build.ninja")) else set()
	if plan.contract or tier == "branch":
		# the sync scripts' --check: the pages in step with their mockups, and against the contract (page_contract_check.py)
		runner.run("page contract (MD)", [sys.executable, os.path.join(ROOT, "doc/modern-ux/sync-mdstudio-skin.py"), "--check"])
		runner.run("page contract (MM)", [sys.executable, os.path.join(ROOT, "doc/modern-ux/sync-mmstudio-skin.py"), "--check"])
	unit_tests(runner, plan, tier, tests, targets)
	if tier in ("quick", "branch"):
		page_journeys(runner, ["*"] if tier == "branch" else plan.page)
		if plan.goldens and tier == "quick":
			goldens_quick(runner)
	if tier == "branch":
		roms = {m: rom(m) for m in ("md", "mm")}
		if plan.firmware:
			if all(roms.values()):
				regex = "|".join(plan.firmware)
				runner.run("firmware tests", ["ctest", "--test-dir", BUILD, "-j", "4", "--output-on-failure", "-R", regex, "-L", "FirmwareTest"],
					env={"GEARMULATOR_MD_FIRMWARE_BIN": roms["md"], "GEARMULATOR_MM_FIRMWARE_BIN": roms["mm"],
						"GEARMULATOR_DATA_ROOT": os.path.join(BUILD, "build-data") + "/"})
			else:
				runner.note("firmware tests", "skipped: no ROM here")
		if plan.machine:
			if all(roms.values()):
				editor, sel = editors_of(plan.machine)
				runner.run("build the editors", [os.path.join(ROOT, "scripts", "mdmm-dev.sh"), "build"])
				runner.run(f"machine journeys ({editor}: {sel})", [os.path.join(ROOT, "scripts", "mdmm-journeys.sh"), "--tier", "machine", "--jobs", "4", editor, sel],
					env={"MDMM_APP_DIR": os.path.join(BUILD, "bin/plugins/Release/Standalone") if os.path.isdir(os.path.join(BUILD, "bin")) else os.path.join(ROOT, "bin/plugins/Release/Standalone")})
			else:
				runner.note("machine journeys", "skipped: no ROM here")
		if plan.goldens:
			if all(roms.values()):
				runner.run("goldens (all)", [os.path.join(ROOT, "scripts", "mdmm-local-gate.sh"), "--build", BUILD],
					env={"MDMM_GATE_SKIP_BUILD": "1", "MDMM_GATE_ONLY": "5"})
			else:
				runner.note("goldens", "skipped: no ROM here")
	return runner.summary(tier)


def watch_loop(rows):
	"""Tier 0 on every save: node's fs.watch (recursive) on the sources, the scripts and the contract"""
	watcher = r"""
const fs = require("fs"), path = require("path");
const root = process.argv[1], seen = new Set();
let t = 0;
for (const d of ["source/elektron", "source/synthLib", "source/baseLib", "doc/modern-ux", "scripts"]) {
	try { fs.watch(path.join(root, d), { recursive: true }, (ev, f) => {
		if (!f || /(^|\/)(\.|#)|~$|\.swp$/.test(f)) return;
		seen.add(path.join(d, f)); clearTimeout(t);
		t = setTimeout(() => { console.log([...seen].join("\n")); process.exit(0); }, 400); }); } catch (e) { }
}
"""
	say("== watching (Ctrl-C stops): each save runs the save-time checks for the files saved")
	while True:
		r = subprocess.run(["node", "-e", watcher, ROOT], capture_output=True, text=True)
		files = sorted({f for f in r.stdout.split("\n") if f and os.path.isfile(os.path.join(ROOT, f))})
		if not files:
			continue
		subprocess.run([sys.executable, os.path.abspath(__file__), "--save", "--files", *files])


if __name__ == "__main__":
	sys.exit(main())
