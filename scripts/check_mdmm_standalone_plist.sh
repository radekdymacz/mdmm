#!/bin/sh
# B-155: the built standalone apps carry the usage keys macOS wants. Without NSBluetoothAlwaysUsageDescription the
# system takes the app down when CoreMIDI's Bluetooth pairing window opens; without NSMicrophoneUsageDescription it
# gives the app an input device and no input.
#
#     scripts/check_mdmm_standalone_plist.sh APP_BUNDLE...
#
# Reads each bundle's Contents/Info.plist with plutil. Exit 77 (ctest: skipped) when no bundle is built. Read-only.
fail=0
seen=0
for app in "$@"; do
	plist="$app/Contents/Info.plist"
	[ -f "$plist" ] || { echo "skip $app: not built"; continue; }
	seen=$((seen + 1))
	for key in NSBluetoothAlwaysUsageDescription NSMicrophoneUsageDescription; do
		text=$(plutil -extract "$key" raw -o - "$plist" 2>/dev/null)
		if [ -n "$text" ]; then
			echo "ok   $(basename "$app"): $key = $text"
		else
			echo "FAIL $(basename "$app"): $key is missing or empty"
			fail=1
		fi
	done
done
[ "$seen" -gt 0 ] || exit 77
exit $fail
