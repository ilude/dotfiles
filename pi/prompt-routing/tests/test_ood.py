"""
test_ood.py — Out-of-distribution evaluation.

Runs the 75-prompt OOD set (data/ood_eval.json) through the live router.
These prompts were written independently of the training corpus to test
whether the router generalises beyond its training vocabulary.

Hard gate (test failure):
    - Zero HIGH->LOW inversions (Opus-tier prompt sent to Haiku).

Soft metrics (printed, not failures):
    - Overall accuracy
    - Per-class accuracy
    - Misclassification detail

The soft metrics are informational — OOD accuracy will naturally be lower
than in-distribution accuracy. The goal is to understand where the model
breaks down, not to enforce a specific number.

Required by Validation Lead before > 10% production traffic.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import pytest

PROMPT_ROUTING_DIR = Path(__file__).parent.parent
OOD_PATH = PROMPT_ROUTING_DIR / "data" / "ood_eval.json"

sys.path.insert(0, str(PROMPT_ROUTING_DIR))


def load_ood() -> list[tuple[str, str]]:
    data = json.loads(OOD_PATH.read_text(encoding="utf-8"))
    examples = []
    for label in ("low", "mid", "high"):
        for prompt in data[label]:
            examples.append((prompt, label))
    return examples


@pytest.fixture(scope="module")
def ood_results(model):
    """Run all OOD prompts through the production router (with floor applied).

    Uses route_with_proba() so results reflect the actual production routing
    decision including the P(high) confidence floor. Also records the raw
    model prediction (before floor) for diagnostic reporting.
    """
    from router import route_with_proba

    examples = load_ood()
    texts = [p for p, _ in examples]
    true_labels = [lb for _, lb in examples]

    # Raw model predictions (before floor) for comparison
    raw_preds = list(model.predict(texts))

    results = []
    for i, (prompt, true) in enumerate(zip(texts, true_labels)):
        # Production path: router with floor
        routed_tier, proba = route_with_proba(prompt, log=False)
        raw_pred = raw_preds[i]
        floor_applied = routed_tier != raw_pred

        results.append(
            {
                "prompt": prompt,
                "true": true,
                "pred": routed_tier,  # what production would actually do
                "raw_pred": raw_pred,  # what model alone would do
                "floor_applied": floor_applied,
                "correct": true == routed_tier,
                "inversion": true == "high" and routed_tier == "low",
                "proba": proba,
                "p_high": proba.get("high", 0.0),
            }
        )

    return results


# ---------------------------------------------------------------------------
# Hard gate
# ---------------------------------------------------------------------------


class TestOODInversions:
    def test_zero_high_to_low_inversions(self, ood_results):
        """No HIGH prompt in the OOD set may be routed to Haiku."""
        inversions = [r for r in ood_results if r["inversion"]]
        if inversions:
            lines = [f"\n  HIGH->LOW inversions found ({len(inversions)}):"]
            for r in inversions:
                lines.append(f"    P(high)={r['p_high']:.2f}: {r['prompt'][:80]}")
            pytest.fail("\n".join(lines))


# ---------------------------------------------------------------------------
# Accuracy reporting (informational — not hard failures)
# ---------------------------------------------------------------------------


def _accuracy_by_class(ood_results: list[dict]) -> dict[str, dict]:
    by_class: dict[str, dict] = defaultdict(lambda: {"correct": 0, "total": 0})
    for r in ood_results:
        by_class[r["true"]]["total"] += 1
        if r["correct"]:
            by_class[r["true"]]["correct"] += 1
    return by_class


def _print_class_breakdown(by_class: dict[str, dict]) -> None:
    for label in ("low", "mid", "high"):
        d = by_class[label]
        acc = d["correct"] / d["total"] if d["total"] else 0
        print(f"  {label:4}: {acc:.1%}  ({d['correct']}/{d['total']})")


def _print_misses(ood_results: list[dict]) -> None:
    misses = [r for r in ood_results if not r["correct"]]
    if not misses:
        return
    print(f"\nMisclassifications ({len(misses)}):")
    for r in misses:
        inv = " *** INVERSION ***" if r["inversion"] else ""
        floor_note = f" [floor: {r['raw_pred']}->{r['pred']}]" if r["floor_applied"] else ""
        print(f"  true={r['true']} pred={r['pred']} P(hi)={r['p_high']:.2f}{inv}{floor_note}")
        print(f"    {r['prompt'][:85]}")


def _print_floor_count(ood_results: list[dict]) -> None:
    floor_count = sum(1 for r in ood_results if r["floor_applied"])
    if floor_count:
        print(f"  (floor applied to {floor_count} prompts — raw model would have sent them lower)")


def _print_accuracy_warning(accuracy: float) -> None:
    if accuracy < 0.75:
        print(f"\nWARNING: OOD accuracy {accuracy:.1%} is below 75%.")
        print("  Consider expanding training corpus with more domain diversity.")


class TestOODAccuracy:
    def test_overall_accuracy_reported(self, ood_results):
        """Print overall OOD accuracy. Does not fail on any number."""
        total = len(ood_results)
        correct = sum(1 for r in ood_results if r["correct"])
        accuracy = correct / total

        print(f"\n{'=' * 60}")
        print("OOD EVALUATION RESULTS")
        print(f"{'=' * 60}")
        print(f"Overall accuracy: {accuracy:.1%}  ({correct}/{total})")
        print()
        _print_class_breakdown(_accuracy_by_class(ood_results))
        _print_floor_count(ood_results)
        _print_misses(ood_results)
        _print_accuracy_warning(accuracy)
        print(f"{'=' * 60}\n")

        # This test always passes — it's a reporting test
        assert total == 75, f"Expected 75 OOD examples, got {total}"

    def test_low_accuracy_acceptable(self, ood_results):
        """LOW-tier OOD prompts should route correctly at a high rate.

        LOW prompts use consistent vocabulary (what, how, define, explain)
        that the training corpus covers well.
        """
        low_results = [r for r in ood_results if r["true"] == "low"]
        correct = sum(1 for r in low_results if r["correct"])
        accuracy = correct / len(low_results)
        assert accuracy >= 0.72, (
            f"LOW OOD accuracy {accuracy:.1%} ({correct}/{len(low_results)}) "
            f"is unexpectedly poor — the LOW class vocabulary may have drifted."
        )

    def test_no_low_predicted_high(self, ood_results):
        """LOW prompts should never route to Opus.

        Sending a trivial prompt to the most expensive model wastes money
        but is not as dangerous as an inversion.
        Soft gate: alert if > 2 low->high misroutes.
        """
        low_to_high = [r for r in ood_results if r["true"] == "low" and r["pred"] == "high"]
        if low_to_high:
            details = "; ".join(r["prompt"][:50] for r in low_to_high)
            assert len(low_to_high) <= 2, (
                f"{len(low_to_high)} LOW prompts routed to Opus (costly over-routing): {details}"
            )

    def test_high_recall_acceptable(self, ood_results):
        """At least 80% of HIGH-tier OOD prompts should reach Opus or Sonnet.

        HIGH->MID is a quality degradation but not catastrophic.
        HIGH->LOW is blocked by test_zero_high_to_low_inversions.
        """
        high_results = [r for r in ood_results if r["true"] == "high"]
        not_low = sum(1 for r in high_results if r["pred"] != "low")
        recall = not_low / len(high_results)
        assert recall >= 0.80, (
            f"HIGH OOD prompts reaching Opus or Sonnet: {recall:.1%} "
            f"({not_low}/{len(high_results)}). "
            f"More than 20% of hard prompts are being under-routed."
        )
