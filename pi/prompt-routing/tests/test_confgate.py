"""
Tests for ConfGatedClassifier confidence-gated delegation logic.

Covers:
  - LGB confident (conf >= gate): returns LGB's pick regardless of T2
  - LGB uncertain, both agree: returns agreed pick, confidence = max
  - LGB uncertain, T2 confident and disagrees: returns T2's pick
  - LGB uncertain, T2 also uncertain and disagrees: returns LGB's pick (lgb-fallback)
  - Output validates against router-v3-output.schema.json
  - SHA256 verification triggers on corrupted model file
"""

import hashlib
import json
import sys
import tempfile
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
    from classifier_confgate import EFFORT_ORDER, TIER_ORDER
    parts = lbl.split("|")
    return (TIER_ORDER.get(parts[0], 99), EFFORT_ORDER.get(parts[1], 99))


def _make_cands(label: str, conf: float) -> list[tuple[str, float]]:
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


def _build_confgate(
    lgbm_label: str,
    lgbm_conf: float,
    t2_label: str,
    t2_conf: float,
    conf_gate: float = 0.50,
) -> object:
    from classifier_confgate import ConfGatedClassifier

    cg = ConfGatedClassifier.__new__(ConfGatedClassifier)
    cg.conf_gate = conf_gate

    lgbm_mock = MagicMock()
    lgbm_mock.predict_single_full.return_value = (
        lgbm_label, lgbm_conf, _make_cands(lgbm_label, lgbm_conf)
    )

    t2_mock = MagicMock()
    t2_mock.predict_single_full.return_value = (
        t2_label, t2_conf, _make_cands(t2_label, t2_conf)
    )

    cg._lgbm = lgbm_mock
    cg._t2 = t2_mock
    cg._lgbm_sha = "mock"
    cg._t2_sha = "mock"
    return cg


# ---------------------------------------------------------------------------
# Gate logic tests
# ---------------------------------------------------------------------------

class TestConfGateLogic:
    def test_lgb_confident_uses_lgb_ignores_t2(self):
        """LGB conf >= gate: LGB's pick returned, T2 not called."""
        cg = _build_confgate("Haiku|low", 0.80, "Sonnet|medium", 0.90)
        lbl, conf, _ = cg.predict_single_full("fix a typo")
        assert lbl == "Haiku|low"
        assert conf == pytest.approx(0.80)
        cg._t2.predict_single_full.assert_not_called()

    def test_lgb_confident_at_exact_gate_boundary(self):
        """LGB conf == gate exactly: treated as confident."""
        cg = _build_confgate("Haiku|medium", 0.50, "Opus|high", 0.95)
        lbl, conf, _ = cg.predict_single_full("hello")
        assert lbl == "Haiku|medium"
        cg._t2.predict_single_full.assert_not_called()

    def test_lgb_uncertain_both_agree_returns_max_conf(self):
        """LGB uncertain, T2 agrees: returns agreed label, conf = max."""
        cg = _build_confgate("Sonnet|medium", 0.40, "Sonnet|medium", 0.65)
        lbl, conf, _ = cg.predict_single_full("Write a REST API.")
        assert lbl == "Sonnet|medium"
        assert conf == pytest.approx(0.65)  # max(0.40, 0.65)

    def test_lgb_uncertain_t2_agrees_lower_conf_uses_t2_conf_as_max(self):
        """LGB uncertain, T2 agrees but with lower conf: max is LGB's (unusual but valid)."""
        cg = _build_confgate("Sonnet|medium", 0.45, "Sonnet|medium", 0.30)
        lbl, conf, _ = cg.predict_single_full("Write tests.")
        assert lbl == "Sonnet|medium"
        assert conf == pytest.approx(0.45)  # max(0.45, 0.30)

    def test_lgb_uncertain_t2_more_confident_disagrees_uses_t2(self):
        """LGB uncertain, T2 more confident and disagrees: T2's pick wins."""
        cg = _build_confgate("Haiku|low", 0.30, "Sonnet|medium", 0.70)
        lbl, conf, _ = cg.predict_single_full("Design an auth system.")
        assert lbl == "Sonnet|medium"
        assert conf == pytest.approx(0.70)

    def test_lgb_uncertain_t2_also_uncertain_lgb_fallback(self):
        """LGB uncertain, T2 also uncertain and disagrees: LGB fallback."""
        cg = _build_confgate("Sonnet|medium", 0.35, "Opus|high", 0.20)
        lbl, conf, _ = cg.predict_single_full("complex question")
        assert lbl == "Sonnet|medium"
        assert conf == pytest.approx(0.35)

    def test_lgb_uncertain_t2_equal_conf_disagrees_lgb_fallback(self):
        """T2 not strictly MORE confident: LGB fallback (not t2-overrides)."""
        cg = _build_confgate("Haiku|low", 0.40, "Sonnet|medium", 0.40)
        lbl, _, _ = cg.predict_single_full("test")
        assert lbl == "Haiku|low"


# ---------------------------------------------------------------------------
# ensemble_rule field tests
# ---------------------------------------------------------------------------

