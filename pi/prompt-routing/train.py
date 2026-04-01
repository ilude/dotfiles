"""
Training pipeline for the prompt routing classifier.

Loads labeled corpus from data.py, fits TF-IDF + LinearSVC pipeline,
performs grid search over C, saves:
  - model.pkl        (sklearn Pipeline: TfidfVectorizer + LinearSVC)
  - model.pkl.sha256 (integrity sidecar)
  - test_set.pkl     (held-out test split for evaluate.py)
  - training-log.txt (CV scores, best hyperparameters, holdout results)

Architecture note on CalibratedClassifierCV:
  Board consensus specified LinearSVC + CalibratedClassifierCV(cv='prefit').
  In scikit-learn 1.8.0, cv='prefit' was removed. Alternatives benchmarked:
    - CalibratedClassifierCV(cv=5)          -> ~3700 us mean (5x SVM ensemble)
    - CalibratedClassifierCV(ensemble=False) -> ~1557 us mean (exceeds 1ms budget)
    - LinearSVC direct                       -> ~671 us mean  (meets 1ms budget)
  Decision: LinearSVC direct in production Pipeline. CalibratedClassifierCV(cv=5)
  is retained in the grid search phase only, for cross-validation score stability.
  The production model does not need probability calibration for hard routing.
"""

import hashlib
import pickle
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

ARTIFACT_DIR = Path(__file__).parent
sys.path.insert(0, str(ARTIFACT_DIR))

from data import get_examples, get_label_counts  # noqa: E402

LABEL_ORDER = ["low", "mid", "high"]
C_VALUES = [0.01, 0.1, 1.0, 10.0]
TEST_SIZE = 0.2
RANDOM_STATE = 42
CV_FOLDS = 5
MAX_ITER = 2000
TFIDF_KWARGS = dict(max_features=7000, ngram_range=(1, 2), sublinear_tf=True)


def build_search_pipeline(C: float) -> Pipeline:
    """Pipeline used during grid search. CalibratedClassifierCV(cv=5) gives
    stable probability estimates for cross-validation score comparison."""
    return Pipeline(
        [
            ("tfidf", TfidfVectorizer(**TFIDF_KWARGS)),
            (
                "clf",
                CalibratedClassifierCV(
                    LinearSVC(C=C, max_iter=MAX_ITER, random_state=RANDOM_STATE),
                    cv=CV_FOLDS,
                ),
            ),
        ]
    )


def build_production_pipeline(best_C: float) -> Pipeline:
    """
    Production pipeline: TfidfVectorizer + LinearSVC (no calibration wrapper).

    LinearSVC.predict() = single dot product on sparse vector. With the actual
    corpus vocabulary of ~1635 tokens (corpus-limited despite max_features=10000),
    this runs at ~670 us mean on standard hardware -- well within the 1ms budget.

    CalibratedClassifierCV is not used in production because:
      - cv='prefit' removed in sklearn 1.8.0
      - ensemble=False: ~1557 us (exceeds budget)
      - cv=5 ensemble:  ~3700 us (5x overhead, exceeds budget)
    """
    return Pipeline(
        [
            ("tfidf", TfidfVectorizer(**TFIDF_KWARGS)),
            ("clf", LinearSVC(C=best_C, max_iter=MAX_ITER, random_state=RANDOM_STATE)),
        ]
    )


