#!/usr/bin/env bats

# Editor Tests
# ============
# Tests for 08-editor.zsh editor and terminal settings
# Verifies configuration to prevent regressions.

load test_helper

setup() {
    setup_test_home
}

teardown() {
    teardown_test_home
}

# =============================================================================
# dircolors configuration
# =============================================================================

@test "editor: dircolors check uses commands hash" {
    # Verify dircolors detection uses zsh's ${+commands[...]} pattern
    grep -q '\${+commands\[dircolors\]}' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
}

@test "editor: supports custom ~/.dircolors file" {
    grep -q '~/.dircolors' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
}

@test "editor: falls back to /etc/DIR_COLORS" {
    grep -q '/etc/DIR_COLORS' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
}

# =============================================================================
# EDITOR configuration
# =============================================================================

@test "editor: EDITOR set to code when in VS Code terminal" {
    grep -q 'TERM_PROGRAM.*vscode' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
    grep -q 'EDITOR="code"' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
}

@test "editor: EDITOR falls back to nano" {
    grep -q 'EDITOR="nano"' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
}

# =============================================================================
# Terminal environment (MSYS2/Git Bash)
# =============================================================================

@test "editor: sets TERM on Windows if unset" {
    grep -q 'TERM.*xterm-256color' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
}

@test "editor: sets COLORTERM on Windows if unset" {
    grep -q 'COLORTERM.*truecolor' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
}

@test "editor: detects VS Code via VSCODE_INJECTION" {
    grep -q 'VSCODE_INJECTION' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
}

@test "editor: detects VS Code via TERM_PROGRAM_VERSION" {
    grep -q 'TERM_PROGRAM_VERSION' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
}

@test "editor: Windows detection uses OSTYPE" {
    grep -q 'OSTYPE.*msys\|OSTYPE.*cygwin' "$DOTFILES_DIR/zsh/rc.d/08-editor.zsh"
}
