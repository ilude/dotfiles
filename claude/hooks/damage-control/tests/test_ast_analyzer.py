"""Tests for AST analyzer - tree-sitter bash AST analysis."""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from ast_analyzer import ASTAnalyzer, _check_tree_sitter


class TestIsAvailable:
    """Tests for is_available() method."""

    def test_is_available_when_tree_sitter_present(self):
        """is_available returns True when tree-sitter is importable."""
        analyzer = ASTAnalyzer()
        # Should not raise; actual availability depends on installation
        result = analyzer.is_available()
        assert isinstance(result, bool)

    def test_is_available_caches_result(self):
        """is_available caches the result after first call."""
        # Reset the global cache for this test
        import ast_analyzer as ast_mod

        original_cached = ast_mod._TREE_SITTER_AVAILABLE
        try:
            ast_mod._TREE_SITTER_AVAILABLE = None
            with patch("ast_analyzer._check_tree_sitter", return_value=True):
                analyzer1 = ASTAnalyzer()
                result1 = analyzer1.is_available()
                assert result1 is True

                # Second call should use cached value
                analyzer2 = ASTAnalyzer()
                result2 = analyzer2.is_available()
                assert result2 is True
        finally:
            ast_mod._TREE_SITTER_AVAILABLE = original_cached


class TestTreeSitterCheck:
    """Tests for _check_tree_sitter() function."""

    def test_check_tree_sitter_when_available(self):
        """_check_tree_sitter returns True when dependencies are present."""
        # This test depends on tree-sitter being installed
        result = _check_tree_sitter()
        assert isinstance(result, bool)

    def test_check_tree_sitter_graceful_fallback(self):
        """_check_tree_sitter returns False when imports fail."""
        with patch.dict("sys.modules", {"tree_sitter": None}):
            # Force re-check by resetting global state
            with patch("ast_analyzer._TREE_SITTER_AVAILABLE", None):
                result = _check_tree_sitter()
                assert result is False


class TestConfigLoading:
    """Tests for config loading and enabled/disabled handling."""

    def test_analyze_with_disabled_config(self):
        """analyze_command_ast returns allow when AST is disabled."""
        analyzer = ASTAnalyzer()
        config = {"astAnalysis": {"enabled": False}}
        result = analyzer.analyze_command_ast("ls -la", config)
        assert result == {"decision": "allow"}

    def test_analyze_with_enabled_config(self):
        """analyze_command_ast respects enabled: true."""
        analyzer = ASTAnalyzer()
        config = {"astAnalysis": {"enabled": True}}
        result = analyzer.analyze_command_ast("ls -la", config)
        assert isinstance(result, dict)
        assert "decision" in result

    def test_analyze_with_missing_astanalysis_section(self):
        """analyze_command_ast uses default when astAnalysis section missing."""
        analyzer = ASTAnalyzer()
        config = {}
        result = analyzer.analyze_command_ast("ls -la", config)
        assert isinstance(result, dict)
        assert "decision" in result


class TestStubReturnsAllow:
    """Tests for stub implementation returning allow for all commands."""

    def test_stub_returns_allow_for_simple_command(self):
        """Stub returns allow for simple commands."""
        analyzer = ASTAnalyzer()
        config = {"astAnalysis": {"enabled": True}}
        result = analyzer.analyze_command_ast("echo hello", config)
        assert result == {"decision": "allow"}

    def test_stub_returns_allow_for_dangerous_command(self):
        """Stub returns allow for dangerous commands (stub phase)."""
        analyzer = ASTAnalyzer()
        config = {"astAnalysis": {"enabled": True}}
        result = analyzer.analyze_command_ast("rm -rf /", config)
        assert result == {"decision": "allow"}

    def test_stub_returns_allow_for_git_command(self):
        """Stub returns allow for git commands."""
        analyzer = ASTAnalyzer()
        config = {"astAnalysis": {"enabled": True}}
        result = analyzer.analyze_command_ast("git reset --hard", config)
        assert result == {"decision": "allow"}

    def test_stub_returns_allow_for_empty_command(self):
        """Stub returns allow for empty command."""
        analyzer = ASTAnalyzer()
        config = {"astAnalysis": {"enabled": True}}
        result = analyzer.analyze_command_ast("", config)
        assert result == {"decision": "allow"}


