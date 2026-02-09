# Cross-platform zprofile for Linux and Windows (Git Bash/MSYS2)
#
# On MSYS2/Git Bash, the system zprofile sources /etc/profile which
# loads git-prompt.sh -> git-completion.bash, causing errors in zsh.
# We skip that and handle everything in .zshrc instead.

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  # Windows: Skip /etc/profile sourcing (causes git-completion.bash error)
  # Just ensure PATH includes common locations
  export PATH="$HOME/.local/bin:$HOME/bin:$PATH"
else
  # Linux: Source profile if it exists and hasn't been sourced
  if [[ -z "$_PROFILE_SOURCED" && -f /etc/profile ]]; then
    emulate sh -c 'source /etc/profile'
    export _PROFILE_SOURCED=1
  fi
fi
