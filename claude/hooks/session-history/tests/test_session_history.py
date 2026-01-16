"""Unit tests for session history hook."""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add parent to path for import
sys.path.insert(0, str(Path(__file__).parent.parent))

from session_history_hook import (
    append_session_end,
    get_project_name,
    get_session_id,
    session_end_exists,
    validate_jsonl,
)


class TestGetSessionId:
    """Tests for get_session_id()."""

    def test_from_environment(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Should extract first 8 chars from CLAUDE_SESSION_ID."""
        monkeypatch.setenv("CLAUDE_SESSION_ID", "abc12345-6789-0123-4567-890123456789")
        assert get_session_id() == "abc12345"

    def test_from_debug_dir(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Should extract session ID from most recent debug file."""
        monkeypatch.delenv("CLAUDE_SESSION_ID", raising=False)

        # Create mock debug directory
        debug_dir = tmp_path / ".claude" / "debug"
        debug_dir.mkdir(parents=True)
        (debug_dir / "def67890-1234-5678-9012-345678901234.txt").touch()

        with patch("session_history_hook.Path.home", return_value=tmp_path):
            # Patch expanduser to return tmp_path
            with patch("os.path.expanduser", return_value=str(tmp_path)):
                result = get_session_id()
                assert result == "def67890"

    def test_fallback_unknown(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Should return 'unknown' when no session ID available."""
        monkeypatch.delenv("CLAUDE_SESSION_ID", raising=False)
        with patch("os.path.expanduser", return_value="/nonexistent"):
            assert get_session_id() == "unknown"


class TestGetProjectName:
    """Tests for get_project_name()."""

    def test_from_git_repo(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Should extract project name from git repo."""
        project_dir = tmp_path / "my-project"
        project_dir.mkdir()
        monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(project_dir))

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = str(project_dir)

        with patch("subprocess.run", return_value=mock_result):
            assert get_project_name() == "my-project"

    def test_normalizes_spaces(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Should replace spaces with hyphens."""
        project_dir = tmp_path / "My Project"
        project_dir.mkdir()
        monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(project_dir))

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = str(project_dir)

        with patch("subprocess.run", return_value=mock_result):
            assert get_project_name() == "my-project"

    def test_fallback_to_dirname(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Should use directory name when not a git repo."""
        project_dir = tmp_path / "SomeProject"
        project_dir.mkdir()
        monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(project_dir))

        mock_result = MagicMock()
        mock_result.returncode = 1  # Not a git repo

        with patch("subprocess.run", return_value=mock_result):
            assert get_project_name() == "someproject"


class TestValidateJsonl:
    """Tests for validate_jsonl()."""

    def test_valid_file(self, tmp_path: Path) -> None:
        """Should return True for valid JSONL."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text(
            '{"ts":"2026-01-15T22:00:00Z","sid":"abc12345","type":"task_complete","summary":"Test"}\n'
            '{"ts":"2026-01-15T22:30:00Z","sid":"abc12345","type":"decision","summary":"Another"}\n'
        )
        valid, errors = validate_jsonl(history_file)
        assert valid
        assert errors == []

    def test_nonexistent_file(self, tmp_path: Path) -> None:
        """Should return True for nonexistent file."""
        history_file = tmp_path / "nonexistent.jsonl"
        valid, errors = validate_jsonl(history_file)
        assert valid
        assert errors == []

    def test_missing_type_field(self, tmp_path: Path) -> None:
        """Should detect missing 'type' field."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text('{"ts":"2026-01-15T22:00:00Z","sid":"abc12345","summary":"X"}\n')
        valid, errors = validate_jsonl(history_file)
        assert not valid
        assert any("missing 'type' field" in e for e in errors)

    def test_missing_summary_field(self, tmp_path: Path) -> None:
        """Should detect missing 'summary' field."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text('{"ts":"2026-01-15T22:00:00Z","sid":"abc12345","type":"decision"}\n')
        valid, errors = validate_jsonl(history_file)
        assert not valid
        assert any("missing 'summary' field" in e for e in errors)

    def test_invalid_json(self, tmp_path: Path) -> None:
        """Should detect invalid JSON."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text("not valid json\n")
        valid, errors = validate_jsonl(history_file)
        assert not valid
        assert any("invalid JSON" in e for e in errors)

    def test_empty_lines_ignored(self, tmp_path: Path) -> None:
        """Should ignore empty lines."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text(
            '{"ts":"2026-01-15T22:00:00Z","sid":"abc12345","type":"decision","summary":"X"}\n'
            "\n"
            '{"ts":"2026-01-15T22:30:00Z","sid":"abc12345","type":"decision","summary":"Y"}\n'
        )
        valid, errors = validate_jsonl(history_file)
        assert valid
        assert errors == []


class TestSessionEndExists:
    """Tests for session_end_exists()."""

    def test_exists(self, tmp_path: Path) -> None:
        """Should return True when session_end exists for session."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text(
            '{"ts":"2026-01-15T22:00:00Z","sid":"abc12345","type":"session_start","summary":"Start"}\n'
            '{"ts":"2026-01-15T23:00:00Z","sid":"abc12345","type":"session_end","summary":"End"}\n'
        )
        assert session_end_exists(history_file, "abc12345")

    def test_not_exists_different_session(self, tmp_path: Path) -> None:
        """Should return False when session_end is for different session."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text(
            '{"ts":"2026-01-15T23:00:00Z","sid":"other123","type":"session_end","summary":"End"}\n'
        )
        assert not session_end_exists(history_file, "abc12345")

    def test_not_exists_no_session_end(self, tmp_path: Path) -> None:
        """Should return False when no session_end exists."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text(
            '{"ts":"2026-01-15T22:00:00Z","sid":"abc12345","type":"session_start","summary":"Start"}\n'
        )
        assert not session_end_exists(history_file, "abc12345")

    def test_nonexistent_file(self, tmp_path: Path) -> None:
        """Should return False for nonexistent file."""
        history_file = tmp_path / "nonexistent.jsonl"
        assert not session_end_exists(history_file, "abc12345")


