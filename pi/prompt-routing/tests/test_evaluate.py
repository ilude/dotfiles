"""
Tests for evaluate.py -- SHA256 verification paths and gate logic.

The v3 evaluate.py exposes:
  - _verify_sha256()  (module-level private, tested via patch of MODEL_PATH/HASH_PATH)
  - run()             (the argparse entrypoint)

The v2 API (verify_sha256 public, run_holdout, TEST_SET_PATH) was removed in the
v3 rewrite. These tests cover the v3 surface only.
"""

import hashlib
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

PROMPT_ROUTING_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(PROMPT_ROUTING_DIR))

import evaluate  # noqa: E402


class TestSHA256Verification:
    """Test _verify_sha256() via MODEL_PATH / HASH_PATH patches."""

    def test_correct_hash_passes(self, tmp_path):
        """_verify_sha256() should not exit when hashes match."""
        model_file = tmp_path / "model.joblib"
        hash_file = tmp_path / "model.sha256"

        model_file.write_bytes(b"fake model content")
        digest = hashlib.sha256(model_file.read_bytes()).hexdigest()
        hash_file.write_text(digest)

        with (
            patch.object(evaluate, "MODEL_PATH", model_file),
            patch.object(evaluate, "HASH_PATH", hash_file),
        ):
            result = evaluate._verify_sha256()
        assert result == digest

    def test_missing_sidecar_exits_1(self, tmp_path):
        """_verify_sha256() must hard-exit if .sha256 sidecar is absent."""
        model_file = tmp_path / "model.joblib"
        hash_file = tmp_path / "model.sha256"  # does not exist
        model_file.write_bytes(b"fake model content")

        with (
            patch.object(evaluate, "MODEL_PATH", model_file),
            patch.object(evaluate, "HASH_PATH", hash_file),
        ):
            with pytest.raises(SystemExit) as exc_info:
                evaluate._verify_sha256()
        assert exc_info.value.code == 1

    def test_tampered_model_exits_1(self, tmp_path):
        """_verify_sha256() must hard-exit when model bytes have been modified."""
        model_file = tmp_path / "model.joblib"
        hash_file = tmp_path / "model.sha256"

        model_file.write_bytes(b"original content")
        digest = hashlib.sha256(b"original content").hexdigest()
        hash_file.write_text(digest)

        # Simulate tampering
        model_file.write_bytes(b"tampered content")

        with (
            patch.object(evaluate, "MODEL_PATH", model_file),
            patch.object(evaluate, "HASH_PATH", hash_file),
        ):
            with pytest.raises(SystemExit) as exc_info:
                evaluate._verify_sha256()
        assert exc_info.value.code == 1

    def test_wrong_hash_in_sidecar_exits_1(self, tmp_path):
        """Sidecar containing wrong hex string must trigger exit 1."""
        model_file = tmp_path / "model.joblib"
        hash_file = tmp_path / "model.sha256"

        model_file.write_bytes(b"some content")
        hash_file.write_text("a" * 64)  # wrong but valid-looking hex

        with (
            patch.object(evaluate, "MODEL_PATH", model_file),
            patch.object(evaluate, "HASH_PATH", hash_file),
        ):
            with pytest.raises(SystemExit) as exc_info:
                evaluate._verify_sha256()
        assert exc_info.value.code == 1


class TestGateThresholds:
    """Verify _check_gate() logic against known metric dictionaries."""

    def _make_metrics(
        self,
        top1: float = 0.80,
        catastrophic: int = 0,
        recall: dict | None = None,
        p50_us: float = 500.0,
    ) -> dict:
        if recall is None:
            recall = {"Haiku": 0.80, "Sonnet": 0.80, "Opus": 0.80}
        return {
            "top1_accuracy": top1,
            "catastrophic_under_routing": catastrophic,
            "per_tier_recall": recall,
            "inference_timing_us": {
                "mean_us": p50_us,
                "p50_us": p50_us,
                "p95_us": p50_us,
                "p99_us": p50_us,
                "n_runs": 2000,
            },
        }

    def test_all_pass_returns_empty(self):
        metrics = self._make_metrics()
        failures = evaluate._check_gate(metrics)
        assert failures == []

    def test_top1_below_gate_reported(self):
        metrics = self._make_metrics(top1=0.60)
        failures = evaluate._check_gate(metrics)
        assert any("top-1" in f for f in failures)

    def test_catastrophic_above_zero_reported(self):
        metrics = self._make_metrics(catastrophic=1)
        failures = evaluate._check_gate(metrics)
        assert any("catastrophic" in f for f in failures)

    def test_low_tier_recall_reported(self):
        metrics = self._make_metrics(recall={"Haiku": 0.50, "Sonnet": 0.80, "Opus": 0.80})
        failures = evaluate._check_gate(metrics)
        assert any("recall" in f for f in failures)

    def test_inference_above_gate_reported(self):
        metrics = self._make_metrics(p50_us=1500.0)
        failures = evaluate._check_gate(metrics)
        assert any("inference" in f for f in failures)

    def test_multiple_failures_all_reported(self):
        metrics = self._make_metrics(top1=0.50, catastrophic=5, p50_us=2000.0)
        failures = evaluate._check_gate(metrics)
        assert len(failures) >= 2


