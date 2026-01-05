#!/usr/bin/env bats

# Helpers Module Tests
# ====================
# Tests for 00-helpers.zsh helper functions

load test_helper

setup() {
    setup_test_home
}

teardown() {
    teardown_test_home
}

# =============================================================================
# source_if_exists function
# =============================================================================

@test "helpers: source_if_exists function defined" {
    grep -q 'source_if_exists()' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: source_if_exists checks file existence" {
    grep -q '\[\[.*-f.*\]\]' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

# =============================================================================
# Platform detection functions
# =============================================================================

@test "helpers: is_wsl function defined" {
    grep -q 'is_wsl()' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: is_wsl checks WSLInterop file" {
    grep -q '/proc/sys/fs/binfmt_misc/WSLInterop' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: is_wsl checks /proc/version fallback" {
    grep -q '/proc/version' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: is_msys function defined" {
    grep -q 'is_msys()' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: is_msys checks OSTYPE for msys" {
    grep -q 'OSTYPE.*msys' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: is_msys checks OSTYPE for cygwin" {
    grep -q 'OSTYPE.*cygwin' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: is_linux function defined" {
    grep -q 'is_linux()' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: is_linux excludes WSL" {
    # is_linux should return false for WSL
    grep -q 'linux-gnu.*!.*is_wsl\|! is_wsl' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: is_macos function defined" {
    grep -q 'is_macos()' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: is_macos checks for darwin" {
    grep -q 'darwin' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

@test "helpers: is_windows function defined" {
    grep -q 'is_windows()' "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh"
}

# =============================================================================
# Module ordering
# =============================================================================

@test "helpers: module has 00 prefix for early loading" {
    # 00-helpers.zsh should be first to load
    [ -f "$DOTFILES_DIR/zsh/rc.d/00-helpers.zsh" ]
}
