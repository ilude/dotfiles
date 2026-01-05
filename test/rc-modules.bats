#!/usr/bin/env bats

# RC Modules Tests
# ================
# Tests for rc.d modules: plugins, history, keybindings
# These verify existing functionality to prevent regressions.

load test_helper

setup() {
    setup_test_home
}

teardown() {
    teardown_test_home
}

# =============================================================================
# 02-plugins.zsh tests
# =============================================================================

@test "plugins: ZSH_AUTOSUGGEST_USE_ASYNC disabled on Windows (MSYS)" {
    # Verify async is disabled on MSYS to prevent cursor flickering
    grep -q 'ZSH_AUTOSUGGEST_USE_ASYNC=0' "$DOTFILES_DIR/zsh/rc.d/02-plugins.zsh"
}

@test "plugins: ZSH_AUTOSUGGEST_MANUAL_REBIND set on Windows" {
    # Manual rebind required for Windows ConPTY compatibility
    grep -q 'ZSH_AUTOSUGGEST_MANUAL_REBIND=1' "$DOTFILES_DIR/zsh/rc.d/02-plugins.zsh"
}

@test "plugins: ZSH_DISABLE_SYNTAX_HIGHLIGHTING on Windows" {
    # Syntax highlighting disabled on MSYS/Cygwin to prevent flickering
    grep -q 'ZSH_DISABLE_SYNTAX_HIGHLIGHTING=1' "$DOTFILES_DIR/zsh/rc.d/02-plugins.zsh"
}

@test "plugins: ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE limits line length" {
    # Buffer size limited to 50 to prevent lag on long lines
    grep -q 'ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=50' "$DOTFILES_DIR/zsh/rc.d/02-plugins.zsh"
}

@test "plugins: sources zsh-plugins using ZDOTDIR" {
    # Must use ZDOTDIR for MSYS2 compatibility
    grep -q '${ZDOTDIR:-\$HOME}/.dotfiles/zsh-plugins' "$DOTFILES_DIR/zsh/rc.d/02-plugins.zsh"
}

@test "plugins: ctrl+space bound to autosuggest-accept" {
    grep -q "bindkey '^ ' autosuggest-accept" "$DOTFILES_DIR/zsh/rc.d/02-plugins.zsh"
}

# =============================================================================
# 03-history.zsh tests
# =============================================================================

@test "history: HISTSIZE is 100000" {
    grep -q 'HISTSIZE=100000' "$DOTFILES_DIR/zsh/rc.d/03-history.zsh"
}

@test "history: SAVEHIST is 100000" {
    grep -q 'SAVEHIST=100000' "$DOTFILES_DIR/zsh/rc.d/03-history.zsh"
}

@test "history: HISTFILE is set" {
    grep -q 'HISTFILE=' "$DOTFILES_DIR/zsh/rc.d/03-history.zsh"
}

@test "history: APPEND_HISTORY option enabled" {
    grep -q 'setopt APPEND_HISTORY' "$DOTFILES_DIR/zsh/rc.d/03-history.zsh"
}

@test "history: EXTENDED_HISTORY option enabled" {
    grep -q 'setopt EXTENDED_HISTORY' "$DOTFILES_DIR/zsh/rc.d/03-history.zsh"
}

@test "history: HIST_IGNORE_DUPS option enabled" {
    grep -q 'setopt HIST_IGNORE_DUPS' "$DOTFILES_DIR/zsh/rc.d/03-history.zsh"
}

@test "history: SHARE_HISTORY option enabled" {
    grep -q 'setopt SHARE_HISTORY' "$DOTFILES_DIR/zsh/rc.d/03-history.zsh"
}

# =============================================================================
# 04-keybindings.zsh tests
# =============================================================================

@test "keybindings: Home key bound to beginning-of-line" {
    grep -q 'bindkey.*beginning-of-line' "$DOTFILES_DIR/zsh/rc.d/04-keybindings.zsh"
}

@test "keybindings: End key bound to end-of-line" {
    grep -q 'bindkey.*end-of-line' "$DOTFILES_DIR/zsh/rc.d/04-keybindings.zsh"
}

@test "keybindings: ctrl+b bound to backward-word" {
    grep -q "bindkey '\\^b' backward-word" "$DOTFILES_DIR/zsh/rc.d/04-keybindings.zsh"
}

@test "keybindings: ctrl+f bound to forward-word" {
    grep -q "bindkey '\\^f' forward-word" "$DOTFILES_DIR/zsh/rc.d/04-keybindings.zsh"
}

@test "keybindings: ctrl+backspace bound to backward-kill-word" {
    grep -q 'bindkey.*backward-kill-word' "$DOTFILES_DIR/zsh/rc.d/04-keybindings.zsh"
}

@test "keybindings: ctrl+delete bound to kill-word" {
    grep -q 'bindkey.*kill-word' "$DOTFILES_DIR/zsh/rc.d/04-keybindings.zsh"
}
