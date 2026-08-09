# PowerShell CLI completion cache helpers
# =======================================
# Shared by install.ps1 and the PowerShell profile. Safe to source without side effects.

function Get-CompletionCacheDirectory {
    Join-Path $env:LOCALAPPDATA 'PowerShell\CompletionCache'
}

function Update-CompletionCache {
    <#
    .SYNOPSIS
        Regenerate cached CLI completions.
    #>
    param(
        [string]$CacheDirectory = (Get-CompletionCacheDirectory),
        [switch]$InstallerOutput
    )

    if (-not (Test-Path $CacheDirectory)) {
        New-Item -ItemType Directory -Path $CacheDirectory -Force | Out-Null
    }

    $tools = @(
        @{Name='kubectl'; Cmd='kubectl completion powershell'},
        @{Name='helm'; Cmd='helm completion powershell'},
        @{Name='gh'; Cmd='gh completion -s powershell'},
        @{Name='tailscale'; Cmd='tailscale completion powershell'}
    )

    foreach ($tool in $tools) {
        if (Get-Command $tool.Name -ErrorAction SilentlyContinue) {
            $message = if ($InstallerOutput) { "  Caching $($tool.Name)..." } else { "Caching $($tool.Name) completions..." }
            Write-Host $message -ForegroundColor Cyan -NoNewline:$InstallerOutput
            try {
                Invoke-Expression $tool.Cmd | Out-File (Join-Path $CacheDirectory "$($tool.Name).ps1") -Encoding utf8
                if ($InstallerOutput) {
                    Write-Host " done" -ForegroundColor Green
                }
            }
            catch {
                if ($InstallerOutput) {
                    Write-Host " failed" -ForegroundColor Red
                } else {
                    Write-Host "  Failed: $_" -ForegroundColor Red
                }
            }
        }
    }

    if (Get-Command zoxide -ErrorAction SilentlyContinue) {
        $message = if ($InstallerOutput) { '  Caching zoxide...' } else { 'Caching zoxide init...' }
        Write-Host $message -ForegroundColor Cyan -NoNewline:$InstallerOutput
        if ($InstallerOutput) {
            try {
                zoxide init powershell | Out-File (Join-Path $CacheDirectory 'zoxide.ps1') -Encoding utf8
                Write-Host " done" -ForegroundColor Green
            }
            catch {
                Write-Host " failed" -ForegroundColor Red
            }
        } else {
            zoxide init powershell | Out-File (Join-Path $CacheDirectory 'zoxide.ps1') -Encoding utf8
        }
    }
}
