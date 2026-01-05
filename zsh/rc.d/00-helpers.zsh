# Helper functions for shell configuration
# Sourced first (00- prefix) so available to all other modules

# Source a file only if it exists
source_if_exists() {
    [[ -f "$1" ]] && source "$1"
}

# Platform detection helpers (consolidate existing patterns)
is_wsl() {
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
