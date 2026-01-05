#!/usr/bin/env bats

# Environment Modules Tests
# =========================
# Tests for env.d modules: winhome, locale, path
# Verifies configuration to prevent regressions.

load test_helper

setup() {
    setup_test_home
}

teardown() {
    teardown_test_home
}

# =============================================================================
# 00-winhome.zsh tests
# =============================================================================

@test "winhome: detects WSL via WSLInterop file" {
    grep -q '/proc/sys/fs/binfmt_misc/WSLInterop' "$DOTFILES_DIR/zsh/env.d/00-winhome.zsh"
}

@test "winhome: sets WINHOME on WSL to /mnt/c/Users" {
    grep -q 'WINHOME="/mnt/c/Users/' "$DOTFILES_DIR/zsh/env.d/00-winhome.zsh"
}

@test "winhome: detects MSYS2 via OSTYPE" {
    grep -q 'OSTYPE.*msys' "$DOTFILES_DIR/zsh/env.d/00-winhome.zsh"
}

@test "winhome: detects Cygwin via OSTYPE" {
    grep -q 'OSTYPE.*cygwin' "$DOTFILES_DIR/zsh/env.d/00-winhome.zsh"
}

@test "winhome: uses ZDOTDIR for Windows home fallback" {
    # On Git Bash/MSYS2, ZDOTDIR contains the Windows home
    grep -q '\${ZDOTDIR:-' "$DOTFILES_DIR/zsh/env.d/00-winhome.zsh"
}

@test "winhome: handles missing USER with whoami fallback" {
    grep -q '\${USER:-\$(whoami)}' "$DOTFILES_DIR/zsh/env.d/00-winhome.zsh"
}

# =============================================================================
# 01-locale.zsh tests
# =============================================================================

@test "locale: LC_ALL is en_US.UTF-8" {
    grep -q 'LC_ALL=en_US.UTF-8' "$DOTFILES_DIR/zsh/env.d/01-locale.zsh"
}

@test "locale: LANG is en_US.UTF-8" {
    grep -q 'LANG=en_US.UTF-8' "$DOTFILES_DIR/zsh/env.d/01-locale.zsh"
}

# =============================================================================
# 02-path.zsh tests
# =============================================================================

@test "path: adds .local/bin to PATH" {
    grep -q '\.local/bin' "$DOTFILES_DIR/zsh/env.d/02-path.zsh"
}

@test "path: uses WINHOME for .local/bin on Windows" {
    grep -q '\${WINHOME:-\$HOME}/.local/bin' "$DOTFILES_DIR/zsh/env.d/02-path.zsh"
}

@test "path: restores Git for Windows mingw64 bin" {
    grep -q '/c/Program Files/Git/mingw64/bin' "$DOTFILES_DIR/zsh/env.d/02-path.zsh"
}

@test "path: sources .path-windows-local on Windows" {
    grep -q '\.path-windows-local' "$DOTFILES_DIR/zsh/env.d/02-path.zsh"
}

@test "path: uses ZDOTDIR for .path-windows-local location" {
    grep -q '\${ZDOTDIR:-\$HOME}/.path-windows-local' "$DOTFILES_DIR/zsh/env.d/02-path.zsh"
}

@test "path: Windows path sourcing is conditional on OSTYPE" {
    # Should only source on msys/cygwin
    run grep -A1 'path-windows-local' "$DOTFILES_DIR/zsh/env.d/02-path.zsh"
    [[ "$output" == *"msys"* ]] || [[ "$output" == *"cygwin"* ]]
}
