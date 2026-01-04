#!/usr/bin/env bats

# Shell Setup Tests
# =================
# Documents and verifies the unified shell experience across platforms.
#
# DESIGN PHILOSOPHY:
#   All terminals (Git Bash, WSL, Linux) should use zsh with identical config.
#   This ensures muscle memory and workflows transfer between machines.
#
# WHY ZSH EVERYWHERE:
#   - Predictive text (zsh-autosuggestions) - see command history as you type
#   - Syntax highlighting (zsh-syntax-highlighting) - red = invalid command
#   - Better tab completion with case-insensitive, fuzzy matching
#   - Shared history across sessions (100k lines with timestamps)
#   - fzf integration (Ctrl+R fuzzy history search)
#   - Consistent prompt showing git branch across all platforms
#
# SHELL STARTUP ORDER:
#   Login shell:     .bash_profile -> adds MSYS2 to PATH -> exec zsh
#   Non-login shell: .bashrc (minimal fallback if zsh unavailable)
#   Zsh:             .zshrc -> sources zsh-plugins -> full features
#
# PLATFORM-SPECIFIC ZSH INSTALLATION:
#   Linux/WSL: apt install zsh (via wsl-packages script)
#              - Standard package manager, simple installation
#              - wsl-packages also sets zsh as default shell via chsh
#
#   Git Bash:  Requires MSYS2 for pacman package manager
#              - Git for Windows is based on MSYS2 but stripped down
#              - We install full MSYS2 via winget to get pacman
#              - pacman -S zsh installs zsh into MSYS2
#              - .bash_profile adds /c/msys64/usr/bin to PATH
#              - This lets Git Bash find and exec MSYS2's zsh
#
# WHY NOT JUST USE BASH:
#   - Bash lacks built-in autosuggestions (ble.sh exists but is slow/heavy)
#   - Bash completion is less sophisticated than zsh's
#   - We want ONE config to maintain, not parallel bash/zsh configs

load test_helper

setup() {
    setup_test_home
}

teardown() {
    teardown_test_home
}

# =============================================================================
# .profile behavior - auto-switch to zsh
# =============================================================================

@test "shell-setup: .profile sources .bashrc for bash" {
    # .profile should source .bashrc when running in bash
    grep -q 'source.*bashrc\|\..*bashrc' "$DOTFILES_DIR/.profile" || \
    grep -q '\. ~/\.bashrc\|\. \$HOME/\.bashrc' "$DOTFILES_DIR/.profile"
}

@test "shell-setup: .profile execs zsh when available" {
    # .profile should exec zsh if it's available
    grep -q 'exec zsh' "$DOTFILES_DIR/.profile"
}

@test "shell-setup: .profile checks for interactive terminal before exec" {
    # Should only exec zsh in interactive mode (-t 1 or similar check)
    grep -q '\-t 1\|tty\|interactive' "$DOTFILES_DIR/.profile"
}

# =============================================================================
# zsh-plugins script
# =============================================================================

@test "shell-setup: zsh-plugins script exists and is executable" {
    [ -f "$DOTFILES_DIR/zsh-plugins" ]
    [ -x "$DOTFILES_DIR/zsh-plugins" ]
}

@test "shell-setup: zsh-plugins installs autosuggestions" {
    grep -q 'zsh-autosuggestions' "$DOTFILES_DIR/zsh-plugins"
}

@test "shell-setup: zsh-plugins installs syntax-highlighting" {
    grep -q 'zsh-syntax-highlighting' "$DOTFILES_DIR/zsh-plugins"
}

@test "shell-setup: zsh-plugins installs completions" {
    grep -q 'zsh-completions' "$DOTFILES_DIR/zsh-plugins"
}

@test "shell-setup: zsh-plugins creates plugins directory" {
    grep -q 'mkdir.*plugins\|plugins.*mkdir' "$DOTFILES_DIR/zsh-plugins"
}

# =============================================================================
# .zshrc configuration
# =============================================================================

@test "shell-setup: .zshrc enables completion system" {
    grep -q 'compinit' "$DOTFILES_DIR/.zshrc"
}

@test "shell-setup: .zshrc configures history" {
    grep -q 'HISTFILE\|HISTSIZE\|SAVEHIST' "$DOTFILES_DIR/.zshrc"
}

@test "shell-setup: .zshrc sources zsh-plugins" {
    grep -q 'zsh-plugins' "$DOTFILES_DIR/.zshrc"
}

@test "shell-setup: .zshrc has case-insensitive completion" {
    grep -q 'matcher-list.*a-zA-Z.*A-Za-z\|completion-ignore-case' "$DOTFILES_DIR/.zshrc"
}

# =============================================================================
# .bashrc as fallback
# =============================================================================

