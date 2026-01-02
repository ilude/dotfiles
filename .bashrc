# shellcheck shell=bash
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
        case "$p" in
            /mnt/c/[Uu]sers/"$USER"*) p="~${p#/mnt/c/[Uu]sers/"$USER"}" ;;
        esac
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
