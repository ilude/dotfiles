autoload -Uz compinit && compinit
autoload -Uz bashcompinit && bashcompinit

# History-based autosuggestions (shows ghost text from history)
if [[ -f /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]]; then
  source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh
  ZSH_AUTOSUGGEST_STRATEGY=(history completion)
  ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#888888"
  bindkey '^[[Z' autosuggest-accept  # Shift+Tab to accept suggestion
  bindkey '^ ' autosuggest-accept    # Ctrl+Space to accept suggestion
fi

# Syntax highlighting (must be sourced last among plugins)
if [[ -f /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]]; then
  source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
fi

HISTFILE=~/.zsh_history

# https://zsh-manual.netlify.app/options#1624-history
export HISTSIZE=100000
export SAVEHIST=100000
export HISTTIMEFORMAT="[%F %T] "
export PATH="$HOME/.local/bin:$PATH"
setopt APPEND_HISTORY
setopt EXTENDED_HISTORY
setopt HIST_FIND_NO_DUPS
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_SPACE      # Commands starting with space won't be saved
setopt HIST_REDUCE_BLANKS
setopt SHARE_HISTORY

setopt GLOB_COMPLETE
setopt AUTO_CD                # Type directory name to cd into it
setopt AUTO_PUSHD             # cd pushes to directory stack
setopt PUSHD_IGNORE_DUPS      # No duplicates in directory stack
setopt PUSHD_SILENT           # Don't print stack after pushd/popd

# Case-insensitive completion
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'

alias es='env | sort'
alias sz='source ~/.zshrc'
alias dps='tput rmam; docker ps --format="table {{.Names}}\t{{.ID}}\t{{.Image}}\t{{.RunningFor}}\t{{.State}}\t{{.Status}}" | (sed -u 1q; sort); tput smam'
alias history="history 1"
export HOSTNAME=$(hostname)

if type eza &> /dev/null; then
  alias ls=eza
  alias l='eza --color=auto -la --group-directories-first'
elif type exa &> /dev/null; then
  alias ls=exa
  alias l='exa --group --color=auto -la --group-directories-first'
else
  alias l='ls --color=auto -lhA --group-directories-first'
fi

# https://unix.stackexchange.com/a/196558/3098
if [[ -f ~/.dircolors ]] ; then
    eval $(dircolors -b ~/.dircolors)     
elif [[ -f /etc/DIR_COLORS ]] ; then
    eval $(dircolors -b /etc/DIR_COLORS)
fi

if type kubectl &> /dev/null; then
  alias kc='kubectl'
  #plugins( kubectl )
  source <(kubectl completion zsh )
  complete -F __start_kubectl kc

  if [ -f ~/.kube/config ]; then
    echo "Found existing k8s cluster configuration..."
  fi
fi

if type helm &> /dev/null; then
  #plugins( helm )
  source <(helm completion zsh )
fi

# make autocompletion
# https://unix.stackexchange.com/a/499322/3098
zstyle ':completion:*:*:make:*' tag-order 'targets'

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

# Up/Down arrow: search history by prefix (type "git" then up to find git commands)
bindkey '^[[A' history-search-backward
bindkey '^[[B' history-search-forward

# fzf integration for fuzzy history search (Ctrl+R)
if type fzf &> /dev/null; then
  # Use fzf for Ctrl+R history search
  function fzf-history-widget() {
    local selected
    selected=$(fc -rl 1 | awk '{$1=""; print substr($0,2)}' | fzf --height 40% --reverse --tac +s --tiebreak=index --query="${LBUFFER}")
    if [[ -n "$selected" ]]; then
      LBUFFER="$selected"
    fi
    zle redisplay
  }
  zle -N fzf-history-widget
  bindkey '^R' fzf-history-widget
fi

# https://stackoverflow.com/a/65045491
_git_branch() {
  local ref=$(git symbolic-ref --short HEAD 2> /dev/null)
  if [ -n "${ref}" ]; then
    echo "%F{yellow}[%f%F{red}${ref}%f%F{yellow}]"
  else
    echo ""
  fi
}
setopt PROMPT_SUBST
PS1='%F{green}%M%f:%F{cyan}%~$(_git_branch)%f$ '

if [ -f ~/.env ]; then
  #echo "sourcing ~/.env..."
  source ~/.env
fi

export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8