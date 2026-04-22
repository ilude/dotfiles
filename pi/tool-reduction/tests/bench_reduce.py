"""
Latency benchmark for reduce.py.

Spawns reduce.py 50 times against the git-status fixture and reports
p50/p95/p99 wall-clock latency per call. Writes results to
pi/tool-reduction/docs/baseline-latency.md.

Usage:
    python pi/tool-reduction/tests/bench_reduce.py
"""

from __future__ import annotations

import json
import platform
import statistics
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
FIXTURE = HERE / "fixtures" / "git-status-sample.txt"
REDUCE_PY = HERE.parent / "reduce.py"
DOCS_DIR = HERE.parent / "docs"
OUTPUT_MD = DOCS_DIR / "baseline-latency.md"

# On Windows, each subprocess call re-scans the rules/ directory (107 JSON
# files) which Windows Defender intercepts -- p50 is ~8-10s per call.
# The full 50-run suite would take ~8 minutes on Windows; reduce to 10 runs
# for the baseline record. Phase 2 daemon approach eliminates this overhead.
N = 10


def git_sha() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def run_once(request_json: str) -> float:
    """Return wall-clock seconds for one reduce.py invocation."""
    start = time.perf_counter()
    proc = subprocess.run(
        [sys.executable, str(REDUCE_PY)],
        input=request_json,
        capture_output=True,
        text=True,
        timeout=60,
    )
    elapsed = time.perf_counter() - start
    if proc.returncode != 0:
        raise RuntimeError(f"reduce.py exited {proc.returncode}: {proc.stderr[:200]}")
    return elapsed


def main() -> None:
    fixture_text = FIXTURE.read_text(encoding="utf-8")
    request = {
        "argv": ["git", "status"],
        "exit_code": 0,
        "stdout": fixture_text,
        "stderr": "",
    }
    request_json = json.dumps(request)

    print(f"Running {N} iterations of reduce.py against git-status fixture ...")
    times_ms: list[float] = []
    for i in range(N):
        elapsed_s = run_once(request_json)
        times_ms.append(elapsed_s * 1000)
        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/{N} done")

    times_ms.sort()
    p50 = statistics.median(times_ms)
    p95 = times_ms[int(len(times_ms) * 0.95)]
    p99 = times_ms[int(len(times_ms) * 0.99)]

    print(f"\np50={p50:.1f}ms  p95={p95:.1f}ms  p99={p99:.1f}ms")

    sha = git_sha()
    py_version = platform.python_version()
    os_info = f"{platform.system()} {platform.release()}"

    windows_note = ""
    if platform.system() == "Windows" and p95 > 1500:
        windows_note = (
            "\n## Windows note\n\n"
            "p95 exceeds 1500 ms because each subprocess call re-scans the\n"
            "`rules/builtin/` directory (107 JSON files) and Windows Defender\n"
            "intercepts each file open. The per-call overhead is ~8-10 s on this\n"
            "machine. A Phase 2 daemon approach (keep reduce.py resident) would\n"
            "reduce this to <100 ms by amortizing the startup cost.\n"
        )

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    md = f"""\
# reduce.py baseline latency

| Field | Value |
|---|---|
| OS | {os_info} |
| Python | {py_version} |
| Reducer version (commit) | {sha} |
| Iterations | {N} |
| p50 | {p50:.1f} ms |
| p95 | {p95:.1f} ms |
| p99 | {p99:.1f} ms |

Measured by `pi/tool-reduction/tests/bench_reduce.py` against the
`git-status-sample.txt` fixture.
{windows_note}"""
    OUTPUT_MD.write_text(md, encoding="utf-8")
    print(f"Results written to {OUTPUT_MD}")

    if p95 > 1500:
        print(f"WARNING: p95 ({p95:.1f}ms) exceeds 1500ms -- consider daemon approach in Phase 2.")


if __name__ == "__main__":
    main()
