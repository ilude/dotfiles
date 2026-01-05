# Bash Profile - Login shell initialization
# This file runs for login shells. It sets up PATH and switches to zsh if available.

# Debug mode: touch ~/.dotfiles-disabled to bypass all customizations
[[ -f ~/.dotfiles-disabled ]] && return

# Add user local bin
export PATH="$HOME/.local/bin:$PATH"

# Nix installer (for NixOS/nix-shell users)
if [[ -e "$HOME/.nix-profile/etc/profile.d/nix.sh" ]]; then
    source "$HOME/.nix-profile/etc/profile.d/nix.sh"
fi

# Switch to zsh if available and running interactively
# This provides unified shell experience across all platforms
if [[ -t 1 ]]; then
    # Find zsh: use absolute path on Windows to avoid adding MSYS2 to PATH
    # (MSYS2 in PATH breaks Claude Code's shell state capture)
    _zsh=""
    if [[ -x "/c/msys64/usr/bin/zsh" ]]; then
        _zsh="/c/msys64/usr/bin/zsh"
    elif command -v zsh &>/dev/null; then
        _zsh="$(command -v zsh)"
    fi

    if [[ -n "$_zsh" ]]; then
        export SHELL="$_zsh"
        # ZDOTDIR tells zsh where to find config files (.zshrc, .zprofile, etc.)
        # HOME must also be set so zsh starts in the right directory
        # MSYS2's zsh uses different home than Git Bash, so we convert Windows path
        # NOTE: Must use 'env' to pass vars across Git Bash -> MSYS2 boundary
        if [[ -n "$USERPROFILE" ]] && command -v cygpath &>/dev/null; then
            _home="$(cygpath -u "$USERPROFILE")"
            exec env HOME="$_home" ZDOTDIR="$_home" "$_zsh" -l
        else
            exec env ZDOTDIR="$HOME" "$_zsh" -l
        fi
    fi
fi

# Fallback: source .bashrc for bash users (when zsh not available)
if [[ -f ~/.bashrc ]]; then
    source ~/.bashrc
fi

# Source uv environment if available (added by uv installer)
[[ -f "$HOME/.local/bin/env" ]] && . "$HOME/.local/bin/env"
