"""
router.py -- Production interface for the prompt routing classifier.

Loads model.pkl once at import time (after SHA256 verification) and exposes
a single public function:

    from router import route
    tier = route("Design a distributed consensus protocol...")
    # returns 'low' | 'mid' | 'high'

Thread-safe: the underlying sklearn Pipeline.predict_proba() is read-only after
fit, so concurrent calls are safe without locking.

Confidence floor:
    If P(high) > HIGH_FLOOR_THRESHOLD and the hard prediction is 'low', the
    router upgrades the route to 'mid'. This prevents Haiku from receiving
    prompts where the model assigns meaningful probability to Opus-tier
    complexity, even when the MAP prediction falls below that threshold.

    Empirically (holdout analysis, 2026-03-31):
      - P(high) > 0.20 escalates ~1% of traffic, zero inversions
      - P(high) > 0.10 escalates ~6%, also zero inversions but more over-routing
    Current setting: HIGH_FLOOR_THRESHOLD = 0.20

Logging:
    Each call is appended to logs/routing_log.jsonl so the daily audit job
    (audit.py) can compare router predictions against Opus labels and flag
    divergences for corpus review. Calibrated probabilities are logged alongside
    the tier and a floor_applied flag.

    Set LOG_ROUTING=0 to disable logging (e.g. in tests).

Security:
    SHA256 of model.pkl is verified against model.pkl.sha256 before loading.
    If the hash mismatches, RuntimeError is raised -- the model is not loaded.
    Never call this module with a model.pkl from an untrusted source.
"""

import hashlib
import json
import logging
import os
import pickle
import threading
import time
from pathlib import Path
from typing import Literal

from scipy.special import softmax as _softmax

_DIR = Path(__file__).parent
_MODEL_PATH = _DIR / "model.pkl"
_HASH_PATH = _DIR / "model.pkl.sha256"
_LOG_DIR = _DIR / "logs"
_LOG_PATH = _LOG_DIR / "routing_log.jsonl"

Tier = Literal["low", "mid", "high"]

# Confidence floor: if P(high) exceeds this, never route to Haiku.
# Tuned on holdout set -- see training-log.txt threshold analysis section.
HIGH_FLOOR_THRESHOLD: float = 0.20

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Model loading -- once at import time
# ---------------------------------------------------------------------------


