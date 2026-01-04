# PowerShell Profile - Optimized for fast startup
# Requires: PowerShell 7.2+
#
# Modules auto-install on first run. CLI tools via winget:
#   winget install junegunn.fzf ajeetdsouza.zoxide

#region Module Auto-Installation

$script:RequiredModules = @(
  'PSReadLine',
  'CompletionPredictor',
  'Terminal-Icons',
  'DockerCompletion',
  'posh-git',
  'PSFzf'
)

# Single-pass module availability check (cached for session)
if (-not $script:AvailableModules) {
  $script:AvailableModules = @{}
  foreach ($mod in $script:RequiredModules) {
    $script:AvailableModules[$mod] = [bool](Get-Module -ListAvailable $mod)
  }
}

# Check and install missing modules (once per session, interactive only)
if ($Host.Name -eq 'ConsoleHost' -and -not $env:PWSH_MODULES_CHECKED) {
  $env:PWSH_MODULES_CHECKED = '1'
  $missing = $script:RequiredModules | Where-Object { -not $script:AvailableModules[$_] }

  if ($missing) {
    Write-Host "Missing PowerShell modules: $($missing -join ', ')" -ForegroundColor Yellow
    $response = Read-Host "Install them now? [Y/n]"
    if ($response -match '^(y|yes)?$') {
      foreach ($mod in $missing) {
        Write-Host "Installing $mod..." -ForegroundColor Cyan
        try {
          Install-Module $mod -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
          Write-Host "  Installed $mod" -ForegroundColor Green
        }
        catch {
          Write-Host "  Failed to install ${mod}: $_" -ForegroundColor Red
        }
      }
      Write-Host "Reloading profile..." -ForegroundColor Cyan
      & $PROFILE
      return
    }
  }
}

#endregion

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

#region Prompt (fast native - no oh-my-posh)

function prompt {
    $p = $PWD.Path.Replace($env:USERPROFILE, '~').Replace('\', '/')
    $branch = git symbolic-ref --short HEAD 2>$null
    if ($branch) {
        Write-Host $p -NoNewline -ForegroundColor Green
        Write-Host "[" -NoNewline -ForegroundColor Yellow
        Write-Host $branch -NoNewline -ForegroundColor Cyan
        Write-Host "]" -NoNewline -ForegroundColor Yellow
        return "> "
    }
    Write-Host $p -NoNewline -ForegroundColor Green
    return "> "
}

#endregion

#region PSReadLine Configuration

# Load CompletionPredictor FIRST (required for HistoryAndPlugin prediction source)
if ($script:AvailableModules['CompletionPredictor']) {
  Import-Module CompletionPredictor -ErrorAction SilentlyContinue
}

if ($script:AvailableModules['PSReadLine']) {
  # Ensure Tab completion always works (basic completion fallback)
  Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete

  # Configure predictive IntelliSense if terminal supports it
  if ($Host.UI.SupportsVirtualTerminal) {
    try {
      # Use Plugin source only if CompletionPredictor is loaded
      $predictionSource = if (Get-Module CompletionPredictor) { 'HistoryAndPlugin' } else { 'History' }
      Set-PSReadLineOption -PredictionSource $predictionSource -ErrorAction SilentlyContinue
      Set-PSReadLineOption -PredictionViewStyle InlineView -ErrorAction SilentlyContinue
      Set-PSReadLineOption -HistorySearchCursorMovesToEnd -ErrorAction SilentlyContinue

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
      # Silently ignore in non-interactive contexts (measurement, scripts, etc.)
    }
  }
}

#endregion

#region Modules (deferred loading for heavy modules)

# Terminal-Icons - defer until first ls/Get-ChildItem (heavy: ~650ms)
$script:TerminalIconsLoaded = $false
function Import-TerminalIconsOnce {
  if (-not $script:TerminalIconsLoaded -and $script:AvailableModules['Terminal-Icons']) {
    Import-Module Terminal-Icons
    $script:TerminalIconsLoaded = $true
  }
}

# PSFzf (fuzzy finder - Ctrl+R for history, Ctrl+T for files)
if ($script:AvailableModules['PSFzf'] -and (Get-Command fzf -ErrorAction SilentlyContinue)) {
  Import-Module PSFzf
  Set-PsFzfOption -PSReadlineChordProvider 'Ctrl+t' -PSReadlineChordReverseHistory 'Ctrl+r'
  Set-PsFzfOption -EnableAliasFuzzyEdit
  Set-PsFzfOption -EnableAliasFuzzyHistory
  Set-PsFzfOption -EnableAliasFuzzyKillProcess
  Set-PsFzfOption -EnableAliasFuzzySetLocation
  Set-PsFzfOption -EnableAliasFuzzyGitStatus
}

# Git/Docker completions - load on first use via argument completers
# posh-git provides git tab completion when loaded
if ($script:AvailableModules['posh-git']) {
  Register-ArgumentCompleter -Native -CommandName git -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    if (-not (Get-Module posh-git)) {
      $env:POSH_GIT_ENABLED = $false
      Import-Module posh-git
    }
    # Let posh-git handle it after loading
    $null
  }
}

