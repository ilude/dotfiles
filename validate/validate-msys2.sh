#!/usr/bin/env bash
# validate-msys2.sh - Validate MSYS2/Git Bash-specific configuration
# Checks MSYS2 installation, zsh setup, nsswitch.conf, and environment variables

# Source common validation utilities
source "$(dirname "$0")/validate-common.sh"

# Early exit if not Windows (silent, no output)
if ! is_windows; then
    exit 0
fi

# MSYS2/Git Bash Configuration section
section "MSYS2/Git Bash Configuration"

# Check MSYS2 installed
check_warn '[[ -d /c/msys64 ]]' "MSYS2 installed"

# If /c/msys64 exists, check zsh and nsswitch.conf
if [[ -d /c/msys64 ]]; then
    # Check zsh installed in MSYS2
    check_warn '[[ -x /c/msys64/usr/bin/zsh.exe ]]' "MSYS2 zsh installed"

    # Check nsswitch.conf has correct db_home setting
    check_warn 'grep -q "db_home: windows" /c/msys64/etc/nsswitch.conf 2>/dev/null || grep -q "db_home: env windows" /c/msys64/etc/nsswitch.conf 2>/dev/null' "nsswitch.conf uses db_home: windows"
fi

# If running in MSYS2, check ZDOTDIR configuration
if is_msys; then
    # Check ZDOTDIR is set
    check '[[ -n "$ZDOTDIR" ]]' "ZDOTDIR set"

    # Check ZDOTDIR uses Windows home (/c/Users/...)
    check '[[ "$ZDOTDIR" =~ ^/c/Users/ ]]' "ZDOTDIR uses Windows home"

    # Info: Show ZDOTDIR value if set
    if [[ -n "$ZDOTDIR" ]]; then
        info "ZDOTDIR" "$ZDOTDIR"
    fi
fi

# Check PATH includes MSYS2
check_warn 'echo "$PATH" | grep -q "msys64"' "PATH includes MSYS2"

# Print summary
summary
exit $?
