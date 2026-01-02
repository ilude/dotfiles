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

    # Normalize path to ~ (use $HOME which is always set)
    case "$p" in
        "$HOME"*) p="~${p#"$HOME"}" ;;
    esac

    # Get git branch (fast)
    local branch
    branch=$(git symbolic-ref --short HEAD 2>/dev/null)

    # Build prompt
    if [[ -n "$branch" ]]; then
        PS1="\[\e[32m\]$p\[\e[0m\]\[\e[33m\][\[\e[36m\]$branch\[\e[33m\]]\[\e[0m\]> "
    else
        PS1="\[\e[32m\]$p\[\e[0m\]> "
    fi
}

PROMPT_COMMAND=__set_prompt
