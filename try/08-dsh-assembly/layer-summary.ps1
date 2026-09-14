# Summarize the patch-layer composition of a dsh profile.
#
# Runs `dsh <profile> --dump-default-config` and `dsh <profile> --dump-config` through the
# repository's pnpm launcher (which runs `node --import tsx/esm apps/cli/src/bin.ts`),
# writes both dumps next to this script, then prints:
#   1. the profile's declared bundle layers (from $DSH_HOME/profiles/<name>/package.json)
#   2. plugins per layer, in composition order (the `# == <source>` headers in the dump)
#   3. the exact line diff between the two dumps (bundle layers only vs + user layers)
#
# Usage, from anywhere:
#   powershell -ExecutionPolicy Bypass -File .\layer-summary.ps1
#   powershell -ExecutionPolicy Bypass -File .\layer-summary.ps1 -Profile web -Patch .\extra.yml
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less scripts as ANSI, which
# corrupts non-ASCII text and can break parsing.
param(
  [string]$Profile = 'web',
  [string]$Patch = '',
  [string]$RepoRoot = ''
)

# 'Continue', not 'Stop': under Windows PowerShell 5.1 a native command writing to stderr
# becomes a terminating NativeCommandError when ErrorActionPreference is 'Stop', and
# `2>$null` does not prevent it. pnpm echoes the command it runs onto stderr, so 'Stop'
# would abort before the dumps are written. Real failures are checked explicitly below.
$ErrorActionPreference = 'Continue'

if (-not $RepoRoot) {
  $candidate = Join-Path $PSScriptRoot '..\..\source\deepseek-harness\deepseek-harness'
  if (Test-Path $candidate) { $RepoRoot = (Resolve-Path $candidate).Path }
}
if (-not $RepoRoot -or -not (Test-Path (Join-Path $RepoRoot 'apps'))) {
  throw 'Repo root not found. Pass -RepoRoot <path to deepseek-harness>.'
}

# PATH's first node may be a dangling nvm4w shim, so prefer the real toolchain.
$pnpm = 'D:\nvm\v22.19.0\pnpm.cmd'
if (-not (Test-Path $pnpm)) {
  $found = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($found) { $pnpm = $found.Source } else { throw 'pnpm.cmd not found.' }
}

Set-Location $RepoRoot

Write-Host "repo    : $RepoRoot"
Write-Host "pnpm    : $pnpm"
Write-Host "profile : $Profile"

$profileDir = Join-Path $env:DSH_HOME "profiles\$Profile"
if (Test-Path (Join-Path $profileDir 'package.json')) {
  $pkg = Get-Content (Join-Path $profileDir 'package.json') -Raw | ConvertFrom-Json
  Write-Host "bundles : (from $profileDir\package.json)"
  foreach ($b in $pkg.dsh.profile.bundles) { Write-Host "          - $b" }
} else {
  Write-Host "bundles : <profile dir not found: $profileDir>"
}
Write-Host ''

$defaultArgs = @('dsh', $Profile, '--dump-default-config')
$fullArgs = @('dsh', $Profile)
if ($Patch) { $fullArgs += @('--patch', (Resolve-Path $Patch).Path) }
$fullArgs += '--dump-config'

$defaultFile = Join-Path $PSScriptRoot "dump-$Profile-default.txt"
$fullFile = Join-Path $PSScriptRoot "dump-$Profile.txt"

# 2>$null drops pnpm's own stderr echo of the command it ran.
$default = & $pnpm @defaultArgs 2>$null
$default | Set-Content -Encoding UTF8 $defaultFile
$full = & $pnpm @fullArgs 2>$null
$full | Set-Content -Encoding UTF8 $fullFile

Write-Host "wrote   : $defaultFile ($($default.Count) lines)"
Write-Host "wrote   : $fullFile ($($full.Count) lines)"
Write-Host ''

function Show-LayerTable {
  param([string[]]$Lines, [string]$Title)
  Write-Host $Title
  $order = New-Object System.Collections.ArrayList
  $counts = @{}
  $layer = '(before any layer header)'
  foreach ($line in $Lines) {
    if ($line -match '^# == (.+)$') {
      $layer = $Matches[1]
    } elseif ($line -match '^- id: ') {
      if (-not $counts.ContainsKey($layer)) {
        [void]$order.Add($layer)
        $counts[$layer] = 0
      }
      $counts[$layer] = $counts[$layer] + 1
    }
  }
  $total = 0
  foreach ($name in $order) {
    Write-Host ("  {0,4}  {1}" -f $counts[$name], $name)
    $total = $total + $counts[$name]
  }
  Write-Host ("  ----  total {0} plugin rows" -f $total)
  Write-Host ''
}

Show-LayerTable -Lines $default -Title 'plugin rows per layer -- bundle layers only (--dump-default-config):'
Show-LayerTable -Lines $full -Title 'plugin rows per layer -- full composition (--dump-config):'

Write-Host 'line diff (bundle layers only  ->  full composition):'
$diff = Compare-Object $default $full
if ($diff) {
  foreach ($d in $diff) { Write-Host ("  {0} {1}" -f $d.SideIndicator, $d.InputObject) }
} else {
  Write-Host '  (identical)'
}
Write-Host ''
Write-Host 'Legend: "=>" exists only in the full composition, "<=" only in the bundle-only dump.'
Write-Host 'Check whether a profile patch layer REPLACED a row config instead of merging into it.'
