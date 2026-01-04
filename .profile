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
    # ZDOTDIR tells zsh where to find config files (.zshrc, .zprofile, etc.)
    # HOME must also be set so zsh starts in the right directory
    # MSYS2's zsh uses different home than Git Bash, so we convert Windows path
    # NOTE: Must use 'env' to pass vars across Git Bash -> MSYS2 boundary
    if [ -n "$USERPROFILE" ] && command -v cygpath >/dev/null 2>&1; then
        _home="$(cygpath -u "$USERPROFILE")"
        exec env HOME="$_home" ZDOTDIR="$_home" zsh -l
    else
        exec env ZDOTDIR="$HOME" zsh -l
    fi
fi

# Fallback: source .bashrc for bash users
if [ -n "$BASH_VERSION" ] && [ -f ~/.bashrc ]; then
    . ~/.bashrc
fi
