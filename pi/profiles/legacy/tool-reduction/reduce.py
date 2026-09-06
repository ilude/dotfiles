"""
Reducer orchestrator CLI.

Reads one JSON request from stdin:
  {argv: list[str], exit_code: int, stdout: str}

`exit_code` is Pi's boolean isError flag encoded as 0 or 1; Pi does not expose
a real process exit code or a separate stderr stream to this hook.

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


def _classify_execution(
    argv: list[str], rules_module, loaded_rules: list[dict] | None
) -> tuple[list[str], list[dict], str | None]:
    from shell_argv import normalize_shell_argv

    builtin_dir = _HERE / "rules" / "builtin"
    rules = loaded_rules
    if rules is None:
        rules = rules_module.load_rules(builtin_dir=builtin_dir, argv0=argv[0] if argv else None)
    rule_id, _confidence = rules_module.classify_argv(argv, rules)
    if rule_id not in {None, "generic/fallback"}:
        return argv, rules, rule_id

    normalized_argv = normalize_shell_argv(argv)
    if normalized_argv == argv:
        return argv, rules, rule_id
    if loaded_rules is None:
        rules = rules_module.load_rules(
            builtin_dir=builtin_dir, argv0=normalized_argv[0] if normalized_argv else None
        )
    rule_id, _confidence = rules_module.classify_argv(normalized_argv, rules)
    return normalized_argv, rules, rule_id


def _compact_output(
    stdout: str, exit_code: int, rule_id: str | None, rules: list[dict]
) -> tuple[str, dict]:
    import pipeline

    if rule_id is None:
        return stdout, {}
    matched_rule = next((rule for rule in rules if rule.get("id") == rule_id), None)
    if matched_rule is None:
        return stdout, {}
    rule_with_exit = dict(matched_rule)
    rule_with_exit["_exit_code"] = exit_code
    lines, facts = pipeline.apply_rule(pipeline.normalize_lines(stdout), rule_with_exit)
    return "\n".join(lines), facts


def _select_output(stdout: str, compact_text: str, exit_code: int, facts: dict) -> str:
    import guards

    selected = guards.select_inline_text(
        stdout,
        compact_text,
        max_inline_chars=1200,
        tiny_max=guards.TINY_OUTPUT_MAX_CHARS,
    )
    if exit_code != 0 or not guards.failure_signals_survive(stdout, selected, facts):
        return stdout
    return selected


def _log_result(result: CompactResult, argv: list[str], exit_code: int, stdout: str) -> None:
    try:
        import corpus

        corpus.log_reduction(
            {
                "ts": datetime.now(timezone.utc).isoformat(),
                "argv": argv,
                "exit_code": exit_code,
                "bytes_before": result.bytes_before,
                "bytes_after": result.bytes_after,
                "rule_id": result.rule_id,
                "reduction_applied": result.reduction_applied,
                "stdout_sample": stdout,
            }
        )
    except Exception:
        pass


def reduce_execution(
    argv: list[str],
    exit_code: int,
    stdout: str,
    rules_module=None,
    loaded_rules: list[dict] | None = None,
) -> CompactResult:
    """Run the deterministic reduction pipeline on one bash tool result."""
    rules_module = rules_module or _load_rules_module()
    argv, rules, rule_id = _classify_execution(argv, rules_module, loaded_rules)
    compact_text, facts = _compact_output(stdout, exit_code, rule_id, rules)
    selected = _select_output(stdout, compact_text, exit_code, facts)
    result = CompactResult(
        inline_text=selected,
        facts=facts,
        rule_id=rule_id,
        bytes_before=len(stdout.encode("utf-8")),
        bytes_after=len(selected.encode("utf-8")),
        reduction_applied=selected != stdout,
    )
    _log_result(result, argv, exit_code, stdout)
    return result


def reduce_request(
    raw_input: str,
    rules_module=None,
    loaded_rules: list[dict] | None = None,
) -> dict:
    """Reduce one JSON request, preserving raw output on every failure."""
    try:
        req = json.loads(raw_input)
        argv: list[str] = req.get("argv", [])
        exit_code: int = int(req.get("exit_code", 0))
        stdout: str = req.get("stdout", "") or ""
        return asdict(reduce_execution(argv, exit_code, stdout, rules_module, loaded_rules))
    except Exception:
        # Fall through to raw output -- never break the agent
        try:
            req = json.loads(raw_input)
            raw = req.get("stdout", "") or ""
        except Exception:
            raw = ""
        return {
            "inline_text": raw,
            "facts": {},
            "rule_id": None,
            "bytes_before": len(raw.encode("utf-8")),
            "bytes_after": len(raw.encode("utf-8")),
            "reduction_applied": False,
        }


def write_response(response: dict) -> None:
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


def main() -> None:
    raw_input = sys.stdin.read()
    write_response(reduce_request(raw_input))


def worker() -> None:
    """Serve newline-delimited JSON requests without reloading modules or rules."""
    rules_module = _load_rules_module()
    loaded_rules = rules_module.load_rules(builtin_dir=_HERE / "rules" / "builtin")
    for raw_input in sys.stdin:
        write_response(reduce_request(raw_input, rules_module, loaded_rules))


if __name__ == "__main__":
    if "--worker" in sys.argv[1:]:
        worker()
    else:
        main()
