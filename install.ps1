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
    @{ Id = 'ezwinports.make'; Name = 'GNU Make' },
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
    @{ Id = 'dandavison.delta'; Name = 'git-delta (diff pager)' },
    @{ Id = 'aristocratos.btop4win'; Name = 'btop (system monitor)' },
    @{ Id = 'tldr-pages.tlrc'; Name = 'tldr (man pages)' },
    @{ Id = 'koalaman.shellcheck'; Name = 'shellcheck (shell linter)' },
    @{ Id = 'mvdan.shfmt'; Name = 'shfmt (shell formatter)' },
    @{ Id = 'astral-sh.uv'; Name = 'uv (Python package manager)' },
    @{ Id = 'MSYS2.MSYS2'; Name = 'MSYS2 (provides zsh for Git Bash)' },
    @{ Id = 'Rclone.Rclone'; Name = 'rclone (cloud sync)' },
    @{ Id = 'WinFsp.WinFsp'; Name = 'WinFsp (FUSE for Windows)' }
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
    'posh-git',
    'Pester'
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

        # Show log file location after elevated window closes
        $LogsDir = Join-Path $PSScriptRoot "logs"
        if (Test-Path $LogsDir) {
            $latestLog = Get-ChildItem -Path $LogsDir -Filter "install_*.log" |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($latestLog) {
                Write-Host "`nElevated installation log saved to:" -ForegroundColor Cyan
                Write-Host "  $($latestLog.FullName)" -ForegroundColor White
            }
        }

        exit 0
    } catch {
        Write-Host "Elevation cancelled or failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 2
    }
}

# ============================================================================
# START LOGGING (runs in elevated window)
# ============================================================================

# Create logs directory
$LogsDir = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

# Start transcript with timestamp
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile = Join-Path $LogsDir "install_$Timestamp.log"
Start-Transcript -Path $LogFile -Force | Out-Null

Write-Host "Logging to: $LogFile" -ForegroundColor DarkGray
Write-Host ""

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

# Source path utility functions (extracted for testability)
. "$PSScriptRoot/powershell/lib/path-utils.ps1"

