"""Tests for path-normalization hook.

These tests verify the hook correctly:
1. Allows relative paths with forward slashes
2. Blocks relative paths with backslashes (suggests forward slashes)
3. Allows absolute paths within project directory
4. Allows absolute paths within home directory
5. Allows Claude internal paths (~/.claude/)
6. Blocks absolute paths outside allowed areas
7. Allows non-Edit/Write tools regardless of path
8. Uses USERPROFILE for home directory detection on Windows
"""

import os
import sys
from pathlib import Path

import pytest


class TestRelativePathsForwardSlashes:
    """Test Case 1: Relative paths with forward slashes should ALLOW (exit 0)."""

    @pytest.mark.parametrize(
        "path",
        [
            "plugins/python/file.py",
            "src/components/Button.tsx",
            "README.md",
            "lib/utils/helper.py",
            "./src/main.py",
            "../sibling/file.py",
            "package.json",
            ".gitignore",
            "src/components/ui/Dialog.tsx",
        ],
    )
    def test_relative_forward_slash_allowed(self, run_hook, path):
        """Relative paths with forward slashes should be allowed."""
        result = run_hook("Edit", path)
        assert result.allowed, f"Expected allowed, got exit {result.exit_code}: {result.stderr}"

    def test_write_tool_relative_allowed(self, run_hook):
        """Write tool with relative path should be allowed."""
        result = run_hook("Write", "src/new_file.py")
        assert result.allowed


class TestRelativePathsBackslashes:
    """Test Case 2: Relative paths with backslashes should BLOCK with suggestion."""

    @pytest.mark.parametrize(
        "path,expected_suggestion",
        [
            ("plugins\\python\\file.py", "plugins/python/file.py"),
            ("src\\components\\Button.tsx", "src/components/Button.tsx"),
            ("lib\\utils\\helper.py", "lib/utils/helper.py"),
        ],
    )
    def test_backslash_blocked_with_suggestion(self, run_hook, path, expected_suggestion):
        """Relative paths with backslashes should be blocked with correct suggestion."""
        result = run_hook("Edit", path)
        assert result.blocked, f"Expected blocked (exit 2), got exit {result.exit_code}"
        assert f"Use forward slashes: '{expected_suggestion}'" in result.stderr


class TestAbsoluteWithinProject:
    """Test Case 3: Absolute path within project directory should ALLOW (exit 0)."""

    def test_absolute_within_project_allowed(self, run_hook, tmp_path):
        """Absolute path within project dir should be allowed."""
        project_dir = tmp_path / "Projects" / "myproject"
        project_dir.mkdir(parents=True)
        file_path = project_dir / "src" / "file.py"

        # Convert to forward slashes for the path
        path_str = str(file_path).replace("\\", "/")
        project_str = str(project_dir).replace("\\", "/")

        result = run_hook(
            "Edit",
            path_str,
            env={"CLAUDE_PROJECT_DIR": project_str},
        )
        assert result.allowed, f"Expected allowed, got exit {result.exit_code}: {result.stderr}"

    def test_absolute_within_project_backslash_blocked(self, run_hook, tmp_path):
        """Absolute path within project using backslashes should be blocked."""
        project_dir = tmp_path / "Projects" / "myproject"
        project_dir.mkdir(parents=True)

        # Use backslashes in path
        path_str = str(project_dir / "src" / "file.py")
        if "/" in path_str:
            # On MSYS, paths might already be forward slashes, skip this test
            pytest.skip("Platform uses forward slashes natively")

        result = run_hook(
            "Edit",
            path_str,
            env={"CLAUDE_PROJECT_DIR": str(project_dir)},
        )
        assert result.blocked


class TestAbsoluteWithinHome:
    """Test Case 4: Absolute path within home directory should ALLOW (exit 0)."""

    def test_absolute_within_home_allowed(self, run_hook, tmp_path):
        """Absolute path within home directory should be allowed."""
        home_dir = tmp_path / "Users" / "TestUser"
        home_dir.mkdir(parents=True)

        # Create a path within home
        dotfiles_path = home_dir / ".dotfiles" / "file.py"
        path_str = str(dotfiles_path).replace("\\", "/")
        home_str = str(home_dir).replace("\\", "/")

        result = run_hook(
            "Edit",
            path_str,
            env={"USERPROFILE": home_str},
        )
        assert result.allowed, f"Expected allowed, got exit {result.exit_code}: {result.stderr}"

    def test_windows_home_path_allowed(self, run_hook, tmp_path):
        """Windows-style home path should be allowed."""
        home_dir = tmp_path / "Users" / "Mike"
        home_dir.mkdir(parents=True)

        # Simulate C:/Users/Mike/.dotfiles/file.py
        file_path = f"{str(home_dir).replace(chr(92), '/')}/.dotfiles/file.py"
        home_str = str(home_dir).replace("\\", "/")

        result = run_hook(
            "Edit",
            file_path,
            env={"USERPROFILE": home_str},
        )
        assert result.allowed


