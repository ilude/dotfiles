#!/usr/bin/env python3
"""Read one scalar BWS inventory setting without rendering a deployment snapshot."""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import os
import subprocess
import sys
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from urllib.parse import urlparse

import yaml

DEFAULT_SETTINGS = Path(__file__).resolve().parents[1] / "config/bws/settings.local.json"
Runner = Callable[[Sequence[str], Mapping[str, str]], subprocess.CompletedProcess[str]]


class LookupError(RuntimeError):
    """A lookup failure whose message contains no response or credential body."""


def run_bws(
    command: Sequence[str], environment: Mapping[str, str]
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(command),
        env=dict(environment),
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def lookup(field: str, settings: Path, runner: Runner = run_bws) -> str:
    try:
        document = json.loads(settings.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise LookupError("BWS locator cannot be read; see config/bws/README.md") from error
    locator = document.get("bws") if isinstance(document, dict) else None
    if not isinstance(locator, dict) or set(locator) != {"project_id", "api_server"}:
        raise LookupError("BWS locator requires project_id and api_server")
    project, server = locator["project_id"], locator["api_server"]
    if not isinstance(project, str) or not project or not isinstance(server, str) or not server:
        raise LookupError("BWS locator requires nonempty project_id and api_server")
    server = server.rstrip("/")
    parsed = urlparse(server)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise LookupError("BWS locator API server is invalid")
    access_key = os.environ.get("BITWARDEN_ACCESS_KEY", "")
    if not access_key:
        raise LookupError("BITWARDEN_ACCESS_KEY is missing")
    environment = {
        **os.environ,
        "BWS_ACCESS_TOKEN": access_key,
        "BWS_SERVER_URL": server.removesuffix("/api"),
    }
    try:
        result = runner(("bws", "secret", "list", project, "--output", "json"), environment)
    except (OSError, subprocess.SubprocessError) as error:
        raise LookupError("BWS secret listing could not complete") from error
    if result.returncode != 0:
        raise LookupError("BWS secret listing failed")
    try:
        records = json.loads(result.stdout)
    except ValueError as error:
        raise LookupError("BWS returned an invalid secret list") from error
    if not isinstance(records, list):
        raise LookupError("BWS returned an invalid secret list")
    values: dict[str, str] = {}
    for record in records:
        if not isinstance(record, dict):
            raise LookupError("BWS returned an invalid secret list")
        name, value = record.get("key"), record.get("value")
        if not isinstance(name, str) or not isinstance(value, str) or name in values:
            raise LookupError("BWS returned invalid or duplicate secret records")
        values[name] = value
    encoded = values.get("HOMELAB_ANSIBLE_INVENTORY")
    if encoded is None:
        raise LookupError("HOMELAB_ANSIBLE_INVENTORY is missing")
    try:
        inventory = yaml.safe_load(
            gzip.decompress(base64.b64decode(encoded, validate=True)).decode("utf-8")
        )
    except (ValueError, OSError, EOFError, UnicodeError, yaml.YAMLError) as error:
        raise LookupError("BWS inventory has invalid encoding or YAML") from error
    all_hosts = inventory.get("all") if isinstance(inventory, dict) else None
    variables = all_hosts.get("vars") if isinstance(all_hosts, dict) else None
    if not isinstance(variables, dict) or field not in variables:
        raise LookupError("Requested inventory all.vars field is missing")
    value = variables[field]
    if not isinstance(value, (str, int, float, bool)):
        raise LookupError("Lookup requires a scalar inventory field, not a section")
    return value if isinstance(value, str) else json.dumps(value)


def main(argv: Sequence[str] | None = None, runner: Runner = run_bws) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--settings", type=Path, default=DEFAULT_SETTINGS)
    parser.add_argument("field")
    args = parser.parse_args(argv)
    try:
        print(lookup(args.field, args.settings, runner))
        return 0
    except LookupError as error:
        print(f"BWS lookup failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
