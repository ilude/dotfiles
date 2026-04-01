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
    - Accuracy >= 85% on holdout set (hard label predictions)
    - HIGH->LOW inversions == 0  (base predictions, before floor)
    - HIGH->LOW inversions == 0  (after P(high) floor -- belt-and-suspenders)
    - Mean inference < 1ms per prompt
    - Brier score for HIGH class < 0.10  (calibration quality gate)
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
from scipy.special import softmax as _softmax
from sklearn.metrics import accuracy_score, brier_score_loss, classification_report, confusion_matrix

ARTIFACT_DIR = Path(__file__).parent
MODEL_PATH = ARTIFACT_DIR / "model.pkl"
HASH_PATH = ARTIFACT_DIR / "model.pkl.sha256"
TEST_SET_PATH = ARTIFACT_DIR / "test_set.pkl"

ACCURACY_THRESHOLD = 0.85
MAX_INFERENCE_US = 1000.0       # 1ms
BRIER_HIGH_THRESHOLD = 0.10     # calibration gate for HIGH class
HIGH_FLOOR_THRESHOLD = 0.20     # must match router.py HIGH_FLOOR_THRESHOLD
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


def apply_floor(
    y_pred: list[str],
    proba: np.ndarray,
    classes: list[str],
    threshold: float,
) -> list[str]:
    """Apply the P(high) confidence floor to a list of hard predictions."""
    hi_idx = classes.index("high")
    floored = []
    for pred, row in zip(y_pred, proba):
        if pred == "low" and row[hi_idx] > threshold:
            floored.append("mid")
        else:
            floored.append(pred)
    return floored


