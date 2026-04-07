"""
Tests for data.py — corpus integrity, balance, and label validity.

These tests run without a trained model and catch corpus regressions
before training (e.g., mislabeled examples, duplicates, empty strings,
severe class imbalance).
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from data import EXAMPLES, get_examples, get_label_counts

VALID_LABELS = {"low", "mid", "high"}
MIN_EXAMPLES_PER_CLASS = 50
MAX_IMBALANCE_RATIO = 1.5  # largest class / smallest class


class TestCorpusFormat:
    def test_examples_is_list_of_tuples(self):
        examples = get_examples()
        assert isinstance(examples, list)
        assert len(examples) > 0
        for item in examples:
            assert isinstance(item, tuple), f"Expected tuple, got {type(item)}: {item!r}"
            assert len(item) == 2, f"Expected (text, label) tuple, got length {len(item)}"

    def test_all_texts_are_nonempty_strings(self):
        for text, label in get_examples():
            assert isinstance(text, str), f"Text must be str, got {type(text)!r} for label={label}"
            assert text.strip(), f"Empty or whitespace-only text found with label={label!r}"

    def test_all_labels_are_valid(self):
        invalid = [(text, label) for text, label in get_examples() if label not in VALID_LABELS]
        assert not invalid, (
            f"Invalid labels found: {[(t[:40], lb) for t, lb in invalid]}\n"
            f"Valid labels: {VALID_LABELS}"
        )

    def test_get_examples_returns_same_as_examples_constant(self):
        assert get_examples() == list(EXAMPLES)


class TestCorpusBalance:
    def test_minimum_examples_per_class(self):
        counts = get_label_counts()
        for label in VALID_LABELS:
            count = counts.get(label, 0)
            assert count >= MIN_EXAMPLES_PER_CLASS, (
                f"Class '{label}' has only {count} examples (minimum: {MIN_EXAMPLES_PER_CLASS})"
            )

    def test_class_imbalance_within_ratio(self):
        counts = get_label_counts()
        values = [counts.get(lb, 0) for lb in VALID_LABELS]
        ratio = max(values) / min(values)
        assert ratio <= MAX_IMBALANCE_RATIO, (
            f"Class imbalance ratio {ratio:.2f} exceeds {MAX_IMBALANCE_RATIO}. "
            f"Counts: {dict(counts)}"
        )

    def test_label_counts_sum_to_total(self):
        examples = get_examples()
        counts = get_label_counts()
        assert sum(counts.values()) == len(examples)


class TestCorpusUniqueness:
    def test_no_duplicate_prompts(self):
        texts = [text for text, _ in get_examples()]
        seen = set()
        duplicates = []
        for text in texts:
            normalized = text.strip().lower()
            if normalized in seen:
                duplicates.append(text)
            seen.add(normalized)
        assert not duplicates, f"Duplicate prompts found ({len(duplicates)}):\n" + "\n".join(
            f"  {t!r}" for t in duplicates[:5]
        )

    def test_no_prompt_appears_in_multiple_classes(self):
        label_by_text: dict[str, str] = {}
        conflicts = []
        for text, label in get_examples():
            normalized = text.strip().lower()
            if normalized in label_by_text and label_by_text[normalized] != label:
                conflicts.append((text, label_by_text[normalized], label))
            label_by_text[normalized] = label
        assert not conflicts, f"Same prompt appears with different labels: {conflicts[:3]}"


class TestLabelSemantics:
    """Spot-check that obviously simple prompts are 'low' and obviously complex are 'high'."""

    def setup_method(self):
        self.label_map = {text.strip().lower(): label for text, label in get_examples()}

    def _label(self, text: str) -> str | None:
        return self.label_map.get(text.strip().lower())

    @pytest.mark.parametrize(
        "prompt",
        [
            "What is Python?",
            "What does len() return in Python?",
            "What is a variable?",
            "What is a boolean?",
        ],
    )
    def test_definitional_prompts_are_low(self, prompt):
        label = self._label(prompt)
        if label is None:
            pytest.skip(f"Prompt not in corpus: {prompt!r}")
        assert label == "low", f"Expected 'low' for {prompt!r}, got {label!r}"

    @pytest.mark.parametrize(
        "prompt",
        [
            "Design the authentication architecture for a multi-tenant SaaS platform handling 1M concurrent users.",  # noqa: E501
            "Analyze the security vulnerabilities in this cryptographic implementation and propose fixes.",  # noqa: E501
            "Design a distributed consensus protocol for a payment processing system requiring sub-100ms latency.",  # noqa: E501
        ],
    )
    def test_architecture_prompts_are_high(self, prompt):
        label = self._label(prompt)
        if label is None:
            pytest.skip(f"Prompt not in corpus: {prompt!r}")
        assert label == "high", f"Expected 'high' for {prompt!r}, got {label!r}"
