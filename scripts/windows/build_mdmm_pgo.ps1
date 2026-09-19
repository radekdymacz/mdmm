[CmdletBinding()]
param(
    [string] $SourceDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string] $BuildDir = '',
    [string] $OutputDir = '',
    [string] $ProfileDir = '',
    [Parameter(Mandatory = $true)] [string] $MdFirmware,
    [Parameter(Mandatory = $true)] [string] $MmFirmware,
    [ValidateRange(1, 64)] [int] $Parallel = 4,
    [ValidateRange(20, 600)] [int] $TrainingSeconds = 20,
    [ValidateSet('Visual Studio 17 2022', 'Ninja Multi-Config')]
    [string] $Generator = 'Visual Studio 17 2022',
    [string] $CompilerLauncher = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)] [string] $FilePath,
        [Parameter(Mandatory = $true)] [string[]] $Arguments
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Native command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

function Find-ExactlyOne {
    param([string] $Root, [string] $Filter)
    $matches = @(Get-ChildItem -LiteralPath $Root -Recurse -File -Filter $Filter)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one $Filter below $Root, found $($matches.Count)."
    }
    return $matches[0].FullName
}

if ($env:OS -ne 'Windows_NT') { throw 'build_mdmm_pgo.ps1 requires Windows.' }
$SourceDir = (Resolve-Path -LiteralPath $SourceDir).Path
$MdFirmware = (Resolve-Path -LiteralPath $MdFirmware).Path
$MmFirmware = (Resolve-Path -LiteralPath $MmFirmware).Path
if (-not $BuildDir) { $BuildDir = Join-Path $SourceDir 'build\windows-mdmm-pgo' }
if (-not $OutputDir) { $OutputDir = Join-Path $SourceDir 'artifacts\windows-mdmm-pgo' }
if (-not $ProfileDir) { $ProfileDir = Join-Path $BuildDir 'profiles' }
$BuildDir = [IO.Path]::GetFullPath($BuildDir)
$OutputDir = [IO.Path]::GetFullPath($OutputDir)
$ProfileDir = [IO.Path]::GetFullPath($ProfileDir)

$buildScript = Join-Path $PSScriptRoot 'build_mdmm.ps1'
$common = @(
    '-SourceDir', $SourceDir,
    '-BuildDir', $BuildDir,
    '-OutputDir', $OutputDir,
    '-Configuration', 'Release',
    '-Parallel', "$Parallel",
    '-Generator', $Generator,
    '-PgoDirectory', $ProfileDir
)
if ($CompilerLauncher) { $common += @('-CompilerLauncher', $CompilerLauncher) }

New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
Get-ChildItem -LiteralPath $ProfileDir -File |
    Where-Object { $_.Extension -in @('.pgc', '.pgd') } |
    Remove-Item -Force

& $buildScript @common -PgoMode generate -BuildOnly
if ($LASTEXITCODE -ne 0) { throw 'Instrumented Windows build failed.' }

$productRoot = Join-Path $SourceDir 'bin\plugins\Release'
$vst3Root = Join-Path $productRoot 'VST3'
$pluginTester = Find-ExactlyOne -Root $BuildDir -Filter 'pluginTester.exe'
$training = @(
    @{ Name = 'MD'; Plugin = Join-Path $vst3Root 'Gearmulator MD.vst3'; Firmware = $MdFirmware },
    @{ Name = 'MM'; Plugin = Join-Path $vst3Root 'Gearmulator MM.vst3'; Firmware = $MmFirmware }
)

try {
    foreach ($item in $training) {
        $privateCopy = Join-Path $vst3Root ([IO.Path]::GetFileName($item.Firmware))
        Copy-Item -LiteralPath $item.Firmware -Destination $privateCopy -Force
        try {
            Push-Location $vst3Root
            Invoke-Native -FilePath $pluginTester -Arguments @(
                '-plugin', $item.Plugin,
                '-seconds', "$TrainingSeconds",
                '-blocksize', '128',
                '-samplerate', '48000'
            )
        } finally {
            Pop-Location
            Remove-Item -LiteralPath $privateCopy -Force -ErrorAction SilentlyContinue
        }
    }
} finally {
    Get-ChildItem -LiteralPath $vst3Root -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -match '^\.(bin|rom|nvram|syx)$' } |
        Remove-Item -Force
}

foreach ($target in @('mdJucePlugin_VST3', 'mmJucePlugin_VST3')) {
    $pgd = Join-Path $ProfileDir "$target.pgd"
    if (-not (Test-Path -LiteralPath $pgd)) { throw "Missing profile database: $pgd" }
}
$counts = @(Get-ChildItem -LiteralPath $ProfileDir -File -Filter '*.pgc')
if ($counts.Count -eq 0) { throw "Training produced no .pgc files in $ProfileDir" }

& $buildScript @common -PgoMode use
if ($LASTEXITCODE -ne 0) { throw 'Profile-use Windows build or validation failed.' }

Write-Host "WINDOWS_MDMM_PGO_OUTPUT=$OutputDir"
