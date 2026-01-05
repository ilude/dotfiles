# Non-blocking SSH agent initialization
# Runs in background to avoid startup delay
#
# Skip if:
# - VS Code terminal (has its own agent via remote-ssh)
# - SSH_AUTH_SOCK already set (agent already running)
# - Windows Git Bash (uses Windows SSH agent via GIT_SSH)

# Only on interactive shells, not in VS Code terminal
if [[ -z "$VSCODE_INJECTION" && -z "$SSH_AUTH_SOCK" ]] && ! is_windows; then
    # Check if agent is running, start if not
    if ! pgrep -u "$USER" ssh-agent >/dev/null 2>&1; then
        eval "$(ssh-agent -s)" >/dev/null
    fi

    # Add keys in background (non-blocking)
    # Only adds keys if none are loaded
    ( ssh-add -l &>/dev/null || ssh-add &>/dev/null ) &!
fi
