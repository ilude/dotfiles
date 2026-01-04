# shellcheck shell=bash disable=SC1009,SC1036,SC1072,SC1073
# Note: This is a zsh file. Shellcheck doesn't fully support zsh syntax.
############################################################################
#
# Completions
#
############################################################################
zstyle ':completion:*' completer _complete _ignored _files
#zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}' special-dirs true
# https://stackoverflow.com/questions/24226685/have-zsh-return-case-insensitive-auto-complete-matches-but-prefer-exact-matches
zstyle ':completion:*' matcher-list '' 'm:{a-zA-Z}={A-Za-z}' 'r:|=*' 'l:|=* r:|=*'
setopt globdots
setopt GLOB_COMPLETE

# make autocompletion
# https://unix.stackexchange.com/a/499322/3098
# zstyle ':completion:*:*:make:*' tag-order 'targets'
zstyle ':completion::complete:make::' tag-order targets
zstyle ':completion::complete:make:*:targets' ignored-patterns '*[?%\:]=*' '$(*)'

# Faster compinit - only regenerate once per day
autoload -Uz compinit
if [[ -n ~/.zcompdump(#qN.mh+24) ]]; then
    compinit
else
    compinit -C  # Skip security check, use cache
fi

############################################################################
#
# Plugins
#
############################################################################

# Fix cursor flickering with autosuggestions on MSYS2/Git Bash
# Async mode causes redraw issues on Windows terminals
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    ZSH_AUTOSUGGEST_USE_ASYNC=0
    ZSH_AUTOSUGGEST_MANUAL_REBIND=1
fi

# Use ZDOTDIR for dotfiles path (MSYS2's zsh has different HOME than Git Bash)
source "${ZDOTDIR:-$HOME}/.dotfiles/zsh-plugins"

bindkey '^ ' autosuggest-accept # ctrl+space 

############################################################################
#
# History
#
############################################################################

HISTFILE=~/.zsh_history

# https://zsh-manual.netlify.app/options#1624-history
export HISTSIZE=100000
export SAVEHIST=100000
export HISTTIMEFORMAT="[%F %T] "

setopt APPEND_HISTORY
setopt EXTENDED_HISTORY
setopt HIST_FIND_NO_DUPS
setopt HIST_IGNORE_DUPS
setopt HIST_REDUCE_BLANKS
setopt SHARE_HISTORY

############################################################################
#
# Keybindings
#
############################################################################

# home and end move cursor to respective line positions 
bindkey  "^[[H"   beginning-of-line
bindkey  "^[[F"   end-of-line

# ctrl+b/f or ctrl+left/right: move word by word (backward/forward)
bindkey '^b' backward-word
bindkey '^f' forward-word
bindkey '^[[1;5D' backward-word
bindkey '^[[1;5C' forward-word

# ctrl+backspace: delete word before
bindkey '^H' backward-kill-word

# ctrl+delete: delete word after
bindkey "\e[3;5~" kill-word


############################################################################
#
# Prompt (fast - just branch name, no status checks)
#
############################################################################

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

############################################################################
#
# Aliases
#
############################################################################

alias nix-gc='nix-store --gc'
alias nix-rs='sudo nixos-rebuild switch'
alias nix-code='code /etc/nixos/configuration.nix'
alias es='env | sort'
alias sz='source ~/.zshrc'
alias ez='$EDITOR ~/.zshrc'
alias dps='tput rmam; docker ps --format="table {{.Names}}\\t{{.ID}}\\t{{.Image}}\\t{{.RunningFor}}\\t{{.State}}\\t{{.Status}}" | (sed -u 1q; sort); tput smam'
alias history="history 1"

if type eza &> /dev/null; then
    alias ls=eza
    alias l='eza --color=auto -la --group-directories-first --group'
    alias tree='eza --tree --level=2'
else
    alias l='ls --color=auto -lhA --group-directories-first'
fi

############################################################################
#
# Exports
#
############################################################################

export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
export HOSTNAME="${HOSTNAME:-$(hostname)}"  # Use existing or fallback
export PATH="$HOME/.local/bin:$PATH"

# Directory colors (skip if dircolors not available, e.g., some Windows setups)
if command -v dircolors >/dev/null 2>&1; then
    if [[ -f ~/.dircolors ]] ; then
        eval $(dircolors -b ~/.dircolors)
    elif [[ -f /etc/DIR_COLORS ]] ; then
        eval $(dircolors -b /etc/DIR_COLORS)
    fi
fi

if [[ "$TERM_PROGRAM" == "vscode" ]]; then
  export EDITOR="code"
else
  export EDITOR="nano"
fi

############################################################################
#
# CLI Tool Completions
#
############################################################################

# kubectl
if command -v kubectl >/dev/null 2>&1; then
    source <(kubectl completion zsh)
fi

# helm
if command -v helm >/dev/null 2>&1; then
    source <(helm completion zsh)
fi

# GitHub CLI
if command -v gh >/dev/null 2>&1; then
    source <(gh completion -s zsh)
fi

# tailscale
if command -v tailscale >/dev/null 2>&1; then
    source <(tailscale completion zsh 2>/dev/null)
fi

# docker - skip docker info check (too slow), lazy load instead
# Run: _init_docker_completion to enable if needed

# fzf key bindings and completion
if command -v fzf >/dev/null 2>&1; then
    # Try common fzf completion locations
    for fzf_comp in \
        /usr/share/fzf/completion.zsh \
        /usr/share/fzf/key-bindings.zsh \
        ~/.fzf.zsh \
        /usr/local/opt/fzf/shell/completion.zsh \
        /usr/local/opt/fzf/shell/key-bindings.zsh; do
        [[ -f "$fzf_comp" ]] && source "$fzf_comp"
    done
    true  # Ensure exit 0 even if no fzf completions found
fi
