"""
classifier_ensemble.py -- EnsembleV3Classifier: veto ensemble of T2 + LightGBM models.

Loads both serialized models at init with SHA256 verification and applies a
veto rule: the ensemble always takes the maximum (higher-cost) prediction when
the two models disagree on tier or effort.

Public API:
  EnsembleV3Classifier()           -- loads both models, verifies SHA256
  predict_route(prompt) -> dict    -- returns dict matching router-v3-output.schema.json
  predict_single_full(prompt)      -- returns (label, confidence, candidates) like V3Classifier
  predict_texts(texts)             -- returns list[str] of "Tier|effort" labels
  predict(rows)                    -- returns list[str] from list of corpus rows
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

TIER_ORDER = {"Haiku": 0, "Sonnet": 1, "Opus": 2}
EFFORT_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}

_TIERS = ["Haiku", "Sonnet", "Opus"]
_EFFORTS = ["none", "low", "medium", "high"]

# Inverted maps for index -> label
_IDX_TO_TIER = {v: k for k, v in TIER_ORDER.items()}
_IDX_TO_EFFORT = {v: k for k, v in EFFORT_ORDER.items()}


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
# Lazy singleton loader (module-level, mirrors router.py pattern)
# ---------------------------------------------------------------------------

_ensemble = None
_ensemble_lock = threading.Lock()


def _load_ensemble() -> "EnsembleV3Classifier":
    clf = EnsembleV3Classifier.__new__(EnsembleV3Classifier)
    clf._load_models()
    return clf


def get_ensemble() -> "EnsembleV3Classifier":
    global _ensemble
    if _ensemble is None:
        with _ensemble_lock:
            if _ensemble is None:
                _ensemble = _load_ensemble()
    return _ensemble


# ---------------------------------------------------------------------------
# Veto ensemble
# ---------------------------------------------------------------------------

class EnsembleV3Classifier:
    """
    Veto ensemble: combines T2 (LinearSVC) and LightGBM classifiers.

    Veto rule (applied to joint tier|effort label):
      - tier  = max(t2_tier, lgbm_tier)   by TIER_ORDER ordinal
      - effort = max(t2_effort, lgbm_effort) by EFFORT_ORDER ordinal
      - If one model says Haiku and the other says Sonnet/Opus, escalate
        to the non-Haiku model's full prediction (tier + effort).
      - confidence = min(t2_confidence, lgbm_confidence) -- reflects the
        less-certain model.
      - candidates = union of both models' candidates, deduped, sorted by
        ascending cost.
      - ensemble_rule field records which rule fired.
    """

    def __init__(self) -> None:
        self._load_models()

    def _load_models(self) -> None:
        t2_sha = _verify_sha256(T2_MODEL_PATH, T2_HASH_PATH)
        lgbm_sha = _verify_sha256(LGBM_MODEL_PATH, LGBM_HASH_PATH)
        self._t2 = joblib.load(T2_MODEL_PATH)
        self._lgbm = joblib.load(LGBM_MODEL_PATH)
        self._t2_sha = t2_sha[:16]
        self._lgbm_sha = lgbm_sha[:16]

    # ------------------------------------------------------------------
    # Core veto logic
    # ------------------------------------------------------------------

    def _veto(
        self,
        t2_label: str,
        t2_conf: float,
        t2_candidates: list[tuple[str, float]],
        lgbm_label: str,
        lgbm_conf: float,
        lgbm_candidates: list[tuple[str, float]],
    ) -> tuple[str, float, list[tuple[str, float]], str]:
        """
        Returns (final_label, confidence, candidates, ensemble_rule).
        """
        t2_tier, t2_effort = t2_label.split("|")
        lgbm_tier, lgbm_effort = lgbm_label.split("|")

        t2_tier_ord = TIER_ORDER[t2_tier]
        lgbm_tier_ord = TIER_ORDER[lgbm_tier]

        # Detect Haiku-vs-nonHaiku disagreement -- veto escalates fully.
        t2_is_haiku = t2_tier == "Haiku"
        lgbm_is_haiku = lgbm_tier == "Haiku"

        if t2_is_haiku and not lgbm_is_haiku:
            # LightGBM vetoes -- use LightGBM's full prediction.
            final_label = lgbm_label
            rule = "veto_escalate_tier"
            # Winning model is LightGBM (its route survived).
            confidence = lgbm_conf
        elif lgbm_is_haiku and not t2_is_haiku:
            # T2 vetoes -- use T2's full prediction.
            final_label = t2_label
            rule = "veto_escalate_tier"
            # Winning model is T2 (its route survived).
            confidence = t2_conf
        else:
            # Both agree on Haiku or both are Sonnet/Opus -- apply ordinal max.
            final_tier_ord = max(t2_tier_ord, lgbm_tier_ord)
            final_tier = _IDX_TO_TIER[final_tier_ord]

            t2_effort_ord = EFFORT_ORDER[t2_effort]
            lgbm_effort_ord = EFFORT_ORDER[lgbm_effort]
            final_effort_ord = max(t2_effort_ord, lgbm_effort_ord)
            final_effort = _IDX_TO_EFFORT[final_effort_ord]

            final_label = f"{final_tier}|{final_effort}"

            tier_agree = t2_tier_ord == lgbm_tier_ord
            effort_agree = t2_effort_ord == lgbm_effort_ord
            if tier_agree and effort_agree:
                rule = "agree"
                # Both predict the same route -- use the more confident model's view.
                confidence = max(t2_conf, lgbm_conf)
            else:
                rule = "veto_escalate_effort"
                # The model that drove the higher effort wins; use its confidence.
                if t2_effort_ord >= lgbm_effort_ord:
                    confidence = t2_conf
                else:
                    confidence = lgbm_conf

        # Candidates: union deduped, sorted by ascending cost.
        cand_map: dict[str, float] = {}
        for lbl, p in t2_candidates:
            cand_map[lbl] = max(cand_map.get(lbl, 0.0), p)
        for lbl, p in lgbm_candidates:
            cand_map[lbl] = max(cand_map.get(lbl, 0.0), p)

        def cost_key(lbl: str) -> tuple[int, int]:
            parts = lbl.split("|")
            return (TIER_ORDER.get(parts[0], 99), EFFORT_ORDER.get(parts[1], 99))

        candidates = sorted(cand_map.items(), key=lambda x: cost_key(x[0]))

        return final_label, confidence, candidates, rule

    # ------------------------------------------------------------------
    # Public API (mirrors V3Classifier)
    # ------------------------------------------------------------------

    def predict_single_full(
        self, prompt: str
    ) -> tuple[str, float, list[tuple[str, float]]]:
        t2_lbl, t2_conf, t2_cands = self._t2.predict_single_full(prompt)
        lgbm_lbl, lgbm_conf, lgbm_cands = self._lgbm.predict_single_full(prompt)
        final_lbl, conf, candidates, _rule = self._veto(
            t2_lbl, t2_conf, t2_cands,
            lgbm_lbl, lgbm_conf, lgbm_cands,
        )
        return final_lbl, conf, candidates

    def predict_route(self, prompt: str) -> dict[str, Any]:
        """
        Returns dict matching router-v3-output.schema.json, with an extra
        optional 'ensemble_rule' field for observability.
        """
        t2_lbl, t2_conf, t2_cands = self._t2.predict_single_full(prompt)
        lgbm_lbl, lgbm_conf, lgbm_cands = self._lgbm.predict_single_full(prompt)
        final_lbl, confidence, candidates, rule = self._veto(
            t2_lbl, t2_conf, t2_cands,
            lgbm_lbl, lgbm_conf, lgbm_cands,
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
