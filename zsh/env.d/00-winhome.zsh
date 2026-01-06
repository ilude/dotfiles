# WINHOME: Windows home directory for cross-platform scripts
# Useful for accessing Windows user files from Unix shells
#
# WSL detection uses two methods for reliability:
# 1. WSLInterop file (standard method)
# 2. /proc/version check (fallback for edge cases)
if [[ -n "$WSL_DISTRO_NAME" ]] || \
   [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]] || \
   grep -qi microsoft /proc/version 2>/dev/null; then
    # WSL: Windows home is /mnt/c/Users/$USER
    export WINHOME="/mnt/c/Users/${USER:-$(whoami)}"
    export IS_WSL=1
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Git Bash/MSYS2: Use ZDOTDIR (Windows home) or construct from /c/Users/$USER
    export WINHOME="${ZDOTDIR:-/c/Users/${USER:-$(whoami)}}"
    export IS_MSYS=1
fi
