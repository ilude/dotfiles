"""
exp_alternative_classifiers.py

Experiment: do alternative classifier architectures beat the T2 production model
(LinearSVC on TF-IDF 1-3gram, eval_v3 top-1=0.6241, catastrophic=38)?

Architectures tested:
  1. LightGBM on TF-IDF(1-3gram) + hand-crafted features
  2. sklearn HistGradientBoostingClassifier on TF-IDF(dense PCA) + hand features
  3. Haiku safety-margin sweep (same T2 SVC, vary P(Haiku) threshold)

Usage:
    python pi/prompt-routing/experiments/exp_alternative_classifiers.py

Output:
    pi/prompt-routing/experiments/exp_results.json
"""

import json
import re
import time
from pathlib import Path

import numpy as np
from scipy.special import softmax as _softmax
from sklearn.decomposition import TruncatedSVD
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import LabelEncoder
from sklearn.svm import LinearSVC

_DIR = Path(__file__).parent.parent
DATA_DIR = _DIR / "data"
EXP_DIR = Path(__file__).parent
RESULTS_PATH = EXP_DIR / "exp_results.json"

TRAIN_PATH = DATA_DIR / "train_v3.jsonl"
DEV_PATH = DATA_DIR / "dev_v3.jsonl"
EVAL_PATH = DATA_DIR / "eval_v3.jsonl"

TIER_ORDER = {"Haiku": 0, "Sonnet": 1, "Opus": 2}
EFFORT_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}

RANDOM_STATE = 42

KEYWORD_PATTERNS = {
    "kw_architecture": re.compile(
        r"\b(architect|system design|distributed|microservice|scalab|consensus|raft|paxos)\b",
        re.I,
    ),
    "kw_security": re.compile(
        r"\b(security|auth|oauth|jwt|encrypt|vulnerab|pentest|firewall|csrf|xss|injection)\b",
        re.I,
    ),
    "kw_debug": re.compile(
        r"\b(debug|fix|error|bug|crash|traceback|exception|broken|not working|fails?)\b",
        re.I,
    ),
    "kw_refactor": re.compile(
        r"\b(refactor|rewrite|clean up|improve|optimize|perf|benchmark|profil)\b",
        re.I,
    ),
    "kw_design": re.compile(
        r"\b(design|pattern|solid|ddd|event.driven|cqrs|saga|hexagonal)\b",
        re.I,
    ),
}

DOMAIN_TOKENS = [
    "python",
    "typescript",
    "javascript",
    "rust",
    "go",
    "java",
    "sql",
    "bash",
    "kubernetes",
    "docker",
    "react",
    "aws",
    "terraform",
    "ansible",
]


def _load_jsonl(path: Path) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def route_label(row: dict) -> str:
    car = row["cheapest_acceptable_route"]
    return f"{car['model_tier']}|{car['effort']}"


def tier_label(row: dict) -> str:
    return row["cheapest_acceptable_route"]["model_tier"]


def hand_features(prompt: str) -> list[float]:
    """Extract scalar hand-crafted features from a prompt string."""
    words = prompt.split()
    nw = len(words)
    nc = len(prompt)
    feats: list[float] = [
        float(nc),
        float(nw),
        float(nc / max(nw, 1)),           # avg word length
        float(prompt.count("?") > 0),
        float(prompt.count("\n") > 2),
        float(prompt.count("```") > 0),
    ]
    for key, pat in KEYWORD_PATTERNS.items():
        feats.append(float(bool(pat.search(prompt))))
    p_lower = prompt.lower()
    for tok in DOMAIN_TOKENS:
        feats.append(float(tok in p_lower))
    return feats


