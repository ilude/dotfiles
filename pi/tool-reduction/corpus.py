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
import time
from pathlib import Path

import portalocker
from scrub import scrub_secrets  # noqa: E402 (sys.path insertion in tests)

_HEAD_BYTES = 2048
_TAIL_BYTES = 2048
_RETENTION_SECONDS = 7 * 24 * 60 * 60
_MAX_CACHE_BYTES = 64 * 1024 * 1024


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


def prune_corpus_cache(
    cache_dir: Path,
    *,
    now: float | None = None,
    retention_seconds: int = _RETENTION_SECONDS,
    max_bytes: int = _MAX_CACHE_BYTES,
    dry_run: bool = False,
) -> list[Path]:
    """Remove expired and oldest corpus files, or report them in dry-run mode."""
    current_time = time.time() if now is None else now
    files = []
    removals: list[Path] = []
    for file_path in sorted(cache_dir.glob("corpus-*.jsonl")):
        try:
            stat = file_path.stat()
        except OSError:
            continue
        if current_time - stat.st_mtime > retention_seconds:
            removals.append(file_path)
        else:
            files.append((file_path, stat.st_mtime, stat.st_size))

    total = sum(size for _, _, size in files)
    for file_path, _, size in sorted(files, key=lambda item: item[1]):
        if total <= max_bytes:
            break
        removals.append(file_path)
        total -= size

    if not dry_run:
        for file_path in removals:
            try:
                file_path.unlink()
            except FileNotFoundError:
                pass
    return removals


def log_reduction(record: dict, path: Path | None = None) -> None:
    """Append one record to the corpus file, scrubbing secrets before truncation."""
    if path is None:
        path = default_path()

    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        prune_corpus_cache(path.parent)

    # Scrub BEFORE truncation so tokens beyond the 2KB head are still caught
    stdout_raw = record.get("stdout_sample", "") or ""
    scrubbed_stdout = scrub_secrets(stdout_raw)

    out = dict(record)
    out.pop("stderr_sample", None)
    out["stdout_sample"] = _truncate_sample(scrubbed_stdout)

    line = json.dumps(out, ensure_ascii=False) + "\n"

    with portalocker.Lock(str(path), mode="a", flags=portalocker.LOCK_EX, encoding="utf-8") as fh:
        fh.write(line)
