# CLI tool completions (interactive shells)

# kubectl
if (( ${+commands[kubectl]} )); then
    source <(kubectl completion zsh)
fi

# helm
if (( ${+commands[helm]} )); then
    source <(helm completion zsh)
fi

# GitHub CLI
if (( ${+commands[gh]} )); then
    source <(gh completion -s zsh)
fi

# tailscale
if (( ${+commands[tailscale]} )); then
    source <(tailscale completion zsh 2>/dev/null)
fi

# docker - skip docker info check (too slow), lazy load instead
# Run: _init_docker_completion to enable if needed

# fzf key bindings and completion
if (( ${+commands[fzf]} )); then
    # Try common fzf completion locations
    for fzf_comp in \
        /usr/share/fzf/completion.zsh \
        /usr/share/fzf/key-bindings.zsh \
        "${ZDOTDIR:-$HOME}/.fzf.zsh" \
        /usr/local/opt/fzf/shell/completion.zsh \
        /usr/local/opt/fzf/shell/key-bindings.zsh; do
        [[ -f "$fzf_comp" ]] && source "$fzf_comp"
    done
    true  # Ensure exit 0 even if no fzf completions found
fi
