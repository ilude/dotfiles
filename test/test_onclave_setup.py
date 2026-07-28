"""Executable contracts for the dotfiles-managed Onclave client setup."""

import os
import shutil
import socket
import subprocess
import threading
from pathlib import Path

import pytest

DOTFILES = Path(__file__).parent.parent


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
        f'ZDOTDIR="{tmp_path.as_posix()}"; '
        f'source "{(DOTFILES / "home" / ".zshrc").as_posix()}"; '
        "sh -c 'printf %s \"$ONCLAVE_AUTO_EXPORT\"'"
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


def test_msys_zsh_uses_windows_pnpm_home() -> None:
    """MSYS zsh keeps pnpm on the Windows-global installation root."""
    if os.name != "nt":
        pytest.skip("MSYS path behavior is Windows-specific")
    zsh = os.environ.get("ZSH_EXECUTABLE") or shutil.which("zsh")
    if not zsh:
        pytest.skip("zsh is required to validate shell configuration")

    command = (
        f'source "{(DOTFILES / "zsh" / "env.d" / "00-winhome.zsh").as_posix()}"; '
        f'source "{(DOTFILES / "zsh" / "env.d" / "02-path.zsh").as_posix()}"; '
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
    zsh = os.environ.get("ZSH_EXECUTABLE") or shutil.which("zsh")
    if not zsh:
        pytest.skip("zsh is required to validate shell diagnostics")

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
    command = f'env HOME="{home.as_posix()}" ONCLAVE_AMQP_URL="{url}" bash scripts/pi-doctor'
    result = subprocess.run(
        [zsh, "-dfc", command],
        cwd=DOTFILES,
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
