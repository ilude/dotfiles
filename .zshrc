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

autoload -Uz compinit
compinit

############################################################################
#
# Plugins
#
############################################################################

source ~/.dotfiles/zsh-plugins

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

# Fast path (maps Windows home to ~, shows Linux home as full path)
__prompt_path() {
    local p="$PWD"
    case "$p" in
        /mnt/c/Users/${USER:-$USERNAME}*) echo "~${p#/mnt/c/Users/${USER:-$USERNAME}}" ;;
        *) echo "$p" ;;
    esac
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
export HOSTNAME=$(hostname)
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

# docker (if docker CLI actually works, not just a WSL shim)
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    source <(docker completion zsh 2>/dev/null)
fi

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
