# /// script
# requires-python = ">=3.9"
# dependencies = ["pytest"]
# ///
"""
Shared pytest fixtures for dotfiles tests.
"""

import shutil
from pathlib import Path

import pytest

# Resolve DOTFILES path at import time
DOTFILES = Path(__file__).parent.parent.resolve()


@pytest.fixture
def dotfiles_path():
    """Return the path to the dotfiles directory."""
    return DOTFILES


@pytest.fixture
def tmp_home(tmp_path, monkeypatch):
    """Create a temporary HOME directory with standard structure.

    Creates:
    - .ssh/ directory
    - .dotfiles/claude/ directory with test marker

    Sets HOME and USERPROFILE environment variables.
    """
    home = tmp_path / "home"
    home.mkdir()

    # Create .ssh directory
    ssh_dir = home / ".ssh"
    ssh_dir.mkdir()

    # Create .dotfiles structure
    dotfiles = home / ".dotfiles"
    dotfiles.mkdir()
    claude_dir = dotfiles / "claude"
    claude_dir.mkdir()

    # Create a marker file to verify links work
    (claude_dir / "test-marker").write_text("test")

    # Set environment
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))  # Windows

    return home


@pytest.fixture
def zsh_available():
    """Skip test if zsh is not available."""
    if shutil.which("zsh") is None:
        pytest.skip("zsh not installed")
