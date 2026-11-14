#Requires -Version 5.1
<#
.SYNOPSIS
Captures Defender scans and system/process activity during a Windows CPU spike.
.DESCRIPTION
Requests administrator approval when needed. Records for about 60 seconds by
 default, then saves local reports without changing Defender settings.
.PARAMETER DurationSeconds
Approximate recording duration, rounded up to a five-second sample interval.
.PARAMETER OutputDirectory
An empty output directory. Defaults to a unique folder under the user's TEMP.
.PARAMETER OpenResults
Opens the results folder when finished. Intended for the desktop shortcut.
.EXAMPLE
pwsh -NoProfile -File scripts/capture-defender-spike.ps1
#>
[CmdletBinding()]
param(
    [ValidateRange(10, 600)]
    [int]$DurationSeconds = 60,
    [string]$OutputDirectory,
    [switch]$OpenResults
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $OutputDirectory) {
    $name = 'defender-spike-{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 6))
    $OutputDirectory = Join-Path ([IO.Path]::GetTempPath()) $name
}
$OutputDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdministrator = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdministrator) {
    $scriptLiteral = $PSCommandPath.Replace("'", "''")
    $directoryLiteral = $OutputDirectory.Replace("'", "''")
    $command = "& '$scriptLiteral' -DurationSeconds $DurationSeconds -OutputDirectory '$directoryLiteral'"
    if ($OpenResults) { $command += ' -OpenResults' }
    $arguments = @('-NoProfile')
    if ($OpenResults) { $arguments += '-NoExit' }
    $arguments += @('-EncodedCommand', [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command)))
    $child = Start-Process -FilePath "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" -Verb RunAs -ArgumentList $arguments -PassThru
    Write-Output "Capture launched (PID $($child.Id)). Approve the administrator prompt and reproduce the spike."
    Write-Output "Results: $OutputDirectory"
    return
}

