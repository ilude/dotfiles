#!/usr/bin/env bats

# Prompt path normalization tests
# Validates that paths are correctly shortened to ~ in prompts

load test_helper

setup() {
    setup_test_home

    # Extract __set_prompt function from .bashrc (bypassing non-interactive check)
    # The function starts at "^__set_prompt()" and ends at "^PROMPT_COMMAND"
    eval "$(sed -n '/^__set_prompt()/,/^PROMPT_COMMAND/p' "$DOTFILES_DIR/.bashrc" | head -n -1)"
}

teardown() {
    teardown_test_home
}

# =============================================================================
# Path normalization tests (non-WSL platforms)
# =============================================================================

@test "prompt: home path normalizes to ~ on non-WSL" {
    skip_unless_linux  # Also skips on Windows

    # Simulate being in home directory
    cd "$HOME"
    __set_prompt

    # PS1 should contain ~
    [[ "$PS1" == *"~"* ]]
}

@test "prompt: home subdir normalizes to ~/subdir on non-WSL" {
    skip_unless_linux

    mkdir -p "$HOME/projects"
    cd "$HOME/projects"
    __set_prompt

    [[ "$PS1" == *"~/projects"* ]]
}

# =============================================================================
# WSL-specific tests
# =============================================================================

@test "prompt: WSL Windows home path normalizes to ~" {
    skip_unless_linux

    # Skip if not actually in WSL
    if [[ ! -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
        skip "Test requires actual WSL environment"
    fi

    # Use actual Windows home path
    PWD="/mnt/c/Users/$USER/.dotfiles"
    __set_prompt

    # Should normalize to ~/.dotfiles
    [[ "$PS1" == *"~/.dotfiles"* ]]
    [[ "$PS1" != *"/mnt/c"* ]]
}

@test "prompt: WSL Windows home path normalizes with mixed case" {
    skip_unless_linux

    # Skip if not actually in WSL
    if [[ ! -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
        skip "Test requires actual WSL environment"
    fi

    # Windows paths often have mixed case (Users vs users)
    # The capitalized username (Mike) should still match $USER (mike)
    local username="${USER:-$(whoami)}"
    local capitalized="${username^}"  # Capitalize first letter
    PWD="/mnt/c/Users/${capitalized}/.dotfiles"
    __set_prompt

    # Should still normalize to ~/.dotfiles regardless of case
    [[ "$PS1" == *"~/.dotfiles"* ]]
    [[ "$PS1" != *"/mnt/c"* ]]
}

@test "prompt: WSL Linux home stays as full path (not ~)" {
    skip_unless_linux

    # Skip if not actually in WSL
    if [[ ! -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
        skip "Test requires actual WSL environment"
    fi

    # Linux home in WSL should NOT become ~
    PWD="/home/$USER/projects"
    __set_prompt

    # Should show full path, NOT ~/projects
    [[ "$PS1" == *"/home/$USER/projects"* ]]
    [[ "$PS1" != *"~/projects"* ]] || [[ "$PS1" == *"/home"* ]]
}

# =============================================================================
# Non-home path tests
# =============================================================================

@test "prompt: non-home path stays unchanged" {
    skip_unless_linux

    PWD="/tmp/somedir"
    __set_prompt

    [[ "$PS1" == *"/tmp/somedir"* ]]
}

# =============================================================================
# Space-in-path edge cases
# =============================================================================

@test "prompt: home with space normalizes to ~ on non-WSL" {
    skip_unless_linux

    # Create a test home with a space in the name
    local space_home="$TEST_HOME/Mike Smith"
    mkdir -p "$space_home"
    export HOME="$space_home"
    cd "$HOME"
    __set_prompt

    # PS1 should contain ~, not the full path with space
    [[ "$PS1" == *"~"* ]]
    [[ "$PS1" != *"Mike Smith"* ]]
}

@test "prompt: subdir under home with space normalizes to ~/subdir on non-WSL" {
    skip_unless_linux

    # Create a test home with a space and a subdirectory
    local space_home="$TEST_HOME/Mike Smith"
    mkdir -p "$space_home/projects"
    export HOME="$space_home"
    cd "$HOME/projects"
    __set_prompt

    # Should show ~/projects, not full path
    [[ "$PS1" == *"~/projects"* ]]
    [[ "$PS1" != *"Mike Smith"* ]]
}

@test "prompt: WSL Windows home with space normalizes to ~" {
    skip_unless_linux

    # Skip if not actually in WSL
    if [[ ! -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
        skip "Test requires actual WSL environment"
    fi

    # Simulate Windows path with space in username
    PWD="/mnt/c/Users/Mike Smith/.dotfiles"
    __set_prompt

    # Should normalize to ~/.dotfiles even with space in home path
    [[ "$PS1" == *"~/.dotfiles"* ]]
    [[ "$PS1" != *"/mnt/c"* ]]
    [[ "$PS1" != *"Mike Smith"* ]]
}

@test "prompt: WSL Windows home with space and mixed case normalizes" {
    skip_unless_linux

    # Skip if not actually in WSL
    if [[ ! -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
        skip "Test requires actual WSL environment"
    fi

    # Windows path with space and mixed case (USERS vs users)
    PWD="/mnt/c/USERS/Mike Smith/projects"
    __set_prompt

    # Should normalize to ~/projects regardless of case or space
    [[ "$PS1" == *"~/projects"* ]]
    [[ "$PS1" != *"/mnt/c"* ]]
    [[ "$PS1" != *"Mike Smith"* ]]
}

@test "prompt: directory name with space stays as-is when not under home" {
    skip_unless_linux

    # Non-home path with spaces should display as-is
    PWD="/tmp/my project/code"
    __set_prompt

    # Should show full path with spaces preserved
    [[ "$PS1" == *"/tmp/my project/code"* ]]
}

@test "prompt: deeply nested path under home with space normalizes correctly" {
    skip_unless_linux

    # Create a deeply nested structure under a home with space
    local space_home="$TEST_HOME/Mike Smith"
    mkdir -p "$space_home/work/client projects/web app"
    export HOME="$space_home"
    cd "$HOME/work/client projects/web app"
    __set_prompt

    # Should normalize to ~/work/client projects/web app
    [[ "$PS1" == *"~/work/client projects/web app"* ]]
    [[ "$PS1" != *"Mike Smith"* ]]
}

# =============================================================================
# Git branch tests
# =============================================================================

@test "prompt: git branch appears in brackets" {
    skip_unless_linux

    # Create a git repo in test home
    mkdir -p "$HOME/repo"
    cd "$HOME/repo"
    git init --quiet
    git checkout -b testbranch 2>/dev/null || git switch -c testbranch

    __set_prompt

    # Branch name appears in prompt with yellow brackets (e[33m) and cyan branch (e[36m)
    [[ "$PS1" == *'e[33m'* ]] && [[ "$PS1" == *'e[36m'* ]] && [[ "$PS1" == *'testbranch'* ]]
}

@test "prompt: no brackets when not in git repo" {
    skip_unless_linux

    mkdir -p "$HOME/notrepo"
    cd "$HOME/notrepo"

    __set_prompt

    # Should not contain git branch colors (yellow e[33m or cyan e[36m for branch)
    # Only green (e[32m) for path should be present
    [[ "$PS1" != *'e[33m'* ]] && [[ "$PS1" != *'e[36m'* ]]
}