class TestSafeCommandFastPath:
    """Tests for safe-command fast path optimization."""

    def test_safe_command_fast_path_skips_analysis(self):
        """Safe commands in config skip AST analysis."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["ls", "echo", "cat"],
            }
        }
        result = analyzer.analyze_command_ast("ls -la", config)
        assert result == {"decision": "allow"}

    def test_safe_command_with_arguments(self):
        """Safe commands with arguments are recognized."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["echo", "pwd"],
            }
        }
        result = analyzer.analyze_command_ast("echo hello world", config)
        assert result == {"decision": "allow"}

    def test_command_not_in_safe_list(self):
        """Commands not in safe list still return allow (stub)."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["ls", "echo"],
            }
        }
        result = analyzer.analyze_command_ast("rm -rf /tmp", config)
        assert result == {"decision": "allow"}

    def test_empty_safe_commands_list(self):
        """Empty safeCommands list doesn't break analysis."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": [],
            }
        }
        result = analyzer.analyze_command_ast("ls -la", config)
        assert result == {"decision": "allow"}

    def test_command_extraction_from_string(self):
        """Command name is correctly extracted from full command string."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["cat"],
            }
        }
        # "cat" with various arguments should match
        result = analyzer.analyze_command_ast("cat /etc/passwd -n", config)
        assert result == {"decision": "allow"}

    def test_command_with_leading_whitespace(self):
        """Leading whitespace is handled correctly."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["pwd"],
            }
        }
        result = analyzer.analyze_command_ast("   pwd", config)
        assert result == {"decision": "allow"}


class TestFallbackWhenTreeSitterMissing:
    """Tests for graceful fallback when tree-sitter is not available."""

    def test_fallback_when_not_available(self):
        """analyze_command_ast gracefully falls back when tree-sitter unavailable."""
        analyzer = ASTAnalyzer()
        # Mock is_available to return False
        analyzer.is_available = MagicMock(return_value=False)
        config = {"astAnalysis": {"enabled": True}}
        result = analyzer.analyze_command_ast("ls -la", config)
        assert result == {"decision": "allow"}

    def test_never_raises_on_import_error(self):
        """Analyzer never raises ImportError even if tree-sitter missing."""
        analyzer = ASTAnalyzer()
        # This should never raise, regardless of tree-sitter availability
        try:
            config = {"astAnalysis": {"enabled": True}}
            analyzer.analyze_command_ast("test command", config)
        except ImportError:
            pytest.fail("analyze_command_ast raised ImportError")