@test "shell-setup: .bashrc exists as fallback" {
    [ -f "$DOTFILES_DIR/.bashrc" ]
}

@test "shell-setup: .bashrc has early exit for non-interactive" {
    # Should exit early if not interactive
    head -20 "$DOTFILES_DIR/.bashrc" | grep -q 'case \$-\|return\|\[ -z "\$PS1" \]'
}

@test "shell-setup: .bashrc has prompt function" {
    grep -q '__set_prompt\|PS1=' "$DOTFILES_DIR/.bashrc"
}

# =============================================================================
# Platform-specific zsh installation
# =============================================================================

@test "shell-setup: wsl-packages installs zsh on Linux/WSL" {
    [ -f "$DOTFILES_DIR/wsl-packages" ]
    grep -q 'zsh' "$DOTFILES_DIR/wsl-packages"
}

@test "shell-setup: wsl-packages sets zsh as default shell" {
    grep -q 'chsh.*zsh\|default.*zsh' "$DOTFILES_DIR/wsl-packages"
}

# =============================================================================
# Git Bash / MSYS2 zsh installation
# These tests document how zsh should be installed for Git Bash
# =============================================================================

@test "shell-setup: install.ps1 installs MSYS2 for Git Bash zsh support" {
    # MSYS2 provides pacman which can install zsh for Git Bash
    grep -q 'MSYS2' "$DOTFILES_DIR/install.ps1"
}

@test "shell-setup: Git Bash should have pacman available after MSYS2 install" {
    # pacman is needed to install zsh in Git Bash environment
    # MSYS2 installs to C:\msys64 by default
    if [[ -x "/c/msys64/usr/bin/pacman.exe" ]]; then
        return 0
    else
        skip "MSYS2 not installed yet - run install.ps1 first"
    fi
}

@test "shell-setup: Git Bash should have zsh available" {
    # After proper setup, zsh should be in PATH for Git Bash
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        command -v zsh || skip "zsh not installed - run: pacman -S zsh"
    else
        skip "Not running in Git Bash"
    fi
}

# =============================================================================
# Unified experience verification
# =============================================================================

@test "shell-setup: prompt shows git branch on all platforms" {
    # Both .bashrc and .zshrc should show git branch
    grep -q 'git.*branch\|symbolic-ref' "$DOTFILES_DIR/.bashrc"
    grep -q 'git.*branch\|symbolic-ref\|__git_prompt' "$DOTFILES_DIR/.zshrc"
}

@test "shell-setup: both shells normalize home to ~" {
    grep -q 'HOME.*~\|~.*HOME\|p=.*~' "$DOTFILES_DIR/.bashrc"
    grep -q 'HOME.*~\|~.*HOME\|__prompt_path' "$DOTFILES_DIR/.zshrc"
}

# =============================================================================
# PATH setup behavior tests
# WHY: Git Bash needs MSYS2's zsh in PATH before .profile can exec it
# =============================================================================

@test "shell-setup: .bash_profile adds MSYS2 path on Windows" {
    # .bash_profile should add /c/msys64/usr/bin to PATH
    # This is needed BEFORE the exec zsh so zsh can be found
    grep -q '/c/msys64/usr/bin\|msys64' "$DOTFILES_DIR/.bash_profile"
}

@test "shell-setup: .profile adds MSYS2 path on Windows" {
    # .profile (POSIX version) should also add MSYS2 path
    grep -q '/c/msys64/usr/bin\|msys64' "$DOTFILES_DIR/.profile"
}

@test "shell-setup: MSYS2 path added before zsh exec" {
    # Critical: PATH must be set BEFORE exec zsh line
    # Otherwise zsh won't be found
    local msys_line=$(grep -n 'msys64' "$DOTFILES_DIR/.bash_profile" | head -1 | cut -d: -f1)
    local exec_line=$(grep -n 'exec zsh' "$DOTFILES_DIR/.bash_profile" | head -1 | cut -d: -f1)

    [[ -n "$msys_line" ]] && [[ -n "$exec_line" ]]
    [[ "$msys_line" -lt "$exec_line" ]]
}

@test "shell-setup: .bash_profile adds ~/.local/bin to PATH" {
    # User binaries (zoxide, oh-my-posh on Linux) need to be in PATH
    grep -q '\.local/bin' "$DOTFILES_DIR/.bash_profile"
}

# =============================================================================
# Zsh exec logic tests
# WHY: We only want to exec zsh in interactive terminals, not scripts
# =============================================================================

@test "shell-setup: zsh exec only happens in interactive terminal" {
    # The -t 1 test checks if stdout is a terminal
    # Without this, scripts that source .profile would break
    grep -q '\-t 1' "$DOTFILES_DIR/.bash_profile"
    grep -q '\-t 1' "$DOTFILES_DIR/.profile"
}

