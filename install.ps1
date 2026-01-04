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
    @{ Id = 'JanDeDobbeleer.OhMyPosh'; Name = 'Oh My Posh' },
    @{ Id = 'jqlang.jq'; Name = 'jq (JSON processor)' },
    @{ Id = 'BurntSushi.ripgrep.MSVC'; Name = 'ripgrep (rg)' },
    @{ Id = 'sharkdp.fd'; Name = 'fd (find replacement)' },
    @{ Id = 'sharkdp.bat'; Name = 'bat (cat replacement)' },
    @{ Id = 'aristocratos.btop4win'; Name = 'btop (system monitor)' },
    @{ Id = 'tldr-pages.tlrc'; Name = 'tldr (man pages)' },
    @{ Id = 'koalaman.shellcheck'; Name = 'shellcheck (shell linter)' },
    @{ Id = 'mvdan.shfmt'; Name = 'shfmt (shell formatter)' }
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

# PowerShell user modules (always installed, CurrentUser scope)
$userModules = @(
    'PSFzf',
    'Terminal-Icons',
    'CompletionPredictor',
    'DockerCompletion',
    'posh-git'
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

    Write-Host "`n=== PowerShell User Modules ===" -ForegroundColor Blue
    $userModules | ForEach-Object { Write-Host "  $_" }

    exit 0
}

# ============================================================================
# SELF-ELEVATION
# ============================================================================

$LOCKFILE = Join-Path $env:USERPROFILE ".dotfiles.lock"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow

    # Determine PowerShell executable
    $pwshExe = if (Test-Path (Join-Path $PSHOME 'pwsh.exe')) {
        Join-Path $PSHOME 'pwsh.exe'
    } else {
        'pwsh'
    }

    $scriptPath = $MyInvocation.MyCommand.Path
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$scriptPath`"")
    if ($SkipPackages) { $argList += "-SkipPackages" }
    if ($ForcePackages) { $argList += "-ForcePackages" }
    if ($Work) { $argList += "-Work" }
    if ($ITAdmin) { $argList += "-ITAdmin" }

    try {
        Start-Process -FilePath $pwshExe -ArgumentList $argList -Verb RunAs -Wait
        exit 0
    } catch {
        Write-Host "Elevation cancelled or failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 2
    }
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Get-ContentLF {
    # Read file and ensure LF line endings for WSL compatibility
    param([string]$Path)
    (Get-Content $Path -Raw) -replace "`r`n", "`n" -replace "`r", "`n"
}

function ConvertTo-GitBashPath {
    # Convert Windows path to Git Bash format: C:\path -> /c/path
    param([string]$Path)
    $path = $Path -replace '\\', '/'
    if ($path -match '^([A-Za-z]):(.*)') {
        return '/' + $matches[1].ToLower() + $matches[2]
    }
    return $path
}

