"""Executable contracts for the dotfiles-managed Onclave client setup."""

import json
import os
import shutil
import ssl
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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


def test_pi_doctor_uses_signed_https_without_leaking_configuration(tmp_path: Path) -> None:
    """Signed HTTPS diagnostics avoid exposing the configured endpoint or secrets."""
    bash = shutil.which("bash")
    ssh_keygen = shutil.which("ssh-keygen")
    openssl = shutil.which("openssl")
    assert bash, "bash is required to validate shell diagnostics"
    assert ssh_keygen, "ssh-keygen is required to create an OpenSSH test key"
    assert openssl, "openssl is required to create an HTTPS test certificate"

    home = tmp_path / "home"
    dotfiles = home / ".dotfiles"
    dotfiles.mkdir(parents=True)
    modules = dotfiles / "modules"
    modules.mkdir()
    (modules / "onclave").symlink_to(
        DOTFILES / "modules" / "onclave", target_is_directory=True
    )
    (dotfiles / "pi").symlink_to(DOTFILES / "pi", target_is_directory=True)
    pi_agent = home / ".pi" / "agent"
    pi_agent.parent.mkdir()
    pi_agent.symlink_to(DOTFILES / "pi", target_is_directory=True)

    ssh_dir = home / ".ssh"
    ssh_dir.mkdir()
    subprocess.run(
        [ssh_keygen, "-q", "-t", "ed25519", "-N", "", "-f", str(ssh_dir / "id_ed25519")],
        check=True,
        capture_output=True,
        text=True,
    )

    certificate = tmp_path / "certificate.pem"
    private_key = tmp_path / "private-key.pem"
    subprocess.run(
        [
            openssl,
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(private_key),
            "-out",
            str(certificate),
            "-subj",
            "/CN=127.0.0.1",
            "-addext",
            "subjectAltName=IP:127.0.0.1",
            "-days",
            "1",
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    signed_requests: list[bool] = []

    class RequestHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length))
            signed_requests.append(
                self.path == "/api/v1/agents/rpc"
                and body == {"op": "list_agents"}
                and self.headers.get("signature-input") is not None
                and self.headers.get("signature") is not None
            )
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')

        def log_message(self, _format: str, *args: object) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), RequestHandler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certificate, private_key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    api_base = f"https://127.0.0.1:{server.server_address[1]}"
    secret = "doctor-secret-sentinel"
    try:
        result = subprocess.run(
            [bash, "scripts/pi-doctor"],
            cwd=DOTFILES,
            env={
                **os.environ,
                "HOME": _shell_path(home, bash),
                "USERPROFILE": str(home),
                "NODE_EXTRA_CA_CERTS": str(certificate),
                "ONCLAVE_API_BASE": api_base,
                "UNRELATED_SECRET": secret,
            },
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()

    output = result.stdout + result.stderr
    assert result.returncode == 0, output
    assert signed_requests == [True]
    assert "signed HTTPS list_agents succeeded" in output
    assert api_base not in output
    assert "127.0.0.1" not in output
    assert secret not in output
