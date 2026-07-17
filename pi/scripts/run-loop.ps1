[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Workspace,

    [string]$PromptPath,

    [string]$StateRoot,

    [string]$JobId = "default",

    [string]$PlanPaths = ".specs/rationalization-phase3/plan.md;.specs/rationalization-phase4/plan.md;.specs/rationalization-phase5/plan.md",

    [ValidateRange(0, 300)]
    [int]$StartupDelaySeconds = 0,

    [ValidateRange(1, 200)]
    [int]$MaxIterations = 48,

    [ValidateRange(1, 20)]
    [int]$MaxInvocationRetries = 5,

    [ValidateRange(1, 10)]
    [int]$MaxNoProgress = 4,

    [ValidateRange(1, 3600)]
    [int]$InitialBackoffSeconds = 30,

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-FullPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$BasePath
    )

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $Path))
}

function Write-LoopEvent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Event,

        [System.Collections.IDictionary]$Data = @{}
    )

    $record = [ordered]@{
        schema_version = 1
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        event = $Event
        job_id = $JobId
        supervisor_pid = $PID
    }
    foreach ($key in $Data.Keys) {
        $record[$key] = $Data[$key]
    }

    $line = $record | ConvertTo-Json -Compress -Depth 4
    Add-Content -LiteralPath $script:LoopLog -Value $line -Encoding utf8
    Write-Output $line
}

