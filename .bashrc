# shellcheck shell=bash
#
# Minimal Bash Configuration (Fallback)
# ======================================
# This is a minimal bash config used only when zsh is unavailable.
# All main features (autosuggestions, completions, history) are in .zshrc.
# See .bash_profile for the zsh exec that provides unified shell experience.
#

# Debug mode: touch ~/.dotfiles-disabled to bypass all customizations
[[ -f ~/.dotfiles-disabled ]] && return

# Add ~/.local/bin to PATH for all shells (including non-interactive)
# This ensures tools like uv are available in Claude Code hooks
export PATH="$HOME/.local/bin:$PATH"

# Early exit if not running interactively
case $- in
    *i*) ;;
      *) return;;
esac

############################################################################
# Platform Detection Helpers
############################################################################

is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" ]] || \
    [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]] || \
    grep -qi microsoft /proc/version 2>/dev/null
}

is_msys() {
    [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]
}

############################################################################
# Locale Settings
############################################################################

export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

############################################################################
# Editor Settings
############################################################################

export EDITOR="${EDITOR:-code}"
export VISUAL="${VISUAL:-code}"

############################################################################
# Bash Prompt: ~/.dotfiles[main]>
############################################################################

__set_prompt() {
    local p="$PWD"

    # Normalize path to ~
    # In WSL: map Windows home (/mnt/c/Users/$USER) to ~, keep Linux home as full path
    # On other platforms: map $HOME to ~
    if [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
        # WSL: only Windows home becomes ~
        # Use case-insensitive comparison (Windows paths vary in case)
        local user="${USER:-$(whoami)}"
        local p_lower="${p,,}"
        local win_home_lower="/mnt/c/users/${user,,}"
        if [[ "$p_lower" == "$win_home_lower"* ]]; then
            # Strip Windows home prefix, preserving case of remaining path
            p="~${p:${#win_home_lower}}"
        fi
    else
        # Non-WSL: normal $HOME substitution
        case "$p" in
            "$HOME"*) p="~${p#"$HOME"}" ;;
        esac
    fi

    # Get git branch (fast, || true prevents errexit in test environments)
    local branch
    branch=$(git symbolic-ref --short HEAD 2>/dev/null) || true

    # Build prompt
    if [[ -n "$branch" ]]; then
        PS1="\[\e[32m\]$p\[\e[0m\]\[\e[33m\][\[\e[36m\]$branch\[\e[33m\]]\[\e[0m\]> "
    else
        PS1="\[\e[32m\]$p\[\e[0m\]> "
    fi
}

PROMPT_COMMAND=__set_prompt

############################################################################
# Aliases
############################################################################

# Claude Code YOLO mode
alias ccyl='claude --dangerously-skip-permissions'
alias claude-install='npm install -g @anthropic-ai/claude-code'

# Modern tool fallback chains (eza, bat, ripgrep)
if command -v eza &>/dev/null; then
    alias ls='eza --group-directories-first'
    alias ll='eza -la --group-directories-first'
    alias l='eza -l --group-directories-first'
elif command -v exa &>/dev/null; then
    alias ls='exa --group-directories-first'
    alias ll='exa -la --group-directories-first'
    alias l='exa -l --group-directories-first'
else
    alias ll='ls -la'
    alias l='ls -l'
fi

command -v bat &>/dev/null && alias cat='bat --paging=never'
command -v rg &>/dev/null && alias grep='rg'
command -v fd &>/dev/null && alias find='fd'

# Source uv environment if installed (conditional to avoid errors when not present)
# shellcheck source=/dev/null
[[ -f "$HOME/.local/bin/env" ]] && . "$HOME/.local/bin/env"
