# .zshrc - interactive shell configuration
# Sources modular rc.d/ files for organized configuration

# Fix MSYS2/Git Bash HOME mismatch: MSYS2 zsh sets HOME=/home/Mike
# but dotfiles are at /c/Users/Mike. Detect and fix ZDOTDIR.
if [[ -z "$ZDOTDIR" && "$OSTYPE" == "cygwin" && -d "/c/Users/${USER:-$(whoami)}" ]]; then
    export ZDOTDIR="/c/Users/${USER:-$(whoami)}"
fi

# Dotfiles base directory
_dotfiles="${ZDOTDIR:-$HOME}/.dotfiles"

# Source env.d modules (if .zshenv didn't run)
if [[ -z "$WINHOME" && -d "$_dotfiles/zsh/env.d" ]]; then
    for f in "$_dotfiles/zsh/env.d"/*.zsh(N); do
        source "$f"
    done
fi

# Source rc.d modules (interactive shell config)
for f in "$_dotfiles/zsh/rc.d"/*.zsh(N); do
    source "$f"
done

unset _dotfiles

# Source uv environment if installed (conditional to avoid errors when not present)
[[ -f "${ZDOTDIR:-$HOME}/.local/bin/env" ]] && . "${ZDOTDIR:-$HOME}/.local/bin/env"
