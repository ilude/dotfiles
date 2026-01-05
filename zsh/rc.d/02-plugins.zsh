# Plugin configuration (interactive shells)

# Fix cursor flickering on MSYS2/Git Bash (Windows Terminal/VS Code)
# ConPTY bug causes cursor to jump - see: https://github.com/zsh-users/zsh-syntax-highlighting/issues/789
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    ZSH_AUTOSUGGEST_USE_ASYNC=0
    ZSH_AUTOSUGGEST_MANUAL_REBIND=1
    ZSH_DISABLE_SYNTAX_HIGHLIGHTING=1  # Disables syntax-highlighting to prevent flickering
fi

# Prevent autosuggestion lag on long lines (Windows performance issue)
ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=50

# Use ZDOTDIR for dotfiles path (MSYS2's zsh has different HOME than Git Bash)
source "${ZDOTDIR:-$HOME}/.dotfiles/zsh-plugins"

# ctrl+space to accept autosuggestion
bindkey '^ ' autosuggest-accept