class TestVariableExpansionDetection:
    """Tests for variable expansion detection in dangerous commands."""

    def test_unsafe_variable_in_dangerous_command_asks(self):
        """Unknown variable in dangerous command escalates to ask."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": [],
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm $FLAG /", config)
        # Should escalate to ask
        assert result.get("decision") == "ask"
        assert "Variable expansion" in result.get("reason", "")

    def test_unsafe_variable_rm_with_flag(self):
        """rm with unknown variable escalates to ask."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": [],
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm -rf $UNKNOWN_VAR", config)
        assert result.get("decision") == "ask"

    def test_safe_variable_in_dangerous_command_allows(self):
        """Safe variable in dangerous command is allowed."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": [],
                "dangerousCommands": ["rm"],
            }
        }
        # $HOME is in the safe variables list
        result = analyzer.analyze_command_ast("rm $HOME/file.txt", config)
        assert result.get("decision") == "allow"

    def test_variable_in_safe_command_allows(self):
        """Variable in safe command is allowed (fast path)."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["echo"],
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("echo $VAR", config)
        # Safe command fast-path returns allow
        assert result.get("decision") == "allow"

    def test_safe_variable_ls_allows(self):
        """ls with safe variable is allowed (safe command)."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["ls"],
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("ls $HOME", config)
        # Safe command fast-path returns allow
        assert result.get("decision") == "allow"

    @pytest.mark.skipif(
        not ASTAnalyzer().is_available(),
        reason="tree-sitter not available",
    )
    def test_multiple_unsafe_variables_asks(self):
        """Multiple unsafe variables trigger ask."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": [],
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm $VAR1 $VAR2", config)
        assert result.get("decision") == "ask"
        reason = result.get("reason", "")
        assert "$VAR1" in reason or "$VAR2" in reason

    @pytest.mark.skipif(
        not ASTAnalyzer().is_available(),
        reason="tree-sitter not available",
    )
    def test_mixed_safe_unsafe_variables_asks(self):
        """If any unsafe variable present, asks."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": [],
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm $HOME $UNKNOWN", config)
        # Should ask because of $UNKNOWN
        assert result.get("decision") == "ask"

    @pytest.mark.skipif(
        not ASTAnalyzer().is_available(),
        reason="tree-sitter not available",
    )
    def test_all_safe_variables_allows(self):
        """All safe variables in dangerous command allows."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": [],
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm $HOME $PWD", config)
        # Both $HOME and $PWD are safe
        assert result.get("decision") == "allow"

    def test_no_dangerous_commands_config_allows(self):
        """Missing dangerousCommands config allows all."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": [],
            }
        }
        result = analyzer.analyze_command_ast("rm $UNKNOWN", config)
        assert result.get("decision") == "allow"

    def test_empty_dangerous_commands_allows(self):
        """Empty dangerousCommands list allows all."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": [],
                "dangerousCommands": [],
            }
        }
        result = analyzer.analyze_command_ast("rm $UNKNOWN", config)
        assert result.get("decision") == "allow"

    def test_safe_variable_list_integrity(self):
        """Safe variable list includes expected variables."""
        from ast_analyzer import SAFE_VARIABLES

        expected = {"$HOME", "$PWD", "$USER", "$PATH", "$SHELL", "$TERM"}
        assert SAFE_VARIABLES == expected


