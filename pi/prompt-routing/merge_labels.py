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


def load_existing_prompts() -> set[str]:
    """Parse data.py and return a set of normalised existing prompt texts."""
    src = DATA_PY.read_text(encoding="utf-8")
    tree = ast.parse(src)
    existing: set[str] = set()
    for node in ast.walk(tree):
        # Handle both `EXAMPLES = [...]` and `EXAMPLES: list[...] = [...]`
        value_node = None
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "EXAMPLES":
                    value_node = node.value
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.target.id == "EXAMPLES":
                value_node = node.value
        if value_node and isinstance(value_node, ast.List):
            for elt in value_node.elts:
                if isinstance(elt, ast.Tuple) and len(elt.elts) == 2:
                    text_node = elt.elts[0]
                    if isinstance(text_node, ast.Constant):
                        existing.add(_norm(str(text_node.value)))
    return existing


def _norm(text: str) -> str:
    return " ".join(text.strip().lower().split())


def load_candidates(csv_path: Path, min_confidence: str) -> list[dict]:
    """Load usable rows from CSV, filtered by minimum confidence."""
    min_rank = CONFIDENCE_RANK[min_confidence]
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("usable", "").lower() != "true":
                continue
            if row.get("label", "") not in LABEL_ORDER:
                continue
            if CONFIDENCE_RANK.get(row.get("confidence", "low"), 0) < min_rank:
                continue
            rows.append(row)
    return rows


def select_new(candidates: list[dict], existing: set[str], cap: int | None) -> list[dict]:
    """Deduplicate against existing corpus, apply per-class cap, sort by confidence desc."""
    by_label: dict[str, list[dict]] = {lb: [] for lb in LABEL_ORDER}
    seen_new: set[str] = set()

    for row in candidates:
        key = _norm(row["prompt"])
        if key in existing or key in seen_new:
            continue
        seen_new.add(key)
        by_label[row["label"]].append(row)

    # Sort each class: high confidence first
    for lb in LABEL_ORDER:
        by_label[lb].sort(key=lambda r: CONFIDENCE_RANK.get(r["confidence"], 0), reverse=True)
        if cap is not None:
            by_label[lb] = by_label[lb][:cap]

    return [row for lb in LABEL_ORDER for row in by_label[lb]]


def append_to_data_py(new_rows: list[dict]) -> None:
    """Append new examples to data.py inside the EXAMPLES list."""
    src = DATA_PY.read_text(encoding="utf-8")

    # Group by label for clean section comments
    by_label: dict[str, list[str]] = {lb: [] for lb in LABEL_ORDER}
    for row in new_rows:
        by_label[row["label"]].append(row["prompt"])

    label_titles = {
        "low":  "LOW complexity \u2192 Haiku  (from history.jsonl, labeled by Opus)",
        "mid":  "MID complexity \u2192 Sonnet (from history.jsonl, labeled by Opus)",
        "high": "HIGH complexity \u2192 Opus  (from history.jsonl, labeled by Opus)",
    }

    insertion_lines = []
    for lb in LABEL_ORDER:
        prompts = by_label[lb]
        if not prompts:
            continue
        insertion_lines.append(f"\n    # \u2500\u2500 {label_titles[lb]} {'-' * max(0, 55 - len(label_titles[lb]))}")
        for p in prompts:
            # Collapse newlines/excess whitespace — multi-line prompts are
            # display artifacts from the chat UI, not meaningful structure.
            p_clean = " ".join(p.split())
            escaped = p_clean.replace("\\", "\\\\").replace('"', '\\"')
            insertion_lines.append(f'    ("{escaped}", "{lb}"),')

    insertion = "\n".join(insertion_lines) + "\n"

    # Insert before the closing bracket of EXAMPLES
    close_marker = "\n]\n"
    if close_marker not in src:
        print("ERROR: Could not find closing ']' of EXAMPLES list in data.py")
        sys.exit(1)

    new_src = src.replace(close_marker, insertion + close_marker, 1)
    DATA_PY.write_text(new_src, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge labeled_history.csv into data.py")
    parser.add_argument("--min-confidence", choices=["high", "medium", "low"], default="medium")
    parser.add_argument("--cap", type=int, default=None, help="Max new examples per class")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--source", default=None,
        help="CSV to merge from (default: labeled_history.csv). Use audit divergence CSVs here."
    )
    args = parser.parse_args()

    source_path = Path(args.source) if args.source else CSV_PATH
    if not source_path.exists():
        print(f"ERROR: {source_path} not found.")
        sys.exit(1)

    # Load
    print(f"Loading candidates from {source_path.name} (min confidence: {args.min_confidence})...")
    candidates = load_candidates(source_path, args.min_confidence)
    print(f"  {len(candidates)} candidates pass confidence filter")

    print(f"Loading existing corpus from {DATA_PY.name}...")
    existing = load_existing_prompts()
    print(f"  {len(existing)} existing examples")

    # Select
    new_rows = select_new(candidates, existing, args.cap)
    new_counts = Counter(r["label"] for r in new_rows)

    # Existing counts
    src = DATA_PY.read_text(encoding="utf-8")
    sys.path.insert(0, str(ARTIFACT_DIR))
    from data import get_label_counts
    existing_counts = get_label_counts()

    # Report
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

    # Imbalance warning
    totals = {lb: existing_counts.get(lb, 0) + new_counts.get(lb, 0) for lb in LABEL_ORDER}
    max_class = max(totals.values())
    min_class = min(totals.values())
    ratio = max_class / min_class if min_class > 0 else float("inf")
    if ratio > 2.0:
        print(f"\nWARNING: class imbalance ratio {ratio:.1f}x (max={max_class}, min={min_class})")
        print(f"  Consider --cap {min_class - existing_counts.get(max(totals, key=totals.get), 0)}")
        over = max(totals, key=totals.get)
        under = min(totals, key=totals.get)
        print(f"  Largest: '{over}' ({totals[over]}), smallest: '{under}' ({totals[under]})")

    if args.dry_run:
        print(f"\nDry run — {len(new_rows)} new examples would be added to data.py")
        print("\nSample of new examples (first 5 per class):")
        for lb in LABEL_ORDER:
            subset = [r for r in new_rows if r["label"] == lb][:5]
            if subset:
                print(f"\n  [{lb.upper()}]")
                for r in subset:
                    print(f"    [{r['confidence']:6}] {r['prompt'][:90]}")
        return

    if total_new == 0:
        print("\nNothing to merge — all candidates already exist in corpus or were filtered out.")
        return

    print(f"\nMerging {total_new} new examples into {DATA_PY.name}...")
    append_to_data_py(new_rows)
    print("Done.")
    print(f"\nNext steps:")
    print(f"  1. Review data.py (git diff) to sanity-check additions")
    print(f"  2. python train.py   — retrain on expanded corpus")
    print(f"  3. python evaluate.py --holdout   — verify gates still pass")


if __name__ == "__main__":
    main()