def run_holdout() -> None:
    """Full holdout evaluation with calibration metrics and acceptance gate."""
    if not MODEL_PATH.exists():
        print(f"ERROR: {MODEL_PATH} not found. Run train.py first.")
        sys.exit(1)
    if not TEST_SET_PATH.exists():
        print(f"ERROR: {TEST_SET_PATH} not found. Run train.py first.")
        sys.exit(1)

    model = load_model()
    X_test, y_test = load_test_set()

    # Determine probability method: prefer predict_proba, fall back to softmax(decision_function)
    has_decision_fn = hasattr(model, "decision_function")
    has_proba = has_decision_fn or hasattr(model, "predict_proba")
    if not has_proba:
        print("WARNING: model supports neither decision_function() nor predict_proba().")
        print("  Confidence floor and Brier score checks will be skipped.")

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

    # -- Base predictions -----------------------------------------------------
    y_pred = list(model.predict(X_test))
    accuracy = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred, labels=LABEL_ORDER, target_names=LABEL_ORDER)
    cm = confusion_matrix(y_test, y_pred, labels=LABEL_ORDER)
    inversions_base = [
        (t, p, x) for t, p, x in zip(y_test, y_pred, X_test)
        if t == "high" and p == "low"
    ]

    # -- Calibrated probabilities + floor -------------------------------------
    proba = None
    brier_high = None
    y_floored = y_pred
    inversions_floored = inversions_base
    threshold_table: list[tuple[float, int, int, float]] = []

    if has_proba:
        if has_decision_fn:
            # softmax(decision_function) -- Brier ~0.044, fast, monotonically correct
            proba = _softmax(model.decision_function(X_test), axis=1)
        else:
            proba = model.predict_proba(X_test)
        classes = list(model.classes_)
        hi_idx = classes.index("high")
        y_high_bin = [1 if y == "high" else 0 for y in y_test]
        brier_high = float(brier_score_loss(y_high_bin, proba[:, hi_idx]))

        # Threshold sweep
        for thresh in [0.10, 0.15, 0.20, 0.25, 0.30]:
            floored = apply_floor(y_pred, proba, classes, thresh)
            n_esc = sum(1 for p, f in zip(y_pred, floored) if p != f)
            acc_f = accuracy_score(y_test, floored)
            inv_f = sum(1 for a, b in zip(y_test, floored) if a == "high" and b == "low")
            threshold_table.append((thresh, n_esc, inv_f, acc_f))

        # Apply the live floor (must match router.py)
        y_floored = apply_floor(y_pred, proba, classes, HIGH_FLOOR_THRESHOLD)
        inversions_floored = [
            (t, p, x) for t, p, x in zip(y_test, y_floored, X_test)
            if t == "high" and p == "low"
        ]

        # Safety-adjusted accuracy: escalations from low->mid count as correct
        # when the true label is NOT low (i.e. model was conservatively right)
        safety_correct = sum(
            1 for true, base, floored_pred in zip(y_test, y_pred, y_floored)
            if floored_pred == true                         # correct after floor
            or (base == "low" and floored_pred == "mid" and true != "low")  # escalation was right
        )
        safety_acc = safety_correct / len(y_test)

    # -- Print results --------------------------------------------------------
    sep = "=" * 64
    print(f"\n{sep}")
    print("PROMPT ROUTING CLASSIFIER -- HOLDOUT EVALUATION")
    print(sep)

    print(f"\nAccuracy (base predictions):  {accuracy:.4f}  (threshold >= {ACCURACY_THRESHOLD:.2f})")
    print(f"HIGH->LOW inversions (base):  {len(inversions_base)}  (must be 0)")
    if has_proba:
        print(f"HIGH->LOW inversions (floor): {len(inversions_floored)}  (after P(high)>{HIGH_FLOOR_THRESHOLD} floor)")
        print(f"Brier score -- HIGH class:    {brier_high:.4f}  (threshold < {BRIER_HIGH_THRESHOLD:.2f}; lower=better)")
        print(f"Safety-adjusted accuracy:     {safety_acc:.4f}  (escalations to mid counted as correct)")
    print(f"Mean inference:               {mean_us:.1f} us  ({mean_us / 1000:.3f} ms, threshold < 1ms)")
    print(f"Median inference:             {median_us:.1f} us  ({median_us / 1000:.3f} ms)")
    print(f"p99  inference:               {p99_us:.1f} us  ({p99_us / 1000:.3f} ms)")

    print(f"\n{'-' * 64}")
    print("Classification Report (base predictions):")
    print(report)

    print("Confusion Matrix (rows=true label, cols=predicted label):")
    header = "         " + "  ".join(f"{lb:>6}" for lb in LABEL_ORDER)
    print(header)
    for i, row_label in enumerate(LABEL_ORDER):
        row = "  ".join(f"{cm[i, j]:>6}" for j in range(len(LABEL_ORDER)))
        print(f"  {row_label:>6}: {row}")

    if inversions_base:
        print(f"\nHIGH->LOW INVERSIONS (base, {len(inversions_base)} found):")
        for true_label, pred_label, prompt in inversions_base:
            print(f"  true={true_label} pred={pred_label}: {prompt[:80]}")

    if has_proba and threshold_table:
        print(f"\n{'-' * 64}")
        print(f"P(high) confidence-floor threshold analysis:")
        print(f"  {'thresh':>8}  {'escalated':>12}  {'base_inv':>8}  {'floor_inv':>9}  {'acc':>7}")
        for thresh, n_esc, inv_f, acc_f in threshold_table:
            pct = n_esc / len(y_test)
            marker = " <-- active" if thresh == HIGH_FLOOR_THRESHOLD else ""
            print(f"  {thresh:>8.2f}  {n_esc:>5} ({pct:.0%})     {len(inversions_base):>8}  {inv_f:>9}  {acc_f:>7.4f}{marker}")

    # -- Acceptance gate ------------------------------------------------------
    print(f"\n{sep}")
    print("ACCEPTANCE GATE")
    print(sep)

    failures: list[str] = []

    acc_pass = accuracy >= ACCURACY_THRESHOLD
    print(f"  [{'PASS' if acc_pass else 'FAIL'}] Accuracy >= {ACCURACY_THRESHOLD:.0%}:               {accuracy:.4f}")
    if not acc_pass:
        failures.append(f"Accuracy {accuracy:.4f} < {ACCURACY_THRESHOLD}")

    inv_pass = len(inversions_base) == 0
    print(f"  [{'PASS' if inv_pass else 'FAIL'}] HIGH->LOW inversions (base) = 0:   {len(inversions_base)}")
    if not inv_pass:
        failures.append(f"{len(inversions_base)} HIGH->LOW inversion(s) in base predictions")

    if has_proba:
        inv_floor_pass = len(inversions_floored) == 0
        print(f"  [{'PASS' if inv_floor_pass else 'FAIL'}] HIGH->LOW inversions (floor) = 0:  {len(inversions_floored)}")
        if not inv_floor_pass:
            failures.append(f"{len(inversions_floored)} HIGH->LOW inversion(s) after floor")

        brier_pass = brier_high < BRIER_HIGH_THRESHOLD
        print(f"  [{'PASS' if brier_pass else 'FAIL'}] Brier(HIGH) < {BRIER_HIGH_THRESHOLD:.2f}:              {brier_high:.4f}")
        if not brier_pass:
            failures.append(f"Brier(HIGH) {brier_high:.4f} >= {BRIER_HIGH_THRESHOLD}")

    inf_pass = mean_us < MAX_INFERENCE_US
    print(f"  [{'PASS' if inf_pass else 'FAIL'}] Mean inference < 1ms:              {mean_us / 1000:.3f} ms")
    if not inf_pass:
        failures.append(f"Mean inference {mean_us:.1f} us >= {MAX_INFERENCE_US:.0f} us")

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
