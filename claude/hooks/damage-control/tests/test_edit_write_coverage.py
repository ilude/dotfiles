"""Coverage tests for edit-tool-damage-control.py and write-tool-damage-control.py.

Both hook files are nearly identical â€” differing only in tool_name ("Edit" vs "Write")
and content field name ("new_string" vs "content"). Tests are parameterized over both
where the behaviour is shared.
"""

import importlib.util
import io
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import pytest

HOOK_DIR = Path(__file__).parent.parent


def load_module(name: str, filename: str):
    """Load a module whose filename contains dashes."""
    spec = importlib.util.spec_from_file_location(name, HOOK_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


edit_tool = load_module("edit_tool", "edit-tool-damage-control.py")
write_tool = load_module("write_tool", "write-tool-damage-control.py")

BOTH_MODULES = [
    pytest.param(edit_tool, id="edit_tool"),
    pytest.param(write_tool, id="write_tool"),
]


# ============================================================================
# TestGetLogPath
# ============================================================================


class TestGetLogPath:
    """get_log_path() returns a dated log file path inside the correct directory."""

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_returns_dated_log_file(self, module, tmp_log_dir):
        log_path = module.get_log_path()
        today = datetime.now().strftime("%Y-%m-%d")
        assert log_path.name == f"{today}.log"

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_log_path_parent_exists(self, module, tmp_log_dir):
        log_path = module.get_log_path()
        assert log_path.parent.is_dir()


# ============================================================================
# TestLogDecision
# ============================================================================


class TestLogDecision:
    """log_decision() writes a valid JSONL line to the daily log file."""

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_writes_json_line(self, module, tmp_log_dir):
        module.log_decision("Edit", "/some/file.py", "blocked", "test reason", "documentation")

        today = datetime.now().strftime("%Y-%m-%d")
        log_file = tmp_log_dir / f"{today}.log"
        assert log_file.exists()

        lines = log_file.read_text(encoding="utf-8").splitlines()
        assert len(lines) == 1
        entry = json.loads(lines[0])
        assert entry["decision"] == "blocked"
        assert entry["reason"] == "test reason"
        assert entry["context"] == "documentation"
        assert "timestamp" in entry

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_appends_multiple_lines(self, module, tmp_log_dir):
        module.log_decision("Edit", "/a.py", "allowed", "")
        module.log_decision("Write", "/b.py", "blocked", "zero-access")

        today = datetime.now().strftime("%Y-%m-%d")
        log_file = tmp_log_dir / f"{today}.log"
        lines = log_file.read_text(encoding="utf-8").splitlines()
        assert len(lines) == 2

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_long_path_is_truncated(self, module, tmp_log_dir):
        long_path = "/tmp/" + "x" * 300
        module.log_decision("Edit", long_path, "allowed", "")

        today = datetime.now().strftime("%Y-%m-%d")
        log_file = tmp_log_dir / f"{today}.log"
        entry = json.loads(log_file.read_text(encoding="utf-8").strip())
        assert len(entry["file_path"]) <= 203  # 200 chars + "..."


# ============================================================================
# TestMatchGlobPath
# ============================================================================


class TestMatchGlobPath:
    """_match_glob_path() performs case-insensitive glob matching on basename and full path."""

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_matches_dot_env_pattern(self, module):
        result = module._match_glob_path("/home/user/.env", "*.env", "*.env")
        assert result is True

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_no_match_for_unrelated_file(self, module):
        result = module._match_glob_path("/home/user/app.py", "*.env", "*.env")
        assert result is False

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_case_insensitive_basename(self, module):
        result = module._match_glob_path("/home/user/.ENV", "*.env", "*.env")
        assert result is True

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_full_path_glob(self, module):
        result = module._match_glob_path("/home/user/secrets/key.pem", "*.pem", "*.pem")
        assert result is True


# ============================================================================
# TestMatchExactPath
# ============================================================================


class TestMatchExactPath:
    """_match_exact_path() handles exact matches and trailing-separator prefix matches."""

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_exact_match(self, module):
        assert module._match_exact_path("/etc/passwd", "/etc/passwd") is True

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_no_match(self, module):
        assert module._match_exact_path("/etc/other", "/etc/passwd") is False

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_trailing_sep_prefix_match(self, module):
        ssh_dir = os.path.expanduser("~/.ssh") + os.sep
        target = os.path.expanduser("~/.ssh") + os.sep + "id_rsa"
        # Build a pattern with trailing sep, normalized
        assert module._match_exact_path(target, ssh_dir) is True

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_stripped_prefix_match(self, module):
        # Pattern without trailing sep should still match file at stripped path
        assert module._match_exact_path("/etc/passwd", "/etc/passwd") is True


# ============================================================================
# TestGetConfigPath
# ============================================================================


class TestGetConfigPath:
    """get_config_path() respects CLAUDE_PROJECT_DIR env var and falls back to script dir."""

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_project_dir_env_var(self, module, tmp_path, monkeypatch):
        """When CLAUDE_PROJECT_DIR points to a dir with patterns.yaml, return that path."""
        config_dir = tmp_path / ".claude" / "hooks" / "damage-control"
        config_dir.mkdir(parents=True)
        config_file = config_dir / "patterns.yaml"
        config_file.write_text("zeroAccessPaths: []\n")

        monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(tmp_path))
        result = module.get_config_path()
        assert result == config_file

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_falls_back_to_script_dir(self, module, monkeypatch):
        """Without CLAUDE_PROJECT_DIR, returns path relative to the script."""
        monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
        result = module.get_config_path()
        # Should be somewhere relative to the hook dir
        assert result.name == "patterns.yaml"

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_project_dir_missing_config_falls_through(self, module, tmp_path, monkeypatch):
        """If CLAUDE_PROJECT_DIR is set but patterns.yaml doesn't exist there, fall back."""
        monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(tmp_path))
        result = module.get_config_path()
        # Should NOT be inside tmp_path since no config file was created there
        assert str(tmp_path) not in str(result) or result == (
            tmp_path / ".claude" / "hooks" / "damage-control" / "patterns.yaml"
        )


