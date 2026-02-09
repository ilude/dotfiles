# .zshenv - sourced by ALL zsh shells (login, interactive, scripts)
# Keep this minimal - only truly global environment setup

# Ensure ZDOTDIR is set (critical for MSYS2 where HOME differs from Git Bash)
export ZDOTDIR="${ZDOTDIR:-$HOME}"

# Source all env.d modules
for f in "${ZDOTDIR:-$HOME}/.dotfiles/zsh/env.d"/*.zsh(N); do
    source "$f"
done

_DOTFILES_ENV_SOURCED=1
