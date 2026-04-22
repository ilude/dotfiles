# OS-corpus segregation policy:
# Each OS environment (native Windows, WSL, Linux, macOS) maintains its own corpus
# under that environment's ~/.cache/pi/tool-reduction/ path. These corpora are
# intentionally separate -- different environments run different CLI versions
# (e.g., Windows git.exe vs WSL git), and merging would corrupt drift-detection
# and training signals. No cross-environment sync is performed. The eval harness
# accepts multiple --corpus paths for users who want to combine them manually.

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import portalocker
from scrub import scrub_secrets  # noqa: E402 (sys.path insertion in tests)

_HEAD_BYTES = 2048
_TAIL_BYTES = 2048


def default_path() -> Path:
    filename = f"corpus-{date.today().isoformat()}.jsonl"
    return Path.home() / ".cache" / "pi" / "tool-reduction" / filename


def _truncate_sample(text: str) -> str:
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= _HEAD_BYTES + _TAIL_BYTES:
        return text
    head = encoded[:_HEAD_BYTES].decode("utf-8", errors="replace")
    tail = encoded[-_TAIL_BYTES:].decode("utf-8", errors="replace")
    return head + "..." + tail


def log_reduction(record: dict, path: Path | None = None) -> None:
    """Append one record to the corpus file, scrubbing secrets before truncation."""
    if path is None:
        path = default_path()

    path.parent.mkdir(parents=True, exist_ok=True)

    # Scrub BEFORE truncation so tokens beyond the 2KB head are still caught
    stdout_raw = record.get("stdout_sample", "") or ""
    stderr_raw = record.get("stderr_sample", "") or ""

    scrubbed_stdout = scrub_secrets(stdout_raw)
    scrubbed_stderr = scrub_secrets(stderr_raw)

    out = dict(record)
    out["stdout_sample"] = _truncate_sample(scrubbed_stdout)
    out["stderr_sample"] = _truncate_sample(scrubbed_stderr)

    line = json.dumps(out, ensure_ascii=False) + "\n"

    with portalocker.Lock(str(path), mode="a", flags=portalocker.LOCK_EX, encoding="utf-8") as fh:
        fh.write(line)
