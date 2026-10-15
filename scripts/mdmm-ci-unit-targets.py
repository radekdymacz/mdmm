#!/usr/bin/env python3
"""The ROM-free unit tests of the core CI, chosen by CTest label (.github/workflows/mdmm-core.yml).

usage: mdmm-ci-unit-targets.py BUILD_DIR            one build target per line
       mdmm-ci-unit-targets.py BUILD_DIR --tests    the `ctest -R` regex of the same selection

Selection: label UnitTest, without Slow (long), Timing (a shared runner's clock is no measure), Page (the node page
tests run in the page suite, mdmm-page.yml) and dsp56300 (its own step). Firmware tests carry other labels
(FirmwareTest, Integration) and the ones that read a local file skip themselves (exit 77), so no test is picked by
name. A test is selected when it has a build target of its own name, or of its name without a final "s"
(mdLibTests): tests that run a script (node, python, cmake) or share another test's executable
are left to their own jobs.
"""
import json
import subprocess
import sys

SKIP = {"Slow", "Timing", "Page", "dsp56300"}


def labels(test):
    return {v for p in test["properties"] if p["name"] == "LABELS" for v in p["value"]}


def main():
    build = sys.argv[1]
    tests = json.loads(subprocess.run(
        ["ctest", "--test-dir", build, "-L", "UnitTest", "--show-only=json-v1"],
        check=True, capture_output=True, text=True).stdout)["tests"]
    known = {line.split(":")[0] for line in subprocess.run(
        ["ninja", "-C", build, "-t", "targets", "all"], check=True, capture_output=True, text=True).stdout.splitlines()}
    picked = {}
    for test in tests:
        name = test["name"]
        if SKIP & labels(test):
            continue
        for target in (name, name[:-1] if name.endswith("s") else name):
            if target in known:
                picked[name] = target
                break
    if "--tests" in sys.argv:
        print("^(" + "|".join(sorted(picked)) + ")$")
    else:
        print("\n".join(sorted(set(picked.values()))))


main()
