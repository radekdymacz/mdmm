# Windows and Linux x64 PGO builds

Profile-guided optimization (PGO) uses a training run to optimize compiler
output. It does not change the instrument features. Pin the parent revision,
submodules, compiler, build definitions, training inputs and output hashes.
Profiles are private build inputs and must not be shipped with the products.

## Windows: MSVC

Use the x64 Visual Studio 2022 C++ build tools, Windows SDK, CMake, and Git.
Choose a short build path to accommodate Windows tool path limits. From
PowerShell in the source checkout:

```powershell
./scripts/windows/build_mdmm_pgo.ps1 `
  -BuildDir C:\build\mdmm-pgo `
  -OutputDir C:\artifacts\mdmm-pgo `
  -MdFirmware C:\private\md.bin `
  -MmFirmware C:\private\mm.bin `
  -Parallel 4
```

The driver builds instrumented VST3 modules, runs both products with the
supplied firmware, collects MSVC execution counts and relinks with profile
use. Each model's database is also used by its standalone link. MSVC checks
profile compatibility. Review the link reports to confirm that useful
functions were optimized. Training needs the matching x64 `pgort140.dll`;
the driver adds it to PATH temporarily. Final profile-use modules must not
depend on that DLL.

The ordinary control build uses `scripts/windows/build_mdmm.ps1` with
`-PgoMode none`. Keep control and PGO products separately: Windows developer
builds share the source checkout's `bin/plugins` destination. Preserve and
hash each variant before building another configuration. `-WithTests` runs
the platform regression selection; firmware tests need their documented
environment variables. Asset-free CI smoke profiles only prove that the
instrumentation/link pipeline works; they do not establish performance.

## Linux: GCC

Configure an MD/MM-only Release build with VST3 and standalone enabled. GCC
instrumentation is scoped to `mdLib` and `68kEmu`, shared by both instruments
and product formats. These builds do not enable LTO through this option.

```sh
cmake -S . -B /path/to/build [your normal MD/MM build options] \
  -DCMAKE_BUILD_TYPE=Release \
  -DGEARMULATOR_MDMM_GNU_PGO_MODE=generate \
  -DGEARMULATOR_MDMM_GNU_PGO_DIRECTORY=/path/to/private/profiles
cmake --build /path/to/build --parallel 4 --target \
  mdJucePlugin_VST3 mmJucePlugin_VST3 \
  mdJucePlugin_Standalone mmJucePlugin_Standalone
```

Start with an empty dedicated profile directory. Exercise both instruments
with representative audio and MIDI, allow first-boot initialization to finish,
and quit cleanly so GCC writes `.gcda` execution counts. Then reconfigure
**the same build tree** with `GEARMULATOR_MDMM_GNU_PGO_MODE=use` and rebuild
the same targets. GCC's profile paths depend on the object/build paths.
Do not reuse profiles after source, compiler, ABI or relevant flag changes.
Force a rebuild when replacing profiles at the same path; unlike the Apple
pipeline, this path does not hash profile contents into compile definitions.
Review missing-profile warnings and reject mismatched-profile errors.

## Validation and distribution

Compare matched ordinary and PGO builds using the same firmware, state,
sample rate, block size, compiler and machine. Run repeated paired trials
with balanced order, discard boot/warm-up, and verify finite, non-silent
audio. Benchmark VST3s by exact path and hash so an installed copy cannot be
mistaken for the candidate. Keep CPU timing separate from scheduling delays.

Check the final archive's binaries against the measured hashes. Exercise
plugin state, routing and editors, and standalone startup/shutdown. Exclude
firmware, runtime preferences, audio captures and compiler profiles from the
archive. A successful profile-use link is not a compatibility test: Linux
minimum glibc and shared-library requirements must be inspected and tested
on the intended baseline. See [Linux installation](linux-installation.md).
