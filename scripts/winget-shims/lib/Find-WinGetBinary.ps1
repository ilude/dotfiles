function Find-WinGetBinary {
    param(
        [Parameter(Mandatory=$true)]
        [string]$PackageId,

        [Parameter(Mandatory=$true)]
        [string]$TargetExe,

        [Parameter(Mandatory=$false)]
        [string]$RelativePath
    )

    $packagesDir = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
    $pattern = Join-Path $packagesDir "${PackageId}_*"

    $matches = @(Get-Item -Path $pattern -ErrorAction SilentlyContinue)

    if ($matches.Count -eq 0) {
        return $null
    }

    if ($matches.Count -gt 1) {
        Write-Error "Found multiple package directories for ${PackageId}; using newest" -ErrorAction Continue
        $matches = @($matches | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
    }

    $packageDir = $matches[0].FullName

    if ($RelativePath) {
        $searchDir = Join-Path $packageDir $RelativePath
        if (Test-Path $searchDir) {
            $exe = Get-Item -Path (Join-Path $searchDir $TargetExe) -ErrorAction SilentlyContinue
            if ($exe) {
                return $exe.FullName
            }
        }
        return $null
    }

    $exe = Get-ChildItem -Path $packageDir -Filter $TargetExe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exe) {
        return $exe.FullName
    }

    return $null
}
