#Requires -Version 5.1
<#
.SYNOPSIS
    Windows dotfiles installer using dotbot (self-elevating)
.DESCRIPTION
    Installs dotfiles by creating symlinks via dotbot.
    Installs packages on first run or when packages list changes.
    Automatically elevates to Administrator if needed.

.PARAMETER SkipPackages
    Skip package installation even on first run

.PARAMETER ForcePackages
    Force package installation even if lock file exists

.PARAMETER Work
    Include work-related packages (AWS, Helm, Terraform, etc.)

.PARAMETER ITAdmin
    Include IT Admin modules (Graph, ExchangeOnline, Az, etc.)

.PARAMETER ListPackages
    Just list packages without installing
#>

param(
    [switch]$SkipPackages,
    [switch]$ForcePackages,
    [switch]$Work,
    [switch]$ITAdmin,
    [switch]$ListPackages
)

# ============================================================================
# PACKAGE DEFINITIONS
# ============================================================================

$corePackages = @(
    @{ Id = 'Git.Git'; Name = 'Git' },
    @{ Id = 'Microsoft.PowerShell'; Name = 'PowerShell 7' },
    @{ Id = 'Microsoft.WindowsTerminal'; Name = 'Windows Terminal' },
    @{ Id = 'Microsoft.DotNet.SDK.8'; Name = '.NET 8 SDK' },
    @{ Id = 'Microsoft.DotNet.SDK.9'; Name = '.NET 9 SDK' },
    @{ Id = 'OpenJS.NodeJS'; Name = 'Node.js' },
    @{ Id = 'Oven-sh.Bun'; Name = 'Bun' },
    @{ Id = 'Python.Python.3.14'; Name = 'Python 3.14' },
    @{ Id = 'GnuWin32.Make'; Name = 'GNU Make' },
    @{ Id = 'cURL.cURL'; Name = 'curl' },
    @{ Id = 'junegunn.fzf'; Name = 'fzf (fuzzy finder)' },
    @{ Id = 'eza-community.eza'; Name = 'eza (modern ls)' },
    @{ Id = 'ajeetdsouza.zoxide'; Name = 'zoxide (smart cd)' },
    @{ Id = 'Docker.DockerDesktop'; Name = 'Docker Desktop' },
    @{ Id = 'GitHub.cli'; Name = 'GitHub CLI' },
    @{ Id = 'JanDeDobbeleer.OhMyPosh'; Name = 'Oh My Posh' }
)

$workPackages = @(
    @{ Id = 'Amazon.AWSCLI'; Name = 'AWS CLI v2' },
    @{ Id = 'Helm.Helm'; Name = 'Helm' },
    @{ Id = 'Hashicorp.Terraform'; Name = 'Terraform' },
    @{ Id = 'GLab.GLab'; Name = 'GitLab CLI' },
    @{ Id = 'WireGuard.WireGuard'; Name = 'WireGuard VPN' },
    @{ Id = 'Tailscale.Tailscale'; Name = 'Tailscale' }
)

$itAdminModules = @(
    'Microsoft.Graph',
    'ExchangeOnlineManagement',
    'AzureAD',
    'Az'
)

# ============================================================================
# LIST MODE (no elevation required)
# ============================================================================

if ($ListPackages) {
    Write-Host "`n=== Core Packages ===" -ForegroundColor Cyan
    $corePackages | ForEach-Object { Write-Host "  $($_.Id) - $($_.Name)" }

    Write-Host "`n=== Work Packages (-Work) ===" -ForegroundColor Yellow
    $workPackages | ForEach-Object { Write-Host "  $($_.Id) - $($_.Name)" }

    Write-Host "`n=== IT Admin Modules (-ITAdmin) ===" -ForegroundColor Magenta
    $itAdminModules | ForEach-Object { Write-Host "  $_" }

    exit 0
}

# ============================================================================
# SELF-ELEVATION
# ============================================================================

