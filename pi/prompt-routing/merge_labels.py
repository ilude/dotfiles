"""
merge_labels.py — Merge reviewed labels from labeled_history.csv into data.py.

Reads labeled_history.csv (produced by label_history.py), deduplicates against
the existing corpus in data.py, and appends new examples.

Usage:
    python merge_labels.py --dry-run                  # preview only
    python merge_labels.py                            # merge high+medium confidence
    python merge_labels.py --min-confidence high      # high confidence only
    python merge_labels.py --cap 100                  # cap each class at N new examples
    python merge_labels.py --cap 100 --dry-run        # preview with cap
"""

import argparse
import ast
import csv
import sys
from collections import Counter
from pathlib import Path

ARTIFACT_DIR = Path(__file__).parent
CSV_PATH = ARTIFACT_DIR / "labeled_history.csv"
DATA_PY = ARTIFACT_DIR / "data.py"

CONFIDENCE_RANK = {"high": 2, "medium": 1, "low": 0}
LABEL_ORDER = ["low", "mid", "high"]


def _norm(text: str) -> str:
    return " ".join(text.strip().lower().split())


# ---------------------------------------------------------------------------
# Existing prompt extraction
# ---------------------------------------------------------------------------


def _examples_value_node(node: ast.AST) -> ast.AST | None:
    """Return the EXAMPLES list literal node if `node` defines it, else None."""
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "EXAMPLES":
                return node.value
    elif isinstance(node, ast.AnnAssign):
        if isinstance(node.target, ast.Name) and node.target.id == "EXAMPLES":
            return node.value
    return None


def _collect_prompts(value_node: ast.AST, sink: set[str]) -> None:
    if not isinstance(value_node, ast.List):
        return
    for elt in value_node.elts:
        if not (isinstance(elt, ast.Tuple) and len(elt.elts) == 2):
            continue
        text_node = elt.elts[0]
        if isinstance(text_node, ast.Constant):
            sink.add(_norm(str(text_node.value)))


def load_existing_prompts() -> set[str]:
    """Parse data.py and return a set of normalised existing prompt texts."""
    src = DATA_PY.read_text(encoding="utf-8")
    tree = ast.parse(src)
    existing: set[str] = set()
    for node in ast.walk(tree):
        value_node = _examples_value_node(node)
        if value_node is not None:
            _collect_prompts(value_node, existing)
    return existing


# ---------------------------------------------------------------------------
# Candidate selection
# ---------------------------------------------------------------------------


def _row_passes_filters(row: dict, min_rank: int) -> bool:
    if row.get("usable", "").lower() != "true":
        return False
    if row.get("label", "") not in LABEL_ORDER:
        return False
    return CONFIDENCE_RANK.get(row.get("confidence", "low"), 0) >= min_rank


def load_candidates(csv_path: Path, min_confidence: str) -> list[dict]:
    """Load usable rows from CSV, filtered by minimum confidence."""
    min_rank = CONFIDENCE_RANK[min_confidence]
    with open(csv_path, newline="", encoding="utf-8") as f:
        return [row for row in csv.DictReader(f) if _row_passes_filters(row, min_rank)]


def _bucket_by_label(candidates: list[dict], existing: set[str]) -> dict[str, list[dict]]:
    by_label: dict[str, list[dict]] = {lb: [] for lb in LABEL_ORDER}
    seen_new: set[str] = set()
    for row in candidates:
        key = _norm(row["prompt"])
        if key in existing or key in seen_new:
            continue
        seen_new.add(key)
        by_label[row["label"]].append(row)
    return by_label


def _sort_and_cap(rows: list[dict], cap: int | None) -> list[dict]:
    rows.sort(key=lambda r: CONFIDENCE_RANK.get(r["confidence"], 0), reverse=True)
    return rows[:cap] if cap is not None else rows


def select_new(candidates: list[dict], existing: set[str], cap: int | None) -> list[dict]:
    """Deduplicate against existing corpus, apply per-class cap, sort by confidence desc."""
    by_label = _bucket_by_label(candidates, existing)
    for lb in LABEL_ORDER:
        by_label[lb] = _sort_and_cap(by_label[lb], cap)
    return [row for lb in LABEL_ORDER for row in by_label[lb]]


# ---------------------------------------------------------------------------
# data.py append
# ---------------------------------------------------------------------------


def _format_label_block(label: str, prompts: list[str]) -> list[str]:
    label_titles = {
        "low": "LOW complexity \u2192 Haiku  (from history.jsonl, labeled by Opus)",
        "mid": "MID complexity \u2192 Sonnet (from history.jsonl, labeled by Opus)",
        "high": "HIGH complexity \u2192 Opus  (from history.jsonl, labeled by Opus)",
    }
    title = label_titles[label]
    lines = [f"\n    # \u2500\u2500 {title} {'-' * max(0, 55 - len(title))}"]
    for p in prompts:
        p_clean = " ".join(p.split())
        escaped = p_clean.replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'    ("{escaped}", "{label}"),')
    return lines


