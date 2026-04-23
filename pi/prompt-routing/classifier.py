"""
classifier.py -- V3Classifier class definition.

Defined here (not in train.py) so that joblib serialises the class as
'classifier.V3Classifier', which is importable from any calling context.
"""


import numpy as np
from scipy.special import softmax as _softmax
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC

TIER_ORDER = {"Haiku": 0, "Sonnet": 1, "Opus": 2}
EFFORT_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}


def route_label(row: dict) -> str:
    car = row["cheapest_acceptable_route"]
    return f"{car['model_tier']}|{car['effort']}"


class V3Classifier:
    """
    Joint route-level classifier. Predicts (model_tier, effort) as a single
    multiclass label using LinearSVC + softmax probability approximation.

    Inference: tfidf.transform(text) + svc.decision_function() + softmax().
    Mean latency: ~300-500us per prompt after warm-up on CPU.
    """

    def __init__(self, random_state: int = 42) -> None:
        self.random_state = random_state
        self.tfidf = TfidfVectorizer(
            max_features=8000,
            ngram_range=(1, 3),
            sublinear_tf=True,
            min_df=1,
            strip_accents="unicode",
        )
        self.svc = LinearSVC(
            C=5.0,
            max_iter=5000,
            random_state=random_state,
            class_weight="balanced",
        )
        from sklearn.preprocessing import LabelEncoder
        self.le = LabelEncoder()
        self.classes_: list[str] = []
        self._fitted: bool = False

    def fit(self, train_rows: list[dict]) -> "V3Classifier":
        texts = [r["prompt"] for r in train_rows]
        labels = [route_label(r) for r in train_rows]
        self.le.fit(labels)
        self.classes_ = [str(c) for c in self.le.classes_]
        y = self.le.transform(labels)
        X = self.tfidf.fit_transform(texts)
        self.svc.fit(X, y)
        self._fitted = True
        return self

    def predict_proba_text(self, prompt: str) -> np.ndarray:
        X = self.tfidf.transform([prompt])
        df = self.svc.decision_function(X)
        return _softmax(df, axis=1)[0]

    def predict_texts(self, texts: list[str]) -> list[str]:
        X = self.tfidf.transform(texts)
        df = self.svc.decision_function(X)
        proba = _softmax(df, axis=1)
        return [self.classes_[int(i)] for i in proba.argmax(axis=1)]

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
