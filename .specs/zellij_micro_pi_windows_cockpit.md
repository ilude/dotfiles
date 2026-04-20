# Windows-Native Zellij + Micro + Pi Agent Cockpit

This document captures the current design for a Windows-native terminal development cockpit using:

- **PowerShell Core / PowerShell 7** as the shell
- **Zellij** as the workspace/session/pane manager
- **Micro** as the non-modal terminal editor
- **Yazi** as the file manager / project tree
- **fzf + fd + ripgrep + bat** as the fuzzy/search/preview stack
- **Pi** as the terminal coding agent runtime
- **Git worktrees or plain directories** as the project/workspace boundary

The goal is to build a terminal-native workspace that feels closer to a lightweight IDE, without requiring VS Code, WSL, tmux, or Vim modal editing.

---

## 1. Core concept

A single workspace represents one project directory or one Git worktree.

```text
Workspace = one current working directory
          = plain project directory
          OR Git worktree
```

Within that workspace, the UI is divided into four conceptual areas:

```text
┌──────────────┬─────────────────────────────────────┬──────────────────────┐
│ File Manager │ Editor                              │ Agents               │
│              │                                     │                      │
│ Yazi         │ Micro                               │ Agent roster/status  │
│ project tree │ open file tabs / splits             │ selector/control     │
│              │                                     │                      │
│              ├─────────────────────────────────────┤                      │
│              │ Active Agent Terminal               │                      │
│              │ selected Pi instance                │                      │
└──────────────┴─────────────────────────────────────┴──────────────────────┘
```

The important design detail is that the **far-right Agents column is not simply a stack of all agent terminals**.

Instead:

```text
Right Agents column     = roster, status, task list, selector
Bottom-center terminal  = currently selected Pi agent terminal
```

So the intended long-term behavior is:

```text
select agent in right column
        ↓
that agent's terminal appears below Micro
```

Behind the scenes, multiple agents may be running for the same workspace/worktree:

```text
agent-runtime/
├── coordinator
├── implementer
├── tester
└── reviewer
```

But only the selected agent is surfaced in the active terminal viewport.

---

## 2. Tool roles

### Zellij

Zellij owns the workspace layout:

- sessions
- tabs
- panes
- layout files
- attach/detach behavior
- the overall terminal cockpit

In this design, Zellij is the primary UI shell.

### Micro

Micro is the editor.

It gives us:

- non-modal editing
- normal keyboard shortcuts
- mouse support
- multiple open files
- tabs
- splits
- terminal-native operation

The editor pane is intended to remain open persistently while the file manager and agent panes support navigation and assistance.

### Yazi

Yazi is the file manager / project browser.

It should show the current project/worktree directory and allow selecting files for editing in Micro.

Initial behavior can be simple:

```text
select file in Yazi → open with Micro
```

A more advanced later behavior would be:

```text
select file in Yazi → open as a tab in the existing Micro pane
```

That second flow requires additional glue.

### fzf / fd / ripgrep / bat

These provide the fuzzy/search layer:

- `fzf` = fuzzy picker
- `fd` = fast file/directory discovery
- `ripgrep` / `rg` = fast content search
- `bat` = preview/highlight output

Example helper flows:

```text
ff     fuzzy-pick file → open in Micro
cproj  fuzzy-pick project directory → cd into it
zproj  fuzzy-pick project directory → launch Zellij layout
```

### Pi

Pi is the terminal coding agent.

The initial version can run one Pi terminal in the active agent pane.

The future version may have an **Agent Manager** that owns multiple Pi processes/sessions and lets the right-side roster select which one is displayed below Micro.

---

## 3. Project model

There are two valid project models.

### Plain directory as project

Good for normal projects:

```text
C:\src\infra
C:\src\internal-tool
C:\src\client-a
```

### Git worktree as project

Preferred for agent work:

```text
C:\src\myapp\main
C:\src\myapp\wt-feature-auth
C:\src\myapp\wt-ai-refactor
```

