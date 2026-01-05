#!/usr/bin/env bats

# CLI Completions Tests
# =====================
# Tests for 07-cli-completions.zsh completion loading
# Verifies configuration to prevent regressions.

load test_helper

setup() {
    setup_test_home
}

teardown() {
    teardown_test_home
}

# =============================================================================
# Command existence checks
# =============================================================================

@test "cli-completions: kubectl completion conditional on command" {
    grep -q '\${+commands\[kubectl\]}' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

@test "cli-completions: helm completion conditional on command" {
    grep -q '\${+commands\[helm\]}' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

@test "cli-completions: gh completion conditional on command" {
    grep -q '\${+commands\[gh\]}' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

@test "cli-completions: tailscale completion conditional on command" {
    grep -q '\${+commands\[tailscale\]}' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

@test "cli-completions: fzf completion conditional on command" {
    grep -q '\${+commands\[fzf\]}' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

# =============================================================================
# Completion generation
# =============================================================================

@test "cli-completions: kubectl uses process substitution" {
    grep -q 'source <(kubectl completion zsh)' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

@test "cli-completions: helm uses process substitution" {
    grep -q 'source <(helm completion zsh)' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

@test "cli-completions: gh uses -s zsh flag" {
    grep -q 'gh completion -s zsh' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

@test "cli-completions: tailscale silences errors" {
    grep -q 'tailscale completion zsh 2>/dev/null' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

# =============================================================================
# fzf paths
# =============================================================================

@test "cli-completions: checks /usr/share/fzf for completion" {
    grep -q '/usr/share/fzf' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

@test "cli-completions: checks ~/.fzf.zsh" {
    grep -q '~/.fzf.zsh' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

@test "cli-completions: checks homebrew fzf path" {
    grep -q '/usr/local/opt/fzf' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

@test "cli-completions: fzf loop ensures exit 0" {
    # Must end with true to prevent non-zero exit if no completions found
    grep -q 'true.*# Ensure exit 0' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}

# =============================================================================
# Docker handling
# =============================================================================

@test "cli-completions: docker completion skips slow docker info check" {
    grep -q 'skip docker info check\|too slow' "$DOTFILES_DIR/zsh/rc.d/07-cli-completions.zsh"
}
