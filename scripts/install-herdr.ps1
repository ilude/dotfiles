#Requires -Version 7.0
<#
.SYNOPSIS
Installs the pinned Herdr Windows preview and configures PowerShell 7.

.DESCRIPTION
Performs a first-time, per-user Herdr installation on 64-bit Windows. The
release archive and every installed file are checked against pinned SHA-256
digests. Existing conflicting installation or configuration state is not
modified.

Use -WhatIf to preview mutations without downloading or installing Herdr.
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$HerdrBuildId = '2026-08-04-d78e3d3b5126'
$HerdrVersionIdentity = '0.8.0-preview.2026-08-04-d78e3d3b5126'
$HerdrArchiveSha256 = 'b1d288118848ecd3ef33532a34506edc53a38a416057aee5b7fe1de4188a16fc'
$HerdrArchiveUri = "https://github.com/herdrdev/herdr/releases/download/preview-$HerdrBuildId/herdr-windows-x86_64.zip"
$HerdrTargetTriple = 'x86_64-pc-windows-msvc'
$HerdrFileHashes = @{
    'conpty/arm64/OpenConsole.exe' = 'ed7622fd0d3bedc9ab9f122f5e58edf0def9e7999224f52dd395ba9f54edbe09'
    'conpty/conpty.dll' = '39fba2713e2495117b1591ae8c32a3b904bea7aa66069cf7815e2844c76d75d8'
    'conpty/herdr-conpty.json' = 'c8f499ad82c568e737d6bc7d0b583e3785d2f43af3d2c0cebb856076690533f5'
    'conpty/x64/OpenConsole.exe' = 'b7fd936c2668b87b9ecf7b3366dc6568afc1c6f981874cba3e955a1c35cf8160'
    'herdr.exe' = '6f470da358d6713b6bebab922ffb1f5fe1d3d288cc6f374c7dca1b4a9837a542'
    'THIRD-PARTY-NOTICES/Microsoft.Windows.Console.ConPTY-LICENSE.txt' = '5d177f23ecfeb0ea8e050b6a5a16355e1ae9a0b286436ca8f83ed08b3795be6b'
    'THIRD-PARTY-NOTICES/Microsoft.Windows.Console.ConPTY-NOTICE.md' = 'e7fbaadee6ab20c28b87730a510ee5f5815d8fb4bd88d1d54d282dc2a74c0726'
}

function Get-FileSystemEntry {
    param([Parameter(Mandatory)][string]$Path)

    $entry = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -ne $entry) {
        return $entry
    }

    $parent = Split-Path -Parent $Path
    $name = Split-Path -Leaf $Path
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        return $null
    }
    return Get-ChildItem -LiteralPath $parent -Force |
        Where-Object Name -CEQ $name |
        Select-Object -First 1
}

function Assert-NoReparsePointAncestor {
    param([Parameter(Mandatory)][string]$Path)

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $currentPath = [System.IO.Path]::GetPathRoot($fullPath)
    $relativePath = $fullPath.Substring($currentPath.Length)

    foreach ($segment in $relativePath.Split('\', [System.StringSplitOptions]::RemoveEmptyEntries)) {
        $currentPath = Join-Path $currentPath $segment
        $entry = Get-FileSystemEntry -Path $currentPath
        if ($null -eq $entry) {
            break
        }
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Refusing to manage a path below reparse point $currentPath."
        }
    }
}

function Test-HerdrPackage {
    param([Parameter(Mandatory)][string]$PackageDirectory)

    if (-not (Test-Path -LiteralPath $PackageDirectory -PathType Container)) {
        return $false
    }

    $reparseEntries = @(Get-ChildItem -LiteralPath $PackageDirectory -Force -Recurse | Where-Object {
            $_.Attributes -band [IO.FileAttributes]::ReparsePoint
        })
    if ($reparseEntries.Count -gt 0) {
        return $false
    }

    foreach ($relativePath in $HerdrFileHashes.Keys) {
        $path = Join-Path $PackageDirectory $relativePath.Replace('/', '\')
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            return $false
        }
        $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -cne $HerdrFileHashes[$relativePath]) {
            return $false
        }
    }
    return $true
}