Recommended rule:

```text
Human/default work = normal project directory or main worktree
Agent/task work    = Git worktree
```

This gives Pi a contained filesystem and Git branch context.

---

## 4. Desired agent architecture

### v0: single active Pi terminal

```text
Agents column: static notes/status
Active terminal: one Pi process
```

This is the easiest prototype.

### v1: role launcher

The right column lists agent roles:

```text
Agents
> coordinator
  implementer
  tester
  reviewer
```

Selecting a role starts or restarts Pi with role-specific context.

### v2: persistent agent sessions

Each role gets a persistent backing session:

```text
agentctl start coordinator
agentctl start implementer
agentctl start tester
agentctl attach tester
```

The active agent terminal below Micro shows the selected session.

### v3: real agent roster

The right column becomes a real TUI:

```text
Agents
> implementer  working   auth middleware
  tester       idle      test coverage
  reviewer     waiting   review diff
```

Selecting a row switches the active terminal viewport.

### v4: Pi-aware coordination

Add workspace-local context:

```text
.agent/
├── README.md
├── shared-context.md
├── status.md
├── agents.json
├── prompts/
│   ├── coordinator.md
│   ├── implementer.md
│   ├── tester.md
│   └── reviewer.md
└── logs/
    ├── coordinator.log
    ├── implementer.log
    ├── tester.log
    └── reviewer.log
```

Agents are instructed to read and update the shared state.

Example `agents.json`:

```json
{
  "workspace": "C:/src/myapp/wt-feature-auth",
  "active": "implementer",
  "agents": [
    {
      "name": "coordinator",
      "role": "coordination and summary",
      "status": "idle",
      "task": "Track progress across agents"
    },
    {
      "name": "implementer",
      "role": "code changes",
      "status": "working",
      "task": "Refactor auth middleware"
    },
    {
      "name": "tester",
      "role": "tests",
      "status": "waiting",
      "task": "Add coverage for auth middleware"
    },
    {
      "name": "reviewer",
      "role": "review",
      "status": "blocked",
      "task": "Review diff after tests pass"
    }
  ]
}
```

---

## 5. Windows install script

Save the following as:

```text
setup-dev-cockpit.ps1
```

Run from PowerShell 7:

```powershell
pwsh -ExecutionPolicy Bypass -File .\setup-dev-cockpit.ps1
```

> Note: the Zellij Winget package used here is currently `arndawg.zellij-windows`. If that package is unavailable or stale, install Zellij from its official Windows release/launcher and rerun the script.

