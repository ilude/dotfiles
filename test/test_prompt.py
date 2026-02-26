#!/usr/bin/env python3
"""
/// script
requires-python = ">=3.9"
dependencies = [
    "pytest>=7.0",
]
///
"""

import shutil
import subprocess
from pathlib import Path

import pytest


def normalize_prompt_path(pwd: str, home: str, is_wsl: bool = False, user: str = "testuser") -> str:
    """
    Normalize a PWD path for the prompt, mirroring the bash __set_prompt() logic.

    Args:
        pwd: The current working directory path
        home: The home directory path
        is_wsl: Whether running in WSL
        user: The username (for WSL path construction)

    Returns:
        The normalized path (with ~ substitution where applicable)
    """
    p = pwd

    if is_wsl:
        # WSL: only Windows home (/mnt/c/Users/$USER) becomes ~
        # Use case-insensitive comparison
        p_lower = p.lower()
        win_home_lower = f"/mnt/c/users/{user.lower()}"
        if p_lower.startswith(win_home_lower):
            # Strip Windows home prefix, preserving case of remaining path
            p = "~" + p[len(win_home_lower) :]
    else:
        # Non-WSL: normal $HOME substitution
        if p.startswith(home):
            p = "~" + p[len(home) :]

    return p


# PATH NORMALIZATION TESTS (Pure Python, always run)


def test_home_path_to_tilde_non_wsl():
    """Non-WSL: home path → ~"""
    home = "/home/testuser"
    result = normalize_prompt_path(home, home, is_wsl=False)
    assert result == "~"


def test_home_subdir_to_tilde_subdir_non_wsl():
    """Non-WSL: home/subdir → ~/subdir"""
    home = "/home/testuser"
    result = normalize_prompt_path(f"{home}/projects", home, is_wsl=False)
    assert result == "~/projects"


def test_wsl_windows_home_to_tilde():
    """WSL: /mnt/c/Users/testuser → ~"""
    result = normalize_prompt_path(
        "/mnt/c/Users/testuser", home="/home/testuser", is_wsl=True, user="testuser"
    )
    assert result == "~"


def test_wsl_windows_home_mixed_case_to_tilde():
    """WSL: /mnt/c/Users/Testuser (mixed case) → ~ (case-insensitive)"""
    result = normalize_prompt_path(
        "/mnt/c/Users/Testuser", home="/home/testuser", is_wsl=True, user="testuser"
    )
    assert result == "~"


def test_wsl_linux_home_stays_full_path():
    """WSL: /home/testuser/projects stays as /home/testuser/projects"""
    result = normalize_prompt_path(
        "/home/testuser/projects", home="/home/testuser", is_wsl=True, user="testuser"
    )
    assert result == "/home/testuser/projects"


def test_non_home_path_unchanged():
    """/tmp/somedir stays unchanged in non-WSL"""
    home = "/home/testuser"
    result = normalize_prompt_path("/tmp/somedir", home, is_wsl=False)
    assert result == "/tmp/somedir"


def test_home_with_space_to_tilde_non_wsl():
    """Non-WSL: home path with space "Mike Smith" → ~"""
    home = "/home/Mike Smith"
    result = normalize_prompt_path(home, home, is_wsl=False)
    assert result == "~"


def test_subdir_under_home_with_space_non_wsl():
    """Non-WSL: subdir under home with space → ~/projects"""
    home = "/home/Mike Smith"
    result = normalize_prompt_path(f"{home}/projects", home, is_wsl=False)
    assert result == "~/projects"


def test_wsl_windows_home_with_space_to_tilde():
    """WSL: /mnt/c/Users/Mike Smith/.dotfiles → ~/.dotfiles"""
    result = normalize_prompt_path(
        "/mnt/c/Users/Mike Smith/.dotfiles",
        home="/home/mike",
        is_wsl=True,
        user="Mike Smith",
    )
    assert result == "~/.dotfiles"


