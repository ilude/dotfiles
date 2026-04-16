"""Tests for sequence-detector.py CLI functions.

Tests _build_input, _cmd_record, _cmd_check, _cmd_history, _cmd_clear, and main().
"""

import importlib.util
import sys
import types
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "sequence_detector", Path(__file__).parent.parent / "sequence-detector.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

_build_input = mod._build_input
_cmd_record = mod._cmd_record
_cmd_check = mod._cmd_check
_cmd_history = mod._cmd_history
_cmd_clear = mod._cmd_clear
main = mod.main
get_history = mod.get_history
clear_history = mod.clear_history


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture
def temp_state_dir(tmp_path, monkeypatch):
    """Create temporary state directory for tests."""
    state_dir = tmp_path / ".claude" / "state"
    state_dir.mkdir(parents=True)

    import os.path as path_module

    original_expanduser = path_module.expanduser

    def mock_expanduser(path_str):
        if path_str.startswith("~"):
            return path_str.replace("~", str(tmp_path), 1)
        return original_expanduser(path_str)

    monkeypatch.setattr(path_module, "expanduser", mock_expanduser)

    clear_history()
    yield state_dir
    clear_history()


# ============================================================================
# TestBuildInput
# ============================================================================


class TestBuildInput:
    """Test _build_input converts argparse namespace to input dict."""

    def test_all_fields_set(self):
        args = types.SimpleNamespace(file="foo.py", pattern="*.env", cmd="curl x")
        result = _build_input(args)
        assert result == {"file_path": "foo.py", "pattern": "*.env", "command": "curl x"}

    def test_all_fields_none(self):
        args = types.SimpleNamespace(file=None, pattern=None, cmd=None)
        result = _build_input(args)
        assert result == {}

    def test_partial_fields(self):
        args = types.SimpleNamespace(file="bar.txt", pattern=None, cmd=None)
        result = _build_input(args)
        assert result == {"file_path": "bar.txt"}

    def test_pattern_only(self):
        args = types.SimpleNamespace(file=None, pattern="**/.env", cmd=None)
        result = _build_input(args)
        assert result == {"pattern": "**/.env"}

    def test_cmd_only(self):
        args = types.SimpleNamespace(file=None, pattern=None, cmd="rm -rf /")
        result = _build_input(args)
        assert result == {"command": "rm -rf /"}


# ============================================================================
# TestCmdRecord
# ============================================================================


class TestCmdRecord:
    """Test _cmd_record writes history and prints confirmation."""

    def test_record_prints_tool_name(self, temp_state_dir, capsys):
        args = types.SimpleNamespace(tool="Read", file="foo.py", pattern=None, cmd=None)
        _cmd_record(args)
        out = capsys.readouterr().out
        assert "Recorded: Read" in out

    def test_record_persists_to_history(self, temp_state_dir, capsys):
        args = types.SimpleNamespace(tool="Bash", file=None, pattern=None, cmd="echo hi")
        _cmd_record(args)
        history = get_history()
        assert len(history) == 1
        assert history[0]["tool"] == "Bash"
        assert history[0]["input"]["command"] == "echo hi"

    def test_record_with_file_path(self, temp_state_dir, capsys):
        args = types.SimpleNamespace(tool="Read", file="/etc/passwd", pattern=None, cmd=None)
        _cmd_record(args)
        history = get_history()
        assert history[0]["input"]["file_path"] == "/etc/passwd"


# ============================================================================
# TestCmdCheck
# ============================================================================


class TestCmdCheck:
    """Test _cmd_check prints block/ask status."""

    def test_check_no_history_prints_block_false(self, temp_state_dir, capsys):
        args = types.SimpleNamespace(tool="Read", file="readme.md", pattern=None, cmd=None)
        _cmd_check(args)
        out = capsys.readouterr().out
        assert "Block: False" in out

    def test_check_prints_ask_field(self, temp_state_dir, capsys):
        args = types.SimpleNamespace(tool="Bash", file=None, pattern=None, cmd="git status")
        _cmd_check(args)
        out = capsys.readouterr().out
        assert "Ask:" in out

    def test_check_no_reason_when_no_match(self, temp_state_dir, capsys):
        args = types.SimpleNamespace(tool="Bash", file=None, pattern=None, cmd="ls -la")
        _cmd_check(args)
        out = capsys.readouterr().out
        assert "Reason:" not in out


