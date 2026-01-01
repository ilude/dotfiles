# PowerShell Profile - Modernized (Dec 2025)
# Requires: PowerShell 7.2+, Oh My Posh
#
# One-time setup (modules):
#   Install-Module PSFzf -Scope CurrentUser
#   Install-Module Terminal-Icons -Scope CurrentUser
#   Install-Module CompletionPredictor -Scope CurrentUser
#   Install-Module DockerCompletion -Scope CurrentUser
#   Install-Module posh-git -Scope CurrentUser
#
# One-time setup (winget):
#   winget install JanDeDobbeleer.OhMyPosh junegunn.fzf ajeetdsouza.zoxide

#region PATH Management

function Add-PathIfNotExists {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)]
    [ValidateNotNullOrEmpty()]
    [string]$PathToAdd
  )

  $pathArray = $env:PATH.ToLower().Split(';')
  if ($pathArray -notcontains $PathToAdd.ToLower()) {
    $env:PATH = "$PathToAdd;$env:PATH"
  }
}

# User binary directories
Add-PathIfNotExists -PathToAdd "$env:USERPROFILE\.local\bin"

#endregion

#region Oh My Posh Prompt

$ohmyposhConfig = "$env:USERPROFILE\.config\ohmyposh\prompt.json"
if (Get-Command oh-my-posh -ErrorAction SilentlyContinue) {
  if (Test-Path $ohmyposhConfig) {
    oh-my-posh init pwsh --config $ohmyposhConfig | Invoke-Expression
  } else {
    # Fallback to built-in theme
    oh-my-posh init pwsh --config "$env:POSH_THEMES_PATH\minimal.omp.json" | Invoke-Expression
  }
}

#endregion

#region PSReadLine Configuration

if ($Host.UI.SupportsVirtualTerminal -and (Get-Module -ListAvailable PSReadLine)) {
  try {
    # Predictive IntelliSense (fish/zsh-autosuggestions style)
    Set-PSReadLineOption -PredictionSource HistoryAndPlugin -ErrorAction Stop
    Set-PSReadLineOption -PredictionViewStyle InlineView
    Set-PSReadLineOption -HistorySearchCursorMovesToEnd

    # Colors (match zsh theme style)
    Set-PSReadLineOption -Colors @{
      Command            = 'Green'
      Parameter          = 'DarkGray'
      String             = 'DarkYellow'
      Variable           = 'Cyan'
      Number             = 'White'
      Operator           = 'White'
      Member             = 'White'
      Type               = 'DarkCyan'
      InlinePrediction   = 'DarkGray'
    }

    # Key bindings (zsh-like)
    Set-PSReadLineKeyHandler -Chord "Ctrl+Spacebar" -Function MenuComplete
    Set-PSReadLineKeyHandler -Chord "Ctrl+f" -Function ForwardWord
    Set-PSReadLineKeyHandler -Chord "Ctrl+b" -Function BackwardWord
    Set-PSReadLineKeyHandler -Chord "Ctrl+a" -Function BeginningOfLine
    Set-PSReadLineKeyHandler -Chord "Ctrl+e" -Function EndOfLine
    Set-PSReadLineKeyHandler -Chord "Ctrl+k" -Function ForwardDeleteLine
    Set-PSReadLineKeyHandler -Chord "Ctrl+u" -Function BackwardDeleteLine

    # Alt+. to insert last argument (like zsh)
    Set-PSReadLineKeyHandler -Chord "Alt+." -Function YankLastArg
  }
  catch {
    # Silently ignore in non-interactive sessions
  }
}

# Load CompletionPredictor if available
if (Get-Module -ListAvailable CompletionPredictor) {
  Import-Module CompletionPredictor -ErrorAction SilentlyContinue
}

#endregion

#region Modules

# Terminal-Icons (file icons in directory listings)
if (Get-Module -ListAvailable Terminal-Icons) {
  Import-Module Terminal-Icons
}

