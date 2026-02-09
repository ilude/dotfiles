# Helper functions for shell configuration
# Sourced first (00- prefix) so available to all other modules

# Deduplicate PATH entries
typeset -U path

# Source a file only if it exists
source_if_exists() {
    [[ -f "$1" ]] && source "$1"
}

# Canonical platform detection helpers
# Other scripts may redefine these for self-containment (see validate/ scripts)
is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" ]] || \
    [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]] || \
    grep -qi microsoft /proc/version 2>/dev/null
}

is_msys() {
    [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]
}

is_linux() {
    [[ "$OSTYPE" == "linux-gnu"* ]] && ! is_wsl
}

is_macos() {
    [[ "$OSTYPE" == "darwin"* ]]
}

is_windows() {
    is_msys || [[ -n "$WINDIR" ]]
}

# =============================================================================
# Debug and PATH utilities
# =============================================================================

# PATH preservation for debugging/recovery
# Usage: restore_path to revert PATH changes
typeset -g DOTFILES_ORIGINAL_PATH="$PATH"
restore_path() {
    PATH="$DOTFILES_ORIGINAL_PATH"
}

# Debug profiling (enable with: DEBUG=1 zsh)
# Shows timing for each sourced file
if [[ -n "$DEBUG" ]]; then
    setopt XTRACE
    PS4='+%N:%i> '
    typeset -F SECONDS
    _dotfiles_debug_start=$SECONDS
fi

# Call at end of .zshrc to show total load time
debug_report() {
    if [[ -n "$DEBUG" ]]; then
        print "Shell loaded in $(( (SECONDS - _dotfiles_debug_start) * 1000 ))ms"
    fi
}