class TestClaudeInternalPaths:
    """Test Case 5: Claude internal paths should ALLOW (exit 0)."""

    def test_claude_plans_allowed(self, run_hook, tmp_path):
        """Paths within ~/.claude/ should be allowed."""
        home_dir = tmp_path / "Users" / "TestUser"
        claude_dir = home_dir / ".claude" / "plans"
        claude_dir.mkdir(parents=True)

        path_str = str(claude_dir / "test.md").replace("\\", "/")
        home_str = str(home_dir).replace("\\", "/")

        result = run_hook(
            "Edit",
            path_str,
            env={"USERPROFILE": home_str},
        )
        assert result.allowed, f"Expected allowed, got exit {result.exit_code}: {result.stderr}"

    def test_claude_logs_allowed(self, run_hook, tmp_path):
        """Paths within ~/.claude/logs/ should be allowed."""
        home_dir = tmp_path / "Users" / "TestUser"
        claude_dir = home_dir / ".claude" / "logs"
        claude_dir.mkdir(parents=True)

        path_str = str(claude_dir / "session.log").replace("\\", "/")
        home_str = str(home_dir).replace("\\", "/")

        result = run_hook(
            "Edit",
            path_str,
            env={"USERPROFILE": home_str},
        )
        assert result.allowed


class TestAbsoluteOutsideAllowed:
    """Test Case 6: Absolute path outside allowed areas should BLOCK."""

    def test_other_drive_blocked(self, run_hook, tmp_path):
        """Paths on other drives outside home/project should be blocked."""
        # Set up a fake home that doesn't include our target path
        home_dir = tmp_path / "Users" / "TestUser"
        home_dir.mkdir(parents=True)

        result = run_hook(
            "Edit",
            "E:/SomeOther/path/file.py",
            env={
                "USERPROFILE": str(home_dir).replace("\\", "/"),
                "CLAUDE_PROJECT_DIR": str(tmp_path / "project").replace("\\", "/"),
            },
        )
        assert result.blocked, f"Expected blocked, got exit {result.exit_code}"
        assert "Use relative path:" in result.stderr
        assert "file.py" in result.stderr

    def test_msys_absolute_blocked(self, run_hook, tmp_path):
        """MSYS-style absolute paths outside allowed areas should be blocked."""
        home_dir = tmp_path / "Users" / "TestUser"
        home_dir.mkdir(parents=True)

        result = run_hook(
            "Edit",
            "/e/SomeOther/path/file.py",
            env={
                "USERPROFILE": str(home_dir).replace("\\", "/"),
                "CLAUDE_PROJECT_DIR": str(tmp_path / "project").replace("\\", "/"),
            },
        )
        assert result.blocked

    def test_wsl_mount_blocked(self, run_hook, tmp_path):
        """WSL mount paths outside allowed areas should be blocked."""
        home_dir = tmp_path / "Users" / "TestUser"
        home_dir.mkdir(parents=True)

        result = run_hook(
            "Edit",
            "/mnt/e/SomeOther/path/file.py",
            env={
                "USERPROFILE": str(home_dir).replace("\\", "/"),
                "CLAUDE_PROJECT_DIR": str(tmp_path / "project").replace("\\", "/"),
            },
        )
        assert result.blocked


class TestNonEditWriteTools:
    """Test Case 7: Non-Edit/Write tools should ALLOW (exit 0) regardless of path."""

    @pytest.mark.parametrize(
        "tool_name",
        [
            "Read",
            "Glob",
            "Grep",
            "Bash",
            "ListDirectory",
        ],
    )
    def test_read_tool_allows_any_path(self, run_hook, tool_name):
        """Non-Edit/Write tools should be allowed regardless of path."""
        result = run_hook(tool_name, "E:/Anywhere/any/path/file.py")
        assert result.allowed, f"Expected {tool_name} to be allowed"

    def test_read_with_backslashes_allowed(self, run_hook):
        """Read tool should allow paths with backslashes."""
        result = run_hook("Read", r"E:\Path\With\Backslashes\file.py")
        assert result.allowed


