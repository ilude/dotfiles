# History configuration (interactive shells)
# Use ZDOTDIR for MSYS2/Git Bash compatibility (different HOME directories)
HISTFILE="${ZDOTDIR:-$HOME}/.zsh_history"

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
