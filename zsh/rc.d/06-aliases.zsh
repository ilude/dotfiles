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

# Directory listing (eza or fallback to ls)
if (( ${+commands[eza]} )); then
    alias ls=eza
    alias l='eza --color=auto -la --group-directories-first --group'
    alias tree='eza --tree --level=2'
else
    alias l='ls --color=auto -lhA --group-directories-first'
fi