def test_wsl_windows_home_with_space_mixed_case_to_tilde():
    """WSL: /mnt/c/USERS/Mike Smith/projects → ~/projects (case-insensitive)"""
    result = normalize_prompt_path(
        "/mnt/c/USERS/Mike Smith/projects",
        home="/home/mike",
        is_wsl=True,
        user="Mike Smith",
    )
    assert result == "~/projects"


def test_non_home_path_with_space_unchanged():
    """/tmp/my project/code stays unchanged"""
    home = "/home/testuser"
    result = normalize_prompt_path("/tmp/my project/code", home, is_wsl=False)
    assert result == "/tmp/my project/code"


def test_deeply_nested_path_under_home_with_space():
    """Non-WSL: deeply nested under home with space → ~/work/client projects/web app"""
    home = "/home/Mike Smith"
    result = normalize_prompt_path(f"{home}/work/client projects/web app", home, is_wsl=False)
    assert result == "~/work/client projects/web app"


# GIT BRANCH TESTS (Bash-dependent, skip on Windows)


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash not available")
def test_git_branch_appears_in_ps1(tmp_path):
    """Git branch appears in brackets in PS1"""
    tmpdir = str(tmp_path)
    # Initialize a git repo with a branch
    subprocess.run(["git", "init"], cwd=tmpdir, check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=tmpdir,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=tmpdir,
        check=True,
        capture_output=True,
    )
    # Create a file and commit to create the branch
    test_file = Path(tmpdir) / "test.txt"
    test_file.write_text("test")
    subprocess.run(["git", "add", "test.txt"], cwd=tmpdir, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "initial"],
        cwd=tmpdir,
        check=True,
        capture_output=True,
    )

    # Use bash -i with heredoc to make bash interactive
    # Note: This will produce some "Cannot set terminal..." warnings but still works
    dotfiles_bashrc = "/c/Users/Mike/.dotfiles/home/.bashrc"
    bash_script = f"""
source "{dotfiles_bashrc}"
cd "{tmpdir}"
__set_prompt
echo "$PS1"
"""
    result = subprocess.run(
        ["bash", "-i"],
        input=bash_script,
        capture_output=True,
        text=True,
        cwd=str(tmpdir),
    )
    # PS1 should be in the output with the format:
    # \[\e[32m\]path\[\e[0m\]\[\e[33m\][\[\e[36m\]branch\[\e[33m\]]\[\e[0m\]>
    # Look for the literal escape sequences that were echoed
    assert r"\[" in result.stdout, f"Expected PS1 output, got: {result.stdout}"
    # Check that branch info is present (cyan color code "36m" indicates branch)
    assert "36m" in result.stdout, f"Expected branch color code in PS1, got: {result.stdout}"
    assert "[" in result.stdout and "]" in result.stdout, (
        f"Expected brackets in PS1, got: {result.stdout}"
    )


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash not available")
def test_no_git_branch_outside_repo(tmp_path):
    """No branch brackets in PS1 when not in git repo"""
    tmpdir = str(tmp_path)
    # Don't initialize git, just test the prompt

    # Use bash -i with heredoc to make bash interactive
    dotfiles_bashrc = "/c/Users/Mike/.dotfiles/home/.bashrc"
    bash_script = f"""
source "{dotfiles_bashrc}"
cd "{tmpdir}"
__set_prompt
echo "$PS1"
"""
    result = subprocess.run(
        ["bash", "-i"],
        input=bash_script,
        capture_output=True,
        text=True,
        cwd=str(tmpdir),
    )
    # PS1 without git branch should be: \[\e[32m\]path\[\e[0m\]>
    # Should NOT contain the cyan color code "36m" which indicates branch info
    assert r"\[" in result.stdout, f"Expected PS1 output, got: {result.stdout}"
    assert "36m" not in result.stdout, (
        f"Unexpected branch color code in PS1 outside repo, got: {result.stdout}"
    )
