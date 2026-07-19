# /// script
# requires-python = ">=3.9"
# dependencies = ["pyyaml"]
# ///
"""Semantic contracts for Dotbot link configuration."""

import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import yaml

DOTFILES = Path(__file__).parent.parent


def _parse_link_targets_from_yaml(yaml_path: Path) -> dict[str, Any]:
    """Return Dotbot link targets mapped to their configuration."""
    with yaml_path.open(encoding="utf-8") as yaml_file:
        data = yaml.safe_load(yaml_file)

    if not isinstance(data, list):
        raise ValueError(f"Expected a list of Dotbot directives in {yaml_path}")

    targets: dict[str, Any] = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        link_config = item.get("link")
        if not isinstance(link_config, dict):
            continue
        targets.update(link_config)

    return targets


def _unconditional_targets(targets: dict[str, Any]) -> set[str]:
    """Return link targets that are not guarded by a Dotbot condition."""
    return {
        target
        for target, config in targets.items()
        if not isinstance(config, dict) or "if" not in config
    }


def test_shell_modules_expose_runtime_state() -> None:
    """Zsh modules produce the expected environment, options, and bindings."""
    zsh = os.environ.get("ZSH_EXECUTABLE") or shutil.which("zsh")
    assert zsh, "zsh is required to validate shell configuration"

    modules = [
        "zsh/rc.d/00-helpers.zsh",
        "zsh/env.d/01-locale.zsh",
        "zsh/env.d/02-path.zsh",
        "zsh/rc.d/03-history.zsh",
        "zsh/rc.d/04-keybindings.zsh",
    ]
    source_commands = "; ".join(f"source {module}" for module in modules)
    command = (
        f"ZDOTDIR=/tmp/dotfiles-test; {source_commands}; "
        'printf "%s\\n" "$LC_ALL" "$LANG" "$HISTFILE" "$HISTSIZE" "$SAVEHIST"; '
        "setopt APPEND_HISTORY EXTENDED_HISTORY HIST_IGNORE_DUPS SHARE_HISTORY; "
        "whence -w source_if_exists restore_path is_windows; "
        'bindkey "^[[H"; bindkey "^b"'
    )

    result = subprocess.run(
        [zsh, "-dfc", command],
        cwd=DOTFILES,
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout.splitlines() == [
        "en_US.UTF-8",
        "en_US.UTF-8",
        "/tmp/dotfiles-test/.zsh_history",
        "100000",
        "100000",
        "source_if_exists: function",
        "restore_path: function",
        "is_windows: function",
        '"^[[H" beginning-of-line',
        '"^B" backward-word',
    ]


def test_git_reads_delta_configuration() -> None:
    """Git parses the tracked Delta settings with their intended meaning."""
    result = subprocess.run(
        ["git", "config", "--file", "config/git/config", "--null", "--list"],
        cwd=DOTFILES,
        check=True,
        capture_output=True,
        text=True,
    )
    entries = dict(item.split("\n", 1) for item in result.stdout.split("\0") if item)

    assert entries["pager.diff"] == "delta"
    assert entries["interactive.difffilter"] == "delta --color-only"
    assert entries["delta.line-numbers"] == "true"


def test_git_ignores_generated_shell_state() -> None:
    """Git ignores generated zsh bytecode and machine-local overrides."""
    result = subprocess.run(
        ["git", "check-ignore", "-z", "--stdin"],
        cwd=DOTFILES,
        input=b"example.zwc\0.zshrc.local\0",
        check=True,
        capture_output=True,
    )

    assert result.stdout.split(b"\0") == [b"example.zwc", b".zshrc.local", b""]


def test_install_conf_wsl_sync() -> None:
    """WSL mirrors every unconditional cross-platform Dotbot link."""
    main_targets = _parse_link_targets_from_yaml(DOTFILES / "install.conf.yaml")
    wsl_targets = _parse_link_targets_from_yaml(DOTFILES / "wsl" / "install.conf.yaml")

    main_unconditional = _unconditional_targets(main_targets)
    wsl_target_names = set(wsl_targets)

    assert main_unconditional <= wsl_target_names, (
        f"WSL config missing main links: {sorted(main_unconditional - wsl_target_names)}"
    )
    assert wsl_target_names - main_unconditional == {
        "~/.dotfiles",
        "~/.config/nvim/init.lua",
    }
