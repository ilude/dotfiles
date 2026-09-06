from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from shell_argv import normalize_shell_argv


def test_strips_environment_assignments() -> None:
    assert normalize_shell_argv(["DEBUG=1", "python", "script.py"]) == [
        "python",
        "script.py",
    ]


def test_strips_set_and_cd_preambles() -> None:
    assert normalize_shell_argv(
        ["set", "-euo", "pipefail;", "cd", "repo", "&&", "git", "status"]
    ) == ["git", "status"]


def test_classifies_last_and_segment() -> None:
    assert normalize_shell_argv(["echo", "ready", "&&", "pnpm", "test"]) == [
        "pnpm",
        "test",
    ]


def test_classifies_final_pipeline_stage() -> None:
    assert normalize_shell_argv(["git", "status", "|", "head", "-20"]) == [
        "head",
        "-20",
    ]


def test_handles_attached_operators() -> None:
    assert normalize_shell_argv(["cd", "repo&&env", "DEBUG=1", "python", "x.py"]) == [
        "python",
        "x.py",
    ]
