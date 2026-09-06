"""Source normalizer tests for curation pipeline."""

from curation_pipeline import SOURCES, fixture_pull_results, normalize_results, pull_source


def test_three_fixture_source_shapes_normalize():
    results = fixture_pull_results(limit_per_source=2)
    candidates = normalize_results(results, max_prompt_chars=12000)

    assert len({candidate.source for candidate in candidates}) == 3
    assert len(candidates) == 6
    assert all(candidate.prompt for candidate in candidates)
    assert all(candidate.source_url for candidate in candidates)
    assert all(candidate.source_revision for candidate in candidates)
    assert all(candidate.source_row_id for candidate in candidates)
    assert all(candidate.license_name for candidate in candidates)


def test_limit_per_source_applies_to_fixtures():
    results = fixture_pull_results(limit_per_source=1)

    assert all(len(result.rows) <= 1 for result in results)


def test_pull_source_records_skip_on_unavailable_network(monkeypatch):
    def fail_url(*args, **kwargs):
        raise TimeoutError("blocked")

    monkeypatch.setattr("curation_pipeline.read_limited_url", fail_url)

    result = pull_source(SOURCES[0], limit_per_source=5, timeout_seconds=1, max_bytes=100)

    assert result.skipped_reason is not None
    assert result.rows == []
