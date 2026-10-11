import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

DOTFILES = Path(__file__).parent.parent
BASH = shutil.which("bash")


@pytest.mark.skipif(
    BASH is None or getattr(os, "geteuid", lambda: -1)() != 0,
    reason="requires bash and root package path",
)
def test_zsh_setup_stops_when_package_install_fails(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    apt_get = bin_dir / "apt-get"
    apt_get.write_text("#!/bin/sh\nexit 42\n", encoding="utf-8")
    apt_get.chmod(0o755)

    result = subprocess.run(
        [BASH, str(DOTFILES / "scripts" / "zsh-setup")],
        env={
            **os.environ,
            "HOME": str(tmp_path),
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        },
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert result.returncode != 0
    assert "Setup completed successfully" not in result.stdout


def test_pi_cleanup_distinguishes_scoped_typebox() -> None:
    result = subprocess.run(
        [sys.executable, str(DOTFILES / "scripts" / "pi-global-cleanup-packages.py")],
        input=json.dumps(
            [{"dependencies": {"@sinclair/typebox": {}, "@earendil-works/pi-ai": {}}}]
        ),
        capture_output=True,
        text=True,
        check=True,
    )
    names = result.stdout.splitlines()
    assert "@sinclair/typebox" in names
    assert "typebox" not in names
    assert "@earendil-works/pi-ai" in names


def test_pi_cleanup_lists_exact_names_across_projects() -> None:
    path = DOTFILES / "scripts" / "pi-global-cleanup-packages.py"
    spec = importlib.util.spec_from_file_location("pi_global_cleanup_packages", path)
    assert spec is not None and spec.loader is not None
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    output = io.StringIO()
    helper.list_global_packages(
        io.StringIO(json.dumps([{}, {"dependencies": {"typebox": {}, "@scope/typebox": {}}}])),
        output,
    )
    assert output.getvalue() == "\ntypebox\n@scope/typebox\n"


def test_pi_cleanup_invalid_json_reports_error() -> None:
    result = subprocess.run(
        [sys.executable, str(DOTFILES / "scripts" / "pi-global-cleanup-packages.py")],
        input="not json",
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert result.stdout == ""
    assert "JSONDecodeError" in result.stderr


@pytest.mark.skipif(BASH is None, reason="requires bash")
def test_pi_cleanup_invalid_json_shell_fallback() -> None:
    result = subprocess.run(
        [
            BASH,
            "-c",
            'names=$(printf "invalid" | "$1" "$2" || true); printf "%s" "$names"',
            "cleanup-probe",
            sys.executable,
            str(DOTFILES / "scripts" / "pi-global-cleanup-packages.py"),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert result.stdout == ""
    assert "JSONDecodeError" in result.stderr
