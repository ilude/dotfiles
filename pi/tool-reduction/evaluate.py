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

    sum_before = sum(r.get("bytes_before", 0) for r in corpus)
    sum_after = sum(r.get("bytes_after", 0) for r in corpus)
    bytes_saved_pct = (1.0 - sum_after / sum_before) if sum_before > 0 else 0.0

    passthrough_count = sum(1 for r in corpus if not r.get("reduction_applied", False))
    passthrough_rate = passthrough_count / total

    rule_hits: dict[str, int] = {}
    for r in corpus:
        rid = r.get("rule_id")
        key = rid if rid is not None else "(none)"
        rule_hits[key] = rule_hits.get(key, 0) + 1

    false_positive_rate: float | None = None
    if labeled:
        n_labeled = len(labeled)
        if n_labeled > 0:
            n_fp = sum(1 for r in labeled if r.get("lost_signal", False))
            false_positive_rate = n_fp / n_labeled

    return {
        "total_records": total,
        "bytes_saved_pct": bytes_saved_pct,
        "passthrough_rate": passthrough_rate,
        "rule_hits": rule_hits,
        "false_positive_rate": false_positive_rate,
    }


def _print_table(metrics: dict, labeled_count: int | None) -> None:
    sep = "=" * 64
    print(f"\n{sep}")
    print("TOOL-OUTPUT REDUCTION -- CORPUS EVALUATION")
    print(sep)

    total = metrics["total_records"]
    print(f"\nTotal corpus records:  {total}")
    if labeled_count is not None:
        print(f"Labeled records:       {labeled_count}")

    bsp = metrics["bytes_saved_pct"]
    if bsp is None:
        print("Bytes saved:           (no records)")
    else:
        print(f"Bytes saved:           {bsp:.2%}")

    pr = metrics["passthrough_rate"]
    if pr is None:
        print("Passthrough rate:      (no records)")
    else:
        print(f"Passthrough rate:      {pr:.2%}")

    fpr = metrics["false_positive_rate"]
    if fpr is None:
        print("False-positive rate:   (no labeled data)")
    else:
        print(f"False-positive rate:   {fpr:.2%}")

    hits = metrics["rule_hits"]
    if hits:
        print(f"\n{'-' * 64}")
        print("Rule hit distribution:")
        sorted_hits = sorted(hits.items(), key=lambda kv: -kv[1])
        for rule_id, count in sorted_hits:
            pct = count / total if total > 0 else 0.0
            print(f"  {rule_id:<36}  {count:>6}  ({pct:.1%})")


def _check_gates(
    metrics: dict,
    min_reduction: float | None,
    max_fp: float | None,
) -> list[str]:
    sep = "=" * 64
    print(f"\n{sep}")
    print("ACCEPTANCE GATE")
    print(sep)

    failures: list[str] = []

    bsp = metrics["bytes_saved_pct"]
    if min_reduction is not None:
        if bsp is None:
            status = "FAIL"
            failures.append("bytes_saved_pct unavailable (no records)")
        else:
            passed = bsp >= min_reduction
            status = "PASS" if passed else "FAIL"
            if not passed:
                failures.append(
                    f"bytes_saved_pct {bsp:.2%} < min_reduction {min_reduction:.2%}"
                )
        print(
            f"  [{status}] Bytes saved >= {min_reduction:.0%}:  "
            f"{bsp:.2%}" if bsp is not None else f"  [{status}] Bytes saved >= {min_reduction:.0%}:  (n/a)"
        )

    fpr = metrics["false_positive_rate"]
    if max_fp is not None:
        if fpr is None:
            print(f"  [SKIP] FP rate <= {max_fp:.0%}:  (no labeled data supplied)")
        else:
            passed = fpr <= max_fp
            status = "PASS" if passed else "FAIL"
            print(
                f"  [{status}] FP rate <= {max_fp:.0%}:  {fpr:.2%}"
            )
            if not passed:
                failures.append(f"false_positive_rate {fpr:.2%} > max_fp {max_fp:.2%}")
    elif fpr is None:
        print("  [SKIP] FP gate:  (no labeled data supplied)")

    return failures


def _print_json_summary(metrics: dict, gates_passed: bool) -> None:
    summary = {
        "total_records": metrics["total_records"],
        "bytes_saved_pct": round(metrics["bytes_saved_pct"], 6) if metrics["bytes_saved_pct"] is not None else None,
        "passthrough_rate": round(metrics["passthrough_rate"], 6) if metrics["passthrough_rate"] is not None else None,
        "rule_hits": metrics["rule_hits"],
        "false_positive_rate": round(metrics["false_positive_rate"], 6) if metrics["false_positive_rate"] is not None else None,
        "gates_passed": gates_passed,
    }
    print(json.dumps(summary))


def evaluate(
    corpus_paths: list[Path],
    labeled_path: Path | None,
    min_reduction: float | None,
    max_fp: float | None,
) -> int:
    corpus = _load_corpus(corpus_paths)
    labeled: list[dict] | None = None
    if labeled_path is not None:
        labeled = _load_jsonl(labeled_path)

    metrics = _compute_metrics(corpus, labeled)
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

    exit_code = evaluate(corpus_paths, labeled_path, args.min_reduction, args.max_fp)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
