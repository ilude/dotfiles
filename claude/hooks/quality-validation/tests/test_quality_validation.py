"""Tests for quality validation hook."""

import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add parent directory to path so we can import the hook
sys.path.insert(0, str(Path(__file__).parent.parent))
import quality_validation_hook as hook


class TestLoadConfig:
    """Tests for load_config()."""

    def test_valid_yaml(self, tmp_path):
        config_content = "python:\n  extensions: ['.py']\n  markers: ['pyproject.toml']\n"
        config_file = tmp_path / "validators.yaml"
        config_file.write_text(config_content)
        with patch.object(hook, "CONFIG_FILE", config_file):
            result = hook.load_config()
        assert result is not None
        assert "python" in result
        assert result["python"]["extensions"] == [".py"]

    def test_malformed_yaml(self, tmp_path):
        config_file = tmp_path / "validators.yaml"
        config_file.write_text("invalid: yaml: [broken\n")
        with patch.object(hook, "CONFIG_FILE", config_file):
            result = hook.load_config()
        assert result is None

    def test_missing_file(self, tmp_path):
        config_file = tmp_path / "nonexistent.yaml"
        with patch.object(hook, "CONFIG_FILE", config_file):
            result = hook.load_config()
        assert result is None


class TestLoadSkipList:
    """Tests for load_skip_list()."""

    def test_with_entries(self, tmp_path):
        skip_file = tmp_path / "skip-validators.txt"
        skip_file.write_text("shellcheck\nruff-check\n")
        with patch.object(hook, "SKIP_FILE", skip_file):
            result = hook.load_skip_list()
        assert result == {"shellcheck", "ruff-check"}

    def test_with_comments_and_blanks(self, tmp_path):
        skip_file = tmp_path / "skip-validators.txt"
        skip_file.write_text("# comment\nshellcheck\n\n# another comment\n")
        with patch.object(hook, "SKIP_FILE", skip_file):
            result = hook.load_skip_list()
        assert result == {"shellcheck"}

    def test_missing_file(self, tmp_path):
        skip_file = tmp_path / "nonexistent.txt"
        with patch.object(hook, "SKIP_FILE", skip_file):
            result = hook.load_skip_list()
        assert result == set()


class TestNormalizePath:
    """Tests for normalize_path()."""

    def test_backslash_to_forward(self):
        result = hook.normalize_path("C:\\Users\\test\\file.py")
        assert "\\" not in result or os.name == "nt"

    def test_already_forward_slash(self):
        result = hook.normalize_path("/tmp/test/file.py")
        assert os.path.isabs(result)

    def test_spaces_in_path(self):
        result = hook.normalize_path("C:\\My Projects\\test file.py")
        assert os.path.isabs(result)


class TestFindProjectRoot:
    """Tests for find_project_root()."""

    def test_finds_marker_in_current_dir(self, tmp_path):
        (tmp_path / "pyproject.toml").write_text("[project]\n")
        result = hook.find_project_root(str(tmp_path), ["pyproject.toml"])
        assert result == str(tmp_path.resolve())

    def test_finds_marker_in_parent(self, tmp_path):
        (tmp_path / "pyproject.toml").write_text("[project]\n")
        sub_dir = tmp_path / "src" / "lib"
        sub_dir.mkdir(parents=True)
        result = hook.find_project_root(str(sub_dir), ["pyproject.toml"])
        assert result == str(tmp_path.resolve())

    def test_no_marker_found(self, tmp_path):
        sub_dir = tmp_path / "isolated"
        sub_dir.mkdir()
        result = hook.find_project_root(str(sub_dir), ["nonexistent.marker"])
        assert result is None

    def test_monorepo_finds_nearest(self, tmp_path):
        # Root has package.json, sub-package also has package.json
        (tmp_path / "package.json").write_text("{}\n")
        sub_pkg = tmp_path / "packages" / "sub"
        sub_pkg.mkdir(parents=True)
        (sub_pkg / "package.json").write_text("{}\n")
        result = hook.find_project_root(str(sub_pkg), ["package.json"])
        assert result == str(sub_pkg.resolve())


