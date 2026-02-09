#!/usr/bin/env bash
# validate-config.sh - Validates dotfiles configuration integrity
# Checks symlinks, directories, Git config, SSH keys, and zsh plugins

# Source shared validation utilities
source "$(dirname "$0")/validate-common.sh"

# Print header
echo "=== Dotfiles Configuration Validator ==="
info "Home directory" "$HOME"
info "ZDOTDIR" "${ZDOTDIR:-$HOME}"

# Dotfiles Installation
section "Dotfiles Installation"
check '[[ -d ~/.dotfiles ]]' ".dotfiles directory exists"
check '[[ -L ~/.zshrc ]]' ".zshrc is symlink"
check '[[ -L ~/.bashrc ]]' ".bashrc is symlink"
check '[[ -L ~/.config/git/config ]]' "git config is symlink (XDG)"
check '[[ -d ~/.dotfiles/zsh/env.d ]]' "zsh/env.d directory exists"
check '[[ -d ~/.dotfiles/zsh/rc.d ]]' "zsh/rc.d directory exists"

# Zsh Plugins (only if zsh is installed)
if command -v zsh >/dev/null 2>&1; then
    section "Zsh Plugins"
    check_warn '[[ -d ~/.zsh/plugins ]]' ".zsh/plugins directory exists"
    check_warn '[[ -d ~/.zsh/plugins/zsh-autosuggestions ]]' "zsh-autosuggestions installed"
    check_warn '[[ -d ~/.zsh/plugins/zsh-syntax-highlighting ]]' "zsh-syntax-highlighting installed"
fi

# Git Configuration
section "Git Configuration"
check 'git config user.name | grep -q .' "Git user.name configured"
check 'git config user.email | grep -q .' "Git user.email configured"
check_warn 'git config core.editor | grep -q .' "Git core.editor set"
check '[[ -f ~/.dotfiles/.gitconfig-personal ]]' ".gitconfig-personal exists"

# SSH Keys
section "SSH Keys"
check_warn '[[ -f ~/.ssh/id_ed25519-personal || -f ~/.ssh/id_ed25519 ]]' "Personal SSH key exists"
check_warn '[[ -f ~/.ssh/id_ed25519-work || -f ~/.ssh/id_ed25519-eagletg ]]' "Work SSH key exists"
check_warn '[[ -f ~/.dotfiles/.gitconfig-personal-local ]]' "Personal SSH config exists"

# Print summary and exit with appropriate code
summary
exit $?
