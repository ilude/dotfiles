# .zshenv - sourced by ALL zsh shells (login, interactive, scripts)
# Keep this minimal - only truly global environment setup

# Ensure ZDOTDIR is set (critical for MSYS2 where HOME differs from Git Bash)
export ZDOTDIR="${ZDOTDIR:-$HOME}"

# Prefer extended provider prompt caching in pi when supported.
export PI_CACHE_RETENTION="${PI_CACHE_RETENTION:-long}"

# Source all env.d modules
for f in "${ZDOTDIR:-$HOME}/.dotfiles/zsh/env.d"/*.zsh(N); do
    source "$f"
done

_DOTFILES_ENV_SOURCED=1
