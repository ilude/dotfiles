"""
Tests for EnsembleV3Classifier veto logic and output contract.

Covers:
  - Both models agree -> ensemble returns agreed route
  - T2 says Haiku, LightGBM says Sonnet -> ensemble returns Sonnet (veto escalate)
  - Both say Haiku -> ensemble returns Haiku
  - Confidence formula: agree=max, veto=winning model's conf
  - Ensemble output validates against router-v3-output.schema.json
"""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

PROMPT_ROUTING = Path(__file__).parent.parent
sys.path.insert(0, str(PROMPT_ROUTING))

SCHEMA_PATH = PROMPT_ROUTING / "docs" / "router-v3-output.schema.json"
T2_MODEL_PATH = PROMPT_ROUTING / "models" / "router_v3.joblib"
LGBM_MODEL_PATH = PROMPT_ROUTING / "models" / "router_v3_lgbm.joblib"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cost_key(lbl: str) -> tuple[int, int]:
    from classifier import EFFORT_ORDER, TIER_ORDER  # noqa: PLC0415
    parts = lbl.split("|")
    return (TIER_ORDER.get(parts[0], 99), EFFORT_ORDER.get(parts[1], 99))


def _make_cands(label: str, conf: float) -> list[tuple[str, float]]:
    """Minimal candidate list: primary at given confidence, rest at residual."""
    others = [
        ("Haiku|low", 0.0),
        ("Haiku|medium", 0.0),
        ("Sonnet|medium", 0.0),
        ("Opus|high", 0.0),
    ]
    cand_map = {lbl: p for lbl, p in others}
    cand_map[label] = conf
    residual = max(0.0, 1.0 - conf)
    non_primary = [lbl for lbl in cand_map if lbl != label]
    per = residual / len(non_primary) if non_primary else 0.0
    for lbl in non_primary:
        cand_map[lbl] = per
    return sorted(cand_map.items(), key=lambda x: _cost_key(x[0]))


def _build_ensemble_with_mocks(
    t2_label: str, t2_conf: float,
    lgbm_label: str, lgbm_conf: float,
):
    """
    Return an EnsembleV3Classifier whose two sub-models are replaced with
    MagicMocks returning the specified predict_single_full outputs.
    """
    from classifier_ensemble import EnsembleV3Classifier

    ens = EnsembleV3Classifier.__new__(EnsembleV3Classifier)

    t2_mock = MagicMock()
    t2_mock.predict_single_full.return_value = (
        t2_label, t2_conf, _make_cands(t2_label, t2_conf)
    )
    lgbm_mock = MagicMock()
    lgbm_mock.predict_single_full.return_value = (
        lgbm_label, lgbm_conf, _make_cands(lgbm_label, lgbm_conf)
    )

    ens._t2 = t2_mock
    ens._lgbm = lgbm_mock
    ens._t2_sha = "mock"
    ens._lgbm_sha = "mock"
    return ens


# ---------------------------------------------------------------------------
# Veto logic tests
# ---------------------------------------------------------------------------

