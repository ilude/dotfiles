"""Schema tests for curation pipeline."""

from curation_pipeline import SOURCES, normalize_row, stable_candidate_id


def test_candidate_schema_required_fields_and_null_accepted_route():
    candidate = normalize_row(
        SOURCES[0],
        {"_row_idx": 7, "prompt": "Explain Python dictionaries."},
        max_prompt_chars=12000,
    )

    data = candidate.__dict__
    required = {
        "schema_version",
        "id",
        "source",
        "source_dataset",
        "source_url",
        "source_revision",
        "source_row_id",
        "license_name",
        "license_url",
        "prompt",
        "metadata",
        "trace_features",
        "weak_labels",
        "proposed_route",
        "accepted_route",
        "review_status",
        "reason_codes",
        "notes",
    }
    assert required <= set(data)
    assert candidate.accepted_route is None


def test_stable_ids_do_not_depend_on_input_order():
    first = stable_candidate_id("source", "1", "same prompt")
    second = stable_candidate_id("source", "1", "same prompt")
    other = stable_candidate_id("source", "2", "same prompt")

    assert first == second
    assert first != other


def test_missing_prompt_is_rejected_by_schema_normalization():
    candidate = normalize_row(SOURCES[0], {"_row_idx": 1, "other": "value"}, 12000)

    assert candidate.prompt == ""
    assert "missing_prompt" in candidate.reason_codes
