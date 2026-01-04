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
# Tests symlink creation on Linux/WSL and junction creation on Windows.
# Both are detected by [ -L ] in Git Bash.
# =============================================================================

@test "claude-link-setup: runs successfully on first execution" {
    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]
}

@test "claude-link-setup: creates link to .claude directory" {
    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # Link should exist (either symlink or junction)
    [ -e "$HOME/.claude" ]

    # Should be able to read the test marker through the link
    [ -f "$HOME/.claude/test-marker" ]
}

@test "claude-link-setup: runs successfully on second execution" {
    # First run
    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # Second run
    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]
}

@test "claude-link-setup: second run preserves link functionality" {
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

# =============================================================================
# claude-link-setup backup/merge tests
# When ~/.claude is an existing directory (not a symlink), the script should:
# 1. Create a backup archive before making changes
# 2. Merge machine-specific files into dotfiles
# 3. Create the symlink after backup/merge completes
# =============================================================================

@test "claude-link-setup: creates backup when ~/.claude is existing directory" {
    # Create existing ~/.claude directory with content (simulating pre-existing install)
    mkdir -p "$HOME/.claude"
    echo "session data" > "$HOME/.claude/history.jsonl"

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # Backup archive should be created in HOME
    # Either .tar.gz (fallback) or .7z (if available)
    backup_count=$(ls "$HOME"/claude-backup-*.tar.gz "$HOME"/claude-backup-*.7z 2>/dev/null | wc -l)
    [ "$backup_count" -ge 1 ]
}

@test "claude-link-setup: merges history.jsonl from existing directory" {
    # Create existing ~/.claude with history
    mkdir -p "$HOME/.claude"
    echo '{"session":"old"}' > "$HOME/.claude/history.jsonl"

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # history.jsonl should now exist in dotfiles
    [ -f "$HOME/.dotfiles/.claude/history.jsonl" ]

    # Content should include the old session data
    grep -q "old" "$HOME/.dotfiles/.claude/history.jsonl"
}

@test "claude-link-setup: appends to existing history.jsonl instead of overwriting" {
    # Pre-existing history in dotfiles
    echo '{"session":"existing"}' > "$HOME/.dotfiles/.claude/history.jsonl"

    # Create ~/.claude with additional history
    mkdir -p "$HOME/.claude"
    echo '{"session":"new"}' > "$HOME/.claude/history.jsonl"

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # Both entries should be present (appended, not overwritten)
    grep -q "existing" "$HOME/.dotfiles/.claude/history.jsonl"
    grep -q "new" "$HOME/.dotfiles/.claude/history.jsonl"
}

@test "claude-link-setup: merges debug directory contents" {
    # Create existing ~/.claude with debug files
    mkdir -p "$HOME/.claude/debug"
    echo "debug1" > "$HOME/.claude/debug/session-abc.txt"
    echo "debug2" > "$HOME/.claude/debug/session-def.txt"

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # Debug files should be merged to dotfiles
    [ -f "$HOME/.dotfiles/.claude/debug/session-abc.txt" ]
    [ -f "$HOME/.dotfiles/.claude/debug/session-def.txt" ]
}

@test "claude-link-setup: preserves existing files in dotfiles during merge" {
    # Pre-existing debug file in dotfiles
    mkdir -p "$HOME/.dotfiles/.claude/debug"
    echo "original content" > "$HOME/.dotfiles/.claude/debug/existing.txt"

    # Create ~/.claude with a different file
    mkdir -p "$HOME/.claude/debug"
    echo "new content" > "$HOME/.claude/debug/new-file.txt"

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # Original file should be preserved
    [ -f "$HOME/.dotfiles/.claude/debug/existing.txt" ]
    grep -q "original content" "$HOME/.dotfiles/.claude/debug/existing.txt"

    # New file should be added
    [ -f "$HOME/.dotfiles/.claude/debug/new-file.txt" ]
}

@test "claude-link-setup: copies credentials file if not in dotfiles" {
    # Create ~/.claude with credentials
    mkdir -p "$HOME/.claude"
    echo '{"token":"secret"}' > "$HOME/.claude/.credentials.json"

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # Credentials should be copied to dotfiles
    [ -f "$HOME/.dotfiles/.claude/.credentials.json" ]
}

@test "claude-link-setup: does not overwrite existing credentials in dotfiles" {
    # Pre-existing credentials in dotfiles
    echo '{"token":"dotfiles-token"}' > "$HOME/.dotfiles/.claude/.credentials.json"

    # Create ~/.claude with different credentials
    mkdir -p "$HOME/.claude"
    echo '{"token":"local-token"}' > "$HOME/.claude/.credentials.json"

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # Dotfiles credentials should be preserved (not overwritten)
    grep -q "dotfiles-token" "$HOME/.dotfiles/.claude/.credentials.json"
}

@test "claude-link-setup: creates symlink after backup/merge completes" {
    # Create existing ~/.claude directory
    mkdir -p "$HOME/.claude"
    echo "data" > "$HOME/.claude/history.jsonl"

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 0 ]

    # ~/.claude should now be a symlink (or junction on Windows)
    [ -L "$HOME/.claude" ]

    # Link should point to dotfiles
    link_target=$(readlink -f "$HOME/.claude")
    [[ "$link_target" == *".dotfiles/.claude"* ]]
}

@test "claude-link-setup: merged content accessible through symlink" {
    # Create existing ~/.claude with history
    mkdir -p "$HOME/.claude"
    echo "merged-data" > "$HOME/.claude/history.jsonl"

    "$DOTFILES_DIR/claude-link-setup"

    # Should be able to read merged content through the symlink
    grep -q "merged-data" "$HOME/.claude/history.jsonl"

    # Original test marker from dotfiles should also be accessible
    [ -f "$HOME/.claude/test-marker" ]
}