# Docker completion
if (Get-Module -ListAvailable DockerCompletion) {
  Import-Module DockerCompletion
}

# Git completion via posh-git (for tab expansion, not prompt)
if (Get-Module -ListAvailable posh-git) {
  $env:POSH_GIT_ENABLED = $false  # Disable posh-git prompt (we use oh-my-posh)
  Import-Module posh-git
}

# PSFzf (fuzzy finder - Ctrl+R for history, Ctrl+T for files)
if ((Get-Module -ListAvailable PSFzf) -and (Get-Command fzf -ErrorAction SilentlyContinue)) {
  Import-Module PSFzf
  Set-PsFzfOption -PSReadlineChordProvider 'Ctrl+t' -PSReadlineChordReverseHistory 'Ctrl+r'
  Set-PsFzfOption -EnableAliasFuzzyEdit
  Set-PsFzfOption -EnableAliasFuzzyHistory
  Set-PsFzfOption -EnableAliasFuzzyKillProcess
  Set-PsFzfOption -EnableAliasFuzzySetLocation
  Set-PsFzfOption -EnableAliasFuzzyGitStatus
}

#endregion

#region CLI Tool Completions

# kubectl
if (Get-Command kubectl -ErrorAction SilentlyContinue) {
  kubectl completion powershell | Out-String | Invoke-Expression
}

# helm
if (Get-Command helm -ErrorAction SilentlyContinue) {
  helm completion powershell | Out-String | Invoke-Expression
}

# GitHub CLI
if (Get-Command gh -ErrorAction SilentlyContinue) {
  gh completion -s powershell | Out-String | Invoke-Expression
}

# winget
if (Get-Command winget -ErrorAction SilentlyContinue) {
  Register-ArgumentCompleter -Native -CommandName winget -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    [Console]::InputEncoding = [Console]::OutputEncoding = $OutputEncoding = [System.Text.Utf8Encoding]::new()
    $Local:word = $wordToComplete.Replace('"', '""')
    $Local:ast = $commandAst.ToString().Replace('"', '""')
    winget complete --word="$Local:word" --commandline "$Local:ast" --position $cursorPosition | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
  }
}

# dotnet
if (Get-Command dotnet -ErrorAction SilentlyContinue) {
  Register-ArgumentCompleter -Native -CommandName dotnet -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    dotnet complete --position $cursorPosition "$commandAst" | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
  }
}

# tailscale
if (Get-Command tailscale -ErrorAction SilentlyContinue) {
  tailscale completion powershell | Out-String | Invoke-Expression
}

#endregion

#region Aliases and Functions

# Unix-like commands
function env {
  Get-ChildItem Env: | ForEach-Object { "$($_.Name)=$($_.Value)" }
}

function which {
  param(
    [Parameter(Mandatory=$true, Position=0)][string]$Command,
    [Alias('a')][switch]$All
  )
  if ($All) {
    Get-Command $Command -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source }
  } else {
    $cmd = Get-Command $Command -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { $cmd.Source } else { Write-Error "Command not found: $Command" }
  }
}

function grep {
  param(
    [Parameter(Mandatory=$true, Position=0)][string]$Pattern,
    [Parameter(Position=1, ValueFromPipeline=$true)][object]$InputObject,
    [Alias('i')][switch]$IgnoreCase,
    [Alias('v')][switch]$NotMatch,
    [Alias('n')][switch]$LineNumber,
    [Alias('r')][switch]$Recurse
  )
  begin { $lines = @() }
  process {
    if ($InputObject -is [System.IO.FileInfo]) { $lines += $InputObject.FullName }
    elseif ($InputObject -is [string] -and (Test-Path $InputObject -ErrorAction SilentlyContinue)) { $lines += $InputObject }
    elseif ($InputObject) { $lines += $InputObject }
  }
  end {
    $params = @{ Pattern = $Pattern }
    if ($IgnoreCase) { $params.CaseSensitive = $false } else { $params.CaseSensitive = $true }
    if ($NotMatch) { $params.NotMatch = $true }

    # Check if input is file paths or text
    $filePaths = $lines | Where-Object { Test-Path $_ -ErrorAction SilentlyContinue }
    if ($filePaths) {
      $params.Path = $filePaths
      if ($Recurse) { $params.Path = Get-ChildItem -Path $filePaths -Recurse -File | ForEach-Object { $_.FullName } }
      $results = Select-String @params
    } else {
      $results = $lines | Select-String @params
    }

    if ($LineNumber) { $results } else { $results | ForEach-Object { $_.Line } }
  }
}