class TestMatchLanguage:
    """Tests for match_language()."""

    def test_python_with_marker(self, tmp_path):
        (tmp_path / "pyproject.toml").write_text("[project]\n")
        file_path = str(tmp_path / "test.py")
        config = {
            "python": {
                "extensions": [".py"],
                "markers": ["pyproject.toml"],
                "validators": [],
            }
        }
        result = hook.match_language(file_path, config)
        assert result is not None
        assert result[0] == "python"

    def test_python_without_marker(self, tmp_path):
        # No pyproject.toml exists
        file_path = str(tmp_path / "test.py")
        config = {
            "python": {
                "extensions": [".py"],
                "markers": ["pyproject.toml"],
                "validators": [],
            }
        }
        result = hook.match_language(file_path, config)
        assert result is None

    def test_unknown_extension(self, tmp_path):
        (tmp_path / "pyproject.toml").write_text("[project]\n")
        file_path = str(tmp_path / "test.xyz")
        config = {
            "python": {
                "extensions": [".py"],
                "markers": ["pyproject.toml"],
                "validators": [],
            }
        }
        result = hook.match_language(file_path, config)
        assert result is None

    def test_non_dict_config_entries_skipped(self, tmp_path):
        (tmp_path / "pyproject.toml").write_text("[project]\n")
        file_path = str(tmp_path / "test.py")
        config = {
            "version": "1.0",  # Non-dict entry should be skipped
            "python": {
                "extensions": [".py"],
                "markers": ["pyproject.toml"],
                "validators": [],
            }
        }
        result = hook.match_language(file_path, config)
        assert result is not None


class TestDetectPackageManager:
    """Tests for detect_package_manager()."""

    @patch("shutil.which")
    def test_winget(self, mock_which):
        mock_which.side_effect = lambda x: "/usr/bin/winget" if x == "winget" else None
        assert hook.detect_package_manager() == "winget"

    @patch("shutil.which")
    def test_brew(self, mock_which):
        mock_which.side_effect = lambda x: "/usr/local/bin/brew" if x == "brew" else None
        assert hook.detect_package_manager() == "brew"

    @patch("shutil.which")
    def test_apt(self, mock_which):
        mock_which.side_effect = lambda x: "/usr/bin/apt" if x == "apt" else None
        assert hook.detect_package_manager() == "apt"

    @patch("shutil.which")
    def test_none_available(self, mock_which):
        mock_which.return_value = None
        assert hook.detect_package_manager() is None


class TestGetInstallSuggestion:
    """Tests for get_install_suggestion()."""

    @patch("shutil.which")
    def test_platform_install(self, mock_which):
        mock_which.side_effect = lambda x: "/usr/bin/apt" if x == "apt" else None
        lang_config = {
            "install": {
                "apt": "sudo apt install shellcheck",
                "brew": "brew install shellcheck",
            }
        }
        result = hook.get_install_suggestion(lang_config, "shellcheck")
        assert result == "sudo apt install shellcheck"

    @patch("shutil.which")
    def test_fallback_to_pip(self, mock_which):
        mock_which.return_value = None
        lang_config = {
            "install": {
                "winget": None,
                "brew": None,
                "apt": None,
                "pip": "uv tool install ruff",
            }
        }
        result = hook.get_install_suggestion(lang_config, "ruff-check")
        assert result == "uv tool install ruff"

    def test_no_install_config(self):
        result = hook.get_install_suggestion({}, "ruff-check")
        assert result is None


class TestBuildCommand:
    """Tests for build_command()."""

    def test_replaces_file_placeholder(self):
        cmd = hook.build_command(["ruff", "check", "{file}"], "/tmp/test.py")
        assert cmd == ["ruff", "check", "/tmp/test.py"]

    def test_no_placeholder(self):
        cmd = hook.build_command(["ruff", "check", "."], "/tmp/test.py")
        assert cmd == ["ruff", "check", "."]

    def test_multiple_placeholders(self):
        cmd = hook.build_command(["{file}", "check", "{file}"], "/tmp/test.py")
        assert cmd == ["/tmp/test.py", "check", "/tmp/test.py"]

    def test_spaces_in_path(self):
        cmd = hook.build_command(["ruff", "check", "{file}"], "/tmp/my project/test.py")
        assert cmd == ["ruff", "check", "/tmp/my project/test.py"]


