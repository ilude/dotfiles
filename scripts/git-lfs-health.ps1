#Requires -Version 7.0
<#
.SYNOPSIS
Checks the repo's minimal Git LFS footprint and hook state.

.DESCRIPTION
Read-only by default. This repo currently uses Git LFS for patches/msys2-runtime/*.dll only. Use -InstallHooks to ask git-lfs to reinstall local LFS hooks after confirming git-lfs itself is responsive.
#>
[CmdletBinding()]
param(
    [switch]$InstallHooks,
    [int]$CommandTimeoutSeconds = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Stop-ProcessTree {
    param([int]$ProcessId)
    if ($IsWindows) {
        $taskkill = Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', [string]$ProcessId, '/T', '/F') -NoNewWindow -PassThru -WindowStyle Hidden
        $taskkill.WaitForExit(5000) | Out-Null
        return
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Invoke-BoundedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [int]$TimeoutSeconds = $CommandTimeoutSeconds,
        [string]$WorkingDirectory = (Get-Location).Path
    )

    $stdout = New-TemporaryFile
    $stderr = New-TemporaryFile
    try {
        $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -NoNewWindow -PassThru -RedirectStandardOutput $stdout.FullName -RedirectStandardError $stderr.FullName
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            Stop-ProcessTree -ProcessId $process.Id
            throw "$FilePath $($ArgumentList -join ' ') timed out after ${TimeoutSeconds}s"
        }
        [pscustomobject]@{
            ExitCode = $process.ExitCode
            Stdout = Get-Content $stdout.FullName -Raw
            Stderr = Get-Content $stderr.FullName -Raw
        }
    } finally {
        Remove-Item $stdout.FullName, $stderr.FullName -ErrorAction SilentlyContinue
    }
}

function Write-Section {
    param([string]$Title)
    Write-Output ""
    Write-Output "--- $Title ---"
}

Write-Section 'git-lfs executable'
$gitLfs = Get-Command git-lfs -ErrorAction Stop
Write-Output $gitLfs.Source
$version = Invoke-BoundedCommand -FilePath $gitLfs.Source -ArgumentList @('version') -WorkingDirectory $env:TEMP
if ($version.ExitCode -ne 0) {
    throw "git-lfs version failed: $($version.Stderr.Trim())"
}
Write-Output $version.Stdout.Trim()

Write-Section 'tracked lfs patterns'
$attributes = Get-Content .gitattributes -ErrorAction Stop
$lfsPatterns = @($attributes | Where-Object { $_ -match 'filter=lfs' })
$lfsPatterns
$expectedPattern = 'patches/msys2-runtime/*.dll filter=lfs diff=lfs merge=lfs -text'
if ($lfsPatterns -notcontains $expectedPattern) {
    throw "Expected LFS pattern missing: $expectedPattern"
}
if ($lfsPatterns.Count -ne 1) {
    throw "Unexpected extra LFS patterns: $($lfsPatterns -join '; ')"
}

Write-Section 'indexed lfs pointer'
$lfsPath = 'patches/msys2-runtime/msys-2.0.dll'
$pointer = Invoke-BoundedCommand -FilePath 'git' -ArgumentList @('cat-file', '-p', ":$lfsPath")
if ($pointer.ExitCode -ne 0) {
    throw "git cat-file failed for ${lfsPath}: $($pointer.Stderr.Trim())"
}
Write-Output $pointer.Stdout.Trim()
if ($pointer.Stdout -notmatch 'version https://git-lfs.github.com/spec/v1' -or $pointer.Stdout -notmatch 'oid sha256:') {
    throw "Expected indexed Git LFS pointer missing for $lfsPath"
}

Write-Section 'local lfs hooks'
$hookNames = @('pre-push', 'post-checkout', 'post-commit', 'post-merge')
$hookRows = foreach ($hookName in $hookNames) {
    $hookPath = Join-Path '.git/hooks' $hookName
    if (Test-Path $hookPath) {
        $containsLfs = (Get-Content $hookPath -Raw) -match 'git lfs'
        [pscustomobject]@{ Hook = $hookName; Exists = $true; ContainsGitLfs = $containsLfs; Path = $hookPath }
    } else {
        [pscustomobject]@{ Hook = $hookName; Exists = $false; ContainsGitLfs = $false; Path = $hookPath }
    }
}
$hookRows | Format-Table -AutoSize

if ($InstallHooks) {
    Write-Section 'install hooks'
    $install = Invoke-BoundedCommand -FilePath $gitLfs.Source -ArgumentList @('install', '--local') -TimeoutSeconds $CommandTimeoutSeconds
    Write-Output $install.Stdout.Trim()
    if ($install.ExitCode -ne 0) {
        throw "git-lfs install --local failed: $($install.Stderr.Trim())"
    }
}
