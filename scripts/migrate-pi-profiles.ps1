[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$piRoot = Join-Path $repositoryRoot 'pi'
$profilesRoot = Join-Path $piRoot 'profiles'
$defaultProfile = Join-Path $profilesRoot 'default'
$legacyProfile = Join-Path $profilesRoot 'legacy'
$externalProfilesRoot = Join-Path $env:USERPROFILE '.pi\profiles'
$agentPath = Join-Path $env:USERPROFILE '.pi\agent'

function Remove-DirectoryLink {
  param([Parameter(Mandatory)][string]$Path)

  $item = Get-Item -LiteralPath $Path -Force
  if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Refusing to remove non-link directory: $Path"
  }

  & cmd.exe /d /c rmdir $Path
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to remove directory link: $Path"
  }
}

if (-not (Test-Path -LiteralPath $piRoot -PathType Container)) {
  throw "Pi source directory not found: $piRoot"
}

$activePi = @(Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $PID -and
  $_.CommandLine -and
  $_.CommandLine -match '(?i)(pi-coding-agent|[\\/]pi(?:\.cmd|\.js)?(?:\s|$))'
})
if ($activePi.Count -gt 0) {
  $processList = ($activePi | ForEach-Object { "$($_.ProcessId): $($_.Name)" }) -join ', '
  throw "Pi processes are still running. Close them before migration. Found: $processList"
}

New-Item -ItemType Directory -Path $defaultProfile -Force | Out-Null
New-Item -ItemType Directory -Path $legacyProfile -Force | Out-Null

$awaitingMigration = Join-Path $legacyProfile '.awaiting-migration'
if (Test-Path -LiteralPath $awaitingMigration) {
  Remove-Item -LiteralPath $awaitingMigration
}

$alreadyMigrated = Test-Path -LiteralPath (Join-Path $legacyProfile 'settings.json')
$excludedNames = @('.gitignore', 'profiles')
if ($alreadyMigrated) {
  $excludedNames += 'README.md'
}
$sourceItems = @(Get-ChildItem -LiteralPath $piRoot -Force | Where-Object {
  $_.Name -notin $excludedNames
})

$conflicts = @($sourceItems | Where-Object {
  Test-Path -LiteralPath (Join-Path $legacyProfile $_.Name)
})
if ($conflicts.Count -gt 0) {
  throw "Legacy profile contains conflicting entries: $($conflicts.Name -join ', ')"
}

$expectedNames = @($sourceItems.Name)
foreach ($item in $sourceItems) {
  Move-Item -LiteralPath $item.FullName -Destination $legacyProfile
}

$missingNames = @($expectedNames | Where-Object {
  -not (Test-Path -LiteralPath (Join-Path $legacyProfile $_))
})
if ($missingNames.Count -gt 0) {
  throw "Migration did not preserve these entries: $($missingNames -join ', ')"
}

$defaultMarker = Join-Path $defaultProfile '.gitkeep'
if (-not (Test-Path -LiteralPath $defaultMarker)) {
  New-Item -ItemType File -Path $defaultMarker | Out-Null
}

$rootReadme = @'
# Pi Profiles

`pp` launches Pi with an isolated profile directory.

- `pp` uses `pi/profiles/default/`.
- `pp -p legacy` uses `pi/profiles/legacy/`, which contains the previous customized Pi setup and its local runtime state.
- Other named profiles use `~/.pi/profiles/<name>/`.

The compatibility path `~/.pi/agent` points to the legacy profile so direct `pi` invocations retain the previous behavior.
'@
Set-Content -LiteralPath (Join-Path $piRoot 'README.md') -Value $rootReadme -Encoding utf8NoBOM

$externalDefault = Join-Path $externalProfilesRoot 'default'
if (Test-Path -LiteralPath $externalDefault) {
  $item = Get-Item -LiteralPath $externalDefault -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Remove-DirectoryLink -Path $externalDefault
  } elseif (@(Get-ChildItem -LiteralPath $externalDefault -Force).Count -eq 0) {
    Remove-Item -LiteralPath $externalDefault
  } else {
    throw "External default profile is not empty; move it manually before continuing: $externalDefault"
  }
}

$externalLegacy = Join-Path $externalProfilesRoot 'legacy'
if (Test-Path -LiteralPath $externalLegacy) {
  Remove-DirectoryLink -Path $externalLegacy
}

if (Test-Path -LiteralPath $agentPath) {
  $agentItem = Get-Item -LiteralPath $agentPath -Force
  if (-not ($agentItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Refusing to replace non-link Pi agent directory: $agentPath"
  }
  Remove-DirectoryLink -Path $agentPath
}

New-Item -ItemType Junction -Path $agentPath -Target $legacyProfile | Out-Null

$resolvedAgent = (Get-Item -LiteralPath $agentPath -Force).Target
if ([IO.Path]::GetFullPath($resolvedAgent) -ne [IO.Path]::GetFullPath($legacyProfile)) {
  throw "Pi agent compatibility junction has the wrong target: $resolvedAgent"
}

Write-Host "Default profile: $defaultProfile"
Write-Host "Legacy profile:  $legacyProfile"
Write-Host "Pi compatibility: $agentPath -> $legacyProfile"
Write-Host 'Migration complete. Run pp for the clean default profile or pp -p legacy for the previous setup.'