```powershell
# setup-dev-cockpit.ps1
#Requires -Version 7.0

[CmdletBinding()]
param(
    [string]$DevRoot = "$HOME\src",
    [switch]$SkipPi
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path    = "$machinePath;$userPath"
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory)]
        [string]$Id,

        [string]$Name = $Id
    )

    Write-Step "Installing/checking $Name [$Id]"

    $installed = winget list --id $Id -e --accept-source-agreements 2>$null

    if ($LASTEXITCODE -eq 0 -and $installed -match [regex]::Escape($Id)) {
        Write-Host "Already installed: $Name" -ForegroundColor Green
        return
    }

    winget install `
        --exact `
        --id $Id `
        --accept-package-agreements `
        --accept-source-agreements

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "winget failed for $Name [$Id]. Continuing."
    }
}

if ($PSVersionTable.PSEdition -ne "Core") {
    throw "Run this from PowerShell Core / pwsh, not Windows PowerShell 5.1."
}

Write-Step "Installing base packages with winget"

$packages = @(
    @{ Id = "Microsoft.PowerShell";              Name = "PowerShell 7" },
    @{ Id = "Microsoft.WindowsTerminal";        Name = "Windows Terminal" },
    @{ Id = "Git.Git";                          Name = "Git for Windows" },
    @{ Id = "Microsoft.VCRedist.2015+.x64";     Name = "VC++ Redistributable x64" },

    # Cockpit / editor / file manager
    @{ Id = "arndawg.zellij-windows";           Name = "Zellij for Windows" },
    @{ Id = "zyedidia.micro";                   Name = "Micro editor" },
    @{ Id = "sxyazi.yazi";                      Name = "Yazi file manager" },

    # Fuzzy/search stack
    @{ Id = "junegunn.fzf";                     Name = "fzf" },
    @{ Id = "sharkdp.fd";                       Name = "fd" },
    @{ Id = "BurntSushi.ripgrep.MSVC";         Name = "ripgrep" },
    @{ Id = "sharkdp.bat";                      Name = "bat" },
    @{ Id = "ajeetdsouza.zoxide";               Name = "zoxide" },

    # Needed for Pi install via npm
    @{ Id = "OpenJS.NodeJS.LTS";                Name = "Node.js LTS" }
)

foreach ($pkg in $packages) {
    Install-WingetPackage -Id $pkg.Id -Name $pkg.Name
}

Refresh-Path

Write-Step "Creating dev root: $DevRoot"
New-Item -ItemType Directory -Force -Path $DevRoot | Out-Null

Write-Step "Setting user environment defaults"

[Environment]::SetEnvironmentVariable("EDITOR", "micro", "User")
$env:EDITOR = "micro"

# Yazi on Windows wants file.exe from Git for better file detection/previews.
$gitFile = Join-Path $env:ProgramFiles "Git\usr\bin\file.exe"
if (Test-Path $gitFile) {
    [Environment]::SetEnvironmentVariable("YAZI_FILE_ONE", $gitFile, "User")
    $env:YAZI_FILE_ONE = $gitFile
    Write-Host "Set YAZI_FILE_ONE=$gitFile" -ForegroundColor Green
} else {
    Write-Warning "Could not find Git file.exe at $gitFile. Yazi will still run, but file previews may be weaker."
}

if (-not $SkipPi) {
    Write-Step "Installing Pi coding agent via npm"

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        Write-Warning "npm not found in current PATH. Open a new PowerShell 7 window and run:"
        Write-Warning "npm install -g @mariozechner/pi-coding-agent"
    } else {
        npm install -g @mariozechner/pi-coding-agent
    }
}

Write-Step "Writing PowerShell profile helpers"

$profilePath = $PROFILE.CurrentUserAllHosts
$profileDir = Split-Path $profilePath -Parent
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$profileBlockStart = "# >>> dev-cockpit bootstrap >>>"
$profileBlockEnd   = "# <<< dev-cockpit bootstrap <<<"

$profileBlock = @"
$profileBlockStart

# Dev cockpit defaults
`$env:EDITOR = "micro"
`$env:FZF_DEFAULT_COMMAND = "fd --type f --hidden --follow --exclude .git"
`$env:FZF_CTRL_T_COMMAND = `$env:FZF_DEFAULT_COMMAND
`$env:FZF_ALT_C_COMMAND = "fd --type d --hidden --follow --exclude .git"

# zoxide smarter cd
if (Get-Command zoxide -ErrorAction SilentlyContinue) {
    Invoke-Expression (& { (zoxide init powershell | Out-String) })
}

# Yazi wrapper: run `y`, browse with Yazi, and cd to the directory you exited from.
function y {
    `$tmp = Join-Path `$env:TEMP ("yazi-cwd-" + [guid]::NewGuid().ToString())

    yazi @args --cwd-file="`$tmp"

    if (Test-Path `$tmp) {
        `$cwd = (Get-Content `$tmp -Raw).Trim()
        Remove-Item `$tmp -Force -ErrorAction SilentlyContinue

        if (`$cwd -and (Test-Path `$cwd) -and `$cwd -ne (Get-Location).Path) {
            Set-Location `$cwd
        }
    }
}

