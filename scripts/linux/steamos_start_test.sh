#!/bin/bash
# The SteamOS start test (mdmm-editors-linux.yml, job steamos; doc/release/CI.md). Runs INSIDE the SteamOS 3 "holo"
# container (the Steam Deck Homebrew image, pinned by digest in the workflow), as root, with the repository's scripts
# folder, the packaged archives and an output folder mounted. GitHub has no SteamOS runner; this is the closest we
# can get: Valve's own package repositories (the versioned holo-3.x / core-3.x / extra-3.x ones) and its glibc.
#
#   scripts/linux/steamos_start_test.sh bare     <archives> <out dir> <vst3 host>
#   scripts/linux/steamos_start_test.sh packages <archives> <out dir> <vst3 host>
#
#   bare      only what a stock SteamOS desktop has that we can name with confidence (alsa-lib, Mesa's libGL, the X11
#             client libraries, freetype, fontconfig) plus the test's own tools (Xvfb); no GTK, no WebKitGTK. Starts
#             each standalone on a virtual display and records what happens. Informational: always exits 0.
#   packages  the same plus webkit2gtk-4.1 and gtk3 from pacman, then scripts/linux/smoke_mdmm.sh (standalone and
#             VST3, page, bridge, keys, zoom). Exits with the smoke test's status.
set -uo pipefail

mode="$1"
archives="$(realpath "$2")"
mkdir -p "$3"
out="$(realpath "$3")"
vst3_host="$4"
script_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../mdmm-product.env
. "${script_dir}/../mdmm-product.env"

# What a stock SteamOS desktop (KDE Plasma, X11 and XWayland, PipeWire with its ALSA layer) has that we can name with
# confidence. Not in it, as far as we know: GTK 3 and WebKitGTK (the case this test is about).
stock_packages=(alsa-lib mesa libx11 libxext libxcursor libxinerama libxrandr libxrender libxcomposite freetype2 fontconfig)
# The test's own tools (virtual display, input, screenshots, bridge watcher, accessibility tree), not the user's.
tool_packages=(xorg-server-xvfb xdotool imagemagick inotify-tools dbus at-spi2-core python-gobject glib2 procps-ng)
# What the editor window needs on top (README-Linux.txt).
window_packages=(webkit2gtk-4.1 gtk3)

# The container image has no /var/tmp (a real SteamOS has it); the start test watches it for the bridge's files.
mkdir -p /var/tmp && chmod 1777 /var/tmp

summary="${out}/steamos-${mode}.md"
: > "${summary}"
say() { echo "$*" | tee -a "${summary}"; }
os="$(. /etc/os-release && echo "${PRETTY_NAME} ${VERSION_ID} (build ${BUILD_ID})")"

install() {
	pacman-key --init > /dev/null 2>&1 && pacman-key --populate holo archlinux > /dev/null 2>&1
	pacman -Sy --noconfirm > /dev/null 2>&1 || { echo "pacman -Sy failed"; return 1; }
	pacman -S --noconfirm --needed "$@" > "${out}/pacman-${mode}.txt" 2>&1 || { tail -n 20 "${out}/pacman-${mode}.txt"; return 1; }
	tail -n 3 "${out}/pacman-${mode}.txt"
}

if [[ "${mode}" == "bare" ]]; then
	say "#### SteamOS bare: ${os}, no GTK, no WebKitGTK"
	say ""
	for entry in "Machinedrum-Editor|${MDMM_PRODUCT_NAME_MD}" "Monomachine-Editor|${MDMM_PRODUCT_NAME_MM}"; do
		IFS='|' read -r asset product <<< "${entry}"
		work="$(mktemp -d)"
		tar -C "${work}" -xzf "${archives}/${asset}-Linux-x64-not-tested.tar.gz"
		app_dir="${work}/${asset}-Linux-x64/Standalone"
		say "**${product} standalone, nothing installed** (ldd): $(cd "${app_dir}" && ldd "./${product}" 2>&1 | grep 'not found' | sed 's/^[[:space:]]*//' | tr '\n' ';')"
		(cd "${app_dir}" && timeout 10 "./${product}" > "${work}/none.txt" 2>&1; echo "exit ${?}" >> "${work}/none.txt")
		say '```'; say "$(tail -n 5 "${work}/none.txt")"; say '```'
	done
	install "${stock_packages[@]}" "${tool_packages[@]}" || say "package install failed"
	say ""
	say "**With the stock packages (${stock_packages[*]}):**"
	export DISPLAY=:98
	Xvfb "${DISPLAY}" -screen 0 1600x1000x24 > /dev/null 2>&1 &
	xvfb=$!
	sleep 2
	for entry in "Machinedrum-Editor|${MDMM_PRODUCT_NAME_MD}" "Monomachine-Editor|${MDMM_PRODUCT_NAME_MM}"; do
		IFS='|' read -r asset product <<< "${entry}"
		work="$(mktemp -d)"
		tar -C "${work}" -xzf "${archives}/${asset}-Linux-x64-not-tested.tar.gz"
		app_dir="${work}/${asset}-Linux-x64/Standalone"
		mkdir -p "${work}/home"
		( cd "${app_dir}" && HOME="${work}/home" XDG_CONFIG_HOME="${work}/home/.config" \
			GEARMULATOR_DATA_ROOT="${work}/home/data/" "./${product}" > "${work}/out.txt" 2> "${work}/err.txt" ) &
		pid=$!
		sleep 25
		if kill -0 "${pid}" 2>/dev/null; then alive="running after 25 s"; else wait "${pid}"; alive="exited with code $?"; fi
		web="no"; pgrep -f WebKitWebProcess > /dev/null && web="yes"
		short="$(echo "${product}" | cut -d' ' -f1 | tr 'A-Z' 'a-z')"
		import -display "${DISPLAY}" -window root "${out}/steamos-bare-${short}.png" 2>/dev/null || true
		say "- **${product} standalone:** ${alive}; WebKitWebProcess: ${web}"
		say '```'
		say "$(cat "${work}/out.txt" "${work}/err.txt" | tail -n 12)"
		say '```'
		kill -9 "${pid}" 2>/dev/null; wait "${pid}" 2>/dev/null
	done
	kill "${xvfb}" 2>/dev/null
	[[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && cat "${summary}" >> "${GITHUB_STEP_SUMMARY}"
	exit 0
fi

echo "== ${os}"
install "${stock_packages[@]}" "${tool_packages[@]}" "${window_packages[@]}" || exit 1
pacman -Q "${window_packages[@]}" webkit2gtk-4.1 | sort -u | tee "${out}/steamos-packages-versions.txt"
pacman -Qq > "${out}/steamos-all-installed.txt"
exec "${script_dir}/smoke_mdmm.sh" "${archives}" "${out}/smoke" "${vst3_host}"
