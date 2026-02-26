#!/usr/bin/env python
# /// script
# requires-python = ">=3.8"
# dependencies = ["pytest"]
# ///
"""Tests for read-only search pipeline detection.

Verifies that search commands (grep, rg, ag, etc.) with dangerous-looking
strings in their search arguments do NOT trigger bashToolPatterns, while
actual dangerous commands chained after search commands still get caught.
"""

import importlib.util
from pathlib import Path

import pytest

HOOK_DIR = Path(__file__).parent.parent


def load_module(name: str, filename: str):
    """Load a module with dashes in its filename."""
    spec = importlib.util.spec_from_file_location(name, HOOK_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bash_tool = load_module("bash_tool", "bash-tool-damage-control.py")
check_command = bash_tool.check_command
is_readonly_search_command = bash_tool.is_readonly_search_command
_split_on_shell_operators = bash_tool._split_on_shell_operators
_split_pipe_chain = bash_tool._split_pipe_chain
_is_readonly_search_pipeline = bash_tool._is_readonly_search_pipeline


@pytest.fixture
def full_config():
    """Load the real patterns.yaml config for integration testing."""
    config = bash_tool.load_config()
    return bash_tool.get_compiled_config()


# ============================================================================
# Unit tests for helper functions
# ============================================================================


class TestSplitOnShellOperators:
    """Test _split_on_shell_operators."""

    def test_single_command(self):
        assert _split_on_shell_operators("grep foo bar") == ["grep foo bar"]

    def test_ampersand_chain(self):
        assert _split_on_shell_operators("cmd1 && cmd2") == ["cmd1", "cmd2"]

    def test_semicolon_chain(self):
        assert _split_on_shell_operators("cmd1; cmd2") == ["cmd1", "cmd2"]

    def test_or_chain(self):
        assert _split_on_shell_operators("cmd1 || cmd2") == ["cmd1", "cmd2"]

    def test_mixed_operators(self):
        result = _split_on_shell_operators("cmd1 && cmd2; cmd3 || cmd4")
        assert result == ["cmd1", "cmd2", "cmd3", "cmd4"]

    def test_operators_inside_double_quotes(self):
        result = _split_on_shell_operators('grep "foo && bar" file')
        assert result == ['grep "foo && bar" file']

    def test_operators_inside_single_quotes(self):
        result = _split_on_shell_operators("grep 'foo && bar' file")
        assert result == ["grep 'foo && bar' file"]

    def test_pipe_preserved_in_segment(self):
        result = _split_on_shell_operators("grep foo | head -5")
        assert result == ["grep foo | head -5"]

    def test_pipe_and_ampersand(self):
        result = _split_on_shell_operators("grep foo | head && rm -rf /")
        assert result == ["grep foo | head", "rm -rf /"]


class TestSplitPipeChain:
    """Test _split_pipe_chain."""

    def test_no_pipe(self):
        assert _split_pipe_chain("grep foo bar") == ["grep foo bar"]

    def test_single_pipe(self):
        assert _split_pipe_chain("grep foo | head") == ["grep foo", "head"]

    def test_multiple_pipes(self):
        result = _split_pipe_chain("grep foo | sort | uniq | head")
        assert result == ["grep foo", "sort", "uniq", "head"]

    def test_pipe_inside_quotes(self):
        result = _split_pipe_chain('grep "foo|bar" file')
        assert result == ['grep "foo|bar" file']


class TestIsReadonlySearchPipeline:
    """Test _is_readonly_search_pipeline."""

    def test_simple_grep(self):
        assert _is_readonly_search_pipeline("grep foo bar") is True

    def test_grep_piped_to_head(self):
        assert _is_readonly_search_pipeline("grep foo bar | head -20") is True

    def test_grep_piped_to_sort_head(self):
        assert _is_readonly_search_pipeline("grep foo | sort | head") is True

    def test_rg_search(self):
        assert _is_readonly_search_pipeline("rg 'pattern' .") is True

    def test_ag_search(self):
        assert _is_readonly_search_pipeline("ag 'pattern' src/") is True

    def test_git_grep(self):
        assert _is_readonly_search_pipeline("git grep 'pattern'") is True

    def test_git_log(self):
        assert _is_readonly_search_pipeline("git log --grep='pattern'") is True

    def test_git_diff(self):
        assert _is_readonly_search_pipeline("git diff HEAD~1") is True

    def test_grep_piped_to_unsafe_target(self):
        assert _is_readonly_search_pipeline("grep foo | xargs rm") is False

    def test_grep_piped_to_bash(self):
        assert _is_readonly_search_pipeline("grep foo | bash") is False

    def test_not_a_search_command(self):
        assert _is_readonly_search_pipeline("helm upgrade release") is False

    def test_rm_command(self):
        assert _is_readonly_search_pipeline("rm -rf /tmp") is False

    def test_empty_string(self):
        assert _is_readonly_search_pipeline("") is False


class TestIsReadonlySearchCommand:
    """Test is_readonly_search_command (full command with operators)."""

    def test_simple_grep(self):
        assert is_readonly_search_command("grep foo bar") is True

    def test_grep_pipe_head(self):
        assert is_readonly_search_command("grep foo | head -20") is True

    def test_grep_then_dangerous_ampersand(self):
        assert is_readonly_search_command("grep foo && rm -rf /") is False

    def test_grep_then_dangerous_semicolon(self):
        assert is_readonly_search_command("grep foo; rm -rf /") is False

    def test_grep_then_dangerous_or(self):
        assert is_readonly_search_command("grep foo || rm -rf /") is False

    def test_all_segments_readonly(self):
        assert is_readonly_search_command("grep foo; rg bar") is True

    def test_grep_piped_to_unsafe(self):
        assert is_readonly_search_command("grep foo | xargs rm") is False

    def test_not_a_search_command(self):
        assert is_readonly_search_command("helm upgrade release") is False


# ============================================================================
# Integration tests with real patterns.yaml
# ============================================================================


class TestReadonlySearchFalsePositives:
    """Verify that search commands with dangerous-looking arguments are ALLOWED.

    These are the real-world false positives that triggered this fix.
    """

    @pytest.mark.parametrize(
        "command,description",
        [
            (
                'grep -r "helm-install\\|helm upgrade\\|CHART_VERSION" Makefile | head -20',
                "grep for helm upgrade in Makefile piped to head",
            ),
            (
                'grep -rn "helm-install\\|helmInstall\\|helm upgrade" Makefile | head -10',
                "grep -rn for helm upgrade in Makefile piped to head",
            ),
            (
                'rg "terraform destroy" .',
                "rg searching for terraform destroy",
            ),
            (
                'rg "terraform destroy" . | sort | head',
                "rg for terraform destroy piped to sort and head",
            ),
            (
                'git grep "rm -rf" -- "*.sh"',
                "git grep for rm -rf in shell scripts",
            ),
            (
                'ag "DROP TABLE" sql/',
                "ag searching for DROP TABLE in sql directory",
            ),
            (
                'grep -r "aws s3 rm" scripts/',
                "grep for aws s3 rm in scripts",
            ),
            (
                'grep "kubectl delete" deployment.yaml',
                "grep for kubectl delete in yaml",
            ),
            (
                'egrep "helm (upgrade|install|uninstall)" Makefile',
                "egrep for helm subcommands in Makefile",
            ),
            (
                'git log --grep="force push"',
                "git log searching for force push commits",
            ),
            (
                'git diff HEAD -- Makefile | grep "helm upgrade"',
                "git diff piped to grep for helm upgrade",
            ),
            (
                'grep -r "npm unpublish" . | wc -l',
                "grep for npm unpublish piped to wc",
            ),
        ],
    )
    def test_search_commands_not_blocked(self, full_config, command, description):
        """Search commands must NOT trigger bashToolPatterns."""
        blocked, ask, reason, pattern, _, _ = check_command(command, full_config)
        assert not blocked and not ask, (
            f"False positive: {description}\n"
            f"  command: {command}\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )


class TestDangerousCommandsStillCaught:
    """Verify that actual dangerous commands are still blocked/ask even when
    they appear alongside search commands.
    """

    @pytest.mark.parametrize(
        "command,description",
        [
            (
                "helm upgrade my-release chart/",
                "actual helm upgrade",
            ),
            (
                'grep "helm upgrade" && helm upgrade release',
                "grep then actual helm upgrade via &&",
            ),
            (
                'grep "helm upgrade" | xargs helm upgrade release',
                "grep piped to xargs running helm upgrade",
            ),
            (
                'grep "terraform" ; terraform destroy',
                "grep then terraform destroy via semicolon",
            ),
            (
                'grep "pattern" || helm uninstall release',
                "grep then helm uninstall via ||",
            ),
        ],
    )
    def test_dangerous_commands_caught(self, full_config, command, description):
        """Dangerous commands must still be blocked or require confirmation."""
        blocked, ask, reason, pattern, _, _ = check_command(command, full_config)
        assert blocked or ask, (
            f"Dangerous command not caught: {description}\n"
            f"  command: {command}\n"
            f"  blocked={blocked}, ask={ask}"
        )


# ============================================================================
# Single & (background operator) tests
# ============================================================================


class TestSingleAmpersandBackground:
    """Verify that single & (background) splits segments so dangerous
    commands after a search are still caught.
    """

    def test_split_single_ampersand(self):
        result = _split_on_shell_operators("grep foo & rm -rf /")
        assert result == ["grep foo", "rm -rf /"]

    def test_split_single_vs_double_ampersand(self):
        """Single & and && both split, but are distinct operators."""
        single = _split_on_shell_operators("cmd1 & cmd2")
        double = _split_on_shell_operators("cmd1 && cmd2")
        assert single == ["cmd1", "cmd2"]
        assert double == ["cmd1", "cmd2"]

    def test_single_ampersand_no_spaces(self):
        result = _split_on_shell_operators("grep foo&rm bar")
        assert result == ["grep foo", "rm bar"]

    def test_readonly_search_with_background_dangerous(self):
        """grep backgrounded before dangerous command must NOT be readonly."""
        assert is_readonly_search_command('grep "pattern" & rm -rf /') is False

    @pytest.mark.parametrize(
        "command,description",
        [
            (
                'grep "helm upgrade" & helm upgrade release',
                "grep backgrounded before helm upgrade",
            ),
            (
                'rg "pattern" & terraform destroy',
                "rg backgrounded before terraform destroy",
            ),
        ],
    )
    def test_background_dangerous_caught(self, full_config, command, description):
        """Dangerous commands after single & must still be caught."""
        blocked, ask, reason, pattern, _, _ = check_command(command, full_config)
        assert blocked or ask, (
            f"Dangerous command not caught: {description}\n"
            f"  command: {command}\n"
            f"  blocked={blocked}, ask={ask}"
        )


# ============================================================================
# Path checks NOT bypassed by read-only search
# ============================================================================


class TestPathChecksStillEnforced:
    """Verify that zeroAccessPaths, readOnlyPaths, and noDeletePaths are
    NOT skipped for read-only search commands. The readonly exemption
    only applies to bashToolPatterns.
    """

    @staticmethod
    def _make_config_with_zero_access(paths):
        """Build a compiled config with custom zeroAccessPaths (list of strings)."""
        compiled = bash_tool.get_compiled_config()
        # Override zeroAccessPaths with our test paths
        compiled["zeroAccessPaths_compiled"] = bash_tool.preprocess_path_list(paths)
        return compiled

    def test_grep_on_zero_access_path_blocked(self):
        """grep reading a zero-access file must still be blocked."""
        config = self._make_config_with_zero_access(
            ["/secrets/credentials.json"]
        )
        blocked, ask, reason, pattern, _, _ = check_command(
            "grep password /secrets/credentials.json", config
        )
        assert blocked, (
            f"grep on zero-access path should be blocked: reason={reason}"
        )

    def test_grep_pipe_head_on_zero_access_blocked(self):
        """grep piped to head on a zero-access file must still be blocked."""
        config = self._make_config_with_zero_access(
            ["/secrets/api-keys.env"]
        )
        blocked, ask, reason, pattern, _, _ = check_command(
            "grep API_KEY /secrets/api-keys.env | head -5", config
        )
        assert blocked, (
            f"grep|head on zero-access path should be blocked: reason={reason}"
        )

    def test_rg_on_zero_access_dir_blocked(self):
        """rg searching inside a zero-access directory must still be blocked."""
        config = self._make_config_with_zero_access(
            ["/secrets/"]
        )
        blocked, ask, reason, pattern, _, _ = check_command(
            "rg pattern /secrets/", config
        )
        assert blocked, (
            f"rg on zero-access directory should be blocked: reason={reason}"
        )


# ============================================================================
# New pipe targets (jq, yq, bat)
# ============================================================================


class TestNewPipeTargets:
    """Verify newly added pipe targets are recognized as safe."""

    @pytest.mark.parametrize(
        "command",
        [
            'grep "pattern" file.json | jq .field',
            'rg "key:" config.yaml | yq .metadata',
            'git log --oneline | bat --style=plain',
            'grep "error" log.json | jq -r .message | head',
        ],
    )
    def test_new_pipe_targets_allowed(self, full_config, command):
        """Search piped to jq/yq/bat must be allowed."""
        blocked, ask, reason, pattern, _, _ = check_command(command, full_config)
        assert not blocked and not ask, (
            f"False positive with new pipe target:\n"
            f"  command: {command}\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )

    def test_pipeline_detection_jq(self):
        assert _is_readonly_search_pipeline("grep pattern file | jq .") is True

    def test_pipeline_detection_yq(self):
        assert _is_readonly_search_pipeline("rg pattern . | yq .key") is True

    def test_pipeline_detection_bat(self):
        assert _is_readonly_search_pipeline("git diff HEAD | bat") is True


# ============================================================================
# Echo/printf display commands (never execute their arguments)
# ============================================================================


class TestEchoDisplayCommands:
    """Verify that echo/printf containing dangerous-looking strings are allowed.

    Real-world case: kubectl get ... ; echo "kubectl scale deployment ..."
    The echo is just displaying a string, not executing it.
    """

    def test_echo_with_kubectl_scale(self, full_config):
        """Exact false positive from production: echo showing a kubectl scale command."""
        cmd = 'echo "kubectl scale deployment cluster-autoscaler -n kube-system --replicas=0"'
        blocked, ask, reason, pattern, _, _ = check_command(cmd, full_config)
        assert not blocked and not ask, (
            f"False positive: echo with kubectl scale\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )

    def test_real_world_kubectl_get_then_echo(self, full_config):
        """Real-world command: kubectl get (safe) ; echo (display) ; echo (display)."""
        cmd = (
            "kubectl get deployment cluster-autoscaler -n kube-system "
            '-o jsonpath=\'{.metadata.name}\' 2>/dev/null; '
            'echo "---scale-replicas-command-would-be---"; '
            'echo "kubectl scale deployment cluster-autoscaler -n kube-system --replicas=0"'
        )
        blocked, ask, reason, pattern, _, _ = check_command(cmd, full_config)
        assert not blocked and not ask, (
            f"False positive: kubectl get + echo chain\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )

    @pytest.mark.parametrize(
        "command,description",
        [
            (
                'echo "helm upgrade my-release chart/"',
                "echo with helm upgrade",
            ),
            (
                'echo "terraform destroy -auto-approve"',
                "echo with terraform destroy",
            ),
            (
                'printf "Run: rm -rf /tmp/build\\n"',
                "printf with rm -rf",
            ),
            (
                'echo "DROP TABLE users;" | cat',
                "echo with SQL piped to cat",
            ),
            (
                'grep "pattern" file; echo "kubectl delete pod foo"',
                "grep then echo with kubectl delete",
            ),
        ],
    )
    def test_echo_printf_not_blocked(self, full_config, command, description):
        """Display commands must NOT trigger bashToolPatterns."""
        blocked, ask, reason, pattern, _, _ = check_command(command, full_config)
        assert not blocked and not ask, (
            f"False positive: {description}\n"
            f"  command: {command}\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )

    def test_pipeline_detection_echo(self):
        assert _is_readonly_search_pipeline('echo "helm upgrade"') is True

    def test_pipeline_detection_printf(self):
        assert _is_readonly_search_pipeline('printf "terraform destroy"') is True

    def test_echo_piped_to_head(self):
        assert _is_readonly_search_pipeline('echo "long output" | head') is True

    def test_echo_piped_to_unsafe(self):
        """echo piped to bash IS dangerous — the string gets executed."""
        assert _is_readonly_search_pipeline('echo "rm -rf /" | bash') is False

    def test_echo_then_dangerous_via_ampersand(self):
        """echo followed by actual dangerous command must be caught."""
        assert is_readonly_search_command('echo "safe" && rm -rf /') is False

    def test_echo_then_dangerous_caught(self, full_config):
        """echo chained with actual dangerous command must still be caught."""
        cmd = 'echo "deploying..." && helm upgrade release chart/'
        blocked, ask, reason, pattern, _, _ = check_command(cmd, full_config)
        assert blocked or ask, (
            f"Dangerous command not caught after echo\n"
            f"  command: {cmd}\n"
            f"  blocked={blocked}, ask={ask}"
        )


# ============================================================================
# Bash comment stripping
# ============================================================================


class TestBashCommentStripping:
    """Verify that bash comments (# ...) don't trigger pattern matching.

    Real-world case: multi-line command with comments mentioning 'helm upgrade'
    followed by a safe 'find' command.
    """

    def test_comment_with_helm_upgrade(self, full_config):
        """Comment mentioning helm upgrade must NOT trigger patterns."""
        cmd = '# during the Helm upgrade\nfind /path -name "*.tf" | head -20'
        blocked, ask, reason, pattern, _, _ = check_command(cmd, full_config)
        assert not blocked and not ask, (
            f"False positive: comment with helm upgrade\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )

    def test_real_world_comments_then_find(self, full_config):
        """Real-world: multi-line comments then find command."""
        cmd = (
            "# Health check: 30s interval * 3 threshold = 90s\n"
            '# The plan says "timeout: 120s" for NLB health checks\n'
            "# during the Helm upgrade (when old DaemonSet pods are terminated)\n"
            'find /path/terraform -name "*.tf" 2>/dev/null | head -20'
        )
        blocked, ask, reason, pattern, _, _ = check_command(cmd, full_config)
        assert not blocked and not ask, (
            f"False positive: comments + find command\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )

    def test_inline_comment_after_command(self, full_config):
        """Inline comment after a safe command must not trigger."""
        cmd = 'grep pattern file  # this searches for terraform destroy'
        blocked, ask, reason, pattern, _, _ = check_command(cmd, full_config)
        assert not blocked and not ask, (
            f"False positive: inline comment with dangerous text\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )

    def test_comment_only(self, full_config):
        """A command that is just a comment should be allowed."""
        cmd = "# helm upgrade release chart/"
        blocked, ask, reason, pattern, _, _ = check_command(cmd, full_config)
        assert not blocked and not ask, (
            f"False positive: pure comment\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )

    def test_dangerous_command_not_hidden_by_comment(self, full_config):
        """A real dangerous command on a separate line must still be caught."""
        cmd = "# this is a comment\nhelm upgrade release chart/"
        blocked, ask, reason, pattern, _, _ = check_command(cmd, full_config)
        assert blocked or ask, (
            f"Dangerous command hidden by comment\n"
            f"  blocked={blocked}, ask={ask}"
        )


# ============================================================================
# Find command (read-only search)
# ============================================================================


class TestFindCommand:
    """Verify that find (a read-only search tool) is recognized."""

    def test_find_pipe_head(self):
        assert _is_readonly_search_pipeline('find /path -name "*.tf" | head -20') is True

    def test_find_name_only(self):
        assert _is_readonly_search_pipeline('find . -name "*.py"') is True

    def test_find_type(self):
        assert _is_readonly_search_pipeline("find /var -type f | sort") is True

    def test_find_not_blocked(self, full_config):
        """find piped to head must be allowed."""
        cmd = 'find /path/terraform -name "*.tf" 2>/dev/null | head -20'
        blocked, ask, reason, pattern, _, _ = check_command(cmd, full_config)
        assert not blocked and not ask, (
            f"False positive: find piped to head\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )


# ============================================================================
# --dry-run exemption
# ============================================================================


class TestDryRunExemption:
    """Verify that --dry-run flag exempts commands from pattern matching.

    Commands like 'helm upgrade --dry-run' and 'kubectl apply --dry-run'
    are read-only simulation commands that should not trigger confirmation.
    """

    @pytest.mark.parametrize(
        "command,description",
        [
            (
                "helm upgrade gitlab gitlab/gitlab -f values.yaml --dry-run",
                "helm upgrade with --dry-run at end",
            ),
            (
                "helm upgrade gitlab gitlab/gitlab --dry-run -f values.yaml",
                "helm upgrade with --dry-run in middle",
            ),
            (
                "helm upgrade gitlab gitlab/gitlab -f values.yaml --dry-run 2>&1 | grep kind",
                "helm upgrade --dry-run piped to grep",
            ),
            (
                "helm install my-release chart/ --dry-run",
                "helm install with --dry-run",
            ),
            (
                "kubectl apply -f manifest.yaml --dry-run=client",
                "kubectl apply with --dry-run=client",
            ),
            (
                "kubectl apply -f manifest.yaml --dry-run=server",
                "kubectl apply with --dry-run=server",
            ),
            (
                "kubectl delete pod foo --dry-run=client",
                "kubectl delete with --dry-run=client",
            ),
        ],
    )
    def test_dry_run_allowed(self, full_config, command, description):
        """Commands with --dry-run must NOT trigger confirmation."""
        blocked, ask, reason, pattern, _, _ = check_command(command, full_config)
        assert not blocked and not ask, (
            f"False positive: {description}\n"
            f"  command: {command}\n"
            f"  blocked={blocked}, ask={ask}, reason={reason}"
        )

    @pytest.mark.parametrize(
        "command,description",
        [
            (
                "helm upgrade gitlab gitlab/gitlab -f values.yaml",
                "helm upgrade without --dry-run",
            ),
            (
                "helm install my-release chart/",
                "helm install without --dry-run",
            ),
            (
                "kubectl apply -f manifest.yaml",
                "kubectl apply without --dry-run",
            ),
            (
                "kubectl delete pod foo",
                "kubectl delete without --dry-run",
            ),
        ],
    )
    def test_real_commands_still_caught(self, full_config, command, description):
        """Commands WITHOUT --dry-run must still be caught."""
        blocked, ask, reason, pattern, _, _ = check_command(command, full_config)
        assert blocked or ask, (
            f"Dangerous command not caught: {description}\n"
            f"  command: {command}\n"
            f"  blocked={blocked}, ask={ask}"
        )

    @pytest.mark.parametrize(
        "command,description",
        [
            (
                "rm -rf / --dry-run",
                "rm does not support --dry-run",
            ),
            (
                "git push --force --dry-run",
                "git push --dry-run is valid but git is handled by semantic analysis",
            ),
            (
                "terraform apply --dry-run",
                "terraform does not support --dry-run (uses 'plan' instead)",
            ),
        ],
    )
    def test_dry_run_ignored_for_unsupported_tools(self, full_config, command, description):
        """--dry-run must NOT exempt tools that don't support it."""
        blocked, ask, reason, pattern, _, _ = check_command(command, full_config)
        assert blocked or ask, (
            f"Dangerous command bypassed via fake --dry-run: {description}\n"
            f"  command: {command}\n"
            f"  blocked={blocked}, ask={ask}"
        )
