#!/usr/bin/env python
"""Probe menos health and update the shared status hint file."""

from __future__ import annotations

from urllib.parse import urljoin

from lib import api_base, disabled, http_request, write_status


def main() -> int:
    if disabled():
        return 0
    try:
        base = api_base().removesuffix("/api/v1")
        status, body = http_request("GET", urljoin(base + "/", "health"), timeout=3.0)
        if 200 <= status < 300:
            write_status(True, None)
        else:
            write_status(False, f"HTTP {status}: {body[:200].decode('utf-8', 'replace')}")
    except Exception as exc:  # session startup must never fail because of menos
        try:
            write_status(False, str(exc))
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