function New-HerdrJunction {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$LinkPath,
        [Parameter(Mandatory)][string]$TargetPath
    )

    $targetFullPath = [System.IO.Path]::GetFullPath($TargetPath).TrimEnd('\')
    $entry = Get-FileSystemEntry -Path $LinkPath
    if ($null -ne $entry) {
        if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $entry.LinkType -eq 'Junction') {
            $existingTarget = [System.IO.Path]::GetFullPath([string]$entry.Target).TrimEnd('\')
            if ($existingTarget.Equals($targetFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
                return
            }
        }
        throw "Refusing to replace existing path at $LinkPath."
    }

    if (-not $PSCmdlet.ShouldProcess($LinkPath, "Create junction to $targetFullPath")) {
        return
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $LinkPath) -Force | Out-Null
    New-Item -ItemType Junction -Path $LinkPath -Target $targetFullPath | Out-Null
}

function Add-UserPathEntry {
    param([Parameter(Mandatory)][string]$Entry)

    $environmentKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
    if ($null -eq $environmentKey) {
        throw "Unable to open the current user's environment registry key."
    }

    try {
        $options = [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
        $rawPath = [string]$environmentKey.GetValue('Path', '', $options)
        $kind = if ([string]::IsNullOrEmpty($rawPath)) {
            [Microsoft.Win32.RegistryValueKind]::String
        } else {
            $environmentKey.GetValueKind('Path')
        }
        $needle = $Entry.TrimEnd('\')
        $remaining = @($rawPath.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object {
                $_.TrimEnd('\') -ine $needle
            })
        $updatedPath = (@($Entry) + $remaining) -join ';'
        $changed = $updatedPath -cne $rawPath
        if ($changed) {
            $environmentKey.SetValue('Path', $updatedPath, $kind)
        }
    } finally {
        $environmentKey.Dispose()
    }

    $processSegments = @($env:Path.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object {
            $_.TrimEnd('\') -ine $Entry.TrimEnd('\')
        })
    $env:Path = (@($Entry) + $processSegments) -join ';'
    return $changed
}

function Publish-EnvironmentChange {
    if (-not ('HerdrInstaller.EnvironmentNativeMethods' -as [type])) {
        Add-Type -Namespace HerdrInstaller -Name EnvironmentNativeMethods -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern System.IntPtr SendMessageTimeout(
    System.IntPtr hWnd,
    uint message,
    System.UIntPtr wParam,
    string lParam,
    uint flags,
    uint timeout,
    out System.UIntPtr result);
'@
    }

    $result = [UIntPtr]::Zero
    [HerdrInstaller.EnvironmentNativeMethods]::SendMessageTimeout(
        [IntPtr]0xffff,
        0x1a,
        [UIntPtr]::Zero,
        'Environment',
        0x0002,
        1000,
        [ref]$result
    ) | Out-Null
}

function Initialize-HerdrConfig {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$ConfigPath,
        [Parameter(Mandatory)][string]$PowerShellPath
    )

    $normalizedPowerShellPath = $PowerShellPath.Replace('\', '/')
    $expectedLine = "default_shell = `"$normalizedPowerShellPath`""

    if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
        $lines = @(Get-Content -LiteralPath $ConfigPath)
        $currentSection = $null
        foreach ($line in $lines) {
            if ($line -cmatch '^\s*\[\s*([^\]]+?)\s*\]\s*(?:#.*)?$') {
                $currentSection = $Matches[1]
                continue
            }
            if ($currentSection -ceq 'terminal' -and $line -cmatch '^\s*default_shell\s*=') {
                if ($line.Trim() -ceq $expectedLine) {
                    Write-Output "Herdr already uses PowerShell 7 for new panes: $normalizedPowerShellPath"
                    return
                }
                throw "Existing Herdr config sets a different terminal.default_shell: $ConfigPath"
            }
        }
        throw "Existing Herdr config was not modified. Set terminal.default_shell manually in $ConfigPath"
    }

    if (-not $PSCmdlet.ShouldProcess($ConfigPath, 'Create Herdr config for PowerShell 7')) {
        return
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $ConfigPath) -Force | Out-Null
    $content = "[terminal]`n$expectedLine`n"
    [System.IO.File]::WriteAllText($ConfigPath, $content, [System.Text.UTF8Encoding]::new($false))
    Write-Output "Created Herdr configuration at $ConfigPath"
}

if (-not $IsWindows) {
    throw 'This installer supports Windows only.'
}
if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'Herdr requires 64-bit Windows.'
}
if ($PSVersionTable.PSEdition -ne 'Core') {
    throw 'Run this installer with PowerShell 7 or newer (pwsh.exe).'
}

$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
if ($architecture -notin @('X64', 'Arm64')) {
    throw "Unsupported Windows architecture: $architecture"
}
if ($architecture -eq 'Arm64') {
    Write-Output 'Windows ARM64 detected; Herdr will use the x86_64 build under emulation.'
}

$powerShellPath = Join-Path $PSHOME 'pwsh.exe'
if (-not (Test-Path -LiteralPath $powerShellPath -PathType Leaf)) {
    throw "Unable to locate the current PowerShell executable at $powerShellPath."
}

$herdrHome = if ([string]::IsNullOrWhiteSpace($env:HERDR_HOME)) {
    Join-Path $env:USERPROFILE '.herdr'
} else {
    $env:HERDR_HOME
}
$standaloneRoot = Join-Path ([System.IO.Path]::GetFullPath($herdrHome)) 'packages\standalone'
$releasesDirectory = Join-Path $standaloneRoot 'releases'
$releaseDirectory = Join-Path $releasesDirectory "$HerdrVersionIdentity-$HerdrTargetTriple"
$currentDirectory = Join-Path $standaloneRoot 'current'
$visibleBinDirectory = Join-Path $env:LOCALAPPDATA 'Programs\Herdr\bin'
$configPath = Join-Path $env:APPDATA 'herdr\config.toml'

Assert-NoReparsePointAncestor -Path $releaseDirectory
Assert-NoReparsePointAncestor -Path (Split-Path -Parent $visibleBinDirectory)

$releaseEntry = Get-FileSystemEntry -Path $releaseDirectory
if ($null -ne $releaseEntry -and -not (Test-HerdrPackage -PackageDirectory $releaseDirectory)) {
    throw "Existing release directory does not match the pinned package: $releaseDirectory"
}

$releaseReady = Test-HerdrPackage -PackageDirectory $releaseDirectory
if (-not $releaseReady -and $PSCmdlet.ShouldProcess(
        $releaseDirectory,
        "Install pinned Herdr preview $HerdrVersionIdentity"
    )) {
    $tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("herdr-download-" + [guid]::NewGuid().ToString('N'))
    $archivePath = Join-Path $tempDirectory 'herdr-windows-x86_64.zip'
    $stagingDirectory = Join-Path $releasesDirectory ('.staging.' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempDirectory | Out-Null

    try {
        New-Item -ItemType Directory -Path $releasesDirectory -Force | Out-Null
        Write-Output "Downloading pinned Herdr preview build $HerdrBuildId"
        Invoke-WebRequest -Uri $HerdrArchiveUri -OutFile $archivePath
        $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($archiveHash -cne $HerdrArchiveSha256) {
            throw "Herdr archive checksum mismatch. Expected $HerdrArchiveSha256 but got $archiveHash."
        }

        Expand-Archive -LiteralPath $archivePath -DestinationPath $stagingDirectory
        if (-not (Test-HerdrPackage -PackageDirectory $stagingDirectory)) {
            throw 'The verified archive did not contain the pinned Herdr package.'
        }
        [System.IO.Directory]::Move($stagingDirectory, $releaseDirectory)
        $releaseReady = $true
    } finally {
        Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($releaseReady) {
    New-HerdrJunction -LinkPath $currentDirectory -TargetPath $releaseDirectory
    New-HerdrJunction -LinkPath $visibleBinDirectory -TargetPath $releaseDirectory
}

$herdrReady = (Test-HerdrPackage -PackageDirectory $currentDirectory) -and
    (Test-HerdrPackage -PackageDirectory $visibleBinDirectory)
if ($herdrReady -and $PSCmdlet.ShouldProcess('HKCU:\Environment\Path', "Prepend $visibleBinDirectory")) {
    $pathChanged = Add-UserPathEntry -Entry $visibleBinDirectory
    if ($pathChanged) {
        Publish-EnvironmentChange
        Write-Output "Added $visibleBinDirectory to the current user's PATH."
    } else {
        Write-Output "$visibleBinDirectory is already first on the current user's PATH."
    }
}

if ($herdrReady -or $WhatIfPreference) {
    Initialize-HerdrConfig -ConfigPath $configPath -PowerShellPath $powerShellPath
}

Write-Output ''
if ($WhatIfPreference) {
    Write-Output 'Preview complete. Run again without -WhatIf to install Herdr.'
} elseif ($herdrReady) {
    Write-Output 'Close all Windows Terminal windows and open a new one, then run:'
    Write-Output '  herdr --version'
    Write-Output '  herdr'
} else {
    Write-Warning 'Herdr was not installed or activated.'
}