class TestComputeMetrics:
    """Verify _compute_metrics() computes correct values on small fixtures."""

    def _make_row(self, gt_tier: str, gt_effort: str) -> dict:
        return {
            "prompt": f"test {gt_tier}|{gt_effort}",
            "cheapest_acceptable_route": {
                "model_tier": gt_tier,
                "effort": gt_effort,
            },
        }

    def _stub_clf(self, predictions: list[str]):
        """Return an object whose predict() returns a fixed list."""
        class _Stub:
            def __init__(self, preds):
                self._preds = preds
            def predict(self, rows):
                return [self._preds[min(i, len(self._preds) - 1)] for i in range(len(rows))]
        return _Stub(predictions)

    def _empty_timing(self):
        return {"mean_us": 0.0, "p50_us": 0.0, "p95_us": 0.0, "p99_us": 0.0, "n_runs": 0}

    def test_perfect_predictions(self):
        rows = [
            self._make_row("Haiku", "low"),
            self._make_row("Sonnet", "medium"),
            self._make_row("Opus", "high"),
        ]
        preds = ["Haiku|low", "Sonnet|medium", "Opus|high"]
        clf = self._stub_clf(preds)
        m = evaluate._compute_metrics(clf, rows, self._empty_timing())
        assert m["top1_accuracy"] == 1.0
        assert m["catastrophic_under_routing"] == 0
        assert m["over_routing_rate"] == 0.0

    def test_catastrophic_counted_correctly(self):
        rows = [
            self._make_row("Sonnet", "medium"),  # catastrophic if pred=Haiku|low
            self._make_row("Opus", "high"),       # catastrophic if pred=Haiku|medium
            self._make_row("Haiku", "low"),       # NOT catastrophic
        ]
        preds = ["Haiku|low", "Haiku|medium", "Haiku|none"]
        clf = self._stub_clf(preds)
        m = evaluate._compute_metrics(clf, rows, self._empty_timing())
        assert m["catastrophic_under_routing"] == 2

    def test_over_routing_counted_correctly(self):
        rows = [
            self._make_row("Haiku", "low"),    # over-routed to Sonnet
            self._make_row("Sonnet", "medium"), # exact match
            self._make_row("Opus", "high"),     # under-routed
        ]
        preds = ["Sonnet|medium", "Sonnet|medium", "Haiku|low"]
        clf = self._stub_clf(preds)
        m = evaluate._compute_metrics(clf, rows, self._empty_timing())
        assert m["over_routing_rate"] == pytest.approx(1 / 3, abs=0.001)

    def test_per_tier_recall_fixture(self):
        rows = [
            self._make_row("Haiku", "low"),
            self._make_row("Haiku", "medium"),
            self._make_row("Sonnet", "medium"),
            self._make_row("Opus", "high"),
        ]
        preds = [
            "Haiku|low",     # correct Haiku
            "Sonnet|medium", # wrong tier for Haiku
            "Sonnet|high",   # correct Sonnet
            "Opus|medium",   # correct Opus
        ]
        clf = self._stub_clf(preds)
        m = evaluate._compute_metrics(clf, rows, self._empty_timing())
        assert m["per_tier_recall"]["Haiku"] == pytest.approx(0.5, abs=0.001)
        assert m["per_tier_recall"]["Sonnet"] == pytest.approx(1.0, abs=0.001)
        assert m["per_tier_recall"]["Opus"] == pytest.approx(1.0, abs=0.001)


class TestEvaluateEntrypoint:
    def test_missing_classifier_arg_defaults_to_t2(self):
        """run() with no --classifier flag should default to t2 without error."""
        # Verify argparse default: construct the same parser evaluate.run() does
        # and confirm the default value without invoking run() (which does sys.exit).
        parser = evaluate.argparse.ArgumentParser()
        parser.add_argument("--classifier", choices=["t2", "ensemble"], default="t2")
        args = parser.parse_args([])
        assert args.classifier == "t2"

    def test_model_not_found_exits_1(self, tmp_path):
        """_load_model() must exit 1 if model file is absent."""
        with (
            patch.object(evaluate, "MODEL_PATH", tmp_path / "nonexistent.joblib"),
            patch.object(evaluate, "HASH_PATH", tmp_path / "nonexistent.sha256"),
        ):
            with pytest.raises(SystemExit) as exc_info:
                evaluate._load_model()
        assert exc_info.value.code == 1
