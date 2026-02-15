#!/usr/bin/env bash
# validate-wsl.sh - Validate WSL-specific configuration
# Checks WSL environment variables, mounts, and tools

# Source common validation utilities
source "$(dirname "$0")/../validate/validate-common.sh"

# Early exit if not WSL (silent, no output)
if ! is_wsl; then
    exit 0
fi

# WSL Configuration section
section "WSL Configuration"

# Check WSL_DISTRO_NAME is set
check '[[ -n "$WSL_DISTRO_NAME" ]]' "WSL_DISTRO_NAME set"

# Info: Show WSL distribution name
if [[ -n "$WSL_DISTRO_NAME" ]]; then
    info "WSL Distribution" "$WSL_DISTRO_NAME"
fi

# Check /mnt/c mounted
check '[[ -d /mnt/c ]]' "/mnt/c mounted"

# Check WINHOME is set
check '[[ -n "$WINHOME" ]]' "WINHOME set"

# Check WINHOME is accessible
check '[[ -d "$WINHOME" ]]' "WINHOME accessible"

# Warning: wslu tools installed (optional)
check_warn 'command -v wslpath' "wslu tools installed"

# Warning: WSLInterop file exists (optional)
check_warn '[[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]' "/proc/sys/fs/binfmt_misc/WSLInterop exists"

# Print summary
summary
exit $?
