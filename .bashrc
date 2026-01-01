# Early exit if not running interactively to avoid side-effects!
# https://pve.proxmox.com/pve-docs/pvecm.1.html
case $- in
    *i*) ;;
      *) return;;
esac

# Switch to zsh in VS Code if available
if [[ "$TERM_PROGRAM" == "vscode" && $(which zsh 2>/dev/null) ]]; then
  exec zsh -l
fi

############################################################################
# Git Bash / Bash Prompt: ~/.dotfiles[main]>
############################################################################

# Normalize path: replace home with ~, handle Windows paths
__prompt_path() {
    local p="$PWD"
    # Replace home directory with ~
    local home="$HOME"
    if [[ -n "$home" && "$p" == "$home"* ]]; then
        p="~${p#"$home"}"
        echo "$p"
        return
    fi
    # Handle /c/Users/username style (Git Bash) - use USERNAME since USER may be empty
    local user="${USER:-$USERNAME}"
    local git_bash_home="/c/Users/$user"
    if [[ -n "$user" && "$p" == "$git_bash_home"* ]]; then
        p="~${p#"$git_bash_home"}"
        echo "$p"
        return
    fi
    # Handle /mnt/c/Users/username style (WSL)
    local wsl_win_home="/mnt/c/Users/$user"
    if [[ -n "$user" && "$p" == "$wsl_win_home"* ]]; then
        p="~${p#"$wsl_win_home"}"
        echo "$p"
        return
    fi
    echo "$p"
}

# Get git branch
__prompt_git() {
    local branch
    branch=$(git branch --show-current 2>/dev/null)
    if [[ -n "$branch" ]]; then
        echo "[$branch]"
    fi
}

# Set prompt: green path, yellow brackets, cyan branch
# Format: [root:]~/.dotfiles[main]>
__set_prompt() {
    local path=$(__prompt_path)
    local git=$(__prompt_git)
    local prefix=""

    # Add root: prefix if running as root
    if [[ $EUID -eq 0 ]]; then
        prefix="\[\e[31m\]root:\[\e[0m\]"
    fi

    # Colors: \[\e[31m\]=red, \[\e[32m\]=green, \[\e[33m\]=yellow, \[\e[36m\]=cyan, \[\e[0m\]=reset
    if [[ -n "$git" ]]; then
        PS1="${prefix}\[\e[32m\]${path}\[\e[0m\]\[\e[33m\][\[\e[36m\]${git:1:-1}\[\e[33m\]]\[\e[0m\]> "
    else
        PS1="${prefix}\[\e[32m\]${path}\[\e[0m\]> "
    fi
}

# Override Git Bash's default PROMPT_COMMAND
PROMPT_COMMAND=__set_prompt
