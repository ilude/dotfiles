# WINHOME: Windows home directory for cross-platform scripts
# Useful for accessing Windows user files from Unix shells
if [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
    # WSL: Windows home is /mnt/c/Users/$USER
    export WINHOME="/mnt/c/Users/${USER:-$(whoami)}"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Git Bash/MSYS2: Use ZDOTDIR (Windows home) or construct from /c/Users/$USER
    export WINHOME="${ZDOTDIR:-/c/Users/${USER:-$(whoami)}}"
fi
