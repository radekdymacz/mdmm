# Security review: MD + MM Editors (read-only, 2026-10-15)

Overall: the attack surface is small and the design is careful. No critical or high findings I can back. No secrets in tree or history (patterns: Discord webhook/bot token, ghp_/github_pat_, AKIA, PEM private keys, xox, sk-; only a doc line mentioning the p8 secret name).

## Findings

### M1 (medium) Release integrity: unsigned installers, no checksums, update key still a placeholder
- source/elektron/md/mdmmUpdate/updateKey.h:14: `g_updatePublicKeyHex = "PLACEHOLDER-run-scripts/release/update_keygen.py"`. With that, buildKey() is empty, offerFor() (updateCore.cpp, offerFor) never returns Install, the button opens https://mdmm.dev/get/. So in-app install is safely OFF today. Good, but also means the only integrity for users is "HTTPS to GitHub/mdmm.dev".
- scripts/macos/pkg-resources/readme.html: ".pkg is not signed yet", users told to run `xattr -dr com.apple.quarantine` or "Open Anyway". Trains users to bypass Gatekeeper; any swapped asset is indistinguishable.
- No SHA256SUMS / attestations published: grep for sha256sum/shasum/attest in .github/workflows and scripts/release finds nothing (latest.json carries sha256 only for the updater).
- Exploit: compromise of the GitHub release (stolen maintainer token) or CF token serving mdmm.dev/get/ replaces a .pkg; users have no way to verify.
- Fix for 1.0: (a) run scripts/release/update_keygen.py, commit public key, set MDMM_UPDATE_SIGNING_KEY (installs then verify ed25519 over name+version+sha256, updateCore.cpp verifyDownload; this part is well built: size cap 1 GiB, https-only curl `--proto =https --proto-redir =https`, `-q`, name and URL pinned to this repo's release path in parseManifest, tag==version check, canonical base64 sig). (b) publish SHA256SUMS.txt (and ideally `actions/attest-build-provenance`) on each release; (c) Apple Developer ID signing+notarization (workflow already supports it, SIGNING.md).

### M2 (medium, only once key is set; Linux/Windows) Predictable shared temp dir for staged update and swap script
- mdUpdater.cpp:82-86 workFolder() = tempDirectory/"<product> update" (fixed name; /tmp on Linux). Verified file, unpacked `staged/` tree and the generated `swap.sh` / `swap.ps1` (mdUpdater.cpp:560-585) live there. The swap script later runs as the user, copying staged files over the installed app (and `nohup` restarts it).
- Exploit: on a multi-user Linux box another local user pre-creates `/tmp/Machinedrum Editor update` mode 777 (or races between verify at :350 and launch at :585). After the signature check passes they replace `staged/...` or `swap.sh`, giving code execution as the victim. Windows: %TEMP% is per-user, so mainly Linux (platform marked "not tested"). macOS: the .pkg sits in per-user $TMPDIR; a same-user attacker is already the user.
- Fix: use a private dir (mkdtemp, 0700, owned-by-us check) under XDG_RUNTIME_DIR or ~/.cache; re-hash the staged executable immediately before the swap or do the swap from verified-in-place bytes; refuse if the dir is not owned by the current uid / is a symlink.

### M3 (medium) GitHub Actions use mutable tags, and wrangler is unpinned while holding a Cloudflare token
- Third-party actions pinned by tag, not SHA: mozilla-actions/sccache-action@v0.0.11 (mdmm-core.yml:95, windows:68,142), ilammy/msvc-dev-cmd@v1 (windows:63,137); first-party actions/*@v4 throughout.
- mdmm-site-release.yml:~151 `npx --yes wrangler@4 deploy` with CLOUDFLARE_API_TOKEN + ACCOUNT_ID in env: floats to whatever 4.x is latest, executes npm install-time code with the deploy token. The same job also holds contents:write and (earlier step) MDMM_UPDATE_SIGNING_KEY.
- Exploit: compromised action/npm release exfiltrates CF token (can rewrite latest.json / site) or, in release workflow, the macOS signing p12/notary key (mdmm-editors-release.yml:149-153,190-192,255).
- Fix: pin third-party actions to full commit SHAs (dependabot for updates); pin wrangler to an exact version via lockfile (`npm ci`) in site/; scope the Cloudflare token to Workers deploy for that one script only; give the signing step its own job so deploy deps never run with the signing key.

### L1 (low) Workflow-level permissions broader than needed
- mdmm-site-release.yml:27-29 `contents: write` + `pull-requests: write` for the whole workflow; it pushes latest.json straight to `main` (needs branch protection to not be bypassable; it does `git push origin HEAD:main`, falls back to a PR). Anyone able to publish a release (or dispatch with `tag`) triggers a main commit and a signing run on assets "as published" (design choice; hand-uploaded assets are signed too). Fine if only the owner can publish; document that publishing == signing. Other workflows correctly default to `contents: read`. No pull_request_target, no `${{ github.event.* }}` in run: bodies (TAG goes through env and is regex-checked `^mdmm-v[0-9.]+$` at site-release:46); `matrix.mode`/`ref_name` uses are not attacker-controlled free text. All runners GitHub-hosted. Good.

### L2 (low) Installer preinstall removes bundles as root from user-controlled locations
- scripts/macos/pkg-resources/remove-old-bundles:100-128: `/bin/rm -rf -- "${bundle}"` as root (preinstall) for bundles found under `$HOME`, console user, `$SUDO_USER`, `$USER` homes. It checks the final path is not a symlink and the bundle "is ours" by reading CFBundleIdentifier from the bundle itself (attacker-controlled) or the pkg receipt; parent directories (e.g. ~/Library/Audio/Plug-Ins/VST3) are not checked for symlinks, and there is a check/use gap.
- Exploit: unprivileged local malware (already running as that user) plants a fake bundle with our identifier and swaps a parent dir for a symlink so root deletes a directory whose last component equals `Machinedrum Editor.vst3/.component/.app`. Impact is bounded (the name is fixed), so low.
- Fix: for per-home roots, drop privileges (`su -l user -c`) or resolve with realpath and require the result to stay under the home; skip when any path component is a symlink. Scripts otherwise touch only these bundle paths and `killall AudioComponentRegistrar` (au-postinstall); no network, no eval.

### L3 (low) Updater download robustness
- mdUpdater.cpp:30-39 `--max-filesize` is advisory (not enforced for chunked responses); only `--max-time 1800` bounds a hostile/hijacked server filling the temp disk before the size check (WrongSize at updateCore.cpp verifyDownload). Add a poll of file.getSize() > asset.size inside the tick lambda (mdUpdater.cpp:327-338) to kill curl.
- Replay/freeze: signature covers name+version+sha256 only (updateCore.cpp updateMessage). A hijacked feed cannot install anything unsigned, but can withhold updates or serve an older still-newer-than-installed signed release. Acceptable; add a signed `issued` date if freshness matters.
- Windows zip pre-check (mdUpdater.cpp:123-130) only runs after signature success, ok; Linux uses `tar -xzf` without `--no-same-owner/--no-absolute-names`; only reachable post-signature.

### L4 (low) Memory/DoS from large user files (local, user-chosen files)
- elektronData/mdSamples.cpp:467-486 readFrames allocates channels x frames floats from file size (file loaded whole; no cap on WAV/AIFF size, up to 16 channels). A multi-GB WAV causes huge allocation. mdRomInstall.cpp:61 caps .bin at 64 MiB (good) but .zip path uses `readIntoMemoryBlock` on an entry whose declared size == 8 MiB only (a lying header is the JUCE stream's responsibility; not verified).
- mmDump.cpp:35-47 RLE decode expands each 2 bytes to up to 127 (63x) with no output cap; a large .syx can inflate memory. Syx are split per message (syxImport.cpp splitSpans) but the file size itself is not capped in mdDeskSession.cpp:259 (loadFileAsData). Fix: cap .syx at a few MiB and WAV at e.g. 256 MiB; cap RLE output at the known raw size per kind (mmRawSize) and stop early.

### L5 (low) Page-to-native bridge: well contained, minor hardening notes
- Page is a local file in tempDirectory (mdWebPageHost.cpp:404, random 64-bit name, content generated from embedded resources; fonts/scripts inlined). No remote URL is ever loaded (grep of skins for http(s) finds only licence text); navigation callback cancels other file: URLs (mdWebPageHost.cpp:295-301). Native commands go through deskHost::commands() table with `Table::check` validation; the page cannot name a path: file choosers are native dialogs, drops are held by number (mdDroppedFiles.h). The only launches are fixed URLs (mdmm.dev/get, MS WebView2 link) and the user's own pkg/folder. innerHTML uses escape helpers (esc) for file/kit names.
- Hardening: (1) onNavigation (mdWebView2Page.cpp:218-224 and the mac/linux equivalents) cancels only `file:`; also cancel/open-externally any http(s) navigation and window.open so an injected link can never load remote content with the bridge scheme in scope. (2) mdPageEditor.cpp:182-222 uses `_message.find("x")->asNumber()` after Table::check; confirm check guarantees presence/type of every field (null deref otherwise, page-triggered crash only). (3) Pieces::add (mdPageBridge.h) accepts any `count` and an unbounded map of pieces; page-controlled memory growth only. (4) On Linux the page and `.recv-N.js` files sit in /tmp (mdWebPageHost.cpp:404): names are random, but create with O_EXCL/0600 so another user cannot read or pre-place them.

### L6 (info/low) Local files
- ROMs, config and logs: ~/Documents/Gearmulator Preview/<product>/ (roms/, config/*.xml), app settings in ~/Library/Application Support/<Machine> Editor.settings; user-owned default umask. Diagnostics logging is compiled out of release builds (MDMM_DIAGNOSTICS option OFF by default, mdmmPlugins.cmake:127); verify the release scripts do not pass -Dgearmulator_MDMM_DIAGNOSTICS=ON (diagnostics build reads GEARMULATOR_MDMM_SYX_FILE/EXPORT env and writes fixed-name /tmp logs, mdEditorPages.cpp:42).
- Discord bot token lives outside the repo (~/.config/mdmm/discord-bot-token); release webhook is a GitHub secret; the Discord post uses `allowed_mentions: {parse: []}` and JSON built in Python (no shell injection). Good.

## Checked and found sound (no finding)
- SysEx parsing: fixed-size dumps checked for exact length + framing + 7-bit cleanliness + checksum + length field before decoding (syxImport.cpp frameStatus, mdKit.cpp:45, mdGlobal.cpp:32, mdPattern.cpp:67-73, mdSong.cpp:36-48 size modulo check); dumpIo::Reader::u8 is unchecked but every caller validates size first. MM path unpackMmDump verifies header, trailer and raw size (mmDump.cpp, syxImport.cpp decodeMm).
- WAV/AIFF chunk walkers (mdSamples.cpp:488-612) clamp chunk size to the buffer (`avail`), check AIFF SSND offset, reject unsupported bits/channels; no OOB found.
- DAW state restore: baseLib BinaryStream read(vector/string) uses requireReadable/requireReadableElements before resize (binarystream.h:382-407); MMEM loop capped at 100000 (mdPluginProcessor.cpp:292).
- Updater manifest parser: 64 KiB cap, schema/tag/name/URL pinned, size range, lowercase hex sha, canonical base64 sig; swap script quoting for sh and PowerShell covers `'` and typographic quotes.
- site/public/_headers: strict CSP (default-src 'none'), nosniff, COOP.

## Priority for 1.0
1. M1 (set update key, publish checksums, sign/notarize).  2. M3 (pin actions/wrangler).  3. M2 (private updater dir) before enabling installs on Linux/Windows.  4. L2, L3, L4 as time allows.
