# Installer helpers. Safe to dot-source without running installation commands.
function Initialize-InstallResults {
    $script:installResults = @()
    $script:failed = @()
}

function Add-InstallResult {
    param(
        [string]$Name,
        [ValidateSet('UpdatedOrCurrent', 'Current', 'Skipped', 'Failed', 'RebootRequired')]
        [string]$Status,
        [string]$Detail = ''
    )
    $script:installResults += [pscustomobject]@{ Name = $Name; Status = $Status; Detail = $Detail }
    if ($Status -eq 'Failed') { $script:failed += $Name }
    Write-Host "  ${Name}: $Status $Detail"
}

function Invoke-InstallCommand {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [int[]]$CurrentExitCodes = @(),
        [int[]]$RebootExitCodes = @()
    )
    # Native errors must be classified by exit code, including on PowerShell 7.3+.
    $PSNativeCommandUseErrorActionPreference = $false
    $ErrorActionPreference = 'Continue'
    try {
        $null = Get-Command $FilePath -ErrorAction Stop
        $global:LASTEXITCODE = 0
        & $FilePath @ArgumentList 2>&1 | Out-Host
        $code = $LASTEXITCODE
        if ($RebootExitCodes -contains $code) {
            Add-InstallResult $Name RebootRequired "(exit $code)"
            return $true
        }
        if ($CurrentExitCodes -contains $code) {
            Add-InstallResult $Name Current "(exit $code)"
            return $true
        }
        if ($code -eq 0) {
            Add-InstallResult $Name UpdatedOrCurrent
            return $true
        }
        Add-InstallResult $Name Failed "(exit $code; see command output above)"
    } catch {
        Add-InstallResult $Name Failed $_.Exception.Message
    }
    return $false
}

