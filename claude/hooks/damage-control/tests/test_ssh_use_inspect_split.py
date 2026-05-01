#!/usr/bin/env python
# /// script
# requires-python = ">=3.8"
# dependencies = ["pytest"]
# ///
"""Tests for the SSH use vs inspect split.

Splits the previous catch-all SSH_SAFE_COMMANDS exemption into two tiers:

- USE commands (ssh -i, scp -i, sftp -i, GIT_SSH_COMMAND, ssh-keygen -l,
  ssh-keyscan): silently allowed against ssh-protected patterns
  (~/.ssh/, *.pem, *.ppk, *.p12, *.pfx). Key contents never reach the
  caller's context, so silent allow is appropriate.
- INSPECT commands (ls, stat, file): downgraded to ASK against
  ssh-protected patterns. Filenames/sizes/mtimes do leak into context,
  so a confirmation gate is appropriate.

Other zero-access patterns (.env, ~/.aws/, etc.) are unaffected: inspect
commands targeting them still block, exactly as before.
"""

import importlib.util
from pathlib import Path

import pytest

HOOK_DIR = Path(__file__).parent.parent


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, HOOK_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bash_tool = load_module("bash_tool", "bash-tool-damage-control.py")
check_command = bash_tool.check_command
preprocess_path_list = bash_tool.preprocess_path_list


@pytest.fixture
def cfg():
    """Config with the real protected globs Claude users care about."""
    compiled = dict(bash_tool.get_compiled_config())
    compiled["zeroAccessPaths_compiled"] = preprocess_path_list(
        ["~/.ssh/", "*.pem", "*.ppk", "*.p12", "*.pfx", ".env", "~/.aws/"]
    )
    return compiled


# ============================================================================
# USE commands - silent allow against ssh-protected patterns
# ============================================================================


class TestSshUseCommandsSilentAllow:
    """ssh|scp|sftp -i and friends should pass without ask or block."""

    @pytest.mark.parametrize(
        "command",
        [
            "ssh -i ./aws-key.pem ec2-user@1.2.3.4",
            "ssh -i /home/user/keys/aws-key.pem ec2-user@1.2.3.4",
            "scp -i ./aws-key.pem localfile user@1.2.3.4:/tmp/",
            "sftp -i ./aws-key.pem user@1.2.3.4",
            'GIT_SSH_COMMAND="ssh -i ./deploy.pem" git push',
            "ssh-keygen -l -f ./aws-key.pem",
            # PuTTY format
            "ssh -i ./aws-key.ppk user@host",
            # Within ~/.ssh/ (existing exemption preserved)
            "ssh -i ~/.ssh/id_ed25519 user@host",
            "ls ~/.ssh/  # already allowed but tested under inspect class for ask",
        ],
    )
    def test_use_command_against_ssh_pattern_not_blocked(self, cfg, command):
        if command.endswith("# already allowed but tested under inspect class for ask"):
            pytest.skip("Covered by inspect-ask tests")
        blocked, ask, reason, *_ = check_command(command, cfg)
        assert not blocked, f"USE command should not block: {command!r} got: {reason}"

    @pytest.mark.parametrize(
        "command",
        [
            "ssh -i ./aws-key.pem ec2-user@1.2.3.4",
            "scp -i ./aws-key.pem localfile user@1.2.3.4:/tmp/",
            "ssh -i ~/.ssh/id_ed25519 user@host",
        ],
    )
    def test_use_command_against_ssh_pattern_silent_not_ask(self, cfg, command):
        blocked, ask, reason, *_ = check_command(command, cfg)
        assert not ask, f"USE command should be silent allow, not ask: {command!r}"

    def test_use_command_unwrapped_still_allowed(self, cfg):
        """bash -c '...ssh -i .pem...' should unwrap and still be allowed."""
        blocked, ask, reason, *_ = check_command(
            'bash -c "ssh -i ./aws-key.pem user@host"',
            cfg,
        )
        assert not blocked, f"unwrapped ssh -i .pem should be allowed: {reason}"


# ============================================================================
# INSPECT commands - downgraded to ask against ssh-protected patterns
# ============================================================================


class TestSshInspectCommandsAsk:
    """ls/stat/file targeting ssh-protected patterns must ask."""

    @pytest.mark.parametrize(
        "command",
        [
            "ls ~/.ssh/",
            "ls -la ~/.ssh/",
            "ls ~/.ssh/id_rsa",
            "stat ~/.ssh/id_rsa",
            "file ~/.ssh/id_rsa.pub",
            "ls ./aws-key.pem",
            "ls -l ./aws-key.pem",
            "stat ./aws-key.pem",
            "file ./aws-key.ppk",
        ],
    )
    def test_inspect_against_ssh_pattern_asks(self, cfg, command):
        blocked, ask, reason, *_ = check_command(command, cfg)
        assert not blocked, f"INSPECT should not block, should ask: {command!r}: {reason}"
        assert ask, f"INSPECT against ssh pattern should ask: {command!r}: {reason}"

    @pytest.mark.parametrize(
        "command",
        [
            # Non-ssh zero-access paths must still BLOCK on inspect, not ask
            "ls .env",
            "ls -la ~/.aws/",
            "stat .env",
            "file .env",
        ],
    )
    def test_inspect_against_non_ssh_zero_access_still_blocks(self, cfg, command):
        blocked, ask, reason, *_ = check_command(command, cfg)
        assert blocked, (
            f"INSPECT against non-ssh zero-access must still block: {command!r}: {reason}"
        )


# ============================================================================
# Content-leaking commands always blocked, even on ssh-protected patterns
# ============================================================================


class TestContentLeakStillBlocked:
    """cat/grep/cp/tar/base64 against pem/key files must still block."""

    @pytest.mark.parametrize(
        "command",
        [
            "cat ./aws-key.pem",
            "cat ~/.ssh/id_rsa",
            "grep -r BEGIN ./aws-key.pem",
            "cp ./aws-key.pem /tmp/stolen.pem",
            "cp ~/.ssh/id_rsa /tmp/stolen",
            "tar cf - ~/.ssh/",
            "base64 ./aws-key.pem",
            "base64 ~/.ssh/id_rsa",
        ],
    )
    def test_content_read_blocked(self, cfg, command):
        blocked, ask, reason, *_ = check_command(command, cfg)
        assert blocked, f"content-read should block: {command!r}: {reason}"


# ============================================================================
# Compound commands: stricter rule wins
# ============================================================================


class TestCompoundCommands:
    """Allowed USE chained with a blocked op must block on the whole command."""

    def test_use_then_cat_blocks(self, cfg):
        cmd = "ssh -i ./aws-key.pem user@host && cat ./aws-key.pem"
        blocked, ask, reason, *_ = check_command(cmd, cfg)
        assert blocked, f"compound with cat must block: {reason}"

    def test_use_then_aws_creds_blocks(self, cfg):
        cmd = "ssh -i ./aws-key.pem user@host && cat ~/.aws/credentials"
        blocked, ask, reason, *_ = check_command(cmd, cfg)
        assert blocked, f"compound touching ~/.aws/ must block: {reason}"