# Fuzzy-open a file in Micro from the current directory.
function ff {
    `$file = fd --type f --hidden --exclude .git | fzf --prompt "file> " --preview "bat --style=numbers --color=always --line-range :200 {}"
    if (`$file) {
        micro `$file
    }
}

# Fuzzy-cd into a directory under the dev root.
function cproj {
    param(
        [string]`$Root = "$DevRoot"
    )

    if (-not (Test-Path `$Root)) {
        New-Item -ItemType Directory -Force -Path `$Root | Out-Null
    }

    `$dir = fd . `$Root --type d --hidden --exclude .git --max-depth 4 | fzf --prompt "cd project> "
    if (`$dir) {
        Set-Location `$dir
    }
}

# Fuzzy-pick a project/worktree directory and launch the Zellij cockpit layout.
function zproj {
    param(
        [string]`$Root = "$DevRoot"
    )

    if (-not (Test-Path `$Root)) {
        New-Item -ItemType Directory -Force -Path `$Root | Out-Null
    }

    `$dir = fd . `$Root --type d --hidden --exclude .git --max-depth 4 | fzf --prompt "zellij project> "
    if (-not `$dir) {
        return
    }

    `$leaf = Split-Path `$dir -Leaf
    `$session = (`$leaf -replace '[^A-Za-z0-9_.-]', '-')

    Push-Location `$dir
    try {
        zellij --session `$session --layout dev
    } finally {
        Pop-Location
    }
}

# Fuzzy-open Yazi in a selected directory under the current directory.
function yf {
    `$dir = fd . . --type d --hidden --exclude .git --max-depth 5 | fzf --prompt "yazi dir> "
    if (`$dir) {
        y `$dir
    }
}

$profileBlockEnd
"@

if (Test-Path $profilePath) {
    $existing = Get-Content $profilePath -Raw

    if ($existing -match [regex]::Escape($profileBlockStart)) {
        $pattern = "(?s)" + [regex]::Escape($profileBlockStart) + ".*?" + [regex]::Escape($profileBlockEnd)
        $updated = [regex]::Replace($existing, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $profileBlock })
        Set-Content -Path $profilePath -Value $updated -Encoding UTF8
    } else {
        Add-Content -Path $profilePath -Value "`n$profileBlock" -Encoding UTF8
    }
} else {
    Set-Content -Path $profilePath -Value $profileBlock -Encoding UTF8
}

Write-Step "Writing Zellij config and layout"

# On Windows native Zellij, AppData\Roaming\Zellij\config is commonly used.
# We also set ZELLIJ_CONFIG_DIR in the user environment so the path is explicit.
$zellijConfigDir = Join-Path $env:APPDATA "Zellij\config"
$zellijLayoutDir = Join-Path $zellijConfigDir "layouts"

New-Item -ItemType Directory -Force -Path $zellijLayoutDir | Out-Null

[Environment]::SetEnvironmentVariable("ZELLIJ_CONFIG_DIR", $zellijConfigDir, "User")
$env:ZELLIJ_CONFIG_DIR = $zellijConfigDir

$configKdl = @'
default_shell "pwsh.exe"
default_mode "locked"
pane_frames true
simplified_ui true
show_startup_tips false
'@

Set-Content -Path (Join-Path $zellijConfigDir "config.kdl") -Value $configKdl -Encoding UTF8

# Layout shape:
# left: Yazi file manager
# middle top: Micro editor
# middle bottom: active Pi terminal
# right: placeholder agent roster/status pane
$layoutKdl = @'
layout {
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:compact-bar"
        }
        children
    }

    tab name="workspace" split_direction="horizontal" {
        pane name="FM: Yazi" size="22%" command="pwsh.exe" {
            args "-NoLogo" "-NoExit" "-Command" "y"
        }

        pane split_direction="vertical" size="58%" {
            pane name="Editor: Micro" size="72%" command="pwsh.exe" focus=true {
                args "-NoLogo" "-NoExit" "-Command" "micro ."
            }

            pane name="Active Agent: Pi" size="28%" command="pwsh.exe" {
                args "-NoLogo" "-NoExit" "-Command" "if (Get-Command pi -ErrorAction SilentlyContinue) { pi } else { Write-Host 'Pi not found. Run: npm install -g @mariozechner/pi-coding-agent' }"
            }
        }

        pane name="Agents" size="20%" command="pwsh.exe" {
            args "-NoLogo" "-NoExit" "-Command" "Write-Host 'Agents'; Write-Host '------'; Write-Host '> coordinator'; Write-Host '  implementer'; Write-Host '  tester'; Write-Host '  reviewer'; Write-Host ''; Write-Host 'v1: roster/status placeholder'; Write-Host 'v2: agent manager / selector'"
        }
    }
}
'@

