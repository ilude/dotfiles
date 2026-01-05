# Completion configuration (interactive shells)
zstyle ':completion:*' completer _complete _ignored _files
# Case-insensitive matching with preference for exact matches
zstyle ':completion:*' matcher-list '' 'm:{a-zA-Z}={A-Za-z}' 'r:|=*' 'l:|=* r:|=*'
setopt globdots
setopt GLOB_COMPLETE

# Make autocompletion
zstyle ':completion::complete:make::' tag-order targets
zstyle ':completion::complete:make:*:targets' ignored-patterns '*[?%\:]=*' '$(*)'

# Faster compinit - only regenerate once per day
# -u suppresses permission warnings (common on Windows/MSYS2)
# Use ZDOTDIR for MSYS2/Git Bash compatibility
autoload -Uz compinit
_zcompdump="${ZDOTDIR:-$HOME}/.zcompdump"
if [[ -n ${_zcompdump}(#qN.mh+24) ]]; then
    compinit -u -d "$_zcompdump"
else
    compinit -u -C -d "$_zcompdump"  # Skip security check, use cache
fi
unset _zcompdump
