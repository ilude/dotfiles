# Git Bash prompt: ~/.dotfiles[main]>

__set_prompt() {
    local p="$PWD"
    local user="${USERNAME:-$USER}"

    # Normalize path to use ~
    case "$p" in
        /c/Users/$user*) p="~${p#/c/Users/$user}" ;;
        $HOME*) p="~${p#$HOME}" ;;
    esac

    # Get git branch
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
