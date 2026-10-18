# mdmm-rom: the ROM Worker

Hands the two Elektron firmware images and the owner's two SysEx test backups to the firmware workflow
(`.github/workflows/mdmm-firmware.yml`) and to nobody else. The files live in a private R2 bucket (`mdmm-ci-roms`):
`md.bin`, `mm.bin`, `sysex/md.syx`, `sysex/mm.syx`. There is no long-lived secret: the
caller proves who it is with the run's GitHub OIDC token.

`GET /rom/md`, `/rom/mm`, `/sysex/md` or `/sysex/mm` with `Authorization: Bearer <OIDC token, audience mdmm-rom>`. Anything wrong: 403, empty
body. The token is checked against GitHub's JWKS (RS256 only), then:

| Claim | Must be |
|---|---|
| `iss`, `aud` | `https://token.actions.githubusercontent.com`, `mdmm-rom` |
| `exp`, `nbf`, `iat` | valid now (60 s skew) |
| `repository`, `repository_id` | `radekdymacz/mdmm`, `1390624298` |
| `ref` | `refs/heads/main` or `refs/heads/release/*` |
| `event_name` | `push`, `workflow_dispatch`, `schedule` (never `pull_request*`) |
| `environment` | `rom` |
| `job_workflow_ref` | `radekdymacz/mdmm/.github/workflows/mdmm-firmware.yml@<the same ref>` |
| `runner_environment` | `github-hosted` |

The log has the decision and the repository, ref and event, never the token.

## SysEx backups

The two private backups were uploaded on 2026-10-18 and downloaded again to verify their hashes. CI fetches them with
`scripts/ci-fetch-roms.sh "${RUNNER_TEMP}/roms" --sysex`, which pins their sizes and SHA-256 and exports `MD_SYX` / `MM_SYX`.
The firmware ctest jobs use these full backups for import-and-pick regressions. The E2E journeys keep their small,
programmed corpus because those scenarios expect its particular contents. Cleanup deletes private backups alongside
the ROMs before reports are uploaded. Never add either backup to Git, a cache or an artifact.

To replace a backup, upload the owner's selected file to `mdmm-ci-roms/sysex/md.syx` (or `mm.syx`) using
`npx wrangler r2 object put <bucket/key> --remote --file <local-file>`, then update its size/hash in `ci-fetch-roms.sh`.
Only the four paths listed above are downloadable; there is no listing or upload endpoint.

These SysEx files are not the 1 MiB `mm-factory-live3-be.bin` snapshot. That separate factory-memory fixture is still
missing, so sharing the backups does not yet enable `mdSysexLifecycleTest`.

## One-time setup (Radek)

Setup is complete (2026-10-18): bucket `mdmm-ci-roms`, hashes verified, Worker deployed at
`https://mdmm-rom.nativekloud.workers.dev`, environment `rom` limited to `main` and `release/*`, and `MDMM_ROM_URL` set.
Kept as documentation:

1. Create the bucket:
   ```sh
   CLOUDFLARE_ACCOUNT_ID=331224f43e4f448483cad2f1185ea965 npx wrangler r2 bucket create mdmm-ci-roms
   ```
2. Upload the ROMs (each on its own):
   ```sh
   CLOUDFLARE_ACCOUNT_ID=331224f43e4f448483cad2f1185ea965 npx wrangler r2 object put mdmm-ci-roms/md.bin --remote --file /Users/radek/mdmm-roms/elektron_sps1-1uw_os1.63.bin
   ```
   ```sh
   CLOUDFLARE_ACCOUNT_ID=331224f43e4f448483cad2f1185ea965 npx wrangler r2 object put mdmm-ci-roms/mm.bin --remote --file /Users/radek/mdmm-roms/elektron_sfx6-60_os1.32b.bin
   ```
3. Deploy the Worker (from `ci/rom-worker`):
   ```sh
   npm ci
   ```
   ```sh
   CLOUDFLARE_ACCOUNT_ID=331224f43e4f448483cad2f1185ea965 npx wrangler deploy
   ```
   Note the `https://mdmm-rom.<subdomain>.workers.dev` URL it prints.
4. GitHub, repository `radekdymacz/mdmm`, Settings, Environments, New environment `rom`:
   - Deployment branches and tags: Selected branches and tags, add `main` and `release/*`.
   - Environment variable (not a secret) `MDMM_ROM_URL` = the Worker URL from step 3.
5. Run the workflow once by hand: `gh workflow run mdmm-firmware.yml -R radekdymacz/mdmm --ref main`.

## Develop

```sh
npm ci
npm test
npm run typecheck
npm run dry-run
```

Revoke or rotate: see `doc/release/CI.md`, "Firmware tests on CI".

## Known limit: who can create a `release/*` branch

A run on a `release/*` branch uses that branch's copy of the workflow and scripts, so whoever can push such a branch can
make a run that copies the ROMs out. Keep creation of `release/**` (and writes to `main`) limited to the owner: a
GitHub ruleset on `release/**` (restrict creations, block force pushes, require a pull request) and branch protection
on `main`. While Radek is the only writer this is moot.
