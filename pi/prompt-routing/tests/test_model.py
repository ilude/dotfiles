"""
Tests for model.pkl — routing correctness, inversion safety, and inference speed.

Requires model.pkl and test_set.pkl to exist (run train.py first).
The 'model' and 'test_set' fixtures are defined in conftest.py.
"""

import time
from pathlib import Path

import numpy as np
import pytest

VALID_LABELS = {"low", "mid", "high"}
INFERENCE_BUDGET_US = 1000.0  # 1ms
TIMING_RUNS = 500
WARMUP_RUNS = 10


class TestModelArtifacts:
    def test_model_pkl_exists(self):
        path = Path(__file__).parent.parent / "model.pkl"
        assert path.exists(), "model.pkl missing -- run train.py"

    def test_sha256_sidecar_exists(self):
        path = Path(__file__).parent.parent / "model.pkl.sha256"
        assert path.exists(), "model.pkl.sha256 missing -- run train.py"

    def test_sha256_sidecar_is_valid_hex(self):
        path = Path(__file__).parent.parent / "model.pkl.sha256"
        if not path.exists():
            pytest.skip("model.pkl.sha256 missing")
        digest = path.read_text().strip()
        assert len(digest) == 64, f"SHA256 should be 64 hex chars, got {len(digest)}"
        assert all(c in "0123456789abcdef" for c in digest), "SHA256 contains non-hex chars"

    def test_model_has_predict_method(self, model):
        assert hasattr(model, "predict"), "model must have predict()"

    def test_model_has_sklearn_pipeline_steps(self, model):
        """Production model must be a Pipeline with tfidf and clf steps."""
        assert hasattr(model, "steps"), "model should be an sklearn Pipeline"
        step_names = [name for name, _ in model.steps]
        assert "tfidf" in step_names, f"Pipeline missing 'tfidf' step. Steps: {step_names}"
        assert "clf" in step_names, f"Pipeline missing 'clf' step. Steps: {step_names}"


class TestPredictionOutputs:
    def test_predict_returns_list_of_valid_labels(self, model):
        prompts = [
            "What is Python?",
            "Write a REST API in FastAPI.",
            "Design a distributed consensus protocol.",
        ]
        predictions = model.predict(prompts)
        assert len(predictions) == len(prompts)
        for pred in predictions:
            assert pred in VALID_LABELS, f"Unexpected label: {pred!r}"

    def test_predict_single_prompt(self, model):
        result = model.predict(["What is a variable?"])
        assert len(result) == 1
        assert result[0] in VALID_LABELS

    def test_predict_single_prompt_returns_one_label(self, model):
        """Predict on a one-element list returns exactly one label."""
        result = model.predict(["What is Python?"])
        assert len(result) == 1
        assert result[0] in VALID_LABELS


class TestRoutingCorrectness:
    """Spot-check that clear-cut prompts route to the right tier.

    These prompts are chosen to be unambiguous within their tier --
    not edge cases. If these fail, the model has a serious regression.
    """

    @pytest.mark.parametrize("prompt", [
        "What is Python?",
        "What does len() return in Python?",
        "What is a variable?",
        "What is a boolean?",
        "How do I append to a list?",
    ])
    def test_definitional_prompts_route_to_low(self, model, prompt):
        pred = model.predict([prompt])[0]
        assert pred == "low", f"Expected 'low' for {prompt!r}, got {pred!r}"

    @pytest.mark.parametrize("prompt", [
        "Write a REST API endpoint in FastAPI that returns a list of users.",
        "Implement a binary search algorithm in Python.",
        "Write unit tests for a REST API endpoint that creates and updates records.",
        "How do I configure nginx as a reverse proxy for a Node.js app?",
    ])
    def test_engineering_prompts_route_to_mid(self, model, prompt):
        pred = model.predict([prompt])[0]
        assert pred == "mid", f"Expected 'mid' for {prompt!r}, got {pred!r}"

    @pytest.mark.parametrize("prompt", [
        "Design the authentication architecture for a multi-tenant SaaS platform handling 1M concurrent users.",
        "Analyze the security vulnerabilities in this cryptographic implementation and propose fixes.",
        "Design a distributed consensus protocol for a payment processing system requiring sub-100ms latency.",
        "Architect a zero-downtime database migration strategy for a table with 500M rows.",
    ])
    def test_architecture_prompts_route_to_high(self, model, prompt):
        pred = model.predict([prompt])[0]
        assert pred == "high", f"Expected 'high' for {prompt!r}, got {pred!r}"