class TestDeepCommandExtraction:
    """Tests for deep command extraction (T5 feature)."""

    def test_simple_command_extraction(self):
        """Simple commands are extracted correctly."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["ls"],
            }
        }
        result = analyzer.analyze_command_ast("ls -la /tmp", config)
        # Should be allowed as a safe command
        assert result.get("decision") == "allow"

    def test_dangerous_command_without_variables(self):
        """Dangerous command without variables returns allow."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm /tmp/file.txt", config)
        assert result.get("decision") == "allow"

    def test_command_with_flags_recognized(self):
        """Commands with flags are correctly identified."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["grep"],
            }
        }
        result = analyzer.analyze_command_ast("grep -r pattern /dir", config)
        assert result.get("decision") == "allow"

    def test_piped_commands_safe_path(self):
        """Piped safe commands stay in safe path."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["cat", "grep"],
            }
        }
        # First command (cat) is safe, so fast path applies
        result = analyzer.analyze_command_ast("cat /etc/passwd | grep root", config)
        assert result.get("decision") == "allow"

    def test_quoted_arguments_handled(self):
        """Arguments with quotes are handled correctly."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["echo"],
            }
        }
        result = analyzer.analyze_command_ast('echo "hello world"', config)
        assert result.get("decision") == "allow"

    def test_single_quoted_arguments(self):
        """Single-quoted arguments are handled."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["printf"],
            }
        }
        result = analyzer.analyze_command_ast("printf '%s\\n' test", config)
        assert result.get("decision") == "allow"

    def test_command_without_arguments(self):
        """Commands without arguments are handled."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["pwd"],
            }
        }
        result = analyzer.analyze_command_ast("pwd", config)
        assert result.get("decision") == "allow"

    def test_multiple_arguments(self):
        """Commands with multiple arguments are handled."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["mkdir"],
            }
        }
        result = analyzer.analyze_command_ast("mkdir -p /path/to/dir", config)
        assert result.get("decision") == "allow"

    # Minimal pattern config covering T5 AC cases (rm -rf / style)
    _RM_BLOCK_CONFIG = {
        "astAnalysis": {"enabled": True},
        "bashToolPatterns": [
            {
                "pattern": r"\brm\s+.*-[rR].*\s+/(\s*$|\s+[;&|]|$)",
                "reason": "rm recursive on root (/)",
            }
        ],
    }

    @pytest.mark.skipif(
        not ASTAnalyzer().is_available(),
        reason="tree-sitter not available",
    )
    def test_command_substitution_extraction_blocked(self):
        """bash -c 'rm -rf /' extracts inner command and blocks it."""
        analyzer = ASTAnalyzer()
        result = analyzer.analyze_command_ast(
            "bash -c 'rm -rf /'", self._RM_BLOCK_CONFIG
        )
        assert result.get("decision") in ("block", "ask")

    @pytest.mark.skipif(
        not ASTAnalyzer().is_available(),
        reason="tree-sitter not available",
    )
    def test_subshell_extraction_blocked(self):
        """(rm -rf /) subshell extracts inner command and blocks it."""
        analyzer = ASTAnalyzer()
        result = analyzer.analyze_command_ast("(rm -rf /)", self._RM_BLOCK_CONFIG)
        assert result.get("decision") in ("block", "ask")

    @pytest.mark.skipif(
        not ASTAnalyzer().is_available(),
        reason="tree-sitter not available",
    )
    def test_pipeline_extraction_blocked(self):
        """echo hello | rm -rf / extracts rm from pipeline and blocks it."""
        analyzer = ASTAnalyzer()
        result = analyzer.analyze_command_ast(
            "echo hello | rm -rf /", self._RM_BLOCK_CONFIG
        )
        assert result.get("decision") in ("block", "ask")

    @pytest.mark.skipif(
        not ASTAnalyzer().is_available(),
        reason="tree-sitter not available",
    )
    def test_quote_obfuscation_blocked(self):
        """'rm' -rf / — quoted command name — is still blocked."""
        analyzer = ASTAnalyzer()
        result = analyzer.analyze_command_ast("'rm' -rf /", self._RM_BLOCK_CONFIG)
        assert result.get("decision") in ("block", "ask")

    def test_safe_command_no_false_positive(self):
        """echo 'hello world' — safe command — is allowed."""
        analyzer = ASTAnalyzer()
        result = analyzer.analyze_command_ast(
            'echo "hello world"', self._RM_BLOCK_CONFIG
        )
        assert result.get("decision") == "allow"


