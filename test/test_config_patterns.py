# /// script
# requires-python = ">=3.9"
# dependencies = ["pytest", "pyyaml"]
# ///
"""
Configuration Pattern Tests (Config Drift Detection)

Validates that shell configuration files contain expected patterns.
Converted from bats grep tests for faster execution.

These tests intentionally check implementation details (exact strings, file
structure) rather than behavior. This catches accidental config changes like
typos, deletions, or format drift. While coupling tests to implementation is
normally discouraged, the tradeoff is acceptable for a personal dotfiles repo
where catching config drift outweighs test fragility concerns.

For bash/zsh execution tests, see test_prompt.py and test_git_ssh_setup.py.
"""

import os
import re
from pathlib import Path

import pytest
import yaml

DOTFILES = Path(__file__).parent.parent


def get_dotfile_path(name: str) -> Path:
    """Resolve canonical dotfile path, preferring home/ in repo."""
    home_path = DOTFILES / "home" / name
    if home_path.exists():
        return home_path

    root_path = DOTFILES / name
    if root_path.exists():
        return root_path

    raise FileNotFoundError(f"Dotfile not found: {name}")


def read_dotfile(name: str) -> str:
    """Read canonical dotfile content."""
    return get_dotfile_path(name).read_text()


# =============================================================================
# From aliases.bats (20 tests)
# =============================================================================

ALIASES_PATTERNS = [
    # Claude Code aliases
    (
        "alias ccyl='clear && claude --dangerously-skip-permissions'",
        "ccyl alias clears screen and uses dangerously-skip-permissions",
    ),
    (
        "alias claude-install='npm install -g @anthropic-ai/claude-code'",
        "claude-install alias",
    ),
    # NixOS aliases
    ("alias nix-gc=", "nix-gc alias defined"),
    ("alias nix-rs=", "nix-rs alias defined"),
    # Shell/Environment aliases
    (r"alias sz='source \$\{ZDOTDIR:-\$HOME\}/\.zshrc'", "sz sources .zshrc"),
    ("alias ez=", "ez opens .zshrc in editor"),
    ("alias es='env | sort'", "es shows sorted env"),
    ('alias history="history 1"', "history alias shows full history"),
    # Directory listing (eza fallback)
    (r"\$\{\+commands\[eza\]\}", "eza check uses commands hash"),
    (r"alias l='eza.*-la", "l alias defined for eza with long format"),
    ("alias tree='eza --tree", "tree alias uses eza"),
    (r"\$\{\+commands\[exa\]\}", "exa fallback for ls defined"),
    (r"alias l='ls.*--color=auto", "fallback l alias uses ls with color"),
    (r"\$\{\+commands\[bat\]\}", "bat fallback chain defined"),
    (r"\$\{\+commands\[batcat\]\}", "batcat fallback chain defined"),
    (r"\$\{\+commands\[fd\]\}", "fd fallback chain defined"),
    (r"\$\{\+commands\[fdfind\]\}", "fdfind fallback chain defined"),
    (r"\$\{\+commands\[rg\]\}", "rg fallback for grep defined"),
    # Docker aliases
    ("alias dps=", "dps alias defined"),
    ("docker ps --format", "dps uses table format"),
]


@pytest.mark.parametrize(
    "pattern,desc", ALIASES_PATTERNS, ids=[p[1] for p in ALIASES_PATTERNS]
)
def test_aliases(pattern, desc):
    """Verify zsh/rc.d/06-aliases.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/rc.d/06-aliases.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


# =============================================================================
# From helpers.bats (18 tests)
# =============================================================================

HELPERS_PATTERNS = [
    # source_if_exists function
    (r"source_if_exists\(\)", "source_if_exists function defined"),
    (r"\[\[.*-f.*\]\]", "source_if_exists checks file existence"),
    # Platform detection functions
    (r"is_wsl\(\)", "is_wsl function defined"),
    ("WSL_DISTRO_NAME", "is_wsl checks WSL_DISTRO_NAME"),
    ("/proc/sys/fs/binfmt_misc/WSLInterop", "is_wsl checks WSLInterop file"),
    ("/proc/version", "is_wsl checks /proc/version fallback"),
    (r"is_msys\(\)", "is_msys function defined"),
    (r"OSTYPE.*msys", "is_msys checks OSTYPE for msys"),
    (r"OSTYPE.*cygwin", "is_msys checks OSTYPE for cygwin"),
    (r"is_linux\(\)", "is_linux function defined"),
    (r"linux-gnu.*!.*is_wsl|! is_wsl", "is_linux excludes WSL"),
    (r"is_macos\(\)", "is_macos function defined"),
    ("darwin", "is_macos checks for darwin"),
    (r"is_windows\(\)", "is_windows function defined"),
    # PATH preservation
    ("DOTFILES_ORIGINAL_PATH", "DOTFILES_ORIGINAL_PATH saved"),
    (r"restore_path\(\)", "restore_path function defined"),
    # Debug infrastructure
    (r"\$DEBUG", "debug mode checks DEBUG variable"),
    (r"debug_report\(\)", "debug_report function defined"),
]


@pytest.mark.parametrize(
    "pattern,desc", HELPERS_PATTERNS, ids=[p[1] for p in HELPERS_PATTERNS]
)
def test_helpers(pattern, desc):
    """Verify zsh/rc.d/00-helpers.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/rc.d/00-helpers.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


