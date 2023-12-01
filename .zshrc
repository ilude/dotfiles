plugins=(git zsh-vcs zsh-shift-select zsh-syntax-highlighting zsh-autosuggestions)

autoload -Uz zsh-completions bashcompinit && bashcompinit
autoload -Uz compinit && compinit

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
setopt HIST_REDUCE_BLANKS
setopt SHARE_HISTORY

setopt GLOB_COMPLETE
#zstyle ':completion*:default' menu 'select=0'

# https://superuser.com/a/448294/29344
export LC_COLLATE="C"

alias es='env | sort'
alias sz='source ~/.zshrc'
alias dps='tput rmam; docker ps --format="table {{.Names}}\t{{.ID}}\t{{.Image}}\t{{.RunningFor}}\t{{.State}}\t{{.Status}}" | (sed -u 1q; sort); tput smam'
alias history="history 1"
export HOSTNAME=$(hostname)

if type exa &> /dev/null; then
  alias ls=exa
  alias l='exa --color=auto -l --icons --group-directories-first'
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

bindkey  "^[[H"   beginning-of-line
bindkey  "^[[F"   end-of-line

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

# https://github.com/nvbn/thefuck#installation
if type thefuck &> /dev/null; then
  eval $(thefuck --alias fu)
fi

#echo "in ~/.zshrc"
