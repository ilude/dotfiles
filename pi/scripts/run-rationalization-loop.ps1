[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Workspace,

    [string]$PromptPath,

    [string]$StateRoot,

    [ValidateRange(1, 200)]
    [int]$MaxIterations = 48,

    [ValidateRange(1, 20)]
    [int]$MaxInvocationRetries = 5,

    [ValidateRange(1, 10)]
    [int]$MaxNoProgress = 2,

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

function Write-LoopLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $line = "{0} {1}" -f (Get-Date).ToUniversalTime().ToString("o"), $Message
    Add-Content -LiteralPath $script:LoopLog -Value $line -Encoding utf8
    Write-Output $line
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
        [string]$WorkingDirectory
    )

    $extensionRoot = Join-Path $WorkingDirectory "pi/extensions"
    $extensions = @(
        "commit-guard.ts",
        "damage-control.ts",
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
    $arguments.Add("--no-extensions")
    $arguments.Add("--append-system-prompt")
    $arguments.Add($PromptFile)

    foreach ($extension in $extensions) {
        $extensionPath = Join-Path $extensionRoot $extension
        if (-not (Test-Path -LiteralPath $extensionPath -PathType Leaf)) {
            throw "Required extension not found: $extensionPath"
        }
        $arguments.Add("--extension")
        $arguments.Add($extensionPath)
    }

    $arguments.Add(
        "Run the next rationalization loop iteration. Follow the iteration contract and finish with the required RALPH_STATUS marker."
    )
    return $arguments.ToArray()
}

$workspacePath = Resolve-FullPath -Path $Workspace -BasePath (Get-Location).Path
if (-not (Test-Path -LiteralPath $workspacePath -PathType Container)) {
    throw "Workspace not found: $workspacePath"
}

if (-not $PromptPath) {
    $PromptPath = Join-Path $workspacePath "pi/scripts/rationalization-loop-prompt.md"
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
    $StateRoot = Join-Path $localRoot "pi-night-runs/rationalization-345"
}
$statePath = Resolve-FullPath -Path $StateRoot -BasePath $workspacePath
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
    -WorkingDirectory $workspacePath

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
Write-LoopLog "loop started workspace=$workspacePath"

$noProgress = 0
for ($iteration = 1; $iteration -le $MaxIterations; $iteration++) {
    $beforeHead = Get-HeadCommit -WorkingDirectory $workspacePath
    $sessionExists = @(
        Get-ChildItem `
            -LiteralPath $sessionPath `
            -File `
            -Filter "*.jsonl" `
            -Recurse `
            -ErrorAction SilentlyContinue
    ).Count -gt 0
    $arguments = Get-PiArguments `
        -ContinueSession $sessionExists `
        -SessionDirectory $sessionPath `
        -PromptFile $promptFile `
        -WorkingDirectory $workspacePath

    $completed = $false
    $iterationLog = Join-Path $logsPath ("iteration-{0:D3}.log" -f $iteration)
    for ($attempt = 1; $attempt -le $MaxInvocationRetries; $attempt++) {
        Write-LoopLog "iteration=$iteration attempt=$attempt started"
        Push-Location $workspacePath
        try {
            & $piCommand.Source @arguments *> $iterationLog
            $exitCode = $LASTEXITCODE
        }
        finally {
            Pop-Location
        }

        if ($exitCode -eq 0) {
            $completed = $true
            break
        }

        Write-LoopLog "iteration=$iteration attempt=$attempt exit=$exitCode"
        if ($attempt -lt $MaxInvocationRetries) {
            $backoff = [Math]::Min(
                $InitialBackoffSeconds * [Math]::Pow(2, $attempt - 1),
                600
            )
            Start-Sleep -Seconds ([int]$backoff)
        }
    }

    if (-not $completed) {
        Write-LoopLog "loop stopped after repeated invocation failures iteration=$iteration"
        exit 2
    }

    $afterHead = Get-HeadCommit -WorkingDirectory $workspacePath
    $output = Get-Content -LiteralPath $iterationLog -Raw
    $statusMatch = [regex]::Match(
        $output,
        "(?m)^RALPH_STATUS: (progress|quiescent|blocked)\s*$"
    )
    $status = if ($statusMatch.Success) {
        $statusMatch.Groups[1].Value
    }
    else {
        "missing"
    }

    if ($afterHead -ne $beforeHead) {
        $noProgress = 0
        Write-LoopLog "iteration=$iteration committed head=$afterHead status=$status"
        continue
    }

    if ($status -eq "quiescent") {
        Write-LoopLog "loop reached quiescence iteration=$iteration"
        exit 0
    }

    $noProgress += 1
    Write-LoopLog "iteration=$iteration no-progress=$noProgress status=$status"
    if ($noProgress -ge $MaxNoProgress) {
        Write-LoopLog "loop stopped after repeated no-progress iterations"
        exit 3
    }
}

Write-LoopLog "loop reached MaxIterations=$MaxIterations"
exit 4
