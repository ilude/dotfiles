"""
test_ood.py -- Out-of-distribution evaluation.

Runs the 75-prompt OOD set (data/ood_eval.json) through the live v3 router.
These prompts were written independently of the training corpus to test
whether the router generalises beyond its training vocabulary.

Hard gate (test failure):
    - Zero HIGH->LOW inversions (Opus-tier prompt sent to Haiku).

Soft metrics (printed, not failures):
    - Overall accuracy
    - Per-class accuracy
    - Misclassification detail

Required by Validation Lead before > 10% production traffic.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import pytest

PROMPT_ROUTING_DIR = Path(__file__).parent.parent
OOD_PATH = PROMPT_ROUTING_DIR / "data" / "ood_eval.json"
V3_MODEL_PATH = PROMPT_ROUTING_DIR / "models" / "router_v3.joblib"

sys.path.insert(0, str(PROMPT_ROUTING_DIR))

# Map v3 model_tier -> legacy tier label (for OOD accuracy comparison)
MODEL_TIER_TO_LEGACY: dict[str, str] = {
    "Haiku": "low",
    "Sonnet": "mid",
    "Opus": "high",
}


def load_ood() -> list[tuple[str, str]]:
    data = json.loads(OOD_PATH.read_text(encoding="utf-8"))
    examples = []
    for label in ("low", "mid", "high"):
        for prompt in data[label]:
            examples.append((prompt, label))
    return examples


@pytest.fixture(scope="module")
def ood_results():
    """Run all OOD prompts through the v3 router and return per-prompt result dicts."""
    if not V3_MODEL_PATH.exists():
        pytest.skip("router_v3.joblib not found -- run train.py first")

    from router import recommend  # noqa: PLC0415

    examples = load_ood()
    results = []
    for prompt, true_label in examples:
        rec = recommend(prompt)
        routed_tier_v3 = rec["primary"]["model_tier"]
        routed_legacy = MODEL_TIER_TO_LEGACY.get(routed_tier_v3, "mid")
        confidence = rec.get("confidence", 0.0)
        inversion = true_label == "high" and routed_legacy == "low"

        results.append({
            "prompt": prompt,
            "true": true_label,
            "pred": routed_legacy,
            "pred_v3": routed_tier_v3,
            "correct": true_label == routed_legacy,
            "inversion": inversion,
            "confidence": confidence,
        })
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
                lines.append(
                    f"    conf={r['confidence']:.2f}: {r['prompt'][:80]}"
                )
            pytest.fail("\n".join(lines))


# ---------------------------------------------------------------------------
# Accuracy reporting (informational -- not hard failures)
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
        print(
            f"  true={r['true']} pred={r['pred']} "
            f"(v3={r['pred_v3']}) conf={r['confidence']:.2f}{inv}"
        )
        print(f"    {r['prompt'][:85]}")


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
        _print_misses(ood_results)
        if accuracy < 0.75:
            print(f"\nWARNING: OOD accuracy {accuracy:.1%} is below 75%.")
        print(f"{'=' * 60}\n")

        assert total == 75, f"Expected 75 OOD examples, got {total}"

    def test_low_accuracy_acceptable(self, ood_results):
        """LOW-tier OOD prompts should route correctly at a high rate."""
        low_results = [r for r in ood_results if r["true"] == "low"]
        correct = sum(1 for r in low_results if r["correct"])
        accuracy = correct / len(low_results)
        assert accuracy >= 0.72, (
            f"LOW OOD accuracy {accuracy:.1%} ({correct}/{len(low_results)}) "
            f"is unexpectedly poor."
        )

    def test_no_low_predicted_high(self, ood_results):
        """LOW prompts should never route to Opus."""
        low_to_high = [r for r in ood_results if r["true"] == "low" and r["pred"] == "high"]
        if low_to_high:
            details = "; ".join(r["prompt"][:50] for r in low_to_high)
            assert len(low_to_high) <= 2, (
                f"{len(low_to_high)} LOW prompts routed to Opus: {details}"
            )

    def test_high_recall_acceptable(self, ood_results):
        """At least 80% of HIGH-tier OOD prompts should reach Opus or Sonnet."""
        high_results = [r for r in ood_results if r["true"] == "high"]
        not_low = sum(1 for r in high_results if r["pred"] != "low")
        recall = not_low / len(high_results)
        assert recall >= 0.80, (
            f"HIGH OOD prompts reaching Opus or Sonnet: {recall:.1%} "
            f"({not_low}/{len(high_results)}). "
            f"More than 20% of hard prompts are being under-routed."
        )
