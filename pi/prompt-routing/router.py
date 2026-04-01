"""
router.py — Production interface for the prompt routing classifier.

Loads model.pkl once at import time (after SHA256 verification) and exposes
a single public function:

    from router import route
    tier = route("Design a distributed consensus protocol...")
    # returns 'low' | 'mid' | 'high'

Thread-safe: the underlying sklearn Pipeline.predict() is read-only after fit,
so concurrent calls are safe without locking.

Logging:
    Each call is appended to logs/routing_log.jsonl so the daily audit job
    (audit.py) can compare router predictions against Opus labels and flag
    divergences for corpus review.

    Set LOG_ROUTING=0 to disable logging (e.g. in tests).

Security:
    SHA256 of model.pkl is verified against model.pkl.sha256 before loading.
    If the hash mismatches, RuntimeError is raised — the model is not loaded.
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

_DIR = Path(__file__).parent
_MODEL_PATH = _DIR / "model.pkl"
_HASH_PATH = _DIR / "model.pkl.sha256"
_LOG_DIR = _DIR / "logs"
_LOG_PATH = _LOG_DIR / "routing_log.jsonl"

Tier = Literal["low", "mid", "high"]

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model loading — once at import time
# ---------------------------------------------------------------------------

def _verify_and_load():
    if not _MODEL_PATH.exists():
        raise FileNotFoundError(
            f"model.pkl not found at {_MODEL_PATH}. Run train.py first."
        )
    if not _HASH_PATH.exists():
        raise FileNotFoundError(
            f"model.pkl.sha256 not found at {_HASH_PATH}. Run train.py first."
        )
    expected = _HASH_PATH.read_text().strip()
    actual = hashlib.sha256(_MODEL_PATH.read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError(
            f"model.pkl SHA256 mismatch — file may be corrupted or tampered.\n"
            f"  expected: {expected}\n"
            f"  actual:   {actual}\n"
            f"Re-run train.py to regenerate a trusted model."
        )
    with open(_MODEL_PATH, "rb") as f:
        model = pickle.load(f)
    logger.debug("router: model loaded (SHA256 verified: %s...)", actual[:16])
    return model


_model = _verify_and_load()

# ---------------------------------------------------------------------------
# Log setup — append-only JSONL, best-effort (never raises)
# ---------------------------------------------------------------------------

_log_lock = threading.Lock()
_logging_enabled = os.environ.get("LOG_ROUTING", "1") != "0"


def _log(prompt: str, tier: Tier, scores: dict[str, float], elapsed_us: float) -> None:
    if not _logging_enabled:
        return
    try:
        _LOG_DIR.mkdir(exist_ok=True)
        entry = {
            "ts": time.time(),
            "prompt": prompt,
            "tier": tier,
            "scores": scores,
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

    Args:
        prompt: The user prompt text.
        log:    Whether to append this call to logs/routing_log.jsonl.
                Set False in tests or when logging overhead is unacceptable.

    Returns:
        'low'  — route to Haiku
        'mid'  — route to Sonnet
        'high' — route to Opus
    """
    if not prompt or not prompt.strip():
        return "mid"  # safe default for empty input

    t0 = time.perf_counter()
    tier: Tier = _model.predict([prompt])[0]
    elapsed_us = (time.perf_counter() - t0) * 1e6

    if log:
        # decision_function gives margin distances — useful for confidence audit
        try:
            raw_scores = _model.decision_function([prompt])[0]
            classes = list(_model.classes_)
            scores = {cls: round(float(s), 4) for cls, s in zip(classes, raw_scores)}
        except Exception:
            scores = {}
        _log(prompt, tier, scores, elapsed_us)

    return tier


def route_batch(prompts: list[str], *, log: bool = True) -> list[Tier]:
    """
    Route a batch of prompts. More efficient than calling route() in a loop
    for large batches (single TF-IDF transform pass).

    Returns a list of tiers in the same order as the input.
    """
    if not prompts:
        return []

    t0 = time.perf_counter()
    tiers: list[Tier] = list(_model.predict(prompts))
    elapsed_us = (time.perf_counter() - t0) * 1e6 / len(prompts)

    if log:
        try:
            all_scores = _model.decision_function(prompts)
            classes = list(_model.classes_)
        except Exception:
            all_scores = [[] for _ in prompts]
            classes = []

        for prompt, tier, raw in zip(prompts, tiers, all_scores):
            scores = {cls: round(float(s), 4) for cls, s in zip(classes, raw)} if len(raw) else {}
            _log(prompt, tier, scores, elapsed_us)

    return tiers


if __name__ == "__main__":
    # Quick smoke test
    examples = [
        "What is Python?",
        "Write a REST API endpoint in FastAPI that returns a list of users.",
        "Design the authentication architecture for a multi-tenant SaaS platform.",
    ]
    print("Routing smoke test:")
    for prompt in examples:
        tier = route(prompt, log=False)
        print(f"  [{tier:4}]  {prompt}")
