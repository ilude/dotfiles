"""
Shared fixtures for prompt-routing tests.
"""

import hashlib
import pickle
import sys
from pathlib import Path

import pytest

# Ensure prompt-routing/ and its tools/ subdirectory are importable
PROMPT_ROUTING_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(PROMPT_ROUTING_DIR))
sys.path.insert(0, str(PROMPT_ROUTING_DIR / "tools"))

MODEL_PATH = PROMPT_ROUTING_DIR / "model.pkl"
HASH_PATH = PROMPT_ROUTING_DIR / "model.pkl.sha256"
TEST_SET_PATH = PROMPT_ROUTING_DIR / "test_set.pkl"

V3_MODEL_PATH = PROMPT_ROUTING_DIR / "models" / "router_v3.joblib"
V3_HASH_PATH = PROMPT_ROUTING_DIR / "models" / "router_v3.sha256"


@pytest.fixture(scope="session")
def model():
    """Load model.pkl once per test session after SHA256 verification."""
    if not MODEL_PATH.exists():
        pytest.skip("model.pkl not found -- run train.py first")
    if not HASH_PATH.exists():
        pytest.skip("model.pkl.sha256 not found -- run train.py first")

    expected = HASH_PATH.read_text().strip()
    actual = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    assert actual == expected, (
        f"model.pkl SHA256 mismatch -- file may be corrupted.\n"
        f"  expected: {expected}\n  actual:   {actual}"
    )

    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


@pytest.fixture(scope="session")
def test_set():
    """Load the held-out test split saved by train.py."""
    if not TEST_SET_PATH.exists():
        pytest.skip("test_set.pkl not found -- run train.py first")
    with open(TEST_SET_PATH, "rb") as f:
        data = pickle.load(f)
    return data["texts"], data["labels"]


@pytest.fixture(scope="session")
def v3_clf():
    """Load router_v3.joblib once per session after SHA256 verification."""
    if not V3_MODEL_PATH.exists():
        pytest.skip("router_v3.joblib not found -- run train.py first")
    if not V3_HASH_PATH.exists():
        pytest.skip("router_v3.sha256 not found -- run train.py first")
    expected = V3_HASH_PATH.read_text().strip()
    actual = hashlib.sha256(V3_MODEL_PATH.read_bytes()).hexdigest()
    assert actual == expected, (
        f"router_v3.joblib SHA256 mismatch\n  expected: {expected}\n  actual: {actual}"
    )
    import joblib
    return joblib.load(V3_MODEL_PATH)
