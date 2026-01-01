# Git Bash prompt: ~/.dotfiles[main]>
# This file is sourced by Git Bash's /etc/profile.d/git-prompt.sh

# Normalize path: replace home with ~
__prompt_path() {
    local p="$PWD"
    # Git Bash: USER may be empty, use USERNAME
    local user="${USER:-$USERNAME}"
    local git_bash_home="/c/Users/$user"
    if [[ -n "$user" && "$p" == "$git_bash_home"* ]]; then
        echo "~${p#"$git_bash_home"}"
        return
    fi
    # Fallback to HOME
    if [[ -n "$HOME" && "$p" == "$HOME"* ]]; then
        echo "~${p#"$HOME"}"
        return
    fi
    echo "$p"
}

# Get git branch
__prompt_git() {
    local branch
    branch=$(git branch --show-current 2>/dev/null)
    [[ -n "$branch" ]] && echo "[$branch]"
}

# Build prompt: [root:]path[branch]>
__set_prompt() {
    local path=$(__prompt_path)
    local git=$(__prompt_git)
    local prefix=""

    # Red root: prefix if running as root
    if [[ $EUID -eq 0 ]]; then
        prefix="\[\e[31m\]root:\[\e[0m\]"
    fi

    # Colors: green path, yellow brackets, cyan branch
    if [[ -n "$git" ]]; then
        PS1="${prefix}\[\e[32m\]${path}\[\e[0m\]\[\e[33m\][\[\e[36m\]${git:1:-1}\[\e[33m\]]\[\e[0m\]> "
    else
        PS1="${prefix}\[\e[32m\]${path}\[\e[0m\]> "
    fi
}

PROMPT_COMMAND=__set_prompt
