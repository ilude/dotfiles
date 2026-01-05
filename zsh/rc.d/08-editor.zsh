# Editor and terminal settings (interactive shells)

# Directory colors (skip if dircolors not available, e.g., some Windows setups)
if (( ${+commands[dircolors]} )); then
    if [[ -f ~/.dircolors ]]; then
        eval $(dircolors -b ~/.dircolors)
    elif [[ -f /etc/DIR_COLORS ]]; then
        eval $(dircolors -b /etc/DIR_COLORS)
    fi
fi

# Editor: VS Code in terminal, nano otherwise
if [[ "$TERM_PROGRAM" == "vscode" ]]; then
    export EDITOR="code"
else
    export EDITOR="nano"
fi

# Set terminal env vars if lost crossing Git Bash -> MSYS2 boundary
# These are needed by apps like Claude Code for predictions/completions
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    [[ -z "$TERM" ]] && export TERM="xterm-256color"
    [[ -z "$COLORTERM" ]] && export COLORTERM="truecolor"
    # Detect VS Code terminal
    [[ -n "$VSCODE_INJECTION" || -n "$TERM_PROGRAM_VERSION" ]] && export TERM_PROGRAM="vscode"
fi
