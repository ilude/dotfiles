"""
classifier_confgate.py -- ConfGatedClassifier: confidence-gated delegation.

LightGBM is primary. T2 is consulted only when LGB confidence is below CONF_GATE.
This is ASYMMETRIC toward whichever model is more confident, NOT always toward higher tier.

Combination rule:
  1. If lgb.conf >= CONF_GATE: return LGB directly (lgb-confident).
  2. Both models consulted -- if they agree on label: return agreed, conf=max (agree).
  3. If T2 is more confident and disagrees: return T2's pick (t2-overrides).
  4. Otherwise: return LGB (lgb-fallback).

Public API:
  ConfGatedClassifier(conf_gate=0.50)  -- loads both models, verifies SHA256
  predict_route(prompt) -> dict        -- returns dict matching router-v3-output.schema.json
  predict_single_full(prompt)          -- returns (label, confidence, candidates) like V3Classifier
  predict_texts(texts)                 -- returns list[str] of "Tier|effort" labels
  predict(rows)                        -- returns list[str] from list of corpus rows
"""

import hashlib
import threading
from pathlib import Path
from typing import Any

import joblib

_DIR = Path(__file__).parent
_MODEL_DIR = _DIR / "models"

T2_MODEL_PATH = _MODEL_DIR / "router_v3.joblib"
T2_HASH_PATH = _MODEL_DIR / "router_v3.sha256"
LGBM_MODEL_PATH = _MODEL_DIR / "router_v3_lgbm.joblib"
LGBM_HASH_PATH = _MODEL_DIR / "router_v3_lgbm.sha256"

SCHEMA_VERSION = "3.0.0"
CONF_GATE: float = 0.50

TIER_ORDER = {"Haiku": 0, "Sonnet": 1, "Opus": 2}
EFFORT_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}