if ($script:AvailableModules['DockerCompletion']) {
  Register-ArgumentCompleter -Native -CommandName docker -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    if (-not (Get-Module DockerCompletion)) {
      Import-Module DockerCompletion
    }
    $null
  }
}

#endregion

#region CLI Tool Completions (cached for speed)

$script:CompletionCacheDir = "$env:LOCALAPPDATA\PowerShell\CompletionCache"

function Update-Completions {
  <#
  .SYNOPSIS
  Regenerate cached CLI completions. Run after installing/updating CLI tools.
  #>
  if (-not (Test-Path $script:CompletionCacheDir)) {
    New-Item -ItemType Directory -Path $script:CompletionCacheDir -Force | Out-Null
  }

  $tools = @(
    @{Name='kubectl'; Cmd='kubectl completion powershell'},
    @{Name='helm'; Cmd='helm completion powershell'},
    @{Name='gh'; Cmd='gh completion -s powershell'},
    @{Name='tailscale'; Cmd='tailscale completion powershell'}
  )

  foreach ($tool in $tools) {
    if (Get-Command $tool.Name -ErrorAction SilentlyContinue) {
      Write-Host "Caching $($tool.Name) completions..." -ForegroundColor Cyan
      try {
        Invoke-Expression $tool.Cmd | Out-File "$script:CompletionCacheDir\$($tool.Name).ps1" -Encoding utf8
      }
      catch {
        Write-Host "  Failed: $_" -ForegroundColor Red
      }
    }
  }

  # zoxide
  if (Get-Command zoxide -ErrorAction SilentlyContinue) {
    Write-Host "Caching zoxide init..." -ForegroundColor Cyan
    zoxide init powershell | Out-File "$script:CompletionCacheDir\zoxide.ps1" -Encoding utf8
  }

  Write-Host "Done. Reload profile to use cached completions." -ForegroundColor Green
}

# Load cached completions (generated by install.ps1)
if (Test-Path $script:CompletionCacheDir) {
  Get-ChildItem "$script:CompletionCacheDir\*.ps1" -ErrorAction SilentlyContinue | ForEach-Object {
    . $_.FullName
  }
}

# winget (inline - fast enough)
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

# dotnet (inline - fast enough)
if (Get-Command dotnet -ErrorAction SilentlyContinue) {
  Register-ArgumentCompleter -Native -CommandName dotnet -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    dotnet complete --position $cursorPosition "$commandAst" | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
  }
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

  Import-TerminalIconsOnce

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

# Tree view (like zsh tree alias with eza)
function tree {
  [CmdletBinding()]
  param(
    [Parameter(Position=0)]
    [string]$Path = '.',
    [Alias('L')][int]$Depth = 3,
    [Alias('a')][switch]$All
  )

  # Use eza if available (matches zsh behavior)
  if (Get-Command eza -ErrorAction SilentlyContinue) {
    $args = @('--tree', "--level=$Depth", '--icons')
    if ($All) { $args += '-a' }
    $args += $Path
    & eza @args
  }
  else {
    # Fallback to native PowerShell tree
    function Show-Tree {
      param([string]$Dir, [int]$Level, [int]$MaxDepth, [string]$Prefix = '', [bool]$ShowHidden)
      if ($Level -ge $MaxDepth) { return }

      $items = Get-ChildItem -Path $Dir -Force:$ShowHidden -ErrorAction SilentlyContinue |
               Sort-Object { -not $_.PSIsContainer }, Name

      for ($i = 0; $i -lt $items.Count; $i++) {
        $item = $items[$i]
        $isLast = ($i -eq $items.Count - 1)
        $connector = if ($isLast) { '└── ' } else { '├── ' }
        $color = if ($item.PSIsContainer) { 'Cyan' } else { 'Gray' }

        Write-Host "$Prefix$connector" -NoNewline
        Write-Host $item.Name -ForegroundColor $color

        if ($item.PSIsContainer) {
          $newPrefix = $Prefix + $(if ($isLast) { '    ' } else { '│   ' })
          Show-Tree -Dir $item.FullName -Level ($Level + 1) -MaxDepth $MaxDepth -Prefix $newPrefix -ShowHidden $ShowHidden
        }
      }
    }

    $resolvedPath = Resolve-Path $Path -ErrorAction SilentlyContinue
    if ($resolvedPath) {
      Write-Host (Split-Path $resolvedPath -Leaf) -ForegroundColor Cyan
      Show-Tree -Dir $resolvedPath -Level 0 -MaxDepth $Depth -Prefix '' -ShowHidden $All
    }
    else {
      Write-Error "Path not found: $Path"
    }
  }
}

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
