"""
Evaluation harness for the prompt routing classifier.

Loads model.pkl (after SHA256 integrity verification) and test_set.pkl,
runs full holdout evaluation, and enforces the acceptance gate.

Usage:
    python evaluate.py --holdout

Exit codes:
    0 -- all acceptance criteria met
    1 -- one or more criteria failed (model rejected)

Acceptance gate:
    - Accuracy >= 85% on holdout set
    - HIGH->LOW inversions == 0  (catastrophic failure prevention)
    - Mean inference < 1ms per prompt
    - SHA256 sidecar present and matches model.pkl

Security note:
    pickle.load() deserializes arbitrary Python objects. This harness
    mitigates the risk by verifying SHA256 before any load. Never load
    a model.pkl from an untrusted source -- see eval-report.md for details.
"""

import argparse
import hashlib
import pickle
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

ARTIFACT_DIR = Path(__file__).parent
MODEL_PATH = ARTIFACT_DIR / "model.pkl"
HASH_PATH = ARTIFACT_DIR / "model.pkl.sha256"
TEST_SET_PATH = ARTIFACT_DIR / "test_set.pkl"

ACCURACY_THRESHOLD = 0.85
MAX_INFERENCE_US = 1000.0  # 1ms
LABEL_ORDER = ["low", "mid", "high"]
TIMING_RUNS = 2000
WARMUP_RUNS = 20


def verify_sha256() -> str:
    """Verify model.pkl against its SHA256 sidecar. Hard-exits on failure."""
    if not HASH_PATH.exists():
        print(f"SECURITY FAIL: {HASH_PATH.name} not found.")
        print("  Run train.py to regenerate model.pkl and model.pkl.sha256.")
        sys.exit(1)

    expected = HASH_PATH.read_text().strip()
    actual = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()

    if actual != expected:
        print("SECURITY FAIL: SHA256 mismatch -- model.pkl may have been tampered with.")
        print(f"  Expected: {expected}")
        print(f"  Actual:   {actual}")
        sys.exit(1)

    return actual


def load_model():
    """Load model.pkl after SHA256 verification."""
    sha = verify_sha256()
    print(f"SHA256 verified: {sha[:16]}...")
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


def load_test_set() -> tuple[list[str], list[str]]:
    """Load held-out test split saved by train.py."""
    with open(TEST_SET_PATH, "rb") as f:
        data = pickle.load(f)
    return data["texts"], data["labels"]


def run_holdout() -> None:
    """Full holdout evaluation with acceptance gate."""
    # -- Load artifacts -------------------------------------------------------
    if not MODEL_PATH.exists():
        print(f"ERROR: {MODEL_PATH} not found. Run train.py first.")
        sys.exit(1)
    if not TEST_SET_PATH.exists():
        print(f"ERROR: {TEST_SET_PATH} not found. Run train.py first.")
        sys.exit(1)

    model = load_model()
    X_test, y_test = load_test_set()

    print(f"\nHoldout set: {len(X_test)} examples")
    label_counts = {lb: y_test.count(lb) for lb in LABEL_ORDER}
    for lb in LABEL_ORDER:
        print(f"  {lb}: {label_counts.get(lb, 0)}")

    # -- Inference timing (warm-up then timed runs) ---------------------------
    sample = [X_test[0]]
    for _ in range(WARMUP_RUNS):
        model.predict(sample)

    times_us: list[float] = []
    for _ in range(TIMING_RUNS):
        t0 = time.perf_counter()
        model.predict(sample)
        times_us.append((time.perf_counter() - t0) * 1e6)

    mean_us = float(np.mean(times_us))
    median_us = float(np.median(times_us))
    p99_us = float(np.percentile(times_us, 99))

    # -- Predictions on full holdout ------------------------------------------
    y_pred = list(model.predict(X_test))

    # -- Metrics --------------------------------------------------------------
    accuracy = accuracy_score(y_test, y_pred)
    report = classification_report(
        y_test, y_pred, labels=LABEL_ORDER, target_names=LABEL_ORDER
    )
    cm = confusion_matrix(y_test, y_pred, labels=LABEL_ORDER)

    # -- Catastrophic failure check -------------------------------------------
    inversions = [(t, p, x) for t, p, x in zip(y_test, y_pred, X_test) if t == "high" and p == "low"]

    # -- Print results --------------------------------------------------------
    sep = "=" * 62
    print(f"\n{sep}")
    print("PROMPT ROUTING CLASSIFIER -- HOLDOUT EVALUATION")
    print(sep)

    print(f"\nAccuracy:            {accuracy:.4f}  (threshold >= {ACCURACY_THRESHOLD:.2f})")
    print(f"HIGH->LOW inversions: {len(inversions)}  (must be 0)")
    print(f"Mean inference:      {mean_us:.1f} us  ({mean_us / 1000:.3f} ms, threshold < 1ms)")
    print(f"Median inference:    {median_us:.1f} us  ({median_us / 1000:.3f} ms)")
    print(f"p99  inference:      {p99_us:.1f} us  ({p99_us / 1000:.3f} ms)")

    print(f"\n{'-' * 62}")
    print("Classification Report:")
    print(report)

    print("Confusion Matrix (rows=true label, cols=predicted label):")
    header = "         " + "  ".join(f"{lb:>6}" for lb in LABEL_ORDER)
    print(header)
    for i, row_label in enumerate(LABEL_ORDER):
        row = "  ".join(f"{cm[i, j]:>6}" for j in range(len(LABEL_ORDER)))
        print(f"  {row_label:>6}: {row}")

    if inversions:
        print(f"\nHIGH->LOW INVERSIONS DETAIL ({len(inversions)} found):")
        for true_label, pred_label, prompt in inversions:
            print(f"  true={true_label} pred={pred_label}: {prompt[:80]}")

    # -- Acceptance gate ------------------------------------------------------
    print(f"\n{sep}")
    print("ACCEPTANCE GATE")
    print(sep)

    failures: list[str] = []

    acc_pass = accuracy >= ACCURACY_THRESHOLD
    print(f"  [{'PASS' if acc_pass else 'FAIL'}] Accuracy >= {ACCURACY_THRESHOLD:.0%}:          {accuracy:.4f}")
    if not acc_pass:
        failures.append(f"Accuracy {accuracy:.4f} < {ACCURACY_THRESHOLD}")

    inv_pass = len(inversions) == 0
    print(f"  [{'PASS' if inv_pass else 'FAIL'}] HIGH->LOW inversions = 0:    {len(inversions)}")
    if not inv_pass:
        failures.append(f"{len(inversions)} HIGH->LOW inversion(s) found")

    inf_pass = mean_us < MAX_INFERENCE_US
    print(f"  [{'PASS' if inf_pass else 'FAIL'}] Mean inference < 1ms:        {mean_us / 1000:.3f} ms")
    if not inf_pass:
        failures.append(f"Mean inference {mean_us:.1f} us >= {MAX_INFERENCE_US:.0f} us")

    # SHA256 already verified above (would have exited if failed)
    print(f"  [PASS] SHA256 sidecar verified")

    print()
    if failures:
        print(f"RESULT: REJECTED -- {len(failures)} failure(s):")
        for f in failures:
            print(f"  x {f}")
        sys.exit(1)
    else:
        print("RESULT: PASSED -- all acceptance criteria met.")
        sys.exit(0)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate prompt routing classifier on holdout set"
    )
    parser.add_argument(
        "--holdout",
        action="store_true",
        required=True,
        help="Run full holdout evaluation (required flag)",
    )
    args = parser.parse_args()
    if args.holdout:
        run_holdout()


if __name__ == "__main__":
    main()
