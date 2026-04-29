"""
Reducer orchestrator CLI.

Reads one JSON request from stdin:
  {argv: list[str], exit_code: int, stdout: str, stderr: str}

Writes one JSON response to stdout:
  {inline_text: str, facts: dict, rule_id: str|null,
   bytes_before: int, bytes_after: int, reduction_applied: bool}

On any exception, falls through to raw output so the pi hook never breaks.
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

# Allow direct invocation (python reduce.py) without -m and without installing
_HERE = Path(__file__).parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))


@dataclass
class CompactResult:
    inline_text: str
    facts: dict
    rule_id: str | None
    bytes_before: int
    bytes_after: int
    reduction_applied: bool


def _load_rules_module():
    """Import rules module if available; return a stub if not yet present (T5 in progress)."""
    try:
        import rules as _rules
        return _rules
    except ImportError:
        class _Stub:
            @staticmethod
            def load_rules(**kwargs):
                return []

            @staticmethod
            def classify_argv(argv, rules):
                return (None, 0.0)

        return _Stub()


def reduce_execution(
    argv: list[str],
    exit_code: int,
    stdout: str,
    stderr: str,
) -> CompactResult:
    """Run the deterministic reduction pipeline on one bash tool result."""
    import guards
    import pipeline

    _rules_mod = _load_rules_module()

    builtin_dir = _HERE / "rules" / "builtin"
    rules = _rules_mod.load_rules(builtin_dir=builtin_dir, argv0=argv[0] if argv else None)

    rule_id, _confidence = _rules_mod.classify_argv(argv, rules)

    sep = "\n" if stdout and stderr else ""
    raw_text = stdout + sep + stderr

    bytes_before = len(raw_text.encode("utf-8"))
    facts: dict = {}
    compact_text = raw_text

    if rule_id is not None:
        # Fetch the matched rule dict by id
        matched_rule = next((r for r in rules if r.get("id") == rule_id), None)
        if matched_rule is not None:
            rule_with_exit = dict(matched_rule)
            rule_with_exit["_exit_code"] = exit_code

            lines = pipeline.normalize_lines(raw_text)
            compacted_lines, facts = pipeline.apply_rule(lines, rule_with_exit)
            compact_text = "\n".join(compacted_lines)

    selected = guards.select_inline_text(
        raw_text,
        compact_text,
        max_inline_chars=1200,
        tiny_max=guards.TINY_OUTPUT_MAX_CHARS,
    )

    bytes_after = len(selected.encode("utf-8"))
    reduction_applied = selected != raw_text

    result = CompactResult(
        inline_text=selected,
        facts=facts,
        rule_id=rule_id,
        bytes_before=bytes_before,
        bytes_after=bytes_after,
        reduction_applied=reduction_applied,
    )

    try:
        import corpus

        corpus.log_reduction({
            "ts": datetime.now(timezone.utc).isoformat(),
            "argv": argv,
            "exit_code": exit_code,
            "bytes_before": bytes_before,
            "bytes_after": bytes_after,
            "rule_id": rule_id,
            "reduction_applied": reduction_applied,
            "stdout_sample": stdout,
            "stderr_sample": stderr,
        })
    except Exception:
        pass

    return result


def main() -> None:
    raw_input = sys.stdin.read()

    try:
        req = json.loads(raw_input)
        argv: list[str] = req.get("argv", [])
        exit_code: int = int(req.get("exit_code", 0))
        stdout: str = req.get("stdout", "") or ""
        stderr: str = req.get("stderr", "") or ""

        result = reduce_execution(argv, exit_code, stdout, stderr)
        out = asdict(result)
        sys.stdout.write(json.dumps(out) + "\n")

    except Exception:
        # Fall through to raw output -- never break the agent
        try:
            req = json.loads(raw_input)
            raw = (req.get("stdout", "") or "") + (req.get("stderr", "") or "")
        except Exception:
            raw = ""

        fallback = {
            "inline_text": raw,
            "facts": {},
            "rule_id": None,
            "bytes_before": len(raw.encode("utf-8")),
            "bytes_after": len(raw.encode("utf-8")),
            "reduction_applied": False,
        }
        sys.stdout.write(json.dumps(fallback) + "\n")


if __name__ == "__main__":
    main()
