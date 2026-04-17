# Aliases (interactive shells)

# Git repo sync check — warn before launching coding agents
_git_sync_check() {
    # Skip if not in a git repo
    git rev-parse --is-inside-work-tree &>/dev/null || return 0

    local branch
    branch=$(git symbolic-ref --short HEAD 2>/dev/null) || return 0

    # Uncommitted changes
    local staged unstaged untracked parts=()
    staged=$(git diff --cached --name-only 2>/dev/null | wc -l)
    unstaged=$(git diff --name-only 2>/dev/null | wc -l)
    untracked=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l)
    (( staged > 0 )) && parts+=("${staged} staged")
    (( unstaged > 0 )) && parts+=("${unstaged} modified")
    (( untracked > 0 )) && parts+=("${untracked} untracked")
    if (( ${#parts} > 0 )); then
        printf '\e[33m⚠️  Uncommitted changes on %s: %s\e[0m\n' "'${branch}'" "${(j:, :)parts}"
    fi

    # Fetch and check behind/ahead (5s timeout to avoid blocking)
    git fetch --quiet 2>/dev/null &
    local fetch_pid=$!
    ( sleep 5 && kill $fetch_pid 2>/dev/null ) &>/dev/null &
    wait $fetch_pid 2>/dev/null

    local upstream
    upstream=$(git rev-parse --abbrev-ref '@{upstream}' 2>/dev/null) || return 0
    local behind ahead
    behind=$(git rev-list --count "HEAD..${upstream}" 2>/dev/null)
    ahead=$(git rev-list --count "${upstream}..HEAD" 2>/dev/null)

    if (( behind > 0 && ahead > 0 )); then
        printf '\e[33m⚠️  Branch %s has diverged from %s (%d ahead, %d behind). Consider: git pull --rebase\e[0m\n' "'${branch}'" "'${upstream}'" "$ahead" "$behind"
    elif (( behind > 0 )); then
        printf '\e[33m⚠️  Branch %s is %d commit(s) behind %s. Run: git pull\e[0m\n' "'${branch}'" "$behind" "'${upstream}'"
    fi
}

# Coding agent wrappers — sync check before launch
claude() { _git_sync_check; command claude "$@"; }
opencode() { _git_sync_check; command opencode "$@"; }
pi() { _git_sync_check; command pi "$@"; }

# Claude Code YOLO mode
_run_claude() {
    local claude_bin
    claude_bin="$(whence -p claude 2>/dev/null)" || return 127

    if (( ${+commands[node]} )); then
        command "$claude_bin" "$@"
        return
    fi

    if (( ${+commands[bun]} )); then
        bun "$claude_bin" "$@"
        return
    fi

    command "$claude_bin" "$@"
}

ccyl() {
    clear
    _run_claude --dangerously-skip-permissions --chrome "$@"
}
claude-install() {
    if [[ "$OSTYPE" == "darwin"* ]] && (( ${+commands[brew]} )); then
        brew install --cask claude-code
        return
    fi

    curl -fsSL https://claude.ai/install.sh | bash
}

# NixOS
alias nix-gc='nix-store --gc'
alias nix-rs='sudo nixos-rebuild switch'
alias nix-code='code /etc/nixos/configuration.nix'

# Environment and shell
alias es='env | sort'
alias sz='source ${ZDOTDIR:-$HOME}/.zshrc'
alias ez='$EDITOR ${ZDOTDIR:-$HOME}/.zshrc'
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
