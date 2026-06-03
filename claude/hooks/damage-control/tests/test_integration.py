#!/usr/bin/env python
# /// script
# requires-python = ">=3.8"
# dependencies = ["pytest"]
# ///
"""Test integration of git semantic analysis with check_command."""

# Import the hook module
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


@pytest.fixture
def minimal_config():
    """Minimal test configuration."""
    return {"bashToolPatterns": [], "zeroAccessPaths": [], "readOnlyPaths": [], "noDeletePaths": []}


@pytest.fixture
def full_config():
    """Load the real patterns.yaml config for integration testing."""
    bash_tool.load_config()
    return bash_tool.get_compiled_config()


class TestDockerRmIntegration:
    """Integration tests for Docker remove commands."""

    def test_docker_rm_force_named_containers_allowed(self, full_config):
        command = (
            "docker rm -f onramp-caddy onramp-joyride onramp-whoami "
            "onramp-infisical onramp-infisical-db onramp-infisical-redis "
            "2>/dev/null || true"
        )
        is_blocked, should_ask, reason, pattern, unwrapped, semantic = check_command(
            command, full_config
        )
        assert not is_blocked and not should_ask, reason

    def test_docker_rm_force_all_containers_still_asks(self, full_config):
        command = "docker rm -f $(docker ps -aq)"
        is_blocked, should_ask, reason, pattern, unwrapped, semantic = check_command(
            command, full_config
        )
        assert should_ask, "broad docker rm -f should still require confirmation"

    def test_plain_rm_force_still_asks(self, full_config):
        command = "rm -f build/output.log"
        is_blocked, should_ask, reason, pattern, unwrapped, semantic = check_command(
            command, full_config
        )
        assert should_ask, "plain rm -f should still require confirmation"


class TestGitSemanticIntegration:
    """Integration tests for git semantic analysis with check_command."""

    @pytest.mark.parametrize(
        "command,expected_dangerous,description",
        [
            # Git semantic analysis should catch these (blocked or ask)
            ("git checkout -- .", True, "Git semantic: checkout with --"),
            ("git push --force", True, "Git semantic: force push"),
            ("git reset --hard", True, "Git semantic: hard reset"),
            ("git clean -fd", True, "Git semantic: clean with flags"),
            # These should pass (allowed)
            ("git checkout -b feature", False, "Git semantic: safe checkout -b"),
            ("git push --force-with-lease", False, "Git semantic: safe force with lease"),
            ("git status", False, "Git semantic: safe status"),
            # Shell unwrapping + git semantic
            ('bash -c "git push --force"', True, "Unwrapped git force push"),
            ('sh -c "git reset --hard"', True, "Unwrapped git hard reset"),
        ],
    )
    def test_git_semantic_integration(
        self, minimal_config, command, expected_dangerous, description
    ):
        """Test that git semantic analysis integrates with check_command."""
        is_blocked, should_ask, reason, pattern, unwrapped, semantic = check_command(
            command, minimal_config
        )
        # Dangerous = blocked OR requires confirmation (ask)
        is_dangerous = is_blocked or should_ask
        assert is_dangerous == expected_dangerous, (
            f"{description}: expected dangerous={expected_dangerous}, "
            f"got blocked={is_blocked}, ask={should_ask}"
        )
