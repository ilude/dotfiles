---
name: bash-testing
description: Bash/shell script testing with Bats-core framework. Covers test structure, assertions, setup/teardown, platform-specific tests, isolated environments, and CI integration. Activate when working with .bats files, test_helper.bash, shell script testing, or Makefile test targets.
---

# Bash Testing with Bats-core

Shell script testing using the Bats (Bash Automated Testing System) framework.

## Why Bats-core

- **Bats-core** over ShellSpec for better Windows/MSYS2/Git Bash support
- Native bash syntax - no new DSL to learn
- Simple `run` command captures exit code and output

---

## Test File Structure

```bash
#!/usr/bin/env bats

# Load shared helpers
load test_helper

setup() {
    # Runs before each test
    setup_test_home
}

teardown() {
    # Runs after each test
    teardown_test_home
}

@test "description of what this tests" {
    run some_command
    [ "$status" -eq 0 ]
    [[ "$output" == *"expected text"* ]]
}
```

---

## Assertions

```bash
# Exit status
[ "$status" -eq 0 ]           # Success
[ "$status" -ne 0 ]           # Failure
[ "$status" -eq 1 ]           # Specific exit code

# Output matching
[ "$output" = "exact match" ]
[[ "$output" == *"contains"* ]]
[[ "$output" =~ regex.* ]]

# File assertions
[ -f "$HOME/.config/file" ]   # File exists
[ -d "$HOME/.config" ]        # Directory exists
[ -L "$HOME/.claude" ]        # Symlink exists
[ -e "$HOME/.claude" ]        # Exists (any type)

# Content assertions
content=$(cat "$HOME/.gitconfig")
[ "$content" = "$expected" ]
```

---

## test_helper.bash Pattern

Shared setup/teardown and platform detection:

```bash
# Get dotfiles directory (parent of test/)
DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Save original HOME
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

# Platform detection
is_windows() {
    [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]
}

is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" ]] || [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]
}

# Skip helpers
skip_unless_windows() {
    is_windows || skip "Test requires Windows (Git Bash/MSYS2)"
}

skip_unless_linux() {
    is_windows && skip "Test requires Linux or WSL"
}
```

**Important:** Use `load test_helper` not `load test_helper.bash` - Bats auto-appends `.bash`.

---

## Isolated Test Environment

Always test in isolated `$HOME` to avoid affecting real config:

```bash
setup() {
    setup_test_home

    # Create test fixtures
    mkdir -p "$HOME/.dotfiles/.claude"
    echo "test" > "$HOME/.dotfiles/.claude/test-marker"
}

teardown() {
    teardown_test_home
}

@test "script creates config in HOME" {
    run "$DOTFILES_DIR/some-script"
    [ -f "$HOME/.config/created-file" ]
}
```

---

## Idempotency Testing

Scripts must be re-runnable without errors:

```bash
@test "script: runs successfully on first execution" {
    run "$DOTFILES_DIR/install-script"
    [ "$status" -eq 0 ]
}

@test "script: runs successfully on second execution" {
    # First run
    run "$DOTFILES_DIR/install-script"
    [ "$status" -eq 0 ]

    # Second run - must also succeed
    run "$DOTFILES_DIR/install-script"
    [ "$status" -eq 0 ]
}

@test "script: second run does not corrupt config" {
    # First run
    "$DOTFILES_DIR/install-script"
    content_first=$(cat "$HOME/.config/file")

    # Second run
    "$DOTFILES_DIR/install-script"
    content_second=$(cat "$HOME/.config/file")

    # Content unchanged
    [ "$content_first" = "$content_second" ]
}

@test "script: second run reports already configured" {
    "$DOTFILES_DIR/install-script"

    run "$DOTFILES_DIR/install-script"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Already"* ]]
}
```

---

## Testing Sourced Functions

For scripts with functions to test directly:

```bash
@test "find_key: returns empty when no keys exist" {
    run bash -c 'source "$DOTFILES_DIR/git-ssh-setup" && find_personal_key'
    [ "$status" -ne 0 ] || [ -z "$output" ]
}

@test "find_key: prefers specific key over generic" {
    touch "$HOME/.ssh/id_ed25519"
    touch "$HOME/.ssh/id_ed25519-personal"

    run bash -c 'source "$DOTFILES_DIR/git-ssh-setup" && find_personal_key'
    [[ "$output" == *"id_ed25519-personal"* ]]
}
```

