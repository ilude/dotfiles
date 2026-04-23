"""
router.py -- Production interface for the v3 route-level prompt routing classifier.

Loads router_v3.joblib once at import time (after SHA256 verification) and
exposes a single public function:

    from router import recommend
    result = recommend("Design a distributed consensus protocol...")
    # returns dict matching router-v3-output.schema.json

Thread-safe: the underlying sklearn Pipeline is read-only after fit, so
concurrent calls are safe without locking.

SHA256 verification:
    router_v3.sha256 is read and compared against the actual file hash on
    every module import. RuntimeError is raised on mismatch; the model is not
    loaded. Never load from an untrusted source.

Logging:
    Each call is appended to logs/routing_log.jsonl when LOG_ROUTING != "0".
    Set LOG_ROUTING=0 to disable (e.g. in tests).
"""

import hashlib
import json
import logging
import os
import threading
import time
from pathlib import Path

_DIR = Path(__file__).parent
_MODEL_PATH = _DIR / "models" / "router_v3.joblib"
_HASH_PATH = _DIR / "models" / "router_v3.sha256"
_LOG_DIR = _DIR / "logs"
_LOG_PATH = _LOG_DIR / "routing_log.jsonl"

SCHEMA_VERSION = "3.0.0"

TIER_ORDER = {"Haiku": 0, "Sonnet": 1, "Opus": 2}
EFFORT_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Model loading -- lazy singleton
# ---------------------------------------------------------------------------

_model = None
_model_lock = threading.Lock()


def _verify_sha256() -> str:
    if not _HASH_PATH.exists():
        raise FileNotFoundError(
            f"router_v3.sha256 not found at {_HASH_PATH}. Run train.py first."
        )
    if not _MODEL_PATH.exists():
        raise FileNotFoundError(
            f"router_v3.joblib not found at {_MODEL_PATH}. Run train.py first."
        )
    expected = _HASH_PATH.read_text().strip()
    actual = hashlib.sha256(_MODEL_PATH.read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError(
            f"router_v3.joblib SHA256 mismatch -- file may be corrupted or tampered.\n"
            f"  expected: {expected}\n"
            f"  actual:   {actual}\n"
            f"Re-run train.py to regenerate a trusted model."
        )
    return actual


def _load_model():
    import joblib
    sha = _verify_sha256()
    model = joblib.load(_MODEL_PATH)
    logger.debug("router: model loaded (SHA256 verified: %s...)", sha[:16])
    return model


def _get_model():
    """Lazy singleton loader. Loads once, reuses across all calls."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = _load_model()
    return _model


# ---------------------------------------------------------------------------
# Log setup -- append-only JSONL, best-effort (never raises)
# ---------------------------------------------------------------------------

_log_lock = threading.Lock()
_logging_enabled = os.environ.get("LOG_ROUTING", "1") != "0"


def _log(prompt: str, result: dict, elapsed_us: float) -> None:
    if not _logging_enabled:
        return
    try:
        _LOG_DIR.mkdir(exist_ok=True)
        entry = {
            "ts": time.time(),
            "prompt": prompt,
            "primary": result["primary"],
            "confidence": result["confidence"],
            "elapsed_us": round(elapsed_us, 1),
            "schema_version": SCHEMA_VERSION,
        }
        with _log_lock:
            with open(_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as exc:
        logger.warning("router: logging failed (non-fatal): %s", exc)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def recommend(prompt: str) -> dict:
    """
    Route a prompt to the cheapest acceptable (model_tier, effort) route.

    Returns a dict matching router-v3-output.schema.json:
    {
        "schema_version": "3.0.0",
        "primary": {"model_tier": "Sonnet", "effort": "medium"},
        "candidates": [
            {"model_tier": "Haiku", "effort": "low", "confidence": 0.21},
            {"model_tier": "Sonnet", "effort": "medium", "confidence": 0.72},
            ...
        ],
        "confidence": 0.72
    }

    Raises:
        FileNotFoundError: if model or sha256 sidecar is missing
        RuntimeError: if SHA256 verification fails
    """
    if not prompt or not prompt.strip():
        return _safe_default()

    t0 = time.perf_counter()
    clf = _get_model()
    primary_label, confidence, candidates = clf.predict_single_full(prompt)
    elapsed_us = (time.perf_counter() - t0) * 1e6

    primary_tier, primary_effort = primary_label.split("|")
    result = {
        "schema_version": SCHEMA_VERSION,
        "primary": {"model_tier": primary_tier, "effort": primary_effort},
        "candidates": [
            {"model_tier": lbl.split("|")[0], "effort": lbl.split("|")[1],
             "confidence": round(score, 4)}
            for lbl, score in candidates
        ],
        "confidence": round(confidence, 4),
    }

    _log(prompt, result, elapsed_us)
    return result


def _safe_default() -> dict:
    """Return a safe Sonnet|medium default for empty/whitespace prompts."""
    return {
        "schema_version": SCHEMA_VERSION,
        "primary": {"model_tier": "Sonnet", "effort": "medium"},
        "candidates": [
            {"model_tier": "Sonnet", "effort": "medium", "confidence": 1.0}
        ],
        "confidence": 1.0,
    }


if __name__ == "__main__":
    examples = [
        "What is Python?",
        "Write a REST API endpoint in FastAPI that returns a list of users.",
        "Design the authentication architecture for a multi-tenant SaaS platform.",
    ]
    print("Router v3 smoke test:")
    for prompt in examples:
        out = recommend(prompt)
        print(f"  [{out['primary']['model_tier']}|{out['primary']['effort']}]"
              f"  conf={out['confidence']:.3f}  {prompt[:60]}")
