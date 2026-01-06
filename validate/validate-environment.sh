#!/usr/bin/env bash
# validate-environment.sh - Validate environment variables and Claude Code hook scenario
# Ensures all required environment variables are set and Claude Code hooks can execute

# Source common validation utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/validate-common.sh"

section "Claude Code Hook Scenario (CRITICAL)"

# Test: bash -c 'command -v uv' succeeds
if bash -c 'command -v uv' >/dev/null 2>&1; then
    echo -e "${GREEN}✓${RESET} uv is available in subshell"
    ((PASS_COUNT++))
else
    echo -e "${RED}✗${RESET} uv is available in subshell"
    echo "  Claude Code hooks will fail!"
    ((FAIL_COUNT++))
fi

# Test: bash -c 'echo "$PATH" | grep -q ".local/bin"' succeeds
if bash -c 'echo "$PATH" | grep -q ".local/bin"' >/dev/null 2>&1; then
    echo -e "${GREEN}✓${RESET} .local/bin is in PATH for subshell"
    ((PASS_COUNT++))
else
    echo -e "${RED}✗${RESET} .local/bin is in PATH for subshell"
    echo "  Claude Code hooks will fail!"
    ((FAIL_COUNT++))
fi

section "Environment Variables"

check '[[ -n "$HOME" ]]' "HOME is set"
check '[[ -d "$HOME" ]]' "HOME exists"
info "HOME" "$HOME"

check '[[ -n "$PATH" ]]' "PATH is set"
check 'echo "$PATH" | grep -q ".local/bin"' "PATH contains .local/bin"

check '[[ -n "$EDITOR" ]]' "EDITOR is set"

check_warn '[[ -n "$LC_ALL" ]]' "LC_ALL set"
check_warn '[[ -n "$LANG" ]]' "LANG set"

section "Platform-Specific Checks"

if is_windows; then
    check '[[ -n "$WINHOME" ]]' "WINHOME is set"
fi

if is_msys; then
    check '[[ -n "$ZDOTDIR" ]]' "ZDOTDIR is set"
    check '[[ "$ZDOTDIR" =~ ^/c/Users/ ]]' "ZDOTDIR uses Windows home"
fi

if is_wsl; then
    check '[[ -d "$WINHOME" ]]' "WINHOME accessible"
fi

summary
exit $?
