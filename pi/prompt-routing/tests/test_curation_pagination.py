"""Pagination and batch-scoring tests for curation pipeline."""

import json

from curation_pipeline import SOURCES, pull_source, score_candidates, selected_sources


def test_pull_source_paginates_huggingface_rows(monkeypatch):
    seen_urls: list[str] = []

    def fake_read(url: str, timeout_seconds: int, max_bytes: int):
        del timeout_seconds, max_bytes
        seen_urls.append(url)
        if "offset=0" in url:
            start = 0
            count = 100
        elif "offset=100" in url:
            start = 100
            count = 50
        else:
            start = 150
            count = 0
        payload = {
            "rows": [
                {"row_idx": start + index, "row": {"prompt": f"prompt {start + index}"}}
                for index in range(count)
            ]
        }
        return json.dumps(payload).encode("utf-8"), 1

    monkeypatch.setattr("curation_pipeline.read_limited_url", fake_read)

    result = pull_source(SOURCES[0], limit_per_source=150, timeout_seconds=1, max_bytes=1000)

    assert result.skipped_reason is None
    assert len(result.rows) == 150
    assert "offset=0&length=100" in seen_urls[0]
    assert "offset=100&length=50" in seen_urls[1]


def test_selected_sources_filters_by_name():
    selected = selected_sources(["routellm_gpt4_dataset"])

    assert [source.name for source in selected] == ["routellm_gpt4_dataset"]


def test_score_candidates_loads_classifier_once(monkeypatch):
    from curation_pipeline import Candidate

    instances: list[object] = []

    class FakeClassifier:
        def __init__(self):
            instances.append(self)

        def predict_route(self, prompt: str):
            del prompt
            return {
                "primary": {"model_tier": "mini", "effort": "low"},
                "candidates": [],
                "confidence": 0.9,
                "ensemble_rule": "fixture",
            }

    monkeypatch.setattr("classifier_confgate.ConfGatedClassifier", FakeClassifier)

    candidates = [
        Candidate(
            schema_version="1.0.0",
            id=str(index),
            source="fixture",
            source_dataset="fixture",
            source_url="fixture",
            source_revision="main",
            source_row_id=str(index),
            license_name="apache-2.0",
            license_url="fixture",
            prompt=f"prompt {index}",
            metadata={},
            trace_features={},
            weak_labels=[],
            proposed_route=None,
            accepted_route=None,
            review_status="",
            reason_codes=[],
            notes=[],
        )
        for index in range(3)
    ]

    score_candidates(candidates, {"available": True})

    assert len(instances) == 1
    assert all(
        candidate.proposed_route == {"model_tier": "mini", "effort": "low"}
        for candidate in candidates
    )
