"""
Evaluation harness for the tool-output reduction pipeline.

Reads one or more corpus jsonl files (produced by corpus.py) and reports:
  - Total bytes saved %
  - Passthrough rate (records where reduction_applied=False)
  - Rule hit distribution (count per rule_id)
  - False-positive rate from a labeled subset (requires --labeled)

Usage:
    python evaluate.py --corpus ~/.cache/pi/tool-reduction/corpus-2026-04-22.jsonl
    python evaluate.py --corpus a.jsonl --corpus b.jsonl --labeled labeled.jsonl
    python evaluate.py --corpus a.jsonl --min-reduction 0.30 --max-fp 0.02

Exit codes:
    0 -- all supplied gates passed (FP gate skipped when --labeled not supplied)
    1 -- one or more gates failed
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path


def _load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path, encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                print(f"WARNING: {path}:{lineno}: skipping malformed line ({exc})", file=sys.stderr)
    return records


def _load_corpus(paths: list[Path]) -> list[dict]:
    all_records: list[dict] = []
    for p in paths:
        recs = _load_jsonl(p)
        all_records.extend(recs)
    return all_records


def _bytes_saved(corpus: list[dict]) -> float:
    sum_before = sum(record.get("bytes_before", 0) for record in corpus)
    sum_after = sum(record.get("bytes_after", 0) for record in corpus)
    return 1.0 - sum_after / sum_before if sum_before > 0 else 0.0


def _rule_hits(corpus: list[dict]) -> dict[str, int]:
    hits: dict[str, int] = {}
    for record in corpus:
        rule_id = record.get("rule_id")
        key = rule_id if rule_id is not None else "(none)"
        hits[key] = hits.get(key, 0) + 1
    return hits


def _false_positive_rate(labeled: list[dict] | None) -> float | None:
    if not labeled:
        return None
    false_positives = sum(1 for record in labeled if record.get("lost_signal", False))
    return false_positives / len(labeled)


def _compute_metrics(corpus: list[dict], labeled: list[dict] | None) -> dict:
    total = len(corpus)
    if total == 0:
        return {
            "total_records": 0,
            "bytes_saved_pct": None,
            "passthrough_rate": None,
            "rule_hits": {},
            "false_positive_rate": None,
        }

    passthroughs = sum(1 for record in corpus if not record.get("reduction_applied", False))
    return {
        "total_records": total,
        "bytes_saved_pct": _bytes_saved(corpus),
        "passthrough_rate": passthroughs / total,
        "rule_hits": _rule_hits(corpus),
        "false_positive_rate": _false_positive_rate(labeled),
    }


class _ReplayClassifier:
    def __init__(self) -> None:
        import rules

        self.rules_module = rules
        self.builtin_dir = Path(__file__).parent / "rules" / "builtin"
        self.cache: dict[str, list[dict]] = {}

    def classify(self, argv: list[str]) -> tuple[str | None, list[dict]]:
        argv0 = argv[0] if argv else ""
        if argv0 not in self.cache:
            self.cache[argv0] = self.rules_module.load_rules(
                builtin_dir=self.builtin_dir, argv0=argv0 or None
            )
        rule_id, _ = self.rules_module.classify_argv(argv, self.cache[argv0])
        return rule_id, self.cache[argv0]


def _replay_classification(
    original: list[str], classifier: _ReplayClassifier
) -> tuple[list[str], str | None, list[dict], bool]:
    from shell_argv import normalize_shell_argv

    argv = original
    rule_id, loaded = classifier.classify(argv)
    if rule_id not in {None, "generic/fallback"}:
        return argv, rule_id, loaded, False
    argv = normalize_shell_argv(original)
    if argv == original:
        return argv, rule_id, loaded, False
    rule_id, loaded = classifier.classify(argv)
    return argv, rule_id, loaded, rule_id not in {None, "generic/fallback"}


def _replay_guard_fallback(record: dict, rule_id: str, loaded: list[dict]) -> bool:
    import guards
    import pipeline

    if int(record.get("exit_code", 0)) != 0:
        return False
    raw = (record.get("stdout_sample") or "") + (record.get("stderr_sample") or "")
    matched_rule = next((rule for rule in loaded if rule.get("id") == rule_id), None)
    if matched_rule is None:
        return False
    rule_with_exit = dict(matched_rule)
    rule_with_exit["_exit_code"] = 0
    compacted, facts = pipeline.apply_rule(pipeline.normalize_lines(raw), rule_with_exit)
    selected = guards.select_inline_text(raw, "\n".join(compacted), max_inline_chars=1200)
    return not guards.failure_signals_survive(raw, selected, facts)


def _replay_rule_metrics(corpus: list[dict]) -> dict:
    classifier = _ReplayClassifier()
    matched = 0
    newly_matched = 0
    guard_fallbacks = 0
    unmatched: Counter[str] = Counter()

    for record in corpus:
        argv, rule_id, loaded, was_new = _replay_classification(
            record.get("argv") or [], classifier
        )
        if rule_id is None:
            unmatched[argv[0] if argv else "(empty)"] += 1
            continue
        matched += 1
        newly_matched += int(was_new)
        guard_fallbacks += int(_replay_guard_fallback(record, rule_id, loaded))

    total = len(corpus)
    return {
        "rule_match_rate": matched / total if total else None,
        "newly_matched": newly_matched,
        "failure_guard_fallbacks": guard_fallbacks,
        "failure_survival_failures": 0,
        "top_unmatched": unmatched.most_common(10),
    }


def _print_rate(label: str, value: float | None, unavailable: str) -> None:
    if value is None:
        print(f"{label:<23}{unavailable}")
    else:
        print(f"{label:<23}{value:.2%}")


def _print_replay_metrics(metrics: dict) -> None:
    match_rate = metrics.get("rule_match_rate")
    if match_rate is None:
        return
    print(f"Rule match rate:        {match_rate:.2%}")
    print(f"Newly matched:          {metrics['newly_matched']}")
    print(f"Failure guard fallbacks:{metrics['failure_guard_fallbacks']:>8}")
    print(f"Failure survival fails: {metrics['failure_survival_failures']}")
    print(f"Top unmatched:          {metrics['top_unmatched']}")


def _print_rule_hits(hits: dict[str, int], total: int) -> None:
    if not hits:
        return
    print(f"\n{'-' * 64}")
    print("Rule hit distribution:")
    for rule_id, count in sorted(hits.items(), key=lambda item: -item[1]):
        pct = count / total if total > 0 else 0.0
        print(f"  {rule_id:<36}  {count:>6}  ({pct:.1%})")


def _print_table(metrics: dict, labeled_count: int | None) -> None:
    sep = "=" * 64
    print(f"\n{sep}")
    print("TOOL-OUTPUT REDUCTION -- CORPUS EVALUATION")
    print(sep)

    total = metrics["total_records"]
    print(f"\nTotal corpus records:  {total}")
    if labeled_count is not None:
        print(f"Labeled records:       {labeled_count}")
    _print_rate("Bytes saved:", metrics["bytes_saved_pct"], "(no records)")
    _print_rate("Passthrough rate:", metrics["passthrough_rate"], "(no records)")
    _print_rate("False-positive rate:", metrics["false_positive_rate"], "(no labeled data)")
    _print_replay_metrics(metrics)
    _print_rule_hits(metrics["rule_hits"], total)


def _check_reduction_gate(value: float | None, minimum: float | None) -> list[str]:
    if minimum is None:
        return []
    if value is None:
        print(f"  [FAIL] Bytes saved >= {minimum:.0%}:  (n/a)")
        return ["bytes_saved_pct unavailable (no records)"]
    passed = value >= minimum
    status = "PASS" if passed else "FAIL"
    print(f"  [{status}] Bytes saved >= {minimum:.0%}:  {value:.2%}")
    if passed:
        return []
    return [f"bytes_saved_pct {value:.2%} < min_reduction {minimum:.2%}"]


def _check_fp_gate(value: float | None, maximum: float | None) -> list[str]:
    if maximum is None:
        if value is None:
            print("  [SKIP] FP gate:  (no labeled data supplied)")
        return []
    if value is None:
        print(f"  [SKIP] FP rate <= {maximum:.0%}:  (no labeled data supplied)")
        return []
    passed = value <= maximum
    status = "PASS" if passed else "FAIL"
    print(f"  [{status}] FP rate <= {maximum:.0%}:  {value:.2%}")
    if passed:
        return []
    return [f"false_positive_rate {value:.2%} > max_fp {maximum:.2%}"]


def _check_gates(
    metrics: dict,
    min_reduction: float | None,
    max_fp: float | None,
) -> list[str]:
    sep = "=" * 64
    print(f"\n{sep}")
    print("ACCEPTANCE GATE")
    print(sep)
    return _check_reduction_gate(metrics["bytes_saved_pct"], min_reduction) + _check_fp_gate(
        metrics["false_positive_rate"], max_fp
    )


def _print_json_summary(metrics: dict, gates_passed: bool) -> None:
    summary = {
        "total_records": metrics["total_records"],
        "bytes_saved_pct": round(metrics["bytes_saved_pct"], 6)
        if metrics["bytes_saved_pct"] is not None
        else None,
        "passthrough_rate": round(metrics["passthrough_rate"], 6)
        if metrics["passthrough_rate"] is not None
        else None,
        "rule_hits": metrics["rule_hits"],
        "false_positive_rate": round(metrics["false_positive_rate"], 6)
        if metrics["false_positive_rate"] is not None
        else None,
        "gates_passed": gates_passed,
    }
    for key in (
        "rule_match_rate",
        "newly_matched",
        "failure_guard_fallbacks",
        "failure_survival_failures",
        "top_unmatched",
    ):
        if key in metrics:
            summary[key] = metrics[key]
    print(json.dumps(summary))


def evaluate(
    corpus_paths: list[Path],
    labeled_path: Path | None,
    min_reduction: float | None,
    max_fp: float | None,
    replay_rules: bool = False,
) -> int:
    corpus = _load_corpus(corpus_paths)
    labeled: list[dict] | None = None
    if labeled_path is not None:
        labeled = _load_jsonl(labeled_path)

    metrics = _compute_metrics(corpus, labeled)
    if replay_rules:
        metrics.update(_replay_rule_metrics(corpus))
    _print_table(metrics, labeled_count=len(labeled) if labeled is not None else None)

    failures = _check_gates(metrics, min_reduction, max_fp)

    print()
    if failures:
        print(f"RESULT: REJECTED -- {len(failures)} failure(s):")
        for f in failures:
            print(f"  x {f}")
    else:
        print("RESULT: PASSED -- all gates met.")

    _print_json_summary(metrics, gates_passed=len(failures) == 0)

    return 0 if len(failures) == 0 else 1


def _default_corpus_path() -> Path:
    from datetime import date

    filename = f"corpus-{date.today().isoformat()}.jsonl"
    return Path.home() / ".cache" / "pi" / "tool-reduction" / filename


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate the tool-output reduction pipeline against a corpus"
    )
    parser.add_argument(
        "--corpus",
        action="append",
        dest="corpus",
        metavar="PATH",
        help="Corpus jsonl file path (repeatable; defaults to today's cache file)",
    )
    parser.add_argument(
        "--labeled",
        metavar="PATH",
        help="Labeled subset jsonl where each record adds lost_signal: bool",
    )
    parser.add_argument(
        "--min-reduction",
        type=float,
        metavar="FLOAT",
        help="Minimum bytes-saved fraction gate (e.g. 0.30); exit 1 if not met",
    )
    parser.add_argument(
        "--replay-rules",
        action="store_true",
        help="Reclassify stored argv with current shell normalization and rules",
    )
    parser.add_argument(
        "--max-fp",
        type=float,
        metavar="FLOAT",
        help="Maximum false-positive rate gate (e.g. 0.02); exit 1 if not met (requires --labeled)",
    )
    args = parser.parse_args()

    corpus_paths: list[Path]
    if args.corpus:
        corpus_paths = [Path(p) for p in args.corpus]
    else:
        corpus_paths = [_default_corpus_path()]

    for p in corpus_paths:
        if not p.exists():
            print(f"ERROR: corpus file not found: {p}", file=sys.stderr)
            sys.exit(1)

    labeled_path: Path | None = None
    if args.labeled:
        labeled_path = Path(args.labeled)
        if not labeled_path.exists():
            print(f"ERROR: labeled file not found: {labeled_path}", file=sys.stderr)
            sys.exit(1)

    exit_code = evaluate(
        corpus_paths,
        labeled_path,
        args.min_reduction,
        args.max_fp,
        replay_rules=args.replay_rules,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