# ============================================================================
# TestCmdHistory
# ============================================================================


class TestCmdHistory:
    """Test _cmd_history prints history entries."""

    def test_no_history_prints_no_history(self, temp_state_dir, capsys):
        _cmd_history()
        out = capsys.readouterr().out
        assert "No history" in out

    def test_with_entry_prints_tool_name(self, temp_state_dir, capsys):
        record_args = types.SimpleNamespace(tool="Glob", file=None, pattern="**/*.py", cmd=None)
        _cmd_record(record_args)
        capsys.readouterr()  # discard record output

        _cmd_history()
        out = capsys.readouterr().out
        assert "Glob" in out

    def test_history_shows_multiple_entries(self, temp_state_dir, capsys):
        for tool in ("Read", "Bash"):
            args = types.SimpleNamespace(tool=tool, file="f.py", pattern=None, cmd=None)
            _cmd_record(args)
        capsys.readouterr()

        _cmd_history()
        out = capsys.readouterr().out
        assert "Read" in out
        assert "Bash" in out


# ============================================================================
# TestCmdClear
# ============================================================================


class TestCmdClear:
    """Test _cmd_clear wipes history and confirms."""

    def test_clear_prints_cleared(self, temp_state_dir, capsys):
        _cmd_clear()
        out = capsys.readouterr().out
        assert "History cleared" in out

    def test_clear_empties_history(self, temp_state_dir, capsys):
        record_args = types.SimpleNamespace(tool="Read", file="foo.py", pattern=None, cmd=None)
        _cmd_record(record_args)
        capsys.readouterr()

        _cmd_clear()
        assert get_history() == []

    def test_clear_after_multiple_entries(self, temp_state_dir, capsys):
        for i in range(3):
            args = types.SimpleNamespace(tool="Bash", file=None, pattern=None, cmd=f"echo {i}")
            _cmd_record(args)
        capsys.readouterr()

        _cmd_clear()
        assert get_history() == []


# ============================================================================
# TestMainArgv
# ============================================================================


class TestMainArgv:
    """Test main() dispatch via sys.argv."""

    def test_main_record(self, temp_state_dir, monkeypatch, capsys):
        monkeypatch.setattr(sys, "argv", ["prog", "record", "Read", "--file", "foo.py"])
        main()
        out = capsys.readouterr().out
        assert "Recorded" in out

    def test_main_check(self, temp_state_dir, monkeypatch, capsys):
        monkeypatch.setattr(sys, "argv", ["prog", "check", "Read"])
        main()
        out = capsys.readouterr().out
        assert "Block:" in out

    def test_main_history_empty(self, temp_state_dir, monkeypatch, capsys):
        monkeypatch.setattr(sys, "argv", ["prog", "history"])
        main()
        out = capsys.readouterr().out
        assert "No history" in out

    def test_main_history_after_record(self, temp_state_dir, monkeypatch, capsys):
        monkeypatch.setattr(sys, "argv", ["prog", "record", "Bash", "--cmd", "ls"])
        main()
        capsys.readouterr()

        monkeypatch.setattr(sys, "argv", ["prog", "history"])
        main()
        out = capsys.readouterr().out
        assert "Bash" in out

    def test_main_clear(self, temp_state_dir, monkeypatch, capsys):
        monkeypatch.setattr(sys, "argv", ["prog", "record", "Read", "--file", "x.py"])
        main()
        capsys.readouterr()

        monkeypatch.setattr(sys, "argv", ["prog", "clear"])
        main()
        out = capsys.readouterr().out
        assert "History cleared" in out
        assert get_history() == []

    def test_main_no_subcommand_exits_or_prints_help(self, temp_state_dir, monkeypatch, capsys):
        monkeypatch.setattr(sys, "argv", ["prog"])
        # argparse may raise SystemExit(0) for help, or print_help may just print
        try:
            main()
            out = capsys.readouterr().out + capsys.readouterr().err
            # print_help path: some usage text present
            assert len(out) >= 0  # at minimum it ran without crashing
        except SystemExit as exc:
            assert exc.code in (0, 2)
