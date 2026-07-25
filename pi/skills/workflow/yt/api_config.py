"""Shared configuration for menos YouTube workflow scripts."""

import os
import re
from pathlib import Path
from urllib.parse import urlparse

def load_secrets_file() -> None:
    """Load secrets from ~/.dotfiles/.env or ~/.dotfiles/.secrets."""
    secrets_path = Path.home() / ".dotfiles" / ".env"
    if not secrets_path.exists():
        secrets_path = Path.home() / ".dotfiles" / ".secrets"
    if not secrets_path.exists():
        return

    for line in secrets_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line)
        if match:
            name, value = match.groups()
            if name not in os.environ:
                os.environ[name] = value.strip("'\"")


def get_api_base() -> str:
    """Get the explicitly configured menos API base URL."""
    load_secrets_file()
    value = os.getenv("MENOS_API_BASE", "").strip()
    if not value:
        raise RuntimeError(
            "MENOS_API_BASE is required; set it in the environment or ~/.dotfiles/.env"
        )
    return value


def get_api_host() -> str:
    """Extract host:port from API base URL."""
    return urlparse(get_api_base()).netloc
