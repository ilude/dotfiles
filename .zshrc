plugins=(git zsh-vcs zsh-shift-select zsh-syntax-highlighting zsh-autosuggestions)

autoload -Uz zsh-completions bashcompinit && bashcompinit
autoload -Uz compinit && compinit

if [ -f /mnt/.devcontainer/shell-history ]; then
    HISTFILE=/mnt/.devcontainer/shell-history
fi

HISTSIZE=10000
SAVEHIST=10000
setopt SHARE_HISTORY
setopt EXTENDED_HISTORY

setopt GLOB_COMPLETE
#zstyle ':completion*:default' menu 'select=0'

alias es='env | sort'
alias l='ls --color -lha --group-directories-first'
alias sz='source ~/.zshrc'

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
    echo "%F{yellow}[%f%F{red}${ref}%f%F{yellow}]%f"
  else
    echo ""
  fi
}
setopt PROMPT_SUBST
PS1='%F{green}%M%f:%F{cyan}%~$(_git_branch)$ '

if [ -f ~/.env ]; then
  #echo "sourcing ~/.env..."
  source ~/.env
fi


