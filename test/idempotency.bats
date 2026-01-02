#!/usr/bin/env bats

# Idempotency tests - verify scripts can be run multiple times safely

load test_helper

setup() {
    setup_test_home

    # Create .dotfiles structure in test HOME
    mkdir -p "$HOME/.dotfiles/.claude"

    # Create a dummy file in .claude to verify link works
    echo "test" > "$HOME/.dotfiles/.claude/test-marker"
}

teardown() {
    teardown_test_home
}

# =============================================================================
# git-ssh-setup idempotency tests
# =============================================================================

@test "git-ssh-setup: runs successfully on first execution" {
    # Create SSH key for the script to find
    touch "$HOME/.ssh/id_ed25519"
    chmod 600 "$HOME/.ssh/id_ed25519"

    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]
}

@test "git-ssh-setup: creates gitconfig files with SSH key present" {
    # Create SSH key for the script to find
    touch "$HOME/.ssh/id_ed25519"
    chmod 600 "$HOME/.ssh/id_ed25519"

    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]

    # Personal config should be created (id_ed25519 is fallback for personal)
    [ -f "$HOME/.gitconfig-personal-local" ]
}

@test "git-ssh-setup: runs successfully on second execution" {
    # Create SSH key for the script to find
    touch "$HOME/.ssh/id_ed25519"
    chmod 600 "$HOME/.ssh/id_ed25519"

    # First run
    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]

    # Second run
    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]
}

@test "git-ssh-setup: second run does not corrupt config files" {
    # Create SSH key for the script to find
    touch "$HOME/.ssh/id_ed25519"
    chmod 600 "$HOME/.ssh/id_ed25519"

    # First run
    "$DOTFILES_DIR/git-ssh-setup"

    # Capture content after first run
    content_after_first=$(cat "$HOME/.gitconfig-personal-local")

    # Second run
    "$DOTFILES_DIR/git-ssh-setup"

    # Capture content after second run
    content_after_second=$(cat "$HOME/.gitconfig-personal-local")

    # Content should be identical
    [ "$content_after_first" = "$content_after_second" ]
}

@test "git-ssh-setup: handles missing SSH keys gracefully" {
    # No SSH keys created - should still succeed (just report no keys found)
    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]
}

@test "git-ssh-setup: multiple runs with no keys still succeeds" {
    # First run with no keys
    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]

    # Second run with no keys
    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]
}

# =============================================================================
# claude-link-setup idempotency tests
# Note: Windows junction tests are skipped because junctions in temp directories
# have specific requirements that may not be available in all test environments.
# =============================================================================

@test "claude-link-setup: runs successfully on first execution" {
    # Skip on Windows - junctions in temp dirs have issues
    skip_unless_linux

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]
}

@test "claude-link-setup: creates link to .claude directory" {
    skip_unless_linux

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # Link should exist (either symlink or junction)
    [ -e "$HOME/.claude" ]

    # Should be able to read the test marker through the link
    [ -f "$HOME/.claude/test-marker" ]
}

@test "claude-link-setup: runs successfully on second execution" {
    skip_unless_linux

    # First run
    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # Second run
    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]
}

@test "claude-link-setup: second run preserves link functionality" {
    skip_unless_linux

    # First run
    "$DOTFILES_DIR/claude-link-setup"

    # Verify link works
    [ -f "$HOME/.claude/test-marker" ]

    # Second run
    "$DOTFILES_DIR/claude-link-setup"

    # Link should still work
    [ -f "$HOME/.claude/test-marker" ]

    # Content should be accessible
    content=$(cat "$HOME/.claude/test-marker")
    [ "$content" = "test" ]
}

@test "claude-link-setup: second run reports already linked" {
    skip_unless_linux

    # First run
    "$DOTFILES_DIR/claude-link-setup"

    # Second run should indicate already linked
    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Already linked"* ]]
}

@test "claude-link-setup: fails gracefully when source missing" {
    # Remove the source directory
    rm -rf "$HOME/.dotfiles/.claude"

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 1 ]
    [[ "$output" == *"not found"* ]]
}
