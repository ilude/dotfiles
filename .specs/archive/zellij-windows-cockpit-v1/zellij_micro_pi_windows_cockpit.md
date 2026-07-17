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

> Implementation constraint: a Zellij pane is bound to a single PTY for its lifetime. "Show the selected session in the bottom pane" cannot be done by swapping pane contents. Concrete mechanisms are discussed in section 8 (dtach/abduco, a Zellij WASM plugin, or parallel panes with focus).

### v3: real agent roster

The right column becomes a real TUI:

```text
Agents
> implementer  working   auth middleware
  tester       idle      test coverage
  reviewer     waiting   review diff
```

Selecting a row switches the active terminal viewport (subject to the PTY constraint noted above).

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

## 5. Windows install integration

This repo installs Windows packages via WinGet DSC: `install.ps1` runs `winget configure -f winget/configuration/<group>.dsc.yaml`. Package lists live in YAML, not ad-hoc scripts. The cockpit integrates with that flow rather than running a parallel installer.

### 5.1 Packages to add to `winget/configuration/core.dsc.yaml`

Most of the cockpit stack is already in `core.dsc.yaml`: `Git.Git`, `Microsoft.PowerShell`, `Microsoft.WindowsTerminal`, `junegunn.fzf`, `sharkdp.fd`, `BurntSushi.ripgrep.MSVC`, `sharkdp.bat`, `ajeetdsouza.zoxide`. `OpenJS.NodeJS` is already in `dev.dsc.yaml`. Only three entries are new:

```yaml
    - resource: Microsoft.WinGet.DSC/WinGetPackage
      directives:
        description: Install Zellij terminal multiplexer
      settings:
        id: Zellij.Zellij  # Zellij (terminal workspace)
        source: winget
    - resource: Microsoft.WinGet.DSC/WinGetPackage
      directives:
        description: Install Micro editor
      settings:
        id: zyedidia.micro  # Micro (non-modal editor)
        source: winget
    - resource: Microsoft.WinGet.DSC/WinGetPackage
      directives:
        description: Install Yazi file manager
      settings:
        id: sxyazi.yazi  # Yazi (file manager)
        source: winget
```

Notes:

- Use `Zellij.Zellij` (upstream package) rather than `arndawg.zellij-windows` (community Windows fork, trails upstream).
- Preserve the `id: <id>  # <Display Name>` comment format (two spaces before `#`); `install.ps1 -ListPackages` parses it.
- Do not add `Microsoft.VCRedist.*`; nothing in the cockpit stack requires an explicit VCRedist pin, and dependent packages pull it transitively.

### 5.2 Pi coding agent

Pi is an npm package, not a WinGet package. After `install.ps1 -Dev` has installed Node.js, install Pi once:

```powershell
npm install -g @mariozechner/pi-coding-agent
```

Verified at time of writing: the package publishes a `pi` binary on PATH.

### 5.3 Helpers in `powershell/profile.ps1`

The repo links `powershell/profile.ps1` via Dotbot. Cockpit helpers go into that file (or a sourced module), not into `$PROFILE.CurrentUserAllHosts` at runtime, so Dotbot remains the single owner of the profile.

Add a section like this to `powershell/profile.ps1`:

