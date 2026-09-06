import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

DOTFILES = Path(__file__).parent.parent
BASH = shutil.which("bash")
PWSH = shutil.which("pwsh")


def _fake_pi_bash(bin_dir: Path) -> None:
    executable = bin_dir / "pi"
    executable.write_text(
        "#!/usr/bin/env bash\n"
        "python3 -c 'import json, os, sys; print(json.dumps({\"dir\": os.environ.get(\"PI_CODING_AGENT_DIR\"), \"args\": sys.argv[1:]}))' \"$@\"\n",
        encoding="utf-8",
    )
    executable.chmod(0o755)


@pytest.mark.skipif(BASH is None, reason="bash not found")
def test_pp_uses_default_bash_profile(tmp_path: Path) -> None:
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)

    result = subprocess.run(
        [BASH, str(DOTFILES / "scripts" / "pp")],
        env={**os.environ, "HOME": str(home), "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert Path(json.loads(result.stdout)["dir"]) == DOTFILES / "pi" / "profiles" / "default"


@pytest.mark.skipif(BASH is None, reason="bash not found")
@pytest.mark.parametrize("option", ["-p", "--profile"])
def test_pp_selects_bash_profile_and_forwards_arguments(tmp_path: Path, option: str) -> None:
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)

    result = subprocess.run(
        [BASH, str(DOTFILES / "scripts" / "pp"), option, "clean", "--model", "example"],
        env={**os.environ, "HOME": str(home), "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert Path(payload["dir"]) == home / ".pi" / "profiles" / "clean"
    assert payload["args"] == ["--model", "example"]
    assert (home / ".pi" / "profiles" / "clean").is_dir()


@pytest.mark.skipif(BASH is None, reason="bash not found")
def test_pp_passes_pi_short_print_option_after_separator(tmp_path: Path) -> None:
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)

    result = subprocess.run(
        [BASH, str(DOTFILES / "scripts" / "pp"), "--profile=clean", "--", "-p", "hello"],
        env={**os.environ, "HOME": str(home), "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["args"] == ["-p", "hello"]


@pytest.mark.skipif(PWSH is None, reason="PowerShell not found")
def test_pp_selects_powershell_profile_and_forwards_arguments(tmp_path: Path) -> None:
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    (bin_dir / "pi.ps1").write_text(
        "[pscustomobject]@{ dir = $env:PI_CODING_AGENT_DIR; args = @($args) } | ConvertTo-Json -Compress\n",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            PWSH,
            "-NoProfile",
            "-File",
            str(DOTFILES / "scripts" / "pp.ps1"),
            "--profile",
            "legacy",
            "--model",
            "example",
        ],
        env={
            **os.environ,
            "USERPROFILE": str(home),
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        },
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert Path(payload["dir"]) == DOTFILES / "pi" / "profiles" / "legacy"
    assert payload["args"] == ["--model", "example"]
