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
autoload -Uz compinit
if [[ -n ~/.zcompdump(#qN.mh+24) ]]; then
    compinit -u
else
    compinit -u -C  # Skip security check, use cache
fi
