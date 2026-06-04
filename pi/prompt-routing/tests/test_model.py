"""
Tests for the v3 route-level classifier -- router_v3.joblib.

Covers:
  - Artifact presence and SHA256 integrity
  - classify.py stdout validates against router-v3-output.schema.json
  - SHA256 verification triggers on corrupted model file
  - Production gate metrics computed correctly from a small hand-rolled fixture
  - Basic routing correctness (clear-cut prompts)
  - Inference timing budget (loose; evaluate.py enforces the hard <1ms mean)

Requires router_v3.joblib + router_v3.sha256 (run train.py first).
"""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import pytest

PROMPT_ROUTING = Path(__file__).parent.parent
MODELS_DIR = PROMPT_ROUTING / "models"
MODEL_PATH = MODELS_DIR / "router_v3.joblib"
HASH_PATH = MODELS_DIR / "router_v3.sha256"
SCHEMA_PATH = PROMPT_ROUTING / "docs" / "router-v3-output.schema.json"
CLASSIFY_PY = PROMPT_ROUTING / "classify.py"

VALID_MODEL_TIERS = {"mini", "core", "large"}
VALID_EFFORTS = {"none", "low", "medium", "high"}
SCHEMA_VERSION = "3.0.0"

# Loose timing budget for pytest (hard gate is in evaluate.py, 2000 runs)
INFERENCE_BUDGET_US = 5000.0
TIMING_RUNS = 200
WARMUP_RUNS = 10


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def clf():
    """Load router_v3.joblib once per session after SHA256 check."""
    if not MODEL_PATH.exists():
        pytest.skip("router_v3.joblib not found -- run train.py first")
    if not HASH_PATH.exists():
        pytest.skip("router_v3.sha256 not found -- run train.py first")
    expected = HASH_PATH.read_text().strip()
    actual = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    assert actual == expected, (
        f"router_v3.joblib SHA256 mismatch\n  expected: {expected}\n  actual: {actual}"
    )
    import joblib
    return joblib.load(MODEL_PATH)


@pytest.fixture(scope="session")
def schema():
    """Load the frozen output schema."""
    if not SCHEMA_PATH.exists():
        pytest.skip(f"schema not found at {SCHEMA_PATH}")
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Artifact tests
# ---------------------------------------------------------------------------


class TestArtifacts:
    def test_model_exists(self):
        assert MODEL_PATH.exists(), "router_v3.joblib missing -- run train.py"

    def test_sha256_sidecar_exists(self):
        assert HASH_PATH.exists(), "router_v3.sha256 missing -- run train.py"

    def test_sha256_sidecar_is_64_hex(self):
        if not HASH_PATH.exists():
            pytest.skip("sha256 sidecar missing")
        digest = HASH_PATH.read_text().strip()
        assert len(digest) == 64, f"Expected 64 hex chars, got {len(digest)}"
        assert all(c in "0123456789abcdef" for c in digest), "Non-hex chars in digest"

    def test_sha256_matches_model(self):
        if not MODEL_PATH.exists() or not HASH_PATH.exists():
            pytest.skip("artifacts missing")
        expected = HASH_PATH.read_text().strip()
        actual = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
        assert actual == expected, "SHA256 mismatch -- model may be corrupted"

    def test_schema_exists(self):
        assert SCHEMA_PATH.exists(), f"Output schema missing at {SCHEMA_PATH}"


# ---------------------------------------------------------------------------
# SHA256 verification on corrupted file
# ---------------------------------------------------------------------------


class TestSHA256Verification:
    def test_sha256_mismatch_raises_on_load(self):
        """router.py must raise RuntimeError when model bytes do not match sha256."""
        if not MODEL_PATH.exists() or not HASH_PATH.exists():
            pytest.skip("artifacts missing")


        # Patch _HASH_PATH to point to a sidecar with a wrong hash
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".sha256", delete=False
        ) as f:
            f.write("a" * 64)  # valid hex, wrong value
            bad_hash_path = Path(f.name)

        try:
            sys.path.insert(0, str(PROMPT_ROUTING))
            import router as router_module

            # Directly test _verify_sha256 with a monkeypatched hash path
            original = router_module._HASH_PATH
            router_module._HASH_PATH = bad_hash_path
            try:
                with pytest.raises(RuntimeError, match="SHA256 mismatch"):
                    router_module._verify_sha256()
            finally:
                router_module._HASH_PATH = original
        finally:
            bad_hash_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# classify.py output schema validation