function touch {
  param([Parameter(Mandatory=$true, Position=0, ValueFromPipeline=$true)][string[]]$Path)
  process {
    foreach ($p in $Path) {
      if (Test-Path $p) { (Get-Item $p).LastWriteTime = Get-Date }
      else { New-Item -ItemType File -Path $p -Force | Out-Null }
    }
  }
}

function head {
  param(
    [Parameter(ValueFromPipeline=$true)][object]$InputObject,
    [Alias('n')][int]$Count = 10,
    [Parameter(Position=0)][string]$Path
  )
  begin { $items = @() }
  process { if ($InputObject) { $items += $InputObject } }
  end {
    if ($Path) { Get-Content $Path -TotalCount $Count }
    elseif ($items) { $items | Select-Object -First $Count }
  }
}

function tail {
  param(
    [Parameter(ValueFromPipeline=$true)][object]$InputObject,
    [Alias('n')][int]$Count = 10,
    [Parameter(Position=0)][string]$Path
  )
  begin { $items = @() }
  process { if ($InputObject) { $items += $InputObject } }
  end {
    if ($Path) { Get-Content $Path -Tail $Count }
    elseif ($items) { $items | Select-Object -Last $Count }
  }
}

# Lightweight directory listing
function l {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$false)]
    [string]$Path = '.'
  )

  try {
    $items = Get-ChildItem -Force -Path $Path -ErrorAction Stop |
             Sort-Object { -not $_.PSIsContainer }, Name

    foreach ($item in $items) {
      $color = if ($item.PSIsContainer) { 'Cyan' }
               elseif ($item.Extension -match '\.exe|\.ps1|\.bat|\.sh') { 'Green' }
               else { 'Gray' }
      $mode = $item.Mode
      $len = if ($item.PSIsContainer) { '<DIR>' }
             else { ('{0,8}' -f ([math]::Round($item.Length / 1KB, 1))) + ' KB' }
      $date = $item.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
      Write-Host ("{0,-11} {1,12} {2,17} {3}" -f $mode, $len, $date, $item.Name) -ForegroundColor $color
    }
  }
  catch {
    Write-Error "Failed to list directory '$Path': $_"
  }
}

Set-Alias -Name ll -Value l -Force

# Profile reload
function Reload-Profile {
  & $PROFILE
}

# Get preferred editor
function Get-Editor {
  $editors = @(
    (Get-Command code -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source),
    "$env:PROGRAMFILES\Microsoft VS Code\bin\code.cmd",
    "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd",
    "$env:WINDIR\System32\notepad.exe"
  )

  foreach ($editor in $editors) {
    if ($editor -and (Test-Path $editor -ErrorAction SilentlyContinue)) {
      return $editor
    }
  }
  return "notepad"
}

#endregion

#region Docker Environment

$env:COMPOSE_CONVERT_WINDOWS_PATHS = 1
$env:DOCKER_BUILDKIT = 1

#endregion

#region Directory Navigation

# zoxide (smart cd - like z/autojump)
if (Get-Command zoxide -ErrorAction SilentlyContinue) {
  Invoke-Expression (& { (zoxide init powershell | Out-String) })
}

#endregion
