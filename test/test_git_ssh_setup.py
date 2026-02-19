# /// script
# requires-python = ">=3.9"
# dependencies = ["pytest"]
# ///
"""
Pure Python tests for git-ssh-setup script functions.

Tests core SSH key discovery and git config generation logic without
subprocess execution. Reimplements bash functions as Python equivalents
for faster unit testing.

Converted from test/git_ssh_setup.bats.
"""

from pathlib import Path

import pytest


# =============================================================================
# Python implementations of bash functions (pure, no subprocess)
# =============================================================================


def find_personal_key(ssh_dir: Path) -> str:
    """
    Find the best available personal SSH key.
    Priority: id_ed25519-personal > id_ed25519
    Returns portable path with ~, or raises ValueError if not found.
    """
    for key in ["id_ed25519-personal", "id_ed25519"]:
        key_path = ssh_dir / key
        if key_path.is_file():
            return f"~/.ssh/{key}"
    raise ValueError("No personal SSH key found")


def find_work_key(ssh_dir: Path) -> str:
    """
    Find the best available work SSH key.
    Priority: id_ed25519-work > id_ed25519-eagletg
    Generic id_ed25519 is NOT a fallback for work (safety).
    Returns portable path with ~, or raises ValueError if not found.
    """
    for key in ["id_ed25519-work", "id_ed25519-eagletg"]:
        key_path = ssh_dir / key
        if key_path.is_file():
            return f"~/.ssh/{key}"
    raise ValueError("No work SSH key found")


def build_ssh_command(key: str, ssh_dir: Path) -> str:
    """
    Build sshCommand value for gitconfig.
    Includes -F ~/.ssh/config only if config file exists.

    Args:
        key: Portable SSH key path (e.g., "~/.ssh/id_ed25519")
        ssh_dir: Path to .ssh directory for config file check
    """
    config_path = ssh_dir / "config"
    if config_path.is_file():
        return f"ssh -i {key} -F ~/.ssh/config"
    else:
        return f"ssh -i {key}"


def write_local_config(config_file: Path, ssh_command: str) -> None:
    """
    Write local gitconfig file with SSH command (creates or updates).
    Idempotent: only writes if content differs or file doesn't exist.

    Args:
        config_file: Path to .gitconfig-*-local file
        ssh_command: SSH command string (e.g., "ssh -i ~/.ssh/id_ed25519")
    """
    expected = f"[core]\n\tsshCommand = {ssh_command}"

    # Check if file exists and has correct content (idempotency)
    if config_file.is_file():
        current = config_file.read_text()
        if current == expected:
            return  # Already correct, don't write

    # Write the config
    config_file.write_text(expected)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def ssh_dir(tmp_path):
    """Create a temporary .ssh directory."""
    ssh_dir = tmp_path / ".ssh"
    ssh_dir.mkdir()
    return ssh_dir


# =============================================================================
# find_personal_key tests (4 tests)
# =============================================================================


def test_find_personal_key_no_keys(ssh_dir):
    """find_personal_key returns failure when no keys exist."""
    with pytest.raises(ValueError, match="No personal SSH key found"):
        find_personal_key(ssh_dir)


def test_find_personal_key_only_ed25519(ssh_dir):
    """find_personal_key returns id_ed25519 when only that exists."""
    (ssh_dir / "id_ed25519").touch()
    result = find_personal_key(ssh_dir)
    assert result == "~/.ssh/id_ed25519"


def test_find_personal_key_only_personal(ssh_dir):
    """find_personal_key returns id_ed25519-personal when only that exists."""
    (ssh_dir / "id_ed25519-personal").touch()
    result = find_personal_key(ssh_dir)
    assert result == "~/.ssh/id_ed25519-personal"


def test_find_personal_key_prefers_personal(ssh_dir):
    """find_personal_key prefers id_ed25519-personal over id_ed25519."""
    (ssh_dir / "id_ed25519").touch()
    (ssh_dir / "id_ed25519-personal").touch()
    result = find_personal_key(ssh_dir)
    assert result == "~/.ssh/id_ed25519-personal"


# =============================================================================
# find_work_key tests (4 tests)
# =============================================================================


def test_find_work_key_no_keys(ssh_dir):
    """find_work_key returns failure when no keys exist."""
    with pytest.raises(ValueError, match="No work SSH key found"):
        find_work_key(ssh_dir)


def test_find_work_key_only_eagletg(ssh_dir):
    """find_work_key returns id_ed25519-eagletg when only that exists."""
    (ssh_dir / "id_ed25519-eagletg").touch()
    result = find_work_key(ssh_dir)
    assert result == "~/.ssh/id_ed25519-eagletg"


def test_find_work_key_only_work(ssh_dir):
    """find_work_key returns id_ed25519-work when only that exists."""
    (ssh_dir / "id_ed25519-work").touch()
    result = find_work_key(ssh_dir)
    assert result == "~/.ssh/id_ed25519-work"


def test_find_work_key_prefers_work(ssh_dir):
    """find_work_key prefers id_ed25519-work over id_ed25519-eagletg."""
    (ssh_dir / "id_ed25519-eagletg").touch()
    (ssh_dir / "id_ed25519-work").touch()
    result = find_work_key(ssh_dir)
    assert result == "~/.ssh/id_ed25519-work"


# =============================================================================
# build_ssh_command tests (2 tests)
# =============================================================================


def test_build_ssh_command_without_config(ssh_dir):
    """build_ssh_command without ssh config file."""
    result = build_ssh_command("~/.ssh/id_ed25519", ssh_dir)
    assert result == "ssh -i ~/.ssh/id_ed25519"


def test_build_ssh_command_with_config(ssh_dir):
    """build_ssh_command with ssh config file."""
    (ssh_dir / "config").touch()
    result = build_ssh_command("~/.ssh/id_ed25519", ssh_dir)
    assert result == "ssh -i ~/.ssh/id_ed25519 -F ~/.ssh/config"


# =============================================================================
# write_local_config tests (3 tests)
# =============================================================================


def test_write_local_config_creates_new(tmp_path):
    """write_local_config creates new config file."""
    config_file = tmp_path / ".gitconfig-test-local"
    ssh_cmd = "ssh -i ~/.ssh/id_ed25519"

    write_local_config(config_file, ssh_cmd)

    assert config_file.exists()
    assert "sshCommand = ssh -i ~/.ssh/id_ed25519" in config_file.read_text()


def test_write_local_config_updates_existing(tmp_path):
    """write_local_config updates existing config with different content."""
    config_file = tmp_path / ".gitconfig-test-local"

    # Write initial content
    config_file.write_text("old content")

    ssh_cmd = "ssh -i ~/.ssh/id_ed25519"
    write_local_config(config_file, ssh_cmd)

    content = config_file.read_text()
    assert "sshCommand = ssh -i ~/.ssh/id_ed25519" in content
    assert "old content" not in content


def test_write_local_config_idempotent(tmp_path):
    """write_local_config is idempotent when content matches."""
    config_file = tmp_path / ".gitconfig-test-local"
    ssh_cmd = "ssh -i ~/.ssh/id_ed25519"

    # Write config
    write_local_config(config_file, ssh_cmd)
    mtime1 = config_file.stat().st_mtime

    # Write again with same content - should not modify file
    write_local_config(config_file, ssh_cmd)
    mtime2 = config_file.stat().st_mtime

    # File should not have been modified
    assert mtime1 == mtime2