def _verify_sha256(model_path: Path, hash_path: Path) -> str:
    if not hash_path.exists():
        raise FileNotFoundError(
            f"{hash_path.name} not found at {hash_path}. Run the training script first."
        )
    if not model_path.exists():
        raise FileNotFoundError(
            f"{model_path.name} not found at {model_path}. Run the training script first."
        )
    expected = hash_path.read_text().strip()
    actual = hashlib.sha256(model_path.read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError(
            f"{model_path.name} SHA256 mismatch -- file may be corrupted or tampered.\n"
            f"  expected: {expected}\n"
            f"  actual:   {actual}\n"
            f"Re-run the training script to regenerate a trusted model."
        )
    return actual


# ---------------------------------------------------------------------------
# Lazy singleton loader
# ---------------------------------------------------------------------------

_confgate: "ConfGatedClassifier | None" = None
_confgate_lock = threading.Lock()


def get_confgate(conf_gate: float = CONF_GATE) -> "ConfGatedClassifier":
    global _confgate
    if _confgate is None:
        with _confgate_lock:
            if _confgate is None:
                _confgate = ConfGatedClassifier(conf_gate=conf_gate)
    return _confgate


# ---------------------------------------------------------------------------
# Confidence-gated classifier
# ---------------------------------------------------------------------------

class ConfGatedClassifier:
    """
    Confidence-gated delegation: LGB is primary, T2 consulted only when LGB
    confidence falls below the gate threshold.
    """

    def __init__(self, conf_gate: float = CONF_GATE) -> None:
        self.conf_gate = conf_gate
        self._load_models()

    def _load_models(self) -> None:
        t2_sha = _verify_sha256(T2_MODEL_PATH, T2_HASH_PATH)
        lgbm_sha = _verify_sha256(LGBM_MODEL_PATH, LGBM_HASH_PATH)
        self._t2 = joblib.load(T2_MODEL_PATH)
        self._lgbm = joblib.load(LGBM_MODEL_PATH)
        self._t2_sha = t2_sha[:16]
        self._lgbm_sha = lgbm_sha[:16]

    # ------------------------------------------------------------------
    # Core gate logic
    # ------------------------------------------------------------------

    def _gate(
        self,
        lgbm_label: str,
        lgbm_conf: float,
        lgbm_candidates: list[tuple[str, float]],
        t2_label: str,
        t2_conf: float,
        t2_candidates: list[tuple[str, float]],
    ) -> tuple[str, float, list[tuple[str, float]], str]:
        """
        Returns (final_label, confidence, candidates, ensemble_rule).
        ensemble_rule is one of: lgb-confident, agree, t2-overrides, lgb-fallback.
        """
        if lgbm_conf >= self.conf_gate:
            # LGB is confident -- use it directly, no T2 consultation
            return lgbm_label, lgbm_conf, lgbm_candidates, "lgb-confident"

        # LGB uncertain -- consult T2
        if lgbm_label == t2_label:
            # Agreement: use the agreed label with max confidence
            confidence = max(lgbm_conf, t2_conf)
            candidates = _merge_candidates(lgbm_candidates, t2_candidates)
            return lgbm_label, confidence, candidates, "agree"

        # Disagreement -- use whichever model is more confident
        if t2_conf > lgbm_conf:
            candidates = _merge_candidates(t2_candidates, lgbm_candidates)
            return t2_label, t2_conf, candidates, "t2-overrides"

        # T2 not more confident -- stick with LGB
        candidates = _merge_candidates(lgbm_candidates, t2_candidates)
        return lgbm_label, lgbm_conf, candidates, "lgb-fallback"

    # ------------------------------------------------------------------
    # Public API (mirrors V3Classifier / EnsembleV3Classifier)
    # ------------------------------------------------------------------

    def predict_single_full(
        self, prompt: str
    ) -> tuple[str, float, list[tuple[str, float]]]:
        lgbm_lbl, lgbm_conf, lgbm_cands = self._lgbm.predict_single_full(prompt)
        if lgbm_conf >= self.conf_gate:
            return lgbm_lbl, lgbm_conf, lgbm_cands
        t2_lbl, t2_conf, t2_cands = self._t2.predict_single_full(prompt)
        final_lbl, conf, candidates, _rule = self._gate(
            lgbm_lbl, lgbm_conf, lgbm_cands,
            t2_lbl, t2_conf, t2_cands,
        )
        return final_lbl, conf, candidates

    def predict_route(self, prompt: str) -> dict[str, Any]:
        """
        Returns dict matching router-v3-output.schema.json, with an extra
        optional 'ensemble_rule' field for observability.
        """
        lgbm_lbl, lgbm_conf, lgbm_cands = self._lgbm.predict_single_full(prompt)
        if lgbm_conf >= self.conf_gate:
            primary_tier, primary_effort = lgbm_lbl.split("|")
            return {
                "schema_version": SCHEMA_VERSION,
                "primary": {"model_tier": primary_tier, "effort": primary_effort},
                "candidates": [
                    {
                        "model_tier": lbl.split("|")[0],
                        "effort": lbl.split("|")[1],
                        "confidence": round(p, 4),
                    }
                    for lbl, p in lgbm_cands
                ],
                "confidence": round(lgbm_conf, 4),
                "ensemble_rule": "lgb-confident",
            }

        t2_lbl, t2_conf, t2_cands = self._t2.predict_single_full(prompt)
        final_lbl, confidence, candidates, rule = self._gate(
            lgbm_lbl, lgbm_conf, lgbm_cands,
            t2_lbl, t2_conf, t2_cands,
        )
        primary_tier, primary_effort = final_lbl.split("|")
        return {
            "schema_version": SCHEMA_VERSION,
            "primary": {"model_tier": primary_tier, "effort": primary_effort},
            "candidates": [
                {
                    "model_tier": lbl.split("|")[0],
                    "effort": lbl.split("|")[1],
                    "confidence": round(p, 4),
                }
                for lbl, p in candidates
            ],
            "confidence": round(confidence, 4),
            "ensemble_rule": rule,
        }

    def predict_texts(self, texts: list[str]) -> list[str]:
        results = []
        for text in texts:
            lbl, _conf, _cands = self.predict_single_full(text)
            results.append(lbl)
        return results

    def predict(self, rows: list[dict]) -> list[str]:
        return self.predict_texts([r["prompt"] for r in rows])


# ---------------------------------------------------------------------------
# Candidate merge helper
# ---------------------------------------------------------------------------

def _cost_key(lbl: str) -> tuple[int, int]:
    parts = lbl.split("|")
    return (TIER_ORDER.get(parts[0], 99), EFFORT_ORDER.get(parts[1], 99))


def _merge_candidates(
    primary_cands: list[tuple[str, float]],
    secondary_cands: list[tuple[str, float]],
) -> list[tuple[str, float]]:
    """Union of two candidate lists, deduped by max confidence, sorted by ascending cost."""
    cand_map: dict[str, float] = {}
    for lbl, p in primary_cands:
        cand_map[lbl] = max(cand_map.get(lbl, 0.0), p)
    for lbl, p in secondary_cands:
        cand_map[lbl] = max(cand_map.get(lbl, 0.0), p)
    return sorted(cand_map.items(), key=lambda x: _cost_key(x[0]))