def test_helpers_winhome_wsl_check():
    """00-winhome.zsh also checks WSL_DISTRO_NAME."""
    content = (DOTFILES / "zsh/env.d/00-winhome.zsh").read_text()
    assert "WSL_DISTRO_NAME" in content


def test_helpers_debug_report_called():
    """.zshrc calls debug_report at end."""
    content = read_dotfile(".zshrc")
    assert "debug_report" in content


def test_helpers_module_ordering():
    """Module has 00 prefix for early loading."""
    assert (DOTFILES / "zsh/rc.d/00-helpers.zsh").exists()


# =============================================================================
# From env-modules.bats (18 tests)
# =============================================================================

WINHOME_PATTERNS = [
    ("/proc/sys/fs/binfmt_misc/WSLInterop", "detects WSL via WSLInterop file"),
    ("/proc/version", "detects WSL via /proc/version fallback"),
    ("IS_WSL=1", "exports IS_WSL on WSL"),
    ("IS_MSYS=1", "exports IS_MSYS on MSYS2"),
    ('WINHOME="/mnt/c/Users/', "sets WINHOME on WSL to /mnt/c/Users"),
    (r"OSTYPE.*msys", "detects MSYS2 via OSTYPE"),
    (r"OSTYPE.*cygwin", "detects Cygwin via OSTYPE"),
    (r"\$\{ZDOTDIR:-", "uses ZDOTDIR for Windows home fallback"),
    (r"\$\{USER:-\$\(whoami\)\}", "handles missing USER with whoami fallback"),
]


@pytest.mark.parametrize(
    "pattern,desc", WINHOME_PATTERNS, ids=[p[1] for p in WINHOME_PATTERNS]
)
def test_winhome(pattern, desc):
    """Verify zsh/env.d/00-winhome.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/env.d/00-winhome.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


LOCALE_PATTERNS = [
    ("LC_ALL=en_US.UTF-8", "LC_ALL is en_US.UTF-8"),
    ("LANG=en_US.UTF-8", "LANG is en_US.UTF-8"),
]


@pytest.mark.parametrize(
    "pattern,desc", LOCALE_PATTERNS, ids=[p[1] for p in LOCALE_PATTERNS]
)
def test_locale(pattern, desc):
    """Verify zsh/env.d/01-locale.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/env.d/01-locale.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


PATH_PATTERNS = [
    (r"\.local/bin", "adds .local/bin to PATH"),
    (r"\$\{WINHOME:-\$HOME\}/\.local/bin", "uses WINHOME for .local/bin on Windows"),
    ("/c/Program Files/Git/mingw64/bin", "restores Git for Windows mingw64 bin"),
    (r"\.path-windows-local", "sources .path-windows-local on Windows"),
    (
        r"\$\{ZDOTDIR:-\$HOME\}/\.path-windows-local",
        "uses ZDOTDIR for .path-windows-local",
    ),
]


