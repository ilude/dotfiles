#!/usr/bin/env bats

# Aliases Tests
# =============
# Tests for 06-aliases.zsh alias definitions
# Verifies alias configuration to prevent regressions.

load test_helper

setup() {
    setup_test_home
}

teardown() {
    teardown_test_home
}

# =============================================================================
# Claude Code aliases
# =============================================================================

@test "aliases: ccyl alias uses dangerously-skip-permissions" {
    grep -q "alias ccyl='claude --dangerously-skip-permissions'" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: claude-install alias uses npm install -g" {
    grep -q "alias claude-install='npm install -g @anthropic-ai/claude-code'" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

# =============================================================================
# NixOS aliases
# =============================================================================

@test "aliases: nix-gc alias defined" {
    grep -q "alias nix-gc=" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: nix-rs alias defined" {
    grep -q "alias nix-rs=" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

# =============================================================================
# Shell/Environment aliases
# =============================================================================

@test "aliases: sz sources .zshrc" {
    grep -q "alias sz='source ~/.zshrc'" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: ez opens .zshrc in editor" {
    grep -q "alias ez=" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: es shows sorted env" {
    grep -q "alias es='env | sort'" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: history alias shows full history" {
    grep -q 'alias history="history 1"' "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

# =============================================================================
# Directory listing (eza fallback)
# =============================================================================

@test "aliases: eza check uses commands hash" {
    # Verify eza detection uses zsh's ${+commands[...]} pattern
    grep -q '\${+commands\[eza\]}' "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: l alias defined for eza with long format" {
    grep -q "alias l='eza.*-la" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: tree alias uses eza when available" {
    grep -q "alias tree='eza --tree" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: exa fallback for ls defined" {
    grep -q '\${+commands\[exa\]}' "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: fallback l alias uses ls with color" {
    grep -q "alias l='ls.*--color=auto" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: bat fallback chain defined" {
    # bat > batcat > cat
    grep -q '\${+commands\[bat\]}' "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
    grep -q '\${+commands\[batcat\]}' "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: fd fallback chain defined" {
    # fd > fdfind > find
    grep -q '\${+commands\[fd\]}' "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
    grep -q '\${+commands\[fdfind\]}' "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

@test "aliases: rg fallback for grep defined" {
    grep -q '\${+commands\[rg\]}' "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}

# =============================================================================
# Docker aliases
# =============================================================================

@test "aliases: dps alias defined with table format" {
    grep -q "alias dps=" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
    grep -q "docker ps --format" "$DOTFILES_DIR/zsh/rc.d/06-aliases.zsh"
}