class TestVetoLogic:
    def test_both_agree_returns_agreed_route(self):
        ens = _build_ensemble_with_mocks(
            "Sonnet|medium", 0.80,
            "Sonnet|medium", 0.75,
        )
        lbl, conf, cands = ens.predict_single_full("Write a REST API.")
        assert lbl == "Sonnet|medium"
        assert conf == pytest.approx(0.80)  # agree -> max(0.80, 0.75)

    def test_t2_haiku_lgbm_sonnet_returns_sonnet(self):
        """T2 says Haiku but LightGBM says Sonnet -- veto escalates to Sonnet."""
        ens = _build_ensemble_with_mocks(
            "Haiku|low", 0.70,
            "Sonnet|medium", 0.65,
        )
        lbl, conf, cands = ens.predict_single_full("Write a REST API.")
        tier, effort = lbl.split("|")
        assert tier == "Sonnet", f"Expected Sonnet tier, got {tier}"

    def test_lgbm_haiku_t2_sonnet_returns_sonnet(self):
        """LightGBM says Haiku but T2 says Sonnet -- veto escalates to Sonnet."""
        ens = _build_ensemble_with_mocks(
            "Sonnet|medium", 0.72,
            "Haiku|low", 0.68,
        )
        lbl, conf, cands = ens.predict_single_full("Design an API.")
        tier, _ = lbl.split("|")
        assert tier == "Sonnet", f"Expected Sonnet tier, got {tier}"

    def test_both_haiku_returns_haiku(self):
        ens = _build_ensemble_with_mocks(
            "Haiku|low", 0.85,
            "Haiku|low", 0.80,
        )
        lbl, conf, cands = ens.predict_single_full("fix a typo")
        tier, _ = lbl.split("|")
        assert tier == "Haiku"

    def test_confidence_agree_is_max_of_two(self):
        """agree case: confidence = max of the two models' confidences."""
        ens = _build_ensemble_with_mocks(
            "Sonnet|medium", 0.90,
            "Sonnet|medium", 0.60,
        )
        lbl, conf, cands = ens.predict_single_full("test")
        assert conf == pytest.approx(0.90)  # max(0.90, 0.60)

    def test_confidence_agree_both_at_07(self):
        """agree case: both conf=0.7 -> ensemble conf=0.7 (max of equal values)."""
        ens = _build_ensemble_with_mocks(
            "Sonnet|medium", 0.70,
            "Sonnet|medium", 0.70,
        )
        _, conf, _ = ens.predict_single_full("test")
        assert conf == pytest.approx(0.70)

    def test_confidence_veto_t2haiku_lgbmsonnet_winner_is_lgbm(self):
        """t2=Haiku/0.9, lgbm=Sonnet/0.55 -> Sonnet wins -> ensemble conf=0.55."""
        ens = _build_ensemble_with_mocks(
            "Haiku|low", 0.90,
            "Sonnet|medium", 0.55,
        )
        lbl, conf, _ = ens.predict_single_full("test")
        tier, _ = lbl.split("|")
        assert tier == "Sonnet"
        assert conf == pytest.approx(0.55)  # winning model (lgbm/Sonnet) conf

    def test_confidence_veto_t2sonnet_lgbmhaiku_winner_is_t2(self):
        """t2=Sonnet/0.55, lgbm=Haiku/0.8 -> Sonnet wins (t2) -> ensemble conf=0.55."""
        ens = _build_ensemble_with_mocks(
            "Sonnet|medium", 0.55,
            "Haiku|low", 0.80,
        )
        lbl, conf, _ = ens.predict_single_full("test")
        tier, _ = lbl.split("|")
        assert tier == "Sonnet"
        assert conf == pytest.approx(0.55)  # winning model (t2/Sonnet) conf

    def test_effort_veto_escalates_to_higher_effort(self):
        """Both say Sonnet but different effort -- ensemble takes the higher one."""
        ens = _build_ensemble_with_mocks(
            "Sonnet|low", 0.75,
            "Sonnet|medium", 0.70,
        )
        lbl, _, _ = ens.predict_single_full("test")
        _, effort = lbl.split("|")
        assert _cost_key(f"Haiku|{effort}")[1] >= _cost_key("Haiku|medium")[1], (
            f"Expected effort >= medium, got {effort}"
        )

    def test_candidates_includes_labels_from_both_models(self):
        ens = _build_ensemble_with_mocks(
            "Haiku|low", 0.60,
            "Sonnet|medium", 0.55,
        )
        _, _, cands = ens.predict_single_full("test")
        labels = {lbl for lbl, _ in cands}
        assert "Haiku|low" in labels
        assert "Sonnet|medium" in labels

    def test_candidates_sorted_by_ascending_cost(self):
        ens = _build_ensemble_with_mocks(
            "Opus|high", 0.70,
            "Haiku|low", 0.50,
        )
        _, _, cands = ens.predict_single_full("test")
        costs = [_cost_key(lbl) for lbl, _ in cands]
        assert costs == sorted(costs), "Candidates not sorted by ascending cost"


# ---------------------------------------------------------------------------
# predict_route output contract
# ---------------------------------------------------------------------------

