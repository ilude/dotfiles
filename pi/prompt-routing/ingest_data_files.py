"""
ingest_data_files.py -- Import JSON training data files from data/ into data.py.

Reads all *.json files in prompt-routing/data/, normalises tier names to
low/mid/high, deduplicates against the existing corpus, and appends new
examples to data.py.

Supported JSON schemas (auto-detected):
  {"small": [...], "medium": [...], "high": [...]}
  {"small_thinking": [...], "medium_thinking": [...], "high_thinking": [...]}
  {"metadata": {...}, "small": [...], ...}    # metadata key ignored

Usage:
    python ingest_data_files.py --dry-run     # preview counts, no file changes
    python ingest_data_files.py               # merge into data.py
"""

import argparse
import ast
import json
import sys
from collections import Counter
from pathlib import Path

ARTIFACT_DIR = Path(__file__).parent
DATA_DIR = ARTIFACT_DIR / "data"
DATA_PY = ARTIFACT_DIR / "data.py"

TIER_MAP = {
    "small": "low",
    "small_thinking": "low",
    "medium": "mid",
    "medium_thinking": "mid",
    "high": "high",
    "high_thinking": "high",
}
LABEL_ORDER = ["low", "mid", "high"]


def _norm(text: str) -> str:
    return " ".join(text.strip().lower().split())


# ---------------------------------------------------------------------------
# Existing prompt extraction
# ---------------------------------------------------------------------------


def _examples_value_node(node: ast.AST) -> ast.AST | None:
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == "EXAMPLES":
                return node.value
    elif isinstance(node, ast.AnnAssign):
        if isinstance(node.target, ast.Name) and node.target.id == "EXAMPLES":
            return node.value
    return None


def _collect_prompts_from_list(value_node: ast.AST, sink: set[str]) -> None:
    if not isinstance(value_node, ast.List):
        return
    for elt in value_node.elts:
        if not (isinstance(elt, ast.Tuple) and len(elt.elts) == 2):
            continue
        text_node = elt.elts[0]
        if isinstance(text_node, ast.Constant):
            sink.add(_norm(str(text_node.value)))


def load_existing_prompts() -> set[str]:
    src = DATA_PY.read_text(encoding="utf-8")
    tree = ast.parse(src)
    existing: set[str] = set()
    for node in ast.walk(tree):
        value_node = _examples_value_node(node)
        if value_node is not None:
            _collect_prompts_from_list(value_node, existing)
    return existing


# ---------------------------------------------------------------------------
# Data file loading
# ---------------------------------------------------------------------------


def _candidates_from_section(key: str, val: list, fname: str) -> list[dict] | None:
    label = TIER_MAP.get(key)
    if not label:
        print(f"  WARNING: unrecognised key '{key}' in {fname}, skipping")
        return None
    return [
        {
            "prompt": " ".join(prompt.split()),
            "label": label,
            "source": fname,
        }
        for prompt in val
        if isinstance(prompt, str) and prompt.strip()
    ]


def _candidates_from_file(f: Path) -> list[dict]:
    raw = json.loads(f.read_text(encoding="utf-8"))
    out: list[dict] = []
    for key, val in raw.items():
        if key == "metadata" or not isinstance(val, list):
            continue
        section = _candidates_from_section(key, val, f.name)
        if section is not None:
            out.extend(section)
    return out


def load_data_files(data_dir: Path) -> list[dict]:
    candidates: list[dict] = []
    for f in sorted(data_dir.glob("*.json")):
        candidates.extend(_candidates_from_file(f))
    return candidates


def select_new(candidates: list[dict], existing: set[str]) -> list[dict]:
    seen: set[str] = set()
    new: list[dict] = []
    for c in candidates:
        key = _norm(c["prompt"])
        if key in existing or key in seen:
            continue
        seen.add(key)
        new.append(c)
    return new


# ---------------------------------------------------------------------------
# data.py append
# ---------------------------------------------------------------------------


