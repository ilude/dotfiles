# Profile - Login shell initialization (POSIX sh compatible)
# Used by sh, dash, and bash when .bash_profile doesn't exist

# Add MSYS2 to PATH (for zsh on Windows Git Bash)
if [ -d "/c/msys64/usr/bin" ]; then
    export PATH="/c/msys64/usr/bin:$PATH"
fi

# Add user local bin
export PATH="$HOME/.local/bin:$PATH"

# Switch to zsh if available and running interactively
if [ -t 1 ] && command -v zsh >/dev/null 2>&1; then
    export SHELL=$(command -v zsh)
    exec zsh -l
fi

# Fallback: source .bashrc for bash users
if [ -n "$BASH_VERSION" ] && [ -f ~/.bashrc ]; then
    . ~/.bashrc
fi
