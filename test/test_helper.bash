# Bats test helper - shared setup/teardown utilities

# Get the dotfiles directory (parent of test/)
DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Pre-cache frequently-read file contents for faster grep
ZSHRC_CONTENT="$(cat "$DOTFILES_DIR/.zshrc")"
BASHRC_CONTENT="$(cat "$DOTFILES_DIR/.bashrc")"
BASH_PROFILE_CONTENT="$(cat "$DOTFILES_DIR/.bash_profile")"
PROFILE_CONTENT="$(cat "$DOTFILES_DIR/.profile")"

# Save original HOME for restoration
ORIG_HOME="$HOME"

# Create isolated test environment
setup_test_home() {
    export TEST_HOME=$(mktemp -d)
    export HOME="$TEST_HOME"
    mkdir -p "$HOME/.ssh"
}

# Restore original environment
teardown_test_home() {
    export HOME="$ORIG_HOME"
    [[ -d "$TEST_HOME" ]] && rm -rf "$TEST_HOME"
}

# Check if running on Windows (Git Bash/MSYS2)
is_windows() {
    [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]
}

# Check if running in WSL
is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" ]] || [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]
}

# Skip test if not on Windows
skip_unless_windows() {
    if ! is_windows; then
        skip "Test requires Windows (Git Bash/MSYS2)"
    fi
}

# Skip test if not on Linux/WSL
skip_unless_linux() {
    if is_windows; then
        skip "Test requires Linux or WSL"
    fi
}
