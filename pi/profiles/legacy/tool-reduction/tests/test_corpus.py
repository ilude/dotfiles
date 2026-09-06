import json
import multiprocessing
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from corpus import default_path, log_reduction, prune_corpus_cache


def _write_records(args: tuple[Path, int]) -> None:
    path, count = args
    for i in range(count):
        log_reduction(
            {
                "ts": "2026-01-01T00:00:00Z",
                "argv": ["git", "status"],
                "exit_code": 0,
                "bytes_before": 100,
                "bytes_after": 50,
                "rule_id": "git/status",
                "reduction_applied": True,
                "stdout_sample": f"worker output {i}",
            },
            path=path,
        )


def test_concurrent_append() -> None:
    with tempfile.NamedTemporaryFile(suffix=".jsonl", delete=False) as tmp:
        path = Path(tmp.name)

    workers = 10
    records_each = 100

    with multiprocessing.Pool(workers) as pool:
        pool.map(_write_records, [(path, records_each)] * workers)

    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == workers * records_each, (
        f"Expected {workers * records_each} lines, got {len(lines)}"
    )
    for line in lines:
        json.loads(line)  # must parse cleanly


def test_default_path_cross_platform() -> None:
    p = default_path()
    assert isinstance(p, Path)
    assert p.is_absolute()
    assert str(p).startswith(str(Path.home()))


def test_scrub_before_truncation() -> None:
    # Place a GitHub token at offset ~3000 -- well beyond the 2048-byte head cutoff.
    # scrub_secrets must run on the full text before truncation so the token is caught.
    token = "ghp_" + "X" * 36
    padding = "A" * 3000
    stdout_with_token = padding + token

    with tempfile.NamedTemporaryFile(suffix=".jsonl", delete=False) as tmp:
        path = Path(tmp.name)

    log_reduction(
        {
            "ts": "2026-01-01T00:00:00Z",
            "argv": ["echo"],
            "exit_code": 0,
            "bytes_before": len(stdout_with_token),
            "bytes_after": len(stdout_with_token),
            "rule_id": None,
            "reduction_applied": False,
            "stdout_sample": stdout_with_token,
        },
        path=path,
    )

    record = json.loads(path.read_text(encoding="utf-8").strip())
    assert "[REDACTED:github]" in record["stdout_sample"], (
        "Token beyond 2KB head should still be redacted (scrub runs before truncation)"
    )
    assert token not in record["stdout_sample"]
    assert "stderr_sample" not in record


def test_retention_dry_run_reports_without_deleting(tmp_path) -> None:
    expired = tmp_path / "corpus-2026-01-01.jsonl"
    newest = tmp_path / "corpus-2026-01-02.jsonl"
    expired.write_text("old", encoding="utf-8")
    newest.write_text("new", encoding="utf-8")
    expired.touch()
    newest.touch()
    expired_mtime = 1000.0
    newest_mtime = 1900.0
    import os

    os.utime(expired, (expired_mtime, expired_mtime))
    os.utime(newest, (newest_mtime, newest_mtime))

    removals = prune_corpus_cache(
        tmp_path,
        now=2000.0,
        retention_seconds=500,
        max_bytes=1024,
        dry_run=True,
    )

    assert removals == [expired]
    assert expired.exists()
    assert newest.exists()


def test_retention_enforces_size_cap(tmp_path) -> None:
    oldest = tmp_path / "corpus-2026-01-01.jsonl"
    newest = tmp_path / "corpus-2026-01-02.jsonl"
    oldest.write_text("1234", encoding="utf-8")
    newest.write_text("5678", encoding="utf-8")
    import os

    os.utime(oldest, (1000.0, 1000.0))
    os.utime(newest, (2000.0, 2000.0))

    removals = prune_corpus_cache(
        tmp_path,
        now=2000.0,
        retention_seconds=5000,
        max_bytes=4,
    )

    assert removals == [oldest]
    assert not oldest.exists()
    assert newest.exists()
