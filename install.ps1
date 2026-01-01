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
# WSL FUNCTIONS (Idempotent)
# ============================================================================

function Get-WSLStatus {
    <#
    .SYNOPSIS
        Returns WSL installation status
    .OUTPUTS
        'not-installed' - WSL not available
        'no-distro' - WSL installed but no distro
        'ready' - WSL with distro ready
    #>

    # Check if wsl.exe exists
    $wslCmd = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if (-not $wslCmd) {
        return 'not-installed'
    }

    # Check if any distro is installed
    try {
        $distros = wsl --list --quiet 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $distros) {
            return 'no-distro'
        }
        # Filter out empty lines and Docker distros
        $realDistros = $distros | Where-Object { $_ -and $_ -notmatch 'docker' }
        if ($realDistros) {
            return 'ready'
        }
        return 'no-distro'
    } catch {
        return 'no-distro'
    }
}

function Install-WSLWithUbuntu {
    <#
    .SYNOPSIS
        Installs WSL and Ubuntu 24.04 if not present (idempotent)
    .OUTPUTS
        'already-installed' - No action needed
        'reboot-required' - WSL installed, reboot needed
        'distro-installed' - Ubuntu installed, ready to use
        'failed' - Installation failed
    #>
    param(
        [string]$Distro = "Ubuntu-24.04"
    )

    $status = Get-WSLStatus

    switch ($status) {
        'ready' {
            Write-Host "  WSL: already installed with distro" -ForegroundColor DarkGray
            return 'already-installed'
        }
        'not-installed' {
            Write-Host "  Installing WSL..." -ForegroundColor Cyan
            # Install WSL without a distro first (to handle reboot cleanly)
            $result = wsl --install --no-distribution 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  WSL components installed" -ForegroundColor Green
                Write-Host "  ${Yellow}A reboot may be required before installing Ubuntu${NC}" -ForegroundColor Yellow

                # Try to install distro immediately (works on some systems)
                Write-Host "  Attempting to install $Distro..." -ForegroundColor Cyan
                wsl --install -d $Distro --no-launch 2>$null
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  $Distro installed" -ForegroundColor Green
                    return 'distro-installed'
                } else {
                    return 'reboot-required'
                }
            } else {
                Write-Host "  WSL installation failed" -ForegroundColor Red
                return 'failed'
            }
        }
        'no-distro' {
            Write-Host "  WSL installed, adding $Distro..." -ForegroundColor Cyan
            wsl --install -d $Distro --no-launch 2>&1
            if ($LASTEXITCODE -eq 0) {
                # Set as default distro
                wsl --set-default $Distro 2>$null
                Write-Host "  $Distro installed and set as default" -ForegroundColor Green
                return 'distro-installed'
            } else {
                Write-Host "  Failed to install $Distro" -ForegroundColor Red
                return 'failed'
            }
        }
    }
    return 'failed'
}

