# Keyboard-Driven Workflow - Research & Training Notes

## Goal

Transition from mouse-heavy Windows workflow to keyboard-driven 
Niri/Wayland desktop. Track tools, experiments, and progress.

## User Context

- Development: Python, Golang, TypeScript + Docker
- Previous Linux: Ubuntu Server (CLI only)
- Previous Desktop: KDE 3 (early 2000s) with True Launch Bar
- Current monitor: Single ultrawide 34"
- Goal: Get MUCH better at keyboard shortcuts
- **Workflow: Multiple workspaces (9 total), each with git worktree project**

## Problem

Coming from True Launch Bar (icon-click launcher) and years of 
mouse-driven Windows usage. Need to build new muscle memory for 
keyboard-first interaction.

## Solutions to Investigate

### Mouse Usage Monitoring
- [ ] libinput debug-events - log raw mouse/keyboard event counts
- [ ] Custom script: correlate mouse clicks with niri IPC state, 
      suggest keybind via mako notification
- [ ] Waybar module showing daily mouse click count

### Keybind Learning
- [ ] Keyviz - real-time keystroke visualizer (awareness tool)
- [ ] Cheatsheet overlay (Super+? fullscreen keybind reference)
- [ ] nwg-wrapper or similar for persistent keybind cheatsheet widget

### Habit Building
- [ ] "Mouse-free" training sessions (30 min/day)
- [ ] Keynav - control mouse cursor via keyboard (transition tool)
- [ ] Atuin - smarter shell history (reduce repetitive typing)

### Custom Tool Ideas
- [ ] Mouse-to-keybind coach: monitor libinput + niri IPC, 
      pop mako notification with keyboard alternative
- [ ] Weekly report: mouse clicks vs keyboard shortcuts used
- [ ] Gamification: streak counter for mouse-free periods

## Keybind Reference (Niri defaults to customize)

### Workspace Navigation (PRIMARY - use these!)
| Action | Keybind |
|---|---|
| Switch to workspace 1-9 | Super+1-9 |
| Move window to workspace | Super+Shift+1-9 |
| Cycle workspaces | Super+Tab |
| Move window to next/prev workspace | Super+Shift+[ / Super+Shift+] |
| Bring window from another workspace | Super+Shift+Tab |

### Window Management
| Action | Keybind |
|---|---|
| Open terminal | Super+Return |
| App launcher (wofi) | Super+D |
| Close window | Super+Q |
| Move focus left/right | Super+H / Super+L |
| Move focus up/down | Super+J / Super+K |
| Move window | Super+Shift+H/J/K/L |
| Fullscreen toggle | Super+F |
| Toggle floating | Super+V |
| Resize window | Super+R + arrow keys |

### Applications
| Action | Keybind |
|---|---|
| File manager (yazi) | Super+Y |
| Screenshot (select) | Super+Shift+S |
| Screenshot (screen) | Super+S |
| Browser (Brave) | Super+B |

## Workspace/Project Workflow

Each workspace = one git worktree project. Always running in that workspace:
- Terminal → already cd'd into project directory
- Yazi → already in project directory  
- Browser → localhost:3000 (dev server) or project docs

**Suggested keybinds for this workflow:**
```
Super+Return   → Terminal (wezterm, already in project dir)
Super+Tab      → Next workspace (next project)
Super+Shift+Tab → Previous workspace
Super+R        → Rename workspace to project name
```

**Startup automation idea:**
- Create per-workspace startup script that launches terminal + browser + opens project in yazi
- Could use niri's workspace exec config or a simple script

## Experiment Log

<!-- Track what you tried and whether it worked -->

| Date | Tool/Method | Result | Keep? |
|---|---|---|---|
| | | | |
