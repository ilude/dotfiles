# PATH configuration (sourced by all shells)
# Use WINHOME on Windows platforms (set in 00-winhome.zsh), fall back to HOME
export PATH="${WINHOME:-$HOME}/.local/bin:$PATH"

# WSL: also add native HOME/.local/bin (WINHOME points to /mnt/c/...,
# but native tools like Claude Code install to /home/<user>/.local/bin)
if [[ -n "$WINHOME" && "$HOME" != "$WINHOME" ]]; then
    export PATH="$HOME/.local/bin:$PATH"
fi

# MSYS2/Git Bash: restore Git for Windows in PATH
# MSYS2's login shell resets PATH, losing Git for Windows binaries
if [[ ("$OSTYPE" == "msys" || "$OSTYPE" == "cygwin") && -d "/c/Program Files/Git/mingw64/bin" ]]; then
    export PATH="/c/Program Files/Git/mingw64/bin:$PATH"
fi

# Windows: source generated PATH config (from install.ps1)
# Contains Windows dev tools converted to Git Bash format
if [[ ("$OSTYPE" == "msys" || "$OSTYPE" == "cygwin") && -f "${ZDOTDIR:-$HOME}/.path-windows-local" ]]; then
    source "${ZDOTDIR:-$HOME}/.path-windows-local"
fi