@pytest.mark.parametrize(
    "pattern,desc", PATH_PATTERNS, ids=[p[1] for p in PATH_PATTERNS]
)
def test_path(pattern, desc):
    """Verify zsh/env.d/02-path.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/env.d/02-path.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


def test_path_windows_conditional():
    """Windows path sourcing is conditional on OSTYPE."""
    content = (DOTFILES / "zsh/env.d/02-path.zsh").read_text()
    # Find context around path-windows-local
    assert "msys" in content or "cygwin" in content


# =============================================================================
# From cli-completions.bats (14 tests)
# =============================================================================

CLI_COMPLETIONS_PATTERNS = [
    # Command existence checks
    (r"\$\{\+commands\[kubectl\]\}", "kubectl completion conditional on command"),
    (r"\$\{\+commands\[helm\]\}", "helm completion conditional on command"),
    (r"\$\{\+commands\[gh\]\}", "gh completion conditional on command"),
    (r"\$\{\+commands\[tailscale\]\}", "tailscale completion conditional on command"),
    (r"\$\{\+commands\[fzf\]\}", "fzf completion conditional on command"),
    # Completion generation (escape parens for regex)
    (r"source <\(kubectl completion zsh\)", "kubectl uses process substitution"),
    (r"source <\(helm completion zsh\)", "helm uses process substitution"),
    ("gh completion -s zsh", "gh uses -s zsh flag"),
    ("tailscale completion zsh 2>/dev/null", "tailscale silences errors"),
    # fzf paths
    ("/usr/share/fzf", "checks /usr/share/fzf for completion"),
    (r"\$\{ZDOTDIR:-\$HOME\}/\.fzf\.zsh", "checks ~/.fzf.zsh"),
    ("/usr/local/opt/fzf", "checks homebrew fzf path"),
    (r"true.*# Ensure exit 0", "fzf loop ensures exit 0"),
    # Docker handling
    (
        r"skip docker info check|too slow",
        "docker completion skips slow docker info check",
    ),
]


@pytest.mark.parametrize(
    "pattern,desc",
    CLI_COMPLETIONS_PATTERNS,
    ids=[p[1] for p in CLI_COMPLETIONS_PATTERNS],
)
def test_cli_completions(pattern, desc):
    """Verify zsh/rc.d/07-cli-completions.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/rc.d/07-cli-completions.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


# =============================================================================
# From editor.bats (11 tests)
# =============================================================================

EDITOR_PATTERNS = [
    # dircolors configuration
    (r"\$\{\+commands\[dircolors\]\}", "dircolors check uses commands hash"),
    (r"\$\{ZDOTDIR:-\$HOME\}/\.dircolors", "supports custom ~/.dircolors file"),
    ("/etc/DIR_COLORS", "falls back to /etc/DIR_COLORS"),
    # EDITOR configuration
    (r"TERM_PROGRAM.*vscode", "EDITOR set to code when in VS Code terminal"),
    ('EDITOR="code"', "EDITOR set to code"),
    ('EDITOR="nano"', "EDITOR falls back to nano"),
    # Terminal environment
    (r"TERM.*xterm-256color", "sets TERM on Windows if unset"),
    (r"COLORTERM.*truecolor", "sets COLORTERM on Windows if unset"),
    ("VSCODE_INJECTION", "detects VS Code via VSCODE_INJECTION"),
    ("TERM_PROGRAM_VERSION", "detects VS Code via TERM_PROGRAM_VERSION"),
    (r"OSTYPE.*msys|OSTYPE.*cygwin", "Windows detection uses OSTYPE"),
]


@pytest.mark.parametrize(
    "pattern,desc", EDITOR_PATTERNS, ids=[p[1] for p in EDITOR_PATTERNS]
)
def test_editor(pattern, desc):
    """Verify zsh/rc.d/08-editor.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/rc.d/08-editor.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


# =============================================================================
# From rc-modules.bats (27 tests)
# =============================================================================

# 01-completions.zsh
COMPLETIONS_PATTERNS = [
    (r"ZDOTDIR:-\$HOME.*zcompdump", "zcompdump uses ZDOTDIR for MSYS2 compatibility"),
    (r"compinit.*-d", "compinit uses -d flag for custom zcompdump location"),
    ("zcompile", "auto-compiles zsh files with zcompile"),
]


@pytest.mark.parametrize(
    "pattern,desc", COMPLETIONS_PATTERNS, ids=[p[1] for p in COMPLETIONS_PATTERNS]
)
def test_completions(pattern, desc):
    """Verify zsh/rc.d/01-completions.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/rc.d/01-completions.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


def test_completions_zwc_gitignored():
    """zwc files are gitignored."""
    content = (DOTFILES / ".gitignore").read_text()
    assert ".zwc" in content


