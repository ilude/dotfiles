import os
import shutil
import subprocess
import tarfile
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent
WINDOWS = os.name == "nt"


def run_setup(home: Path, root: Path, env=None):
    bash = shutil.which("bash")
    assert bash
    return subprocess.run(
        [bash, str(ROOT / "scripts" / "pi-link-setup"), "--root", str(root)],
        env={**os.environ, "HOME": str(home), **(env or {})},
        capture_output=True,
        text=True,
        timeout=30,
    )


def powershell(command: str, **paths):
    pwsh = shutil.which("pwsh")
    assert pwsh
    return subprocess.run(
        [pwsh, "-NoLogo", "-NoProfile", "-Command", command],
        env={**os.environ, **{key: str(value) for key, value in paths.items()}},
        capture_output=True,
        text=True,
        timeout=30,
    )


@pytest.fixture
def link_paths(tmp_path):
    home = tmp_path / "caller home with spaces"
    root = tmp_path / "checkout with spaces"
    home.mkdir()
    default = root / "pi" / "profiles" / "default"
    default.mkdir(parents=True)
    historical = tmp_path / "fake historical target"
    historical.mkdir()
    marker = historical / "historic.txt"
    marker.write_text("preserve", encoding="utf-8")
    agent = home / ".pi" / "agent"
    agent.parent.mkdir()
    return home, root, default, historical, marker, agent


@pytest.mark.parametrize("existing_link", [False, True])
def test_native_agent_link_fresh_retarget_and_repeat(link_paths, existing_link):
    home, root, default, historical, marker, agent = link_paths
    if existing_link:
        if WINDOWS:
            result = powershell(
                "New-Item -ItemType Junction -Path $env:AGENT -Target $env:HISTORICAL "
                "-ErrorAction Stop | Out-Null",
                AGENT=agent,
                HISTORICAL=historical,
            )
            assert result.returncode == 0, result.stderr
        else:
            agent.symlink_to(historical, target_is_directory=True)

    for _ in range(2):
        result = run_setup(home, root)
        assert result.returncode == 0, result.stdout + result.stderr
        assert agent.resolve() == default.resolve()
        assert marker.read_text(encoding="utf-8") == "preserve"
        if WINDOWS:
            result = powershell(
                "$item = Get-Item -LiteralPath $env:AGENT -Force; "
                "if ($item.LinkType -ne 'Junction' -or "
                "-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { exit 1 }",
                AGENT=agent,
            )
            assert result.returncode == 0, result.stderr


def test_failed_physical_directory_backup_preserves_contents(link_paths, tmp_path):
    home, root, _, _, _, agent = link_paths
    agent.mkdir()
    marker = agent / "keep.txt"
    marker.write_text("not archived", encoding="utf-8")
    if WINDOWS:
        # Fail only the archive tools, not junction detection or filesystem operations.
        result = powershell(
            "function global:7z { $global:LASTEXITCODE = 1 }; "
            "function global:tar { $global:LASTEXITCODE = 1 }; "
            "& $env:SETUP -Root $env:ROOT -HomePath $env:CALLER_HOME",
            SETUP=ROOT / "scripts" / "pi-link-setup.ps1",
            ROOT=root,
            CALLER_HOME=home,
        )
    else:
        bin_dir = tmp_path / "failing archive tools"
        bin_dir.mkdir()
        for name in ("7z", "tar"):
            tool = bin_dir / name
            tool.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
            tool.chmod(0o755)
        result = run_setup(
            home, root, {"PATH": str(bin_dir) + os.pathsep + os.environ["PATH"]}
        )
    assert result.returncode != 0
    assert agent.is_dir()
    assert not agent.is_symlink()
    assert marker.read_text(encoding="utf-8") == "not archived"


def test_physical_directory_is_archived_before_replacement(link_paths):
    home, root, default, _, _, agent = link_paths
    agent.mkdir()
    (agent / "saved.txt").write_text("archived content", encoding="utf-8")
    result = run_setup(home, root)
    assert result.returncode == 0, result.stdout + result.stderr
    assert agent.resolve() == default.resolve()
    archives = list(home.glob("pi-agent-backup-*"))
    assert len(archives) == 1
    assert archives[0].stat().st_size > 0
    if archives[0].name.endswith(".tar.gz"):
        with tarfile.open(archives[0]) as archive:
            saved = archive.extractfile("agent/saved.txt")
            assert saved is not None
            assert saved.read() == b"archived content"


def test_default_root_is_script_repository_not_caller_home(tmp_path):
    home = tmp_path / "caller home with spaces"
    home.mkdir()
    bash = shutil.which("bash")
    assert bash
    result = subprocess.run(
        [bash, str(ROOT / "scripts" / "pi-link-setup")],
        cwd=home,
        env={**os.environ, "HOME": str(home)},
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert (home / ".pi" / "agent").resolve() == (ROOT / "pi/profiles/default").resolve()


def test_missing_source_leaves_old_link_untouched(link_paths):
    home, root, default, historical, marker, agent = link_paths
    default.rmdir()
    if WINDOWS:
        result = powershell(
            "New-Item -ItemType Junction -Path $env:AGENT -Target $env:HISTORICAL "
            "-ErrorAction Stop | Out-Null",
            AGENT=agent,
            HISTORICAL=historical,
        )
        assert result.returncode == 0, result.stderr
    else:
        agent.symlink_to(historical, target_is_directory=True)
    result = run_setup(home, root)
    assert result.returncode != 0
    assert agent.resolve() == historical.resolve()
    assert marker.read_text(encoding="utf-8") == "preserve"