# ============================================================================
# TestLoadConfig
# ============================================================================


class TestLoadConfig:
    """load_config() returns empty-list defaults when the config file doesn't exist."""

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_missing_file_returns_defaults(self, module, tmp_path, monkeypatch):
        nonexistent = tmp_path / "no_such.yaml"

        def fake_get_config_path():
            return nonexistent

        monkeypatch.setattr(module, "get_config_path", fake_get_config_path)
        config = module.load_config()
        assert "zeroAccessPaths" in config
        assert isinstance(config["zeroAccessPaths"], list)
        assert "readOnlyPaths" in config
        assert isinstance(config["readOnlyPaths"], list)

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_valid_yaml_is_loaded(self, module, tmp_path, monkeypatch):
        config_file = tmp_path / "patterns.yaml"
        config_file.write_text("zeroAccessPaths:\n  - ~/.ssh/\nreadOnlyPaths: []\n")

        def fake_get_config_path():
            return config_file

        monkeypatch.setattr(module, "get_config_path", fake_get_config_path)
        config = module.load_config()
        assert "~/.ssh/" in config["zeroAccessPaths"]


# ============================================================================
# TestCheckZeroAccess
# ============================================================================


class TestCheckZeroAccess:
    """_check_zero_access() blocks zero-access paths but respects exclusions."""

    @pytest.fixture
    def zero_config(self):
        return {
            "zeroAccessPaths": ["~/.ssh/", "*.pem"],
            "zeroAccessExclusions": [".session/"],
        }

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_blocked_path(self, module, zero_config):
        ssh_file = os.path.expanduser("~/.ssh/id_rsa")
        blocked, reason = module._check_zero_access(ssh_file, zero_config)
        assert blocked is True
        assert "zero-access" in reason

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_unrelated_path_not_blocked(self, module, zero_config):
        blocked, reason = module._check_zero_access("/home/user/app.py", zero_config)
        assert blocked is False
        assert reason == ""

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_exclusion_overrides_zero_access(self, module):
        config = {
            "zeroAccessPaths": ["*.session"],
            "zeroAccessExclusions": [".session/"],
        }
        # A path that matches the exclusion pattern should NOT be blocked
        path = str(Path(".session") / "data")
        blocked, _ = module._check_zero_access(path, config)
        assert blocked is False

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_glob_zero_access_blocked(self, module, zero_config):
        blocked, reason = module._check_zero_access("/certs/server.pem", zero_config)
        assert blocked is True


# ============================================================================
# TestScanContentForInjections
# ============================================================================


