# Prompt configuration (interactive shells)
setopt prompt_subst

# Fast path - normalize path to ~
# In WSL: map Windows home (/mnt/c/Users/$USER) to ~, keep Linux home as full path
# On other platforms: map $HOME to ~ (use ZDOTDIR if set, for MSYS2 compatibility)
__prompt_path() {
    local p="$PWD"
    if [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
        # WSL: only Windows home becomes ~
        # Use case-insensitive comparison (Windows paths vary in case)
        local user="${USER:-$(whoami)}"
        local p_lower="${(L)p}"
        local win_home_lower="/mnt/c/users/${(L)user}"
        if [[ "$p_lower" == "$win_home_lower"* ]]; then
            # Strip Windows home prefix, preserving case of remaining path
            p="~${p:${#win_home_lower}}"
        fi
    else
        # Non-WSL: use ZDOTDIR if set (MSYS2 zsh has wrong HOME), else HOME
        local home="${ZDOTDIR:-$HOME}"
        if [[ "$p" == "$home"* ]]; then
            p="~${p#$home}"
        fi
    fi
    echo "$p"
}

# Fast git prompt (no status checks)
__git_prompt() {
    local b=$(git symbolic-ref --short HEAD 2>/dev/null)
    [[ -n "$b" ]] && echo "%F{yellow}[%F{cyan}${b}%F{yellow}]%f"
}

# Prompt: [root:]~/.dotfiles[main]>
PROMPT='%(#.%F{red}root:%f.)%F{green}$(__prompt_path)%f$(__git_prompt)> '
