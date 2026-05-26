"""Evaluation tests for curation experiments."""

import curation_experiment as exp
import pytest


def test_weak_candidate_rows_preserve_weak_label_semantics():
    rows = [
        {
            "id": "row-1",
            "prompt": "Explain lists.",
            "accepted_route": None,
            "proposed_route": {"model_tier": "mini", "effort": "low"},
        }
    ]

    converted = exp.weak_candidate_rows(rows)

    assert converted == [
        {
            "prompt": "Explain lists.",
            "cheapest_acceptable_route": {"model_tier": "mini", "effort": "low"},
            "source_id": "row-1",
        }
    ]


def test_reviewed_candidate_rows_use_accepted_route_only():
    rows = [
        {
            "id": "row-1",
            "prompt": "Explain lists.",
            "review_decision": "accept",
            "accepted_route": {"model_tier": "mini", "effort": "none"},
            "proposed_route": {"model_tier": "large", "effort": "high"},
        },
        {
            "id": "row-2",
            "prompt": "Design auth.",
            "review_decision": "pending",
            "accepted_route": None,
            "proposed_route": {"model_tier": "large", "effort": "high"},
        },
    ]

    converted = exp.weak_candidate_rows(rows, reviewed_only=True)

    assert converted == [
        {
            "prompt": "Explain lists.",
            "cheapest_acceptable_route": {"model_tier": "mini", "effort": "none"},
            "source_id": "row-1",
        }
    ]


def test_weak_candidate_rows_fail_when_no_usable_candidates():
    with pytest.raises(RuntimeError, match="must not be empty"):
        exp.weak_candidate_rows(
            [{"id": "row-1", "prompt": "Explain lists.", "proposed_route": None}]
        )


def test_apply_gates_blocks_recall_and_cost_regressions():
    baseline = {
        "top1_accuracy": 0.90,
        "catastrophic_under_routing": 0,
        "over_routing_rate": 0.10,
        "per_tier_recall": {"mini": 0.90, "core": 0.90, "large": 0.90},
        "latency": {"mean_us": 100.0},
    }
    candidate = {
        "top1_accuracy": 0.90,
        "catastrophic_under_routing": 0,
        "over_routing_rate": 0.30,
        "per_tier_recall": {"mini": 0.90, "core": 0.70, "large": 0.90},
        "latency": {"mean_us": 200.0},
    }

    results, status = exp.apply_gates(
        baseline,
        candidate,
        {"thresholds": exp.DEFAULT_GATES},
    )

    assert status == "gate_failed"
    assert results["over_routing_rate"] is False
    assert results["per_tier_recall"]["core"] is False
    assert results["latency"] is False
