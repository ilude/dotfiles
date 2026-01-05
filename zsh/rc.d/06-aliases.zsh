# Aliases (interactive shells)

# Claude Code YOLO mode
alias ccyl='claude --dangerously-skip-permissions'
alias claude-install='npm install -g @anthropic-ai/claude-code'

# NixOS
alias nix-gc='nix-store --gc'
alias nix-rs='sudo nixos-rebuild switch'
alias nix-code='code /etc/nixos/configuration.nix'

# Environment and shell
alias es='env | sort'
alias sz='source ~/.zshrc'
alias ez='$EDITOR ~/.zshrc'
alias history="history 1"

# Docker
alias dps='tput rmam; docker ps --format="table {{.Names}}\\t{{.ID}}\\t{{.Image}}\\t{{.RunningFor}}\\t{{.State}}\\t{{.Status}}" | (sed -u 1q; sort); tput smam'

# =============================================================================
# Tool fallback chains - modern tools with graceful degradation
# =============================================================================

# ls: eza > exa > ls
if (( ${+commands[eza]} )); then
    alias ls='eza --color=auto --group-directories-first'
    alias l='eza -la --group-directories-first --group'
    alias ll='eza -la --group-directories-first --group'
    alias tree='eza --tree --level=2'
elif (( ${+commands[exa]} )); then
    alias ls='exa --color=auto --group-directories-first'
    alias l='exa -la --group-directories-first'
    alias ll='exa -la --group-directories-first'
    alias tree='exa --tree --level=2'
else
    alias ls='ls --color=auto'
    alias l='ls -lhA --color=auto --group-directories-first'
    alias ll='ls -lhA --color=auto --group-directories-first'
fi

# cat: bat > batcat > cat (batcat is Debian/Ubuntu package name)
if (( ${+commands[bat]} )); then
    alias cat='bat --paging=never'
    alias less='bat'
elif (( ${+commands[batcat]} )); then
    alias cat='batcat --paging=never'
    alias less='batcat'
fi

# find: fd > fdfind > find (fdfind is Debian/Ubuntu package name)
if (( ${+commands[fd]} )); then
    alias find='fd'
elif (( ${+commands[fdfind]} )); then
    alias find='fdfind'
fi

# grep: rg > grep
(( ${+commands[rg]} )) && alias grep='rg'