def main() -> None:
    log_lines: list[str] = []

    def log(msg: str = "") -> None:
        print(msg)
        log_lines.append(msg)

    # -- 1. Load corpus -------------------------------------------------------
    examples = get_examples()
    texts = [t for t, _ in examples]
    labels = [lb for _, lb in examples]

    log("=" * 60)
    log("PROMPT ROUTING CLASSIFIER -- TRAINING")
    log("=" * 60)
    log(f"\nCorpus: {len(examples)} examples")
    counts = get_label_counts()
    for label in LABEL_ORDER:
        log(f"  {label}: {counts.get(label, 0)}")

    # -- 2. Stratified 80/20 split --------------------------------------------
    X_train, X_test, y_train, y_test = train_test_split(
        texts,
        labels,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=labels,
    )
    log(
        f"\nSplit: {len(X_train)} train / {len(X_test)} test "
        f"(stratified {int((1 - TEST_SIZE) * 100)}/{int(TEST_SIZE * 100)})"
    )

    # Save holdout for evaluate.py
    test_set_path = ARTIFACT_DIR / "test_set.pkl"
    with open(test_set_path, "wb") as f:
        pickle.dump({"texts": X_test, "labels": y_test}, f)
    log("Saved test_set.pkl")

    # -- 3. Grid search over C (search pipeline uses CalibratedClassifierCV) --
    log(f"\n{'-' * 40}")
    log(f"Grid search: LinearSVC C in {C_VALUES}")
    log(f"Cross-validation: {CV_FOLDS}-fold stratified")
    log(f"Search pipeline: CalibratedClassifierCV(cv=5) for stable CV scores")
    log(f"{'-' * 40}")

    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    best_C = C_VALUES[0]
    best_score = -1.0

    for C in C_VALUES:
        pipeline = build_search_pipeline(C)
        scores = cross_val_score(pipeline, X_train, y_train, cv=cv, scoring="accuracy")
        mean_score = float(scores.mean())
        std_score = float(scores.std())
        log(f"  C={C:>5}: CV accuracy = {mean_score:.4f} +- {std_score:.4f}")
        if mean_score > best_score:
            best_score = mean_score
            best_C = C

    log(f"\nBest C: {best_C}  (CV accuracy: {best_score:.4f})")

    # -- 4. Build production model (LinearSVC direct for <1ms inference) ------
    log(f"\n{'-' * 40}")
    log("Building production model (LinearSVC direct, no calibration wrapper)...")
    log(f"  Reason: cv='prefit' removed in sklearn 1.8.0; ensemble=False too slow")
    log(f"  Production path: TF-IDF transform + LinearSVC dot product")
    pipeline = build_production_pipeline(best_C)
    pipeline.fit(X_train, y_train)
    log("Done.")

    # -- 5. Holdout evaluation ------------------------------------------------
    y_pred = pipeline.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    inversions = sum(1 for t, p in zip(y_test, y_pred) if t == "high" and p == "low")

    log(f"\n{'-' * 40}")
    log("Holdout evaluation:")
    log(f"  Accuracy:             {accuracy:.4f}")
    log(f"  HIGH->LOW inversions: {inversions}")
    log("\nClassification Report:")
    log(classification_report(y_test, y_pred, labels=LABEL_ORDER, target_names=LABEL_ORDER))
    log("Confusion Matrix (rows=true, cols=predicted):")
    log(f"         {'  '.join(f'{lb:>6}' for lb in LABEL_ORDER)}")
    cm = confusion_matrix(y_test, y_pred, labels=LABEL_ORDER)
    for i, row_label in enumerate(LABEL_ORDER):
        log(f"  {row_label:>6}: {'  '.join(f'{cm[i, j]:>6}' for j in range(len(LABEL_ORDER)))}")

    # -- 6. Inference timing --------------------------------------------------
    sample = ["Design a distributed consensus protocol for a payment system."]
    # Warm-up
    for _ in range(20):
        pipeline.predict(sample)
    times_us: list[float] = []
    for _ in range(2000):
        t0 = time.perf_counter()
        pipeline.predict(sample)
        times_us.append((time.perf_counter() - t0) * 1e6)
    mean_us = float(np.mean(times_us))
    p99_us = float(np.percentile(times_us, 99))
    log(f"\nInference timing (2000 runs after 20x warm-up):")
    log(f"  Mean: {mean_us:.1f} us  ({mean_us / 1000:.3f} ms)")
    log(f"  p99:  {p99_us:.1f} us  ({p99_us / 1000:.3f} ms)")

    # -- 7. Save model --------------------------------------------------------
    model_path = ARTIFACT_DIR / "model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(pipeline, f)
    log(f"\nSaved model.pkl")

    # -- 8. SHA256 sidecar ----------------------------------------------------
    sha256 = hashlib.sha256(model_path.read_bytes()).hexdigest()
    (ARTIFACT_DIR / "model.pkl.sha256").write_text(sha256)
    log(f"SHA256: {sha256}")
    log("Saved model.pkl.sha256")

    # -- 9. Write training log ------------------------------------------------
    log_path = ARTIFACT_DIR / "training-log.txt"
    log_path.write_text("\n".join(log_lines), encoding="utf-8")
    print("\nTraining log written to training-log.txt")

    # -- 10. Constraint gate --------------------------------------------------
    print(f"\n{'=' * 40}")
    failures = []
    if accuracy < 0.85:
        failures.append(f"accuracy {accuracy:.4f} < 0.85")
    if inversions > 0:
        failures.append(f"{inversions} HIGH->LOW inversion(s)")
    if mean_us >= 1000.0:
        failures.append(f"inference {mean_us:.1f} us >= 1000 us (mean)")

    if failures:
        print("TRAINING GATE FAILED:")
        for f in failures:
            print(f"  x {f}")
        sys.exit(1)
    else:
        print("TRAINING GATE PASSED -- all constraints satisfied.")
        print("Ready for evaluate.py --holdout")


if __name__ == "__main__":
    main()