# 02-plugins.zsh
PLUGINS_PATTERNS = [
    ("ZSH_AUTOSUGGEST_USE_ASYNC=0", "ZSH_AUTOSUGGEST_USE_ASYNC disabled on Windows"),
    ("ZSH_AUTOSUGGEST_MANUAL_REBIND=1", "ZSH_AUTOSUGGEST_MANUAL_REBIND set on Windows"),
    ("ZSH_DISABLE_SYNTAX_HIGHLIGHTING=1", "ZSH_DISABLE_SYNTAX_HIGHLIGHTING on Windows"),
    (
        "ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=50",
        "ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE limits line length",
    ),
    (
        r"\$\{ZDOTDIR:-\$HOME\}/\.dotfiles/zsh-plugins",
        "sources zsh-plugins using ZDOTDIR",
    ),
    (r"bindkey '\^ ' autosuggest-accept", "ctrl+space bound to autosuggest-accept"),
]


@pytest.mark.parametrize(
    "pattern,desc", PLUGINS_PATTERNS, ids=[p[1] for p in PLUGINS_PATTERNS]
)
def test_plugins(pattern, desc):
    """Verify zsh/rc.d/02-plugins.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/rc.d/02-plugins.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


# 03-history.zsh
HISTORY_PATTERNS = [
    ("HISTSIZE=100000", "HISTSIZE is 100000"),
    ("SAVEHIST=100000", "SAVEHIST is 100000"),
    (
        r'HISTFILE="\$\{ZDOTDIR:-\$HOME\}',
        "HISTFILE uses ZDOTDIR for MSYS2 compatibility",
    ),
    ("setopt APPEND_HISTORY", "APPEND_HISTORY option enabled"),
    ("setopt EXTENDED_HISTORY", "EXTENDED_HISTORY option enabled"),
    ("setopt HIST_IGNORE_DUPS", "HIST_IGNORE_DUPS option enabled"),
    ("setopt SHARE_HISTORY", "SHARE_HISTORY option enabled"),
]


@pytest.mark.parametrize(
    "pattern,desc", HISTORY_PATTERNS, ids=[p[1] for p in HISTORY_PATTERNS]
)
def test_history(pattern, desc):
    """Verify zsh/rc.d/03-history.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/rc.d/03-history.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


# 04-keybindings.zsh
KEYBINDINGS_PATTERNS = [
    (r"bindkey.*beginning-of-line", "Home key bound to beginning-of-line"),
    (r"bindkey.*end-of-line", "End key bound to end-of-line"),
    (r"bindkey '\^b' backward-word", "ctrl+b bound to backward-word"),
    (r"bindkey '\^f' forward-word", "ctrl+f bound to forward-word"),
    (r"bindkey.*backward-kill-word", "ctrl+backspace bound to backward-kill-word"),
    (r"bindkey.*kill-word", "ctrl+delete bound to kill-word"),
]


@pytest.mark.parametrize(
    "pattern,desc", KEYBINDINGS_PATTERNS, ids=[p[1] for p in KEYBINDINGS_PATTERNS]
)
def test_keybindings(pattern, desc):
    """Verify zsh/rc.d/04-keybindings.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/rc.d/04-keybindings.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


# 09-version-managers.zsh
VERSION_MANAGERS_PATTERNS = [
    (r"pyenv\(\)", "pyenv lazy loading defined"),
    (r"rbenv\(\)", "rbenv lazy loading defined"),
    (r"nodenv\(\)", "nodenv lazy loading defined"),
    (r"nvm\(\)", "nvm lazy loading defined"),
    ("node npm npx", "nvm lazy-loads node/npm/npx"),
    ("unfunction", "uses unfunction for proper lazy loading"),
]


@pytest.mark.parametrize(
    "pattern,desc",
    VERSION_MANAGERS_PATTERNS,
    ids=[p[1] for p in VERSION_MANAGERS_PATTERNS],
)
def test_version_managers(pattern, desc):
    """Verify zsh/rc.d/09-version-managers.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/rc.d/09-version-managers.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


# 10-ssh-agent.zsh
SSH_AGENT_PATTERNS = [
    ("VSCODE_INJECTION", "skips when VSCODE_INJECTION set"),
    ("SSH_AUTH_SOCK", "skips when SSH_AUTH_SOCK already set"),
    ("is_windows", "skips on Windows"),
    (r"ssh-add.*&", "runs ssh-add in background"),
]