$wpr = Join-Path $env:WINDIR 'System32/wpr.exe'
$moduleRoot = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/Modules/DefenderPerformance'
$profile = Join-Path $moduleRoot 'MSFT_MpPerformanceRecording.wprp'
if (-not (Test-Path -LiteralPath $profile)) { throw "Defender performance recording is unavailable: $profile" }
if ((Test-Path -LiteralPath $OutputDirectory) -and @(Get-ChildItem -LiteralPath $OutputDirectory -Force).Count) {
    throw "Choose an empty output directory to preserve existing captures: $OutputDirectory"
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$tracePath = Join-Path $OutputDirectory 'defender.etl'
$processCsv = Join-Path $OutputDirectory 'process-samples.csv'
$systemCsv = Join-Path $OutputDirectory 'system-samples.csv'
$statusPath = Join-Path $OutputDirectory 'status.txt'
$instance = 'DotfilesDefenderSpikeCapture'
$recordingStarted = $false
$logicalProcessors = [Environment]::ProcessorCount
$counterErrors = @()
Start-Transcript -Path (Join-Path $OutputDirectory 'capture.log') | Out-Null

try {
    Set-Content -LiteralPath $statusPath -Value 'Starting'
    & $wpr -start "$profile!Scans.Light" -filemode -instancename $instance
    if ($LASTEXITCODE -ne 0) { throw "Windows Performance Recorder could not start (exit $LASTEXITCODE). Another capture may already be running." }
    $recordingStarted = $true
    Set-Content -LiteralPath $statusPath -Value 'Recording'
    Write-Host "Recording for about $DurationSeconds seconds. Reproduce the spike now."
    Write-Host "Results: $OutputDirectory"

    try {
        Get-CimInstance Win32_Process -Property Name, ProcessId, ParentProcessId, CreationDate, ExecutablePath -OperationTimeoutSec 10 |
            Select-Object Name, ProcessId, ParentProcessId, CreationDate, ExecutablePath |
            ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'processes.json')
    } catch { Write-Warning "Process metadata snapshot unavailable: $_" }

    $counters = @(
        '\Process(*)\ID Process', '\Process(*)\% Processor Time',
        '\Process(*)\IO Read Bytes/sec', '\Process(*)\IO Write Bytes/sec',
        '\Processor(_Total)\% Processor Time', '\Memory\Available MBytes'
    )
    try {
        Get-Counter -Counter $counters -SampleInterval 5 -MaxSamples ([int][math]::Ceiling($DurationSeconds / 5.0)) -ErrorAction Continue -ErrorVariable +counterErrors |
            ForEach-Object {
                $timestamp = $_.Timestamp.ToUniversalTime().ToString('o')
                $processes = @{}
                $system = [ordered]@{ TimestampUtc = $timestamp; CpuPercent = $null; AvailableMemoryMB = $null }
                foreach ($counter in $_.CounterSamples) {
                    if ($counter.Status -notin 0, 1) { continue }
                    if ($counter.Path -like '*\processor(_total)\% processor time') {
                        $system.CpuPercent = [math]::Round($counter.CookedValue, 2)
                    } elseif ($counter.Path -like '*\memory\available mbytes') {
                        $system.AvailableMemoryMB = [math]::Round($counter.CookedValue, 2)
                    } elseif ($counter.Path -like '*\process(*)\*') {
                        # InstanceName omits #N suffixes, so key by the full counter instance path.
                        $instancePath = $counter.Path.Substring(0, $counter.Path.LastIndexOf('\'))
                        if (-not $processes.ContainsKey($instancePath)) {
                            $processes[$instancePath] = [ordered]@{ TimestampUtc = $timestamp; ProcessId = $null; Name = $counter.InstanceName; CpuPercent = $null; ReadBytesPerSecond = $null; WriteBytesPerSecond = $null }
                        }
                        $row = $processes[$instancePath]
                        switch -Wildcard ($counter.Path) {
                            '*\id process' { $row.ProcessId = [int]$counter.CookedValue }
                            '*\% processor time' { $row.CpuPercent = [math]::Round($counter.CookedValue / $logicalProcessors, 2) }
                            '*\io read bytes/sec' { $row.ReadBytesPerSecond = [math]::Round($counter.CookedValue, 2) }
                            '*\io write bytes/sec' { $row.WriteBytesPerSecond = [math]::Round($counter.CookedValue, 2) }
                        }
                    }
                }
                $rows = @($processes.Values | Where-Object { $_.ProcessId -gt 0 -and $_.Name -ne '_total' } | ForEach-Object { [pscustomobject]$_ })
                if ($rows.Count) { $rows | Export-Csv -LiteralPath $processCsv -NoTypeInformation -Encoding UTF8 -Append }
                [pscustomobject]$system | Export-Csv -LiteralPath $systemCsv -NoTypeInformation -Encoding UTF8 -Append
            }
    } catch {
        $counterErrors += $_
        Write-Warning "Process counters stopped early; saving the Defender trace: $_"
    } finally {
        & $wpr -stop $tracePath -instancename $instance
        if ($LASTEXITCODE -ne 0) { throw "Windows Performance Recorder could not save the trace (exit $LASTEXITCODE)." }
        $recordingStarted = $false
    }

    Set-Content -LiteralPath $statusPath -Value 'Analyzing'
    Import-Module (Join-Path $moduleRoot 'DefenderPerformance.psd1')
    $report = Get-MpPerformanceReport -Path $tracePath -Overview -TopProcesses 15 -TopFiles 25 -TopExtensions 10 -TopScans 20 -Raw
    $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'defender-report.json')
    $summary = @(
        'Defender spike capture',
        "Results: $OutputDirectory",
        '',
        'Scan durations are elapsed scan time, not CPU usage. Scans can overlap or wait.',
        'Process CPU percentages are normalized across all logical processors.',
        'Process I/O includes more than physical disk activity. MsSense is a separate sensor;',
        'its CPU appears in process samples, but this Defender scan trace does not explain all its work.',
        '',
        'Top scan-triggering programs:',
        ($report.TopProcesses | Select-Object Count, @{n='ScanSeconds';e={[math]::Round($_.TotalDuration / 10000000.0, 3)}}, ProcessPath | Format-Table -AutoSize | Out-String -Width 300),
        'Top scanned files:',
        ($report.TopFiles | Select-Object Count, @{n='ScanSeconds';e={[math]::Round($_.TotalDuration / 10000000.0, 3)}}, Path | Format-Table -AutoSize | Out-String -Width 300)
    )
    if (Test-Path -LiteralPath $processCsv) {
        $summary += 'Highest observed process CPU (not whole-recording averages):'
        $summary += (Import-Csv -LiteralPath $processCsv | Where-Object { $_.CpuPercent -ne '' } |
            Sort-Object { [double]$_.CpuPercent } -Descending | Select-Object -First 20 TimestampUtc, ProcessId, Name, CpuPercent |
            Format-Table -AutoSize | Out-String -Width 300)
    }
    if ($counterErrors.Count) {
        $summary += 'Some counters were unavailable. Process/system samples may be partial; see counter-errors.txt.'
        $counterErrors | Out-String -Width 300 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'counter-errors.txt')
    }
    $summary | Set-Content -LiteralPath (Join-Path $OutputDirectory 'report.txt')
    Set-Content -LiteralPath $statusPath -Value 'Complete'
    Write-Host "Capture complete. Read: $(Join-Path $OutputDirectory 'report.txt')"
} catch {
    $_ | Out-String | Set-Content -LiteralPath (Join-Path $OutputDirectory 'error.txt')
    Set-Content -LiteralPath $statusPath -Value 'Failed'
    throw
} finally {
    if ($recordingStarted) {
        # Only cancel the named recording successfully started by this invocation.
        & $wpr -cancel -instancename $instance
    }
    Stop-Transcript | Out-Null
    if ($OpenResults) { Invoke-Item -LiteralPath $OutputDirectory }
}