function Install-WSLPackages {
    <#
    .SYNOPSIS
        Runs the wsl-packages script inside WSL (idempotent)
    #>
    param(
        [string]$Distro = $null
    )

    $wslPackagesScript = Join-Path $BASEDIR "wsl-packages"
    if (-not (Test-Path $wslPackagesScript)) {
        Write-Host "  wsl-packages script not found, skipping" -ForegroundColor Yellow
        return $false
    }

    Write-Host "  Installing packages inside WSL..." -ForegroundColor Cyan

    # Copy script to WSL and run it
    $distroArg = if ($Distro) { "-d $Distro" } else { "" }

    # Create temp location and copy script
    $copyCmd = "mkdir -p /tmp/dotfiles-setup && cat > /tmp/dotfiles-setup/wsl-packages && chmod +x /tmp/dotfiles-setup/wsl-packages"
    Get-Content $wslPackagesScript -Raw | wsl $distroArg --cd ~ bash -c $copyCmd

    # Run the script
    $runResult = wsl $distroArg --cd ~ bash -c '/tmp/dotfiles-setup/wsl-packages'

    # Cleanup
    wsl $distroArg --cd ~ bash -c 'rm -rf /tmp/dotfiles-setup' 2>$null

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  WSL packages installed" -ForegroundColor Green
        return $true
    } else {
        Write-Host "  WSL package installation had warnings" -ForegroundColor Yellow
        return $true
    }
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

    # Git Bash prompt (symlinks don't work reliably on Windows without admin)
    Write-Host "`nConfiguring Git Bash prompt..." -ForegroundColor Cyan
    $gitPromptSrc = Join-Path $BASEDIR "config\git\git-prompt.sh"
    $gitPromptDst = Join-Path $env:USERPROFILE ".config\git\git-prompt.sh"
    if (Test-Path $gitPromptSrc) {
        $gitPromptDir = Split-Path $gitPromptDst -Parent
        if (-not (Test-Path $gitPromptDir)) {
            New-Item -ItemType Directory -Path $gitPromptDir -Force | Out-Null
        }
        Copy-Item $gitPromptSrc $gitPromptDst -Force
        Write-Host "  Git Bash prompt configured" -ForegroundColor Green
    }

    # Configure git SSH keys
    Write-Host "`nConfiguring Git SSH keys..." -ForegroundColor Cyan
    $gitSshSetup = Join-Path $BASEDIR "git-ssh-setup"
    if (Test-Path $gitSshSetup) {
        & bash $gitSshSetup
    }

    # Set up Claude Code directory link
    Write-Host "`nSetting up Claude Code directory..." -ForegroundColor Cyan
    $claudeLinkSetup = Join-Path $BASEDIR "claude-link-setup"
    if (Test-Path $claudeLinkSetup) {
        & bash $claudeLinkSetup
    }

    # Configure Claude MCP servers
    Write-Host "`nConfiguring Claude MCP servers..." -ForegroundColor Cyan
    $claudeMcpSetup = Join-Path $BASEDIR "claude-mcp-setup"
    if (Test-Path $claudeMcpSetup) {
        & bash $claudeMcpSetup
    }

    # ========================================================================
    # WSL Setup (install WSL, Ubuntu, packages, and dotfiles)
    # ========================================================================
    Write-Host "`nSetting up WSL environment..." -ForegroundColor Cyan

    # Step 1: Ensure WSL and Ubuntu are installed
    $wslResult = Install-WSLWithUbuntu -Distro "Ubuntu-24.04"

    if ($wslResult -eq 'reboot-required') {
        Write-Host "`n${Yellow}========================================${NC}" -ForegroundColor Yellow
        Write-Host "WSL installation requires a system reboot." -ForegroundColor Yellow
        Write-Host "After rebooting, run this script again to:" -ForegroundColor Yellow
        Write-Host "  - Complete Ubuntu 24.04 installation" -ForegroundColor Yellow
        Write-Host "  - Install WSL packages (zsh, fzf, eza, etc.)" -ForegroundColor Yellow
        Write-Host "  - Configure dotfiles in WSL" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
    } elseif ($wslResult -eq 'failed') {
        Write-Host "  WSL setup failed, skipping WSL configuration" -ForegroundColor Red
    } else {
        # Step 2: Install packages inside WSL
        Install-WSLPackages

        # Step 3: Copy and install dotfiles in WSL
        Write-Host "`n  Configuring WSL dotfiles..." -ForegroundColor Cyan
        $installWslPath = Join-Path $BASEDIR "install-wsl"
        $installWslYaml = Join-Path $BASEDIR "install.wsl.yaml"

        if ((Test-Path $installWslPath) -and (Test-Path $installWslYaml)) {
            # Create temp directory in WSL
            wsl --cd ~ bash -c 'mkdir -p /tmp/dotfiles-setup'

            # Copy the installer and config
            Get-Content $installWslPath -Raw | wsl --cd ~ bash -c 'cat > /tmp/dotfiles-setup/install-wsl && chmod +x /tmp/dotfiles-setup/install-wsl'
            Get-Content $installWslYaml -Raw | wsl --cd ~ bash -c 'cat > /tmp/dotfiles-setup/install.wsl.yaml'

            # Copy key dotfiles for linking
            $dotfiles = @('.zshrc', '.zprofile', '.profile', '.bashrc', '.bash_profile', '.gitconfig', '.dircolors')
            foreach ($file in $dotfiles) {
                $filePath = Join-Path $BASEDIR $file
                if (Test-Path $filePath) {
                    Get-Content $filePath -Raw | wsl --cd ~ bash -c "cat > /tmp/dotfiles-setup/$file"
                }
            }

            # Copy zsh-plugins script
            $zshPlugins = Join-Path $BASEDIR "zsh-plugins"
            if (Test-Path $zshPlugins) {
                Get-Content $zshPlugins -Raw | wsl --cd ~ bash -c 'cat > /tmp/dotfiles-setup/zsh-plugins && chmod +x /tmp/dotfiles-setup/zsh-plugins'
            }

            # Copy claude-status script
            $claudeStatus = Join-Path $BASEDIR ".claude\claude-status"
            if (Test-Path $claudeStatus) {
                Get-Content $claudeStatus -Raw | wsl --cd ~ bash -c 'mkdir -p /tmp/dotfiles-setup/.claude && cat > /tmp/dotfiles-setup/.claude/claude-status && chmod +x /tmp/dotfiles-setup/.claude/claude-status'
            }

            # Copy ohmyposh config
            $ohMyPosh = Join-Path $BASEDIR "config\ohmyposh\prompt.json"
            if (Test-Path $ohMyPosh) {
                Get-Content $ohMyPosh -Raw | wsl --cd ~ bash -c 'mkdir -p /tmp/dotfiles-setup/config/ohmyposh && cat > /tmp/dotfiles-setup/config/ohmyposh/prompt.json'
            }

            # Run the installer from the temp directory
            wsl --cd ~ bash -c 'cd /tmp/dotfiles-setup && ./install-wsl'
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  WSL dotfiles configured" -ForegroundColor Green
            } else {
                Write-Host "  WSL dotfiles setup completed with warnings" -ForegroundColor Yellow
            }

            # Copy zsh-plugins to ~/.dotfiles/ (required by .zshrc)
            if (Test-Path $zshPlugins) {
                Get-Content $zshPlugins -Raw | wsl --cd ~ bash -c 'mkdir -p ~/.dotfiles && cat > ~/.dotfiles/zsh-plugins && chmod +x ~/.dotfiles/zsh-plugins'
            }

            # Cleanup
            wsl --cd ~ bash -c 'rm -rf /tmp/dotfiles-setup'
        } else {
            Write-Host "  install-wsl or install.wsl.yaml not found, skipping dotfiles" -ForegroundColor DarkGray
        }
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
