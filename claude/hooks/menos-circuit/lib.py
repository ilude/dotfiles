#!/usr/bin/env python
"""Shared helpers for menos availability probing and local YouTube backfill."""

from __future__ import annotations

import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

STATUS_PATH = Path.home() / ".claude" / "state" / "menos_status.json"
YT_ROOT = Path.home() / ".dotfiles" / "yt"
DEFAULT_API_BASE = "http://192.168.16.241:8000/api/v1"
TRANSCRIPT_LIMIT_BYTES = 5 * 1024 * 1024


def disabled() -> bool:
    return os.getenv("MENOS_CIRCUIT_DISABLED") == "1"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def api_base() -> str:
    return os.getenv("MENOS_API_BASE") or os.getenv("MENOS_BASE_URL", DEFAULT_API_BASE)


def api_host() -> str:
    return urlparse(api_base()).netloc


def status_endpoint() -> str:
    parsed = urlparse(api_base())
    return parsed.netloc or api_base()


def write_status(available: bool, last_error: str | None = None) -> None:
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "checked_at": now_iso(),
        "available": available,
        "endpoint": status_endpoint(),
        "last_error": last_error,
    }
    tmp = STATUS_PATH.with_name(f"{STATUS_PATH.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    os.replace(tmp, STATUS_PATH)
    try:
        os.chmod(STATUS_PATH, 0o600)
    except OSError:
        pass


def read_status() -> dict[str, Any] | None:
    for attempt in range(2):
        try:
            return json.loads(STATUS_PATH.read_text(encoding="utf-8"))
        except FileNotFoundError:
            if attempt == 0:
                time.sleep(0.05)
                continue
            return None
        except (OSError, json.JSONDecodeError):
            return None
    return None


def http_request(method: str, url: str, *, body: bytes | None = None, headers: dict[str, str] | None = None, timeout: float = 10.0) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def load_signer():
    yt_dir = Path.home() / ".dotfiles" / "claude" / "commands" / "yt"
    sys.path.insert(0, str(yt_dir))
    from signing import RequestSigner  # type: ignore

    key = Path.home() / ".ssh" / "id_ed25519"
    return RequestSigner.from_file(key)


def signed_headers(method: str, path: str, body: bytes | None) -> dict[str, str]:
    signer = load_signer()
    return signer.sign_request(method, path, api_host(), body)


def valid_video_id(name: str) -> bool:
    return len(name) == 11 and all(c.isalnum() or c in "_-" for c in name)


def atomic_delete_dir(path: Path) -> None:
    deleted = path.parent / ".deleted"
    deleted.mkdir(exist_ok=True)
    target = deleted / f"{path.name}-{int(time.time())}-{os.getpid()}"
    try:
        path.rename(target)
    except OSError:
        return
    shutil.rmtree(target, ignore_errors=True)