Set-Content -Path (Join-Path $zellijLayoutDir "dev.kdl") -Value $layoutKdl -Encoding UTF8

Write-Step "Done"

Write-Host @"

Open a NEW PowerShell 7 tab/window so PATH and profile changes load.

Try:

    cd $DevRoot
    git clone <repo-url>
    zproj

Useful commands:

    y       # Yazi file manager, cd-on-exit
    yf      # fzf-pick a directory, open Yazi there
    ff      # fzf-pick a file, open in Micro
    cproj   # fzf-pick a project directory and cd into it
    zproj   # fzf-pick a project/worktree and open Zellij layout

Inside Zellij:
    Ctrl+g unlocks Zellij controls
    Micro/Pi get normal keys when Zellij is locked

"@ -ForegroundColor Green
```

---

## 6. macOS portability

Nothing in the concept prevents this from working on macOS.

The core tools are cross-platform or have macOS install paths:

```text
Zellij   → macOS supported
Micro    → macOS supported
Yazi     → macOS supported
fzf/fd/rg/bat/zoxide → macOS supported
Git      → macOS supported
Node/npm → macOS supported
Pi       → npm package, likely portable where Node works
```

The main differences are install and path/config locations.

### macOS install sketch with Homebrew

```bash
brew install \
  zellij \
  micro \
  yazi \
  fzf \
  fd \
  ripgrep \
  bat \
  zoxide \
  git \
  node

npm install -g @mariozechner/pi-coding-agent
```

### macOS shell/profile changes

For zsh, add something like this to `~/.zshrc`:

```bash
export EDITOR=micro
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'

eval "$(zoxide init zsh)"

function y() {
  local tmp="$(mktemp -t yazi-cwd.XXXXXX)"
  yazi "$@" --cwd-file="$tmp"
  local cwd
  cwd="$(cat "$tmp" 2>/dev/null)"
  rm -f "$tmp"
  if [ -n "$cwd" ] && [ -d "$cwd" ] && [ "$cwd" != "$PWD" ]; then
    cd "$cwd"
  fi
}

function ff() {
  local file
  file=$(fd --type f --hidden --exclude .git | fzf --prompt 'file> ' --preview 'bat --style=numbers --color=always --line-range :200 {}')
  if [ -n "$file" ]; then
    micro "$file"
  fi
}

function cproj() {
  local root="${1:-$HOME/src}"
  mkdir -p "$root"
  local dir
  dir=$(fd . "$root" --type d --hidden --exclude .git --max-depth 4 | fzf --prompt 'cd project> ')
  if [ -n "$dir" ]; then
    cd "$dir"
  fi
}

