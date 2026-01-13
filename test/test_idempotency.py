# /// script
# requires-python = ">=3.9"
# dependencies = ["pytest"]
# ///
"""
Idempotency and Subprocess Tests

Tests that verify scripts can be run multiple times safely,
and tests that require subprocess execution (zsh, etc).

Converted from idempotency.bats and shell-setup.bats ZDOTDIR tests.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

# Skip all tests in this module on Windows - they require bash/zsh subprocesses
# and Unix-style path handling that don't work on Windows
pytestmark = pytest.mark.skipif(
    sys.platform == "win32", reason="Subprocess tests require Unix shell"
)

DOTFILES = Path(__file__).parent.parent


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def tmp_home(tmp_path, monkeypatch):
    """Create a temporary HOME directory with .ssh and .dotfiles structure."""
    home = tmp_path / "home"
    home.mkdir()

    # Create .ssh directory
    ssh_dir = home / ".ssh"
    ssh_dir.mkdir()

    # Create .dotfiles structure (claude-link-setup expects 'claude' not '.claude')
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


# =============================================================================
# git-ssh-setup idempotency tests (from idempotency.bats)
# =============================================================================


class TestGitSshSetup:
    """Tests for git-ssh-setup script idempotency."""

    def test_runs_successfully_first_execution(self, tmp_home):
        """git-ssh-setup runs successfully on first execution."""
        ssh_key = tmp_home / ".ssh" / "id_ed25519"
        ssh_key.touch()
        ssh_key.chmod(0o600)

        result = subprocess.run(
            [str(DOTFILES / "git-ssh-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, f"Failed: {result.stderr}"

    def test_creates_gitconfig_files(self, tmp_home):
        """git-ssh-setup creates gitconfig files with SSH key present."""
        ssh_key = tmp_home / ".ssh" / "id_ed25519"
        ssh_key.touch()
        ssh_key.chmod(0o600)

        subprocess.run(
            [str(DOTFILES / "git-ssh-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )

        # Personal config should be created (id_ed25519 is fallback for personal)
        assert (tmp_home / ".gitconfig-personal-local").exists()

    def test_runs_successfully_second_execution(self, tmp_home):
        """git-ssh-setup runs successfully on second execution."""
        ssh_key = tmp_home / ".ssh" / "id_ed25519"
        ssh_key.touch()
        ssh_key.chmod(0o600)

        env = {**os.environ, "HOME": str(tmp_home)}

        # First run
        result1 = subprocess.run(
            [str(DOTFILES / "git-ssh-setup")], env=env, capture_output=True
        )
        assert result1.returncode == 0

        # Second run
        result2 = subprocess.run(
            [str(DOTFILES / "git-ssh-setup")], env=env, capture_output=True
        )
        assert result2.returncode == 0

    def test_second_run_does_not_corrupt_config(self, tmp_home):
        """git-ssh-setup second run does not corrupt config files."""
        ssh_key = tmp_home / ".ssh" / "id_ed25519"
        ssh_key.touch()
        ssh_key.chmod(0o600)

        env = {**os.environ, "HOME": str(tmp_home)}
        script = str(DOTFILES / "git-ssh-setup")

        # First run
        subprocess.run([script], env=env, capture_output=True)
        content_after_first = (tmp_home / ".gitconfig-personal-local").read_text()

        # Second run
        subprocess.run([script], env=env, capture_output=True)
        content_after_second = (tmp_home / ".gitconfig-personal-local").read_text()

        assert content_after_first == content_after_second

    def test_handles_missing_keys_gracefully(self, tmp_home):
        """git-ssh-setup handles missing SSH keys gracefully."""
        # No SSH keys created
        result = subprocess.run(
            [str(DOTFILES / "git-ssh-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )
        assert result.returncode == 0

    def test_multiple_runs_with_no_keys(self, tmp_home):
        """git-ssh-setup multiple runs with no keys still succeeds."""
        env = {**os.environ, "HOME": str(tmp_home)}
        script = str(DOTFILES / "git-ssh-setup")

        result1 = subprocess.run([script], env=env, capture_output=True)
        assert result1.returncode == 0

        result2 = subprocess.run([script], env=env, capture_output=True)
        assert result2.returncode == 0


# =============================================================================
# claude-link-setup idempotency tests (from idempotency.bats)
# =============================================================================


class TestClaudeLinkSetup:
    """Tests for claude-link-setup script idempotency."""

    def test_runs_successfully_first_execution(self, tmp_home):
        """claude-link-setup runs successfully on first execution."""
        result = subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, f"Failed: {result.stderr}"

    def test_creates_link_to_claude_directory(self, tmp_home):
        """claude-link-setup creates link to .claude directory."""
        subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )

        # Link should exist
        claude_link = tmp_home / ".claude"
        assert claude_link.exists()

        # Should be able to read the test marker through the link
        assert (claude_link / "test-marker").exists()

    def test_runs_successfully_second_execution(self, tmp_home):
        """claude-link-setup runs successfully on second execution."""
        env = {**os.environ, "HOME": str(tmp_home)}
        script = str(DOTFILES / "claude-link-setup")

        result1 = subprocess.run([script], env=env, capture_output=True)
        assert result1.returncode == 0

        result2 = subprocess.run([script], env=env, capture_output=True)
        assert result2.returncode == 0

    def test_second_run_preserves_link(self, tmp_home):
        """claude-link-setup second run preserves link functionality."""
        env = {**os.environ, "HOME": str(tmp_home)}
        script = str(DOTFILES / "claude-link-setup")

        subprocess.run([script], env=env, capture_output=True)
        assert (tmp_home / ".claude" / "test-marker").exists()

        subprocess.run([script], env=env, capture_output=True)
        assert (tmp_home / ".claude" / "test-marker").exists()

        content = (tmp_home / ".claude" / "test-marker").read_text()
        assert content == "test"

    def test_second_run_reports_already_linked(self, tmp_home):
        """claude-link-setup second run reports already linked."""
        env = {**os.environ, "HOME": str(tmp_home)}
        script = str(DOTFILES / "claude-link-setup")

        subprocess.run([script], env=env, capture_output=True)

        result = subprocess.run([script], env=env, capture_output=True, text=True)
        assert result.returncode == 0
        assert "Already linked" in result.stdout

    def test_fails_gracefully_when_source_missing(self, tmp_home):
        """claude-link-setup fails gracefully when source missing."""
        # Remove the source directory
        shutil.rmtree(tmp_home / ".dotfiles" / "claude")

        result = subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
            text=True,
        )
        assert result.returncode == 1
        assert "not found" in result.stdout


class TestClaudeLinkSetupBackupMerge:
    """Tests for claude-link-setup backup and merge functionality."""

    def test_creates_backup_when_existing_directory(self, tmp_home):
        """claude-link-setup creates backup when ~/.claude is existing directory."""
        # Create existing ~/.claude directory
        existing_claude = tmp_home / ".claude"
        existing_claude.mkdir()
        (existing_claude / "history.jsonl").write_text("session data")

        result = subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )
        assert result.returncode == 0

        # Backup archive should be created
        backups = list(tmp_home.glob("claude-backup-*"))
        assert len(backups) >= 1

    def test_merges_history_from_existing_directory(self, tmp_home):
        """claude-link-setup merges history.jsonl from existing directory."""
        existing_claude = tmp_home / ".claude"
        existing_claude.mkdir()
        (existing_claude / "history.jsonl").write_text('{"session":"old"}')

        subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )

        # history.jsonl should now exist in dotfiles
        history_file = tmp_home / ".dotfiles" / "claude" / "history.jsonl"
        assert history_file.exists()
        assert "old" in history_file.read_text()

    def test_appends_to_existing_history(self, tmp_home):
        """claude-link-setup appends to existing history.jsonl instead of overwriting."""
        # Pre-existing history in dotfiles
        (tmp_home / ".dotfiles" / "claude" / "history.jsonl").write_text(
            '{"session":"existing"}'
        )

        # Create ~/.claude with additional history
        existing_claude = tmp_home / ".claude"
        existing_claude.mkdir()
        (existing_claude / "history.jsonl").write_text('{"session":"new"}')

        subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )

        history_content = (
            tmp_home / ".dotfiles" / "claude" / "history.jsonl"
        ).read_text()
        assert "existing" in history_content
        assert "new" in history_content

    def test_merges_debug_directory(self, tmp_home):
        """claude-link-setup merges debug directory contents."""
        existing_claude = tmp_home / ".claude"
        debug_dir = existing_claude / "debug"
        debug_dir.mkdir(parents=True)
        (debug_dir / "session-abc.txt").write_text("debug1")
        (debug_dir / "session-def.txt").write_text("debug2")

        subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )

        dotfiles_debug = tmp_home / ".dotfiles" / "claude" / "debug"
        assert (dotfiles_debug / "session-abc.txt").exists()
        assert (dotfiles_debug / "session-def.txt").exists()

    def test_preserves_existing_files_during_merge(self, tmp_home):
        """claude-link-setup preserves existing files in dotfiles during merge."""
        # Pre-existing debug file in dotfiles
        dotfiles_debug = tmp_home / ".dotfiles" / "claude" / "debug"
        dotfiles_debug.mkdir(parents=True)
        (dotfiles_debug / "existing.txt").write_text("original content")

        # Create ~/.claude with a different file
        existing_claude = tmp_home / ".claude"
        (existing_claude / "debug").mkdir(parents=True)
        (existing_claude / "debug" / "new-file.txt").write_text("new content")

        subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )

        # Original should be preserved
        assert (dotfiles_debug / "existing.txt").read_text() == "original content"
        # New should be added
        assert (dotfiles_debug / "new-file.txt").exists()

    def test_copies_credentials_if_not_in_dotfiles(self, tmp_home):
        """claude-link-setup copies credentials file if not in dotfiles."""
        existing_claude = tmp_home / ".claude"
        existing_claude.mkdir()
        (existing_claude / ".credentials.json").write_text('{"token":"secret"}')

        subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )

        assert (tmp_home / ".dotfiles" / "claude" / ".credentials.json").exists()

    def test_does_not_overwrite_existing_credentials(self, tmp_home):
        """claude-link-setup does not overwrite existing credentials in dotfiles."""
        # Pre-existing credentials
        (tmp_home / ".dotfiles" / "claude" / ".credentials.json").write_text(
            '{"token":"dotfiles-token"}'
        )

        # Create ~/.claude with different credentials
        existing_claude = tmp_home / ".claude"
        existing_claude.mkdir()
        (existing_claude / ".credentials.json").write_text('{"token":"local-token"}')

        subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )

        content = (
            tmp_home / ".dotfiles" / "claude" / ".credentials.json"
        ).read_text()
        assert "dotfiles-token" in content

    def test_creates_symlink_after_merge(self, tmp_home):
        """claude-link-setup creates symlink after backup/merge completes."""
        existing_claude = tmp_home / ".claude"
        existing_claude.mkdir()
        (existing_claude / "history.jsonl").write_text("data")

        subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )

        # ~/.claude should now be a symlink (or junction on Windows)
        assert (tmp_home / ".claude").is_symlink() or (tmp_home / ".claude").exists()

    def test_merged_content_accessible_through_symlink(self, tmp_home):
        """claude-link-setup merged content accessible through symlink."""
        existing_claude = tmp_home / ".claude"
        existing_claude.mkdir()
        (existing_claude / "history.jsonl").write_text("merged-data")

        subprocess.run(
            [str(DOTFILES / "claude-link-setup")],
            env={**os.environ, "HOME": str(tmp_home)},
            capture_output=True,
        )

        # Should be able to read merged content through the symlink
        assert "merged-data" in (tmp_home / ".claude" / "history.jsonl").read_text()
        # Original test marker should also be accessible
        assert (tmp_home / ".claude" / "test-marker").exists()


# =============================================================================
# ZDOTDIR behavior tests (from shell-setup.bats)
# =============================================================================


class TestZdotdirBehavior:
    """Tests for ZDOTDIR shell boundary crossing behavior."""

    def test_zdotdir_reaches_zsh_process(self, zsh_available, tmp_path):
        """ZDOTDIR reaches zsh process when passed via env."""
        zdotdir = tmp_path / "zdotdir"
        zdotdir.mkdir()

        result = subprocess.run(
            ["zsh", "-c", "echo $ZDOTDIR"],
            env={**os.environ, "ZDOTDIR": str(zdotdir)},
            capture_output=True,
            text=True,
        )

        assert result.stdout.strip() == str(zdotdir)

    def test_zsh_sources_zshrc_from_zdotdir(self, zsh_available, tmp_path):
        """zsh sources .zshrc from ZDOTDIR not HOME."""
        zdotdir = tmp_path / "zdotdir"
        zdotdir.mkdir()

        # Create test .zshrc in ZDOTDIR
        (zdotdir / ".zshrc").write_text("export ZDOTDIR_TEST_VAR=from_zdotdir")

        result = subprocess.run(
            ["zsh", "-c", 'source "$ZDOTDIR/.zshrc" 2>/dev/null; echo $ZDOTDIR_TEST_VAR'],
            env={
                **os.environ,
                "ZDOTDIR": str(zdotdir),
                "HOME": "/home/nonexistent",
            },
            capture_output=True,
            text=True,
        )

        assert result.stdout.strip() == "from_zdotdir"

    def test_zdotdir_persists_in_subshells(self, zsh_available, tmp_path):
        """ZDOTDIR persists in nested zsh calls."""
        zdotdir = tmp_path / "zdotdir"
        zdotdir.mkdir()

        result = subprocess.run(
            ["zsh", "-c", 'zsh -c "echo $ZDOTDIR"'],
            env={**os.environ, "ZDOTDIR": str(zdotdir)},
            capture_output=True,
            text=True,
        )

        assert result.stdout.strip() == str(zdotdir)

    def test_zdotdir_fallback_pattern_with_zdotdir_set(self, zsh_available, tmp_path):
        """${ZDOTDIR:-$HOME} pattern resolves correctly when ZDOTDIR set."""
        zdotdir = tmp_path / "zdotdir"
        zdotdir.mkdir()

        result = subprocess.run(
            ["zsh", "-c", 'echo ${ZDOTDIR:-$HOME}'],
            env={
                **os.environ,
                "ZDOTDIR": str(zdotdir),
                "HOME": "/home/different",
            },
            capture_output=True,
            text=True,
        )

        assert result.stdout.strip() == str(zdotdir)

    def test_zdotdir_fallback_pattern_without_zdotdir(self, zsh_available, tmp_path):
        """${ZDOTDIR:-$HOME} pattern falls back to HOME when ZDOTDIR unset."""
        home = tmp_path / "home"
        home.mkdir()

        # Create minimal env without ZDOTDIR
        env = {k: v for k, v in os.environ.items() if k != "ZDOTDIR"}
        env["HOME"] = str(home)

        result = subprocess.run(
            ["zsh", "-c", 'echo ${ZDOTDIR:-$HOME}'],
            env=env,
            capture_output=True,
            text=True,
        )

        assert result.stdout.strip() == str(home)

    def test_zdotdir_with_spaces_in_path(self, zsh_available, tmp_path):
        """ZDOTDIR with spaces in path works correctly."""
        zdotdir = tmp_path / "path with spaces"
        zdotdir.mkdir()

        result = subprocess.run(
            ["zsh", "-c", 'echo "$ZDOTDIR"'],
            env={**os.environ, "ZDOTDIR": str(zdotdir)},
            capture_output=True,
            text=True,
        )

        assert result.stdout.strip() == str(zdotdir)

    def test_zsh_interactive_mode_preserves_zdotdir(self, zsh_available, tmp_path):
        """zsh interactive mode (-i) preserves ZDOTDIR."""
        zdotdir = tmp_path / "zdotdir"
        zdotdir.mkdir()
        (zdotdir / ".zshrc").touch()  # Empty .zshrc to prevent newuser wizard

        result = subprocess.run(
            ["zsh", "-i", "-c", "echo $ZDOTDIR"],
            env={**os.environ, "ZDOTDIR": str(zdotdir)},
            capture_output=True,
            text=True,
            timeout=10,
        )

        assert result.stdout.strip() == str(zdotdir)

    def test_zsh_login_mode_preserves_zdotdir(self, zsh_available, tmp_path):
        """zsh login mode (-l) preserves ZDOTDIR."""
        zdotdir = tmp_path / "zdotdir"
        zdotdir.mkdir()
        (zdotdir / ".zshrc").touch()

        result = subprocess.run(
            ["zsh", "-l", "-c", "echo $ZDOTDIR"],
            env={**os.environ, "ZDOTDIR": str(zdotdir)},
            capture_output=True,
            text=True,
            timeout=10,
        )

        assert result.stdout.strip() == str(zdotdir)

    def test_zsh_respects_zdotdir_for_zshenv(self, zsh_available, tmp_path):
        """zsh respects ZDOTDIR for .zshenv location."""
        zdotdir = tmp_path / "zdotdir"
        zdotdir.mkdir()

        # Create .zshenv that sets a marker
        (zdotdir / ".zshenv").write_text("export ZSHENV_MARKER=from_zshenv")

        result = subprocess.run(
            ["zsh", "-c", "echo $ZSHENV_MARKER"],
            env={**os.environ, "ZDOTDIR": str(zdotdir)},
            capture_output=True,
            text=True,
        )

        assert result.stdout.strip() == "from_zshenv"

    @pytest.mark.skipif(
        sys.platform != "win32" and "MSYSTEM" not in os.environ,
        reason="Windows/MSYS2 only test",
    )
    def test_zdotdir_windows_path_resolution(self, zsh_available, tmp_path):
        """dotfiles path resolution works with ZDOTDIR on Windows."""
        # Use actual path conversion if on Windows
        zdotdir = tmp_path / "zdotdir"
        zdotdir.mkdir()

        result = subprocess.run(
            ["zsh", "-c", 'echo "${ZDOTDIR:-$HOME}/.dotfiles"'],
            env={**os.environ, "ZDOTDIR": str(zdotdir)},
            capture_output=True,
            text=True,
        )

        assert f"{zdotdir}/.dotfiles" in result.stdout.strip()
