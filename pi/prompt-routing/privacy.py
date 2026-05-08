"""Privacy helpers shared by prompt-routing CLIs.

Keep in parity with pi/lib/transcript.ts sha256Hex: raw UTF-8 SHA256, no
normalization beyond exactly the supplied text.
"""

from __future__ import annotations

import hashlib


def prompt_sha256_hex(text: str) -> str:
    """Return the stable prompt hash used by the TypeScript runtime."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def redact_excerpt(text: str, max_chars: int = 120) -> str:
    """Deterministic opt-in excerpt redaction; never used by default eval output."""
    collapsed = " ".join(text.split())[:max_chars]
    return "".join("#" if ch.isalnum() else ch for ch in collapsed)
