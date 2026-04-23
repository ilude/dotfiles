"""
Training corpus for the prompt routing classifier.

Source of truth: data/training_corpus.json (legacy flat-array format)
v3 row-based corpus: data/*_v3*.jsonl (cheapest_acceptable_route schema)

This module is a thin loader -- edit the JSON/JSONL files, not this file.

To add legacy examples:
  1. Edit data/training_corpus.json directly, or
  2. Run build_corpus.py to rebuild from source files + labeled_history.csv
  3. Then retrain: python train.py && python evaluate.py --holdout

To add v3 route-labeled examples (training_corpus_v3 / cheapest_acceptable_route):
  1. Append rows to data/seed_route_labels.jsonl or similar v3 JSONL files.
  2. Run build_corpus.py -- it loads v3 rows and merges them via complexity_tier
     or cheapest_acceptable_route model_tier mapping.
  3. Retrain as above.

Labels:
  low  -> route to Haiku  (simple, single-step, factual lookups)
  mid  -> route to Sonnet (multi-step, moderate analysis, code tasks with context)
  high -> route to Opus   (architectural decisions, security analysis, complex reasoning)

v3 cheapest_acceptable_route model_tier mapping:
  Haiku  -> low
  Sonnet -> mid
  Opus   -> high
"""

import json
from pathlib import Path

_DATA_DIR = Path(__file__).parent / "data"
_CORPUS_PATH = _DATA_DIR / "training_corpus.json"


def _load() -> list[tuple[str, str]]:
    raw = json.loads(_CORPUS_PATH.read_text(encoding="utf-8"))
    examples = []
    for label in ("low", "mid", "high"):
        for prompt in raw.get(label, []):
            examples.append((prompt, label))
    return examples


def _load_v3_jsonl(path: Path) -> list[dict]:
    """Load a JSONL file of v3 row objects (training_corpus_v3 schema)."""
    if not path.exists():
        return []
    rows: list[dict] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return rows


def get_v3_examples(glob: str = "*_v3*.jsonl") -> list[dict]:
    """Return all v3 row objects from JSONL files matching glob under data/.

    Each row carries the full v3 schema including cheapest_acceptable_route,
    complexity_tier (when available), and provenance (for synthetic rows).
    Example fixtures (*example*) are excluded.
    """
    rows: list[dict] = []
    for path in sorted(_DATA_DIR.glob(glob)):
        if "example" in path.name:
            continue
        rows.extend(_load_v3_jsonl(path))
    return rows


# Module-level constant for backwards compatibility
EXAMPLES: list[tuple[str, str]] = _load()


def get_examples() -> list[tuple[str, str]]:
    """Return all labeled examples as (text, label) tuples (legacy flat format)."""
    return EXAMPLES


def get_label_counts() -> dict[str, int]:
    """Return count per class."""
    counts: dict[str, int] = {}
    for _, label in EXAMPLES:
        counts[label] = counts.get(label, 0) + 1
    return counts


if __name__ == "__main__":
    counts = get_label_counts()
    print(f"Total legacy examples: {len(EXAMPLES)}")
    for label in ("low", "mid", "high"):
        print(f"  {label}: {counts.get(label, 0)}")
    print(f"Source: {_CORPUS_PATH}")

    v3_rows = get_v3_examples()
    if v3_rows:
        print(f"\nv3 row-based examples (training_corpus_v3 / cheapest_acceptable_route): "
              f"{len(v3_rows)}")
    else:
        print("\nNo v3 JSONL files found (expected after T5/T6 populate data/)")
