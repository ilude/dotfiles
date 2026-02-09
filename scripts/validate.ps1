#Requires -Version 5.1

<#
.SYNOPSIS
    Validate dotfiles environment and configuration.

.DESCRIPTION
    Checks system environment, required tools, and Git configuration.
    Reports pass/fail/warn status for each check.

.EXAMPLE
    pwsh -NoProfile -File validate.ps1
#>

[CmdletBinding()]
param()

# Setup logging
$LogsDir = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile = Join-Path $LogsDir "validation_pwsh_$Timestamp.log"

# Start transcript to log file
Start-Transcript -Path $LogFile -Force | Out-Null

# Initialize counters
$script:PassCount = 0
$script:FailCount = 0
$script:WarnCount = 0

# Helper functions for output
function Write-Pass {
    param([string]$msg)
    Write-Host "  ✓ $msg" -ForegroundColor Green
    $script:PassCount++
}

function Write-Fail {
    param([string]$msg)
    Write-Host "  ✗ $msg" -ForegroundColor Red
    $script:FailCount++
}

function Write-Warn {
    param([string]$msg)
    Write-Host "  ⚠ $msg (optional)" -ForegroundColor Yellow
    $script:WarnCount++
}

function Write-Info {
    param([string]$msg, [string]$val)
    Write-Host "  ℹ ${msg}: $val" -ForegroundColor Blue
}

function Write-Section {
    param([string]$msg)
    Write-Host "`n=== $msg ===" -ForegroundColor Cyan
}

# Test a condition and write pass/fail
function Test-Check {
    param(
        [string]$Description,
        [scriptblock]$Condition
    )

    try {
        $result = & $Condition
        if ($result) {
            Write-Pass $Description
        } else {
            Write-Fail $Description
        }
    } catch {
        Write-Fail "$Description (error: $($_.Exception.Message))"
    }
}

# Test a condition and write pass/warn
function Test-CheckWarn {
    param(
        [string]$Description,
        [scriptblock]$Condition
    )

    try {
        $result = & $Condition
        if ($result) {
            Write-Pass $Description
        } else {
            Write-Warn $Description
        }
    } catch {
        Write-Warn "$Description (error: $($_.Exception.Message))"
    }
}

# ============================================================================
# Environment Variables
# ============================================================================

Write-Section "Environment"

Test-Check "HOME is set" { [string]::IsNullOrEmpty($env:HOME) -eq $false }
if (-not [string]::IsNullOrEmpty($env:HOME)) {
    Write-Info "HOME" $env:HOME
}

Test-Check "USERPROFILE is set" { [string]::IsNullOrEmpty($env:USERPROFILE) -eq $false }
if (-not [string]::IsNullOrEmpty($env:USERPROFILE)) {
    Write-Info "USERPROFILE" $env:USERPROFILE
}

Test-Check "PATH is set" { [string]::IsNullOrEmpty($env:PATH) -eq $false }
$pathCount = ($env:PATH -split ';' | Where-Object { $_ }).Count
if ($pathCount -gt 0) {
    Write-Info "PATH entries" $pathCount
}

Test-CheckWarn "EDITOR is set" { [string]::IsNullOrEmpty($env:EDITOR) -eq $false }
if (-not [string]::IsNullOrEmpty($env:EDITOR)) {
    Write-Info "EDITOR" $env:EDITOR
}

# ============================================================================
# Required Tools
# ============================================================================

Write-Section "Tools"

# Git
Test-Check "git is available" {
    $null = Get-Command git -ErrorAction Stop
    $true
}

if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVersion = (git --version 2>$null) -replace '^git version ', ''
    Write-Info "git version" $gitVersion
}

# PowerShell
Test-Check "pwsh is available" {
    $null = Get-Command pwsh -ErrorAction Stop
    $true
}

if (Get-Command pwsh -ErrorAction SilentlyContinue) {
    $pwshVersion = (pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()' 2>$null)
    Write-Info "pwsh version" $pwshVersion
}

# VS Code
Test-CheckWarn "code (VS Code) is available" {
    $null = Get-Command code -ErrorAction Stop
    $true
}

# ============================================================================
# Git Configuration
# ============================================================================

Write-Section "Git Configuration"

# Check git user.name
Test-Check "git user.name is set" {
    $name = git config --get user.name 2>$null
    [string]::IsNullOrEmpty($name) -eq $false
}

if (git config --get user.name 2>$null) {
    Write-Info "git user.name" (git config --get user.name)
}

# Check git user.email
Test-Check "git user.email is set" {
    $email = git config --get user.email 2>$null
    [string]::IsNullOrEmpty($email) -eq $false
}

if (git config --get user.email 2>$null) {
    Write-Info "git user.email" (git config --get user.email)
}

# Check git core.autocrlf
Test-CheckWarn "git core.autocrlf is configured" {
    $value = git config --get core.autocrlf 2>$null
    [string]::IsNullOrEmpty($value) -eq $false
}

if (git config --get core.autocrlf 2>$null) {
    Write-Info "git core.autocrlf" (git config --get core.autocrlf)
}

# ============================================================================
# Dotfiles Configuration
# ============================================================================

Write-Section "Dotfiles"

# Check if .dotfiles directory exists
Test-Check ".dotfiles directory exists" {
    Test-Path -Path "$env:HOME/.dotfiles" -PathType Container
}

if (Test-Path -Path "$env:HOME/.dotfiles" -PathType Container) {
    Write-Info ".dotfiles location" "$env:HOME/.dotfiles"

    # Check for key files
    Test-Check "install.conf.yaml exists" {
        Test-Path -Path "$env:HOME/.dotfiles/install.conf.yaml" -PathType Leaf
    }

    Test-Check "install.ps1 exists" {
        Test-Path -Path "$env:HOME/.dotfiles/install.ps1" -PathType Leaf
    }
}

# ============================================================================
# Summary
# ============================================================================

Write-Section "Summary"

$total = $script:PassCount + $script:FailCount + $script:WarnCount
Write-Host "  Passed: " -NoNewline
Write-Host $script:PassCount -ForegroundColor Green

if ($script:WarnCount -gt 0) {
    Write-Host "  Warnings: " -NoNewline
    Write-Host $script:WarnCount -ForegroundColor Yellow
}

if ($script:FailCount -gt 0) {
    Write-Host "  Failed: " -NoNewline
    Write-Host $script:FailCount -ForegroundColor Red
}

Write-Host "  Total: $total`n"

# Determine exit code
if ($script:FailCount -gt 0) {
    $exitCode = 1
} else {
    $exitCode = 0
}

# Stop transcript and show log location
Stop-Transcript | Out-Null
Write-Host ""
Write-Host "Validation log saved to: $LogFile" -ForegroundColor Cyan

# Exit with error code if there are failures
exit $exitCode