function Update-InstallPath {
    # Refresh persisted entries but keep process-only entries (including Git SSH).
    $toolBin = if ($env:UV_TOOL_BIN_DIR) { $env:UV_TOOL_BIN_DIR } else { Join-Path $env:USERPROFILE '.local\bin' }
    $entries = @(
        if (Test-Path $toolBin -PathType Container) { $toolBin }
        [Environment]::GetEnvironmentVariable('PATH', 'User') -split ';'
        [Environment]::GetEnvironmentVariable('PATH', 'Machine') -split ';'
        $env:PATH -split ';'
    )
    $seen = @{}
    $env:PATH = (@(foreach ($entry in $entries) {
        if ([string]::IsNullOrWhiteSpace($entry)) { continue }
        $entry = [Environment]::ExpandEnvironmentVariables($entry)
        $key = $entry.TrimEnd('\', '/')
        if (-not $seen.ContainsKey($key)) { $seen[$key] = $true; $entry }
    }) -join ';')
}

function Get-InstallMsys2Root {
    @('C:\msys64', 'C:\tools\msys64', "$env:LOCALAPPDATA\msys64") |
        Where-Object { Test-Path (Join-Path $_ 'usr\bin\pacman.exe') } |
        Select-Object -First 1
}

function Remove-Msys2BootstrapResource {
    param([string]$Content)
    # Repository YAML uses one four-space-indented block per resource.
    [regex]::Replace($Content, '(?ms)^    - resource:.*?(?=^    - resource:|\z)', {
        param($match)
        if ($match.Value -match '(?m)^\s+id:\s+MSYS2\.MSYS2\s') { return '' }
        return $match.Value
    })
}

function Update-InstallWingetPackages {
    param([string]$Msys2Root)
    if ($Msys2Root) {
        # The WinGet package is a bootstrap installer, not the MSYS2 updater.
        # Do not override an existing user pin. All pin types are respected by --all.
        $pinned = Invoke-InstallCommand -Name 'MSYS2 bootstrap pin' -FilePath winget -ArgumentList @(
            'pin', 'add', '--id', 'MSYS2.MSYS2', '--exact', '--blocking',
            '--accept-source-agreements', '--disable-interactivity'
        ) -CurrentExitCodes @(-1978335134, -1978335212) # Pin exists, or unregistered bootstrap
        if (-not $pinned) {
            Add-InstallResult 'WinGet upgrades' Skipped 'MSYS2 bootstrap could not be excluded safely'
            return
        }
    }
    # No --include-pinned or --force: retain user/version pins.
    $null = Invoke-InstallCommand -Name 'WinGet upgrades' -FilePath winget -ArgumentList @(
        'upgrade', '--all', '--include-unknown', '--accept-source-agreements',
        '--accept-package-agreements', '--disable-interactivity'
    ) -CurrentExitCodes @(-1978335189) -RebootExitCodes @(3010, 1641, -1978334967, -1978334965)
    Update-InstallPath
}

function Update-InstallMsys2Packages {
    param([string]$Root)
    if (-not $Root) {
        Add-InstallResult 'MSYS2 packages' Failed 'MSYS2 was not installed'
        return
    }
    $bash = Join-Path $Root 'usr\bin\bash.exe'
    # Separate shells are required after the core runtime update. Do not execute
    # an MSYS2 upgrade under the orchestrator's inherited MSYSTEM or HOME.
    $previousSystem = $env:MSYSTEM
    $previousHome = $env:HOME
    $env:MSYSTEM = 'MSYS'
    $env:HOME = $env:USERPROFILE -replace '\\', '/'
    try {
        $core = Invoke-InstallCommand -Name 'MSYS2 core update' -FilePath $bash -ArgumentList @(
            '--noprofile', '--norc', '-c', '/usr/bin/pacman -Syu --noconfirm'
        )
        if (-not $core) {
            Add-InstallResult 'MSYS2 remaining packages' Skipped 'core update failed; close MSYS2 terminals and rerun'
            return
        }
        $null = Invoke-InstallCommand -Name 'MSYS2 remaining packages' -FilePath $bash -ArgumentList @(
            '--noprofile', '--norc', '-c', '/usr/bin/pacman -Syu --noconfirm && /usr/bin/pacman -S --needed --noconfirm zsh'
        )
    } finally {
        $env:MSYSTEM = $previousSystem
        $env:HOME = $previousHome
    }
}

function Update-InstallUvTools {
    $securityArgs = @('--exclude-newer', '3 days', '--index-strategy', 'first-index', '--no-sources', '--no-build')
    foreach ($package in @('ruff', 'lizard==1.21.3', 'detect-secrets')) {
        # --upgrade resolves updates in the managed tool environment, even when
        # another executable with the same name is already on PATH.
        $null = Invoke-InstallCommand -Name "uv tool $package" -FilePath uv -ArgumentList (
            @('tool', 'install', '--upgrade') + $securityArgs + @($package)
        )
    }
    Update-InstallPath
}

function Get-InstallExitCode {
    if ($script:failed.Count -gt 0) { return 1 }
    if ($script:installResults.Status -contains 'RebootRequired') { return 3010 }
    return 0
}

function Write-InstallSummary {
    Write-Host "`n=== Installation summary ===" -ForegroundColor Cyan
    Write-Host 'UpdatedOrCurrent means the command succeeded; package-level changes are in the log.'
    foreach ($result in $script:installResults) {
        Write-Host "  [$($result.Status)] $($result.Name) $($result.Detail)"
    }
    # Include failures recorded by older configuration helpers as well.
    foreach ($name in ($script:failed | Select-Object -Unique)) {
        if ($script:installResults.Name -notcontains $name) { Write-Host "  [Failed] $name" }
    }
    $code = Get-InstallExitCode
    if ($code -eq 1) { Write-Host 'Installation finished with failures. See diagnostics above.' -ForegroundColor Red }
    elseif ($code -eq 3010) { Write-Host 'Installation finished. Reboot required, then rerun.' -ForegroundColor Yellow }
    else { Write-Host 'Installation finished successfully.' -ForegroundColor Green }
}
