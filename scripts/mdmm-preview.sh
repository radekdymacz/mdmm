#!/bin/sh
# A live preview of the real production page for design and interaction work (doc/release/DEV-CYCLE.md, "Page preview"):
# no ROM, no JUCE app or plug-in. It builds only deskStubHost (the editors' real core with a fake machine) in its own
# tree, temp/preview, then serves the page from the skin folder (no cache) and prints a localhost URL to open in a normal
# browser. Ctrl+C stops it.
#
#   scripts/mdmm-preview.sh md|mm [--port N] [--build-only]
#
# Port: 8791 for md, 8792 for mm (the entries in .claude/launch.json). Edit a skin file under
# source/elektron/md/mdJucePlugin/skins/ and reload the browser. Edit a design source (doc/modern-ux/mockup/index.html,
# skins/mmStudio/src/**, a shared stylesheet) and the sync script runs by itself, then reload. C++ is rebuilt
# only when you start the preview again (ninja does nothing when nothing changed, a second or two).
# Environment: MDMM_PREVIEW_BUILD another build folder (default <checkout>/temp/preview), MDMM_PREVIEW_JOBS parallel jobs.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BUILD=${MDMM_PREVIEW_BUILD:-"$ROOT/temp/preview"}
JOBS=${MDMM_PREVIEW_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 8)}
ed=${1:-}
case "$ed" in md|mm) shift ;; *) echo "usage: scripts/mdmm-preview.sh md|mm [--port N] [--build-only]" >&2; exit 2 ;; esac
port=$([ "$ed" = md ] && echo 8791 || echo 8792)
buildonly=0
while [ $# -gt 0 ]; do
	case "$1" in
		--port) port=$2; shift 2 ;;
		--build-only) buildonly=1; shift ;;
		*) echo "unknown argument $1" >&2; exit 2 ;;
	esac
done
if [ "$(uname -s)" = Darwin ] && [ -z "${SDKROOT:-}" ]; then
	SDKROOT=$(xcrun --sdk macosx --show-sdk-path)
	export SDKROOT
fi

[ -f "$ROOT/source/3rdparty/freetype/CMakeLists.txt" ] || git -C "$ROOT" submodule update --init --recursive
if [ ! -f "$BUILD/build.ninja" ]; then
	set --
	if command -v ccache >/dev/null 2>&1; then
		ccache=$(command -v ccache)
		l="/usr/bin/env;CCACHE_BASEDIR=$ROOT;CCACHE_SLOPPINESS=include_file_mtime,include_file_ctime,time_macros,pch_defines;CCACHE_COMPILERCHECK=%compiler% -v;$ccache"
		set -- "-DCMAKE_C_COMPILER_LAUNCHER=$l" "-DCMAKE_CXX_COMPILER_LAUNCHER=$l"
	else
		echo "   ccache not found (brew install ccache): building uncached" >&2
	fi
	[ "$(uname -s)" = Darwin ] && set -- "$@" "-DCMAKE_OSX_ARCHITECTURES=$(uname -m)" "-DCMAKE_OSX_DEPLOYMENT_TARGET=10.13" "-DCMAKE_OSX_SYSROOT=$SDKROOT"
	# The same smallest configure as .github/workflows/mdmm-page.yml: the plug-in is switched on only so the editors' core
	# libraries are defined; no plug-in target is built.
	cmake -S "$ROOT" -B "$BUILD" -G Ninja -DCMAKE_BUILD_TYPE=Release "$@" -DBUILD_TESTING=ON \
		-Dgearmulator_BUILD_JUCEPLUGIN=ON -Dgearmulator_BUILD_JUCEPLUGIN_VST3=OFF \
		-Dgearmulator_BUILD_JUCEPLUGIN_AU=OFF -Dgearmulator_BUILD_JUCEPLUGIN_Standalone=OFF
fi
cmake --build "$BUILD" --parallel "$JOBS" --target deskStubHost
[ "$buildonly" = 1 ] && exit 0
MDMM_STUB_HOST=$(find "$BUILD" -name deskStubHost -type f -perm -u+x -not -path '*/CMakeFiles/*' | head -1)
export MDMM_STUB_HOST
MDMM_PREVIEW_BUILD=$BUILD exec node "$ROOT/scripts/mdmm-page.mjs" --serve "$ed" --port "$port"
