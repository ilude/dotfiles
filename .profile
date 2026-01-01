# Switch to zsh if available and running interactively
if [[ -t 1 && $(which zsh 2>/dev/null) ]]; then
  exec zsh -l
fi

# Source .bashrc for non-login interactive shells
if [ -n "$BASH_VERSION" ] && [ -f ~/.bashrc ]; then
  . ~/.bashrc
fi
