# .zshenv - sourced by ALL zsh shells (login, interactive, scripts)
# Keep this minimal - only truly global environment setup

# Ensure ZDOTDIR is set (critical for MSYS2 where HOME differs from Git Bash)
export ZDOTDIR="${ZDOTDIR:-$HOME}"

# Source secrets file if it exists (API keys, tokens, etc.)
# Copy .secrets.example to .secrets and fill in values
[[ -f "${ZDOTDIR:-$HOME}/.dotfiles/.secrets" ]] && source "${ZDOTDIR:-$HOME}/.dotfiles/.secrets"

# Source all env.d modules
for f in "${ZDOTDIR:-$HOME}/.dotfiles/zsh/env.d"/*.zsh(N); do
    source "$f"
done
