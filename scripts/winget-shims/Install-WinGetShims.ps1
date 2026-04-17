# Generates runtime-dynamic shims in ~/.local/bin for WinGet-managed commands.
# Safe to run multiple times (idempotent). Skips packages that are not installed.

#Requires -Version 5.1

. (Join-Path $PSScriptRoot "lib\Find-WinGetBinary.ps1")

# ---------------------------------------------------------------------------
# Parse registry.yaml via Python (PowerShell has no built-in YAML parser)
# ---------------------------------------------------------------------------

$registryPath = Join-Path $PSScriptRoot "registry.yaml"
if (-not (Test-Path $registryPath)) {
    Write-Error "registry.yaml not found at $registryPath"
    exit 1
}

$jsonText = Get-Content $registryPath -Raw | python -c "import yaml, json, sys; print(json.dumps(yaml.safe_load(sys.stdin)))"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to parse registry.yaml -- is Python with PyYAML installed?"
    exit 1
}

$registry = $jsonText | ConvertFrom-Json

# ---------------------------------------------------------------------------
# Ensure ~/.local/bin exists
# ---------------------------------------------------------------------------

$shimDir = Join-Path $env:USERPROFILE ".local\bin"
if (-not (Test-Path $shimDir)) {
    New-Item -ItemType Directory -Path $shimDir -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Prepend shimDir to user-scope PATH (idempotent)
# ---------------------------------------------------------------------------

$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$userEntries = $userPath -split ";" | Where-Object { $_.TrimEnd('\') -ne $shimDir.TrimEnd('\') -and $_ -ne "" }
$newUserPath = ($shimDir + ";" + ($userEntries -join ";")).TrimEnd(";")
if ($newUserPath -ne $userPath) {
    [Environment]::SetEnvironmentVariable("PATH", $newUserPath, "User")
    Write-Host "  Ensured $shimDir is first in User PATH" -ForegroundColor Cyan
}

$procEntries = $env:PATH -split ";" | Where-Object { $_.TrimEnd('\') -ne $shimDir.TrimEnd('\') -and $_ -ne "" }
$env:PATH = ($shimDir + ";" + ($procEntries -join ";")).TrimEnd(";")

# ---------------------------------------------------------------------------
# Git Bash path for chmod
# ---------------------------------------------------------------------------

$gitBash = "C:\Program Files\Git\bin\bash.exe"
$hasGitBash = Test-Path $gitBash

# ---------------------------------------------------------------------------
# Generate shims
# ---------------------------------------------------------------------------

foreach ($pkg in $registry) {
    $packageId = $pkg.package_id

    foreach ($cmd in $pkg.commands) {
        $commandName  = $cmd.command_name
        $targetExe    = $cmd.target_exe
        $relativePath = if ($cmd.relative_path) { $cmd.relative_path } else { "" }

        # ------------------------------------------------------------------
        # Build bash shim content via concatenation (avoids here-string $() evaluation)
        # ------------------------------------------------------------------

        if ($relativePath) {
            $bashFindCall = 'find_winget_binary "' + $packageId + '" "' + $targetExe + '" "' + $relativePath + '"'
        } else {
            $bashFindCall = 'find_winget_binary "' + $packageId + '" "' + $targetExe + '"'
        }

        $nl = "`n"
        $bashContent  = '#!/usr/bin/env bash' + $nl
        $bashContent += 'source "$HOME/.dotfiles/scripts/winget-shims/lib/find-winget-binary.sh"' + $nl
        $bashContent += '_bin=$(' + $bashFindCall + ')' + $nl
        $bashContent += 'if [ -z "$_bin" ]; then' + $nl
        $bashContent += '    echo "shim: could not resolve ' + $commandName + ' -- is ' + $packageId + ' installed?" >&2' + $nl
        $bashContent += '    exit 127' + $nl
        $bashContent += 'fi' + $nl
        $bashContent += 'exec "$_bin" "$@"' + $nl

        # ------------------------------------------------------------------
        # Build batch shim content
        # Resolves the binary path inline via FOR/F and calls it directly
        # with %* so arguments bypass PowerShell's parameter parser entirely.
        # ------------------------------------------------------------------

        if ($relativePath) {
            $psFind = "Find-WinGetBinary '$packageId' '$targetExe' '$relativePath'"
        } else {
            $psFind = "Find-WinGetBinary '$packageId' '$targetExe'"
        }
        $psCommand = '"& { . ''%USERPROFILE%\.dotfiles\scripts\winget-shims\lib\Find-WinGetBinary.ps1''; ' + $psFind + ' }"'

        $crlf = "`r`n"
        $batContent  = '@setlocal disabledelayedexpansion' + $crlf
        $batContent += '@for /f "usebackq delims=" %%b in (`pwsh.exe -NoProfile -NonInteractive -Command ' + $psCommand + '`) do @set "_bin=%%b"' + $crlf
        $batContent += '@if not defined _bin (echo shim: could not resolve ' + $commandName + ' >&2 & exit /b 127)' + $crlf
        $batContent += '@"%_bin%" %*' + $crlf
        $batContent += '@exit /b %ERRORLEVEL%' + $crlf

        # ------------------------------------------------------------------
        # Write bash shim (LF line endings, no extension)
        # ------------------------------------------------------------------

        $bashShimPath = Join-Path $shimDir $commandName
        [System.IO.File]::WriteAllText($bashShimPath, $bashContent, (New-Object System.Text.UTF8Encoding $false))

        # ------------------------------------------------------------------
        # Write batch shim
        # ------------------------------------------------------------------

        $batShimPath = Join-Path $shimDir "$commandName.bat"
        [System.IO.File]::WriteAllText($batShimPath, $batContent, (New-Object System.Text.UTF8Encoding $false))

        # ------------------------------------------------------------------
        # chmod +x bash shim
        # ------------------------------------------------------------------

        if ($hasGitBash) {
            $posixPath = "/c/Users/$env:USERNAME/.local/bin/$commandName"
            & $gitBash -c "chmod +x '$posixPath'" 2>$null
        }

        # ------------------------------------------------------------------
        # Resolve binary and print status
        # ------------------------------------------------------------------

        $resolvedParams = @{ PackageId = $packageId; TargetExe = $targetExe }
        if ($relativePath) { $resolvedParams.RelativePath = $relativePath }
        $resolvedPath = Find-WinGetBinary @resolvedParams

        if ($resolvedPath) {
            Write-Host "[OK]   $commandName -> $resolvedPath" -ForegroundColor Green
        } else {
            Write-Host "[SKIP] $commandName -> package not installed" -ForegroundColor Yellow
        }
    }
}
