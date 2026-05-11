"""Local configuration loading for X research providers."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

DEFAULT_CONFIG_PATH = Path("private/x/config.local.json")
DEFAULT_DB_PATH = Path("private/x/x-data.sqlite")
DEFAULT_BASE_URL = "https://api.twitterapi.io"
REDACTED = "<redacted>"


class TwitterApiIoConfig(BaseModel):
    """twitterapi.io configuration."""

    api_key: str
    base_url: str = DEFAULT_BASE_URL


class DatabaseConfig(BaseModel):
    """Database configuration."""

    path: Path = DEFAULT_DB_PATH


class LocalConfig(BaseModel):
    """Local config file schema."""

    twitterapi_io: TwitterApiIoConfig | None = None
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)


def load_config(path: Path | None = None) -> LocalConfig:
    """Load local JSON config from the default or explicit path."""
    config_path = path or DEFAULT_CONFIG_PATH
    if not config_path.exists():
        return LocalConfig()
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
        return LocalConfig.model_validate(data)
    except Exception as exc:  # noqa: BLE001 - redact all parsing details containing secrets.
        raise ValueError(f"failed to load local config {config_path}: {REDACTED}") from exc


def require_twitterapi_io(config: LocalConfig) -> TwitterApiIoConfig:
    """Return twitterapi.io config or raise a redacted error."""
    if config.twitterapi_io is None or not config.twitterapi_io.api_key:
        raise ValueError(f"missing twitterapi.io api key: {REDACTED}")
    return config.twitterapi_io