@pytest.mark.parametrize(
    "pattern,desc", SSH_AGENT_PATTERNS, ids=[p[1] for p in SSH_AGENT_PATTERNS]
)
def test_ssh_agent(pattern, desc):
    """Verify zsh/rc.d/10-ssh-agent.zsh contains expected patterns."""
    content = (DOTFILES / "zsh/rc.d/10-ssh-agent.zsh").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


# =============================================================================
# From shell-setup.bats grep tests (~70 tests)
# =============================================================================


# .profile behavior
def test_profile_sources_bashrc():
    """.profile sources .bashrc for bash."""
    content = read_dotfile(".profile")
    assert re.search(r"source.*bashrc|\. ~/\.bashrc|\. \$HOME/\.bashrc", content)


def test_profile_execs_zsh():
    """.profile execs zsh when available."""
    content = read_dotfile(".profile")
    assert re.search(r"exec.*zsh", content)


def test_profile_checks_interactive():
    """.profile checks for interactive terminal before exec."""
    content = read_dotfile(".profile")
    assert re.search(r"-t 1|tty|interactive", content)


# zsh-plugins script
def test_zsh_plugins_exists():
    """zsh-plugins script exists and is executable (Unix only)."""
    script = DOTFILES / "scripts" / "zsh-plugins"
    assert script.exists()
    # Skip executable check on Windows (no Unix permissions)
    if os.name != "nt":
        assert script.stat().st_mode & 0o111, "script should be executable"


ZSH_PLUGINS_PATTERNS = [
    ("zsh-autosuggestions", "installs autosuggestions"),
    ("zsh-syntax-highlighting", "installs syntax-highlighting"),
    ("zsh-completions", "installs completions"),
    (r"mkdir.*plugins|plugins.*mkdir", "creates plugins directory"),
    ("github.com", "clones from GitHub"),
    ("git clone", "uses git clone"),
    (r"--depth", "uses shallow clone for speed"),
    ("fzf-history-search", "installs fzf-history-search"),
    ("alias-tips", "installs alias-tips"),
]


@pytest.mark.parametrize(
    "pattern,desc", ZSH_PLUGINS_PATTERNS, ids=[p[1] for p in ZSH_PLUGINS_PATTERNS]
)
def test_zsh_plugins(pattern, desc):
    """Verify zsh-plugins script contains expected patterns."""
    content = (DOTFILES / "scripts" / "zsh-plugins").read_text()
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


# .zshrc configuration
def test_zshrc_sources_rc_modules():
    """.zshrc sources rc.d modules."""
    content = read_dotfile(".zshrc")
    assert re.search(r"rc\.d.*\.zsh", content)


def test_zshrc_uv_env_conditional():
    """.zshrc sources uv env conditionally."""
    content = read_dotfile(".zshrc")
    assert re.search(r"\[\[.*\.local/bin/env.*\]\].*&&", content)


def test_zshrc_local_override():
    """.zshrc supports .zshrc.local override."""
    content = read_dotfile(".zshrc")
    assert ".zshrc.local" in content


def test_zshrc_local_gitignored():
    """.zshrc.local is gitignored."""
    content = (DOTFILES / ".gitignore").read_text()
    assert ".zshrc.local" in content


# .bashrc as fallback
def test_bashrc_exists():
    """.bashrc exists as fallback."""
    assert get_dotfile_path(".bashrc").exists()


def test_bashrc_early_exit():
    """.bashrc has early exit for non-interactive."""
    content = read_dotfile(".bashrc")
    # Check first 20 lines
    first_lines = "\n".join(content.split("\n")[:20])
    assert re.search(r"case \$-|return|\[ -z \"\$PS1\" \]", first_lines)


def test_bashrc_prompt_function():
    """.bashrc has prompt function."""
    content = read_dotfile(".bashrc")
    assert re.search(r"__set_prompt|PS1=", content)


def test_bashrc_self_contained():
    """.bashrc is self-contained fallback (no zsh dependencies)."""
    content = read_dotfile(".bashrc")
    # Should NOT depend on zsh-plugins
    assert (
        "zsh-plugins" not in content
        or "source" not in content.split("zsh-plugins")[0][-50:]
    )


def test_bashrc_documents_fallback():
    """.bashrc documents it is a fallback."""
    content = read_dotfile(".bashrc").lower()
    assert "fallback" in content or "minimal" in content


