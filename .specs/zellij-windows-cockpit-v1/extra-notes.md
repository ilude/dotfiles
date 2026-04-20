# Extra Notes: Deferred Design and Reference Material

This file preserves the useful future-facing ideas and reference material from `.specs/zellij_micro_pi_windows_cockpit.md` that are intentionally **out of scope for v1**.

## Original Product Vision
The broader concept is a Windows-native terminal development cockpit using:
- PowerShell 7
- Zellij
- Micro
- Yazi
- fzf/fd/rg/bat
- Pi
- project directories or Git worktrees as workspace boundaries

Long-term desired UX:
- a right-side Agents roster/status column
- a single active agent terminal viewport below Micro
- multiple backing agent sessions behind the scenes
- selection in the roster controls which agent is surfaced

## Project Model Notes
Two valid workspace models were identified:

### Plain directory as project
Examples:
- `C:\src\infra`
- `C:\src\internal-tool`
- `C:\src\client-a`

### Git worktree as project
Preferred for agent work. Examples:
- `C:\src\myapp\main`
- `C:\src\myapp\wt-feature-auth`
- `C:\src\myapp\wt-ai-refactor`

Recommended rule:
- human/default work = normal project directory or main worktree
- agent/task work = Git worktree

## Deferred Agent Architecture

### Deferred role launcher
Original direction:
- right column lists roles like coordinator, implementer, tester, reviewer
- selecting a role starts or restarts Pi with role-specific context

Deferred because role control introduces orchestration behavior not needed for the first cockpit release.

### Deferred persistent agent sessions
Original direction:
- each role gets a persistent backing session
- something like `agentctl start coordinator`
- active terminal shows the selected session

Deferred because this is where PTY/session management becomes a real system design problem.

### Deferred real agent roster
Original direction:
- right column becomes a real TUI
- shows active status, task, waiting/blocked states
- selecting a row changes the active viewport

Deferred because it depends on solved agent lifecycle and session-switching semantics.

### Deferred Pi-aware workspace coordination
Original direction:

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

Example `agents.json` preserved for reference:

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

## Deferred Integration Questions

### Yazi to Micro integration
Easy version:
- Yazi opens files in its own pane/editor flow

Desired version:
- selecting a file in Yazi opens it in the already-running Micro pane, ideally as a new tab

This remains a useful later improvement but should not block cockpit v1.

### Multi-agent process model
Original requirement:
- many persistent Pi sessions
- right-side roster chooses the active one
- selected session appears below Micro

Constraint:
- a Zellij pane is bound to one PTY for its lifetime
- there is no trivial “swap pane contents” primitive

Preserved options from the source spec:
1. **dtach / abduco attach-detach**
   - thin wrapper attaches to a socket indicated by shared state
   - role selection rewrites state and triggers reattach
   - pros: simple on POSIX systems
   - cons: poor native Windows story
2. **Custom Zellij WASM plugin**
   - plugin owns a pane and manages spawn/attach behavior
   - pros: first-class Zellij integration
   - cons: still works around PTY limits and requires plugin effort
3. **Parallel panes with focus-switching**
   - one pane per role, switch focus instead of reusing one pane
   - pros: easiest and most portable
   - cons: weakens the “single active viewport” design goal

Likely later evaluation path:
- start with parallel panes if multi-agent support is needed quickly
- evaluate attach/detach later
- only build a custom plugin if necessary

## Pi-Specific Future Hook
A particularly important future note from the source spec:
- Pi supports **Interactive**, **Print** (`-p`), and **RPC** (`--rpc`) modes
- RPC may be the cleanest long-term way to build a real Agent Manager
- RPC could avoid fighting Zellij’s pane/PTTY model because the manager would own sessions directly

## macOS Portability Notes
Preserved design points:
- the concept is portable
- install path would switch from WinGet to Homebrew
- shell helpers would move from PowerShell to zsh/bash
- Zellij config paths differ by platform
- keyboard behavior may need tuning in macOS terminals

This remains future design guidance only.

## Ecosystem and Prior Art Notes

### Terminal IDE references
- Yazelix is especially relevant for Zellij + file manager + editor integration ideas
- the broader terminal IDE ecosystem tends to standardize on Helix or Neovim
- choosing Micro is valid for non-modal usability, but means fewer ready-made integration recipes

### Multi-agent runtime references
- tmux is the dominant multiplexer for agent teams today
- Zellij support in that ecosystem is still immature
- studying tmux-based systems may still be useful even if the cockpit stays on Zellij

Examples preserved from the source document:
- CAO
- agtx
- Batty
- vibe-switch
- IttyBitty
- Agent Orchestrator
- claude-squad
- crystal
- clideck
- multi-agent-shogun

### Zellij-specific references
- `claude-code-zellij-status` may be relevant for future status/roster rendering
- Zellij MCP server work may inform session control patterns

## Preserved Strategic Options
1. stay on Zellij and build around Pi RPC
2. move the multi-agent half to tmux
3. ship simple Zellij v1 now and defer advanced agent management

## Recommended Deferred Backlog

### v1.1
- better Yazi → Micro handoff
- richer right-pane workspace info
- better session naming and pane labels

### v1.2
- role presets for launching Pi with different prompts
- simple open-role-in-new-pane or new-tab flows
- lightweight `.agent/` conventions only if they become necessary

### v2
- persistent multi-agent sessions
- real roster/status/task UI
- stateful agent selection
- parallel-pane focus switching or Pi RPC-based management

### v3
- custom Agent Manager
- shared state contracts
- richer coordination, logging, and orchestration semantics
