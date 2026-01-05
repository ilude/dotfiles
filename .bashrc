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

# Early exit if not running interactively
case $- in
    *i*) ;;
      *) return;;
esac

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