class TestRunValidator:
    """Tests for run_validator()."""

    @patch("subprocess.run")
    def test_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        returncode, output = hook.run_validator(["ruff", "check", "test.py"])
        assert returncode == 0

    @patch("subprocess.run")
    def test_failure_with_output(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="test.py:5: E401 unused import\n",
            stderr="",
        )
        returncode, output = hook.run_validator(["ruff", "check", "test.py"])
        assert returncode == 1
        assert "E401" in output

    @patch("subprocess.run")
    def test_timeout(self, mock_run):
        mock_run.side_effect = subprocess.TimeoutExpired(cmd=["ruff"], timeout=8)
        returncode, output = hook.run_validator(["ruff", "check", "test.py"])
        assert returncode == 1
        assert "timed out" in output

    @patch("subprocess.run")
    def test_command_not_found(self, mock_run):
        mock_run.side_effect = FileNotFoundError()
        returncode, output = hook.run_validator(["nonexistent", "check", "test.py"])
        assert returncode == -1
        assert "not found" in output.lower()

    @patch("subprocess.run")
    def test_combined_stdout_stderr(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="stdout output\n",
            stderr="stderr output\n",
        )
        returncode, output = hook.run_validator(["ruff", "check", "test.py"])
        assert "stdout output" in output
        assert "stderr output" in output


class TestMainFunction:
    """Tests for the main() entry point via stdin simulation."""

    def test_non_write_edit_tool_exits_silently(self):
        input_data = json.dumps({"tool_name": "Read", "tool_input": {"file_path": "/tmp/test.py"}})
        with patch("sys.stdin", MagicMock(read=MagicMock(return_value=input_data))):
            with patch("json.load", return_value={"tool_name": "Read", "tool_input": {"file_path": "/tmp/test.py"}}):
                with pytest.raises(SystemExit) as exc_info:
                    hook.main()
                assert exc_info.value.code == 0

    def test_empty_file_path_exits(self):
        with patch("json.load", return_value={"tool_name": "Write", "tool_input": {"file_path": ""}}):
            with pytest.raises(SystemExit) as exc_info:
                hook.main()
            assert exc_info.value.code == 0

    def test_bad_json_exits_silently(self):
        with patch("json.load", side_effect=json.JSONDecodeError("bad", "", 0)):
            with pytest.raises(SystemExit) as exc_info:
                hook.main()
            assert exc_info.value.code == 0

    def test_missing_file_exits(self):
        with patch("json.load", return_value={"tool_name": "Write", "tool_input": {"file_path": "/nonexistent/file.py"}}):
            with patch("os.path.isfile", return_value=False):
                with pytest.raises(SystemExit) as exc_info:
                    hook.main()
                assert exc_info.value.code == 0

    def test_block_output_format(self, tmp_path, capsys):
        # Create a project with marker and a Python file
        (tmp_path / "pyproject.toml").write_text("[project]\n")
        test_file = tmp_path / "bad.py"
        test_file.write_text("import os\n")

        config = {
            "python": {
                "extensions": [".py"],
                "markers": ["pyproject.toml"],
                "validators": [
                    {"name": "ruff-check", "command": ["ruff", "check", "{file}"], "check": "ruff"}
                ],
                "install": {},
            }
        }

        input_data = {"tool_name": "Write", "tool_input": {"file_path": str(test_file)}}

        with patch("json.load", return_value=input_data), \
             patch.object(hook, "load_config", return_value=config), \
             patch("shutil.which", return_value="/usr/bin/ruff"), \
             patch.object(hook, "run_validator", return_value=(1, "bad.py:1: E401 unused import")), \
             patch.object(hook, "load_skip_list", return_value=set()):
            with pytest.raises(SystemExit) as exc_info:
                hook.main()
            assert exc_info.value.code == 0

        captured = capsys.readouterr()
        output = json.loads(captured.out)
        assert output["decision"] == "block"
        assert "E401" in output["reason"]

    def test_skip_list_skips_validator(self, tmp_path, capsys):
        (tmp_path / "pyproject.toml").write_text("[project]\n")
        test_file = tmp_path / "test.py"
        test_file.write_text("x = 1\n")

        config = {
            "python": {
                "extensions": [".py"],
                "markers": ["pyproject.toml"],
                "validators": [
                    {"name": "ruff-check", "command": ["ruff", "check", "{file}"], "check": "ruff"}
                ],
                "install": {},
            }
        }

        input_data = {"tool_name": "Edit", "tool_input": {"file_path": str(test_file)}}

        with patch("json.load", return_value=input_data), \
             patch.object(hook, "load_config", return_value=config), \
             patch.object(hook, "load_skip_list", return_value={"ruff-check"}):
            with pytest.raises(SystemExit) as exc_info:
                hook.main()
            assert exc_info.value.code == 0

        captured = capsys.readouterr()
        assert captured.out == ""  # No output = no errors = silent pass
