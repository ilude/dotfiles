"""Triage rule tests for curation pipeline."""

from curation_pipeline import SOURCES, extract_features, normalize_row, triage_candidate


def make_candidate(prompt="What is DNS?", license_name="apache-2.0", confidence=0.9):
    candidate = normalize_row(SOURCES[0], {"_row_idx": 1, "prompt": prompt}, 12000)
    candidate.license_name = license_name
    candidate.trace_features = extract_features(candidate)
    candidate.weak_labels = [
        {
            "schema_version": "1.0.0",
            "classifier": "confgate",
            "interface": "classify.py --classifier confgate",
            "primary": {"model_tier": "core", "effort": "low"},
            "candidates": [],
            "confidence": confidence,
            "ensemble_rule": None,
            "router_metadata": {},
            "failure": None,
        }
    ]
    candidate.proposed_route = {"model_tier": "core", "effort": "low"}
    return candidate


def test_triage_reject_precedes_license_and_classifier():
    candidate = make_candidate(prompt="")
    candidate.license_name = "closed"
    candidate.weak_labels[0]["failure"] = "broken"

    triage_candidate(candidate)

    assert candidate.review_status == "reject"
    assert "missing_prompt" in candidate.reason_codes
    assert candidate.accepted_route is None


def test_triage_unknown_license_rejects():
    candidate = make_candidate(license_name="closed")

    triage_candidate(candidate)

    assert candidate.review_status == "reject"
    assert "incompatible_license" in candidate.reason_codes


def test_triage_classifier_failure_needs_review():
    candidate = make_candidate()
    candidate.weak_labels[0]["failure"] = "classifier unavailable"

    triage_candidate(candidate)

    assert candidate.review_status == "needs_review"
    assert "classifier_failure" in candidate.reason_codes


def test_triage_low_confidence_needs_review():
    candidate = make_candidate(confidence=0.2)

    triage_candidate(candidate)

    assert candidate.review_status == "needs_review"
    assert "low_confidence" in candidate.reason_codes


def test_triage_risky_features_needs_review():
    candidate = make_candidate(prompt="Debug this security authentication failure.")

    triage_candidate(candidate)

    assert candidate.review_status == "needs_review"
    assert "ambiguity_or_under_routing_risk" in candidate.reason_codes


def test_triage_auto_accept_or_holdout_has_one_status():
    candidate = make_candidate(prompt="What command lists files in bash?")

    triage_candidate(candidate)

    assert candidate.review_status in {"auto_accept_candidate", "holdout_candidate"}
    assert len(candidate.review_status.split()) == 1
    assert candidate.accepted_route is None