class TestEnsembleRule:
    def test_rule_lgb_confident(self):
        cg = _build_confgate("Haiku|low", 0.80, "Sonnet|medium", 0.90)
        result = cg.predict_route("fix a typo")
        assert result["ensemble_rule"] == "lgb-confident"

    def test_rule_agree(self):
        cg = _build_confgate("Sonnet|medium", 0.40, "Sonnet|medium", 0.65)
        result = cg.predict_route("Write a REST API.")
        assert result["ensemble_rule"] == "agree"

    def test_rule_t2_overrides(self):
        cg = _build_confgate("Haiku|low", 0.30, "Sonnet|medium", 0.70)
        result = cg.predict_route("Design an auth system.")
        assert result["ensemble_rule"] == "t2-overrides"

    def test_rule_lgb_fallback(self):
        cg = _build_confgate("Sonnet|medium", 0.35, "Opus|high", 0.20)
        result = cg.predict_route("complex question")
        assert result["ensemble_rule"] == "lgb-fallback"

    def test_rule_field_valid_values(self):
        valid_rules = {"lgb-confident", "agree", "t2-overrides", "lgb-fallback"}
        for lgbm_conf, t2_conf, lgbm_lbl, t2_lbl in [
            (0.80, 0.60, "Haiku|low", "Sonnet|medium"),
            (0.40, 0.65, "Sonnet|medium", "Sonnet|medium"),
            (0.30, 0.70, "Haiku|low", "Sonnet|medium"),
            (0.35, 0.20, "Sonnet|medium", "Opus|high"),
        ]:
            cg = _build_confgate(lgbm_lbl, lgbm_conf, t2_lbl, t2_conf)
            result = cg.predict_route("test")
            assert result["ensemble_rule"] in valid_rules


# ---------------------------------------------------------------------------
# Output contract tests
# ---------------------------------------------------------------------------

class TestOutputContract:
    def test_output_has_required_fields(self):
        cg = _build_confgate("Sonnet|medium", 0.75, "Sonnet|medium", 0.72)
        result = cg.predict_route("Write a REST API in FastAPI.")
        assert "schema_version" in result
        assert "primary" in result
        assert "candidates" in result
        assert "confidence" in result
        assert result["schema_version"] == "3.0.0"

    def test_primary_has_valid_model_tier_and_effort(self):
        cg = _build_confgate("Haiku|low", 0.80, "Haiku|medium", 0.70)
        result = cg.predict_route("fix a typo")
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

        cg = _build_confgate("Sonnet|medium", 0.75, "Opus|high", 0.68)
        result = cg.predict_route("Design a distributed payment system.")
        result_for_schema = {k: v for k, v in result.items() if k != "ensemble_rule"}
        jsonschema.validate(result_for_schema, schema)

    def test_schema_validation_lgb_uncertain_path(self):
        """Schema validation on uncertain path (T2 consulted)."""
        try:
            import jsonschema
        except ImportError:
            pytest.skip("jsonschema not installed")
        if not SCHEMA_PATH.exists():
            pytest.skip(f"schema not found at {SCHEMA_PATH}")

        with open(SCHEMA_PATH, encoding="utf-8") as f:
            schema = json.load(f)

        cg = _build_confgate("Haiku|low", 0.30, "Sonnet|medium", 0.70)
        result = cg.predict_route("Design an auth system.")
        result_for_schema = {k: v for k, v in result.items() if k != "ensemble_rule"}
        jsonschema.validate(result_for_schema, schema)


# ---------------------------------------------------------------------------
# SHA256 verification test
# ---------------------------------------------------------------------------

class TestSHA256Verification:
    def test_sha256_mismatch_raises_on_corrupted_file(self):
        """Corrupted model file must raise RuntimeError with mismatch message."""
        from classifier_confgate import _verify_sha256

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            model_file = tmp / "fake_model.joblib"
            hash_file = tmp / "fake_model.sha256"

            # Write real content and compute its hash
            model_file.write_bytes(b"original model bytes")
            real_hash = hashlib.sha256(b"original model bytes").hexdigest()
            hash_file.write_text(real_hash)

            # Corrupt the model file
            model_file.write_bytes(b"corrupted content")

            with pytest.raises(RuntimeError, match="SHA256 mismatch"):
                _verify_sha256(model_file, hash_file)

    def test_sha256_passes_on_valid_file(self):
        from classifier_confgate import _verify_sha256

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            model_file = tmp / "valid_model.joblib"
            hash_file = tmp / "valid_model.sha256"

            content = b"valid model bytes"
            model_file.write_bytes(content)
            hash_file.write_text(hashlib.sha256(content).hexdigest())

            result = _verify_sha256(model_file, hash_file)
            assert len(result) == 64  # sha256 hex digest length


# ---------------------------------------------------------------------------
# Integration test: real models (skipped if artifacts missing)
# ---------------------------------------------------------------------------

class TestConfGateIntegration:
    def test_real_confgate_loads_and_classifies(self):
        if not T2_MODEL_PATH.exists() or not LGBM_MODEL_PATH.exists():
            pytest.skip("one or both model artifacts missing")
        from classifier_confgate import ConfGatedClassifier
        cg = ConfGatedClassifier()
        result = cg.predict_route("fix a typo in README")
        assert result["primary"]["model_tier"] in {"Haiku", "Sonnet", "Opus"}
        assert 0.0 <= result["confidence"] <= 1.0
        assert result["ensemble_rule"] in {"lgb-confident", "agree", "t2-overrides", "lgb-fallback"}

    def test_real_confgate_output_validates_against_schema(self):
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

        from classifier_confgate import ConfGatedClassifier
        cg = ConfGatedClassifier()
        for prompt in [
            "fix a typo",
            "Design a distributed consensus protocol for a payment system.",
            "What is Python?",
        ]:
            result = cg.predict_route(prompt)
            result_for_schema = {k: v for k, v in result.items() if k != "ensemble_rule"}
            jsonschema.validate(result_for_schema, schema)