def compute_metrics(
    labels_true: list[str],
    labels_pred: list[str],
) -> dict:
    n = len(labels_true)
    correct = sum(t == p for t, p in zip(labels_true, labels_pred))
    top1 = correct / n

    catastrophic = 0
    over_routing = 0
    cwq_sum = 0.0

    tier_tp: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}
    tier_gt: dict[str, int] = {"Haiku": 0, "Sonnet": 0, "Opus": 0}

    for true_lbl, pred_lbl in zip(labels_true, labels_pred):
        gt_tier, gt_effort = true_lbl.split("|")
        pred_tier, pred_effort = pred_lbl.split("|")

        gt_tr = TIER_ORDER[gt_tier]
        gt_er = EFFORT_ORDER[gt_effort]
        pt = TIER_ORDER[pred_tier]
        pe = EFFORT_ORDER[pred_effort]

        if gt_tier in {"Sonnet", "Opus"} and pred_tier == "Haiku" and pe <= EFFORT_ORDER["medium"]:
            catastrophic += 1

        pred_cost = pt * 4 + pe + 1
        gt_cost = gt_tr * 4 + gt_er + 1
        if (pt, pe) > (gt_tr, gt_er):
            over_routing += 1
            cwq_sum += gt_cost / pred_cost
        elif (pt, pe) < (gt_tr, gt_er):
            cwq_sum += 0.0
        else:
            cwq_sum += 1.0

        tier_gt[gt_tier] += 1
        if pred_tier == gt_tier:
            tier_tp[gt_tier] += 1

    per_tier_recall = {
        t: tier_tp[t] / tier_gt[t] if tier_gt[t] > 0 else 0.0
        for t in ("Haiku", "Sonnet", "Opus")
    }

    return {
        "top1": round(top1, 4),
        "catastrophic": catastrophic,
        "over_routing_rate": round(over_routing / n, 4),
        "per_tier_recall": {k: round(v, 4) for k, v in per_tier_recall.items()},
    }


# ---------------------------------------------------------------------------
# Experiment 1: LightGBM on TF-IDF(1-3gram sparse) + hand features
# ---------------------------------------------------------------------------

def run_lightgbm(train_rows: list[dict], eval_rows: list[dict]) -> dict:
    import lightgbm as lgb

    print("  [LightGBM] building features...")
    tfidf = TfidfVectorizer(
        max_features=6000,
        ngram_range=(1, 3),
        sublinear_tf=True,
        strip_accents="unicode",
    )
    le = LabelEncoder()

    train_texts = [r["prompt"] for r in train_rows]
    eval_texts = [r["prompt"] for r in eval_rows]
    train_labels = [route_label(r) for r in train_rows]
    eval_labels = [route_label(r) for r in eval_rows]

    le.fit(train_labels)
    y_train = le.transform(train_labels)

    X_tfidf_train = tfidf.fit_transform(train_texts)
    X_tfidf_eval = tfidf.transform(eval_texts)

    # Hand features as dense array
    hf_train = np.array([hand_features(t) for t in train_texts], dtype=np.float32)
    hf_eval = np.array([hand_features(t) for t in eval_texts], dtype=np.float32)

    # Concatenate: sparse TF-IDF (dense conversion) + hand features
    # Use SVD to keep TF-IDF manageable for LightGBM (which prefers dense)
    print("  [LightGBM] SVD(150) on TF-IDF...")
    svd = TruncatedSVD(n_components=150, random_state=RANDOM_STATE)
    X_svd_train = svd.fit_transform(X_tfidf_train).astype(np.float32)
    X_svd_eval = svd.transform(X_tfidf_eval).astype(np.float32)

    X_train = np.hstack([X_svd_train, hf_train])
    X_eval = np.hstack([X_svd_eval, hf_eval])

    n_classes = len(le.classes_)
    print(f"  [LightGBM] training ({n_classes} classes, {X_train.shape[1]} features)...")
    t0 = time.perf_counter()
    clf = lgb.LGBMClassifier(
        n_estimators=400,
        num_leaves=63,
        learning_rate=0.05,
        min_child_samples=5,
        random_state=RANDOM_STATE,
        n_jobs=4,
        class_weight="balanced",
        verbose=-1,
    )
    clf.fit(X_train, y_train)
    elapsed = time.perf_counter() - t0
    print(f"  [LightGBM] trained in {elapsed:.1f}s")

    preds_idx = clf.predict(X_eval)
    labels_pred = [str(le.classes_[i]) for i in preds_idx]

    metrics = compute_metrics(eval_labels, labels_pred)
    metrics["train_time_s"] = round(elapsed, 1)
    return metrics


# ---------------------------------------------------------------------------
# Experiment 2: HistGradientBoosting on TF-IDF SVD + hand features
# ---------------------------------------------------------------------------

