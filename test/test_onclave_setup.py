"""Executable contracts for the dotfiles-managed Onclave client setup."""

import os
import shutil
import socket
import subprocess
import threading
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


def test_pi_doctor_redacts_onclave_credentials(tmp_path: Path) -> None:
    """Broker diagnostics expose connection shape and reachability, not credentials."""
    bash = shutil.which("bash")
    assert bash, "bash is required to validate shell diagnostics"

    home = tmp_path / "home"
    dotfiles = home / ".dotfiles"
    (dotfiles / "private").mkdir(parents=True)
    (dotfiles / "private" / "secrets.env").touch()

    ready = threading.Event()
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port = server.getsockname()[1]

    def accept_connection() -> None:
        ready.set()
        connection, _address = server.accept()
        connection.close()
        server.close()

    thread = threading.Thread(target=accept_connection, daemon=True)
    thread.start()
    ready.wait(timeout=2)

    secret = "doctor-secret-sentinel"
    url = f"amqp://doctor:{secret}@127.0.0.1:{port}/onclave"
    result = subprocess.run(
        [bash, "scripts/pi-doctor"],
        cwd=DOTFILES,
        env={**os.environ, "HOME": _shell_path(home, bash), "ONCLAVE_AMQP_URL": url},
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    thread.join(timeout=2)

    output = result.stdout + result.stderr
    assert secret not in output
    assert (
        f"scheme=amqp host=127.0.0.1 port={port} vhost=/onclave username=yes password=yes" in output
    )
    assert "broker TCP endpoint is reachable" in output
    assert "broker authentication or Onclave core RPC failed" in output