class TestHomeDetection:
    """Test Case 8: HOME detection should use USERPROFILE over expanduser."""

    def test_userprofile_takes_precedence(self, run_hook, tmp_path):
        """USERPROFILE env var should be used for home detection."""
        # Create a custom "home" directory
        custom_home = tmp_path / "CustomHome" / "User"
        custom_home.mkdir(parents=True)

        # Path within custom home
        file_path = f"{str(custom_home).replace(chr(92), '/')}/.config/file.py"

        result = run_hook(
            "Edit",
            file_path,
            env={"USERPROFILE": str(custom_home).replace("\\", "/")},
        )
        assert result.allowed, f"Path within USERPROFILE should be allowed: {result.stderr}"

    def test_path_outside_userprofile_blocked(self, run_hook, tmp_path):
        """Paths outside USERPROFILE should be blocked."""
        custom_home = tmp_path / "CustomHome" / "User"
        custom_home.mkdir(parents=True)

        # Path outside custom home
        result = run_hook(
            "Edit",
            "D:/Outside/custom/home/file.py",
            env={
                "USERPROFILE": str(custom_home).replace("\\", "/"),
                "CLAUDE_PROJECT_DIR": str(tmp_path / "project").replace("\\", "/"),
            },
        )
        assert result.blocked


class TestEdgeCases:
    """Edge cases and special scenarios."""

    def test_empty_path_allowed(self, run_hook):
        """Empty path should be allowed (no validation needed)."""
        result = run_hook("Edit", "")
        assert result.allowed

    def test_single_file_allowed(self, run_hook):
        """Single filename with no path should be allowed."""
        result = run_hook("Edit", "file.py")
        assert result.allowed

    def test_unix_tmp_allowed(self, run_hook):
        """Unix /tmp/ paths should be allowed (special case)."""
        result = run_hook("Edit", "/tmp/test.txt")
        assert result.allowed

    def test_unix_dev_allowed(self, run_hook):
        """Unix /dev/ paths should be allowed (special case)."""
        result = run_hook("Edit", "/dev/null")
        assert result.allowed

    def test_unc_path_blocked(self, run_hook, tmp_path):
        """UNC network paths should be blocked."""
        home_dir = tmp_path / "Users" / "TestUser"
        home_dir.mkdir(parents=True)

        result = run_hook(
            "Edit",
            "//server/share/file.txt",
            env={
                "USERPROFILE": str(home_dir).replace("\\", "/"),
                "CLAUDE_PROJECT_DIR": str(tmp_path / "project").replace("\\", "/"),
            },
        )
        assert result.blocked

    def test_disabled_via_env(self, run_hook):
        """Hook should be disabled when CLAUDE_DISABLE_HOOKS includes it."""
        result = run_hook(
            "Edit",
            "E:/Should/Be/Blocked/file.py",
            env={"CLAUDE_DISABLE_HOOKS": "path-normalization"},
        )
        assert result.allowed, "Hook should be disabled via CLAUDE_DISABLE_HOOKS"

    def test_disabled_with_multiple_hooks(self, run_hook):
        """Hook should be disabled when in comma-separated list."""
        result = run_hook(
            "Edit",
            "E:/Should/Be/Blocked/file.py",
            env={"CLAUDE_DISABLE_HOOKS": "other-hook, path-normalization, another"},
        )
        assert result.allowed


class TestSuggestionMessages:
    """Verify error messages contain helpful suggestions."""

    def test_backslash_suggestion_format(self, run_hook):
        """Backslash error should suggest the corrected path."""
        result = run_hook("Edit", r"src\components\Button.tsx")
        assert result.blocked
        assert "Use forward slashes:" in result.stderr
        assert "src/components/Button.tsx" in result.stderr

    def test_absolute_suggestion_extracts_filename(self, run_hook, tmp_path):
        """Absolute path error should suggest relative or filename."""
        home_dir = tmp_path / "Users" / "TestUser"
        home_dir.mkdir(parents=True)

        result = run_hook(
            "Edit",
            "D:/Random/Path/important_file.py",
            env={
                "USERPROFILE": str(home_dir).replace("\\", "/"),
                "CLAUDE_PROJECT_DIR": str(tmp_path / "project").replace("\\", "/"),
            },
        )
        assert result.blocked
        assert "Use relative path:" in result.stderr
        assert "important_file.py" in result.stderr
