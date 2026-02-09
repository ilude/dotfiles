# Non-blocking SSH agent initialization
# Runs in background to avoid startup delay
#
# Skip if:
# - VS Code terminal (has its own agent via remote-ssh)
# - SSH_AUTH_SOCK already set (agent already running)
# - Windows Git Bash (uses Windows SSH agent via GIT_SSH)

# Only on interactive shells, not in VS Code terminal
if [[ -z "$VSCODE_INJECTION" && -z "$SSH_AUTH_SOCK" ]] && ! is_windows; then
    local agent_env="${HOME}/.ssh/agent-env"

    # Try to reuse existing agent
    if [[ -f "$agent_env" ]]; then
        source "$agent_env" > /dev/null
        # Check if agent is still running
        if kill -0 "$SSH_AGENT_PID" 2>/dev/null; then
            return 0
        fi
    fi

    # Start a new agent and save the environment
    eval "$(ssh-agent -s)" > /dev/null
    echo "export SSH_AUTH_SOCK=$SSH_AUTH_SOCK" > "$agent_env"
    echo "export SSH_AGENT_PID=$SSH_AGENT_PID" >> "$agent_env"
    chmod 600 "$agent_env"

    # Add keys in background (non-blocking)
    # Only adds keys if none are loaded
    ( ssh-add -l &>/dev/null || ssh-add &>/dev/null ) &!
fi
