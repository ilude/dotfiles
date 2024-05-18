############################################################################
#
# Completions
#
############################################################################
zstyle ':completion:*' completer _complete _ignored _files
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
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

source ~/.dotfiles/plugin-functions.sh

export FZF_DEFAULT_OPTS="--ansi --no-info"
plugin "Aloxaf/fzf-tab"
zstyle ':completion:*' menu no

plugin "zsh-users/zsh-autosuggestions"
bindkey '^ ' autosuggest-accept # ctrl+space 

plugin "zsh-users/zsh-completions"
plugin "zsh-users/zsh-syntax-highlighting"
plugin "joshskidmore/zsh-fzf-history-search"

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
# Git Prompt
#
############################################################################

autoload -Uz vcs_info
setopt prompt_subst

zstyle ':vcs_info:*' enable git
zstyle ':vcs_info:*' check-for-changes true
zstyle ':vcs_info:git:*' formats '%F{yellow}[%f%F{green}%b%f%F{yellow}]%f'
zstyle ':vcs_info:git:*' actionformats '%F{yellow}[%f%F{red}%b%f%F{yellow}]%f'

function +vi-git-untracked() {
  if [[ $(git rev-parse --is-inside-work-tree 2>/dev/null) == 'true' ]] && \
     [[ $(git status --porcelain | wc -l) -ne 0 ]]; then
    hook_com[branch]='%F{red}'${hook_com[branch]}'%f'
  fi
}

zstyle ':vcs_info:git+post-backend:*' hooks git-untracked

precmd() { vcs_info }

PROMPT='%~${vcs_info_msg_0_}%f>%(?: : )'

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
alias dps='tput rmam; docker ps --format="table {{.Names}}\\t{{.ID}}\\t{{.Image}}\\t{{.RunningFor}}\\t{{.State}}\\t{{.Status}}" | (sed -u 1q; sort); tput smam'
alias history="history 1"

if type exa &> /dev/null; then
    alias ls=exa
    alias l='exa --color=auto -la --group-directories-first --group'
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

if [[ -f ~/.dircolors ]] ; then
    eval $(dircolors -b ~/.dircolors)
elif [[ -f /etc/DIR_COLORS ]] ; then
    eval $(dircolors -b /etc/DIR_COLORS)
fi