```powershell
# region Dev cockpit helpers

$script:DevRoot = Join-Path $HOME 'src'

$env:EDITOR = 'micro'
$env:FZF_DEFAULT_COMMAND = 'fd --type f --hidden --follow --exclude .git'
$env:FZF_CTRL_T_COMMAND  = $env:FZF_DEFAULT_COMMAND
$env:FZF_ALT_C_COMMAND   = 'fd --type d --hidden --follow --exclude .git'

# Yazi on Windows uses Git's file.exe for better previews.
$gitFile = Join-Path $env:ProgramFiles 'Git\usr\bin\file.exe'
if (Test-Path $gitFile) { $env:YAZI_FILE_ONE = $gitFile }

# Yazi wrapper: browse, then cd to the directory you exited from.
function y {
    $tmp = Join-Path $env:TEMP ("yazi-cwd-" + [guid]::NewGuid().ToString())
    yazi @args --cwd-file="$tmp"
    if (Test-Path $tmp) {
        $cwd = (Get-Content $tmp -Raw).Trim()
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        if ($cwd -and (Test-Path $cwd) -and $cwd -ne (Get-Location).Path) {
            Set-Location $cwd
        }
    }
}

# Fuzzy-open a file in Micro from the current directory.
function ff {
    $file = fd --type f --hidden --exclude .git |
        fzf --prompt 'file> ' --preview 'bat --style=numbers --color=always --line-range :200 {}'
    if ($file) { micro $file }
}

# Fuzzy-cd into a directory under the dev root.
function cproj {
    param([string]$Root = $script:DevRoot)
    if (-not (Test-Path $Root)) { New-Item -ItemType Directory -Force -Path $Root | Out-Null }
    $dir = fd . $Root --type d --hidden --exclude .git --max-depth 4 | fzf --prompt 'cd project> '
    if ($dir) { Set-Location $dir }
}

# Fuzzy-pick a project/worktree and launch the Zellij cockpit layout.
function zproj {
    param([string]$Root = $script:DevRoot)
    if (-not (Test-Path $Root)) { New-Item -ItemType Directory -Force -Path $Root | Out-Null }
    $dir = fd . $Root --type d --hidden --exclude .git --max-depth 4 | fzf --prompt 'zellij project> '
    if (-not $dir) { return }
    $leaf = Split-Path $dir -Leaf
    $session = ($leaf -replace '[^A-Za-z0-9_.-]', '-')
    if ($session.Length -gt 40) { $session = $session.Substring(0, 40) }
    Push-Location $dir
    try { zellij --session $session --layout dev }
    finally { Pop-Location }
}

# Fuzzy-open Yazi in a selected directory under the current directory.
function yf {
    $dir = fd . . --type d --hidden --exclude .git --max-depth 5 | fzf --prompt 'yazi dir> '
    if ($dir) { y $dir }
}

# endregion
```

### 5.4 Zellij config and layout

Place the Zellij config tree under the repo (e.g., `config/zellij/`) and link it via `install.conf.yaml` to `%APPDATA%\Zellij\config` so it is managed the same way as the rest of the dotfiles. The layout is deliberately minimal; only documented config keys are used.

`config/zellij/config.kdl`:

```kdl
default_shell "pwsh.exe"
default_mode "locked"
pane_frames true
simplified_ui true
```

> `default_mode "locked"` means Micro and Pi receive raw keys (arrow keys, Ctrl+S, etc.). Press `Ctrl+g` to unlock Zellij controls and navigate panes, then `Ctrl+g` again to re-lock. The layout's Agents pane surfaces this as a reminder.

`config/zellij/layouts/dev.kdl` (split directions: `vertical` = side-by-side columns, `horizontal` = top/bottom rows):

```kdl
layout {
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:compact-bar"
        }
        children
    }

    tab name="workspace" split_direction="vertical" {
        pane name="FM: Yazi" size="22%" command="pwsh.exe" {
            args "-NoLogo" "-NoExit" "-Command" "y"
        }

        pane split_direction="horizontal" size="58%" {
            pane name="Editor: Micro" size="72%" command="pwsh.exe" focus=true {
                args "-NoLogo" "-NoExit" "-Command" "micro ."
            }

            pane name="Active Agent: Pi" size="28%" command="pwsh.exe" {
                args "-NoLogo" "-NoExit" "-Command" "if (Get-Command pi -ErrorAction SilentlyContinue) { pi } else { Write-Host 'Pi not found. Run: npm install -g @mariozechner/pi-coding-agent' }"
            }
        }

        pane name="Agents" size="20%" command="pwsh.exe" {
            args "-NoLogo" "-NoExit" "-Command" "Write-Host 'Agents'; Write-Host '------'; Write-Host '> coordinator'; Write-Host '  implementer'; Write-Host '  tester'; Write-Host '  reviewer'; Write-Host ''; Write-Host 'Ctrl+g toggles Zellij controls.'; Write-Host 'v1: roster/status placeholder'; Write-Host 'v2: agent manager / selector'"
        }
    }
}
```

