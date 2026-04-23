"""
Tests for v3 corpus schema validation (validate_corpus.py).

Covers:
  (a) The example fixture validates cleanly.
  (b) Failure modes: missing required field, same-family generator/adjudicator,
      invalid route tier, bad effort, missing provenance on synthetic row,
      route_judgments invariant violation.
"""

from pathlib import Path

import pytest
from validate_corpus import load_rows, validate_row  # tools/ added to sys.path in conftest

PROMPT_ROUTING_DIR = Path(__file__).parent.parent
EXAMPLE_FIXTURE = PROMPT_ROUTING_DIR / "data" / "training_corpus_v3.example.json"


def _minimal_row(**overrides) -> dict:
    row = {
        "prompt_id": "test-001",
        "family_id": "fam-test",
        "prompt": "What is a function?",
        "source": "seed_v2",
        "domain": "python",
        "task_type": "factual",
        "ambiguity": "clear",
        "cheapest_acceptable_route": {"model_tier": "Haiku", "effort": "low"},
    }
    row.update(overrides)
    return row


def _synthetic_row(**overrides) -> dict:
    row = _minimal_row(
        prompt_id="synth-001",
        source="synthetic_large",
        provenance={
            "generator_model": "claude-haiku",
            "generator_model_size": "small",
            "adjudicator_model": "claude-opus",
            "adjudicator_model_size": "large",
            "prompt_version_hash": "sha256:aabbccdd",
            "temperature": 0.0,
            "generated_at": "2026-04-22T00:00:00Z",
        },
    )
    row.update(overrides)
    return row


class TestExampleFixture:
    def test_fixture_file_exists(self):
        assert EXAMPLE_FIXTURE.exists(), f"Missing fixture: {EXAMPLE_FIXTURE}"

    def test_fixture_loads_as_list(self):
        rows = load_rows(EXAMPLE_FIXTURE)
        assert isinstance(rows, list)
        assert len(rows) >= 2

    def test_fixture_all_rows_valid(self):
        rows = load_rows(EXAMPLE_FIXTURE)
        for row in rows:
            row_id = row.get("prompt_id", "?")
            errors = validate_row(row, row_id)
            assert errors == [], f"Row {row_id!r} failed validation:\n" + "\n".join(errors)

    def test_fixture_has_migrated_historical_row(self):
        rows = load_rows(EXAMPLE_FIXTURE)
        historical = [r for r in rows if r.get("source") == "seed_v2"]
        assert historical, (
            "Fixture must include at least one migrated historical row (source=seed_v2)"
        )

    def test_fixture_has_synthetic_row_with_provenance(self):
        rows = load_rows(EXAMPLE_FIXTURE)
        synthetic = [r for r in rows if str(r.get("source", "")).startswith("synthetic_")]
        assert synthetic, "Fixture must include at least one synthetic row"
        for row in synthetic:
            assert "provenance" in row, f"Synthetic row {row.get('prompt_id')!r} missing provenance"
            prov = row["provenance"]
            assert prov.get("temperature") == 0.0
            assert "prompt_version_hash" in prov

    def test_fixture_synthetic_different_families(self):
        rows = load_rows(EXAMPLE_FIXTURE)
        for row in rows:
            if not str(row.get("source", "")).startswith("synthetic_"):
                continue
            prov = row.get("provenance", {})
            gen = prov.get("generator_model", "")
            adj = prov.get("adjudicator_model", "")
            assert gen != adj, (
                f"Row {row.get('prompt_id')!r}: generator and adjudicator must differ"
            )

    def test_fixture_complexity_tier_preserved_on_migrated_rows(self):
        rows = load_rows(EXAMPLE_FIXTURE)
        migrated = [r for r in rows if r.get("source") == "seed_v2"]
        for row in migrated:
            assert "complexity_tier" in row, (
                f"Migrated row {row.get('prompt_id')!r} should carry complexity_tier as metadata"
            )


class TestMissingRequiredField:
    @pytest.mark.parametrize("field", [
        "prompt_id",
        "family_id",
        "prompt",
        "source",
        "domain",
        "task_type",
        "ambiguity",
        "cheapest_acceptable_route",
    ])
    def test_missing_field_is_caught(self, field):
        row = _minimal_row()
        del row[field]
        errors = validate_row(row, "test-001")
        assert errors, f"Expected error for missing field '{field}'"
        assert any(field in e for e in errors), (
            f"Expected error mentioning '{field}', got: {errors}"
        )


class TestInvalidRouteValues:
    def test_invalid_model_tier_is_caught(self):
        row = _minimal_row(
            cheapest_acceptable_route={"model_tier": "GPT4", "effort": "low"}
        )
        errors = validate_row(row, "test-001")
        assert errors
        assert any("model_tier" in e for e in errors)

    def test_invalid_effort_is_caught(self):
        row = _minimal_row(
            cheapest_acceptable_route={"model_tier": "Haiku", "effort": "extreme"}
        )
        errors = validate_row(row, "test-001")
        assert errors
        assert any("effort" in e for e in errors)

    def test_valid_all_model_tiers(self):
        for tier in ("Haiku", "Sonnet", "Opus"):
            row = _minimal_row(
                cheapest_acceptable_route={"model_tier": tier, "effort": "medium"}
            )
            assert validate_row(row, "test") == []

    def test_valid_all_effort_tiers(self):
        for effort in ("none", "low", "medium", "high"):
            row = _minimal_row(
                cheapest_acceptable_route={"model_tier": "Sonnet", "effort": effort}
            )
            assert validate_row(row, "test") == []