def _group_new_rows(new_rows: list[dict]) -> dict[str, dict[str, list[str]]]:
    by_label: dict[str, dict[str, list[str]]] = {lb: {} for lb in LABEL_ORDER}
    for row in new_rows:
        src_name = row["source"]
        by_label[row["label"]].setdefault(src_name, []).append(row["prompt"])
    return by_label


def _format_label_block(label: str, by_source: dict[str, list[str]]) -> list[str]:
    if not by_source:
        return []
    total = sum(len(v) for v in by_source.values())
    lines = [f"\n    # -- {label.upper()} (from data/ JSON files, {total} examples) --"]
    for src_name, prompts in by_source.items():
        lines.append(f"    # source: {src_name}")
        for p in prompts:
            escaped = p.replace("\\", "\\\\").replace('"', '\\"')
            lines.append(f'    ("{escaped}", "{label}"),')
    return lines


def append_to_data_py(new_rows: list[dict]) -> None:
    src = DATA_PY.read_text(encoding="utf-8")
    by_label = _group_new_rows(new_rows)

    lines: list[str] = []
    for lb in LABEL_ORDER:
        lines.extend(_format_label_block(lb, by_label[lb]))

    insertion = "\n".join(lines) + "\n"
    close_marker = "\n]\n"
    if close_marker not in src:
        print("ERROR: could not find closing ']' of EXAMPLES list in data.py")
        sys.exit(1)
    new_src = src.replace(close_marker, insertion + close_marker, 1)
    DATA_PY.write_text(new_src, encoding="utf-8")


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _print_table(
    existing_counts: dict[str, int], new_counts: Counter, dup_count: int
) -> tuple[int, int]:
    print(f"\n{'-' * 50}")
    print(f"{'Class':<8} {'Existing':>10} {'+ New':>8} {'= Total':>8}")
    print(f"{'-' * 50}")
    for lb in LABEL_ORDER:
        ex = existing_counts.get(lb, 0)
        n = new_counts.get(lb, 0)
        print(f"  {lb:<6} {ex:>10} {n:>8} {ex + n:>8}")
    total_ex = sum(existing_counts.values())
    total_new = sum(new_counts.values())
    print(f"{'-' * 50}")
    print(f"  {'TOTAL':<6} {total_ex:>10} {total_new:>8} {total_ex + total_new:>8}")
    if dup_count:
        print(f"\n  ({dup_count} duplicates skipped)")
    return total_ex, total_new


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest data/*.json files into data.py")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def run(args: argparse.Namespace) -> None:
    if not DATA_DIR.exists():
        print(f"ERROR: {DATA_DIR} not found")
        sys.exit(1)

    print(f"Loading data files from {DATA_DIR}/...")
    candidates = load_data_files(DATA_DIR)
    by_file = Counter(c["source"] for c in candidates)
    for fname, count in by_file.items():
        print(f"  {fname}: {count} examples")
    print(f"  Total: {len(candidates)}")

    print(f"\nLoading existing corpus from {DATA_PY.name}...")
    existing = load_existing_prompts()
    print(f"  {len(existing)} existing examples")

    new_rows = select_new(candidates, existing)
    new_counts = Counter(r["label"] for r in new_rows)
    dup_count = len(candidates) - len(new_rows)

    sys.path.insert(0, str(ARTIFACT_DIR))
    from data import get_label_counts

    existing_counts = get_label_counts()
    _, total_new = _print_table(existing_counts, new_counts, dup_count)

    if args.dry_run:
        print(f"\nDry run -- {total_new} examples would be added to data.py")
        return

    if total_new == 0:
        print("\nNothing to add.")
        return

    print(f"\nMerging {total_new} examples into {DATA_PY.name}...")
    append_to_data_py(new_rows)
    print("Done.")
    print("\nNext:")
    print("  python train.py && python evaluate.py --holdout && python -m pytest tests/")


def main() -> None:
    run(parse_args())


if __name__ == "__main__":
    main()
