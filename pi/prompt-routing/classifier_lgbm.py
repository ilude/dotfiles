"""
classifier_lgbm.py -- V3ClassifierLGBM class definition.

Defined here (not in train_lgbm.py) so that joblib serialises the class as
'classifier_lgbm.V3ClassifierLGBM', importable from any calling context.

Architecture: LightGBM multiclass on TF-IDF SVD(150) + hand-crafted features.
Same joint (model_tier, effort) label space as V3Classifier.
"""

import re

import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import LabelEncoder

TIER_ORDER = {"Haiku": 0, "Sonnet": 1, "Opus": 2}
EFFORT_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}

_KEYWORD_PATTERNS = {
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

_DOMAIN_TOKENS = [
    "python", "typescript", "javascript", "rust", "go", "java", "sql",
    "bash", "kubernetes", "docker", "react", "aws", "terraform", "ansible",
]


def route_label(row: dict) -> str:
    car = row["cheapest_acceptable_route"]
    return f"{car['model_tier']}|{car['effort']}"


def _hand_features(prompt: str) -> list[float]:
    words = prompt.split()
    nw = len(words)
    nc = len(prompt)
    feats: list[float] = [
        float(nc),
        float(nw),
        float(nc / max(nw, 1)),
        float(prompt.count("?") > 0),
        float(prompt.count("\n") > 2),
        float(prompt.count("```") > 0),
    ]
    for pat in _KEYWORD_PATTERNS.values():
        feats.append(float(bool(pat.search(prompt))))
    p_lower = prompt.lower()
    for tok in _DOMAIN_TOKENS:
        feats.append(float(tok in p_lower))
    return feats


class V3ClassifierLGBM:
    """
    Joint route-level classifier using LightGBM on TF-IDF SVD + hand features.

    Public API mirrors V3Classifier so the ensemble can treat them uniformly:
      fit(train_rows)
      predict_proba_text(prompt) -> np.ndarray of shape (n_classes,)
      predict_texts(texts) -> list[str]
      predict(rows) -> list[str]
      predict_single_full(prompt) -> (label, confidence, candidates)
    """

    SVD_COMPONENTS = 150
    TFIDF_MAX_FEATURES = 6000

    def __init__(self, random_state: int = 42) -> None:
        self.random_state = random_state
        self.tfidf = TfidfVectorizer(
            max_features=self.TFIDF_MAX_FEATURES,
            ngram_range=(1, 3),
            sublinear_tf=True,
            strip_accents="unicode",
        )
        self.svd = TruncatedSVD(n_components=self.SVD_COMPONENTS, random_state=random_state)
        self.le = LabelEncoder()
        self.classes_: list[str] = []
        self._lgbm = None
        self._fitted: bool = False

    def _build_features(self, texts: list[str], fit: bool = False) -> np.ndarray:
        if fit:
            X_tfidf = self.tfidf.fit_transform(texts)
            X_svd = self.svd.fit_transform(X_tfidf).astype(np.float32)
        else:
            X_tfidf = self.tfidf.transform(texts)
            X_svd = self.svd.transform(X_tfidf).astype(np.float32)
        hf = np.array([_hand_features(t) for t in texts], dtype=np.float32)
        return np.hstack([X_svd, hf])

    def fit(self, train_rows: list[dict]) -> "V3ClassifierLGBM":
        import lightgbm as lgb

        texts = [r["prompt"] for r in train_rows]
        labels = [route_label(r) for r in train_rows]
        self.le.fit(labels)
        self.classes_ = [str(c) for c in self.le.classes_]
        y = self.le.transform(labels)

        X = self._build_features(texts, fit=True)
        self._lgbm = lgb.LGBMClassifier(
            n_estimators=400,
            num_leaves=63,
            learning_rate=0.05,
            min_child_samples=5,
            random_state=self.random_state,
            n_jobs=4,
            class_weight="balanced",
            verbose=-1,
        )
        self._lgbm.fit(X, y)
        self._fitted = True
        return self

    def predict_proba_text(self, prompt: str) -> np.ndarray:
        import warnings
        X = self._build_features([prompt])
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="X does not have valid feature names")
            return self._lgbm.predict_proba(X)[0]

    def predict_texts(self, texts: list[str]) -> list[str]:
        import warnings
        X = self._build_features(texts)
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="X does not have valid feature names")
            idxs = self._lgbm.predict(X)
        return [self.classes_[int(i)] for i in idxs]

    def predict(self, rows: list[dict]) -> list[str]:
        return self.predict_texts([r["prompt"] for r in rows])

    def predict_single_full(
        self, prompt: str
    ) -> tuple[str, float, list[tuple[str, float]]]:
        proba = self.predict_proba_text(prompt)
        top_idx = int(proba.argmax())
        primary_label = self.classes_[top_idx]
        confidence = float(proba[top_idx])

        def cost_key(lbl: str) -> tuple[int, int]:
            parts = lbl.split("|")
            return (TIER_ORDER.get(parts[0], 99), EFFORT_ORDER.get(parts[1], 99))

        candidates = sorted(
            [(lbl, float(p)) for lbl, p in zip(self.classes_, proba)],
            key=lambda x: cost_key(x[0]),
        )
        return primary_label, confidence, candidates
