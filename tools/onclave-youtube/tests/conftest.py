"""Pytest configuration for Onclave YouTube tests."""

import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))


def mock_onclave_client() -> MagicMock:
    """Return a context-manager mock for an OnclaveClient instance."""
    client = MagicMock()
    client.__enter__.return_value = client
    client.__exit__.return_value = False
    return client
