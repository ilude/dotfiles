# Neovim Setup - LazyVim (VS Code-Like Experience)

## Why Try Neovim?

- Ultimate keyboard-driven editing once learned
- Extremely fast and lightweight
- Infinite customization
- LazyVim provides VS Code-like experience out of the box

## Why LazyVim?

- Pre-configured distribution (not raw neovim)
- VS Code-like: file explorer, terminals, tabs, LSP autocomplete
- Works like an IDE without heavy config
- Easier transition from VS Code

## Installation

```bash
# Install neovim (latest)
yay -S neovim-git  # or neovim-nightly for latest features

# Backup existing config if any
mv ~/.config/nvim ~/.config/nvim.bak 2>/dev/null

# Install LazyVim
git clone https://github.com/LazyVim/starter ~/.config/nvim

# Delete .git folder (don't want the starter repo)
rm -rf ~/.config/nvim/.git
```

## VS Code-Like Features in LazyVim

| VS Code Feature | LazyVim Equivalent |
|-----------------|-------------------|
| File Explorer | Neo-tree (left sidebar) |
| Integrated Terminal | ToggleTerm (Ctrl+`) |
| Tabs | Buffer tabs at top |
| Search Files | Telescope (Ctrl+P) |
| Search in Files | Telescope (Ctrl+Shift+F) |
| Git View | LazyGit integration |
| Extensions | Lazy package manager |
| Settings UI | LazyVim config |

## Essential Keybinds (Memorize These First)

### Navigation
```
Ctrl+P           - Quick open file (Telescope)
Ctrl+Shift+P     - Command palette
Ctrl+[           - Go to definition
Ctrl+]           - Go to definition
Ctrl+O           - Go back
Ctrl+I           - Go forward (after Ctrl+O)
```

### Editing
```
Ctrl+C           - Copy (visual mode = yank)
Ctrl+V           - Paste
Ctrl+Z           - Undo
Ctrl+Y           - Redo
Ctrl+S           - Save file
Ctrl+A           - Select all
```

### Files & Windows
```
Ctrl+B           - Toggle file explorer (Neo-tree)
Ctrl+\           - Open terminal
Ctrl+`           - Toggle terminal
Ctrl+W          - Window operations (follow with h/j/k/l)
Ctrl+W v        - Split vertically
Ctrl+W s        - Split horizontally
Ctrl+W q        - Close split
Ctrl+W h/j/k/l  - Navigate splits
```

### Search & Replace
```
Ctrl+F           - Find in file
Ctrl+H           - Find and replace
Ctrl+Shift+F     - Find in project (Telescope)
```

### Git
```
Ctrl+G           - Open LazyGit (needs lazygit installed)
```

### LSP & Code
```
Ctrl+Space      - Trigger autocomplete
Ctrl+K          - Signature help
F2              - Rename symbol
F3              - Next error
Shift+F3        - Previous error
```

## Installation of Supporting Tools

```bash
# Install lazygit (for Git integration)
yay -S lazygit

# Install ripgrep (for search)
yay -S ripgrep

# Install fd (file finder)
yay -S fd
```

## First-Time Workflow

1. Open nvim - it will auto-install plugins on first launch (wait for "Done" in status)

2. Open a project:
   ```
   nvim .
   ```

3. Open file explorer:
   ```
   Ctrl+B
   ```

4. Open file:
   ```
   Press Enter on file in explorer
   ```

5. Open terminal:
   ```
   Ctrl+\
   ```

6. Close terminal:
   ```
   Ctrl+\
   ```

## Common Issues

**Q: Keybinds not working?**
- Make sure you're in Normal mode (press Esc)
- Check LazyVim docs: lazyvim.org

**Q: LSP not working?**
- Run `:LspInstall` and select language servers
- Or `:Mason` for UI installer

**Q: Want to change settings?**
- Edit `~/.config/nvim/lua/plugins/*.lua` or add to `~/.config/nvim/lua/config/options.lua`

## Comparison: Zed vs Neovim (LazyVim)

| Feature | Zed | Neovim + LazyVim |
|---------|-----|------------------|
| Learning curve | Easy | Medium |
| Speed | Fast | Fast |
| Customization | Good | Infinite |
| VS Code likeness | Very similar | Similar |
| Mouse support | Yes | Limited (intentional) |
| Terminal | Built-in | Built-in |
| AI | Built-in | Need config |

## Decision

- **Try Zed first** - you already use VS Code, Zed is the closest lightweight alternative
- **If you want ultimate keyboard power**, try LazyVim - accepts the learning curve, gains infinite edit speed

## Trial Plan

- [ ] Install LazyVim: `git clone https://github.com/LazyVim/starter ~/.config/nvim`
- [ ] Install lazygit: `yay -S lazygit`
- [ ] Spend 2 hours just practicing keybinds (use `:Tutor`)
- [ ] Use as primary editor for one week
- [ ] Decide: Zed or Neovim?
