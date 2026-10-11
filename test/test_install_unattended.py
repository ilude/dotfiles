import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

DOTFILES = Path(__file__).parent.parent
BASH = shutil.which("bash")


@pytest.mark.skipif(BASH is None, reason="bash not found")
def test_internal_launcher_launches_exact_selected_profile_without_network(tmp_path: Path) -> None:
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    launcher = DOTFILES / "scripts" / "pi-profile-launch"
    fake_pi = bin_dir / "pi"
    fake_pi.write_text(
        "#!/usr/bin/env bash\n"
        'printf \'{"profile":"%s","args":[\' "$PI_CODING_AGENT_DIR"\n'
        "first=1; for arg in \"$@\"; do ((first)) || printf ','; "
        'printf \'"%s"\' "$arg"; first=0; done\n'
        "printf ']}\\n'\n",
        encoding="utf-8",
    )
    fake_pi.chmod(0o755)

    result = subprocess.run(
        [BASH, str(launcher), "--profile", "legacy", "--model", "fixture"],
        env={**os.environ, "HOME": str(home), "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"},
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["profile"].endswith("/pi/profiles/legacy")
    assert payload["args"] == ["--model", "fixture"]
    assert payload["profile"].endswith("/.dotfiles/pi/profiles/legacy")


@pytest.mark.skipif(BASH is None or getattr(os, "geteuid", lambda: -1)() != 0, reason="requires bash and root package path")
def test_zsh_setup_stops_when_package_install_fails(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    apt_get = bin_dir / "apt-get"
    apt_get.write_text("#!/bin/sh\nexit 42\n", encoding="utf-8")
    apt_get.chmod(0o755)

    result = subprocess.run(
        [BASH, str(DOTFILES / "scripts" / "zsh-setup")],
        env={**os.environ, "HOME": str(tmp_path), "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"},
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert result.returncode != 0
    assert "apt-get" in result.stderr or result.returncode != 0
    assert "Setup completed successfully" not in result.stdout


def test_pi_cleanup_distinguishes_scoped_typebox() -> None:
    installer = (DOTFILES / "install").read_text(encoding="utf-8")
    start = installer.index('pi_global_list=$(pnpm list -g --depth -1 --json')
    parser = installer[start:].split("-c '\n", 1)[1].split("\n' || true)", 1)[0]
    result = subprocess.run(
        [sys.executable, "-c", parser],
        input=json.dumps([{"dependencies": {"@sinclair/typebox": {}, "@earendil-works/pi-ai": {}}}]),
        capture_output=True,
        text=True,
        check=True,
    )
    names = result.stdout.splitlines()
    assert "@sinclair/typebox" in names
    assert "typebox" not in names
    assert "@earendil-works/pi-ai" in names
    assert 'grep -Fxq "$package"' in installer


def test_unattended_installer_contract() -> None:
    installer = (DOTFILES / "install").read_text(encoding="utf-8")
    zsh_setup = (DOTFILES / "scripts" / "zsh-setup").read_text(encoding="utf-8")

    assert 'export GIT_TERMINAL_PROMPT=0' in installer
    assert 'BatchMode=yes' in installer
    assert 'apt_runner=(sudo -n --preserve-env=DEBIAN_FRONTEND)' in installer
    assert '"${apt_runner[@]}" apt-get update' in installer
    assert '"${apt_runner[@]}" apt-get install -y golang-1.23-go' in installer
    assert "export DEBIAN_FRONTEND=noninteractive" in installer
    assert "CI=true pnpm install --dir \"$PI_DIR\" --frozen-lockfile" in installer
    assert 'CI=true pnpm install --dir "$DEFAULT_PI_DIR" --frozen-lockfile' in installer
    assert 'CI=true pnpm install --dir "$ONCLAVE_DIR" --frozen-lockfile' in installer
    assert '/refresh-models openai-codex' not in installer
    assert 'Default Pi uses the native OpenAI catalog' in installer
    assert 'SUDO="sudo -n --preserve-env=DEBIAN_FRONTEND"' in zsh_setup
    assert 'export DEBIAN_FRONTEND=noninteractive' in zsh_setup
    assert "install_packages || exit $?" in zsh_setup
    assert "$SUDO apt-get update || return 1" in zsh_setup
    assert 'return 1' in zsh_setup
