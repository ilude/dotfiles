"""
Tests for evaluate.py — SHA256 verification paths and acceptance gate logic.

Focuses on the failure modes: tampered model, missing sidecar, accuracy below
threshold, HIGH->LOW inversions present. Uses tmp_path fixtures so no real
artifacts are modified.
"""

import hashlib
import pickle
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

PROMPT_ROUTING_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(PROMPT_ROUTING_DIR))

import evaluate  # noqa: E402


class _FakeModel:
    """Module-level stub model for pickling in acceptance gate tests."""

    def __init__(self, predictions: list[str]) -> None:
        self._predictions = predictions

    def predict(self, X):
        n = len(X)
        return [self._predictions[min(i, len(self._predictions) - 1)] for i in range(n)]


class TestSHA256Verification:
    def test_correct_hash_passes(self, tmp_path):
        """verify_sha256() should not exit when hashes match."""
        model_file = tmp_path / "model.pkl"
        hash_file = tmp_path / "model.pkl.sha256"

        model_file.write_bytes(b"fake model content")
        digest = hashlib.sha256(model_file.read_bytes()).hexdigest()
        hash_file.write_text(digest)

        with (
            patch.object(evaluate, "MODEL_PATH", model_file),
            patch.object(evaluate, "HASH_PATH", hash_file),
        ):
            result = evaluate.verify_sha256()
        assert result == digest

    def test_missing_sidecar_exits_1(self, tmp_path):
        """verify_sha256() must hard-exit if model.pkl.sha256 is absent."""
        model_file = tmp_path / "model.pkl"
        hash_file = tmp_path / "model.pkl.sha256"  # does not exist
        model_file.write_bytes(b"fake model content")

        with (
            patch.object(evaluate, "MODEL_PATH", model_file),
            patch.object(evaluate, "HASH_PATH", hash_file),
        ):
            with pytest.raises(SystemExit) as exc_info:
                evaluate.verify_sha256()
        assert exc_info.value.code == 1

    def test_tampered_model_exits_1(self, tmp_path):
        """verify_sha256() must hard-exit when model.pkl has been modified."""
        model_file = tmp_path / "model.pkl"
        hash_file = tmp_path / "model.pkl.sha256"

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
                evaluate.verify_sha256()
        assert exc_info.value.code == 1

    def test_wrong_hash_in_sidecar_exits_1(self, tmp_path):
        """Sidecar containing wrong hex string must trigger exit 1."""
        model_file = tmp_path / "model.pkl"
        hash_file = tmp_path / "model.pkl.sha256"

        model_file.write_bytes(b"some content")
        hash_file.write_text("a" * 64)  # wrong but valid-looking hex

        with (
            patch.object(evaluate, "MODEL_PATH", model_file),
            patch.object(evaluate, "HASH_PATH", hash_file),
        ):
            with pytest.raises(SystemExit) as exc_info:
                evaluate.verify_sha256()
        assert exc_info.value.code == 1