function Get-FileStats {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [string]$Filter = "*"
    )

    $files = @(
        Get-ChildItem `
            -LiteralPath $Path `
            -File `
            -Filter $Filter `
            -Recurse `
            -ErrorAction SilentlyContinue
    )
    $measure = $files | Measure-Object -Property Length -Sum
    $bytes = if ($null -eq $measure -or $null -eq $measure.Sum) {
        0
    }
    else {
        [long]$measure.Sum
    }
    return [pscustomobject]@{
        Count = $files.Count
        Bytes = $bytes
    }
}

function Get-HeadCommit {
    param(
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        $commit = (& git rev-parse HEAD 2>$null)
        if ($LASTEXITCODE -ne 0 -or -not $commit) {
            throw "Unable to resolve HEAD in $WorkingDirectory"
        }
        return $commit.Trim()
    }
    finally {
        Pop-Location
    }
}

function Get-PiArguments {
    param(
        [Parameter(Mandatory = $true)]
        [bool]$ContinueSession,

        [Parameter(Mandatory = $true)]
        [string]$SessionDirectory,

        [Parameter(Mandatory = $true)]
        [string]$PromptFile,

        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,

        [Parameter(Mandatory = $true)]
        [string[]]$Plans
    )

    $extensionRoot = Join-Path $WorkingDirectory "pi/extensions"
    $extensions = @(
        "commit-guard.ts",
        "damage-control.ts",
        "loop/runtime-logging.ts",
        "direct-personality.ts",
        "goal.ts",
        "operator-status.ts",
        "pwsh.ts",
        "structured-edit.ts",
        "tasks.ts",
        "text-edit.ts",
        "tool-reduction.ts",
        "tool-search.ts",
        "web-tools.ts",
        "subagent/index.ts"
    )

    $arguments = [System.Collections.Generic.List[string]]::new()
    $arguments.Add("--session-dir")
    $arguments.Add($SessionDirectory)
    if ($ContinueSession) {
        $arguments.Add("--continue")
    }
    $arguments.Add("--print")
    $arguments.Add("--append-system-prompt")
    $arguments.Add($PromptFile)

    if (Test-Path -LiteralPath (Join-Path $extensionRoot "tasks.ts") -PathType Leaf) {
        $arguments.Add("--no-extensions")
        foreach ($extension in $extensions) {
            $extensionPath = Join-Path $extensionRoot $extension
            if (-not (Test-Path -LiteralPath $extensionPath -PathType Leaf)) {
                throw "Required extension not found: $extensionPath"
            }
            $arguments.Add("--extension")
            $arguments.Add($extensionPath)
        }
    }

    $arguments.Add(
        "Run the next plan loop iteration for: $($Plans -join ', '). Follow the iteration contract and finish with the required LOOP_STATUS marker."
    )
    return $arguments.ToArray()
}

$workspacePath = Resolve-FullPath -Path $Workspace -BasePath (Get-Location).Path
if (-not (Test-Path -LiteralPath $workspacePath -PathType Container)) {
    throw "Workspace not found: $workspacePath"
}

if (-not $PromptPath) {
    $PromptPath = Join-Path $PSScriptRoot "loop-prompt.md"
}
$promptFile = Resolve-FullPath -Path $PromptPath -BasePath $workspacePath
if (-not (Test-Path -LiteralPath $promptFile -PathType Leaf)) {
    throw "Loop prompt not found: $promptFile"
}

if (-not $StateRoot) {
    $localRoot = if ($env:LOCALAPPDATA) {
        $env:LOCALAPPDATA
    }
    else {
        Join-Path $HOME ".pi"
    }
    $StateRoot = Join-Path $localRoot "pi-loops/$JobId"
}
$statePath = Resolve-FullPath -Path $StateRoot -BasePath $workspacePath
$plans = @(
    $PlanPaths.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries) |
        ForEach-Object { $_.Trim() }
)
if ($plans.Count -eq 0) {
    throw "At least one plan path is required."
}
foreach ($plan in $plans) {
    $planPath = Resolve-FullPath -Path $plan -BasePath $workspacePath
    if (-not (Test-Path -LiteralPath $planPath -PathType Leaf)) {
        throw "Plan file not found: $plan"
    }
}
$sessionPath = Join-Path $statePath "session"
$logsPath = Join-Path $statePath "logs"
$script:LoopLog = Join-Path $statePath "loop.log"

$piCommand = Get-Command pi -ErrorAction Stop
$null = Get-Command git -ErrorAction Stop

Push-Location $workspacePath
try {
    $insideWorktree = (& git rev-parse --is-inside-work-tree 2>$null)
    if ($LASTEXITCODE -ne 0 -or $insideWorktree.Trim() -ne "true") {
        throw "Workspace is not a Git worktree: $workspacePath"
    }
}
finally {
    Pop-Location
}

$previewArguments = Get-PiArguments `
    -ContinueSession $false `
    -SessionDirectory $sessionPath `
    -PromptFile $promptFile `
    -WorkingDirectory $workspacePath `
    -Plans $plans

if ($DryRun) {
    Write-Output "dry-run-ok"
    Write-Output "workspace=$workspacePath"
    Write-Output "state=$statePath"
    Write-Output "command=$($piCommand.Source)"
    Write-Output "arguments=$($previewArguments -join ' ')"
    exit 0
}

New-Item -ItemType Directory -Path $sessionPath -Force | Out-Null
New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
Set-Content -LiteralPath (Join-Path $statePath "supervisor.pid") -Value $PID -Encoding ascii
$env:PI_LOOP_LOG_PATH = $script:LoopLog
$env:PI_LOOP_JOB_ID = $JobId
$env:PI_LOOP_SUPERVISOR_PID = [string]$PID
if ($StartupDelaySeconds -gt 0) {
    Start-Sleep -Seconds $StartupDelaySeconds
}
Write-LoopEvent -Event "loop_started" -Data ([ordered]@{
    workspace = $workspacePath
    state_root = $statePath
    session_dir = $sessionPath
    max_iterations = $MaxIterations
    max_invocation_retries = $MaxInvocationRetries
    max_no_progress = $MaxNoProgress
    initial_backoff_seconds = $InitialBackoffSeconds
    startup_delay_seconds = $StartupDelaySeconds
})

$noProgress = 0
for ($iteration = 1; $iteration -le $MaxIterations; $iteration++) {
    $iterationStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $beforeHead = Get-HeadCommit -WorkingDirectory $workspacePath
    $sessionStats = Get-FileStats -Path $sessionPath -Filter "*.jsonl"
    $sessionExists = $sessionStats.Count -gt 0
    $arguments = Get-PiArguments `
        -ContinueSession $sessionExists `
        -SessionDirectory $sessionPath `
        -PromptFile $promptFile `
        -WorkingDirectory $workspacePath `
        -Plans $plans

    $completed = $false
    $iterationLog = Join-Path $logsPath ("iteration-{0:D3}.log" -f $iteration)
    for ($attempt = 1; $attempt -le $MaxInvocationRetries; $attempt++) {
        $env:PI_LOOP_ITERATION = [string]$iteration
        $env:PI_LOOP_ATTEMPT = [string]$attempt
        Write-LoopEvent -Event "invocation_started" -Data ([ordered]@{
            iteration = $iteration
            attempt = $attempt
            head_before = $beforeHead
            continue_session = $sessionExists
            session_files = $sessionStats.Count
            session_bytes = $sessionStats.Bytes
            iteration_log = [System.IO.Path]::GetFileName($iterationLog)
        })

        $invocationStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $exitCode = -1
        $invocationError = $null
        Push-Location $workspacePath
        try {
            & $piCommand.Source @arguments *> $iterationLog
            $exitCode = $LASTEXITCODE
        }
        catch {
            $invocationError = $_
        }
        finally {
            Pop-Location
            $invocationStopwatch.Stop()
        }

        $outputBytes = if (Test-Path -LiteralPath $iterationLog -PathType Leaf) {
            (Get-Item -LiteralPath $iterationLog).Length
        }
        else {
            0
        }
        $sessionStats = Get-FileStats -Path $sessionPath -Filter "*.jsonl"
        $invocationOutcome = if ($null -ne $invocationError) {
            "error"
        }
        elseif ($exitCode -eq 0) {
            "success"
        }
        else {
            "failed"
        }
        Write-LoopEvent -Event "invocation_finished" -Data ([ordered]@{
            iteration = $iteration
            attempt = $attempt
            outcome = $invocationOutcome
            exit_code = $exitCode
            duration_ms = $invocationStopwatch.ElapsedMilliseconds
            output_bytes = $outputBytes
            session_files = $sessionStats.Count
            session_bytes = $sessionStats.Bytes
        })
        if ($null -ne $invocationError) {
            throw $invocationError
        }

        if ($exitCode -eq 0) {
            $completed = $true
            break
        }

        if ($attempt -lt $MaxInvocationRetries) {
            $backoff = [Math]::Min(
                $InitialBackoffSeconds * [Math]::Pow(2, $attempt - 1),
                600
            )
            Write-LoopEvent -Event "invocation_retry_scheduled" -Data ([ordered]@{
                iteration = $iteration
                attempt = $attempt
                backoff_seconds = [int]$backoff
            })
            Start-Sleep -Seconds ([int]$backoff)
        }
    }

    if (-not $completed) {
        $iterationStopwatch.Stop()
        Write-LoopEvent -Event "loop_stopped" -Data ([ordered]@{
            reason = "repeated_invocation_failures"
            iteration = $iteration
            duration_ms = $iterationStopwatch.ElapsedMilliseconds
            exit_code = 2
        })
        exit 2
    }

    $afterHead = Get-HeadCommit -WorkingDirectory $workspacePath
    $output = Get-Content -LiteralPath $iterationLog -Raw
    $statusMatch = [regex]::Match(
        $output,
        "(?m)^LOOP_STATUS: (progress|quiescent|blocked)\s*$"
    )
    $status = if ($statusMatch.Success) {
        $statusMatch.Groups[1].Value
    }
    else {
        "missing"
    }
    $iterationStopwatch.Stop()

    if ($afterHead -ne $beforeHead) {
        $noProgress = 0
        Write-LoopEvent -Event "iteration_finished" -Data ([ordered]@{
            iteration = $iteration
            outcome = "progress"
            reported_status = $status
            head_before = $beforeHead
            head_after = $afterHead
            duration_ms = $iterationStopwatch.ElapsedMilliseconds
            no_progress = $noProgress
        })
        continue
    }

    if ($status -eq "quiescent") {
        Write-LoopEvent -Event "iteration_finished" -Data ([ordered]@{
            iteration = $iteration
            outcome = "quiescent"
            reported_status = $status
            head_before = $beforeHead
            head_after = $afterHead
            duration_ms = $iterationStopwatch.ElapsedMilliseconds
            no_progress = $noProgress
        })
        Write-LoopEvent -Event "loop_stopped" -Data ([ordered]@{
            reason = "quiescent"
            iteration = $iteration
            exit_code = 0
        })
        exit 0
    }

    $noProgress += 1
    Write-LoopEvent -Event "iteration_finished" -Data ([ordered]@{
        iteration = $iteration
        outcome = "no_progress"
        reported_status = $status
        head_before = $beforeHead
        head_after = $afterHead
        duration_ms = $iterationStopwatch.ElapsedMilliseconds
        no_progress = $noProgress
    })
    if ($noProgress -ge $MaxNoProgress) {
        Write-LoopEvent -Event "loop_stopped" -Data ([ordered]@{
            reason = "repeated_no_progress"
            iteration = $iteration
            exit_code = 3
        })
        exit 3
    }
}

Write-LoopEvent -Event "loop_stopped" -Data ([ordered]@{
    reason = "max_iterations"
    iteration = $MaxIterations
    exit_code = 4
})
exit 4
