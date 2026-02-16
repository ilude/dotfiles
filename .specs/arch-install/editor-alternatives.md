# Lightweight Editor Alternatives to VS Code

## Context

- Currently uses VS Code
- Uncomfortable with neovim/modal editing paradigm
- Wants lighter weight option
- Needs full IDE features: file explorer + terminal + editor in one view
- OpenCode is for AI interaction, not full IDE replacement

## Options (with IDE features)

### Zed (PRIMARY RECOMMENDATION)
- Rust-based, extremely fast
- Full IDE: file explorer + terminal + editor panes
- Not modal (like VS Code)
- AI partner built-in
- Lightweight compared to VS Code
- **Install:** `yay -S zed` (AUR) or download from zed.dev
- **Verdict:** Best fit - matches VS Code workflow without the bloat

### Neovim + LazyVim (FOR WHEN YOU'RE READY)
- If you want to eventually master modal editing
- LazyVim is a pre-configured neovim that feels like VS Code
- Full IDE features: file explorer, terminal, LSP, autocomplete
- See `.specs/arch-install/neovim-setup.md` for full setup
- **Install:** `yay -S neovim` + LazyVim starter
- **Verdict:** Higher learning curve but ultimate keyboard power

### Lapce
- Rust-based, VS Code-like layout
- Full IDE features
- Not modal
- Good performance
- Less mature than Zed
- **Install:** `yay -S lapce` (AUR)
- **Verdict:** Backup if Zed doesn't work out

### OpenCode
- Use for AI-assisted editing sessions
- Not a full IDE (no integrated terminal + file explorer)
- Good for quick edits + AI interaction
- Keep in stack, but not primary editor

## Recommendation

**Primary: Zed** - VS Code-like, lightweight, full IDE features
- Install with: `yay -S zed`

**For AI: OpenCode** - Use alongside Zed for Claude AI interactions
- Not a full IDE, but excellent for AI-assisted editing sessions

**Future: Neovim + LazyVim** - If you want to eventually try modal editing
- See `.specs/arch-install/neovim-setup.md` for VS Code-like neovim config

## Installation

```bash
# Via AUR (recommended)
yay -S zed

# Or download from https://zed.dev
```

## Keybinds to Learn (Zed)

```
Cmd+S           - Save
Cmd+P           - Quick open file
Cmd+Shift+P     - Command palette
Cmd+F           - Find in file
Cmd+H           - Find and replace
Cmd+Shift+F     - Find in project
Cmd+B           - Toggle sidebar (file explorer)
Cmd+`           - Toggle terminal
Cmd+1-9         - Switch between open files/panes
Cmd+K Cmd+T     - Open new terminal in project dir
Cmd+\           - Split pane (editor)
Cmd+W           - Close pane
Cmd+Shift+W     - Close all panes
```

## Workflow with Niri Workspaces

Each workspace = one project:
```
WS1: Zed (project-a) + terminal + yazi
WS2: Zed (project-b) + terminal + yazi
```

Zed's terminal will be your main terminal per workspace, with yazi for file navigation when needed.

## Trial Plan

- [ ] Install Zed: `yay -S zed`
- [ ] Configure: set up project directory, keybindings
- [ ] Try for one week as primary editor
- [ ] Compare to VS Code: is anything missing?
- [ ] If Zed works, uninstall VS Code to force habit
