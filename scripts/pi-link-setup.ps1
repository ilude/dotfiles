# Native Windows junction setup. Called by pi-link-setup with paths as arguments.
[CmdletBinding()]
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot),
    [string]$HomePath = $env:USERPROFILE
)

$ErrorActionPreference = 'Stop'
# Prefer Windows' native tar over an inherited MSYS tar, which treats drive
# letters in archive paths as remote-host syntax. This affects only this process.
$env:PATH = (Join-Path $env:SystemRoot 'System32') + ';' + $env:PATH

function Backup-AgentDirectory([string]$Source, [string]$HomeDirectory) {
    $backupName = 'pi-agent-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    if (Get-Command 7z -ErrorAction SilentlyContinue) {
        $archive = Join-Path $HomeDirectory "$backupName.7z"
        & 7z a -mx=5 $archive $Source *> $null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Backup created: $archive"
            return
        }
    }
    $archive = Join-Path $HomeDirectory "$backupName.tar.gz"
    & tar -czf $archive -C (Split-Path -Parent $Source) (Split-Path -Leaf $Source) *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to create backup archive; agent directory preserved'
    }
    Write-Host "Backup created: $archive"
}

try {
    if (-not $HomePath) { throw 'HOME or USERPROFILE is required' }
    $source = [IO.Path]::GetFullPath((Join-Path $Root 'pi/profiles/default'))
    $target = [IO.Path]::GetFullPath((Join-Path $HomePath '.pi/agent'))
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Source directory not found: $source"
    }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
    # Get-Item inspects the junction itself, including a dangling junction.
    $item = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    if ($item) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            $linkTarget = $item.Target
            if ($linkTarget) {
                if (-not [IO.Path]::IsPathRooted($linkTarget)) {
                    $linkTarget = Join-Path (Split-Path -Parent $target) $linkTarget
                }
                if ([IO.Path]::GetFullPath($linkTarget).TrimEnd('\', '/') -ieq $source.TrimEnd('\', '/')) {
                    Write-Host '~/.pi/agent: Already linked correctly'
                    exit 0
                }
            }
            # Delete only the reparse-point object, never recurse into its target.
            if ($item.PSIsContainer) { [IO.Directory]::Delete($target) }
            else { [IO.File]::Delete($target) }
        } elseif ($item.PSIsContainer) {
            Backup-AgentDirectory $target $HomePath
            [IO.Directory]::Delete($target, $true)
        } else {
            throw "Agent path is not a directory or link: $target"
        }
    }
    # PowerShell's Junction provider uses the native Windows reparse-point APIs.
    New-Item -ItemType Junction -Path $target -Target $source | Out-Null
    Write-Host "~/.pi/agent: Junction created -> $source"
    exit 0
} catch {
    Write-Error -ErrorRecord $_ -ErrorAction Continue
    exit 1
}
