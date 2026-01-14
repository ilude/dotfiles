"""Pytest configuration - adds parent directory to path for imports."""

import sys
from pathlib import Path

# Add parent directory (commands/yt/) to path so tests can import fetch_*.py
sys.path.insert(0, str(Path(__file__).parent.parent))