$LOCKFILE = Join-Path $env:USERPROFILE ".dotfiles.lock"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    $scriptPath = $MyInvocation.MyCommand.Path
    $argList = @("-ExecutionPolicy", "Bypass", "-File", "`"$scriptPath`"")
    if ($SkipPackages) { $argList += "-SkipPackages" }
    if ($ForcePackages) { $argList += "-ForcePackages" }
    if ($Work) { $argList += "-Work" }
    if ($ITAdmin) { $argList += "-ITAdmin" }
    Start-Process pwsh -Verb RunAs -ArgumentList $argList -Wait
    exit
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Install-WingetPackage {
    param([string]$Id, [string]$Name)

    Write-Host "  Installing $Name..." -ForegroundColor Cyan -NoNewline

    $result = winget install --id $Id -e --accept-package-agreements --accept-source-agreements 2>&1
    $exitCode = $LASTEXITCODE

    # Exit codes:
    # 0 = success
    # -1978335189 = already installed
    # -1978335226 = no applicable update (already at latest)
    # -1978335212 = no matching package found
    switch ($exitCode) {
        0 {
            Write-Host " installed" -ForegroundColor Green
            return $true
        }
        -1978335189 {
            Write-Host " already installed" -ForegroundColor DarkGray
            return $true
        }
        -1978335226 {
            Write-Host " up to date" -ForegroundColor DarkGray
            return $true
        }
        default {
            Write-Host " failed (exit: $exitCode)" -ForegroundColor Red
            return $false
        }
    }
}

function Install-PSModule {
    param([string]$Name)

    Write-Host "  Installing $Name..." -ForegroundColor Cyan -NoNewline

    if (Get-Module -ListAvailable -Name $Name) {
        Write-Host " already installed" -ForegroundColor DarkGray
        return $true
    }

    try {
        Install-Module -Name $Name -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
        Write-Host " installed" -ForegroundColor Green
        return $true
    } catch {
        Write-Host " failed: $_" -ForegroundColor Red
        return $false
    }
}

function Install-Packages {
    param([switch]$Work, [switch]$ITAdmin)

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "winget not found. Please install App Installer from Microsoft Store." -ForegroundColor Red
        return $false
    }

    $script:failed = @()

    # Core packages
    Write-Host "`n--- Core Packages ---" -ForegroundColor Cyan
    foreach ($pkg in $corePackages) {
        if (-not (Install-WingetPackage -Id $pkg.Id -Name $pkg.Name)) {
            $script:failed += $pkg.Name
        }
    }

    # Work packages
    if ($Work) {
        Write-Host "`n--- Work Packages ---" -ForegroundColor Yellow
        foreach ($pkg in $workPackages) {
            if (-not (Install-WingetPackage -Id $pkg.Id -Name $pkg.Name)) {
                $script:failed += $pkg.Name
            }
        }
    }

    # IT Admin modules
    if ($ITAdmin) {
        Write-Host "`n--- IT Admin PowerShell Modules ---" -ForegroundColor Magenta
        foreach ($mod in $itAdminModules) {
            if (-not (Install-PSModule -Name $mod)) {
                $script:failed += $mod
            }
        }

        # RSAT features
        Write-Host "`n--- RSAT Features ---" -ForegroundColor Magenta
        $rsatFeatures = @(
            'Rsat.ActiveDirectory.DS-LDS.Tools~~~~0.0.1.0',
            'Rsat.GroupPolicy.Management.Tools~~~~0.0.1.0',
            'Rsat.Dns.Tools~~~~0.0.1.0'
        )
        foreach ($feature in $rsatFeatures) {
            Write-Host "  Installing $feature..." -ForegroundColor Cyan -NoNewline
            $state = (Get-WindowsCapability -Online -Name $feature -ErrorAction SilentlyContinue).State
            if ($state -eq 'Installed') {
                Write-Host " already installed" -ForegroundColor DarkGray
            } else {
                try {
                    Add-WindowsCapability -Online -Name $feature -ErrorAction Stop | Out-Null
                    Write-Host " installed" -ForegroundColor Green
                } catch {
                    Write-Host " failed" -ForegroundColor Red
                    $script:failed += $feature
                }
            }
        }
    }

    # Summary
    if ($script:failed.Count -eq 0) {
        Write-Host "`nAll packages installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "`nFailed packages:" -ForegroundColor Red
        $script:failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    }

    return $true
}

# ============================================================================
# MAIN
# ============================================================================

$ErrorActionPreference = "Stop"

# Enable ANSI color codes and virtual terminal
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

# Enable Virtual Terminal Processing for ANSI escape sequences
$kernel32 = Add-Type -MemberDefinition @"
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint mode);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint mode);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int handle);
"@ -Name "Kernel32" -Namespace "Win32" -PassThru

$handle = $kernel32::GetStdHandle(-11)  # STD_OUTPUT_HANDLE
$mode = 0
$null = $kernel32::GetConsoleMode($handle, [ref]$mode)
$null = $kernel32::SetConsoleMode($handle, $mode -bor 0x0004)  # ENABLE_VIRTUAL_TERMINAL_PROCESSING

try {
    $CONFIG = "install.conf.yaml"
    $DOTBOT_DIR = "dotbot"
    $DOTBOT_BIN = "bin/dotbot"
    $BASEDIR = $PSScriptRoot

    Write-Host "`n=== Dotfiles Installer ===" -ForegroundColor Cyan
    Write-Host "Running as Administrator" -ForegroundColor Green

    Set-Location $BASEDIR
    Write-Host "Working directory: $BASEDIR" -ForegroundColor DarkGray

    # Update dotbot submodule
    Write-Host "`nUpdating dotbot submodule..." -ForegroundColor Cyan
    git -C $DOTBOT_DIR submodule sync --quiet --recursive
    git submodule update --init --recursive $DOTBOT_DIR

    # Run dotbot
    Write-Host "`nRunning dotbot..." -ForegroundColor Cyan
    $dotbotPath = Join-Path $BASEDIR $DOTBOT_DIR $DOTBOT_BIN

    $python = Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
    if (-not $python) {
        throw "Python not found. Please install Python and ensure it's in PATH."
    }

    & $python $dotbotPath -d $BASEDIR -c $CONFIG @args

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nDotfiles installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "`nDotbot completed with warnings." -ForegroundColor Yellow
    }

    # Configure git SSH keys
    Write-Host "`nConfiguring Git SSH keys..." -ForegroundColor Cyan
    $gitSshSetup = Join-Path $BASEDIR "git-ssh-setup"
    if (Test-Path $gitSshSetup) {
        & bash $gitSshSetup
    }

    # Package installation decision
    $shouldInstallPackages = $false
    $installReason = ""

    if ($SkipPackages) {
        Write-Host "`nSkipping package installation (-SkipPackages)" -ForegroundColor DarkGray
    } elseif ($ForcePackages) {
        Write-Host "`nForcing package installation (-ForcePackages)" -ForegroundColor Yellow
        $shouldInstallPackages = $true
        $installReason = "forced"
    } elseif (-not (Test-Path $LOCKFILE)) {
        Write-Host "`nFirst run detected - installing packages..." -ForegroundColor Cyan
        $shouldInstallPackages = $true
        $installReason = "first_run"
    } else {
        # Compare lock file timestamp vs this script's modification time
        $lockTime = (Get-Item $LOCKFILE).LastWriteTime
        $scriptTime = (Get-Item $PSCommandPath).LastWriteTime

        if ($scriptTime -gt $lockTime) {
            Write-Host "`nInstaller updated since last run - reinstalling packages..." -ForegroundColor Yellow
            Write-Host "  install.ps1: $($scriptTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor DarkGray
            Write-Host "  lock file:   $($lockTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor DarkGray
            $shouldInstallPackages = $true
            $installReason = "updated"
        } else {
            $lockContent = Get-Content $LOCKFILE -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
            Write-Host "`nPackages up to date (installed $($lockContent.installed_at))" -ForegroundColor DarkGray
        }
    }

    # Install packages
    if ($shouldInstallPackages) {
        Install-Packages -Work:$Work -ITAdmin:$ITAdmin

        # Update lock file
        $lockData = @{
            installed_at = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            install_reason = $installReason
            work = $Work.IsPresent
            itadmin = $ITAdmin.IsPresent
        }
        $lockData | ConvertTo-Json | Set-Content $LOCKFILE -Force
        Write-Host "`nLock file updated: $LOCKFILE" -ForegroundColor Green
    }

    # Post-install reminders
    Write-Host "`nPost-install (run in new terminal if needed):" -ForegroundColor Yellow
    Write-Host "  Install-Module PSFzf -Scope CurrentUser -Force" -ForegroundColor DarkGray
    Write-Host "  Install-Module Terminal-Icons -Scope CurrentUser -Force" -ForegroundColor DarkGray
    Write-Host "  Install-Module CompletionPredictor -Scope CurrentUser -Force" -ForegroundColor DarkGray
    Write-Host "  Install-Module DockerCompletion -Scope CurrentUser -Force" -ForegroundColor DarkGray
    Write-Host "  Install-Module posh-git -Scope CurrentUser -Force" -ForegroundColor DarkGray

} catch {
    Write-Host "`nERROR: $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
}

Write-Host "`nPress any key to exit..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
