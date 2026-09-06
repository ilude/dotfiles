"""Promotion review workflow tests for curation experiments."""

import argparse
import json

import curation_experiment as exp


def test_prepare_promotion_review_preserves_provenance(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    source = root / "pi" / "prompt-routing" / "experiments" / "retraining" / "source"
    out = root / "pi" / "prompt-routing" / "experiments" / "retraining" / "review"
    source.mkdir(parents=True)
    monkeypatch.setattr(exp, "_REPO_ROOT", root)
    row = {
        "id": "row-1",
        "source": "routellm_gpt4_dataset",
        "source_dataset": "routellm/gpt4_dataset",
        "source_url": "https://example.invalid",
        "source_revision": "main",
        "source_row_id": "1",
        "license_name": "apache-2.0",
        "license_url": "https://example.invalid/license",
        "prompt": "Explain a command.",
        "proposed_route": {"model_tier": "mini", "effort": "low"},
    }
    exp.write_jsonl(source / "candidates.jsonl", [row])

    exp.prepare_promotion_review(
        argparse.Namespace(experiment_dir=str(source), output_dir=str(out))
    )

    review_row = json.loads((out / "promotion_review_queue.jsonl").read_text().strip())
    assert review_row["accepted_route"] is None
    assert review_row["review_decision"] == "pending"
    assert review_row["label_provenance"]["weak_label_is_ground_truth"] is False
    assert review_row["source_dataset"] == "routellm/gpt4_dataset"
    assert (out / "promotion_instructions.md").exists()