def append_to_data_py(new_rows: list[dict]) -> None:
    """Append new examples to data.py inside the EXAMPLES list."""
    src = DATA_PY.read_text(encoding="utf-8")

    by_label: dict[str, list[str]] = {lb: [] for lb in LABEL_ORDER}
    for row in new_rows:
        by_label[row["label"]].append(row["prompt"])

    insertion_lines: list[str] = []
    for lb in LABEL_ORDER:
        if by_label[lb]:
            insertion_lines.extend(_format_label_block(lb, by_label[lb]))

    insertion = "\n".join(insertion_lines) + "\n"
    close_marker = "\n]\n"
    if close_marker not in src:
        print("ERROR: Could not find closing ']' of EXAMPLES list in data.py")
        sys.exit(1)

    new_src = src.replace(close_marker, insertion + close_marker, 1)
    DATA_PY.write_text(new_src, encoding="utf-8")


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _print_table(existing_counts: dict[str, int], new_counts: Counter) -> tuple[int, int]:
    print(f"\n{'-' * 55}")
    print(f"{'Class':<8} {'Existing':>10} {'+ New':>8} {'= Total':>8}")
    print(f"{'-' * 55}")
    for lb in LABEL_ORDER:
        ex = existing_counts.get(lb, 0)
        n = new_counts.get(lb, 0)
        print(f"  {lb:<6} {ex:>10} {n:>8} {ex + n:>8}")
    total_existing = sum(existing_counts.values())
    total_new = sum(new_counts.values())
    print(f"{'-' * 55}")
    print(f"  {'TOTAL':<6} {total_existing:>10} {total_new:>8} {total_existing + total_new:>8}")
    print(f"{'-' * 55}")
    return total_existing, total_new


def _warn_imbalance(existing_counts: dict[str, int], new_counts: Counter) -> None:
    totals = {lb: existing_counts.get(lb, 0) + new_counts.get(lb, 0) for lb in LABEL_ORDER}
    max_class = max(totals.values())
    min_class = min(totals.values())
    ratio = max_class / min_class if min_class > 0 else float("inf")
    if ratio <= 2.0:
        return
    print(f"\nWARNING: class imbalance ratio {ratio:.1f}x (max={max_class}, min={min_class})")
    over = max(totals, key=totals.get)
    under = min(totals, key=totals.get)
    print(f"  Consider --cap {min_class - existing_counts.get(over, 0)}")
    print(f"  Largest: '{over}' ({totals[over]}), smallest: '{under}' ({totals[under]})")


def _print_dry_run(new_rows: list[dict]) -> None:
    print(f"\nDry run — {len(new_rows)} new examples would be added to data.py")
    print("\nSample of new examples (first 5 per class):")
    for lb in LABEL_ORDER:
        subset = [r for r in new_rows if r["label"] == lb][:5]
        if subset:
            print(f"\n  [{lb.upper()}]")
            for r in subset:
                print(f"    [{r['confidence']:6}] {r['prompt'][:90]}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge labeled_history.csv into data.py")
    parser.add_argument("--min-confidence", choices=["high", "medium", "low"], default="medium")
    parser.add_argument("--cap", type=int, default=None, help="Max new examples per class")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--source",
        default=None,
        help="CSV to merge from (default: labeled_history.csv). Use audit divergence CSVs here.",
    )
    return parser.parse_args()


def run(args: argparse.Namespace) -> None:
    source_path = Path(args.source) if args.source else CSV_PATH
    if not source_path.exists():
        print(f"ERROR: {source_path} not found.")
        sys.exit(1)

    print(f"Loading candidates from {source_path.name} (min confidence: {args.min_confidence})...")
    candidates = load_candidates(source_path, args.min_confidence)
    print(f"  {len(candidates)} candidates pass confidence filter")

    print(f"Loading existing corpus from {DATA_PY.name}...")
    existing = load_existing_prompts()
    print(f"  {len(existing)} existing examples")

    new_rows = select_new(candidates, existing, args.cap)
    new_counts = Counter(r["label"] for r in new_rows)

    sys.path.insert(0, str(ARTIFACT_DIR))
    from data import get_label_counts

    existing_counts = get_label_counts()
    _, total_new = _print_table(existing_counts, new_counts)
    _warn_imbalance(existing_counts, new_counts)

    if args.dry_run:
        _print_dry_run(new_rows)
        return

    if total_new == 0:
        print("\nNothing to merge — all candidates already exist in corpus or were filtered out.")
        return

    print(f"\nMerging {total_new} new examples into {DATA_PY.name}...")
    append_to_data_py(new_rows)
    print("Done.")
    print("\nNext steps:")
    print("  1. Review data.py (git diff) to sanity-check additions")
    print("  2. python train.py   — retrain on expanded corpus")
    print("  3. python evaluate.py --holdout   — verify gates still pass")


def main() -> None:
    run(parse_args())


if __name__ == "__main__":
    main()
