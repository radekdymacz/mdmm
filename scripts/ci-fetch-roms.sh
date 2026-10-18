#!/bin/bash
# CI only (.github/workflows/mdmm-firmware.yml): fetches the two firmware images from the ROM Worker (ci/rom-worker)
# with this run's GitHub OIDC token, checks their SHA-256 against the constants in scripts/macos/build_mdmm.sh, and
# exports GEARMULATOR_MD_FIRMWARE_BIN / GEARMULATOR_MM_FIRMWARE_BIN through GITHUB_ENV.
#   scripts/ci-fetch-roms.sh <empty folder under RUNNER_TEMP> [--sysex]
# --sysex also fetches the private MD/MM import backups and exports MD_SYX / MM_SYX. All files go in the same
# temporary folder so the workflow's existing cleanup removes them before uploading any reports.
# Needs: MDMM_ROM_URL (environment variable of the `rom` environment), ACTIONS_ID_TOKEN_REQUEST_URL/_TOKEN (id-token: write).
# The token and the images are never printed. No `set -x`.
set -euo pipefail
dir="${1:?usage: ci-fetch-roms.sh <folder> [--sysex]}"
sysex=false
if [ "${2:-}" = --sysex ] && [ "$#" -eq 2 ]; then
	sysex=true
elif [ "$#" -ne 1 ]; then
	echo "usage: ci-fetch-roms.sh <folder> [--sysex]" >&2
	exit 2
fi
: "${MDMM_ROM_URL:?MDMM_ROM_URL is not set (environment rom)}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?no id-token permission}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?no id-token permission}"
: "${GITHUB_ENV:?not in Actions}"
here="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "${dir}"
chmod 700 "${dir}"
umask 077

# the expected hashes come from the one place the release build already pins them
md_sha="$(sed -n 's/^readonly md_firmware_bin_sha256="\([0-9a-f]\{64\}\)"$/\1/p' "${here}/macos/build_mdmm.sh")"
mm_sha="$(sed -n 's/^readonly mm_firmware_bin_sha256="\([0-9a-f]\{64\}\)"$/\1/p' "${here}/macos/build_mdmm.sh")"
[ -n "${md_sha}" ] && [ -n "${mm_sha}" ] || { echo "cannot read the firmware hashes from build_mdmm.sh" >&2; exit 1; }

token="$(curl -fsS --max-time 30 -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
	"${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=mdmm-rom" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["value"])')"
echo "::add-mask::${token}"

fetch_file() {
	local route="$1" out="$2" size="$3" want="$4" bytes got
	# the token goes to curl on stdin as a config file, not on its command line
	printf 'header = "Authorization: Bearer %s"\n' "${token}" |
		curl -fsS --max-time 300 --retry 2 -K - -o "${out}" "${MDMM_ROM_URL%/}/${route}" || { echo "${route}: the ROM Worker refused or failed" >&2; rm -f "${out}"; exit 1; }
	bytes="$(wc -c < "${out}" | tr -d ' ')"
	got="$(shasum -a 256 "${out}" | awk '{print $1}')"
	if [ "${bytes}" != "${size}" ] || [ "${got}" != "${want}" ]; then
		echo "${route}: file has the wrong size or hash (${bytes} bytes)" >&2
		rm -f "${out}"
		exit 1
	fi
	echo "${route}: ok (${bytes} bytes, sha256 matches)"
}

fetch_file rom/md "${dir}/md.bin" 8388608 "${md_sha}"
fetch_file rom/mm "${dir}/mm.bin" 8388608 "${mm_sha}"
if [ "${sysex}" = true ]; then
	# Pins refer to the two owner-supplied backups in private R2. Only sizes and hashes live in Git.
	fetch_file sysex/md "${dir}/md.syx" 777212 0de5fb784cd5a34911bf484440f4e579efacd29cb11b2e9eab006ed9767dbe5b
	fetch_file sysex/mm "${dir}/mm.syx" 288472 bce02b55fc421fc77efd6849dddff1410b6beb7cc1019927f8d746acd07d8b8f
fi
{
	echo "GEARMULATOR_MD_FIRMWARE_BIN=${dir}/md.bin"
	echo "GEARMULATOR_MM_FIRMWARE_BIN=${dir}/mm.bin"
	if [ "${sysex}" = true ]; then
		echo "MD_SYX=${dir}/md.syx"
		echo "MM_SYX=${dir}/mm.syx"
	fi
} >> "${GITHUB_ENV}"