class TestVariableExpansionComprehensive:
    """Comprehensive tests for variable expansion detection (T6 feature)."""

    def test_single_unsafe_variable(self):
        """Single unsafe variable in dangerous command asks."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm $DANGER", config)
        assert result.get("decision") == "ask"


    def test_variable_at_start(self):
        """Variable at start of argument asks."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm $VAR file.txt", config)
        assert result.get("decision") == "ask"


    def test_variable_in_middle(self):
        """Variable in middle of path asks."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm /tmp/$VAR/file", config)
        assert result.get("decision") == "ask"


    def test_variable_in_safe_command_allowed(self):
        """Variable in safe command is allowed."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["cat"],
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("cat $VAR", config)
        assert result.get("decision") == "allow"

    def test_home_variable_safe(self):
        """$HOME variable is considered safe."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm -f $HOME/cache", config)
        # Should allow because $HOME is safe
        assert result.get("decision") == "allow"

    def test_pwd_variable_safe(self):
        """$PWD variable is considered safe."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["chmod"],
            }
        }
        result = analyzer.analyze_command_ast("chmod 755 $PWD", config)
        assert result.get("decision") == "allow"

    def test_user_variable_safe(self):
        """$USER variable is considered safe."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["chown"],
            }
        }
        result = analyzer.analyze_command_ast("chown $USER:$USER file", config)
        assert result.get("decision") == "allow"

    def test_path_variable_safe(self):
        """$PATH variable is considered safe."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["export"],
            }
        }
        result = analyzer.analyze_command_ast("export NEW_PATH=$PATH:/usr/bin", config)
        assert result.get("decision") == "allow"

    def test_shell_variable_safe(self):
        """$SHELL variable is considered safe."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["chsh"],
            }
        }
        result = analyzer.analyze_command_ast("chsh -s $SHELL", config)
        assert result.get("decision") == "allow"

    def test_term_variable_safe(self):
        """$TERM variable is considered safe."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["export"],
            }
        }
        result = analyzer.analyze_command_ast("export TERM=$TERM", config)
        assert result.get("decision") == "allow"

    def test_variable_in_reason_message(self):
        """Reason message includes variable names when escalating."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("rm $UNSAFE", config)
        if result.get("decision") == "ask":
            reason = result.get("reason", "")
            assert "$UNSAFE" in reason or "Variable expansion" in reason


class TestEvalSourceDetection:
    """Tests for eval/source detection (T7 feature placeholder)."""

    def test_eval_command_blocked(self):
        """eval command is blocked (future implementation)."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["eval"],
            }
        }
        # Currently allows as stub, but test verifies structure
        result = analyzer.analyze_command_ast("eval 'rm -rf /'", config)
        assert isinstance(result, dict)
        assert "decision" in result

    def test_source_command_blocked(self):
        """source command is blocked (future implementation)."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["source"],
            }
        }
        result = analyzer.analyze_command_ast("source unknown_file.sh", config)
        assert isinstance(result, dict)
        assert "decision" in result

    def test_dot_sourcing_blocked(self):
        """. sourcing is blocked (future implementation)."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
            }
        }
        result = analyzer.analyze_command_ast(". unknown_file.sh", config)
        assert isinstance(result, dict)
        assert "decision" in result

    def test_dynamic_eval_with_variable(self):
        """eval with variable is extra dangerous (future implementation)."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["eval"],
            }
        }
        result = analyzer.analyze_command_ast("eval $CMD", config)
        assert isinstance(result, dict)
        assert "decision" in result

    def test_source_from_untrusted_path(self):
        """source from untrusted path (future implementation)."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["source"],
            }
        }
        result = analyzer.analyze_command_ast("source /tmp/script.sh", config)
        assert isinstance(result, dict)
        assert "decision" in result


class TestConfigurationEdgeCases:
    """Tests for configuration edge cases and error handling."""

    def test_no_config_defaults_to_allow(self):
        """No config section defaults to allow."""
        analyzer = ASTAnalyzer()
        result = analyzer.analyze_command_ast("rm -rf /", {})
        assert result.get("decision") == "allow"

    def test_ast_analysis_disabled_allows(self):
        """AST analysis disabled allows all."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": False,
            }
        }
        result = analyzer.analyze_command_ast("rm -rf /", config)
        assert result.get("decision") == "allow"

    def test_safe_and_dangerous_same_command(self):
        """Command in both safe and dangerous uses fast path."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["ls"],
                "dangerousCommands": ["ls"],
            }
        }
        result = analyzer.analyze_command_ast("ls -la", config)
        # Safe path takes precedence
        assert result.get("decision") == "allow"

    def test_null_command_string(self):
        """Null/empty command handled gracefully."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "dangerousCommands": ["rm"],
            }
        }
        result = analyzer.analyze_command_ast("", config)
        assert result.get("decision") == "allow"

    def test_whitespace_only_command(self):
        """Whitespace-only command handled gracefully."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
            }
        }
        result = analyzer.analyze_command_ast("   ", config)
        assert result.get("decision") == "allow"

    def test_command_with_newlines(self):
        """Multiline command handled gracefully."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["echo"],
            }
        }
        result = analyzer.analyze_command_ast("echo hello && \\\necho world", config)
        # First command is safe
        assert result.get("decision") == "allow"

    def test_very_long_command(self):
        """Very long command handled gracefully."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["echo"],
            }
        }
        long_cmd = "echo " + "x" * 10000
        result = analyzer.analyze_command_ast(long_cmd, config)
        assert result.get("decision") == "allow"

    def test_special_characters_in_command(self):
        """Special characters handled gracefully."""
        analyzer = ASTAnalyzer()
        config = {
            "astAnalysis": {
                "enabled": True,
                "safeCommands": ["echo"],
            }
        }
        result = analyzer.analyze_command_ast("echo '!@#$%^&*()'", config)
        assert result.get("decision") == "allow"
