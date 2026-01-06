#!/usr/bin/env bash
# validate-common.sh - Shared utilities for validation scripts
# Provides color output, test counters, and platform detection for all validators

# Color codes (only if TTY)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    RESET='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    RESET=''
fi

# Global counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# check() - Evaluate test condition, increment PASS_COUNT on success, FAIL_COUNT on failure
# Usage: check "test -f ~/.bashrc" "bashrc exists"
check() {
    local test_cmd="$1"
    local description="$2"

    if eval "$test_cmd" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${RESET} ${description}"
        ((PASS_COUNT++))
    else
        echo -e "${RED}✗${RESET} ${description}"
        ((FAIL_COUNT++))
    fi
}

# check_warn() - Evaluate test condition, increment PASS_COUNT on success, WARN_COUNT on failure
# Usage: check_warn "command -v optional-tool" "optional tool installed"
check_warn() {
    local test_cmd="$1"
    local description="$2"

    if eval "$test_cmd" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${RESET} ${description}"
        ((PASS_COUNT++))
    else
        echo -e "${YELLOW}⚠${RESET} ${description}"
        ((WARN_COUNT++))
    fi
}

# info() - Print information line with blue ℹ prefix
# Usage: info "Home directory" "$HOME"
info() {
    local name="$1"
    local value="$2"
    echo -e "${BLUE}ℹ${RESET} ${name}: ${value}"
}

# section() - Print section header with blank line before
# Usage: section "System Information"
section() {
    echo
    echo "=== $1 ==="
}

# summary() - Print validation summary, return exit code based on failures
# Usage: summary; exit $?
summary() {
    echo
    echo "=== Validation Summary ==="
    echo -e "${GREEN}Passed:${RESET} ${PASS_COUNT}"
    if [[ $WARN_COUNT -gt 0 ]]; then
        echo -e "${YELLOW}Warnings:${RESET} ${WARN_COUNT}"
    fi
    if [[ $FAIL_COUNT -gt 0 ]]; then
        echo -e "${RED}Failed:${RESET} ${FAIL_COUNT}"
        return 1
    fi
    return 0
}

# Platform detection functions

# is_wsl() - Check if running in WSL
# Returns 0 if WSL, 1 otherwise
is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" ]] || [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]
}

# is_msys() - Check if running on Git Bash or MSYS2
# Returns 0 if MSYS/Cygwin, 1 otherwise
is_msys() {
    [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]
}

# is_linux() - Check if running on native Linux (not WSL)
# Returns 0 if Linux without WSL, 1 otherwise
is_linux() {
    [[ "$OSTYPE" == "linux-gnu"* ]] && ! is_wsl
}

# is_windows() - Check if running on Windows (MSYS2/Git Bash/ConPTY)
# Returns 0 if Windows, 1 otherwise
is_windows() {
    is_msys || [[ -n "$WINDIR" ]]
}

# Export functions for use in subshells
export -f check
export -f check_warn
export -f info
export -f section
export -f summary
export -f is_wsl
export -f is_msys
export -f is_linux
export -f is_windows
