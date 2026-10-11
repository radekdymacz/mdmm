#!/usr/bin/env python3
"""Check the built editors carry the plug-in identity set in scripts/mdmm-product.env, and not the old one.

    scripts/check_mdmm_plugin_ids.py PRODUCTS_FOLDER [--require-au]

PRODUCTS_FOLDER holds the built bundles, loose or in AU/ and VST3/ below it (bin/plugins/Release, or a release's
staging folder). For each editor:
  - the Audio Unit (macOS): Info.plist AudioComponents is type aumu with MDMM_AU_SUBTYPE_<MD|MM> and
    MDMM_AU_MANUFACTURER, named "<vendor>: <product>", and the bundle identifier is the env file's;
  - the VST3 (every platform): moduleinfo.json lists the processor and controller class IDs JUCE derives from the
    same codes (JUCE_VST3_CAN_REPLACE_VST2=0: ABCDEF01 9182FAEB / ABCDEF01 1234ABCD, then the hex of the
    manufacturer and plug-in codes), with the vendor and product name;
  - neither carries the codes up to 0.5.x (MDMM_LEGACY_AU_*: the original Gearmulator MD / MM's, B-048), and the
    current codes are not the old ones.
Run by ctest (mdmmIdentityTest) after a build, and by hand on a release's bundles. Read-only.
"""

import json
import os
import plistlib
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
failures = 0


def check(ok, what):
    global failures
    print(("ok   " if ok else "FAIL ") + what)
    if not ok:
        failures += 1


def read_env(path):
    values = {}
    with open(path) as f:
        for line in f:
            m = re.match(r'^(MDMM_[A-Z_]+)="(.*)"$', line.rstrip("\n"))
            if m:
                values[m.group(1)] = m.group(2)
    return values


def hex4(code):
    return code.encode("ascii").hex().upper()


def class_ids(manufacturer, subtype):
    tail = hex4(manufacturer) + hex4(subtype)
    return {"Audio Module Class": "ABCDEF019182FAEB" + tail, "Component Controller Class": "ABCDEF011234ABCD" + tail}


def find_bundle(products, name):
    for where in (products, os.path.join(products, "AU"), os.path.join(products, "VST3")):
        path = os.path.join(where, name)
        if os.path.isdir(path):
            return path
    return os.path.join(products, name)


def find_moduleinfo(vst3):
    for dirpath, _dirs, files in os.walk(vst3):
        if "moduleinfo.json" in files:
            return os.path.join(dirpath, "moduleinfo.json")
    return None


def load_json_lenient(path):
    # The VST3 SDK writes JSON5-ish files (trailing commas); drop those before parsing.
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return json.loads(re.sub(r",(\s*[}\]])", r"\1", text))


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    products = argv[1]
    require_au = "--require-au" in argv[2:]
    env = read_env(os.path.join(HERE, "mdmm-product.env"))
    manufacturer = env["MDMM_AU_MANUFACTURER"]
    legacy_manufacturer = env["MDMM_LEGACY_AU_MANUFACTURER"]
    vendor = env["MDMM_VENDOR"]

    check(manufacturer != legacy_manufacturer,
          "the manufacturer code %s is not the old %s" % (manufacturer, legacy_manufacturer))
    check(re.fullmatch(r"[A-Za-z0-9]{4}", manufacturer) is not None and re.search("[A-Z]", manufacturer) is not None,
          "the manufacturer code %s is four characters with an upper-case one" % manufacturer)

    vst3_found = 0
    for machine in ("MD", "MM"):
        product = env["MDMM_PRODUCT_NAME_" + machine]
        subtype = env["MDMM_AU_SUBTYPE_" + machine]
        legacy_subtype = env["MDMM_LEGACY_AU_SUBTYPE_" + machine]
        bundle_id = env["MDMM_BUNDLE_ID_" + machine]
        check(re.fullmatch(r"[A-Z][a-z0-9]{3}", subtype) is not None,
              "%s: the plug-in code %s is one upper-case letter and three lower-case" % (machine, subtype))
        legacy_ids = set(class_ids(legacy_manufacturer, legacy_subtype).values())

        au = find_bundle(products, product + ".component")
        if os.path.isdir(au):
            with open(os.path.join(au, "Contents", "Info.plist"), "rb") as f:
                info = plistlib.load(f)
            check(info.get("CFBundleIdentifier") == bundle_id,
                  "%s AU: bundle identifier %s" % (machine, info.get("CFBundleIdentifier")))
            components = info.get("AudioComponents") or []
            check(len(components) == 1, "%s AU: one Audio Unit registered (%d)" % (machine, len(components)))
            for c in components:
                check((c.get("type"), c.get("subtype"), c.get("manufacturer")) == ("aumu", subtype, manufacturer),
                      "%s AU: registers aumu %s %s (found %s %s %s)" % (machine, subtype, manufacturer, c.get("type"),
                                                                         c.get("subtype"), c.get("manufacturer")))
                check(c.get("name") == "%s: %s" % (vendor, product),
                      "%s AU: named %r" % (machine, c.get("name")))
                check(c.get("subtype") != legacy_subtype or c.get("manufacturer") != legacy_manufacturer,
                      "%s AU: not the old codes %s %s" % (machine, legacy_subtype, legacy_manufacturer))
        else:
            check(not require_au, "%s AU: %s is there" % (machine, au))

        vst3 = find_bundle(products, product + ".vst3")
        if not os.path.isdir(vst3):
            check(False, "%s VST3: %s is there" % (machine, vst3))
            continue
        vst3_found += 1
        moduleinfo = find_moduleinfo(vst3)
        check(moduleinfo is not None, "%s VST3: moduleinfo.json is in the bundle" % machine)
        if moduleinfo is None:
            continue
        info = load_json_lenient(moduleinfo)
        classes = {c.get("Category"): c for c in info.get("Classes", [])}
        for category, cid in class_ids(manufacturer, subtype).items():
            found = classes.get(category, {}).get("CID", "").upper()
            check(found == cid, "%s VST3: %s %s (found %s)" % (machine, category, cid, found or "none"))
        audio = classes.get("Audio Module Class", {})
        check(audio.get("Vendor") == vendor and audio.get("Name") == product,
              "%s VST3: vendor %r, name %r" % (machine, audio.get("Vendor"), audio.get("Name")))
        all_ids = {c.get("CID", "").upper() for c in info.get("Classes", [])}
        check(not (all_ids & legacy_ids), "%s VST3: none of the old class IDs (%s)" % (machine, ", ".join(sorted(legacy_ids))))
        legacy_tail = hex4(legacy_manufacturer) + hex4(legacy_subtype)
        check(not any(i.endswith(legacy_tail) for i in all_ids),
              "%s VST3: no class ID ends in the old codes' %s" % (machine, legacy_tail))

    check(vst3_found > 0, "at least one VST3 found in %s" % products)
    print("check_mdmm_plugin_ids: %s" % ("all passed" if failures == 0 else "%d FAILED" % failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