function Write-GitBashPath {
    # Generate .path-windows-local with Windows PATH converted for Git Bash
    $outputFile = Join-Path $env:USERPROFILE ".path-windows-local"

    # Get combined PATH (User first for priority, then Machine)
    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $allPaths = ($userPath + ";" + $machinePath) -split ";" | Where-Object { $_ }

    # Blocklist - exclude system/irrelevant paths
    $excludePatterns = @(
        '*\Windows\system32*', '*\Windows\System32*',
        '*\Windows\Wbem*', '*\WindowsPowerShell\*',
        '*\WindowsApps*', '*\OpenSSH\*',
        '*\EaseUS\*', '*\NVIDIA*', '*\PhysX\*', '*\Windows Kits\*',
        '*\.venv\*', '*\Python313*', '*\github.copilot-chat\*',
        '*\GitHub CLI*', '*\PowerToys\*'
    )

    # Filter and deduplicate
    $filteredPaths = @()
    $seen = @{}
    foreach ($path in $allPaths) {
        $path = $path.TrimEnd('\', '/')
        $pathLower = $path.ToLower()
        if ($seen.ContainsKey($pathLower)) { continue }
        $seen[$pathLower] = $true
        if (-not (Test-Path $path -PathType Container)) { continue }

        $excluded = $false
        foreach ($pattern in $excludePatterns) {
            if ($path -like $pattern) { $excluded = $true; break }
        }
        if ($excluded) { continue }

        $filteredPaths += $path
    }

    # Convert to Git Bash format
    $gitBashPaths = $filteredPaths | ForEach-Object { ConvertTo-GitBashPath $_ }
    $pathString = $gitBashPaths -join ":"

    $content = "# Generated by install.ps1 - DO NOT EDIT`nexport PATH=`"${pathString}:`$PATH`""
    $contentLF = $content -replace "`r`n", "`n"

    # Idempotency check
    if (Test-Path $outputFile) {
        $existing = (Get-Content $outputFile -Raw) -replace "`r`n", "`n"
        if ($existing -eq $contentLF) {
            Write-Host "  PATH config: up to date" -ForegroundColor DarkGray
            return
        }
    }

    [System.IO.File]::WriteAllText($outputFile, $contentLF)
    Write-Host "  PATH config: generated ($($filteredPaths.Count) paths)" -ForegroundColor Green
}

function Configure-Rclone {
    # Configure rclone for MinIO access
    # Reads MINIO_* vars from .secrets and creates rclone.conf

    $rcloneDir = "$env:APPDATA\rclone"
    $rcloneConf = "$rcloneDir\rclone.conf"
    $secretsFile = "$env:USERPROFILE\.dotfiles\.secrets"

    if (-not (Test-Path $secretsFile)) {
        Write-Host "  .secrets file not found, skipping rclone config" -ForegroundColor Yellow
        return
    }

    # Parse MINIO vars from .secrets (bash format)
    $secrets = Get-Content $secretsFile -Raw
    $endpoint = if ($secrets -match 'MINIO_ENDPOINT=([^\r\n]+)') { $matches[1] } else { $null }
    $accessKey = if ($secrets -match 'MINIO_ACCESS_KEY=([^\r\n]+)') { $matches[1] } else { $null }
    $secretKey = if ($secrets -match 'MINIO_SECRET_KEY=([^\r\n]+)') { $matches[1] } else { $null }

    if (-not ($endpoint -and $accessKey -and $secretKey)) {
        Write-Host "  MINIO credentials not found in .secrets, skipping rclone config" -ForegroundColor Yellow
        return
    }

    # Create rclone directory
    if (-not (Test-Path $rcloneDir)) {
        New-Item -ItemType Directory -Path $rcloneDir -Force | Out-Null
    }

    # Build config content
    $configContent = @"
[menos]
type = s3
provider = Minio
env_auth = false
access_key_id = $accessKey
secret_access_key = $secretKey
endpoint = http://$endpoint
acl = private
"@

    # Check if config already exists and matches
    if (Test-Path $rcloneConf) {
        $existing = Get-Content $rcloneConf -Raw
        if ($existing -match '\[menos\]' -and $existing -match [regex]::Escape($endpoint)) {
            Write-Host "  rclone config: already configured" -ForegroundColor DarkGray
            return
        }
    }

    # Write config
    $configContent | Set-Content $rcloneConf -Force
    Write-Host "  rclone config: created $rcloneConf" -ForegroundColor Green
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

function Ensure-WinGetLinksInPath {
    # Ensure WinGet Links directory exists and is in User PATH
    $linksDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Links"

    # Create directory if it doesn't exist
    if (-not (Test-Path $linksDir)) {
        New-Item -ItemType Directory -Path $linksDir -Force | Out-Null
    }

    # Check if already in User PATH
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath -notlike "*$linksDir*") {
        Write-Host "  Adding WinGet Links to User PATH..." -ForegroundColor Cyan
        $newPath = "$linksDir;$userPath"
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        # Also update current session
        $env:PATH = "$linksDir;$env:PATH"
        Write-Host "  WinGet Links added to PATH" -ForegroundColor Green
        return $true
    }
    return $false
}

function Get-WindowsTerminalSettingsPaths {
    $paths = @()

    # Store/MSIX packaged Windows Terminal
    $packagesRoot = Join-Path $env:LOCALAPPDATA "Packages"
    if (Test-Path $packagesRoot) {
        $candidates = Get-ChildItem -Path $packagesRoot -Directory -Filter "Microsoft.WindowsTerminal*" -ErrorAction SilentlyContinue
        foreach ($dir in $candidates) {
            $settingsPath = Join-Path $dir.FullName "LocalState\settings.json"
            if (Test-Path $settingsPath) {
                $paths += $settingsPath
            }
        }
    }

    # Unpackaged Windows Terminal (rare, but supported)
    $unpackaged = Join-Path $env:LOCALAPPDATA "Microsoft\Windows Terminal\settings.json"
    if (Test-Path $unpackaged) {
        $paths += $unpackaged
    }

    return $paths | Select-Object -Unique
}

function Ensure-WindowsTerminalShiftEnter {
    # Configure Windows Terminal to send an escape sequence for Shift+Enter
    # so OpenCode can reliably receive it.
    $settingsPaths = Get-WindowsTerminalSettingsPaths
    if (-not $settingsPaths -or $settingsPaths.Count -eq 0) {
        Write-Host "  Windows Terminal settings not found, skipping" -ForegroundColor DarkGray
        return $false
    }

    $actionId = "User.sendInput.ShiftEnterCustom"
    $escapeSequence = [string]([char]27) + "[13;2u"
    $updatedAny = $false

    foreach ($settingsPath in $settingsPaths) {
        try {
            $raw = Get-Content $settingsPath -Raw -ErrorAction Stop
            $data = $raw | ConvertFrom-Json -ErrorAction Stop
        } catch {
            Write-Host "  Windows Terminal settings: failed to read $settingsPath" -ForegroundColor Yellow
            continue
        }

        $changed = $false

        # Ensure actions is an array
        $actions = @()
        if ($null -ne $data.actions) {
            $actions = @($data.actions)
        }

        $existingAction = $actions | Where-Object { $_ -and $_.id -eq $actionId } | Select-Object -First 1
        if ($existingAction) {
            if (-not $existingAction.command) {
                $existingAction | Add-Member -NotePropertyName command -NotePropertyValue ([pscustomobject]@{}) -Force
            }
            if ($existingAction.command.action -ne "sendInput" -or $existingAction.command.input -ne $escapeSequence) {
                $existingAction.command.action = "sendInput"
                $existingAction.command.input = $escapeSequence
                $changed = $true
            }
        } else {
            $actions += [ordered]@{
                command = [ordered]@{
                    action = "sendInput"
                    input  = $escapeSequence
                }
                id      = $actionId
            }
            $changed = $true
        }
        $data.actions = $actions

        # Ensure keybindings array contains shift+enter
        $keybindings = @()
        if ($null -ne $data.keybindings) {
            $keybindings = @($data.keybindings)
        }

        # Remove any other shift+enter mappings to avoid ambiguity
        $beforeCount = $keybindings.Count
        $keybindings = @($keybindings | Where-Object { $_ -and ($_.keys -ne "shift+enter" -or $_.id -eq $actionId) })
        if ($keybindings.Count -ne $beforeCount) {
            $changed = $true
        }

        $existingKeybind = $keybindings | Where-Object { $_ -and $_.id -eq $actionId } | Select-Object -First 1
        if ($existingKeybind) {
            if ($existingKeybind.keys -ne "shift+enter") {
                $existingKeybind.keys = "shift+enter"
                $changed = $true
            }
        } else {
            $keybindings += [ordered]@{
                id   = $actionId
                keys = "shift+enter"
            }
            $changed = $true
        }
        $data.keybindings = $keybindings

        if (-not $changed) {
            Write-Host "  Windows Terminal Shift+Enter: already configured ($settingsPath)" -ForegroundColor DarkGray
            continue
        }

        try {
            $json = $data | ConvertTo-Json -Depth 100
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($settingsPath, ($json + "`n"), $utf8NoBom)
            Write-Host "  Windows Terminal Shift+Enter: configured ($settingsPath)" -ForegroundColor Green
            $updatedAny = $true
        } catch {
            Write-Host "  Windows Terminal settings: failed to write $settingsPath" -ForegroundColor Yellow
        }
    }

    return $updatedAny
}

function New-WinGetLink {
    # Create symlink in WinGet Links for packages that don't auto-create them
    param(
        [string]$PackageId,
        [string]$ExeName,
        [string]$RelativePath = ""  # Path within package dir to the exe
    )

    $linksDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Links"
    $packagesDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages"
    $linkPath = Join-Path $linksDir $ExeName

    # Skip if link already exists
    if (Test-Path $linkPath) {
        return $false
    }

    # Find the package directory (includes source suffix)
    $packageDir = Get-ChildItem -Path $packagesDir -Directory -Filter "${PackageId}_*" | Select-Object -First 1
    if (-not $packageDir) {
        return $false
    }

    # Build full path to executable
    $exePath = if ($RelativePath) {
        Join-Path $packageDir.FullName $RelativePath $ExeName
    } else {
        Join-Path $packageDir.FullName $ExeName
    }

    if (-not (Test-Path $exePath)) {
        # Try searching within package dir
        $found = Get-ChildItem -Path $packageDir.FullName -Recurse -Filter $ExeName -File | Select-Object -First 1
        if ($found) {
            $exePath = $found.FullName
        } else {
            return $false
        }
    }

    # Create symlink
    try {
        New-Item -ItemType SymbolicLink -Path $linkPath -Target $exePath -Force | Out-Null
        return $true
    } catch {
        # Symlink failed, try hardlink or copy as fallback
        try {
            Copy-Item $exePath $linkPath -Force
            return $true
        } catch {
            return $false
        }
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

    # WinGet Links setup (some packages don't auto-create symlinks)
    Write-Host "`n--- WinGet Links ---" -ForegroundColor Cyan
    Ensure-WinGetLinksInPath

    # Packages that need manual symlinks in WinGet Links
    $wingetLinks = @(
        @{ PackageId = 'Oven-sh.Bun'; ExeName = 'bun.exe'; RelativePath = 'bun-windows-x64' },
        @{ PackageId = 'cURL.cURL'; ExeName = 'curl.exe'; RelativePath = '' },  # Version in path, uses recursive search
        @{ PackageId = 'dandavison.delta'; ExeName = 'delta.exe'; RelativePath = '' },  # Version in path, uses recursive search
        @{ PackageId = 'ezwinports.make'; ExeName = 'make.exe'; RelativePath = '' }  # Portable package needs link
    )
    foreach ($link in $wingetLinks) {
        Write-Host "  $($link.ExeName)..." -ForegroundColor Cyan -NoNewline
        if (New-WinGetLink -PackageId $link.PackageId -ExeName $link.ExeName -RelativePath $link.RelativePath) {
            Write-Host " linked" -ForegroundColor Green
        } else {
            $linkPath = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\$($link.ExeName)"
            if (Test-Path $linkPath) {
                Write-Host " already linked" -ForegroundColor DarkGray
            } else {
                Write-Host " skipped (not installed)" -ForegroundColor DarkGray
            }
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

    # MSYS2 packages (zsh for Git Bash - requires MSYS2 from core packages)
    Write-Host "`n--- MSYS2 Packages (Git Bash zsh) ---" -ForegroundColor Cyan
    $msys2Pacman = "C:\msys64\usr\bin\pacman.exe"
    if (Test-Path $msys2Pacman) {
        $msys2Packages = @('zsh')
        foreach ($pkg in $msys2Packages) {
            Write-Host "  $pkg..." -ForegroundColor Cyan -NoNewline
            # Check if package is installed
            $installed = & $msys2Pacman -Q $pkg 2>$null
            if ($installed) {
                Write-Host " already installed" -ForegroundColor DarkGray
            } else {
                try {
                    # Install package non-interactively
                    & $msys2Pacman -S --noconfirm $pkg 2>$null | Out-Null
                    Write-Host " installed" -ForegroundColor Green
                } catch {
                    Write-Host " failed" -ForegroundColor Red
                    $script:failed += "msys2:$pkg"
                }
            }
        }
    } else {
        Write-Host "  MSYS2 not found at C:\msys64 - skipping zsh install" -ForegroundColor Yellow
        Write-Host "  (Run installer again after MSYS2 finishes installing)" -ForegroundColor DarkGray
    }

    # Install zsh plugins for Git Bash
    Write-Host "`n--- Zsh Plugins (Git Bash) ---" -ForegroundColor Cyan
    $gitBash = "C:\Program Files\Git\bin\bash.exe"
    $zshPluginsScript = Join-Path $BASEDIR "zsh-plugins"
    if ((Test-Path $gitBash) -and (Test-Path $zshPluginsScript)) {
        Write-Host "  Installing zsh plugins..." -ForegroundColor Cyan
        # Run zsh-plugins with ZDOTDIR set so it finds the right dotfiles dir
        $zdotdir = $HOME -replace '\\', '/'
        & $gitBash --login -c "ZDOTDIR='$zdotdir' source '$($zshPluginsScript -replace '\\', '/')'" 2>&1 | ForEach-Object {
            if ($_ -match 'Installing plugin') {
                Write-Host "    $_" -ForegroundColor DarkGray
            }
        }
        Write-Host "  Plugins installed" -ForegroundColor Green
    } else {
        Write-Host "  Git Bash not found - skipping plugin install" -ForegroundColor Yellow
    }

    # Create MSYS2 zsh bootstrap (fixes HOME mismatch between Git Bash and MSYS2 zsh)
    Write-Host "`n--- MSYS2 Zsh Bootstrap ---" -ForegroundColor Cyan
    $msys2Home = "C:\msys64\home\$env:USERNAME"
    $bootstrapSrc = Join-Path $BASEDIR ".zshrc-msys2-bootstrap"
    if ((Test-Path $msys2Home) -and (Test-Path $bootstrapSrc)) {
        $bootstrapDst = Join-Path $msys2Home ".zshrc"
        Copy-Item $bootstrapSrc $bootstrapDst -Force
        Write-Host "  Created $bootstrapDst" -ForegroundColor Green
    } else {
        Write-Host "  MSYS2 home not found - skipping bootstrap" -ForegroundColor DarkGray
    }

    # Create symlinks from MSYS2 home to Windows home (for git, ssh, etc.)
    Write-Host "`n--- MSYS2 Home Symlinks ---" -ForegroundColor Cyan
    if (Test-Path $msys2Home) {
        $winHome = $env:USERPROFILE
        $symlinks = @(
            @{ Name = ".gitconfig"; Target = "$winHome\.gitconfig" },
            @{ Name = ".ssh"; Target = "$winHome\.ssh" }
        )
        foreach ($link in $symlinks) {
            $linkPath = Join-Path $msys2Home $link.Name
            $targetPath = $link.Target
            if (Test-Path $targetPath) {
                if (Test-Path $linkPath) {
                    $item = Get-Item $linkPath -Force
                    if ($item.LinkType -eq "SymbolicLink") {
                        Write-Host "  $($link.Name) already linked" -ForegroundColor DarkGray
                        continue
                    }
                    # Backup existing file/dir
                    $backup = "$linkPath.bak"
                    Move-Item $linkPath $backup -Force
                    Write-Host "  Backed up existing $($link.Name) to $($link.Name).bak" -ForegroundColor Yellow
                }
                try {
                    New-Item -ItemType SymbolicLink -Path $linkPath -Target $targetPath -Force | Out-Null
                    Write-Host "  Linked $($link.Name) -> $targetPath" -ForegroundColor Green
                } catch {
                    Write-Host "  Failed to create symlink for $($link.Name): $_" -ForegroundColor Red
                    Write-Host "  (Enable Developer Mode in Windows Settings to allow symlinks)" -ForegroundColor DarkGray
                }
            } else {
                Write-Host "  Skipping $($link.Name) - target not found: $targetPath" -ForegroundColor DarkGray
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

        # Generate Git Bash PATH configuration
        Write-Host "`nGenerating Git Bash PATH..." -ForegroundColor Cyan
        Write-GitBashPath
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
        $wslBasedir = ConvertTo-WSLPath $BASEDIR

        # Step 2: Configure passwordless sudo (requires password once, then never again)
        # This must happen BEFORE wsl-packages so package installation doesn't prompt
        Write-Host "  Configuring passwordless sudo..." -ForegroundColor Cyan
        $sudoersCheck = wsl -e bash --norc -c 'sudo -n true 2>/dev/null && echo "ok" || echo "need"'
        if ($sudoersCheck -eq "need") {
            # Create sudoers.d entry for current user (prompts for password once)
            wsl -e bash -c 'echo "$(whoami) ALL=(ALL) NOPASSWD: /usr/bin/apt, /usr/bin/apt-get, /usr/bin/chsh" | sudo tee /etc/sudoers.d/$(whoami)-nopasswd > /dev/null && sudo chmod 440 /etc/sudoers.d/$(whoami)-nopasswd'
            Write-Host "  Passwordless sudo: configured" -ForegroundColor Green
        } else {
            Write-Host "  Passwordless sudo: already configured" -ForegroundColor DarkGray
        }

        # Step 3: Install dotfiles in WSL using dotbot (creates symlinks to Windows dotfiles)
        # This runs BEFORE wsl-packages so symlinks exist when zsh starts
        Write-Host "`n  Configuring WSL dotfiles..." -ForegroundColor Cyan
        $installWslPath = Join-Path $BASEDIR "install-wsl"
        $installWslYaml = Join-Path $BASEDIR "install.wsl.yaml"

        if ((Test-Path $installWslPath) -and (Test-Path $installWslYaml)) {
            # Run install-wsl directly from Windows mount - this uses dotbot to create
            # proper symlinks from WSL home to the Windows dotfiles repo
            wsl -e bash --norc -c "cd '$wslBasedir' && ./install-wsl"
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  WSL dotfiles configured (symlinks created)" -ForegroundColor Green
            } else {
                Write-Host "  WSL dotfiles setup completed with warnings" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  install-wsl or install.wsl.yaml not found, skipping dotfiles" -ForegroundColor DarkGray
        }

        # Step 4: Install packages inside WSL (zsh, fzf, eza, etc.)
        $null = Install-WSLPackages
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

        # Configure rclone for MinIO (after rclone is installed)
        Write-Host "`nConfiguring rclone..." -ForegroundColor Cyan
        Configure-Rclone
    }

    # ========================================================================
    # VS Code Settings Symlinks (admin required for symlinks without Developer Mode)
    # ========================================================================
    Write-Host "`nConfiguring VS Code settings symlinks..." -ForegroundColor Cyan
    $vscodeUserDir = "$env:APPDATA\Code\User"
    $vscodeSource = Join-Path $BASEDIR "vscode"

    if (Test-Path $vscodeSource) {
        if (-not (Test-Path $vscodeUserDir)) {
            New-Item -ItemType Directory -Path $vscodeUserDir -Force | Out-Null
        }

        $vscodeFiles = @("settings.json", "keybindings.json")
        foreach ($file in $vscodeFiles) {
            $srcPath = Join-Path $vscodeSource $file
            $dstPath = Join-Path $vscodeUserDir $file

            if (-not (Test-Path $srcPath)) {
                Write-Host "  ${file}: source not found" -ForegroundColor DarkGray
                continue
            }

            # Check if already a symlink pointing to correct target
            if (Test-Path $dstPath) {
                $item = Get-Item $dstPath -Force
                if ($item.LinkType -eq "SymbolicLink") {
                    $target = $item.Target
                    if ($target -eq $srcPath) {
                        Write-Host "  ${file}: already linked" -ForegroundColor DarkGray
                        continue
                    }
                }
                # Remove existing file/symlink
                Remove-Item $dstPath -Force
            }

            try {
                New-Item -ItemType SymbolicLink -Path $dstPath -Target $srcPath -Force | Out-Null
                Write-Host "  ${file}: linked" -ForegroundColor Green
            } catch {
                Write-Host "  ${file}: symlink failed, copying instead" -ForegroundColor Yellow
                Copy-Item $srcPath $dstPath -Force
            }
        }
    } else {
        Write-Host "  vscode/ directory not found, skipping" -ForegroundColor DarkGray
    }

    # ========================================================================
    # Windows Terminal - OpenCode Shift+Enter
    # ========================================================================
    Write-Host "`nConfiguring Windows Terminal (Shift+Enter)..." -ForegroundColor Cyan
    $null = Ensure-WindowsTerminalShiftEnter

    # ========================================================================
    # MSYS2 nsswitch.conf Fix (Always runs - system config, not a package)
    # ========================================================================
    # This fix ensures MSYS2's zsh resolves HOME to /c/Users/username instead of
    # /c/msys64/home/username. Without this, all ZDOTDIR workarounds are needed.
    $nsswitchPath = "C:\msys64\etc\nsswitch.conf"
    if (Test-Path $nsswitchPath) {
        $content = Get-Content $nsswitchPath -Raw
        if ($content -match 'db_home:\s+cygwin\s+desc' -and $content -notmatch 'db_home:\s+env\s+windows') {
            Write-Host "`nFixing MSYS2 nsswitch.conf (adding 'env windows' to db_home)..." -ForegroundColor Yellow
            $newContent = $content -replace 'db_home:\s+cygwin\s+desc', 'db_home: env windows cygwin desc'
            Copy-Item $nsswitchPath "$nsswitchPath.bak" -Force
            $newContent = $newContent -replace "`r`n", "`n"
            [System.IO.File]::WriteAllText($nsswitchPath, $newContent)
            Write-Host "  Fixed (backup at $nsswitchPath.bak)" -ForegroundColor Green
        } else {
            Write-Host "`nMSYS2 nsswitch.conf: already correct" -ForegroundColor DarkGray
        }
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
    Write-Host "`nPress Enter to exit..." -ForegroundColor Yellow
    Read-Host | Out-Null
}

# ============================================================================
# STOP LOGGING AND SHOW LOCATION
# ============================================================================

Stop-Transcript | Out-Null

Write-Host "`nInstallation log saved to:" -ForegroundColor Cyan
Write-Host "  $LogFile" -ForegroundColor White
Write-Host "`nPress Enter to close..." -ForegroundColor DarkGray

Read-Host | Out-Null
