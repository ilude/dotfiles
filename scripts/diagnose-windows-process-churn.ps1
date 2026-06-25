#Requires -Version 7.0
<#
.SYNOPSIS
Reports Windows process-churn symptoms that can leave LSM, CryptSvc, Git LFS, or MSYS helpers hot.

.DESCRIPTION
Read-only diagnostic. It samples service CPU, handle counts, suspicious Git/MSYS/Pi child processes, orphan-like console processes, and recent TCP 4227 events.
#>
[CmdletBinding()]
param(
    [int]$SampleSeconds = 5,
    [int]$EventMinutes = 120,
    [int]$HighHandleThreshold = 100000,
    [int]$HighCpuPercentThreshold = 25
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Section {
    param([string]$Title)
    Write-Output ""
    Write-Output "--- $Title ---"
}

function Get-ProcessCounterByPid {
    param([int[]]$ProcessId)
    Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
        Where-Object { $ProcessId -contains [int]$_.IDProcess }
}

Write-Section 'hot services: LSM and CryptSvc'
$services = Get-CimInstance Win32_Service |
    Where-Object { $_.Name -in @('LSM', 'CryptSvc') } |
    Select-Object Name, DisplayName, State, ProcessId
$services | Format-Table -AutoSize

$servicePids = @($services | Where-Object { $_.ProcessId -gt 0 } | ForEach-Object { [int]$_.ProcessId })
if ($servicePids.Count -gt 0) {
    Get-ProcessCounterByPid -ProcessId $servicePids |
        Select-Object Name, IDProcess, PercentProcessorTime, ThreadCount, HandleCount, ElapsedTime |
        Sort-Object PercentProcessorTime -Descending |
        Format-Table -AutoSize
}

Write-Section "cpu delta sample (${SampleSeconds}s)"
$before = @{}
foreach ($proc in Get-Process | Where-Object { $null -ne $_.CPU }) {
    $before[$proc.Id] = $proc.CPU
}
Start-Sleep -Seconds $SampleSeconds
$rows = foreach ($proc in Get-Process | Where-Object { $null -ne $_.CPU -and $before.ContainsKey($_.Id) }) {
    $delta = $proc.CPU - $before[$proc.Id]
    if ($delta -gt 0.01) {
        [pscustomobject]@{
            Id = $proc.Id
            Name = $proc.ProcessName
            CpuDeltaSeconds = [math]::Round($delta, 3)
            CpuPercentApprox = [math]::Round(($delta / $SampleSeconds) * 100, 1)
            CpuTotal = [math]::Round($proc.CPU, 2)
            Path = $proc.Path
        }
    }
}
$rows | Sort-Object CpuDeltaSeconds -Descending | Select-Object -First 25 | Format-Table -AutoSize

Write-Section 'high handle count processes'
Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
    Where-Object { $_.HandleCount -ge $HighHandleThreshold -or $_.PercentProcessorTime -ge $HighCpuPercentThreshold } |
    Sort-Object HandleCount -Descending |
    Select-Object -First 25 Name, IDProcess, PercentProcessorTime, ThreadCount, HandleCount, ElapsedTime |
    Format-Table -AutoSize

Write-Section 'git lfs ssh msys and pi child candidates'
Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -match '^(git|git-lfs|ssh|sh|bash|uname|zsh|node|python|pwsh|powershell|cmd|conhost)\.exe$' -or
        $_.CommandLine -match 'git-lfs|git-upload-pack|git-receive-pack|pi-coding-agent|tool-reduction|\bpnpm\b|\bvitest\b|\btsc\b|\bdolos\b|\buname\b|core\.sshCommand'
    } |
    Select-Object Name, ProcessId, ParentProcessId, CreationDate, CommandLine |
    Sort-Object CreationDate |
    Format-Table -Wrap -AutoSize

Write-Section 'orphan-like command and console processes'
$all = Get-CimInstance Win32_Process
$byPid = @{}
foreach ($proc in $all) {
    $byPid[[int]$proc.ProcessId] = $true
}
$all |
    Where-Object {
        $_.ParentProcessId -notin 0, 4 -and
        -not $byPid.ContainsKey([int]$_.ParentProcessId) -and
        $_.Name -match '^(git|git-lfs|ssh|sh|bash|uname|zsh|node|python|pwsh|powershell|cmd|conhost)\.exe$'
    } |
    Select-Object Name, ProcessId, ParentProcessId, CreationDate, CommandLine |
    Sort-Object CreationDate |
    Format-Table -Wrap -AutoSize

Write-Section "recent TCP 4227 and session related events (${EventMinutes}m)"
$since = (Get-Date).AddMinutes(-$EventMinutes)
Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $since } -ErrorAction SilentlyContinue |
    Where-Object {
        ($_.ProviderName -eq 'Tcpip' -and $_.Id -eq 4227) -or
        $_.ProviderName -match 'TerminalServices|Winlogon|Service Control Manager|Lsm' -or
        $_.Message -match 'session|console|logon|logoff|high rate|endpoint'
    } |
    Select-Object TimeCreated, ProviderName, Id, LevelDisplayName, Message |
    Sort-Object TimeCreated -Descending |
    Select-Object -First 40 |
    Format-List
