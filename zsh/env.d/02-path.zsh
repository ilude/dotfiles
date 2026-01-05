# PATH configuration (sourced by all shells)
export PATH="$HOME/.local/bin:$PATH"

# MSYS2/Git Bash: restore Git for Windows in PATH
# MSYS2's login shell resets PATH, losing Git for Windows binaries
if [[ ("$OSTYPE" == "msys" || "$OSTYPE" == "cygwin") && -d "/c/Program Files/Git/mingw64/bin" ]]; then
    export PATH="/c/Program Files/Git/mingw64/bin:$PATH"
fi
