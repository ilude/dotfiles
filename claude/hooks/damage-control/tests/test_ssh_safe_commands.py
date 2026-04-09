#!/usr/bin/env python
# /// script
# requires-python = ">=3.8"
# dependencies = ["pytest"]
# ///
"""Tests for SSH safe command detection.

Verifies that commands like ssh -i, scp -i, sftp -i, and ls that reference
~/.ssh/ paths are allowed through zero-access checks, while commands that
would expose key contents (cat, grep) remain blocked.
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
is_ssh_safe_command = bash_tool.is_ssh_safe_command
_is_ssh_dir_path = bash_tool._is_ssh_dir_path


# ============================================================================
# Unit tests for is_ssh_safe_command
# ============================================================================


class TestIsSSHSafeCommand:
    """Unit tests for the SSH safe command detector."""

    @pytest.mark.parametrize(
        "command",
        [
            'ssh -i ~/.ssh/eagletg etgdev@10.0.65.36 "docker inspect onboard"',
            "ssh -i ~/.ssh/id_ed25519 user@host",
            "scp -i ~/.ssh/mykey file.txt user@host:/tmp/",
            "sftp -i ~/.ssh/deploy user@host",
            "ls ~/.ssh/",
            "ls -la ~/.ssh/",
            "stat ~/.ssh/id_rsa",
            "file ~/.ssh/id_rsa.pub",
            "ssh-keygen -l -f ~/.ssh/id_ed25519",
            "ssh-keyscan github.com",
            'GIT_SSH_COMMAND="ssh -i ~/.ssh/deploy" git push',
        ],
    )
    def test_safe_commands_detected(self, command):
        assert is_ssh_safe_command(command), f"Should detect as safe: {command}"

    @pytest.mark.parametrize(
        "command",
        [
            "cat ~/.ssh/id_rsa",
            "grep -r password ~/.ssh/",
            "cp ~/.ssh/id_rsa /tmp/stolen",
            "tar cf - ~/.ssh/",
            "base64 ~/.ssh/id_rsa",
        ],
    )
    def test_unsafe_commands_not_detected(self, command):
        assert not is_ssh_safe_command(command), f"Should NOT detect as safe: {command}"


# ============================================================================
# Unit tests for _is_ssh_dir_path
# ============================================================================


class TestIsSSHDirPath:
    """Unit tests for SSH directory path detection."""

    def test_tilde_ssh_slash(self):
        assert _is_ssh_dir_path({"original": "~/.ssh/"})

    def test_tilde_ssh_no_slash(self):
        assert _is_ssh_dir_path({"original": "~/.ssh"})

    def test_not_ssh(self):
        assert not _is_ssh_dir_path({"original": "~/.aws/"})

    def test_empty(self):
        assert not _is_ssh_dir_path({"original": ""})


# ============================================================================
# Integration tests: check_command with zero-access ~/.ssh/
# ============================================================================


class TestSSHZeroAccessBypass:
    """Integration tests verifying SSH commands bypass ~/.ssh/ zero-access."""

    @pytest.fixture
    def config_with_ssh_zero_access(self):
        """Config with ~/.ssh/ as zero-access and ~/.aws/ as zero-access."""
        compiled = dict(bash_tool.get_compiled_config())
        compiled["zeroAccessPaths_compiled"] = bash_tool.preprocess_path_list(
            ["~/.ssh/", "~/.aws/"]
        )
        return compiled

    def test_ssh_identity_allowed(self, config_with_ssh_zero_access):
        """ssh -i ~/.ssh/keyname should NOT be blocked."""
        cmd = (
            "ssh -i ~/.ssh/eagletg etgdev@10.0.65.36"
            ' "docker inspect onboard'
            " --format '{{json .Config.Labels}}'\""
        )
        blocked, ask, reason, *_ = check_command(cmd, config_with_ssh_zero_access)
        assert not blocked, f"ssh -i should be allowed, got blocked: {reason}"

    def test_scp_identity_allowed(self, config_with_ssh_zero_access):
        """scp -i ~/.ssh/keyname should NOT be blocked."""
        blocked, ask, reason, *_ = check_command(
            "scp -i ~/.ssh/deploy localfile.txt user@host:/tmp/",
            config_with_ssh_zero_access,
        )
        assert not blocked, f"scp -i should be allowed, got blocked: {reason}"

    def test_sftp_identity_allowed(self, config_with_ssh_zero_access):
        """sftp -i ~/.ssh/keyname should NOT be blocked."""
        blocked, ask, reason, *_ = check_command(
            "sftp -i ~/.ssh/deploy user@host",
            config_with_ssh_zero_access,
        )
        assert not blocked, f"sftp -i should be allowed, got blocked: {reason}"

    def test_ls_ssh_dir_allowed(self, config_with_ssh_zero_access):
        """ls ~/.ssh/ should NOT be blocked."""
        blocked, ask, reason, *_ = check_command(
            "ls -la ~/.ssh/",
            config_with_ssh_zero_access,
        )
        assert not blocked, f"ls ~/.ssh/ should be allowed, got blocked: {reason}"

    def test_ls_ssh_file_allowed(self, config_with_ssh_zero_access):
        """ls ~/.ssh/id_rsa should NOT be blocked."""
        blocked, ask, reason, *_ = check_command(
            "ls ~/.ssh/id_rsa",
            config_with_ssh_zero_access,
        )
        assert not blocked, f"ls ~/.ssh/id_rsa should be allowed, got blocked: {reason}"

    def test_ssh_keygen_fingerprint_allowed(self, config_with_ssh_zero_access):
        """ssh-keygen -l (fingerprint) should NOT be blocked."""
        blocked, ask, reason, *_ = check_command(
            "ssh-keygen -l -f ~/.ssh/id_ed25519",
            config_with_ssh_zero_access,
        )
        assert not blocked, f"ssh-keygen -l should be allowed, got blocked: {reason}"

    # ---- Commands that SHOULD still be blocked ----

    def test_cat_ssh_key_still_blocked(self, config_with_ssh_zero_access):
        """cat ~/.ssh/id_rsa should still be blocked."""
        blocked, ask, reason, *_ = check_command(
            "cat ~/.ssh/id_rsa",
            config_with_ssh_zero_access,
        )
        assert blocked, "cat on SSH key should still be blocked"

    def test_grep_ssh_dir_still_blocked(self, config_with_ssh_zero_access):
        """grep inside ~/.ssh/ should still be blocked (reads file contents)."""
        blocked, ask, reason, *_ = check_command(
            "grep password ~/.ssh/config",
            config_with_ssh_zero_access,
        )
        assert blocked, "grep on SSH config should still be blocked"

    def test_cp_ssh_key_still_blocked(self, config_with_ssh_zero_access):
        """cp from ~/.ssh/ should still be blocked."""
        blocked, ask, reason, *_ = check_command(
            "cp ~/.ssh/id_rsa /tmp/stolen",
            config_with_ssh_zero_access,
        )
        assert blocked, "cp of SSH key should still be blocked"

    def test_other_zero_access_still_blocked(self, config_with_ssh_zero_access):
        """ssh -i should NOT bypass other zero-access paths like ~/.aws/."""
        blocked, ask, reason, *_ = check_command(
            "cat ~/.aws/credentials",
            config_with_ssh_zero_access,
        )
        assert blocked, "~/.aws/ should still be blocked even with SSH bypass"

    def test_ssh_with_aws_path_still_blocked(self, config_with_ssh_zero_access):
        """SSH command referencing ~/.aws/ should still block on that path."""
        blocked, ask, reason, *_ = check_command(
            "ssh -i ~/.ssh/key user@host && cat ~/.aws/credentials",
            config_with_ssh_zero_access,
        )
        assert blocked, "~/.aws/ in compound command should still be blocked"
