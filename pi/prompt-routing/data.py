"""
Training corpus for the prompt routing classifier.

Source of truth: data/training_corpus.json
This module is a thin loader — edit the JSON file, not this file.

To add examples:
  1. Edit data/training_corpus.json directly, or
  2. Run build_corpus.py to rebuild from source files + labeled_history.csv
  3. Then retrain: python train.py && python evaluate.py --holdout

Labels:
  low  -> route to Haiku  (simple, single-step, factual lookups)
  mid  -> route to Sonnet (multi-step, moderate analysis, code tasks with context)
  high -> route to Opus   (architectural decisions, security analysis, complex reasoning)
"""

import json
from pathlib import Path

_CORPUS_PATH = Path(__file__).parent / "data" / "training_corpus.json"


def _load() -> list[tuple[str, str]]:
    raw = json.loads(_CORPUS_PATH.read_text(encoding="utf-8"))
    examples = []
    for label in ("low", "mid", "high"):
        for prompt in raw.get(label, []):
            examples.append((prompt, label))
    return examples


# Module-level constant for backwards compatibility
EXAMPLES: list[tuple[str, str]] = _load()


def get_examples() -> list[tuple[str, str]]:
    """Return all labeled examples as (text, label) tuples."""
    return EXAMPLES


def get_label_counts() -> dict[str, int]:
    """Return count per class."""
    counts: dict[str, int] = {}
    for _, label in EXAMPLES:
        counts[label] = counts.get(label, 0) + 1
    return counts


if __name__ == "__main__":
    counts = get_label_counts()
    print(f"Total examples: {len(EXAMPLES)}")
    for label in ("low", "mid", "high"):
        print(f"  {label}: {counts.get(label, 0)}")
    print(f"Source: {_CORPUS_PATH}")
