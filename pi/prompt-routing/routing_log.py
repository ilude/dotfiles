"""Privacy-safe append-only prompt-router decision logging."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

_DIR = Path(__file__).parent
_LOG_DIR = _DIR / "logs"
_LOG_PATH = _LOG_DIR / "routing_log.jsonl"
_LOG_LOCK = threading.Lock()

TIER_TO_SIZE = {"mini": "small", "core": "medium", "large": "large"}

logging_enabled = os.environ.get("LOG_ROUTING", "1") != "0"
log_full_prompt = os.environ.get("LOG_ROUTING_PROMPT", "0") == "1"
log_excerpt = os.environ.get("LOG_ROUTING_EXCERPT", "0") == "1"
log_dir = _LOG_DIR
log_path = _LOG_PATH

logger = logging.getLogger(__name__)


def _excerpt(prompt: str, max_chars: int = 160) -> str:
    if len(prompt) <= max_chars:
        return prompt
    return f"{prompt[: max_chars - 3]}..."


def append_routing_log(
    prompt: str,
    result: dict,
    elapsed_us: float,
    route_decision_id: str | None = None,
) -> None:
    """Append one classifier decision without exposing prompt text by default."""
    if not logging_enabled:
        return
    try:
        log_dir.mkdir(exist_ok=True)
        primary = dict(result["primary"])
        model_tier = primary.pop("model_tier", None)
        primary["model_size"] = TIER_TO_SIZE.get(model_tier, "medium")
        timestamp = datetime.now(timezone.utc).isoformat()
        entry = {
            "ts": time.time(),
            "timestamp": timestamp,
            "prompt_hash": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
            "route_decision_id": route_decision_id or f"route-{uuid.uuid4()}",
            "primary": primary,
            "confidence": result["confidence"],
            "elapsed_us": round(elapsed_us, 1),
            "schema_version": result.get("schema_version", "3.0.0"),
        }
        if log_excerpt:
            entry["prompt_excerpt"] = _excerpt(prompt)
        if log_full_prompt:
            entry["prompt"] = prompt
        with _LOG_LOCK:
            with log_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as exc:
        logger.warning("router: logging failed (non-fatal): %s", exc)
