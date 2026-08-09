"""Behavior tests for tooling that exercises the production Bash firewall."""

import importlib.util
from pathlib import Path

HOOK_DIR = Path(__file__).parent.parent


def load_module(name: str, filename: str):
    """Load a module whose filename contains dashes."""
    spec = importlib.util.spec_from_file_location(name, HOOK_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


benchmark = load_module("damage_control_benchmark", "benchmark.py")
test_runner = load_module("damage_control_test_runner", "test-damage-control.py")


def minimal_config():
    """Return a configuration with no YAML rules so semantic checks are isolated."""
    return {
        "bashToolPatterns": [],
        "zeroAccessPaths": [],
        "zeroAccessExclusions": [],
        "readOnlyPaths": [],
        "noDeletePaths": [],
    }


def test_benchmark_command_evaluator_includes_production_semantic_checks():
    blocked, ask, reason, pattern, unwrapped, semantic = benchmark.check_command(
        "git checkout -- .", minimal_config()
    )

    assert not blocked
    assert ask
    assert pattern == "semantic_git"
    assert semantic
    assert "discards" in reason
    assert not unwrapped


def test_interactive_bash_check_distinguishes_production_ask_decision():
    blocked, ask, reasons = test_runner.check_bash_command(
        'bash -c "git checkout -- ."', minimal_config()
    )

    assert not blocked
    assert ask
    assert len(reasons) == 1
    assert "discards" in reasons[0]


def test_interactive_cycle_reports_production_ask_decision(monkeypatch, capsys):
    monkeypatch.setattr("builtins.input", lambda _: "git checkout -- .")

    assert test_runner._run_one_test_cycle("Bash", minimal_config())

    output = capsys.readouterr().out
    assert "ASK" in output
    assert "discards" in output
    assert "BLOCKED" not in output
