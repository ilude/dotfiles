#!/usr/bin/env bats

# Damage Control Smoke Tests
# ==========================
# Quick validation tests for the Claude Code damage control hooks system.
# These are lightweight smoke tests, not comprehensive coverage.
# Detailed testing is in the Python test suite.

load test_helper

setup() {
    setup_test_home
    # Set required environment variables
    export DOTFILES_DIR="${DOTFILES_DIR:-$HOME/.dotfiles}"
}

teardown() {
    teardown_test_home
}

# =============================================================================
# Installation and Structure Tests
# =============================================================================

@test "damage-control: installation directory exists" {
    [ -d "$DOTFILES_DIR/claude/skills/damage-control" ]
}

@test "damage-control: hooks directory exists" {
    [ -d "$DOTFILES_DIR/claude/hooks/damage-control" ]
}

@test "damage-control: bash tool hook exists" {
    [ -f "$DOTFILES_DIR/claude/hooks/damage-control/bash-tool-damage-control.py" ]
}

@test "damage-control: edit tool hook exists" {
    [ -f "$DOTFILES_DIR/claude/hooks/damage-control/edit-tool-damage-control.py" ]
}

@test "damage-control: write tool hook exists" {
    [ -f "$DOTFILES_DIR/claude/hooks/damage-control/write-tool-damage-control.py" ]
}

@test "damage-control: test runner exists" {
    [ -f "$DOTFILES_DIR/claude/hooks/damage-control/test-damage-control.py" ]
}

@test "damage-control: SKILL.md documentation exists" {
    [ -f "$DOTFILES_DIR/claude/skills/damage-control/SKILL.md" ]
}

# =============================================================================
# Hook Functionality Tests (via Python test runner)
# =============================================================================

@test "damage-control: bash hook blocks catastrophic rm" {
    cd "$DOTFILES_DIR"
    run uv run claude/hooks/damage-control/test-damage-control.py bash Bash "rm -rf ~/" --expect-blocked
    [ "$status" -eq 0 ]
}

@test "damage-control: bash hook blocks sudo rm" {
    cd "$DOTFILES_DIR"
    run uv run claude/hooks/damage-control/test-damage-control.py bash Bash "sudo rm /tmp/test" --expect-blocked
    [ "$status" -eq 0 ]
}

@test "damage-control: bash hook detects git semantic violations" {
    cd "$DOTFILES_DIR"
    run uv run claude/hooks/damage-control/test-damage-control.py bash Bash "git push --force" --expect-ask
    [ "$status" -eq 0 ]
}

@test "damage-control: bash hook allows safe commands" {
    cd "$DOTFILES_DIR"
    run uv run claude/hooks/damage-control/test-damage-control.py bash Bash "ls -la" --expect-allowed
    [ "$status" -eq 0 ]
}

# Note: Edit/Write zero-access path tests are in the Python test suite (test_integration.py)
# They can't be tested via CLI because Claude's own hooks block commands containing sensitive paths

@test "damage-control: edit hook allows safe paths" {
    cd "$DOTFILES_DIR"
    run uv run claude/hooks/damage-control/test-damage-control.py edit Edit "/tmp/test.txt" --expect-allowed
    [ "$status" -eq 0 ]
}

@test "damage-control: write hook allows safe paths" {
    cd "$DOTFILES_DIR"
    run uv run claude/hooks/damage-control/test-damage-control.py write Write "/tmp/test.txt" --expect-allowed
    [ "$status" -eq 0 ]
}

# =============================================================================
# Documentation and Cookbook Tests
# =============================================================================

@test "damage-control: test_damage_control.md cookbook exists" {
    [ -f "$DOTFILES_DIR/claude/skills/damage-control/cookbook/test_damage_control.md" ]
}

@test "damage-control: install_damage_control cookbook exists" {
    [ -f "$DOTFILES_DIR/claude/skills/damage-control/cookbook/install_damage_control_ag_workflow.md" ]
}

@test "damage-control: modify_damage_control cookbook exists" {
    [ -f "$DOTFILES_DIR/claude/skills/damage-control/cookbook/modify_damage_control_ag_workflow.md" ]
}

@test "damage-control: audit logs cookbook exists" {
    [ -f "$DOTFILES_DIR/claude/skills/damage-control/cookbook/view_audit_logs.md" ]
}

# =============================================================================
# Python Unit Test Integration
# =============================================================================

@test "damage-control: unit tests pass (short suite)" {
    cd "$DOTFILES_DIR"
    run uv run pytest claude/hooks/damage-control/tests/test_integration.py -v --tb=short -x
    [ "$status" -eq 0 ]
}