class TestAcceptanceGate:
    """
    Test the run_holdout() acceptance gate by patching load_model and load_test_set
    to inject controlled predictions, without touching the real model.pkl.
    """

    def _make_fake_model(self, predictions: list[str]) -> _FakeModel:
        """Return a stub model whose predict() returns the given predictions."""
        return _FakeModel(predictions)

    def _run_holdout_patched(self, tmp_path, texts, true_labels, predicted_labels):
        """
        Run evaluate.run_holdout() with patched I/O.
        Returns the SystemExit code.
        """
        fake_model = self._make_fake_model(predicted_labels)

        # Write a real model.pkl and sha256 so load_model doesn't fail
        model_file = tmp_path / "model.pkl"
        hash_file = tmp_path / "model.pkl.sha256"
        model_file.write_bytes(pickle.dumps(fake_model))
        digest = hashlib.sha256(model_file.read_bytes()).hexdigest()
        hash_file.write_text(digest)

        test_set_file = tmp_path / "test_set.pkl"
        test_set_file.write_bytes(pickle.dumps({"texts": texts, "labels": true_labels}))

        with (
            patch.object(evaluate, "MODEL_PATH", model_file),
            patch.object(evaluate, "HASH_PATH", hash_file),
            patch.object(evaluate, "TEST_SET_PATH", test_set_file),
        ):
            with pytest.raises(SystemExit) as exc_info:
                evaluate.run_holdout()
        return exc_info.value.code

    def _make_perfect_test_set(self, n_per_class: int = 10):
        """Return texts and labels with 100% perfect routing."""
        labels = ["low"] * n_per_class + ["mid"] * n_per_class + ["high"] * n_per_class
        texts = [f"prompt {i}" for i in range(len(labels))]
        return texts, labels, labels[:]  # texts, true_labels, predicted_labels

    def test_all_correct_exits_0(self, tmp_path):
        texts, true_labels, pred_labels = self._make_perfect_test_set()
        code = self._run_holdout_patched(tmp_path, texts, true_labels, pred_labels)
        assert code == 0

    def test_accuracy_below_threshold_exits_1(self, tmp_path):
        """If accuracy < 85%, gate must reject (exit 1)."""
        n = 20
        true_labels = ["low"] * n
        # Only 10/20 correct -> 50% accuracy
        pred_labels = ["low"] * 10 + ["mid"] * 10
        texts = [f"prompt {i}" for i in range(n)]

        code = self._run_holdout_patched(tmp_path, texts, true_labels, pred_labels)
        assert code == 1

    def test_high_to_low_inversion_exits_1(self, tmp_path):
        """A single HIGH->LOW inversion must reject the model (exit 1)."""
        true_labels = ["low"] * 10 + ["mid"] * 10 + ["high"] * 10
        # Inject one HIGH->LOW inversion (last high prompt predicted as low)
        pred_labels = ["low"] * 10 + ["mid"] * 10 + ["high"] * 9 + ["low"]
        texts = [f"prompt {i}" for i in range(30)]

        code = self._run_holdout_patched(tmp_path, texts, true_labels, pred_labels)
        assert code == 1

    def test_high_to_mid_mismatch_does_not_block(self, tmp_path):
        """HIGH->MID is a degradation but not a catastrophic inversion -- still passes
        as long as accuracy >= 85% and no HIGH->LOW inversions."""
        n_per_class = 20
        true_labels = ["low"] * n_per_class + ["mid"] * n_per_class + ["high"] * n_per_class
        # Route all HIGH to MID (not LOW) -- accuracy = 40/60 = 66.7%... fails on accuracy
        # Use a smaller mismatch: just 1 HIGH->MID out of 20
        pred_labels = (
            ["low"] * n_per_class
            + ["mid"] * n_per_class
            + ["mid"] * 1
            + ["high"] * (n_per_class - 1)
        )
        texts = [f"prompt {i}" for i in range(3 * n_per_class)]
        # accuracy = 59/60 = 98.3% -- above 85%, no HIGH->LOW inversions
        code = self._run_holdout_patched(tmp_path, texts, true_labels, pred_labels)
        assert code == 0  # HIGH->MID is not a blocker

    def test_multiple_inversions_all_reported(self, tmp_path):
        """Multiple HIGH->LOW inversions must still result in exit 1."""
        true_labels = ["high"] * 10
        pred_labels = ["low"] * 10  # all 10 are inversions
        texts = [f"complex architecture prompt {i}" for i in range(10)]

        code = self._run_holdout_patched(tmp_path, texts, true_labels, pred_labels)
        assert code == 1


class TestEvaluateEntrypoint:
    def test_missing_holdout_flag_exits_with_error(self):
        """--holdout is required; missing it should cause argparse to exit non-zero."""
        with patch("sys.argv", ["evaluate.py"]):
            with pytest.raises(SystemExit) as exc_info:
                evaluate.main()
        assert exc_info.value.code != 0

    def test_model_not_found_exits_1(self, tmp_path):
        """run_holdout() must exit 1 if model.pkl is absent."""
        with (
            patch.object(evaluate, "MODEL_PATH", tmp_path / "nonexistent.pkl"),
            patch.object(evaluate, "TEST_SET_PATH", tmp_path / "test_set.pkl"),
        ):
            with pytest.raises(SystemExit) as exc_info:
                evaluate.run_holdout()
        assert exc_info.value.code == 1

    def test_test_set_not_found_exits_1(self, tmp_path):
        """run_holdout() must exit 1 if test_set.pkl is absent."""
        # Create a valid model.pkl so that check passes
        real_model = PROMPT_ROUTING_DIR / "model.pkl"
        real_hash = PROMPT_ROUTING_DIR / "model.pkl.sha256"
        if not real_model.exists():
            pytest.skip("model.pkl not found")

        with (
            patch.object(evaluate, "MODEL_PATH", real_model),
            patch.object(evaluate, "HASH_PATH", real_hash),
            patch.object(evaluate, "TEST_SET_PATH", tmp_path / "nonexistent.pkl"),
        ):
            with pytest.raises(SystemExit) as exc_info:
                evaluate.run_holdout()
        assert exc_info.value.code == 1
