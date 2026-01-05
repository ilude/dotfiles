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
# Use ZDOTDIR for MSYS2/Git Bash compatibility
#
# SECURITY TRADEOFF: -u flag suppresses "insecure directories" warnings
# Why needed: MSYS2/Git Bash has permission mismatches - completion dirs are
# often group/world-writable by Windows standards but safe in practice.
# Without -u: compinit prompts interactively, breaking non-interactive shells.
# Risk: Malicious completion files in /usr/share/zsh could be loaded.
# Mitigation: This is a personal workstation, not a shared server.
autoload -Uz compinit
_zcompdump="${ZDOTDIR:-$HOME}/.zcompdump"
if [[ -n ${_zcompdump}(#qN.mh+24) ]]; then
    compinit -u -d "$_zcompdump"
else
    compinit -u -C -d "$_zcompdump"  # Skip security check, use cache
fi
unset _zcompdump

# Auto-compile zsh files for faster startup (creates .zwc files)
# Only recompiles if source is newer than compiled version
() {
    local f
    local zdot="${ZDOTDIR:-$HOME}"
    for f in "$zdot/.zshrc" "$zdot/.zshenv" \
             "$zdot/.dotfiles/zsh"/{env.d,rc.d}/*.zsh(N); do
        [[ -f "$f" && (! -f "$f.zwc" || "$f" -nt "$f.zwc") ]] && \
            zcompile "$f" 2>/dev/null
    done
}
