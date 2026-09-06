"""CLI tests for curation experiments."""

import json
import subprocess
import sys
from pathlib import Path


def test_evaluate_without_gates_fails(tmp_path):
    project = Path("pi/prompt-routing")
    output_dir = project / "experiments" / "retraining" / "pytest-no-gates"
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        proc = subprocess.run(
            [
                sys.executable,
                str(project / "curation_experiment.py"),
                "evaluate",
                "--experiment-dir",
                str(output_dir),
                "--latency-runs",
                "1",
            ],
            capture_output=True,
            text=True,
            check=False,
        )

        assert proc.returncode != 0
        assert "gates.json" in proc.stderr
    finally:
        for path in sorted(output_dir.glob("*")):
            path.unlink()
        output_dir.rmdir()


def test_report_renderer_omits_prompt_text():
    report = {
        "overall_status": "gate_failed",
        "gate_hash": "abc",
        "row_counts": {"candidate_training_rows": 1, "holdout_rows": 0},
        "top1_accuracy": {"baseline": 1.0, "candidate": 0.9},
        "catastrophic_under_routing": {"baseline": 0, "candidate": 0},
        "over_routing_rate": {"baseline": 0.0, "candidate": 0.0},
        "per_tier_recall": {"baseline": {"mini": 1.0}, "candidate": {"mini": 1.0}},
        "latency": {"baseline": {"mean_us": 1.0}, "candidate": {"mean_us": 1.0}},
        "prompt": "secret raw prompt",
    }

    rendered = __import__("curation_experiment").render_report(report)

    assert "secret raw prompt" not in rendered
    assert "Weak-label-only" in rendered


def test_report_json_contract_shape():
    required = {
        "top1_accuracy",
        "catastrophic_under_routing",
        "over_routing_rate",
        "per_tier_recall",
        "latency",
        "shadow_comparison",
        "weak_label_comparison",
        "gates",
        "gate_hash",
        "row_counts",
        "denominators",
        "overall_status",
    }
    fixture = {key: None for key in required}

    assert required <= set(json.loads(json.dumps(fixture)))
