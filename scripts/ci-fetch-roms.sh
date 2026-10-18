#!/bin/bash
# CI only (.github/workflows/mdmm-firmware.yml): fetches the two firmware images from the ROM Worker (ci/rom-worker)
# with this run's GitHub OIDC token, checks their SHA-256 against the constants in scripts/macos/build_mdmm.sh, and
# exports GEARMULATOR_MD_FIRMWARE_BIN / GEARMULATOR_MM_FIRMWARE_BIN through GITHUB_ENV.
#   scripts/ci-fetch-roms.sh <empty folder under RUNNER_TEMP>
# Needs: MDMM_ROM_URL (environment variable of the `rom` environment), ACTIONS_ID_TOKEN_REQUEST_URL/_TOKEN (id-token: write).
# The token and the images are never printed. No `set -x`.
set -euo pipefail
dir="${1:?usage: ci-fetch-roms.sh <folder>}"
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

for pair in "md:${md_sha}" "mm:${mm_sha}"; do
	model="${pair%%:*}"; want="${pair#*:}"
	out="${dir}/${model}.bin"
	# the token goes to curl on stdin as a config file, not on its command line
	printf 'header = "Authorization: Bearer %s"\n' "${token}" |
		curl -fsS --max-time 300 --retry 2 -K - -o "${out}" "${MDMM_ROM_URL%/}/rom/${model}" || { echo "${model}: the ROM Worker refused or failed" >&2; rm -f "${out}"; exit 1; }
	bytes="$(wc -c < "${out}" | tr -d ' ')"
	got="$(shasum -a 256 "${out}" | awk '{print $1}')"
	if [ "${bytes}" != "8388608" ] || [ "${got}" != "${want}" ]; then
		echo "${model}: firmware image has the wrong size or hash (${bytes} bytes)" >&2
		rm -f "${out}"
		exit 1
	fi
	echo "${model}: ok (${bytes} bytes, sha256 matches)"
done
{
	echo "GEARMULATOR_MD_FIRMWARE_BIN=${dir}/md.bin"
	echo "GEARMULATOR_MM_FIRMWARE_BIN=${dir}/mm.bin"
} >> "${GITHUB_ENV}"
