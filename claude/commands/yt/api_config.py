"""Shared configuration for menos API client scripts."""

import os
import re
from pathlib import Path
from urllib.parse import urlparse

DEFAULT_API_BASE = "http://192.168.16.241:8000/api/v1"


def load_secrets_file() -> None:
    """Load secrets from ~/.dotfiles/.env if env vars not set.

    Parses bash-style export VAR=value lines and sets them as env vars.
    This allows the script to work even when not run from a shell that sourced .env.
    """
    secrets_path = Path.home() / ".dotfiles" / ".env"
    if not secrets_path.exists():
        secrets_path = Path.home() / ".dotfiles" / ".secrets"
    if not secrets_path.exists():
        return

    for line in secrets_path.read_text().splitlines():
        line = line.strip()
        # Skip comments and empty lines
        if not line or line.startswith("#"):
            continue
        # Parse: export VAR=value or VAR=value
        match = re.match(r'^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line)
        if match:
            name, value = match.groups()
            # Remove surrounding quotes if present
            value = value.strip('\'"')
            # Only set if not already in environment
            if name not in os.environ:
                os.environ[name] = value


def get_api_base() -> str:
    """Get menos API base URL from MENOS_API_BASE env var or default."""
    load_secrets_file()
    return os.getenv("MENOS_API_BASE", DEFAULT_API_BASE)


def get_api_host() -> str:
    """Extract host:port from API base URL."""
    parsed = urlparse(get_api_base())
    return parsed.netloc


def extract_video_id(url_or_id: str) -> str:
    """Extract video ID from YouTube URL or return as-is if already an ID."""
    # Already an ID (11 chars)
    if re.match(r"^[a-zA-Z0-9_-]{11}$", url_or_id):
        return url_or_id

    # Various YouTube URL formats
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})",
        r"youtube\.com/shorts/([a-zA-Z0-9_-]{11})",
    ]

    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1)

    raise ValueError(f"Could not extract video ID from: {url_or_id}")