function zproj() {
  local root="${1:-$HOME/src}"
  mkdir -p "$root"
  local dir
  dir=$(fd . "$root" --type d --hidden --exclude .git --max-depth 4 | fzf --prompt 'zellij project> ')
  if [ -z "$dir" ]; then
    return
  fi
  local session
  session=$(basename "$dir" | tr -c 'A-Za-z0-9_.-' '-')
  cd "$dir" || return
  zellij --session "$session" --layout dev
}
```

### macOS Zellij config path

On macOS, the Zellij config path may differ from Windows. Common locations include:

```text
~/Library/Application Support/org.Zellij-Contributors.Zellij/config.kdl
```

or, depending on install/config behavior:

```text
~/.config/zellij/config.kdl
```

For portability, you can explicitly set:

```bash
export ZELLIJ_CONFIG_DIR="$HOME/.config/zellij"
```

Then place the layout at:

```text
~/.config/zellij/layouts/dev.kdl
```

The same conceptual `dev.kdl` layout can be adapted by changing `pwsh.exe` commands to `zsh`, `bash`, or `pwsh` depending on preference.

### macOS-adapted Zellij layout sketch

```kdl
layout {
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:compact-bar"
        }
        children
    }

    tab name="workspace" split_direction="horizontal" {
        pane name="FM: Yazi" size="22%" command="zsh" {
            args "-lc" "yazi"
        }

        pane split_direction="vertical" size="58%" {
            pane name="Editor: Micro" size="72%" command="zsh" focus=true {
                args "-lc" "micro ."
            }

            pane name="Active Agent: Pi" size="28%" command="zsh" {
                args "-lc" "command -v pi >/dev/null && pi || echo 'Pi not found. Run: npm install -g @mariozechner/pi-coding-agent'; exec zsh"
            }
        }

        pane name="Agents" size="20%" command="zsh" {
            args "-lc" "printf 'Agents\n------\n> coordinator\n  implementer\n  tester\n  reviewer\n\nv1: roster/status placeholder\nv2: agent manager / selector\n'; exec zsh"
        }
    }
}
```

---

## 7. What could block macOS support?

Nothing architectural blocks macOS support.

The main differences are operational:

1. **Installer**
   - Windows: Winget + npm
   - macOS: Homebrew + npm

2. **Shell syntax**
   - Windows: PowerShell functions
   - macOS: zsh/bash functions

3. **Paths**
   - Windows: `C:\src\project`
   - macOS: `~/src/project`

4. **Zellij config path**
   - Windows: often `%APPDATA%\Zellij\config`
   - macOS: often `~/Library/Application Support/...` or `~/.config/zellij`

5. **PTY/session behavior**
   - The future Agent Manager may need different PTY handling between Windows and macOS.
   - The basic Zellij/Micro/Yazi/Pi layout should be portable.

6. **Keyboard shortcuts**
   - macOS Terminal/iTerm/WezTerm may need Option/Alt behavior tuned for Micro, Zellij, and fzf.

---

## 8. Open design questions

### File manager to editor integration

Current easy behavior:

```text
Yazi opens file in Micro inside the Yazi pane
```

Desired behavior:

```text
Yazi selection opens file in the existing Micro editor pane as a new tab
```

This may require glue around Micro, Zellij actions, or a small helper script.

### Multi-agent process model

Current easy behavior:

```text
one visible Pi terminal
```

Desired behavior:

```text
many persistent Pi sessions
right roster selects which one appears below Micro
```

This likely requires an Agent Manager.

### Agent awareness

Desired:

```text
Pi agents know who else is working in the current worktree
```

Likely first implementation:

```text
.agent/status.md
.agent/agents.json
.agent/shared-context.md
```

Each Pi instance reads/writes shared local state.

---

## 9. Current recommended v1

Use this stack first:

```text
PowerShell 7
Zellij
Micro
Yazi
fzf + fd + ripgrep + bat
Git for Windows
Node.js LTS
Pi
```

Initial UX:

```text
zproj
  → fuzzy-pick project/worktree
  → open Zellij layout
  → Yazi left
  → Micro center-top
  → active Pi center-bottom
  → placeholder agent roster right
```

Then iterate toward:

```text
right roster selects active Pi session
agents share .agent/ state
Micro receives opened files from Yazi/fzf
```

---

## 10. Summary

The current idea is viable on Windows and should be portable to macOS.

The only nontrivial future component is the **Agent Manager**:

```text
Agent Manager
├── owns multiple Pi processes/sessions
├── tracks role/status/task
├── exposes roster UI
├── switches selected agent into the active terminal viewport
└── stores shared workspace state
```

Everything else is straightforward terminal tooling and configuration.
