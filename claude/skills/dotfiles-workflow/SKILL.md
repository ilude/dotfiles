---
name: dotfiles-workflow
description: Dotfiles repository management using Dotbot or similar tools. Covers symlink configuration, idempotent installers, cross-platform setup, and shell configuration patterns. Activate when working with dotfiles repos, install scripts, .yaml symlink configs, or shell RC files (.bashrc, .zshrc).
---

# Dotfiles Workflow

Patterns for managing dotfiles repositories with Dotbot and cross-platform installers.

## Repository Structure

```
~/.dotfiles/
├── install                 # Main installer (bash)
├── install.ps1             # Windows installer (PowerShell)
├── install.conf.yaml       # Dotbot config (main)
├── install.wsl.yaml        # Dotbot config (WSL-specific)
├── dotbot/                 # Dotbot submodule
├── .bashrc                 # Bash config
├── .zshrc                  # Zsh config
├── .gitconfig              # Git config
├── config/                 # App-specific configs
│   └── ohmyposh/
├── plugins/                # Shell plugins (submodules)
└── test/                   # Bats tests
```

---

## Dotbot Configuration

### install.conf.yaml

```yaml
- defaults:
    link:
      relink: true    # Replace existing symlinks
      force: true     # Replace existing files
      create: true    # Create parent directories

- clean: ['~']        # Remove dead symlinks from ~

# Cross-platform configs
- link:
    ~/.gitconfig: .gitconfig
    ~/.zshrc: .zshrc
    ~/.bashrc: .bashrc
    ~/.profile: .profile

# Conditional linking (Windows only)
- link:
    ~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1:
      path: powershell/profile.ps1
      if: '[ "$OSTYPE" = "msys" ] || [ -n "$WINDIR" ]'

# Nested config directories
- link:
    ~/.config/ohmyposh/prompt.json: config/ohmyposh/prompt.json
```

### Key Options

| Option | Purpose |
|--------|---------|
| `relink: true` | Replace existing symlinks |
| `force: true` | Replace regular files with symlinks |
| `create: true` | Create parent directories |
| `if: 'condition'` | Conditional linking (shell test) |
| `glob: true` | Expand glob patterns |

---

## Installer Script (Bash)

### Basic install Script

```bash
#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run dotbot
"$DOTFILES_DIR/dotbot/bin/dotbot" \
    -d "$DOTFILES_DIR" \
    -c "$DOTFILES_DIR/install.conf.yaml"

# Post-install hooks
"$DOTFILES_DIR/git-ssh-setup" || true
"$DOTFILES_DIR/zsh-setup" || true

echo "Dotfiles installed successfully!"
```

### With Platform Detection

```bash
#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

is_wsl() {
    [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]] || [[ -n "${WSL_DISTRO_NAME:-}" ]]
}

# Choose config based on platform
if is_wsl; then
    CONFIG="$DOTFILES_DIR/install.wsl.yaml"
else
    CONFIG="$DOTFILES_DIR/install.conf.yaml"
fi

"$DOTFILES_DIR/dotbot/bin/dotbot" -d "$DOTFILES_DIR" -c "$CONFIG"
```

---

## Idempotent Setup Scripts

All setup scripts MUST be safely re-runnable.

### Pattern: Check Before Create

```bash
#!/usr/bin/env bash
set -euo pipefail

setup_symlink() {
    local target="$1"
    local link="$2"

    if [[ -L "$link" ]]; then
        echo "Already linked: $link"
        return 0
    fi

    if [[ -e "$link" ]]; then
        echo "Backing up: $link -> $link.bak"
        mv "$link" "$link.bak"
    fi

    ln -s "$target" "$link"
    echo "Created: $link -> $target"
}
```

### Pattern: Config File Generation

```bash
write_config() {
    local file="$1"
    local content="$2"

    # Check if content already matches
    if [[ -f "$file" ]]; then
        existing=$(cat "$file")
        if [[ "$existing" == "$content" ]]; then
            echo "Already configured: $file"
            return 0
        fi
    fi

    echo "$content" > "$file"
    echo "Created: $file"
}
```

### Pattern: Graceful Failure

```bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$HOME/.dotfiles/.claude"

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "Error: Source not found: $SOURCE_DIR"
    exit 1
fi

# Continue with setup...
```

---

## Shell Configuration Hierarchy

### Load Order

```
Login shell:
  .zprofile → .zshrc (zsh)
  .bash_profile → .bashrc (bash)

Non-login interactive:
  .zshrc (zsh)
  .bashrc (bash)
```

### .zprofile / .bash_profile

Environment setup (PATH, exports):

```bash
# .zprofile
export PATH="$HOME/.local/bin:$PATH"
export EDITOR="vim"

# Platform detection
if [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
    export IS_WSL=1
fi
```

### .zshrc / .bashrc

