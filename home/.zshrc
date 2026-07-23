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

# Disable Git Bash/MSYS path conversion for Docker/Ansible volume paths.
# Prevents /workspace from becoming C:/Program Files/Git/workspace.
if command -v uname >/dev/null 2>&1 && uname -s | grep -qiE '^(MINGW|MSYS|CYGWIN)'; then
    export MSYS_NO_PATHCONV="${MSYS_NO_PATHCONV:-1}"
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
# Keep broker selection owned by Onclave instead of the dotfiles secret files.
_onclave_amqp_url_was_set=${+ONCLAVE_AMQP_URL}
if (( _onclave_amqp_url_was_set )); then
    _onclave_amqp_url=$ONCLAVE_AMQP_URL
fi

if [[ -f "$_dotfiles/.env" ]]; then
    source "$_dotfiles/.env"
elif [[ -f "$_dotfiles/.secrets" ]]; then
    source "$_dotfiles/.secrets"
fi
if [[ -f "$_dotfiles/private/secrets.env" ]]; then
    source "$_dotfiles/private/secrets.env"
fi

if (( _onclave_amqp_url_was_set )); then
    export ONCLAVE_AMQP_URL=$_onclave_amqp_url
else
    unset ONCLAVE_AMQP_URL
fi
unset _onclave_amqp_url _onclave_amqp_url_was_set

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

# broot launcher (sourced only if present)
[[ -f "${ZDOTDIR:-$HOME}/.config/broot/launcher/bash/br" ]] && source "${ZDOTDIR:-$HOME}/.config/broot/launcher/bash/br"

# bun completions
[ -s "/root/.bun/_bun" ] && source "/root/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
