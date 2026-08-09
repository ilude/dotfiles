from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SETUP_SCRIPT = ROOT / "scripts" / "git-ssh-setup"


def _find_bash() -> str | None:
    if os.name == "nt":
        candidates = [
            Path(os.environ.get("PROGRAMFILES", "")) / "Git" / "bin" / "bash.exe",
            Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Git" / "bin" / "bash.exe",
        ]
        for candidate in candidates:
            if candidate.is_file():
                return str(candidate)
        return None
    return shutil.which("bash")


BASH = _find_bash()
pytestmark = pytest.mark.skipif(BASH is None, reason="bash not found")


def _shell_path(path: Path) -> str:
    if os.name != "nt":
        return path.as_posix()
    assert BASH is not None
    result = subprocess.run(
        [BASH, "-c", 'cygpath -u -- "$1"', "bash", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


@pytest.fixture
def home(tmp_path: Path) -> Path:
    home = tmp_path / "home"
    (home / ".ssh").mkdir(parents=True)
    return home


def _run_setup(home: Path) -> subprocess.CompletedProcess[str]:
    assert BASH is not None
    env = {
        **os.environ,
        "HOME": _shell_path(home),
        "USERPROFILE": str(home),
    }
    return subprocess.run(
        [BASH, _shell_path(SETUP_SCRIPT)],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def _assert_config(home: Path, name: str, ssh_command: str | None) -> None:
    config = home / name
    if ssh_command is None:
        assert not config.exists()
        return
    assert config.read_text(encoding="utf-8") == f"[core]\n\tsshCommand = {ssh_command}\n"


@pytest.mark.parametrize(
    ("keys", "personal_command", "work_command"),
    [
        ((), None, None),
        (("id_ed25519",), "ssh -i ~/.ssh/id_ed25519", None),
        (
            ("id_ed25519", "id_ed25519-personal"),
            "ssh -i ~/.ssh/id_ed25519-personal",
            None,
        ),
        (("id_ed25519-eagletg",), None, "ssh -i ~/.ssh/id_ed25519-eagletg"),
        (
            ("id_ed25519-eagletg", "id_ed25519-work"),
            None,
            "ssh -i ~/.ssh/id_ed25519-work",
        ),
    ],
)
def test_setup_selects_keys_without_cross_identity_fallback(
    home: Path,
    keys: tuple[str, ...],
    personal_command: str | None,
    work_command: str | None,
) -> None:
    for key in keys:
        (home / ".ssh" / key).touch()

    result = _run_setup(home)

    assert result.returncode == 0, result.stderr
    _assert_config(home, ".gitconfig-personal-local", personal_command)
    _assert_config(home, ".gitconfig-professional-local", work_command)
    if personal_command is None:
        assert "Personal: No key found" in result.stdout
    if work_command is None:
        assert "Work: No key found" in result.stdout
    if keys == ("id_ed25519",):
        assert "Warning: Only generic id_ed25519 found" in result.stdout


def test_setup_uses_ssh_config_for_both_identities(home: Path) -> None:
    for name in ("id_ed25519-personal", "id_ed25519-work", "config"):
        (home / ".ssh" / name).touch()

    result = _run_setup(home)

    assert result.returncode == 0, result.stderr
    _assert_config(
        home,
        ".gitconfig-personal-local",
        "ssh -i ~/.ssh/id_ed25519-personal -F ~/.ssh/config",
    )
    _assert_config(
        home,
        ".gitconfig-professional-local",
        "ssh -i ~/.ssh/id_ed25519-work -F ~/.ssh/config",
    )


def test_setup_updates_stale_config_and_does_not_rewrite_matching_config(home: Path) -> None:
    (home / ".ssh" / "id_ed25519-personal").touch()
    config = home / ".gitconfig-personal-local"
    config.write_text("old content\n", encoding="utf-8")

    first = _run_setup(home)

    assert first.returncode == 0, first.stderr
    expected = "[core]\n\tsshCommand = ssh -i ~/.ssh/id_ed25519-personal\n"
    assert config.read_text(encoding="utf-8") == expected

    old_timestamp_ns = 1_000_000_000
    os.utime(config, ns=(old_timestamp_ns, old_timestamp_ns))
    second = _run_setup(home)

    assert second.returncode == 0, second.stderr
    assert config.read_text(encoding="utf-8") == expected
    assert config.stat().st_mtime_ns == old_timestamp_ns
