# Git Bash prompt: ~/.dotfiles[main]>
# This file is sourced by Git Bash's /etc/profile.d/git-prompt.sh

# Normalize path: replace home with ~
__prompt_path() {
    local p="$PWD"
    # Git Bash: USER may be empty, use USERNAME
    local user="${USER:-$USERNAME}"
    local git_bash_home="/c/Users/$user"
    if [[ -n "$user" && "$p" == "$git_bash_home"* ]]; then
        p="~${p#"$git_bash_home"}"
    elif [[ -n "$HOME" && "$p" == "$HOME"* ]]; then
        p="~${p#"$HOME"}"
    fi
    printf '%s' "$p"
}

# Get git branch (fast, no network)
__prompt_git() {
    # Use git symbolic-ref which is faster than branch --show-current
    local branch
    branch=$(git symbolic-ref --short HEAD 2>/dev/null) || return
    printf '[%s]' "$branch"
}

# Build prompt: [root:]path[branch]>
__set_prompt() {
    local path git prefix=""
    path=$(__prompt_path)
    git=$(__prompt_git)

    # Red root: prefix if running as root
    [[ $EUID -eq 0 ]] && prefix='\[\e[31m\]root:\[\e[0m\]'

    # Colors: green path, yellow brackets, cyan branch
    if [[ -n "$git" ]]; then
        PS1="${prefix}\[\e[32m\]${path}\[\e[0m\]\[\e[33m\][\[\e[36m\]${git:1:-1}\[\e[33m\]]\[\e[0m\]> "
    else
        PS1="${prefix}\[\e[32m\]${path}\[\e[0m\]> "
    fi
}

PROMPT_COMMAND=__set_prompt
