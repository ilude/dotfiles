---
name: powershell-workflow
description: PowerShell scripting for Windows automation, package management, and system configuration. Covers script structure, elevation, winget, error handling, and cross-shell integration. Activate when working with .ps1 files, PowerShell scripts, winget, or Windows system automation.
---

# PowerShell Workflow

PowerShell scripting patterns for Windows automation and system configuration.

## Script Structure

### Basic Template

```powershell
#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$Verbose,
    [string]$ConfigPath = "$HOME\.config"
)

$ErrorActionPreference = "Stop"

function Main {
    Write-Host "Starting script..."

    # Script logic here

    Write-Host "Done."
}

Main
```

### With Help

```powershell
<#
.SYNOPSIS
    Brief description of script.

.DESCRIPTION
    Longer description of what the script does.

.PARAMETER Force
    Skip confirmation prompts.

.EXAMPLE
    .\script.ps1 -Force
    Run without prompts.
#>
[CmdletBinding()]
param(
    [switch]$Force
)
```

---

## Elevation (Run as Admin)

### Check If Elevated

```powershell
function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
```

### Self-Elevate

```powershell
if (-not (Test-IsAdmin)) {
    Write-Host "Requesting administrator privileges..."

    $arguments = @(
        "-NoProfile"
        "-ExecutionPolicy", "Bypass"
        "-File", "`"$PSCommandPath`""
    )

    # Pass through original arguments
    $arguments += $args

    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait
    exit $LASTEXITCODE
}

# Now running as admin
Write-Host "Running with administrator privileges"
```

### Elevation with Output Capture

```powershell
if (-not (Test-IsAdmin)) {
    # Create temp file for output
    $outputFile = [System.IO.Path]::GetTempFileName()

    $arguments = @(
        "-NoProfile"
        "-ExecutionPolicy", "Bypass"
        "-File", "`"$PSCommandPath`""
        "-OutputFile", "`"$outputFile`""
    )

    $process = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru

    # Display captured output
    if (Test-Path $outputFile) {
        Get-Content $outputFile
        Remove-Item $outputFile -Force
    }

    exit $process.ExitCode
}
```

---

## Package Management (winget)

### Check winget Available

```powershell
function Test-WingetAvailable {
    try {
        $null = Get-Command winget -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}
```

### Install Package

```powershell
function Install-WingetPackage {
    param(
        [Parameter(Mandatory)]
        [string]$PackageId,
        [string]$Source = "winget"
    )

    # Check if already installed
    $installed = winget list --id $PackageId --source $Source 2>$null
    if ($installed -match $PackageId) {
        Write-Host "Already installed: $PackageId"
        return
    }

    Write-Host "Installing: $PackageId"
    winget install --id $PackageId --source $Source --silent --accept-package-agreements --accept-source-agreements
}
```

### Install Multiple Packages

```powershell
$packages = @(
    "Git.Git"
    "Microsoft.VisualStudioCode"
    "Microsoft.WindowsTerminal"
    "Python.Python.3.12"
)

foreach ($package in $packages) {
    Install-WingetPackage -PackageId $package
}
```

### Package Lists by Category

```powershell
$corePackages = @(
    "Git.Git"
    "Microsoft.PowerShell"
)

$devPackages = @(
    "Microsoft.VisualStudioCode"
    "Docker.DockerDesktop"
)

$workPackages = @(
    "Amazon.AWSCLI"
    "Hashicorp.Terraform"
)

# Install based on flags
if ($Dev) { $corePackages += $devPackages }
if ($Work) { $corePackages += $workPackages }
```

---

## Error Handling

### Try/Catch

```powershell
try {
    # Risky operation
    Remove-Item $path -Recurse -Force -ErrorAction Stop
} catch {
    Write-Error "Failed to remove $path: $_"
    exit 1
}
```

### ErrorAction Preferences

```powershell
# Stop on any error (strict)
$ErrorActionPreference = "Stop"

# Continue on error (log and proceed)
$ErrorActionPreference = "Continue"

# Per-command override
Get-Item "nonexistent" -ErrorAction SilentlyContinue
```

### Validate Before Action

```powershell
function Remove-SafePath {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        Write-Verbose "Path does not exist: $Path"
        return
    }

    if ($Path -eq $HOME -or $Path -eq "C:\") {
        throw "Refusing to delete protected path: $Path"
    }

    Remove-Item $Path -Recurse -Force
}
```

---

## File Operations

### Create Symlink/Junction

```powershell
function New-Link {
    param(
        [Parameter(Mandatory)]
        [string]$Target,
        [Parameter(Mandatory)]
        [string]$Link,
        [switch]$Junction  # For directories without admin
    )

    if (Test-Path $Link) {
        Write-Host "Already exists: $Link"
        return
    }

    $parentDir = Split-Path $Link -Parent
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }

    if ($Junction) {
        # Junction doesn't require admin (directories only)
        cmd /c mklink /J "`"$Link`"" "`"$Target`"" | Out-Null
    } else {
        # Symlink requires admin
        New-Item -ItemType SymbolicLink -Path $Link -Target $Target | Out-Null
    }

    Write-Host "Created link: $Link -> $Target"
}
```

### Copy with Backup

```powershell
function Copy-WithBackup {
    param(
        [string]$Source,
        [string]$Destination
    )

    if (Test-Path $Destination) {
        $backup = "$Destination.bak"
        Move-Item $Destination $backup -Force
        Write-Host "Backed up: $Destination -> $backup"
    }

    Copy-Item $Source $Destination -Force
}
```

---

## Environment Variables

### Set for Current Session

```powershell
$env:MY_VAR = "value"
```

### Set Permanently (User)

```powershell
[Environment]::SetEnvironmentVariable("MY_VAR", "value", "User")
```

### Add to PATH

```powershell
function Add-ToPath {
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [ValidateSet("User", "Machine")]
        [string]$Scope = "User"
    )

    $currentPath = [Environment]::GetEnvironmentVariable("PATH", $Scope)

    if ($currentPath -split ";" -contains $Path) {
        Write-Host "Already in PATH: $Path"
        return
    }

    $newPath = "$currentPath;$Path"
    [Environment]::SetEnvironmentVariable("PATH", $newPath, $Scope)

    # Update current session
    $env:PATH = "$env:PATH;$Path"

    Write-Host "Added to PATH: $Path"
}
```

---

## WSL Integration

### Check WSL Installed

```powershell
function Test-WslInstalled {
    try {
        $null = Get-Command wsl -ErrorAction Stop
        $distros = wsl --list --quiet 2>$null
        return ($null -ne $distros)
    } catch {
        return $false
    }
}
```

### Run Command in WSL

```powershell
function Invoke-WslCommand {
    param(
        [Parameter(Mandatory)]
        [string]$Command,
        [string]$Distribution
    )

    if ($Distribution) {
        wsl -d $Distribution -- bash -c $Command
    } else {
        wsl -- bash -c $Command
    }
}

