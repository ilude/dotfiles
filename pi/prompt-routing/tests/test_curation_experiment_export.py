"""Export tests for curation experiments."""

import argparse
import json
from pathlib import Path

import curation_experiment as exp


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True) + "\n")


def make_curation_run(root: Path) -> Path:
    curation_dir = root / "pi" / "prompt-routing" / "experiments" / "curation" / "run"
    curation_dir.mkdir(parents=True)
    rows = [
        {
            "id": "candidate-1",
            "source": "fixture",
            "source_row_id": "1",
            "prompt": "Explain a command.",
            "review_status": "auto_accept_candidate",
            "accepted_route": None,
            "proposed_route": {"model_tier": "mini", "effort": "low"},
            "reason_codes": ["candidate_export_auto_accept"],
            "trace_features": {"prompt_words": 3},
        },
        {
            "id": "review-1",
            "source": "fixture",
            "source_row_id": "2",
            "prompt": "Design a multi-region service.",
            "review_status": "needs_review",
            "accepted_route": None,
            "proposed_route": {"model_tier": "large", "effort": "high"},
            "reason_codes": ["ambiguity_or_under_routing_risk"],
            "trace_features": {"has_architecture_intent": True},
        },
    ]
    write_jsonl(curation_dir / "candidates.jsonl", rows)
    (curation_dir / "manifest.json").write_text(
        json.dumps({"counts_by_status": {"auto_accept_candidate": 1}}, sort_keys=True),
        encoding="utf-8",
    )
    return curation_dir


def test_export_separates_candidates_and_writes_prompt_safe_packet(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()
    monkeypatch.setattr(exp, "_REPO_ROOT", root)
    (root / ".gitignore").write_text(
        "pi/prompt-routing/experiments/retraining/**\n",
        encoding="utf-8",
    )
    curation_dir = make_curation_run(root)
    output_dir = root / "pi" / "prompt-routing" / "experiments" / "retraining" / "run"
    exp.init_gates(argparse.Namespace(output_dir=str(output_dir), fail_if_exists=True))

    exp.export_candidates(
        argparse.Namespace(curation_dir=str(curation_dir), output_dir=str(output_dir))
    )

    candidate = json.loads((output_dir / "candidates.jsonl").read_text().splitlines()[0])
    packet = (output_dir / "review_packet.md").read_text(encoding="utf-8")
    manifest = json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))

    assert candidate["accepted_route"] is None
    assert candidate["label_provenance"]["usable_for_quality_gates"] is False
    assert "Design a multi-region service" not in packet
    assert manifest["partitions"]["auto_accept_candidate"]["row_count"] == 1
    assert manifest["partitions"]["needs_review"]["row_count"] == 1
