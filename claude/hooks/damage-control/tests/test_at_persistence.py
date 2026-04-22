"""Tests for the `at` persistence pattern.

The `at` command schedules future execution and is a persistence mechanism
(MITRE T1053). The pattern must fire on real invocations but NOT on the
English word "at" appearing inside search arguments, echoed strings, python
`-c` snippets, or comments embedded in bash commands.
"""

import re
from pathlib import Path

import pytest
import yaml

CONFIG_PATH = Path(__file__).parent.parent / "patterns.yaml"


@pytest.fixture(scope="module")
def at_pattern():
    """Isolate the `at` pattern entry from patterns.yaml."""
    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = yaml.safe_load(f)
    for item in config.get("bashToolPatterns", []):
        reason = item.get("reason", "")
        if "at command schedules future execution" in reason:
            return re.compile(item["pattern"], re.IGNORECASE)
    raise AssertionError("at-command pattern not found in patterns.yaml")


class TestAtTruePositives:
    """Real `at` invocations must still match."""

    @pytest.mark.parametrize(
        "command",
        [
            "at now + 1 minute",
            "at 10:30",
            "at -f script.sh noon",
            "sudo at midnight",
            "echo 'do stuff'; at noon",
            "true && at now",
        ],
    )
    def test_matches(self, at_pattern, command):
        assert at_pattern.search(command), f"Should match: {command!r}"


class TestAtFalsePositives:
    """Prose containing the word "at" inside bash commands must NOT match."""

    @pytest.mark.parametrize(
        "command",
        [
            'grep "look at this" file.py',
            'python -c "print(\'runs at noon\')"',
            'echo "# comment: meet at 3pm"',
            "rg 'arrived at destination' logs/",
            'git commit -m "fix bug at startup"',
            'printf "%s\\n" "pointer at end"',
        ],
    )
    def test_does_not_match(self, at_pattern, command):
        assert not at_pattern.search(command), f"False positive on: {command!r}"