class TestPredictRouteContract:
    def test_output_has_required_fields(self):
        ens = _build_ensemble_with_mocks(
            "Sonnet|medium", 0.75,
            "Sonnet|medium", 0.72,
        )
        result = ens.predict_route("Write a REST API in FastAPI.")
        assert "schema_version" in result
        assert "primary" in result
        assert "candidates" in result
        assert "confidence" in result
        assert result["schema_version"] == "3.0.0"

    def test_primary_has_valid_model_tier_and_effort(self):
        ens = _build_ensemble_with_mocks(
            "Haiku|low", 0.80,
            "Haiku|medium", 0.70,
        )
        result = ens.predict_route("fix a typo")
        primary = result["primary"]
        assert primary["model_tier"] in {"Haiku", "Sonnet", "Opus"}
        assert primary["effort"] in {"none", "low", "medium", "high"}

    def test_output_validates_against_schema(self):
        try:
            import jsonschema
        except ImportError:
            pytest.skip("jsonschema not installed")

        if not SCHEMA_PATH.exists():
            pytest.skip(f"schema not found at {SCHEMA_PATH}")

        with open(SCHEMA_PATH, encoding="utf-8") as f:
            schema = json.load(f)

        ens = _build_ensemble_with_mocks(
            "Sonnet|medium", 0.75,
            "Opus|high", 0.68,
        )
        result = ens.predict_route("Design a distributed payment system.")
        # ensemble_rule is an extra field not in schema -- strip before validating
        result_for_schema = {k: v for k, v in result.items() if k != "ensemble_rule"}
        jsonschema.validate(result_for_schema, schema)

    def test_ensemble_rule_field_present(self):
        ens = _build_ensemble_with_mocks(
            "Haiku|low", 0.80,
            "Sonnet|medium", 0.65,
        )
        result = ens.predict_route("test")
        assert "ensemble_rule" in result
        assert result["ensemble_rule"] in {"agree", "veto_escalate_tier", "veto_escalate_effort"}

    def test_agree_rule_when_both_match(self):
        ens = _build_ensemble_with_mocks(
            "Sonnet|medium", 0.80,
            "Sonnet|medium", 0.78,
        )
        result = ens.predict_route("test")
        assert result["ensemble_rule"] == "agree"

    def test_veto_escalate_tier_when_haiku_vs_sonnet(self):
        ens = _build_ensemble_with_mocks(
            "Haiku|low", 0.70,
            "Sonnet|medium", 0.65,
        )
        result = ens.predict_route("test")
        assert result["ensemble_rule"] == "veto_escalate_tier"


# ---------------------------------------------------------------------------
# Integration test: real models (skipped if artifacts missing)
# ---------------------------------------------------------------------------

class TestEnsembleIntegration:
    def test_real_ensemble_loads_and_classifies(self):
        if not T2_MODEL_PATH.exists() or not LGBM_MODEL_PATH.exists():
            pytest.skip("one or both model artifacts missing")
        from classifier_ensemble import EnsembleV3Classifier
        ens = EnsembleV3Classifier()
        result = ens.predict_route("fix a typo in README")
        assert result["primary"]["model_tier"] in {"Haiku", "Sonnet", "Opus"}
        assert 0.0 <= result["confidence"] <= 1.0

    def test_real_ensemble_output_validates_against_schema(self):
        if not T2_MODEL_PATH.exists() or not LGBM_MODEL_PATH.exists():
            pytest.skip("one or both model artifacts missing")
        try:
            import jsonschema
        except ImportError:
            pytest.skip("jsonschema not installed")
        if not SCHEMA_PATH.exists():
            pytest.skip(f"schema not found at {SCHEMA_PATH}")

        with open(SCHEMA_PATH, encoding="utf-8") as f:
            schema = json.load(f)

        from classifier_ensemble import EnsembleV3Classifier
        ens = EnsembleV3Classifier()
        for prompt in [
            "fix a typo",
            "Design a distributed consensus protocol for a payment system.",
            "What is Python?",
        ]:
            result = ens.predict_route(prompt)
            result_for_schema = {k: v for k, v in result.items() if k != "ensemble_rule"}
            jsonschema.validate(result_for_schema, schema)
