# Bash Profile - Login shell initialization
# This file runs for login shells. It sets up PATH and switches to zsh if available.

# Add MSYS2 to PATH (for zsh on Windows Git Bash)
if [[ -d "/c/msys64/usr/bin" ]]; then
    export PATH="/c/msys64/usr/bin:$PATH"
fi

# Add user local bin
export PATH="$HOME/.local/bin:$PATH"

# Nix installer (for NixOS/nix-shell users)
if [[ -e "$HOME/.nix-profile/etc/profile.d/nix.sh" ]]; then
    source "$HOME/.nix-profile/etc/profile.d/nix.sh"
fi

# Switch to zsh if available and running interactively
# This provides unified shell experience across all platforms
if [[ -t 1 ]] && command -v zsh &>/dev/null; then
    export SHELL=$(command -v zsh)
    # ZDOTDIR tells zsh where to find config files (.zshrc, .zprofile, etc.)
    # MSYS2's zsh uses different home than Git Bash, so we convert Windows path
    if [[ -n "$USERPROFILE" ]] && command -v cygpath &>/dev/null; then
        export ZDOTDIR="$(cygpath -u "$USERPROFILE")"
    else
        export ZDOTDIR="$HOME"
    fi
    exec zsh -l
fi

# Fallback: source .bashrc for bash users
if [[ -f ~/.bashrc ]]; then
    source ~/.bashrc
fi