@test "shell-setup: zsh exec checks if zsh exists first" {
    # Don't try to exec zsh if it's not installed
    grep -q 'command -v zsh\|which zsh' "$DOTFILES_DIR/.bash_profile"
}

@test "shell-setup: SHELL variable set before exec zsh" {
    # Setting SHELL ensures child processes know the correct shell
    grep -q 'SHELL=.*zsh\|export SHELL' "$DOTFILES_DIR/.bash_profile"
}

@test "shell-setup: exec zsh uses login shell flag" {
    # zsh -l ensures .zprofile and .zshrc are sourced
    grep -q 'exec zsh -l\|exec.*zsh.*-l' "$DOTFILES_DIR/.bash_profile"
}

@test "shell-setup: ZDOTDIR set before exec zsh" {
    # ZDOTDIR tells zsh where to find config files
    # This is critical for MSYS2's zsh which may have a different home directory
    # Without this, zsh won't find .zshrc and shows the newuser wizard
    grep -q 'ZDOTDIR' "$DOTFILES_DIR/.bash_profile"
    grep -q 'ZDOTDIR' "$DOTFILES_DIR/.profile"
}

# =============================================================================
# Zsh plugins tests
# WHY: Plugins provide autosuggestions and syntax highlighting
# =============================================================================

@test "shell-setup: zsh-plugins clones from GitHub" {
    # Plugins are downloaded from GitHub on first run
    grep -q 'github.com' "$DOTFILES_DIR/zsh-plugins"
    grep -q 'git clone' "$DOTFILES_DIR/zsh-plugins"
}

@test "shell-setup: zsh-plugins uses shallow clone for speed" {
    # --depth 1 makes initial clone much faster
    grep -q '\-\-depth' "$DOTFILES_DIR/zsh-plugins"
}

@test "shell-setup: zsh-plugins installs fzf-history-search" {
    # Ctrl+R fuzzy history search
    grep -q 'fzf-history-search' "$DOTFILES_DIR/zsh-plugins"
}

@test "shell-setup: zsh-plugins installs alias-tips" {
    # Reminds you when you could have used an alias
    grep -q 'alias-tips' "$DOTFILES_DIR/zsh-plugins"
}

@test "shell-setup: .zshrc binds Ctrl+Space for autosuggestion accept" {
    # Ctrl+Space accepts the gray autosuggestion
    grep -q "Ctrl.*Space\|autosuggest-accept\|'^ '" "$DOTFILES_DIR/.zshrc"
}

# =============================================================================
# Install.ps1 MSYS2 integration tests
# WHY: Documents the Windows-specific zsh installation flow
# =============================================================================

@test "shell-setup: install.ps1 installs zsh via pacman" {
    # After MSYS2 is installed, we use pacman to install zsh
    grep -q 'pacman.*zsh\|msys2Packages.*zsh' "$DOTFILES_DIR/install.ps1"
}

@test "shell-setup: install.ps1 uses noconfirm for pacman" {
    # Non-interactive installation
    grep -q '\-\-noconfirm\|noconfirm' "$DOTFILES_DIR/install.ps1"
}

@test "shell-setup: install.ps1 checks for MSYS2 before pacman" {
    # Gracefully handle case where MSYS2 isn't installed yet
    grep -q 'Test-Path.*msys64\|msys2Pacman' "$DOTFILES_DIR/install.ps1"
}

# =============================================================================
# WSL-specific tests
# WHY: Documents Linux/WSL zsh installation via apt
# =============================================================================

@test "shell-setup: wsl-packages uses apt for zsh" {
    grep -q 'apt.*install\|apt-get.*install' "$DOTFILES_DIR/wsl-packages"
    grep -q 'zsh' "$DOTFILES_DIR/wsl-packages"
}

@test "shell-setup: wsl-packages installs fzf" {
    # fzf is needed for Ctrl+R fuzzy history
    grep -q 'fzf' "$DOTFILES_DIR/wsl-packages"
}

@test "shell-setup: wsl-packages configures wsl.conf" {
    # Metadata support for proper file permissions
    grep -q 'wsl.conf\|metadata' "$DOTFILES_DIR/wsl-packages"
}

# =============================================================================
# Fallback behavior tests
# WHY: .bashrc should work standalone if zsh unavailable
# =============================================================================

@test "shell-setup: .bashrc is self-contained fallback" {
    # .bashrc should NOT depend on zsh or zsh-plugins
    ! grep -q 'zsh-plugins\|source.*zsh' "$DOTFILES_DIR/.bashrc"
}

@test "shell-setup: .bashrc documents it is a fallback" {
    # Future maintainers should understand .bashrc is minimal by design
    grep -qi 'fallback\|minimal' "$DOTFILES_DIR/.bashrc"
}
