"""Schema and output policy tests for curation experiments."""

from pathlib import Path

import curation_experiment as exp
import pytest


def test_default_gates_include_required_thresholds():
    required = {
        "top1_accuracy_min_delta",
        "catastrophic_under_routing_max_delta",
        "over_routing_rate_max_delta",
        "per_tier_recall_min_delta",
        "mean_latency_max_multiplier",
    }

    assert required <= set(exp.DEFAULT_GATES)


def test_safe_output_dir_rejects_path_escape():
    with pytest.raises(ValueError, match="must not contain"):
        exp.safe_output_dir("pi/prompt-routing/experiments/retraining/../escape")


def test_safe_output_dir_rejects_external_absolute_path(tmp_path):
    with pytest.raises(ValueError, match="must be under"):
        exp.safe_output_dir(str(tmp_path))


def test_safe_output_dir_rejects_non_empty_without_overwrite(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    retraining = root / "pi" / "prompt-routing" / "experiments" / "retraining"
    target = retraining / "run"
    target.mkdir(parents=True)
    (target / "file.txt").write_text("x", encoding="utf-8")
    monkeypatch.setattr(exp, "_REPO_ROOT", root)

    with pytest.raises(ValueError, match="not empty"):
        exp.safe_output_dir(
            "pi/prompt-routing/experiments/retraining/run",
            allow_existing=False,
        )


def test_apply_gates_blocks_safety_regression():
    baseline = {
        "top1_accuracy": 0.80,
        "catastrophic_under_routing": 0,
        "over_routing_rate": 0.10,
        "per_tier_recall": {"mini": 0.80, "core": 0.80, "large": 0.80},
        "latency": {"mean_us": 100.0},
    }
    candidate = {
        "top1_accuracy": 0.90,
        "catastrophic_under_routing": 1,
        "over_routing_rate": 0.10,
        "per_tier_recall": {"mini": 0.80, "core": 0.80, "large": 0.80},
        "latency": {"mean_us": 100.0},
    }

    results, status = exp.apply_gates(
        baseline,
        candidate,
        {"thresholds": exp.DEFAULT_GATES},
    )

    assert status == "gate_failed"
    assert results["catastrophic_under_routing"] is False


def test_require_gates_fails_before_evaluation(tmp_path):
    with pytest.raises(FileNotFoundError, match="gates.json"):
        exp.require_gates(Path(tmp_path))