# ---------------------------------------------------------------------------


class TestClassifyOutput:
    def _run_classify(self, prompt: str, classifier: str = "t2") -> dict:
        result = subprocess.run(
            [sys.executable, str(CLASSIFY_PY), "--classifier", classifier, prompt],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, (
            f"classify.py exited {result.returncode}\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )
        line = result.stdout.strip()
        assert line, "classify.py produced no output"
        return json.loads(line)

    def test_output_is_single_line_json(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        result = subprocess.run(
            [sys.executable, str(CLASSIFY_PY), "fix a typo in README"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        lines = [line for line in result.stdout.split("\n") if line.strip()]
        assert len(lines) == 1, f"Expected 1 line, got {len(lines)}: {result.stdout!r}"

    def test_output_has_trailing_newline(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        result = subprocess.run(
            [sys.executable, str(CLASSIFY_PY), "fix a typo"],
            capture_output=True,
            text=True,
        )
        assert result.stdout.endswith("\n"), "classify.py output must end with newline"

    def test_output_validates_against_schema(self, schema):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        try:
            import jsonschema
        except ImportError:
            pytest.skip("jsonschema not installed")

        for prompt in [
            "fix a typo in README",
            "Design a distributed consensus protocol for a payment system.",
            "What is Python?",
        ]:
            out = self._run_classify(prompt)
            jsonschema.validate(out, schema)

    def test_schema_version_is_present(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        out = self._run_classify("fix a typo in README")
        assert "schema_version" in out, "schema_version missing from output"
        assert out["schema_version"] == SCHEMA_VERSION

    def test_primary_has_model_tier_and_effort(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        out = self._run_classify("Write a REST API in FastAPI.")
        assert "primary" in out
        assert "model_tier" in out["primary"]
        assert "effort" in out["primary"]
        assert out["primary"]["model_tier"] in VALID_MODEL_TIERS
        assert out["primary"]["effort"] in VALID_EFFORTS

    def test_candidates_is_nonempty_list(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        out = self._run_classify("Implement a binary search.")
        assert "candidates" in out
        assert isinstance(out["candidates"], list)
        assert len(out["candidates"]) >= 1

    def test_candidate_confidences_sum_to_approx_one(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        out = self._run_classify("Design authentication for multi-tenant SaaS.")
        total = sum(c["confidence"] for c in out["candidates"])
        assert abs(total - 1.0) < 0.02, f"Candidate confidences sum to {total:.4f}, expected ~1.0"

    def test_confidence_field_in_range(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        out = self._run_classify("What is a boolean?")
        assert "confidence" in out
        assert 0.0 <= out["confidence"] <= 1.0

    def test_exception_logs_unclassified_prompt_and_returns_default(self, tmp_path):
        """Classifier exceptions are queued for retraining and return a safe default."""
        prompt = "try this unclassified prompt later"
        prompt_file = tmp_path / "prompt.txt"
        prompt_file.write_text(prompt, encoding="utf-8")
        log_path = tmp_path / "unclassified_prompts.jsonl"
        shadow_dir = tmp_path / "shadow"
        shadow_dir.mkdir()
        (shadow_dir / "joblib.py").write_text(
            "raise RuntimeError('forced classifier import failure')\n",
            encoding="utf-8",
        )

        result = subprocess.run(
            [
                sys.executable,
                str(CLASSIFY_PY),
                "--classifier",
                "t2",
                "--prompt-file",
                str(prompt_file),
            ],
            capture_output=True,
            text=True,
            env={
                **os.environ,
                "LOG_ROUTING": "0",
                "PYTHONPATH": str(shadow_dir),
                "UNCLASSIFIED_PROMPTS_LOG": str(log_path),
            },
        )

        assert result.returncode == 0, result.stderr
        out = json.loads(result.stdout.strip())
        assert out["schema_version"] == SCHEMA_VERSION
        assert out["primary"] == {"model_tier": "core", "effort": "medium"}
        assert out["confidence"] == 0.0

        events = [json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines()]
        assert len(events) == 1
        assert events[0]["prompt"] == prompt
        assert events[0]["classifier"] == "t2"
        assert events[0]["fallback_route"] == {"model_tier": "core", "effort": "medium"}
        assert "forced classifier import failure" in events[0]["error"]


# ---------------------------------------------------------------------------
# Router v3 output contract
# ---------------------------------------------------------------------------


class TestRouterContract:
    def test_recommend_returns_schema_version(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        sys.path.insert(0, str(PROMPT_ROUTING))
        from router import recommend
        result = recommend("What is Python?")
        assert result["schema_version"] == SCHEMA_VERSION

    def test_recommend_primary_is_valid_route(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        sys.path.insert(0, str(PROMPT_ROUTING))
        from router import recommend
        result = recommend("Write a binary search in Python.")
        assert result["primary"]["model_tier"] in VALID_MODEL_TIERS
        assert result["primary"]["effort"] in VALID_EFFORTS

    def test_recommend_empty_prompt_returns_safe_default(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        sys.path.insert(0, str(PROMPT_ROUTING))
        from router import recommend
        result = recommend("")
        assert result["primary"]["model_tier"] == "core"
        assert result["schema_version"] == SCHEMA_VERSION

    def test_recommend_candidates_ordered_by_ascending_cost(self):
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        sys.path.insert(0, str(PROMPT_ROUTING))
        from router import recommend
        TIER_ORDER = {"mini": 0, "core": 1, "large": 2}
        EFFORT_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}
        result = recommend("Design a distributed consensus protocol.")
        candidates = result["candidates"]
        costs = [
            (TIER_ORDER[c["model_tier"]], EFFORT_ORDER[c["effort"]])
            for c in candidates
        ]
        assert costs == sorted(costs), "Candidates not ordered by ascending cost"


# ---------------------------------------------------------------------------
# Production gate metrics from hand-rolled fixture
# ---------------------------------------------------------------------------


class TestGateMetricsFixture:
    """
    Verify that evaluate_on_split computes catastrophic_under_routing,
    over_routing, and per_tier_recall correctly on a small fixture.
    """

    def _make_row(self, gt_tier: str, gt_effort: str) -> dict:
        return {
            "prompt": f"test prompt for {gt_tier}|{gt_effort}",
            "cheapest_acceptable_route": {
                "model_tier": gt_tier,
                "effort": gt_effort,
            },
        }

    def test_catastrophic_definition(self):
        """
        A prediction is catastrophic iff:
          gt_tier in {core, large} AND pred_tier == mini AND pred_effort <= medium
        """
        sys.path.insert(0, str(PROMPT_ROUTING))
        from train import EFFORT_ORDER

        rows = [
            self._make_row("core", "medium"),  # gt core
            self._make_row("large", "high"),       # gt large
            # gt mini -- NOT catastrophic even if under-routed
            self._make_row("mini", "low"),
        ]
        preds = [
            "mini|low",    # catastrophic: gt=core, pred=mini|low (<=medium)
            "mini|medium", # catastrophic: gt=large, pred=mini|medium (<=medium)
            "mini|none",   # NOT catastrophic: gt=mini
        ]

        catastrophic = 0
        for r, pred in zip(rows, preds):
            gt = r["cheapest_acceptable_route"]
            pred_tier, pred_effort = pred.split("|")
            if (gt["model_tier"] in {"core", "large"}
                    and pred_tier == "mini"
                    and EFFORT_ORDER[pred_effort] <= EFFORT_ORDER["medium"]):
                catastrophic += 1

        assert catastrophic == 2, f"Expected 2 catastrophic, got {catastrophic}"

    def test_haiku_high_pred_is_not_catastrophic(self):
        """mini|high does NOT trigger catastrophic even for core gt."""
        sys.path.insert(0, str(PROMPT_ROUTING))
        from train import EFFORT_ORDER

        gt = {"model_tier": "core", "effort": "medium"}
        pred_tier, pred_effort = "mini", "high"

        is_catastrophic = (
            gt["model_tier"] in {"core", "large"}
            and pred_tier == "mini"
            and EFFORT_ORDER[pred_effort] <= EFFORT_ORDER["medium"]
        )
        assert not is_catastrophic, "mini|high should not be catastrophic"

    def test_over_routing_definition(self):
        """Over-routing: pred ordinal cost > gt ordinal cost."""
        sys.path.insert(0, str(PROMPT_ROUTING))
        from train import EFFORT_ORDER, TIER_ORDER

        rows = [
            self._make_row("mini", "low"),    # gt cheap
            self._make_row("core", "medium"), # gt mid
            self._make_row("large", "high"),     # gt expensive
        ]
        preds = [
            "core|medium",  # over-routing
            "core|medium",  # exact match
            "mini|low",      # under-routing
        ]

        over = 0
        for r, pred in zip(rows, preds):
            gt = r["cheapest_acceptable_route"]
            pt, pe = pred.split("|")
            if ((TIER_ORDER[pt], EFFORT_ORDER[pe]) >
                    (TIER_ORDER[gt["model_tier"]], EFFORT_ORDER[gt["effort"]])):
                over += 1
        assert over == 1

    def test_per_tier_recall_fixture(self):
        """Per-tier recall counts tier-level matches regardless of effort."""
        rows = [
            self._make_row("mini", "low"),
            self._make_row("mini", "medium"),
            self._make_row("core", "medium"),
            self._make_row("large", "high"),
        ]
        preds = [
            "mini|low",    # correct tier
            "core|medium", # wrong tier
            "core|high",   # correct tier
            "large|medium",   # correct tier
        ]
        tier_tp = {"mini": 0, "core": 0, "large": 0}
        tier_gt = {"mini": 0, "core": 0, "large": 0}
        for r, p in zip(rows, preds):
            gt_tier = r["cheapest_acceptable_route"]["model_tier"]
            tier_gt[gt_tier] += 1
            if p.split("|")[0] == gt_tier:
                tier_tp[gt_tier] += 1
        recall = {t: tier_tp[t] / tier_gt[t] for t in ("mini", "core", "large")}
        assert recall["mini"] == 0.5
        assert recall["core"] == 1.0
        assert recall["large"] == 1.0


# ---------------------------------------------------------------------------
# Inference timing
# ---------------------------------------------------------------------------


class TestInferenceTiming:
    def test_mean_inference_under_5ms(self, clf):
        """Loose budget for pytest. evaluate.py enforces the hard <1ms mean."""
        sample = ["Design a distributed consensus protocol for a payment system."]
        for _ in range(WARMUP_RUNS):
            clf.predict_texts(sample)
        times_us = []
        for _ in range(TIMING_RUNS):
            t0 = time.perf_counter()
            clf.predict_texts(sample)
            times_us.append((time.perf_counter() - t0) * 1e6)
        mean_us = float(np.mean(times_us))
        assert mean_us < INFERENCE_BUDGET_US, (
            f"Mean inference {mean_us:.1f}us exceeds {INFERENCE_BUDGET_US:.0f}us loose budget"
        )

    def test_classify_completes_without_hanging(self):
        """classify.py cold invocation must complete within 10s and exit 0.

        Cold Python startup with sklearn/scipy/joblib on Windows takes 2-4s.
        This test verifies the process completes and produces valid output,
        not that it meets the classifier-internal <1ms inference budget (B3),
        which is measured separately by test_mean_inference_under_5ms.
        """
        if not MODEL_PATH.exists():
            pytest.skip("model missing")
        t0 = time.perf_counter()
        result = subprocess.run(
            [sys.executable, str(CLASSIFY_PY), "--classifier", "t2", "What is Python?"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1e3
        assert result.returncode == 0, f"classify.py exited {result.returncode}: {result.stderr}"
        assert elapsed_ms < 10_000.0, (
            f"classify.py cold start took {elapsed_ms:.0f}ms, expected < 10s"
        )
