# Bash Testing with Bats-core

Shell script testing using the Bats (Bash Automated Testing System) framework.

## Why Bats-core

- Better Windows/MSYS2/Git Bash support than ShellSpec
- Native bash syntax - no new DSL to learn
- Simple `run` command captures exit code and output

---

## Test File Structure

```bash
#!/usr/bin/env bats

load test_helper

setup() {
    setup_test_home
}

teardown() {
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
```

---

## test_helper.bash Pattern

```bash
DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORIG_HOME="$HOME"

setup_test_home() {
    export TEST_HOME=$(mktemp -d)
    export HOME="$TEST_HOME"
    mkdir -p "$HOME/.ssh"
}

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

skip_unless_windows() {
    is_windows || skip "Test requires Windows"
}

skip_unless_linux() {
    is_windows && skip "Test requires Linux or WSL"
}
```

**Note:** Use `load test_helper` not `load test_helper.bash` - Bats auto-appends `.bash`.

---

## Idempotency Testing

Scripts must be re-runnable without errors:

```bash
@test "script: runs successfully on first execution" {
    run "$DOTFILES_DIR/install-script"
    [ "$status" -eq 0 ]
}

@test "script: runs successfully on second execution" {
    run "$DOTFILES_DIR/install-script"
    [ "$status" -eq 0 ]
    run "$DOTFILES_DIR/install-script"
    [ "$status" -eq 0 ]
}

@test "script: second run does not corrupt config" {
    "$DOTFILES_DIR/install-script"
    content_first=$(cat "$HOME/.config/file")
    "$DOTFILES_DIR/install-script"
    content_second=$(cat "$HOME/.config/file")
    [ "$content_first" = "$content_second" ]
}
```

---

## Testing Sourced Functions

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
    [ -L "$HOME/.claude" ]
}

@test "junction: creates junction on Windows" {
    skip_unless_windows
    run "$DOTFILES_DIR/link-setup"
    [ "$status" -eq 0 ]
    [ -e "$HOME/.claude" ]  # Junctions aren't symlinks
}
```

---

## Makefile Integration

```makefile
.PHONY: test test-docker

test:
	@command -v bats >/dev/null 2>&1 || (echo "Bats not found"; exit 1)
	bats test/

test-docker:
	docker run --rm -v "$$(pwd):/app:ro" -w /app ubuntu:24.04 bash -c '\
		apt-get update -qq && \
		apt-get install -y -qq bats git >/dev/null 2>&1 && \
		bats test/'
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
├── test/
│   ├── test_helper.bash
│   ├── script_name.bats
│   └── idempotency.bats
└── script_name
```
