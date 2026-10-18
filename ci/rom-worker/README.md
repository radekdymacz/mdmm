# mdmm-rom: the ROM Worker

Hands the two Elektron firmware images to the firmware workflow (`.github/workflows/mdmm-firmware.yml`) and to nobody
else. The images live in a private R2 bucket (`mdmm-ci-roms`: `md.bin`, `mm.bin`). There is no long-lived secret: the
caller proves who it is with the run's GitHub OIDC token.

`GET /rom/md` or `GET /rom/mm` with `Authorization: Bearer <OIDC token, audience mdmm-rom>`. Anything wrong: 403, empty
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

## One-time setup (Radek)

Steps 1, 2 and the environment of step 4 are done (2026-10-18: bucket `mdmm-ci-roms`, both objects verified by sha256, environment `rom` limited to `main` and `release/*`). Open: deploy (3) and the variable `MDMM_ROM_URL`. Kept as documentation:

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
