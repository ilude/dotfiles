#!/usr/bin/env bash
# validate-linux.sh - Validates native Linux-specific configuration
# Checks distribution, package manager, and zsh shell setup for native Linux systems
# (excludes WSL)

# Source shared validation utilities
source "$(dirname "$0")/validate-common.sh"

# Early exit if not native Linux
if ! is_linux; then
    exit 0
fi

# Print header
echo "=== Linux Configuration Validator ==="
info "Home directory" "$HOME"
info "ZDOTDIR" "${ZDOTDIR:-$HOME}"

# Linux Configuration
section "Linux Configuration"

# Distribution info
check_warn "Distribution info available" 'command -v lsb_release || [[ -f /etc/os-release ]]'

if command -v lsb_release >/dev/null 2>&1; then
    info "Distribution" "$(lsb_release -d | cut -f2-)"
elif [[ -f /etc/os-release ]]; then
    info "Distribution" "$(grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '\"')"
fi

# Package manager
check_warn "Package manager detected" 'command -v apt || command -v yum || command -v pacman || command -v dnf'

if command -v apt >/dev/null 2>&1; then
    info "Package Manager" "apt"
elif command -v yum >/dev/null 2>&1; then
    info "Package Manager" "yum"
elif command -v pacman >/dev/null 2>&1; then
    info "Package Manager" "pacman"
elif command -v dnf >/dev/null 2>&1; then
    info "Package Manager" "dnf"
fi

# Default shell
check_warn "Default shell is zsh" '[[ "$SHELL" == *"zsh"* ]]'
info "Default Shell" "$SHELL"

# Print summary and exit with appropriate code
summary
exit $?