class TestInversionSafety:
    """HIGH->LOW inversions are the catastrophic failure mode.

    An inversion routes an Opus-complexity prompt to Haiku, producing
    severely degraded responses on the hardest tasks. Zero tolerance.
    """

    def test_no_high_to_low_inversions_on_holdout(self, model, test_set):
        texts, labels = test_set
        predictions = model.predict(texts)
        inversions = [
            (true, pred, text)
            for true, pred, text in zip(labels, predictions, texts)
            if true == "high" and pred == "low"
        ]
        assert len(inversions) == 0, (
            f"HIGH->LOW inversions found ({len(inversions)}):\n"
            + "\n".join(f"  {t[:80]}" for _, _, t in inversions)
        )

    def test_no_high_to_low_inversions_on_full_corpus(self, model):
        """Run the inversion check on the entire labeled corpus, not just holdout."""
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from data import get_examples

        examples = get_examples()
        high_prompts = [text for text, label in examples if label == "high"]
        predictions = model.predict(high_prompts)
        inversions = [
            (pred, text)
            for pred, text in zip(predictions, high_prompts)
            if pred == "low"
        ]
        assert len(inversions) == 0, (
            f"HIGH->LOW inversions on full corpus ({len(inversions)}):\n"
            + "\n".join(f"  pred={p}: {t[:80]}" for p, t in inversions)
        )

    def test_high_prompts_never_route_to_low(self, model):
        """Explicit set of high-complexity prompts verified against LOW routing."""
        high_prompts = [
            "Design a service mesh architecture for a 200-microservice platform.",
            "Analyze this distributed transaction pattern and identify the failure modes.",
            "Evaluate the consistency guarantees of this multi-region database replication setup.",
            "Design an access control system that enforces least privilege across a 200-service platform.",
            "Architect a real-time collaborative editing system similar to Google Docs.",
        ]
        predictions = model.predict(high_prompts)
        for prompt, pred in zip(high_prompts, predictions):
            assert pred != "low", (
                f"HIGH->LOW inversion: {prompt!r} routed to 'low'"
            )


class TestInferenceTiming:
    """Verify single-prompt inference meets the <1ms budget.

    Uses mean over many runs -- p99 on Windows reflects OS scheduler
    jitter, not model latency.
    """

    def test_mean_inference_under_1ms(self, model):
        sample = ["Design a distributed consensus protocol for a payment system."]
        # Warm-up
        for _ in range(WARMUP_RUNS):
            model.predict(sample)

        times_us = []
        for _ in range(TIMING_RUNS):
            t0 = time.perf_counter()
            model.predict(sample)
            times_us.append((time.perf_counter() - t0) * 1e6)

        mean_us = float(np.mean(times_us))
        assert mean_us < INFERENCE_BUDGET_US, (
            f"Mean inference {mean_us:.1f}us exceeds {INFERENCE_BUDGET_US:.0f}us (1ms) budget"
        )

    def test_inference_consistent_across_prompt_lengths(self, model):
        """Inference time should not balloon for longer prompts."""
        short_prompt = ["What is Python?"]
        long_prompt = [
            "Design a globally distributed multi-tenant SaaS authentication architecture "
            "that handles 1 million concurrent users, supports OAuth2 and SAML federation, "
            "provides row-level tenant isolation, and achieves 99.99% uptime with sub-50ms "
            "p99 latency across all geographic regions including APAC, EU, and US-East."
        ]

        def mean_time_us(prompt):
            for _ in range(5):
                model.predict(prompt)
            times = []
            for _ in range(200):
                t0 = time.perf_counter()
                model.predict(prompt)
                times.append((time.perf_counter() - t0) * 1e6)
            return float(np.mean(times))

        short_us = mean_time_us(short_prompt)
        long_us = mean_time_us(long_prompt)

        # Long prompt should not be more than 10x slower than short
        assert long_us < short_us * 10, (
            f"Long prompt inference ({long_us:.0f}us) is >5x slower than "
            f"short prompt ({short_us:.0f}us) -- possible scaling issue"
        )
        # Both must still be under budget
        assert long_us < INFERENCE_BUDGET_US, (
            f"Long prompt inference {long_us:.1f}us exceeds 1ms budget"
        )