# .bashrc consistency with zsh
BASHRC_PATTERNS = [
    (r"is_wsl\(\)", "has is_wsl helper"),
    ("WSL_DISTRO_NAME", "is_wsl checks WSL_DISTRO_NAME"),
    (r"is_msys\(\)", "has is_msys helper"),
    ("LC_ALL", "sets LC_ALL locale"),
    ("LANG", "sets LANG locale"),
    ("EDITOR", "sets EDITOR default"),
    ("VISUAL", "sets VISUAL default"),
    ("command -v eza", "has eza fallback chain"),
    ("command -v bat", "has bat alias"),
    ("command -v rg", "has ripgrep alias"),
]


@pytest.mark.parametrize(
    "pattern,desc", BASHRC_PATTERNS, ids=[p[1] for p in BASHRC_PATTERNS]
)
def test_bashrc(pattern, desc):
    """Verify .bashrc contains expected patterns."""
    content = read_dotfile(".bashrc")
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


def test_bashrc_uv_env_conditional():
    """.bashrc sources uv env conditionally."""
    content = read_dotfile(".bashrc")
    assert re.search(r"\[\[.*\.local/bin/env.*\]\].*&&", content)


# Platform-specific zsh installation
def test_wsl_packages_zsh():
    """wsl/packages installs zsh on Linux/WSL."""
    assert (DOTFILES / "wsl" / "packages").exists()
    content = (DOTFILES / "wsl" / "packages").read_text()
    assert "zsh" in content


def test_wsl_packages_default_shell():
    """wsl/packages sets zsh as default shell."""
    content = (DOTFILES / "wsl" / "packages").read_text()
    assert re.search(r"chsh.*zsh|default.*zsh", content)


def test_wsl_packages_apt():
    """wsl/packages uses apt for zsh."""
    content = (DOTFILES / "wsl" / "packages").read_text()
    assert re.search(r"apt.*install|apt-get.*install", content)


def test_wsl_packages_fzf():
    """wsl/packages installs fzf."""
    content = (DOTFILES / "wsl" / "packages").read_text()
    assert "fzf" in content


def test_wsl_packages_wsl_conf():
    """wsl/packages configures wsl.conf."""
    content = (DOTFILES / "wsl" / "packages").read_text()
    assert re.search(r"wsl\.conf|metadata", content)


def test_wsl_packages_zsh_plugins():
    """wsl/packages installs zsh plugins."""
    content = (DOTFILES / "wsl" / "packages").read_text()
    assert re.search(r"zsh-plugins|Zsh Plugins|zsh plugins", content)


# .bash_profile PATH setup
BASH_PROFILE_PATTERNS = [
    (r"/c/msys64/usr/bin|msys64", "adds MSYS2 path on Windows"),
    (r"\.local/bin", "adds ~/.local/bin to PATH"),
    (r"-t 1", "zsh exec only happens in interactive terminal"),
    (r"command -v zsh|which zsh", "zsh exec checks if zsh exists first"),
    (r"SHELL=.*zsh|export SHELL", "SHELL variable set before exec zsh"),
    (r'\$_zsh" -l', "exec zsh uses login shell on Linux"),
    (r"\$_zsh.*-i", "exec zsh uses interactive shell on Windows"),
    ("ZDOTDIR", "ZDOTDIR set before exec zsh"),
    (r"cygpath.*USERPROFILE", "ZDOTDIR uses cygpath for MSYS2 compatibility"),
    ("exec env ZDOTDIR=", "exec zsh uses env to pass ZDOTDIR"),
]


@pytest.mark.parametrize(
    "pattern,desc", BASH_PROFILE_PATTERNS, ids=[p[1] for p in BASH_PROFILE_PATTERNS]
)
def test_bash_profile(pattern, desc):
    """Verify .bash_profile contains expected patterns."""
    content = read_dotfile(".bash_profile")
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


def test_msys2_path_before_zsh_exec():
    """MSYS2 path added before zsh exec."""
    content = read_dotfile(".bash_profile")
    lines = content.split("\n")
    msys_line = None
    exec_line = None
    for i, line in enumerate(lines):
        if "msys64" in line and msys_line is None:
            msys_line = i
        if re.search(r"exec.*zsh", line) and exec_line is None:
            exec_line = i
    assert msys_line is not None and exec_line is not None
    assert msys_line < exec_line


# .profile ZDOTDIR
PROFILE_PATTERNS = [
    (r"/c/msys64/usr/bin|msys64", "adds MSYS2 path on Windows"),
    (r"-t 1", "zsh exec only in interactive terminal"),
    ("ZDOTDIR", "ZDOTDIR set before exec zsh"),
    (r"cygpath.*USERPROFILE", "ZDOTDIR uses cygpath"),
    ("exec env ZDOTDIR=", "exec zsh uses env to pass ZDOTDIR"),
]


