"""Unit tests for session history hook."""

import io
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add parent to path for import
sys.path.insert(0, str(Path(__file__).parent.parent))

from session_history_hook import (
    _line_is_session_end,
    append_session_end,
    get_history_path,
    get_instance_id,
    get_project_name,
    get_session_id,
    log_validation_errors,
    main,
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
        history_file.write_text(
            '{"ts":"2026-01-15T22:00:00Z","sid":"abc12345","type":"decision"}\n'
        )
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


class TestLineIsSessionEnd:
    """Tests for _line_is_session_end()."""

    def test_empty_string(self) -> None:
        """Empty string should return False."""
        assert _line_is_session_end("", "abc") is False

    def test_whitespace_only(self) -> None:
        """Whitespace-only string should return False."""
        assert _line_is_session_end("   ", "abc") is False

    def test_not_json(self) -> None:
        """Non-JSON string should return False without raising."""
        assert _line_is_session_end("not-json", "abc") is False

    def test_wrong_type(self) -> None:
        """Entry with wrong type should return False."""
        line = json.dumps({"type": "message", "sid": "abc"})
        assert _line_is_session_end(line, "abc") is False

    def test_wrong_sid(self) -> None:
        """Entry with matching type but wrong sid should return False."""
        line = json.dumps({"type": "session_end", "sid": "wrong"})
        assert _line_is_session_end(line, "abc") is False

    def test_matching_entry(self) -> None:
        """Entry with matching type and sid should return True."""
        line = json.dumps({"type": "session_end", "sid": "abc"})
        assert _line_is_session_end(line, "abc") is True


class TestSessionEndExistsEdgeCases:
    """Edge case tests for session_end_exists()."""

    def test_blank_lines_interspersed(self, tmp_path: Path) -> None:
        """Should find session_end even with blank lines between entries."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text(
            '{"ts":"2026-01-15T22:00:00Z","sid":"abc12345","type":"session_start","summary":"Start"}\n'
            "\n"
            "\n"
            '{"ts":"2026-01-15T23:00:00Z","sid":"abc12345","type":"session_end","summary":"End"}\n'
        )
        assert session_end_exists(history_file, "abc12345")

    def test_malformed_json_lines_do_not_crash(self, tmp_path: Path) -> None:
        """Should skip malformed JSON lines without raising."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text(
            "this is not json\n"
            '{"ts":"2026-01-15T23:00:00Z","sid":"abc12345","type":"session_end","summary":"End"}\n'
        )
        assert session_end_exists(history_file, "abc12345")

    def test_malformed_json_lines_no_match(self, tmp_path: Path) -> None:
        """Should return False when only malformed lines exist and no session_end."""
        history_file = tmp_path / "test.jsonl"
        history_file.write_text("not json\n{bad}\n")
        assert not session_end_exists(history_file, "abc12345")


class TestGetInstanceId:
    """Tests for get_instance_id()."""

    def test_without_env_var(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Should return 'unknown' when CLAUDE_CODE_SSE_PORT is not set."""
        monkeypatch.delenv("CLAUDE_CODE_SSE_PORT", raising=False)
        assert get_instance_id() == "unknown"

    def test_with_env_var_valid_lock_file(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Should return first 8 chars of authToken from lock file."""
        monkeypatch.setenv("CLAUDE_CODE_SSE_PORT", "12345")
        lock_dir = tmp_path / ".claude" / "ide"
        lock_dir.mkdir(parents=True)
        lock_file = lock_dir / "12345.lock"
        lock_file.write_text(json.dumps({"authToken": "abcdef1234567890"}))

        with patch("os.path.expanduser", return_value=str(tmp_path)):
            result = get_instance_id()

        assert result == "abcdef12"

    def test_with_env_var_missing_lock_file(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Should return 'unknown' when lock file does not exist."""
        monkeypatch.setenv("CLAUDE_CODE_SSE_PORT", "99999")
        with patch("os.path.expanduser", return_value=str(tmp_path)):
            result = get_instance_id()
        assert result == "unknown"

    def test_with_env_var_missing_auth_token(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Should return 'unknown' when lock file has no authToken."""
        monkeypatch.setenv("CLAUDE_CODE_SSE_PORT", "12345")
        lock_dir = tmp_path / ".claude" / "ide"
        lock_dir.mkdir(parents=True)
        lock_file = lock_dir / "12345.lock"
        lock_file.write_text(json.dumps({"otherField": "value"}))

        with patch("os.path.expanduser", return_value=str(tmp_path)):
            result = get_instance_id()

        assert result == "unknown"


class TestGetHistoryPath:
    """Tests for get_history_path()."""

    def test_returns_path_with_project_name(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Should return path that includes the project name as a .jsonl file."""
        with patch("os.path.expanduser", return_value=str(tmp_path)):
            result = get_history_path("my-project")

        assert result.name == "my-project.jsonl"

    def test_creates_parent_directory(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Should create the history directory if it does not exist."""
        with patch("os.path.expanduser", return_value=str(tmp_path)):
            result = get_history_path("test-proj")

        assert result.parent.exists()

    def test_path_is_under_claude_history(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Returned path should be inside ~/.claude/history/."""
        with patch("os.path.expanduser", return_value=str(tmp_path)):
            result = get_history_path("proj")

        assert result.parent.name == "history"


class TestLogValidationErrors:
    """Tests for log_validation_errors()."""

    def test_empty_list_prints_nothing(self, capsys: pytest.CaptureFixture) -> None:
        """Should print nothing to stderr when errors list is empty."""
        log_validation_errors([], "my-project")
        captured = capsys.readouterr()
        assert captured.err == ""

    def test_non_empty_list_prints_to_stderr(self, capsys: pytest.CaptureFixture) -> None:
        """Should print each error to stderr."""
        errors = ["Line 1: invalid JSON", "Line 3: missing 'type' field"]
        log_validation_errors(errors, "my-project")
        captured = capsys.readouterr()
        assert "Line 1: invalid JSON" in captured.err
        assert "Line 3: missing 'type' field" in captured.err

    def test_truncates_after_five_errors(self, capsys: pytest.CaptureFixture) -> None:
        """Should only print the first 5 errors."""
        errors = [f"Error {i}" for i in range(10)]
        log_validation_errors(errors, "my-project")
        captured = capsys.readouterr()
        assert "Error 4" in captured.err
        assert "Error 5" not in captured.err


class TestMainFunction:
    """Tests for main()."""

    def test_exits_zero_on_valid_input(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Should always exit 0."""
        monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps({})))

        history_path = tmp_path / "test.jsonl"
        with (
            patch("session_history_hook.get_session_id", return_value="abc12345"),
            patch("session_history_hook.get_project_name", return_value="test-project"),
            patch("session_history_hook.get_history_path", return_value=history_path),
            patch("session_history_hook.append_session_end"),
            patch("session_history_hook.validate_jsonl", return_value=(True, [])),
        ):
            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 0

    def test_exits_zero_on_invalid_json_input(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Should exit 0 even when stdin contains invalid JSON."""
        monkeypatch.setattr("sys.stdin", io.StringIO("not-json"))

        history_path = tmp_path / "test.jsonl"
        with (
            patch("session_history_hook.get_session_id", return_value="abc12345"),
            patch("session_history_hook.get_project_name", return_value="test-project"),
            patch("session_history_hook.get_history_path", return_value=history_path),
            patch("session_history_hook.append_session_end"),
            patch("session_history_hook.validate_jsonl", return_value=(True, [])),
        ):
            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 0
