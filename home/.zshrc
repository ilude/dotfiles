# .zshrc - interactive shell configuration
# Sources modular rc.d/ files for organized configuration
# shellcheck disable=SC1009,SC1036,SC1058,SC1072,SC1073,SC1090

# Enable zprof when DEBUG=1 (run: DEBUG=1 zsh)
[[ -n "$DEBUG" ]] && zmodload zsh/zprof

# Fix MSYS2/Git Bash HOME mismatch: MSYS2 zsh sets HOME=/home/Mike
# but dotfiles are at /c/Users/Mike. Detect and fix ZDOTDIR.
if [[ -z "$ZDOTDIR" && ( "$OSTYPE" == "cygwin" || "$OSTYPE" == "msys" ) && -d "/c/Users/${USER:-$(whoami)}" ]]; then
    export ZDOTDIR="/c/Users/${USER:-$(whoami)}"
fi

# Dotfiles base directory
_dotfiles="${ZDOTDIR:-$HOME}/.dotfiles"

# Source env.d modules (if .zshenv didn't run)
if [[ -z "$_DOTFILES_ENV_SOURCED" && -d "$_dotfiles/zsh/env.d" ]]; then
    for f in "$_dotfiles/zsh/env.d"/*.zsh(N); do
        source "$f"
    done
fi

# Source environment secrets if present (API keys, tokens, etc.)
# Loaded here (not .zshenv) so secrets are only available in interactive shells
if [[ -f "$_dotfiles/.env" ]]; then
    source "$_dotfiles/.env"
elif [[ -f "$_dotfiles/.secrets" ]]; then
    source "$_dotfiles/.secrets"
fi

# Source rc.d modules (interactive shell config)
for f in "$_dotfiles/zsh/rc.d"/*.zsh(N); do
    source "$f"
done

unset _dotfiles

# Source uv environment if installed (conditional to avoid errors when not present)
[[ -f "${ZDOTDIR:-$HOME}/.local/bin/env" ]] && . "${ZDOTDIR:-$HOME}/.local/bin/env"

# Machine-specific overrides (not tracked in git)
# Create ~/.zshrc.local for machine-specific customizations
source_if_exists "${ZDOTDIR:-$HOME}/.zshrc.local"

# Debug timing report (only shown when DEBUG=1)
debug_report

# Print zprof report when DEBUG=1
[[ -n "$DEBUG" ]] && zprof

. "$HOME/.local/bin/env"

# opencode
export PATH=/Users/mglenn/.opencode/bin:$PATH