@pytest.mark.parametrize(
    "pattern,desc", PROFILE_PATTERNS, ids=[p[1] for p in PROFILE_PATTERNS]
)
def test_profile(pattern, desc):
    """Verify .profile contains expected patterns."""
    content = read_dotfile(".profile")
    assert re.search(pattern, content), f"Pattern not found: {pattern}"


def test_profile_uv_env_conditional():
    """.profile sources uv env conditionally."""
    content = read_dotfile(".profile")
    assert re.search(r"\[.*\.local/bin/env.*\].*&&", content)


# Unified experience verification
def test_prompt_shows_git_branch_bashrc():
    """.bashrc prompt shows git branch."""
    content = read_dotfile(".bashrc")
    assert re.search(r"git.*branch|symbolic-ref", content)


def test_prompt_shows_git_branch_zsh():
    """zsh prompt shows git branch."""
    content = (DOTFILES / "zsh/rc.d/05-prompt.zsh").read_text()
    assert re.search(r"git.*branch|symbolic-ref", content)


def test_bashrc_normalizes_home():
    """.bashrc normalizes HOME to ~."""
    content = read_dotfile(".bashrc")
    assert re.search(r"HOME.*~|~.*HOME|p=.*~", content)


def test_zsh_prompt_uses_home():
    """zsh prompt module handles home normalization."""
    content = (DOTFILES / "zsh/rc.d/05-prompt.zsh").read_text()
    assert re.search(r"HOME|ZDOTDIR|home", content)


# Install script tests
def test_install_msys2():
    """install.ps1 installs MSYS2 for Git Bash zsh support."""
    content = (DOTFILES / "install.ps1").read_text()
    assert "MSYS2" in content


def test_install_pacman_zsh():
    """install.ps1 installs zsh via pacman."""
    content = (DOTFILES / "install.ps1").read_text()
    assert re.search(r"pacman.*zsh|msys2Packages.*zsh", content)


def test_install_pacman_noconfirm():
    """install.ps1 uses noconfirm for pacman."""
    content = (DOTFILES / "install.ps1").read_text()
    assert re.search(r"--noconfirm|noconfirm", content)


def test_install_msys2_check():
    """install.ps1 checks for MSYS2 before pacman."""
    content = (DOTFILES / "install.ps1").read_text()
    assert re.search(r"Test-Path.*msys64|msys2Pacman", content)


def test_install_zsh_plugins():
    """install.ps1 installs zsh plugins for Git Bash."""
    content = (DOTFILES / "install.ps1").read_text()
    assert "zsh-plugins" in content
    assert "Zsh Plugins" in content


def test_install_idempotent():
    """install script uses cmp for idempotent bootstrap."""
    content = (DOTFILES / "install").read_text()
    assert "cmp -s" in content


def test_install_headless_detection():
    """install script detects headless servers."""
    content = (DOTFILES / "install").read_text()
    assert re.search(r"DISPLAY|HEADLESS", content)


def test_install_headless_skip_gui():
    """install script skips GUI tools on headless."""
    content = (DOTFILES / "install").read_text()
    assert re.search(r"HEADLESS.*claude-link|if.*HEADLESS", content)


def test_install_nsswitch():
    """install.ps1 has nsswitch.conf fix."""
    content = (DOTFILES / "install.ps1").read_text()
    assert "nsswitch.conf" in content


def test_install_nsswitch_backup():
    """install.ps1 creates nsswitch.conf backup."""
    content = (DOTFILES / "install.ps1").read_text()
    assert re.search(r"nsswitchPath.*\.bak", content)


def test_install_wsl_yaml():
    """wsl/install.conf.yaml symlinks ~/.dotfiles to Windows mount."""
    content = (DOTFILES / "wsl" / "install.conf.yaml").read_text()
    assert "~/.dotfiles" in content


def test_install_wsl_from_mount():
    """install.ps1 runs wsl/install from Windows mount."""
    content = (DOTFILES / "install.ps1").read_text()
    assert re.search(r"cd.*wslBasedir.*wsl/install", content)


# Git delta configuration (from git_ssh_setup.bats)
def test_gitconfig_pager_delta():
    """git config pager section uses delta."""
    content = (DOTFILES / "config" / "git" / "config").read_text()
    assert "[pager]" in content
    assert "diff = delta" in content


