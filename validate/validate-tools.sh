#!/usr/bin/env bash
# validate-tools.sh - Validate availability of required and optional tools
# Checks shell tools, Python environments, GitHub CLI, JSON tools, modern CLI utilities,
# build tools, and version information.

# Source common validation utilities
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$script_dir/validate-common.sh"

section "Core Shell Tools"
check "command -v bash" "bash"
check "command -v git" "git"
check_warn "command -v zsh" "zsh"

section "Python Tools"
check_warn "command -v python || command -v python3" "python or python3"
check_warn "command -v uv" "uv"

section "GitHub & JSON Tools"
check_warn "command -v gh" "gh (GitHub CLI)"
check_warn "command -v jq" "jq"

section "Modern CLI Tools"
check_warn "command -v fzf" "fzf"
check_warn "command -v eza" "eza"
check_warn "command -v bat" "bat"
check_warn "command -v rg" "rg (ripgrep)"
check_warn "command -v fd" "fd"
check_warn "command -v zoxide" "zoxide"
check_warn "command -v delta" "delta (git-delta)"

section "Build Tools"
check_warn "command -v make" "make"
check_warn "command -v node" "node"

section "Version Information"
if command -v git >/dev/null 2>&1; then
    info "git version" "$(git --version)"
fi

if command -v zsh >/dev/null 2>&1; then
    info "zsh version" "$(zsh --version)"
fi

if command -v bash >/dev/null 2>&1; then
    info "bash version" "$BASH_VERSION"
fi

summary
exit $?
