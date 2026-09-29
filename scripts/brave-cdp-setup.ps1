#Requires -Version 5.1
<#
.SYNOPSIS
    Makes normal Windows Brave launch surfaces attachable through loopback CDP.
.DESCRIPTION
    Updates Brave shortcuts under the Desktop, Start Menu, and Quick Launch
    trees, creates a Desktop shortcut when absent, and updates the active
    Brave HTTP/HTTPS ProgID command. Existing profile selections and unrelated
    shortcut arguments are preserved. Repeated runs make no further changes.
#>
[CmdletBinding()]
param(
    [string]$BravePath = (Join-Path $env:LOCALAPPDATA 'BraveSoftware\Brave-Browser\Application\brave.exe'),
    [string]$UserDataDir = (Join-Path $env:LOCALAPPDATA 'BraveSoftware\Brave-Browser\User Data'),
    [string[]]$ShortcutRoots,
    [string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop'),
    [string]$BackupDirectory = (Join-Path $env:LOCALAPPDATA 'dotfiles\brave-launch-backups'),
    [int]$Port = 9222,
    [switch]$SkipProtocolHandlers
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $BravePath -PathType Leaf)) {
    Write-Host "Brave CDP setup skipped; executable not found: $BravePath" -ForegroundColor DarkGray
    return
}
if (-not (Test-Path -LiteralPath $UserDataDir -PathType Container)) {
    Write-Host "Brave CDP setup skipped; user-data directory not found: $UserDataDir" -ForegroundColor DarkGray
    return
}
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535.' }

$BravePath = [IO.Path]::GetFullPath($BravePath)
$UserDataDir = [IO.Path]::GetFullPath($UserDataDir)
if (-not $ShortcutRoots) {
    $ShortcutRoots = @(
        $DesktopDirectory,
        [Environment]::GetFolderPath('CommonDesktopDirectory'),
        [Environment]::GetFolderPath('StartMenu'),
        [Environment]::GetFolderPath('CommonStartMenu'),
        (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch')
    )
}
$ShortcutRoots = @($ShortcutRoots | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -Unique)

function Get-ProfileDirectory([string]$Arguments) {
    if ($Arguments -match '(?i)(?:^|\s)--profile-directory=(?:"([^"]+)"|(\S+))') {
        if ($Matches[1]) { return $Matches[1] }
        return $Matches[2]
    }
    return 'Default'
}

function Remove-ManagedArguments([string]$Arguments) {
    $result = $Arguments
    $patterns = @(
        '(?i)(?:^|\s)--profile-directory=(?:"[^"]*"|\S+)',
        '(?i)(?:^|\s)--remote-debugging-address=(?:"[^"]*"|\S+)',
        '(?i)(?:^|\s)--remote-debugging-port=(?:"[^"]*"|\S+)',
        '(?i)(?:^|\s)--user-data-dir=(?:"[^"]*"|\S+)'
    )
    foreach ($pattern in $patterns) { $result = $result -replace $pattern, '' }
    return (($result -replace '\s+', ' ').Trim())
}

function Get-ManagedArguments([string]$Profile, [string]$AdditionalArguments) {
    $managed = "--profile-directory=`"$Profile`" --remote-debugging-address=127.0.0.1 --remote-debugging-port=$Port --user-data-dir=`"$UserDataDir`""
    if ($AdditionalArguments) { return "$managed $AdditionalArguments" }
    return $managed
}

$ws = New-Object -ComObject WScript.Shell
$shortcutFiles = @(
    if ($ShortcutRoots.Count -gt 0) {
        Get-ChildItem -LiteralPath $ShortcutRoots -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue |
            Where-Object {
                $shortcut = $ws.CreateShortcut($_.FullName)
                $shortcut.TargetPath -and ([IO.Path]::GetFullPath($shortcut.TargetPath) -ieq $BravePath)
            }
    }
)

$desktopShortcut = if ($DesktopDirectory) { Join-Path $DesktopDirectory 'Brave.lnk' }
if ($desktopShortcut -and -not (Test-Path -LiteralPath $desktopShortcut)) {
    New-Item -ItemType Directory -Path $DesktopDirectory -Force | Out-Null
    $shortcut = $ws.CreateShortcut($desktopShortcut)
    $shortcut.TargetPath = $BravePath
    $shortcut.WorkingDirectory = Split-Path -Parent $BravePath
    $shortcut.IconLocation = "$BravePath,0"
    $shortcut.Save()
    $shortcutFiles += Get-Item -LiteralPath $desktopShortcut
}

$changedShortcuts = 0
$backupRun = $null
foreach ($file in @($shortcutFiles | Sort-Object FullName -Unique)) {
    $shortcut = $ws.CreateShortcut($file.FullName)
    $profile = Get-ProfileDirectory $shortcut.Arguments
    $additional = Remove-ManagedArguments $shortcut.Arguments
    $expected = Get-ManagedArguments $profile $additional
    if ($shortcut.Arguments -ceq $expected) { continue }

    if (-not $backupRun) {
        $backupRun = Join-Path $BackupDirectory (Get-Date -Format 'yyyyMMdd-HHmmss')
        New-Item -ItemType Directory -Path $backupRun -Force | Out-Null
    }
    $relative = $file.FullName.Replace(':', '').TrimStart('\')
    $backup = Join-Path $backupRun $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $backup -Force

    $shortcut.Arguments = $expected
    $shortcut.Save()
    $changedShortcuts++
}

$changedHandlers = 0
if (-not $SkipProtocolHandlers) {
    $progIds = @(
        (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice' -ErrorAction SilentlyContinue).ProgId,
        (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice' -ErrorAction SilentlyContinue).ProgId
    ) | Where-Object { $_ } | Select-Object -Unique

    foreach ($progId in $progIds) {
        $commandKey = "Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command"
        $current = (Get-ItemProperty $commandKey -ErrorAction SilentlyContinue).'(default)'
        if (-not $current -or $current -notmatch '(?i)brave\.exe') { continue }
        $expected = "`"$BravePath`" $(Get-ManagedArguments 'Default' '--single-argument %1')"
        if ($current -ceq $expected) { continue }

        if (-not $backupRun) {
            $backupRun = Join-Path $BackupDirectory (Get-Date -Format 'yyyyMMdd-HHmmss')
            New-Item -ItemType Directory -Path $backupRun -Force | Out-Null
        }
        & reg.exe export "HKCR\$progId" (Join-Path $backupRun "$progId.reg") /y | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not back up Brave protocol registration $progId." }
        Set-ItemProperty -Path $commandKey -Name '(default)' -Value $expected
        $changedHandlers++
    }
}

if ($changedShortcuts -eq 0 -and $changedHandlers -eq 0) {
    Write-Host 'Brave CDP launch surfaces: already configured' -ForegroundColor DarkGray
} else {
    Write-Host "Brave CDP launch surfaces: updated $changedShortcuts shortcut(s) and $changedHandlers protocol handler(s)" -ForegroundColor Green
    if ($backupRun) { Write-Host "  Backup: $backupRun" -ForegroundColor DarkGray }
}
