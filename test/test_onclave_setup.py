"""Executable contracts for the dotfiles-managed Onclave client setup."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

DOTFILES = Path(__file__).parent.parent


def _shell_path(path: Path, shell: str) -> str:
    if os.name != "nt":
        return path.as_posix()
    command_flag = "-dfc" if Path(shell).name.lower().startswith("zsh") else "-c"
    result = subprocess.run(
        [shell, command_flag, '/usr/bin/cygpath -u "$1"', "shell", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


@pytest.mark.zsh
def test_zsh_auto_exports_dotenv_secret_assignments(tmp_path: Path) -> None:
    """Dotenv-style assignments reach child processes without an export prefix."""
    zsh = os.environ.get("ZSH_EXECUTABLE") or shutil.which("zsh")
    if not zsh:
        pytest.skip("zsh is required to validate shell configuration")

    dotfiles = tmp_path / ".dotfiles"
    private = dotfiles / "private"
    private.mkdir(parents=True)
    (private / "secrets.env").write_text("ONCLAVE_AUTO_EXPORT=exported\n", encoding="utf-8")

    command = (
        "source_if_exists() { :; }; debug_report() { :; }; "
        f'ZDOTDIR="{_shell_path(tmp_path, zsh)}"; '
        f'source "{_shell_path(DOTFILES / "home" / ".zshrc", zsh)}"; '
        "/usr/bin/sh -c 'printf %s \"$ONCLAVE_AUTO_EXPORT\"'"
    )
    env = os.environ.copy()
    env.pop("ONCLAVE_AUTO_EXPORT", None)
    result = subprocess.run(
        [zsh, "-dfc", command],
        cwd=DOTFILES,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout == "exported"


@pytest.mark.zsh
def test_msys_zsh_uses_windows_pnpm_home() -> None:
    """MSYS zsh keeps pnpm on the Windows-global installation root."""
    if os.name != "nt":
        pytest.skip("MSYS path behavior is Windows-specific")
    zsh = os.environ.get("ZSH_EXECUTABLE") or shutil.which("zsh")
    if not zsh:
        pytest.skip("zsh is required to validate shell configuration")

    command = (
        f'source "{_shell_path(DOTFILES / "zsh" / "env.d" / "00-winhome.zsh", zsh)}"; '
        f'source "{_shell_path(DOTFILES / "zsh" / "env.d" / "02-path.zsh", zsh)}"; '
        'print -r -- "$PNPM_HOME"'
    )
    result = subprocess.run(
        [zsh, "-dfc", command],
        cwd=DOTFILES,
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout.strip().replace("\\", "/").endswith("/AppData/Local/pnpm")