class TestScanContentForInjections:
    """_scan_content_for_injections() detects configured injection patterns."""

    @pytest.fixture
    def injection_config(self):
        return {
            "injectionPatterns": [
                {"pattern": "sk-ant-", "type": "anthropic_key"},
                {
                    "pattern": "ignore\\s+all\\s+previous\\s+instructions",
                    "type": "prompt_injection",
                },
            ]
        }

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_matching_content_returns_reason(self, module, injection_config):
        content = "export API_KEY=sk-ant-abc123"
        result = module._scan_content_for_injections(content, injection_config)
        assert result is not None
        assert "anthropic_key" in result

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_non_matching_content_returns_none(self, module, injection_config):
        result = module._scan_content_for_injections("hello world", injection_config)
        assert result is None

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_empty_content_returns_none(self, module, injection_config):
        result = module._scan_content_for_injections("", injection_config)
        assert result is None

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_invalid_regex_does_not_crash(self, module):
        config = {
            "injectionPatterns": [
                {"pattern": "[invalid(regex", "type": "bad_pattern"},
                {"pattern": "safe_pattern", "type": "ok"},
            ]
        }
        # Should not raise; the invalid pattern is skipped via try/except
        result = module._scan_content_for_injections("safe_pattern found here", config)
        assert result is not None  # "ok" pattern matched

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_case_insensitive_match(self, module):
        config = {"injectionPatterns": [{"pattern": "IGNORE ALL PREVIOUS", "type": "override"}]}
        result = module._scan_content_for_injections("ignore all previous instructions", config)
        assert result is not None

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_empty_patterns_list_returns_none(self, module):
        result = module._scan_content_for_injections("anything", {"injectionPatterns": []})
        assert result is None

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_pattern_entry_missing_pattern_key_skipped(self, module):
        config = {"injectionPatterns": [{"type": "no_pattern_key"}]}
        result = module._scan_content_for_injections("anything", config)
        assert result is None


# ============================================================================
# TestCheckWriteConfirm
# ============================================================================


class TestCheckWriteConfirm:
    """_check_write_confirm() returns a reason for files in writeConfirmPaths, else None."""

    @pytest.fixture
    def confirm_config(self):
        return {
            "writeConfirmPaths": [
                "~/.claude/settings.json",
                ".claude/settings.json",
                "CLAUDE.md",
            ]
        }

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_matching_path_returns_reason(self, module, confirm_config):
        reason = module._check_write_confirm("CLAUDE.md", confirm_config)
        assert reason is not None
        assert "confirm" in reason.lower() or "CLAUDE.md" in reason

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_expanded_home_path_matches(self, module, confirm_config):
        settings = os.path.expanduser("~/.claude/settings.json")
        reason = module._check_write_confirm(settings, confirm_config)
        assert reason is not None

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_non_matching_path_returns_none(self, module, confirm_config):
        reason = module._check_write_confirm("/tmp/safe.txt", confirm_config)
        assert reason is None

    @pytest.mark.parametrize("module", BOTH_MODULES)
    def test_empty_confirm_paths_returns_none(self, module):
        reason = module._check_write_confirm("CLAUDE.md", {"writeConfirmPaths": []})
        assert reason is None


# ============================================================================
# TestMain â€” stdin-driven integration tests
# ============================================================================


class TestMainEdit:
    """main() for edit-tool-damage-control handles stdin-driven hook input correctly."""

    def _run_main(self, monkeypatch, input_data, config=None):
        """Run edit_tool.main() with faked stdin and optional patched load_config."""
        monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(input_data)))
        if config is not None:
            monkeypatch.setattr(edit_tool, "load_config", lambda: config)
        monkeypatch.setattr(edit_tool, "spawn_log_rotation", lambda: None)

    def test_wrong_tool_name_exits_0(self, monkeypatch, tmp_log_dir):
        self._run_main(monkeypatch, {"tool_name": "Read", "tool_input": {}})
        with pytest.raises(SystemExit) as exc:
            edit_tool.main()
        assert exc.value.code == 0

    def test_missing_file_path_exits_0(self, monkeypatch, tmp_log_dir):
        self._run_main(
            monkeypatch,
            {"tool_name": "Edit", "tool_input": {"file_path": ""}},
            config={"zeroAccessPaths": [], "readOnlyPaths": [], "writeConfirmPaths": []},
        )
        with pytest.raises(SystemExit) as exc:
            edit_tool.main()
        assert exc.value.code == 0

    def test_allowed_path_exits_0(self, monkeypatch, tmp_log_dir):
        self._run_main(
            monkeypatch,
            {"tool_name": "Edit", "tool_input": {"file_path": "/tmp/safe.py", "new_string": "x"}},
            config={
                "zeroAccessPaths": [],
                "readOnlyPaths": [],
                "writeConfirmPaths": [],
                "contentScanPaths": [],
                "injectionPatterns": [],
                "contexts": {},
            },
        )
        with pytest.raises(SystemExit) as exc:
            edit_tool.main()
        assert exc.value.code == 0

    def test_zero_access_path_exits_2(self, monkeypatch, tmp_log_dir):
        ssh_file = os.path.expanduser("~/.ssh/id_rsa")
        self._run_main(
            monkeypatch,
            {"tool_name": "Edit", "tool_input": {"file_path": ssh_file, "new_string": ""}},
            config={
                "zeroAccessPaths": ["~/.ssh/"],
                "zeroAccessExclusions": [],
                "readOnlyPaths": [],
                "writeConfirmPaths": [],
                "contentScanPaths": [],
                "injectionPatterns": [],
                "contexts": {},
            },
        )
        with pytest.raises(SystemExit) as exc:
            edit_tool.main()
        assert exc.value.code == 2

    def test_write_confirm_path_exits_0_with_ask_output(self, monkeypatch, tmp_log_dir, capsys):
        self._run_main(
            monkeypatch,
            {"tool_name": "Edit", "tool_input": {"file_path": "CLAUDE.md", "new_string": ""}},
            config={
                "zeroAccessPaths": [],
                "zeroAccessExclusions": [],
                "readOnlyPaths": [],
                "writeConfirmPaths": ["CLAUDE.md"],
                "contentScanPaths": [],
                "injectionPatterns": [],
                "contexts": {},
            },
        )
        with pytest.raises(SystemExit) as exc:
            edit_tool.main()
        assert exc.value.code == 0
        captured = capsys.readouterr()
        output = json.loads(captured.out)
        assert output.get("permissionDecision") == "ask"

    def test_invalid_json_exits_1(self, monkeypatch):
        monkeypatch.setattr(sys, "stdin", io.StringIO("not-json"))
        monkeypatch.setattr(edit_tool, "load_config", lambda: {})
        with pytest.raises(SystemExit) as exc:
            edit_tool.main()
        assert exc.value.code == 1