def run_histgb(train_rows: list[dict], eval_rows: list[dict]) -> dict:
    print("  [HistGB] building features...")
    tfidf = TfidfVectorizer(
        max_features=6000,
        ngram_range=(1, 3),
        sublinear_tf=True,
        strip_accents="unicode",
    )
    le = LabelEncoder()

    train_texts = [r["prompt"] for r in train_rows]
    eval_texts = [r["prompt"] for r in eval_rows]
    train_labels = [route_label(r) for r in train_rows]
    eval_labels = [route_label(r) for r in eval_rows]

    le.fit(train_labels)
    y_train = le.transform(train_labels)

    X_tfidf_train = tfidf.fit_transform(train_texts)
    X_tfidf_eval = tfidf.transform(eval_texts)

    hf_train = np.array([hand_features(t) for t in train_texts], dtype=np.float32)
    hf_eval = np.array([hand_features(t) for t in eval_texts], dtype=np.float32)

    print("  [HistGB] SVD(100)...")
    svd = TruncatedSVD(n_components=100, random_state=RANDOM_STATE)
    X_svd_train = svd.fit_transform(X_tfidf_train).astype(np.float32)
    X_svd_eval = svd.transform(X_tfidf_eval).astype(np.float32)

    X_train = np.hstack([X_svd_train, hf_train])
    X_eval = np.hstack([X_svd_eval, hf_eval])

    print(f"  [HistGB] training ({X_train.shape[1]} features)...")
    t0 = time.perf_counter()
    clf = HistGradientBoostingClassifier(
        max_iter=400,
        learning_rate=0.05,
        max_leaf_nodes=63,
        min_samples_leaf=5,
        random_state=RANDOM_STATE,
        class_weight="balanced",
    )
    clf.fit(X_train, y_train)
    elapsed = time.perf_counter() - t0
    print(f"  [HistGB] trained in {elapsed:.1f}s")

    preds_idx = clf.predict(X_eval)
    labels_pred = [str(le.classes_[i]) for i in preds_idx]

    metrics = compute_metrics(eval_labels, labels_pred)
    metrics["train_time_s"] = round(elapsed, 1)
    return metrics


# ---------------------------------------------------------------------------
# Experiment 3: Haiku safety-margin sweep on T2 SVC
# ---------------------------------------------------------------------------

