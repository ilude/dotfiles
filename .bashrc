# shellcheck shell=bash
# Early exit if not running interactively
case $- in
    *i*) ;;
      *) return;;
esac

############################################################################
#
# History Configuration
#
############################################################################

HISTFILE=~/.bash_history
HISTSIZE=100000
HISTFILESIZE=100000
HISTTIMEFORMAT="[%F %T] "
HISTCONTROL=ignoreboth:erasedups

# Append to history instead of overwriting
shopt -s histappend

# Save multi-line commands as single entry
shopt -s cmdhist

# Re-edit failed history substitution
shopt -s histreedit

############################################################################
#
# Shell Options
#
############################################################################

# Case-insensitive globbing
shopt -s nocaseglob

# Autocorrect typos in cd
shopt -s cdspell

# Enable extended globbing (e.g., ?(pattern), *(pattern))
shopt -s extglob

# Check window size after each command
shopt -s checkwinsize

# Include dotfiles in glob expansion
shopt -s dotglob

############################################################################
#
# Completions
#
############################################################################

# Enable programmable completion
if ! shopt -oq posix; then
    # Try common locations for bash-completion
    for comp_file in \
        /usr/share/bash-completion/bash_completion \
        /etc/bash_completion \
        /usr/local/etc/bash_completion \
        /mingw64/share/bash-completion/bash_completion \
        /c/Program\ Files/Git/mingw64/share/bash-completion/bash_completion; do
        if [[ -f "$comp_file" ]]; then
            source "$comp_file"
            break
        fi
    done
fi

# Case-insensitive completion
bind 'set completion-ignore-case on'

# Show all completions on first tab if ambiguous
bind 'set show-all-if-ambiguous on'

# Treat hyphens and underscores as equivalent
bind 'set completion-map-case on'

# Don't expand ~ to full path on completion
bind 'set expand-tilde off'

# Color completions by file type
bind 'set colored-stats on'

# Append slash to completed directories
bind 'set mark-directories on'
bind 'set mark-symlinked-directories on'

# kubectl completion
if command -v kubectl >/dev/null 2>&1; then
    source <(kubectl completion bash)
fi

# helm completion
if command -v helm >/dev/null 2>&1; then
    source <(helm completion bash)
fi

# GitHub CLI completion
if command -v gh >/dev/null 2>&1; then
    source <(gh completion -s bash)
fi

# tailscale completion
if command -v tailscale >/dev/null 2>&1; then
    source <(tailscale completion bash 2>/dev/null)
fi

# docker completion (if available)
if command -v docker >/dev/null 2>&1; then
    for docker_comp in \
        /usr/share/bash-completion/completions/docker \
        /etc/bash_completion.d/docker; do
        if [[ -f "$docker_comp" ]]; then
            source "$docker_comp"
            break
        fi
    done
fi

############################################################################
#
# fzf Integration
#
############################################################################

if command -v fzf >/dev/null 2>&1; then
    # Set fzf default options
    export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border'

    # Try common fzf script locations
    for fzf_script in \
        /usr/share/fzf/key-bindings.bash \
        /usr/share/fzf/completion.bash \
        ~/.fzf.bash \
        /usr/local/opt/fzf/shell/key-bindings.bash \
        /usr/local/opt/fzf/shell/completion.bash \
        /mingw64/share/fzf/key-bindings.bash \
        /mingw64/share/fzf/completion.bash \
        /c/Program\ Files/Git/usr/share/fzf/key-bindings.bash; do
        [[ -f "$fzf_script" ]] && source "$fzf_script"
    done

    # Ctrl+R for fuzzy history search (fallback if fzf scripts not found)
    if ! bind -p | grep -q '__fzf_history__'; then
        __fzf_history__() {
            local selected
            selected=$(history | fzf --tac --no-sort --query="$READLINE_LINE" | sed 's/^[ ]*[0-9]*[ ]*//')
            READLINE_LINE="$selected"
            READLINE_POINT=${#READLINE_LINE}
        }
        bind -x '"\C-r": __fzf_history__'
    fi
fi

############################################################################
#
# Prompt: ~/.dotfiles[main]>
#
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

    # Build prompt with root indicator
    local root_indicator=""
    [[ $EUID -eq 0 ]] && root_indicator="\[\e[31m\]root:\[\e[0m\]"

    if [[ -n "$branch" ]]; then
        PS1="${root_indicator}\[\e[32m\]$p\[\e[0m\]\[\e[33m\][\[\e[36m\]$branch\[\e[33m\]]\[\e[0m\]> "
    else
        PS1="${root_indicator}\[\e[32m\]$p\[\e[0m\]> "
    fi
}

PROMPT_COMMAND=__set_prompt

############################################################################
#
# Aliases
#
############################################################################

# Common shortcuts
alias es='env | sort'
alias sb='source ~/.bashrc'
alias eb='${EDITOR:-nano} ~/.bashrc'
alias dps='tput rmam 2>/dev/null; docker ps --format="table {{.Names}}\t{{.ID}}\t{{.Image}}\t{{.RunningFor}}\t{{.State}}\t{{.Status}}" | (sed -u 1q; sort); tput smam 2>/dev/null'

# ls/eza aliases
if command -v eza >/dev/null 2>&1; then
    alias ls='eza'
    alias l='eza --color=auto -la --group-directories-first --group'
    alias ll='eza --color=auto -la --group-directories-first --group'
    alias tree='eza --tree --level=2'
else
    alias l='ls --color=auto -lhA --group-directories-first 2>/dev/null || ls -lhA'
    alias ll='ls --color=auto -lhA --group-directories-first 2>/dev/null || ls -lhA'
fi

# NixOS shortcuts (only on NixOS)
if [[ -f /etc/NIXOS ]]; then
    alias nix-gc='nix-store --gc'
    alias nix-rs='sudo nixos-rebuild switch'
    alias nix-code='code /etc/nixos/configuration.nix'
fi

############################################################################
#
# Exports
#
############################################################################

export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
export HOSTNAME="${HOSTNAME:-$(hostname)}"
export PATH="$HOME/.local/bin:$PATH"

# Directory colors
if command -v dircolors >/dev/null 2>&1; then
    if [[ -f ~/.dircolors ]]; then
        eval "$(dircolors -b ~/.dircolors)"
    elif [[ -f /etc/DIR_COLORS ]]; then
        eval "$(dircolors -b /etc/DIR_COLORS)"
    fi
fi

# Editor based on environment
if [[ "$TERM_PROGRAM" == "vscode" ]]; then
    export EDITOR="code --wait"
else
    export EDITOR="nano"
fi

############################################################################
#
# zoxide (smart cd)
#
############################################################################

if command -v zoxide >/dev/null 2>&1; then
    eval "$(zoxide init bash)"
fi

############################################################################
#
# ble.sh (Bash Line Editor - fish-like autosuggestions)
# Install: git clone --recursive https://github.com/akinomyoga/ble.sh ~/.local/share/blesh
#          make -C ~/.local/share/blesh
#
############################################################################

# Try build output location first, then installed location
for blesh in ~/.local/share/blesh/out/ble.sh ~/.local/share/blesh/ble.sh; do
    if [[ -f "$blesh" ]]; then
        source "$blesh"
        break
    fi
done