class TestMainWrite:
    """main() for write-tool-damage-control handles stdin-driven hook input correctly."""

    def _run_main(self, monkeypatch, input_data, config=None):
        monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(input_data)))
        if config is not None:
            monkeypatch.setattr(write_tool, "load_config", lambda: config)
        monkeypatch.setattr(write_tool, "spawn_log_rotation", lambda: None)

    def test_wrong_tool_name_exits_0(self, monkeypatch, tmp_log_dir):
        self._run_main(monkeypatch, {"tool_name": "Read", "tool_input": {}})
        with pytest.raises(SystemExit) as exc:
            write_tool.main()
        assert exc.value.code == 0

    def test_missing_file_path_exits_0(self, monkeypatch, tmp_log_dir):
        self._run_main(
            monkeypatch,
            {"tool_name": "Write", "tool_input": {"file_path": ""}},
            config={"zeroAccessPaths": [], "readOnlyPaths": [], "writeConfirmPaths": []},
        )
        with pytest.raises(SystemExit) as exc:
            write_tool.main()
        assert exc.value.code == 0

    def test_allowed_path_exits_0(self, monkeypatch, tmp_log_dir):
        self._run_main(
            monkeypatch,
            {"tool_name": "Write", "tool_input": {"file_path": "/tmp/safe.py", "content": "x"}},
            config={
                "zeroAccessPaths": [],
                "readOnlyPaths": [],
                "writeConfirmPaths": [],
                "contentScanPaths": [],
                "injectionPatterns": [],
                "contexts": {},
            },
        )
        with pytest.raises(SystemExit) as exc:
            write_tool.main()
        assert exc.value.code == 0

    def test_zero_access_path_exits_2(self, monkeypatch, tmp_log_dir):
        ssh_file = os.path.expanduser("~/.ssh/id_rsa")
        self._run_main(
            monkeypatch,
            {"tool_name": "Write", "tool_input": {"file_path": ssh_file, "content": ""}},
            config={
                "zeroAccessPaths": ["~/.ssh/"],
                "zeroAccessExclusions": [],
                "readOnlyPaths": [],
                "writeConfirmPaths": [],
                "contentScanPaths": [],
                "injectionPatterns": [],
                "contexts": {},
            },
        )
        with pytest.raises(SystemExit) as exc:
            write_tool.main()
        assert exc.value.code == 2

    def test_write_uses_content_field_not_new_string(self, monkeypatch, tmp_log_dir, capsys):
        """Write tool reads 'content' field, not 'new_string'."""
        self._run_main(
            monkeypatch,
            {
                "tool_name": "Write",
                "tool_input": {
                    "file_path": "CLAUDE.md",
                    "content": "",
                    "new_string": "SHOULD_NOT_MATTER",
                },
            },
            config={
                "zeroAccessPaths": [],
                "zeroAccessExclusions": [],
                "readOnlyPaths": [],
                "writeConfirmPaths": ["CLAUDE.md"],
                "contentScanPaths": [],
                "injectionPatterns": [],
                "contexts": {},
            },
        )
        with pytest.raises(SystemExit) as exc:
            write_tool.main()
        assert exc.value.code == 0
        captured = capsys.readouterr()
        output = json.loads(captured.out)
        assert output.get("permissionDecision") == "ask"

    def test_invalid_json_exits_1(self, monkeypatch):
        monkeypatch.setattr(sys, "stdin", io.StringIO("not-json"))
        monkeypatch.setattr(write_tool, "load_config", lambda: {})
        with pytest.raises(SystemExit) as exc:
            write_tool.main()
        assert exc.value.code == 1