function Get-GitBash {
    # Find Git Bash executable (not WSL bash)
    $gitBashPaths = @(
        "$env:ProgramFiles\Git\bin\bash.exe",
        "$env:ProgramFiles\Git\usr\bin\bash.exe",
        "${env:ProgramFiles(x86)}\Git\bin\bash.exe"
    )
    foreach ($path in $gitBashPaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    # Fallback to searching PATH (may find WSL bash)
    return (Get-Command bash -ErrorAction SilentlyContinue)?.Source
}

function ConvertTo-WSLPath {
    # Convert Windows path to WSL format: C:\path -> /mnt/c/path
    param([string]$Path)
    $path = $Path -replace '\\', '/'
    if ($path -match '^([A-Za-z]):(.*)') {
        return '/mnt/' + $matches[1].ToLower() + $matches[2]
    }
    return $path
}

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

    # npm global packages (requires Node.js from core packages)
    Write-Host "`n--- npm Global Packages ---" -ForegroundColor Cyan
    $npmPackages = @('bats')
    foreach ($pkg in $npmPackages) {
        Write-Host "  $pkg..." -ForegroundColor Cyan -NoNewline
        $installed = npm list -g $pkg 2>$null | Select-String $pkg
        if ($installed) {
            Write-Host " already installed" -ForegroundColor DarkGray
        } else {
            try {
                npm install -g $pkg 2>$null | Out-Null
                Write-Host " installed" -ForegroundColor Green
            } catch {
                Write-Host " failed" -ForegroundColor Red
                $script:failed += "npm:$pkg"
            }
        }
    }

    # PowerShell user modules (CurrentUser scope, no admin required)
    Write-Host "`n--- PowerShell User Modules ---" -ForegroundColor Blue
    foreach ($mod in $userModules) {
        if (-not (Install-PSModule -Name $mod)) {
            $script:failed += $mod
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

    # Use WSL to read from /mnt/c directly to avoid PowerShell CRLF issues
    # Use wsl -e to bypass login shell entirely
    $wslPath = ConvertTo-WSLPath $wslPackagesScript
    $distroArg = if ($Distro) { @("-d", $Distro) } else { @() }

    # Copy script to WSL and run it
    wsl @distroArg -e bash --norc -c "mkdir -p /tmp/dotfiles-setup && tr -d '\r' < '$wslPath' > /tmp/dotfiles-setup/wsl-packages && chmod +x /tmp/dotfiles-setup/wsl-packages"

    # Run the script
    $runResult = wsl @distroArg -e bash --norc -c '/tmp/dotfiles-setup/wsl-packages'

    # Cleanup
    wsl @distroArg -e bash --norc -c 'rm -rf /tmp/dotfiles-setup' 2>$null

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
# PowerShell 7.2+ has this built-in, but we need it for the elevated console
try {
    $kernel32Def = @"
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint mode);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint mode);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int handle);
"@
    # Use unique namespace to avoid conflicts on re-run
    $kernel32 = Add-Type -MemberDefinition $kernel32Def -Name "Kernel32VT" -Namespace "Win32Install" -PassThru -ErrorAction SilentlyContinue
    if ($kernel32) {
        $handle = $kernel32::GetStdHandle(-11)  # STD_OUTPUT_HANDLE
        $mode = 0
        $null = $kernel32::GetConsoleMode($handle, [ref]$mode)
        $null = $kernel32::SetConsoleMode($handle, $mode -bor 0x0004)  # ENABLE_VIRTUAL_TERMINAL_PROCESSING
    }
} catch {
    # VT enabling failed, colors may not work but continue anyway
}

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

    # Disable colors if VT not supported (legacy console)
    if (-not $Host.UI.SupportsVirtualTerminal) {
        $env:NO_COLOR = "1"
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

    # Find Git Bash (not WSL bash)
    $gitBash = Get-GitBash
    if (-not $gitBash) {
        Write-Host "`nGit Bash not found, skipping bash script configuration" -ForegroundColor Yellow
    } else {
        Write-Host "  Using: $gitBash" -ForegroundColor DarkGray
        # Configure git SSH keys
        Write-Host "`nConfiguring Git SSH keys..." -ForegroundColor Cyan
        $gitSshSetup = Join-Path $BASEDIR "git-ssh-setup"
        if (Test-Path $gitSshSetup) {
            $bashPath = ConvertTo-GitBashPath $gitSshSetup
            & $gitBash "$bashPath"
        }

        # Set up Claude Code directory link
        Write-Host "`nSetting up Claude Code directory..." -ForegroundColor Cyan
        $claudeLinkSetup = Join-Path $BASEDIR "claude-link-setup"
        if (Test-Path $claudeLinkSetup) {
            $bashPath = ConvertTo-GitBashPath $claudeLinkSetup
            & $gitBash "$bashPath"
        }

        # Configure Claude MCP servers
        Write-Host "`nConfiguring Claude MCP servers..." -ForegroundColor Cyan
        $claudeMcpSetup = Join-Path $BASEDIR "claude-mcp-setup"
        if (Test-Path $claudeMcpSetup) {
            $bashPath = ConvertTo-GitBashPath $claudeMcpSetup
            & $gitBash "$bashPath"
        }
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
        # Step 2: Pre-copy key files before installing packages
        # (wsl-packages sets zsh as default, subsequent commands need these files)
        # Use WSL to read from /mnt/c directly to avoid PowerShell CRLF issues
        $wslBasedir = ConvertTo-WSLPath $BASEDIR
        $zshPlugins = Join-Path $BASEDIR "zsh-plugins"
        if (Test-Path $zshPlugins) {
            wsl -e bash --norc -c "mkdir -p ~/.dotfiles && tr -d '\r' < '$wslBasedir/zsh-plugins' > ~/.dotfiles/zsh-plugins && chmod +x ~/.dotfiles/zsh-plugins"
        }

        # Also pre-copy .zshrc so zsh has a valid config when it starts
        $zshrc = Join-Path $BASEDIR ".zshrc"
        if (Test-Path $zshrc) {
            wsl -e bash --norc -c "tr -d '\r' < '$wslBasedir/.zshrc' > ~/.zshrc"
        }

        # Step 3: Install packages inside WSL
        $null = Install-WSLPackages

        # Step 4: Copy and install dotfiles in WSL
        Write-Host "`n  Configuring WSL dotfiles..." -ForegroundColor Cyan
        $installWslPath = Join-Path $BASEDIR "install-wsl"
        $installWslYaml = Join-Path $BASEDIR "install.wsl.yaml"

        if ((Test-Path $installWslPath) -and (Test-Path $installWslYaml)) {
            # Use WSL to read from /mnt/c directly to avoid PowerShell CRLF issues
            # Use wsl -e to bypass login shell entirely
            $wslBasedir = ConvertTo-WSLPath $BASEDIR

            # Create temp directory in WSL
            wsl -e bash --norc -c 'mkdir -p /tmp/dotfiles-setup'

            # Copy the installer and config
            wsl -e bash --norc -c "tr -d '\r' < '$wslBasedir/install-wsl' > /tmp/dotfiles-setup/install-wsl && chmod +x /tmp/dotfiles-setup/install-wsl"
            wsl -e bash --norc -c "tr -d '\r' < '$wslBasedir/install.wsl.yaml' > /tmp/dotfiles-setup/install.wsl.yaml"

            # Copy key dotfiles for linking
            $dotfiles = @('.zshrc', '.zprofile', '.profile', '.bashrc', '.bash_profile', '.gitconfig', '.dircolors')
            foreach ($file in $dotfiles) {
                $filePath = Join-Path $BASEDIR $file
                if (Test-Path $filePath) {
                    wsl -e bash --norc -c "tr -d '\r' < '$wslBasedir/$file' > /tmp/dotfiles-setup/$file"
                }
            }

            # Copy zsh-plugins script
            if (Test-Path $zshPlugins) {
                wsl -e bash --norc -c "tr -d '\r' < '$wslBasedir/zsh-plugins' > /tmp/dotfiles-setup/zsh-plugins && chmod +x /tmp/dotfiles-setup/zsh-plugins"
            }

            # Copy claude-status script
            $claudeStatus = Join-Path $BASEDIR ".claude\claude-status"
            if (Test-Path $claudeStatus) {
                wsl -e bash --norc -c "mkdir -p /tmp/dotfiles-setup/.claude && tr -d '\r' < '$wslBasedir/.claude/claude-status' > /tmp/dotfiles-setup/.claude/claude-status && chmod +x /tmp/dotfiles-setup/.claude/claude-status"
            }

            # Copy ohmyposh config
            $ohMyPosh = Join-Path $BASEDIR "config\ohmyposh\prompt.json"
            if (Test-Path $ohMyPosh) {
                wsl -e bash --norc -c "mkdir -p /tmp/dotfiles-setup/config/ohmyposh && tr -d '\r' < '$wslBasedir/config/ohmyposh/prompt.json' > /tmp/dotfiles-setup/config/ohmyposh/prompt.json"
            }

            # Run the installer from the temp directory
            wsl -e bash --norc -c 'cd /tmp/dotfiles-setup && ./install-wsl'
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  WSL dotfiles configured" -ForegroundColor Green
            } else {
                Write-Host "  WSL dotfiles setup completed with warnings" -ForegroundColor Yellow
            }

            # Cleanup
            wsl -e bash --norc -c 'rm -rf /tmp/dotfiles-setup'
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

    # ========================================================================
    # PowerShell Completion Cache (for fast profile startup)
    # ========================================================================
    Write-Host "`nGenerating PowerShell completion cache..." -ForegroundColor Cyan

    $completionCacheDir = "$env:LOCALAPPDATA\PowerShell\CompletionCache"
    if (-not (Test-Path $completionCacheDir)) {
        New-Item -ItemType Directory -Path $completionCacheDir -Force | Out-Null
    }

    $completionTools = @(
        @{Name='kubectl'; Cmd='kubectl completion powershell'},
        @{Name='helm'; Cmd='helm completion powershell'},
        @{Name='gh'; Cmd='gh completion -s powershell'},
        @{Name='tailscale'; Cmd='tailscale completion powershell'}
    )

    foreach ($tool in $completionTools) {
        if (Get-Command $tool.Name -ErrorAction SilentlyContinue) {
            Write-Host "  Caching $($tool.Name)..." -ForegroundColor Cyan -NoNewline
            try {
                Invoke-Expression $tool.Cmd | Out-File "$completionCacheDir\$($tool.Name).ps1" -Encoding utf8
                Write-Host " done" -ForegroundColor Green
            }
            catch {
                Write-Host " failed" -ForegroundColor Red
            }
        }
    }

    # zoxide init
    if (Get-Command zoxide -ErrorAction SilentlyContinue) {
        Write-Host "  Caching zoxide..." -ForegroundColor Cyan -NoNewline
        try {
            zoxide init powershell | Out-File "$completionCacheDir\zoxide.ps1" -Encoding utf8
            Write-Host " done" -ForegroundColor Green
        }
        catch {
            Write-Host " failed" -ForegroundColor Red
        }
    }

    Write-Host "  Completion cache: $completionCacheDir" -ForegroundColor DarkGray

    Write-Host "`nInstallation complete." -ForegroundColor Green

} catch {
    Write-Host "`nERROR: $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
}

Write-Host "`nPress any key to exit..." -ForegroundColor DarkGray
$null = Read-Host
