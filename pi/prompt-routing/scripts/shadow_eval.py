"""Retired shadow eval entrypoint.

The canonical prompt-router evaluation path is now ``pi/prompt-routing/evaluate.py``.
This stub intentionally exits non-zero so legacy automation cannot silently produce
metrics that diverge from runtime-comparable V1 eval output.
"""

from __future__ import annotations

import sys

MESSAGE = (
    "shadow_eval.py is retired; use "
    "uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py "
    "--config pi/settings.json --sequences "
    "pi/prompt-routing/tests/fixtures/context_sequences_v1.jsonl --json"
)


def main() -> int:
    print(MESSAGE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