def run_margin_sweep(train_rows: list[dict], eval_rows: list[dict]) -> dict:
    """
    Refit a LinearSVC (T2-identical) and sweep the probability threshold
    below which a Haiku prediction is promoted to Sonnet, to trade
    catastrophic-under-routing against top-1 accuracy.
    """
    print("  [MarginSweep] fitting T2-equivalent SVC...")
    tfidf = TfidfVectorizer(
        max_features=8000,
        ngram_range=(1, 3),
        sublinear_tf=True,
        min_df=1,
        strip_accents="unicode",
    )
    le = LabelEncoder()

    train_texts = [r["prompt"] for r in train_rows]
    eval_texts = [r["prompt"] for r in eval_rows]
    train_labels = [route_label(r) for r in train_rows]
    eval_labels = [route_label(r) for r in eval_rows]

    le.fit(train_labels)
    y_train = le.transform(train_labels)
    classes = list(le.classes_)

    X_train = tfidf.fit_transform(train_texts)
    X_eval = tfidf.transform(eval_texts)

    svc = LinearSVC(C=5.0, max_iter=5000, random_state=RANDOM_STATE, class_weight="balanced")
    svc.fit(X_train, y_train)

    df = svc.decision_function(X_eval)
    proba = _softmax(df, axis=1)  # (n_eval, n_classes)

    # Identify haiku class indices
    haiku_indices = [i for i, c in enumerate(classes) if c.startswith("Haiku")]
    # Fallback for Haiku predictions: promote to Sonnet|medium

    thresholds = [0.55, 0.60, 0.65, 0.70, 0.75]
    sweep_results = []

    for thresh in thresholds:
        labels_pred = []
        for p_row in proba:
            raw_idx = int(p_row.argmax())
            raw_lbl = classes[raw_idx]
            if raw_idx in haiku_indices and p_row[raw_idx] < thresh:
                # Insufficient confidence -- promote to lowest Sonnet label
                sonnet_idxs = [i for i, c in enumerate(classes) if c.startswith("Sonnet")]
                # Pick highest probability Sonnet
                best_sonnet = max(sonnet_idxs, key=lambda i: p_row[i])
                labels_pred.append(classes[best_sonnet])
            else:
                labels_pred.append(raw_lbl)

        m = compute_metrics(eval_labels, labels_pred)
        sweep_results.append({
            "haiku_threshold": thresh,
            "top1": m["top1"],
            "catastrophic": m["catastrophic"],
            "per_tier_recall": m["per_tier_recall"],
        })
        print(
            f"  threshold={thresh:.2f}  top1={m['top1']:.4f}  catastrophic={m['catastrophic']}"
        )

    # Best by catastrophic=0 then top1
    zero_cat = [r for r in sweep_results if r["catastrophic"] == 0]
    if zero_cat:
        best = max(zero_cat, key=lambda r: r["top1"])
    else:
        best = min(sweep_results, key=lambda r: r["catastrophic"])

    return {
        "sweep": sweep_results,
        "best": best,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("Loading data...")
    train_rows = _load_jsonl(TRAIN_PATH)
    dev_rows = _load_jsonl(DEV_PATH)
    eval_rows = _load_jsonl(EVAL_PATH)

    # Train on train+dev (same as T2 production), eval on held-out eval_v3
    all_train = train_rows + dev_rows
    print(f"  train+dev: {len(all_train)}, eval: {len(eval_rows)}")

    results: list[dict] = []

    # -- Experiment 1: LightGBM
    print("\n=== LightGBM + TF-IDF SVD + hand features ===")
    lgb_metrics = run_lightgbm(all_train, eval_rows)
    results.append({
        "name": "lightgbm_tfidf_svd_plus_hand_features",
        "top1": lgb_metrics["top1"],
        "catastrophic": lgb_metrics["catastrophic"],
        "per_tier_recall": lgb_metrics["per_tier_recall"],
        "notes": (
            f"LightGBM n_estimators=400, TF-IDF 6000 features -> SVD(150) + "
            f"{len(hand_features(''))} hand features. "
            f"Train time {lgb_metrics['train_time_s']}s."
        ),
    })

    # -- Experiment 2: HistGradientBoosting
    print("\n=== HistGradientBoosting + TF-IDF SVD + hand features ===")
    hgb_metrics = run_histgb(all_train, eval_rows)
    results.append({
        "name": "histgb_tfidf_svd_plus_hand_features",
        "top1": hgb_metrics["top1"],
        "catastrophic": hgb_metrics["catastrophic"],
        "per_tier_recall": hgb_metrics["per_tier_recall"],
        "notes": (
            f"HistGradientBoosting max_iter=400, TF-IDF 6000 features -> SVD(100) + "
            f"hand features. Train time {hgb_metrics['train_time_s']}s."
        ),
    })

    # -- Experiment 3: Margin sweep
    print("\n=== Haiku Safety-Margin Sweep (T2-equivalent SVC) ===")
    sweep = run_margin_sweep(all_train, eval_rows)
    best_sweep = sweep["best"]
    results.append({
        "name": "t2_svc_haiku_margin_sweep",
        "top1": best_sweep["top1"],
        "catastrophic": best_sweep["catastrophic"],
        "per_tier_recall": best_sweep["per_tier_recall"],
        "notes": (
            f"T2-equivalent LinearSVC with Haiku confidence "
            f"threshold={best_sweep['haiku_threshold']}. "
            "Haiku predictions below threshold are promoted to best Sonnet. "
            "Full sweep: " + json.dumps(sweep["sweep"])
        ),
    })

    output = {
        "experiments": results,
        "baseline_reference": {
            "top1": 0.6241,
            "catastrophic": 38,
            "per_tier_recall": {"Haiku": 0.8603, "Sonnet": 0.6872, "Opus": 0.8974},
            "source": "T2 production (LinearSVC, train+dev corpus, eval_v3.jsonl n=564)",
        },
    }

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\nResults written to {RESULTS_PATH}")
    print("\nSummary:")
    header = (
        f"  {'Name':<45} {'top1':>6} {'cat':>5}  "
        f"{'Haiku':>6} {'Sonnet':>6} {'Opus':>6}"
    )
    print(header)
    baseline = (
        f"  {'T2 baseline':<45} {'0.6241':>6} {'38':>5}  "
        f"{'0.8603':>6} {'0.6872':>6} {'0.8974':>6}"
    )
    print(baseline)
    for r in results:
        ptr = r["per_tier_recall"]
        print(
            f"  {r['name']:<45} {r['top1']:>6.4f} {r['catastrophic']:>5}  "
            f"{ptr['Haiku']:>6.4f} {ptr['Sonnet']:>6.4f} {ptr['Opus']:>6.4f}"
        )


if __name__ == "__main__":
    main()
