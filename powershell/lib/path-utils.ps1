# Path Utility Functions
# ======================
# Pure functions for path conversion and file handling.
# Extracted for testability - no side effects when sourced.

function Get-ContentLF {
    <#
    .SYNOPSIS
        Read file content with LF line endings.
    .DESCRIPTION
        Reads a file and normalizes line endings to LF for cross-platform compatibility.
        Converts both CRLF and standalone CR to LF.
    .PARAMETER Path
        Path to the file to read.
    .EXAMPLE
        Get-ContentLF "C:\path\to\file.txt"
    #>
    param([string]$Path)
    (Get-Content $Path -Raw) -replace "`r`n", "`n" -replace "`r", "`n"
}

function ConvertTo-GitBashPath {
    <#
    .SYNOPSIS
        Convert Windows path to Git Bash format.
    .DESCRIPTION
        Converts Windows-style paths (C:\path) to Git Bash format (/c/path).
        Non-Windows paths are returned unchanged.
    .PARAMETER Path
        Windows path to convert.
    .EXAMPLE
        ConvertTo-GitBashPath "C:\Users\test" # Returns /c/Users/test
    #>
    param([string]$Path)
    $path = $Path -replace '\\', '/'
    if ($path -match '^([A-Za-z]):(.*)') {
        return '/' + $matches[1].ToLower() + $matches[2]
    }
    return $path
}

function Get-PathWithEntryBefore {
    <#
    .SYNOPSIS
        Put one PATH entry before another while preserving all other entries.
    .DESCRIPTION
        Removes duplicate occurrences of the preferred entry, then inserts its
        canonical value before the first matching anchor. If the anchor is not
        present, the preferred entry is prepended.
    #>
    param(
        [string]$Path,
        [Parameter(Mandatory)][string]$Entry,
        [Parameter(Mandatory)][string]$Before
    )

    function Normalize-PathEntry {
        param([string]$Value)
        if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
        $expanded = [Environment]::ExpandEnvironmentVariables($Value.Trim())
        return $expanded.TrimEnd('\', '/').ToLowerInvariant()
    }

    $entryNormalized = Normalize-PathEntry $Entry
    $beforeNormalized = Normalize-PathEntry $Before
    $entries = @($Path -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $remaining = @($entries | Where-Object { (Normalize-PathEntry $_) -ne $entryNormalized })

    $result = @()
    $inserted = $false
    foreach ($pathEntry in $remaining) {
        if (-not $inserted -and (Normalize-PathEntry $pathEntry) -eq $beforeNormalized) {
            $result += $Entry
            $inserted = $true
        }
        $result += $pathEntry
    }

    if (-not $inserted) {
        $result = @($Entry) + $result
    }

    return $result -join ';'
}

function Get-GitBash {
    <#
    .SYNOPSIS
        Find Git Bash executable.
    .DESCRIPTION
        Searches common installation locations for Git Bash.
        Falls back to PATH search if not found in standard locations.
    .EXAMPLE
        $bash = Get-GitBash
        & $bash -c "echo hello"
    #>
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
    # Fallback to searching PATH - filter out WSL bash, we want Git Bash
    $cmd = Get-Command bash -All -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -notmatch 'wsl|WindowsApps|System32\\bash\.exe$' } |
        Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    return $null
}

function ConvertTo-WSLPath {
    <#
    .SYNOPSIS
        Convert Windows path to WSL format.
    .DESCRIPTION
        Converts Windows-style paths (C:\path) to WSL format (/mnt/c/path).
        Non-Windows paths are returned unchanged.
    .PARAMETER Path
        Windows path to convert.
    .EXAMPLE
        ConvertTo-WSLPath "C:\Users\test" # Returns /mnt/c/Users/test
    #>
    param([string]$Path)
    $path = $Path -replace '\\', '/'
    if ($path -match '^([A-Za-z]):(.*)') {
        return '/mnt/' + $matches[1].ToLower() + $matches[2]
    }
    return $path
}
