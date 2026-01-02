#!/usr/bin/env bats

# Tests for git-ssh-setup script

load test_helper

setup() {
    setup_test_home
    # Update SSH_DIR to use new HOME
    export SSH_DIR="$HOME/.ssh"
}

teardown() {
    teardown_test_home
}

# Source the script functions (skip the main execution by redefining echo temporarily)
source_functions() {
    # Source only the function definitions by extracting them
    eval "$(sed -n '/^find_personal_key()/,/^}/p' "$DOTFILES_DIR/git-ssh-setup")"
    eval "$(sed -n '/^find_work_key()/,/^}/p' "$DOTFILES_DIR/git-ssh-setup")"
    eval "$(sed -n '/^build_ssh_command()/,/^}/p' "$DOTFILES_DIR/git-ssh-setup")"
    eval "$(sed -n '/^write_local_config()/,/^}/p' "$DOTFILES_DIR/git-ssh-setup")"
}

# =============================================================================
# find_personal_key tests
# =============================================================================

@test "find_personal_key: returns failure when no keys exist" {
    source_functions
    run find_personal_key
    [ "$status" -eq 1 ]
    [ -z "$output" ]
}

@test "find_personal_key: returns id_ed25519 when only that exists" {
    source_functions
    touch "$SSH_DIR/id_ed25519"
    run find_personal_key
    [ "$status" -eq 0 ]
    [ "$output" = "~/.ssh/id_ed25519" ]
}

@test "find_personal_key: returns id_ed25519-personal when only that exists" {
    source_functions
    touch "$SSH_DIR/id_ed25519-personal"
    run find_personal_key
    [ "$status" -eq 0 ]
    [ "$output" = "~/.ssh/id_ed25519-personal" ]
}

@test "find_personal_key: prefers id_ed25519-personal over id_ed25519" {
    source_functions
    touch "$SSH_DIR/id_ed25519"
    touch "$SSH_DIR/id_ed25519-personal"
    run find_personal_key
    [ "$status" -eq 0 ]
    [ "$output" = "~/.ssh/id_ed25519-personal" ]
}

# =============================================================================
# find_work_key tests
# =============================================================================

@test "find_work_key: returns failure when no keys exist" {
    source_functions
    run find_work_key
    [ "$status" -eq 1 ]
    [ -z "$output" ]
}

@test "find_work_key: returns id_ed25519-eagletg when only that exists" {
    source_functions
    touch "$SSH_DIR/id_ed25519-eagletg"
    run find_work_key
    [ "$status" -eq 0 ]
    [ "$output" = "~/.ssh/id_ed25519-eagletg" ]
}

@test "find_work_key: returns id_ed25519-work when only that exists" {
    source_functions
    touch "$SSH_DIR/id_ed25519-work"
    run find_work_key
    [ "$status" -eq 0 ]
    [ "$output" = "~/.ssh/id_ed25519-work" ]
}

@test "find_work_key: prefers id_ed25519-work over id_ed25519-eagletg" {
    source_functions
    touch "$SSH_DIR/id_ed25519-eagletg"
    touch "$SSH_DIR/id_ed25519-work"
    run find_work_key
    [ "$status" -eq 0 ]
    [ "$output" = "~/.ssh/id_ed25519-work" ]
}

# =============================================================================
# build_ssh_command tests
# =============================================================================

@test "build_ssh_command: without ssh config file" {
    source_functions
    run build_ssh_command "~/.ssh/id_ed25519"
    [ "$status" -eq 0 ]
    [ "$output" = "ssh -i ~/.ssh/id_ed25519" ]
}

@test "build_ssh_command: with ssh config file" {
    source_functions
    touch "$SSH_DIR/config"
    run build_ssh_command "~/.ssh/id_ed25519"
    [ "$status" -eq 0 ]
    [ "$output" = "ssh -i ~/.ssh/id_ed25519 -F ~/.ssh/config" ]
}

# =============================================================================
# write_local_config tests
# =============================================================================

@test "write_local_config: creates new config file" {
    source_functions
    local config_file="$HOME/.gitconfig-test-local"
    local ssh_cmd="ssh -i ~/.ssh/id_ed25519"

    write_local_config "$config_file" "$ssh_cmd"

    [ -f "$config_file" ]
    grep -q "sshCommand = $ssh_cmd" "$config_file"
}

@test "write_local_config: updates existing config with different content" {
    source_functions
    local config_file="$HOME/.gitconfig-test-local"

    # Write initial content
    echo "old content" > "$config_file"

    local ssh_cmd="ssh -i ~/.ssh/id_ed25519"
    write_local_config "$config_file" "$ssh_cmd"

    grep -q "sshCommand = $ssh_cmd" "$config_file"
    ! grep -q "old content" "$config_file"
}

@test "write_local_config: idempotent when content matches" {
    source_functions
    local config_file="$HOME/.gitconfig-test-local"
    local ssh_cmd="ssh -i ~/.ssh/id_ed25519"

    # Write config
    write_local_config "$config_file" "$ssh_cmd"
    local mtime1=$(stat -c %Y "$config_file" 2>/dev/null || stat -f %m "$config_file")

    # Wait briefly and write again
    sleep 1
    write_local_config "$config_file" "$ssh_cmd"
    local mtime2=$(stat -c %Y "$config_file" 2>/dev/null || stat -f %m "$config_file")

    # File should not have been modified (same mtime)
    [ "$mtime1" = "$mtime2" ]
}

# =============================================================================
# Full script idempotency tests
# =============================================================================

@test "git-ssh-setup: runs successfully" {
    touch "$SSH_DIR/id_ed25519"
    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]
}

@test "git-ssh-setup: idempotent - second run succeeds" {
    touch "$SSH_DIR/id_ed25519"

    # First run
    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]

    # Second run
    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]
}

@test "git-ssh-setup: creates personal config when personal key exists" {
    touch "$SSH_DIR/id_ed25519-personal"

    "$DOTFILES_DIR/git-ssh-setup"

    [ -f "$HOME/.gitconfig-personal-local" ]
    grep -q "id_ed25519-personal" "$HOME/.gitconfig-personal-local"
}

@test "git-ssh-setup: creates work config when work key exists" {
    touch "$SSH_DIR/id_ed25519-work"

    "$DOTFILES_DIR/git-ssh-setup"

    [ -f "$HOME/.gitconfig-professional-local" ]
    grep -q "id_ed25519-work" "$HOME/.gitconfig-professional-local"
}