### 5.5 Install flow

```powershell
~\.dotfiles\install.ps1 -Dev        # installs cockpit packages + Node.js via DSC
npm install -g @mariozechner/pi-coding-agent
# open a new PowerShell 7 window so profile + PATH reload
zproj
```

Useful commands exposed by the profile:

```text
y       # Yazi file manager, cd-on-exit
yf      # fzf-pick a directory, open Yazi there
ff      # fzf-pick a file, open in Micro
cproj   # fzf-pick a project directory and cd into it
zproj   # fzf-pick a project/worktree and open the Zellij cockpit
```

> Inside Zellij: `Ctrl+g` unlocks Zellij controls. Micro and Pi get normal keys while Zellij is locked.

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
Pi       → npm package (@mariozechner/pi-coding-agent); runs where Node runs,
           but verify on the target macOS version before adopting
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

    tab name="workspace" split_direction="vertical" {
        pane name="FM: Yazi" size="22%" command="zsh" {
            args "-lc" "yazi"
        }

        pane split_direction="horizontal" size="58%" {
            pane name="Editor: Micro" size="72%" command="zsh" focus=true {
                args "-lc" "micro ."
            }

            pane name="Active Agent: Pi" size="28%" command="zsh" {
                args "-lc" "command -v pi >/dev/null && pi || echo 'Pi not found. Run: npm install -g @mariozechner/pi-coding-agent'; exec zsh"
            }
        }

        pane name="Agents" size="20%" command="zsh" {
            args "-lc" "printf 'Agents\n------\n> coordinator\n  implementer\n  tester\n  reviewer\n\nCtrl+g toggles Zellij controls.\nv1: roster/status placeholder\nv2: agent manager / selector\n'; exec zsh"
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

This is the hardest unresolved piece of the design. A Zellij pane is bound to a single PTY for its lifetime; there is no "swap the session shown in this pane" primitive. Three realistic mechanisms:

1. **dtach / abduco attach-detach.** The bottom pane runs a thin wrapper that `dtach -a`s to a socket whose path comes from a shared state file (e.g., `.agent/active`). Selecting a role in the right-column roster rewrites the state file and signals the wrapper to detach-and-reattach. Pros: POSIX-standard, works today on macOS and WSL, minimal code. Cons: no native Windows `dtach`; need MSYS2/WSL or a Windows port.
2. **Custom Zellij WASM plugin.** Zellij plugins can own a pane and dispatch commands. A plugin could render the agent roster and spawn/attach to sessions via `zellij action new-pane`/`close-pane`. Pros: first-class Zellij integration. Cons: WASM plugin effort, still constrained by one-PTY-per-pane (plugin would have to close and respawn panes).
3. **Parallel panes with focus-switching.** Skip pane reuse. Each role gets its own bottom pane, stacked or tabbed; the roster sends `zellij action focus-pane-with-name <role>`. Pros: trivial to implement, works on every platform. Cons: loses the "one viewport" UX promise from section 1.

Recommended path: start with (3) for v2, evaluate (1) for v3 once the `.agent/` state contract stabilizes, and only reach for (2) if neither is sufficient.

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

## 9. Prior art and ecosystem context

The "terminal IDE for humans" half of this design is well-trodden ground. The "multi-agent cockpit" half is an active area of community work, mostly on tmux rather than Zellij.

### 9.1 Terminal IDE stacks (Zellij + file manager + editor)

- **Yazelix** ([luccahuguet/yazelix](https://github.com/luccahuguet/yazelix)) -- Nix flake that bundles Zellij + Yazi + Helix/Neovim with pre-solved pane/layout orchestration, sidebar toggle, zellij/helix keybinding deconfliction, starship, zoxide, carapace, and lazygit. Directly addresses the "Yazi opens in the existing editor pane" problem flagged in section 8.
- **"Turning Helix into an IDE with Zellij"** ([Guillermo Aguirre](https://www.guillermoaguirre.dev/articles/helix-to-ide-with-zellij)) -- canonical article on the pattern.
- **Yazi-inside-Helix** ([mrpbennett.dev](https://www.mrpbennett.dev/2026/02/helix-with-yazi)) -- a 2026 technique using `%{buffer_name}` and `\x1b[?1049h` to embed Yazi as a Helix command without a multiplexer at all.
- **g5becks/helix-ide** ([helix-ide](https://github.com/g5becks/helix-ide)) -- Ghostty split where the bottom half runs a Zellij tab with lazygit, yazi, scooter, lazysql, lazyssh.

The community standardizes on **Helix** (or Neovim) as the editor in this stack. Micro is a legitimate choice for non-modal + mouse, but loses LSP and the recipes above.

### 9.2 Multi-agent cockpits (tmux is the de facto runtime)

Claude Code's Agent Teams ships with split-pane support for **tmux and iTerm2 only**. Zellij support is open:

- [claude-code #24122](https://github.com/anthropics/claude-code/issues/24122) -- Agent Teams: add Zellij split-pane support.
- [claude-code #31901](https://github.com/anthropics/claude-code/issues/31901) -- Native Zellij support for Agent Teams and `/terminal-setup`.
- [claude-code #26572](https://github.com/anthropics/claude-code/issues/26572) -- `CustomPaneBackend` protocol proposal to decouple agent teams from tmux CLI so Zellij/WezTerm/Ghostty/KILD can implement independently.

Mature tmux-based orchestrators (worth studying regardless of whether we adopt tmux):

- **CAO** ([awslabs/cli-agent-orchestrator](https://github.com/awslabs/cli-agent-orchestrator)) -- supervisor + workers in isolated tmux sessions, MCP for inter-agent comms.
- **agtx** ([fynnfluegge/agtx](https://github.com/fynnfluegge/agtx)) -- kanban board + one git worktree + one tmux window per task; closest spiritual cousin to this design and it is already built.
- **Batty** -- state-machine supervisor with zone-based tmux layout (architects/managers/engineers in columns), `pipe-pane` logging, `Active → Ready → Idle → PaneDead` FSM.
- **vibe-switch** ([brianjhang/vibe-switch](https://github.com/brianjhang/vibe-switch)) -- tmux-backed multi-agent switcher for Codex/Gemini/Claude.
- **IttyBitty** -- minimalist bash + tmux, Managers spawn Workers.
- **Agent Orchestrator** ([ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator)) -- fleet mode: worktree per agent, CI auto-fix, PR-aware.
- **claude-squad**, **crystal**, **clideck**, **multi-agent-shogun** -- all cataloged in [awesome-agent-orchestrators](https://github.com/andyrewlee/awesome-agent-orchestrators).
- Background read: [How tmux Became the Runtime for AI Agent Teams](https://dev.to/battyterm/how-tmux-became-the-runtime-for-ai-agent-teams-gmi).

### 9.3 Zellij-specific helpers (much smaller pool)

- **claude-code-zellij-status** ([thoo/claude-code-zellij-status](https://github.com/thoo/claude-code-zellij-status)) -- zjstatus plugin streaming Claude activity across Zellij panes with color-coded status symbols. Directly applicable to v3's agent roster.
- **zviewer** ([JosephPeters/zviewer](https://github.com/JosephPeters/zviewer)) -- web UI over Zellij sessions; "works for Claude Code, Gemini CLI, OpenCode."
- Community **Zellij MCP server** -- session/pane/tab/plugin/layout management exposed over MCP, with an `llm_wrapper` that wraps `claude chat` with completion detection markers.

### 9.4 Pi specifics that matter here

- Pi is the minimal engine inside OpenClaw (~14K stars on `pi-mono`, ~160K on OpenClaw). Reference: Armin Ronacher's write-up ([Pi: The Minimal Agent Within OpenClaw](https://lucumr.pocoo.org/2026/1/31/pi/)), the [pi-mono README](https://github.com/badlogic/pi-mono), and the [setup gist](https://gist.github.com/schpet/85531b6a05a5d8119e859bdec6b0e0b8).
- Config dir: `~/.pi/agent/` (override via `PI_CODING_AGENT_DIR`). Skills live under `~/.pi/agent/skills/`; MCP config at `~/.pi/agent/mcp.json`.
- Three run modes: **Interactive** (default TUI), **Print** (`-p`, non-interactive stdout), and **RPC** (`--rpc`, headless JSON protocol on stdin/stdout for embedding in other applications). The RPC mode is the important hook for a custom Agent Manager: it sidesteps the Zellij-pane-PTY problem entirely because the manager owns the session, not a terminal pane.

---

## 10. Design assessment

Honest read after comparing this design to the ecosystem:

### What this design gets right

- **Worktree-per-agent-task** is the dominant pattern (agtx, Composio, Batty all converge on it).
- **`.agent/` as shared workspace state** is a pragmatic inter-agent coordination primitive that aligns with the MCP-based approaches in CAO and the Zellij MCP server.
- **Separating roster/status from active pane** is the correct mental model, even if the implementation is unresolved.

### Where this design swims upstream

1. **Zellij is the minority choice for agent runtimes.** Every mature multi-agent cockpit runs on tmux. Claude Code's Agent Teams does not yet ship Zellij support. Choosing Zellij means building on the less-supported multiplexer for this specific use case and diverging from the ecosystem's muscle memory.
2. **Micro is unusual in this stack.** The Zellij+Yazi community has standardized on Helix. Non-modal + mouse + tabs is Micro's real appeal, but it costs LSP and excludes the ready-made integration recipes (Yazi floating picker, `%{buffer_name}` bridging, Helix/Zellij keybinding deconflict).
3. **The headline UX is the ecosystem's open problem, not a solved thing we're assembling.** "One pane, swap which agent you see" is exactly what the proposed Claude Code `CustomPaneBackend` is trying to standardize. Nobody has a clean Zellij solution today.
4. **Pi's `--rpc` mode is not reflected in the architecture.** Section 4's v2 treats Pi as an interactive blob to wrap with dtach. A cleaner path is a custom TUI Agent Manager that speaks Pi RPC directly and owns sessions in-process -- no PTY swap required.

### Three viable paths forward

The "terminal IDE for humans" half (Zellij + Yazi + editor + fzf) can ship in days and is low-risk. The "multi-agent cockpit" half needs a call:

1. **Stay on Zellij, commit to Pi RPC.** Build a bespoke Agent Manager TUI that speaks `pi --rpc` and renders the roster + active-agent view itself (no Zellij pane swap). Most original; most work. Matches this spec's existing bias.
2. **Move the multi-agent half to tmux.** Inherit the mature ecosystem (agtx, CAO, claude-squad). Keep Zellij for the human-IDE workspace or drop it. Fastest to working; least original.
3. **Wait on `CustomPaneBackend`.** Ship v0/v1 (single Pi terminal, static roster) on Zellij now, and defer v2+ until the Claude Code protocol lands. Cheapest; depends on upstream.

Recommendation: split the spec into **Cockpit-IDE** (ships now, option-independent) and **Agent Manager** (gated on a path choice above). Pick option 1 only if building a bespoke TUI is the actual goal; otherwise 3 → 2 is the pragmatic default.

### Concrete integrations worth borrowing regardless

- Borrow Yazelix's Yazi-picks-file-then-opens-in-managed-editor recipe for section 8's first open question.
- Port `claude-code-zellij-status`'s zjstatus role/status display to Pi for v3's roster.
- Crib the `.agent/agents.json` schema from Claude Code's Agent Teams task list semantics (self-claim, peer unblock, direct peer messaging) rather than inventing one.

---

## 11. Current recommended v1

Use this stack first:

```text
PowerShell 7
Zellij
Micro
Yazi
fzf + fd + ripgrep + bat
Git for Windows
Node.js
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

## 12. Summary

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
