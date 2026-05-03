from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
from pathlib import Path

SCRIPT = Path("scripts/menos-infisical-env.py")
FIXTURE = Path("test/fixtures/menos-secrets.json")
SECRET_VALUES = [
    value
    for value in json.loads(FIXTURE.read_text()).values()
    if "secret" in value or "password" in value
]


def run_cmd(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        check=False,
        text=True,
        capture_output=True,
    )


def test_validate_mode_redacts_secret_values() -> None:
    result = run_cmd(
        "--project",
        "dotfiles",
        "--environment",
        "prod",
        "--path",
        "/menos",
        "--validate",
        "--secrets-json",
        str(FIXTURE),
    )
    assert result.returncode == 0, result.stderr
    combined = result.stdout + result.stderr
    assert "Validated menos Infisical environment" in combined
    for value in SECRET_VALUES:
        assert value not in combined


def test_write_mode_sets_0600_and_contains_required_keys(tmp_path: Path) -> None:
    out = tmp_path / "menos.env"
    result = run_cmd("--out", str(out), "--write", "--secrets-json", str(FIXTURE))
    assert result.returncode == 0, result.stderr
    if os.name != "nt":
        assert stat.S_IMODE(out.stat().st_mode) == 0o600
    else:
        assert out.exists()
    content = out.read_text()
    for key in [
        "SURREALDB_PASSWORD",
        "SURREALDB_NAMESPACE",
        "SURREALDB_DATABASE",
        "S3_ACCESS_KEY",
        "S3_SECRET_KEY",
        "S3_BUCKET",
        "GARAGE_RPC_SECRET",
        "GARAGE_ADMIN_TOKEN",
        "SEARXNG_SECRET",
    ]:
        assert f"{key}=" in content


def test_missing_and_placeholder_values_are_rejected(tmp_path: Path) -> None:
    fixture = json.loads(FIXTURE.read_text())
    fixture.pop("S3_BUCKET")
    fixture["GARAGE_RPC_SECRET"] = "changeme"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(fixture))
    result = run_cmd(
        "--validate",
        "--template",
        str(tmp_path / "missing-template.env"),
        "--secrets-json",
        str(bad),
    )
    assert result.returncode != 0
    assert "S3_BUCKET" in result.stderr
    assert "GARAGE_RPC_SECRET" in result.stderr
    assert "changeme" not in result.stderr.lower()


def test_help_succeeds() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--help"],
        check=False,
        text=True,
        capture_output=True,
    )
    assert result.returncode == 0
    assert "--secrets-json" in result.stdout
