<#
.SYNOPSIS
    Install patched msys-2.0.dll to fix add_item race condition.

.DESCRIPTION
    Replaces Git for Windows' msys-2.0.dll with a patched version that
    fixes the shared memory race condition in mount table initialization.
    Creates a backup of the original DLL before replacing.

    The patch adds MOUNT_OVERRIDE to create_root_entry() and uses the
    CreateFileMappingW 'created' flag to gate initialization in
    user_info::create().

    PR: https://github.com/msys2/msys2-runtime/pull/333
    Built from: Cygwin 3.6.7 + MSYS2 patches

.PARAMETER Uninstall
    Restore the original msys-2.0.dll from backup.

.PARAMETER Force
    Skip confirmation prompt.
#>
param(
    [switch]$Uninstall,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$gitDir = "C:\Program Files\Git"
$targetDll = "$gitDir\usr\bin\msys-2.0.dll"
$backupDll = "$gitDir\usr\bin\msys-2.0.dll.patched-backup"
$patchedDll = Join-Path $PSScriptRoot "msys-2.0.dll"

# Verify Git for Windows exists
if (-not (Test-Path $targetDll)) {
    Write-Error "Git for Windows not found at $gitDir"
    exit 1
}

# Verify patched DLL exists
if (-not $Uninstall -and -not (Test-Path $patchedDll)) {
    Write-Error "Patched DLL not found at $patchedDll"
    exit 1
}

# Check for admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Elevating to admin..." -ForegroundColor Yellow
    $args = @('-NoProfile', '-File', $MyInvocation.MyCommand.Path)
    if ($Uninstall) { $args += '-Uninstall' }
    if ($Force) { $args += '-Force' }
    Start-Process pwsh -ArgumentList $args -Verb RunAs -Wait
    exit
}

# Kill MSYS2/Git processes that hold the DLL
$procs = Get-Process | Where-Object { $_.Path -like "$gitDir*" }
if ($procs.Count -gt 0) {
    Write-Host "Stopping $($procs.Count) Git/MSYS2 processes..." -ForegroundColor Yellow
    $procs | Stop-Process -Force
    Start-Sleep -Seconds 2
}

if ($Uninstall) {
    if (-not (Test-Path $backupDll)) {
        Write-Error "No backup found at $backupDll - cannot restore"
        exit 1
    }
    $backupSize = (Get-Item $backupDll).Length
    Write-Host "Restoring original DLL ($backupSize bytes)..." -ForegroundColor Yellow
    Copy-Item $backupDll $targetDll -Force
    Remove-Item $backupDll -Force
    Write-Host "Original msys-2.0.dll restored." -ForegroundColor Green
    exit 0
}

# Show what we're doing
$currentSize = (Get-Item $targetDll).Length
$patchedSize = (Get-Item $patchedDll).Length
Write-Host "`nmsys-2.0.dll patch installer" -ForegroundColor Cyan
Write-Host "  Current: $currentSize bytes ($targetDll)"
Write-Host "  Patched: $patchedSize bytes ($patchedDll)"
Write-Host "  PR: https://github.com/msys2/msys2-runtime/pull/333"

if ($currentSize -eq $patchedSize) {
    Write-Host "`nPatched DLL already installed." -ForegroundColor Green
    exit 0
}

if (-not $Force) {
    $confirm = Read-Host "`nInstall patched DLL? [y/N]"
    if ($confirm -ne 'y') {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Backup original
if (-not (Test-Path $backupDll)) {
    Copy-Item $targetDll $backupDll -Force
    Write-Host "  Backed up original to $backupDll" -ForegroundColor DarkGray
}

# Install patched DLL
Copy-Item $patchedDll $targetDll -Force
$newSize = (Get-Item $targetDll).Length
Write-Host "`nPatched DLL installed ($newSize bytes)." -ForegroundColor Green
Write-Host "To restore: $($MyInvocation.MyCommand.Path) -Uninstall" -ForegroundColor DarkGray