def test_gitconfig_delta_section():
    """git config delta section configured."""
    content = (DOTFILES / "config" / "git" / "config").read_text()
    assert "[delta]" in content


def test_gitconfig_delta_line_numbers():
    """git config delta has line-numbers enabled."""
    content = (DOTFILES / "config" / "git" / "config").read_text()
    assert "line-numbers = true" in content


def test_gitconfig_delta_diff_filter():
    """git config interactive diffFilter uses delta."""
    content = (DOTFILES / "config" / "git" / "config").read_text()
    assert "diffFilter = delta" in content


# =============================================================================
# From install.conf.yaml sync tests
# =============================================================================


def _parse_link_targets_from_yaml(yaml_path: Path) -> dict:
    """Parse dotbot link configuration and return all targets.

    Returns dict mapping target paths to their config (string if simple, dict if conditional).
    Only includes 'link' sections, skipping 'defaults', 'clean', etc.
    """
    with open(yaml_path) as f:
        data = yaml.safe_load(f)

    targets = {}
    for item in data:
        if isinstance(item, dict) and "link" in item:
            link_config = item["link"]
            for target, source_config in link_config.items():
                targets[target] = source_config

    return targets


def _get_unconditional_targets(targets: dict) -> set:
    """Extract only unconditional link targets (those without 'if' condition).

    Conditional targets have dict values with an 'if' key.
    Unconditional targets are simple strings or dict without 'if'.
    """
    unconditional = set()
    for target, config in targets.items():
        # String config = unconditional
        if isinstance(config, str):
            unconditional.add(target)
        # Dict without 'if' key = unconditional
        elif isinstance(config, dict) and "if" not in config:
            unconditional.add(target)
        # Dict with 'if' = conditional, skip

    return unconditional


def test_install_conf_wsl_sync():
    """All unconditional main config links appear in WSL config.

    This verifies that install.conf.yaml and wsl/install.conf.yaml
    stay in sync. Per CLAUDE.md: "wsl/install.conf.yaml must mirror
    the links in install.conf.yaml (skip Windows-only links)."
    """
    main_conf = DOTFILES / "install.conf.yaml"
    wsl_conf = DOTFILES / "wsl" / "install.conf.yaml"

    main_targets = _parse_link_targets_from_yaml(main_conf)
    wsl_targets = _parse_link_targets_from_yaml(wsl_conf)

    # Get unconditional targets (no 'if' condition)
    main_unconditional = _get_unconditional_targets(main_targets)
    wsl_all = set(wsl_targets.keys())

    # WSL has its own ~/.dotfiles self-symlink, remove from comparison
    wsl_only = wsl_all - main_unconditional
    expected_wsl_only = {"~/.dotfiles"}

    # Check all main unconditional targets are in WSL
    missing_in_wsl = main_unconditional - wsl_all
    assert not missing_in_wsl, (
        f"WSL config missing these main targets: {sorted(missing_in_wsl)}"
    )

    # Check no unexpected extra targets in WSL (besides ~/.dotfiles)
    assert wsl_only == expected_wsl_only, (
        f"WSL config has unexpected extra targets: {sorted(wsl_only - expected_wsl_only)}"
    )


def test_install_conf_wsl_sync_missing_detection():
    """Sync test catches missing links in WSL config.

    This is a negative-path test that proves the check would catch
    a missing link. We temporarily simulate a missing link by
    excluding a target, verify the test would fail, then restore it.
    """
    main_conf = DOTFILES / "install.conf.yaml"
    wsl_conf = DOTFILES / "wsl" / "install.conf.yaml"

    main_targets = _parse_link_targets_from_yaml(main_conf)
    wsl_targets = _parse_link_targets_from_yaml(wsl_conf)

    main_unconditional = _get_unconditional_targets(main_targets)
    wsl_all = set(wsl_targets.keys())

    # Pick a real target from main config
    test_target = next(iter(main_unconditional))

    # Verify the target IS currently in WSL (baseline)
    assert test_target in wsl_all, (
        f"Test setup failed: {test_target} not in WSL config"
    )

    # Simulate missing by removing it temporarily
    wsl_all_minus_one = wsl_all - {test_target}

    # Verify the check would catch this as missing
    missing = main_unconditional - wsl_all_minus_one
    assert test_target in missing, (
        f"Check failed to detect missing {test_target}"
    )