class TestSyntheticRowProvenance:
    def test_synthetic_row_without_provenance_is_caught(self):
        row = _minimal_row(source="synthetic_medium")
        # no provenance key
        errors = validate_row(row, "test-001")
        assert errors
        assert any("provenance" in e for e in errors)

    def test_same_family_generator_adjudicator_is_caught(self):
        row = _synthetic_row()
        row["provenance"]["generator_model"] = "claude-haiku"
        row["provenance"]["adjudicator_model"] = "claude-haiku-3-5"
        errors = validate_row(row, "test-001")
        assert errors
        assert any("same model family" in e or "B5" in e for e in errors)

    def test_nonzero_temperature_is_caught(self):
        row = _synthetic_row()
        row["provenance"]["temperature"] = 0.7
        errors = validate_row(row, "test-001")
        assert errors
        assert any("temperature" in e or "H7" in e for e in errors)

    def test_missing_prompt_version_hash_is_caught(self):
        row = _synthetic_row()
        del row["provenance"]["prompt_version_hash"]
        errors = validate_row(row, "test-001")
        assert errors
        assert any("prompt_version_hash" in e for e in errors)

    def test_valid_synthetic_row_passes(self):
        row = _synthetic_row()
        errors = validate_row(row, "test-001")
        assert errors == [], f"Expected no errors, got: {errors}"

    def test_different_families_sonnet_opus_passes(self):
        row = _synthetic_row()
        row["provenance"]["generator_model"] = "claude-sonnet"
        row["provenance"]["adjudicator_model"] = "claude-opus"
        errors = validate_row(row, "test-001")
        assert errors == []


class TestRouteJudgmentsInvariant:
    def test_cheapest_acceptable_matches_car(self):
        row = _minimal_row(
            cheapest_acceptable_route={"model_tier": "Sonnet", "effort": "medium"},
            route_judgments=[
                {
                    "route": {"model_tier": "Haiku", "effort": "medium"},
                    "verdict": "insufficient",
                    "rationale": "wrong",
                },
                {
                    "route": {"model_tier": "Sonnet", "effort": "medium"},
                    "verdict": "acceptable",
                    "rationale": "correct",
                },
            ],
        )
        errors = validate_row(row, "test-001")
        assert errors == [], f"Expected no errors, got: {errors}"

    def test_car_mismatch_with_judgments_is_caught(self):
        row = _minimal_row(
            cheapest_acceptable_route={"model_tier": "Opus", "effort": "high"},
            route_judgments=[
                {
                    "route": {"model_tier": "Haiku", "effort": "low"},
                    "verdict": "insufficient",
                    "rationale": "too weak",
                },
                {
                    "route": {"model_tier": "Sonnet", "effort": "medium"},
                    "verdict": "acceptable",
                    "rationale": "good enough",
                },
                {
                    "route": {"model_tier": "Opus", "effort": "high"},
                    "verdict": "overkill",
                    "rationale": "too much",
                },
            ],
        )
        errors = validate_row(row, "test-001")
        assert errors, "Expected invariant violation error"
        assert any("invariant" in e or "cheapest acceptable" in e for e in errors)

    def test_invalid_verdict_in_judgments_is_caught(self):
        row = _minimal_row(
            route_judgments=[
                {
                    "route": {"model_tier": "Haiku", "effort": "low"},
                    "verdict": "maybe",
                    "rationale": "not sure",
                }
            ]
        )
        errors = validate_row(row, "test-001")
        assert errors
        assert any("verdict" in e for e in errors)


class TestInvalidEnumFields:
    def test_invalid_source_is_caught(self):
        row = _minimal_row(source="unknown_source")
        errors = validate_row(row, "test-001")
        assert errors
        assert any("source" in e for e in errors)

    def test_invalid_task_type_is_caught(self):
        row = _minimal_row(task_type="brainstorm")
        errors = validate_row(row, "test-001")
        assert errors
        assert any("task_type" in e for e in errors)

    def test_invalid_ambiguity_is_caught(self):
        row = _minimal_row(ambiguity="maybe")
        errors = validate_row(row, "test-001")
        assert errors
        assert any("ambiguity" in e for e in errors)

    def test_invalid_complexity_tier_is_caught(self):
        row = _minimal_row(complexity_tier="extreme")
        errors = validate_row(row, "test-001")
        assert errors
        assert any("complexity_tier" in e for e in errors)


class TestLabelsField:
    def test_row_without_labels_validates(self):
        row = _minimal_row()
        assert "labels" not in row
        errors = validate_row(row, "test-001")
        assert errors == []

    def test_row_with_consistent_labels_validates(self):
        row = _minimal_row(
            labels={
                "cheapest_acceptable_route": {"model_tier": "Haiku", "effort": "low"},
            }
        )
        errors = validate_row(row, "test-001")
        assert errors == [], f"Expected no errors, got: {errors}"

    def test_row_with_labels_mismatch_is_caught(self):
        row = _minimal_row(
            cheapest_acceptable_route={"model_tier": "Haiku", "effort": "low"},
            labels={
                "cheapest_acceptable_route": {"model_tier": "Sonnet", "effort": "medium"},
            },
        )
        errors = validate_row(row, "test-001")
        assert errors, "Expected mismatch error"
        assert any("labels.cheapest_acceptable_route" in e for e in errors)