class TestAppendSessionEnd:
    """Tests for append_session_end()."""

    def test_appends_entry(self, tmp_path: Path) -> None:
        """Should append session_end entry."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text(
            '{"ts":"2026-01-15T22:00:00Z","sid":"abc12345","type":"session_start","summary":"Start"}\n'
        )

        with patch("session_history_hook.get_instance_id", return_value="inst1234"):
            append_session_end(history_file, "abc12345", "test-project")

        lines = history_file.read_text().strip().split("\n")
        assert len(lines) == 2
        last_entry = json.loads(lines[-1])
        assert last_entry["type"] == "session_end"
        assert last_entry["sid"] == "abc12345"
        assert last_entry["project"] == "test-project"

    def test_skips_if_already_exists(self, tmp_path: Path) -> None:
        """Should not add duplicate session_end."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text(
            '{"ts":"2026-01-15T22:00:00Z","sid":"abc12345","type":"session_start","summary":"Start"}\n'
            '{"ts":"2026-01-15T23:00:00Z","sid":"abc12345","type":"session_end","summary":"End"}\n'
        )

        append_session_end(history_file, "abc12345", "test-project")

        lines = history_file.read_text().strip().split("\n")
        assert len(lines) == 2  # No new line added

    def test_creates_file_if_missing(self, tmp_path: Path) -> None:
        """Should create file if it doesn't exist."""
        history_file = tmp_path / "new.jsonl"

        with patch("session_history_hook.get_instance_id", return_value="inst1234"):
            append_session_end(history_file, "abc12345", "test-project")

        assert history_file.exists()
        lines = history_file.read_text().strip().split("\n")
        assert len(lines) == 1
        entry = json.loads(lines[0])
        assert entry["type"] == "session_end"