def _verify_and_load():
    if not _MODEL_PATH.exists():
        raise FileNotFoundError(f"model.pkl not found at {_MODEL_PATH}. Run train.py first.")
    if not _HASH_PATH.exists():
        raise FileNotFoundError(f"model.pkl.sha256 not found at {_HASH_PATH}. Run train.py first.")
    expected = _HASH_PATH.read_text().strip()
    actual = hashlib.sha256(_MODEL_PATH.read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError(
            f"model.pkl SHA256 mismatch -- file may be corrupted or tampered.\n"
            f"  expected: {expected}\n"
            f"  actual:   {actual}\n"
            f"Re-run train.py to regenerate a trusted model."
        )
    with open(_MODEL_PATH, "rb") as f:
        model = pickle.load(f)
    logger.debug("router: model loaded (SHA256 verified: %s...)", actual[:16])
    return model


_model = _verify_and_load()
_classes: list[str] = list(_model.classes_)
_hi_idx: int = _classes.index("high")


def _proba(text_list: list[str]):
    """Return softmax(decision_function) as an approximate probability matrix.

    Not perfectly calibrated (Brier ~0.044 for HIGH class) but monotonically
    ordered -- higher score always means higher true probability, which is
    sufficient for the 0.20 threshold rule.
    """
    df = _model.decision_function(text_list)
    return _softmax(df, axis=1)


# ---------------------------------------------------------------------------
# Log setup -- append-only JSONL, best-effort (never raises)
# ---------------------------------------------------------------------------

_log_lock = threading.Lock()
_logging_enabled = os.environ.get("LOG_ROUTING", "1") != "0"


def _log(
    prompt: str,
    tier: Tier,
    raw_pred: Tier,
    proba: dict[str, float],
    elapsed_us: float,
) -> None:
    if not _logging_enabled:
        return
    try:
        _LOG_DIR.mkdir(exist_ok=True)
        entry = {
            "ts": time.time(),
            "prompt": prompt,
            "tier": tier,
            "raw_pred": raw_pred,  # prediction before floor applied
            "floor_applied": tier != raw_pred,
            "proba": proba,  # calibrated probabilities
            "elapsed_us": round(elapsed_us, 1),
            "reviewed": False,
        }
        with _log_lock:
            with open(_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as exc:
        logger.warning("router: logging failed (non-fatal): %s", exc)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def route(prompt: str, *, log: bool = True) -> Tier:
    """
    Route a prompt to the appropriate model tier.

    Applies the P(high) confidence floor: if the model assigns more than
    HIGH_FLOOR_THRESHOLD probability to the 'high' class, the route is
    upgraded from 'low' to 'mid'. This prevents Haiku from receiving
    prompts with meaningful Opus-tier probability mass.

    Args:
        prompt: The user prompt text.
        log:    Whether to append this call to logs/routing_log.jsonl.

    Returns:
        'low'  -- route to Haiku  (P(high) <= threshold AND predicted low)
        'mid'  -- route to Sonnet
        'high' -- route to Opus
    """
    if not prompt or not prompt.strip():
        return "mid"  # safe default for empty input

    t0 = time.perf_counter()

    proba_arr = _proba([prompt])[0]
    raw_pred: Tier = _classes[int(proba_arr.argmax())]

    # Confidence floor: never route to Haiku when P(high) is meaningful
    if raw_pred == "low" and proba_arr[_hi_idx] > HIGH_FLOOR_THRESHOLD:
        tier: Tier = "mid"
    else:
        tier = raw_pred

    elapsed_us = (time.perf_counter() - t0) * 1e6

    if log:
        proba = {cls: round(float(p), 4) for cls, p in zip(_classes, proba_arr)}
        _log(prompt, tier, raw_pred, proba, elapsed_us)

    return tier


def route_with_proba(prompt: str, *, log: bool = True) -> tuple[Tier, dict[str, float]]:
    """
    Route a prompt and return the approximate probability distribution.

    Probabilities are softmax(decision_function) -- monotonically correct
    but not perfectly calibrated. Brier(HIGH) ~0.044.

    Returns:
        (tier, proba) where proba is {'low': 0.xx, 'mid': 0.xx, 'high': 0.xx}
    """
    if not prompt or not prompt.strip():
        return "mid", {"low": 0.0, "mid": 1.0, "high": 0.0}

    t0 = time.perf_counter()
    proba_arr = _proba([prompt])[0]
    raw_pred: Tier = _classes[int(proba_arr.argmax())]

    if raw_pred == "low" and proba_arr[_hi_idx] > HIGH_FLOOR_THRESHOLD:
        tier: Tier = "mid"
    else:
        tier = raw_pred

    elapsed_us = (time.perf_counter() - t0) * 1e6
    proba = {cls: round(float(p), 4) for cls, p in zip(_classes, proba_arr)}

    if log:
        _log(prompt, tier, raw_pred, proba, elapsed_us)

    return tier, proba


def route_batch(prompts: list[str], *, log: bool = True) -> list[Tier]:
    """
    Route a batch of prompts. More efficient than calling route() in a loop
    (single TF-IDF transform pass). Applies the same P(high) floor as route().

    Returns a list of tiers in the same order as the input.
    """
    if not prompts:
        return []

    t0 = time.perf_counter()
    proba_matrix = _proba(prompts)
    elapsed_us = (time.perf_counter() - t0) * 1e6 / len(prompts)

    tiers: list[Tier] = []
    for i, prompt in enumerate(prompts):
        row = proba_matrix[i]
        raw_pred: Tier = _classes[int(row.argmax())]
        if raw_pred == "low" and row[_hi_idx] > HIGH_FLOOR_THRESHOLD:
            tier: Tier = "mid"
        else:
            tier = raw_pred
        tiers.append(tier)
        if log:
            proba = {cls: round(float(p), 4) for cls, p in zip(_classes, row)}
            _log(prompt, tier, raw_pred, proba, elapsed_us)

    return tiers


if __name__ == "__main__":
    examples = [
        "What is Python?",
        "Write a REST API endpoint in FastAPI that returns a list of users.",
        "Design the authentication architecture for a multi-tenant SaaS platform.",
    ]
    print("Routing smoke test (with calibrated probabilities):")
    for prompt in examples:
        tier, proba = route_with_proba(prompt, log=False)
        print(f"  [{tier:4}]  P={proba}  {prompt}")
