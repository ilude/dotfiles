import json
import multiprocessing
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from corpus import default_path, log_reduction


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
                "stderr_sample": "",
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
    assert len(lines) == workers * records_each, f"Expected {workers * records_each} lines, got {len(lines)}"
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
            "stderr_sample": "",
        },
        path=path,
    )

    record = json.loads(path.read_text(encoding="utf-8").strip())
    assert "[REDACTED:github]" in record["stdout_sample"], (
        "Token beyond 2KB head should still be redacted (scrub runs before truncation)"
    )
    assert token not in record["stdout_sample"]