# Usage
Invoke-WslCommand "cd ~/.dotfiles && ./install"
```

### Install WSL

```powershell
function Install-Wsl {
    param([string]$Distribution = "Ubuntu")

    if (-not (Test-IsAdmin)) {
        throw "WSL installation requires administrator privileges"
    }

    # Enable WSL feature
    dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
    dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

    # Set WSL 2 as default
    wsl --set-default-version 2

    # Install distribution
    wsl --install -d $Distribution
}
```

---

## User Interaction

### Confirmation Prompt

```powershell
function Confirm-Action {
    param([string]$Message = "Continue?")

    $response = Read-Host "$Message (y/N)"
    return $response -eq "y" -or $response -eq "Y"
}

# Usage
if (Confirm-Action "Delete all files?") {
    Remove-Item * -Force
}
```

### Press Any Key

```powershell
function Wait-ForKey {
    param([string]$Message = "Press any key to continue...")

    Write-Host $Message
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# At end of script (keeps window open)
if ($Host.Name -eq "ConsoleHost") {
    Wait-ForKey
}
```

### Progress Display

```powershell
$items = Get-ChildItem
$total = $items.Count
$current = 0

foreach ($item in $items) {
    $current++
    $percent = [math]::Round(($current / $total) * 100)
    Write-Progress -Activity "Processing" -Status "$current of $total" -PercentComplete $percent

    # Process item...
}

Write-Progress -Activity "Processing" -Completed
```

---

## Script Arguments

### Switch Parameters

```powershell
param(
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Work
)

if ($DryRun) {
    Write-Host "[DRY RUN] Would install packages"
} else {
    # Actually install
}
```

### List Packages Mode

```powershell
param(
    [switch]$ListPackages
)

$packages = @{
    "Core" = @("Git.Git", "Microsoft.PowerShell")
    "Dev" = @("Docker.DockerDesktop", "Microsoft.VisualStudioCode")
    "Work" = @("Amazon.AWSCLI", "Hashicorp.Terraform")
}

if ($ListPackages) {
    foreach ($category in $packages.Keys) {
        Write-Host "`n$category packages:"
        $packages[$category] | ForEach-Object { Write-Host "  - $_" }
    }
    exit 0
}
```

---

## Common Patterns

### Idempotent Operations

```powershell
# Create directory if not exists
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

# Create file if not exists
if (-not (Test-Path $configFile)) {
    Set-Content $configFile $defaultContent
}

# Add line if not present
$content = Get-Content $file -Raw
if ($content -notmatch "pattern") {
    Add-Content $file "new line"
}
```

### Lock File Pattern

```powershell
$lockFile = "$HOME\.myapp.lock"

if (Test-Path $lockFile) {
    Write-Host "Already configured. Use -Force to reconfigure."
    if (-not $Force) { exit 0 }
}

# Do configuration...

# Mark as complete
Set-Content $lockFile (Get-Date -Format "o")
```

---

## Execution Policy

### Check Current Policy

```powershell
Get-ExecutionPolicy -List
```

### Run Script Bypassing Policy

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\script.ps1
```

### Set Policy (Admin Required)

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```