Interactive shell setup (prompt, aliases, completions):

```bash
# .zshrc
# Prompt
autoload -Uz vcs_info
precmd() { vcs_info }
PROMPT='%~${vcs_info_msg_0_}> '

# Aliases
alias ll='ls -la'
alias gs='git status'

# Completions
autoload -Uz compinit && compinit
```

---

## Git Configuration

### Multi-Identity Setup

```gitconfig
# .gitconfig
[user]
    name = Your Name
    # No email here - set per-context

[includeIf "gitdir:~/personal/"]
    path = ~/.gitconfig-personal

[includeIf "gitdir:~/work/"]
    path = ~/.gitconfig-work

[includeIf "hasconfig:remote.*.url:git@github.com:personal/**"]
    path = ~/.gitconfig-personal

[includeIf "hasconfig:remote.*.url:git@github.com:company/**"]
    path = ~/.gitconfig-work
```

### Identity Files

```gitconfig
# .gitconfig-personal
[user]
    email = personal@example.com
    signingkey = ~/.ssh/id_ed25519-personal

[core]
    sshCommand = ssh -i ~/.ssh/id_ed25519-personal
```

---

## Zsh Plugins

### As Git Submodules

```bash
# Add plugin
git submodule add https://github.com/zsh-users/zsh-autosuggestions plugins/zsh-autosuggestions

# Update all
git submodule update --init --recursive
```

### Loading in .zshrc

```bash
# Source plugins
for plugin in "$HOME/.dotfiles/plugins"/*; do
    if [[ -d "$plugin" ]]; then
        for init in "$plugin"/*.plugin.zsh "$plugin"/*.zsh; do
            [[ -f "$init" ]] && source "$init" && break
        done
    fi
done
```

### Plugin Clone Script

```bash
#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$HOME/.dotfiles/plugins"

clone_plugin() {
    local repo="$1"
    local name="${repo##*/}"
    local target="$PLUGIN_DIR/$name"

    if [[ -d "$target" ]]; then
        echo "Updating: $name"
        git -C "$target" pull --quiet
    else
        echo "Cloning: $name"
        git clone --quiet "https://github.com/$repo" "$target"
    fi
}

clone_plugin "zsh-users/zsh-autosuggestions"
clone_plugin "zsh-users/zsh-syntax-highlighting"
clone_plugin "zsh-users/zsh-completions"
```

---

## Cross-Platform Prompt

### Fast Native Prompt

```bash
# .bashrc / .zshrc
__git_branch() {
    git symbolic-ref --short HEAD 2>/dev/null
}

__prompt_path() {
    local path="$PWD"
    # Normalize Windows paths to ~
    if [[ -n "$WINDIR" ]]; then
        path="${path/#\/c\/Users\/$USER/~}"
    elif [[ -n "$WSL_DISTRO_NAME" ]]; then
        path="${path/#\/mnt\/c\/Users\/$USER/~}"
    else
        path="${path/#$HOME/~}"
    fi
    echo "$path"
}

# Zsh
setopt PROMPT_SUBST
PROMPT='$(__prompt_path)$(__git_branch:+[$(__git_branch)])> '

# Bash
PS1='\[$(__prompt_path)\]\[$(__git_branch:+[$(__git_branch)]\]> '
```

### Why Not oh-my-posh/Starship

- External tools add startup latency
- Simple prompt = faster shell startup
- Native prompt works everywhere without dependencies

---

## Testing Dotfiles

### With Bats

```bash
# test/idempotency.bats
#!/usr/bin/env bats

load test_helper

setup() {
    setup_test_home
    mkdir -p "$HOME/.dotfiles"
}

teardown() {
    teardown_test_home
}

@test "install: runs successfully" {
    run "$DOTFILES_DIR/install"
    [ "$status" -eq 0 ]
}

@test "install: idempotent on second run" {
    "$DOTFILES_DIR/install"
    run "$DOTFILES_DIR/install"
    [ "$status" -eq 0 ]
}

@test "install: creates expected symlinks" {
    "$DOTFILES_DIR/install"
    [ -L "$HOME/.zshrc" ]
    [ -L "$HOME/.gitconfig" ]
}
```

---

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Symlinks not created | Missing `force: true` in dotbot | Add to defaults |
| Script fails on re-run | Not idempotent | Check before create |
| Wrong shell loaded | Login vs non-login | Check shell invocation |
| Git identity wrong | Missing includeIf | Add path-based includes |
| Slow shell startup | Heavy prompt/plugins | Use native prompt, lazy load |
| Windows symlink fails | No admin rights | Use junction for directories |

---

## Makefile Targets

```makefile
.PHONY: install test sync

install:
	./install

test:
	bats test/

sync:
	git pull
	git submodule update --init --recursive
	./install

update-plugins:
	git submodule update --remote --merge
```