---

## Platform-Specific Tests

```bash
@test "symlink: creates link on Linux" {
    skip_unless_linux

    run "$DOTFILES_DIR/link-setup"
    [ "$status" -eq 0 ]
    [ -L "$HOME/.claude" ]  # Is symlink
}

@test "junction: creates junction on Windows" {
    skip_unless_windows

    run "$DOTFILES_DIR/link-setup"
    [ "$status" -eq 0 ]
    [ -e "$HOME/.claude" ]  # Exists (junctions aren't symlinks)
}
```

**Note:** Windows junctions in temp directories may have restrictions - skip junction tests on Windows if they fail.

---

## Makefile Integration

```makefile
.PHONY: test test-quick test-docker preflight

preflight:
	@echo "Running pre-flight checks..."
	@# Check for CRLF corruption
	@if command -v file >/dev/null 2>&1; then \
		if file .bashrc .zshrc install 2>/dev/null | grep -q CRLF; then \
			echo "ERROR: CRLF line endings detected"; \
			exit 1; \
		fi; \
	fi
	@# Check Bats installed
	@if ! command -v bats >/dev/null 2>&1; then \
		echo "ERROR: Bats not found."; \
		echo "Install: brew install bats-core (macOS)"; \
		echo "         apt install bats (Ubuntu)"; \
		echo "         npm install -g bats (Windows)"; \
		exit 1; \
	fi
	@echo "Pre-flight checks passed."

test: preflight
	bats test/

test-quick: preflight
	bats test/core.bats

test-docker:
	docker run --rm -v "$$(pwd):/app:ro" -w /app ubuntu:24.04 bash -c '\
		apt-get update -qq && \
		apt-get install -y -qq bats git >/dev/null 2>&1 && \
		bats test/'
```

---

## GitHub Actions CI

```yaml
name: Shell Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - run: sudo apt-get update && sudo apt-get install -y bats
      - run: make test

  test-windows:
    runs-on: windows-latest
    defaults:
      run:
        shell: bash
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - run: npm install -g bats
      - run: make test
```

---

## Common Patterns

### Testing Graceful Failures

```bash
@test "script: fails gracefully when source missing" {
    rm -rf "$HOME/.dotfiles/.claude"

    run "$DOTFILES_DIR/claude-link-setup"
    [ "$status" -eq 1 ]
    [[ "$output" == *"not found"* ]]
}

@test "script: handles missing SSH keys" {
    # No keys created
    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]  # Should still succeed
}
```

### Testing File Creation

```bash
@test "script: creates config file" {
    touch "$HOME/.ssh/id_ed25519"

    run "$DOTFILES_DIR/git-ssh-setup"
    [ "$status" -eq 0 ]
    [ -f "$HOME/.gitconfig-personal-local" ]
}
```

### Testing Output Messages

```bash
@test "script: reports success message" {
    run "$DOTFILES_DIR/install"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Installation complete"* ]]
}
```

---

## Sub-Agent Testing Rules

When spawning sub-agents to run tests:

- **Targeted tests only** - Run specific test files, never full suite
- **Match scope to changes** - Test files related to what was modified
- **Fast feedback** - Sub-agents should complete quickly

```bash
# ✅ CORRECT - Targeted
bats test/prompt_format.bats
bats test/git_ssh_setup.bats -f "symlink"

# ❌ WRONG - Full suite in sub-agent
bats test/
make test
```

**Why this matters:** Full test suites waste time and context. Sub-agents should validate specific changes, not re-run everything.

---

## Installation

```bash
# macOS
brew install bats-core

# Ubuntu/Debian
apt install bats

# Windows (Git Bash)
npm install -g bats

# Arch Linux
pacman -S bash-bats
```

---

## Directory Structure

```
project/
├── Makefile
├── .github/workflows/test.yml
├── test/
│   ├── test_helper.bash      # Shared setup/teardown
│   ├── script_name.bats      # Tests for script_name
│   └── idempotency.bats      # Re-run safety tests
└── script_name                # Script being tested
```
