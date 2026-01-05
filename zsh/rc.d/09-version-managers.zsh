# Lazy-load version managers on first use
# Faster startup - only initializes when actually needed
#
# Usage: Just use the command normally (e.g., `pyenv versions`)
# The wrapper function loads the real tool on first invocation.

# pyenv - Python version manager
if [[ -d "${PYENV_ROOT:-$HOME/.pyenv}" ]]; then
    pyenv() {
        unfunction pyenv
        export PYENV_ROOT="${PYENV_ROOT:-$HOME/.pyenv}"
        path=($PYENV_ROOT/bin $path)
        eval "$(command pyenv init -)"
        pyenv "$@"
    }
fi

# rbenv - Ruby version manager
if [[ -d "${RBENV_ROOT:-$HOME/.rbenv}" ]]; then
    rbenv() {
        unfunction rbenv
        export RBENV_ROOT="${RBENV_ROOT:-$HOME/.rbenv}"
        path=($RBENV_ROOT/bin $path)
        eval "$(command rbenv init -)"
        rbenv "$@"
    }
fi

# nodenv - Node.js version manager
if [[ -d "${NODENV_ROOT:-$HOME/.nodenv}" ]]; then
    nodenv() {
        unfunction nodenv
        export NODENV_ROOT="${NODENV_ROOT:-$HOME/.nodenv}"
        path=($NODENV_ROOT/bin $path)
        eval "$(command nodenv init -)"
        nodenv "$@"
    }
fi

# nvm - Node Version Manager (special case - uses NVM_DIR)
if [[ -d "${NVM_DIR:-$HOME/.nvm}" ]]; then
    nvm() {
        unfunction nvm
        export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
        source_if_exists "$NVM_DIR/nvm.sh"
        nvm "$@"
    }
    # Also lazy-load node/npm/npx
    for _cmd in node npm npx; do
        eval "$_cmd() { unfunction $_cmd node npm npx 2>/dev/null; nvm use default >/dev/null; command $_cmd \"\$@\" }"
    done
    unset _cmd
fi
