"""Workstation scalar lookup remains independent of retired deployment source."""

import base64
import gzip
import importlib.util
import json
import os
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("bws_lookup", ROOT / "scripts/bws-lookup.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def locator(tmp_path: Path) -> Path:
    path = tmp_path / "settings.local.json"
    path.write_text(
        json.dumps(
            {
                "bws": {
                    "project_id": "fixture-project",
                    "api_server": "https://vault.example.invalid/api",
                }
            }
        ),
        encoding="utf-8",
    )
    return path


def records(variables: dict) -> list[dict]:
    inventory = yaml.safe_dump({"all": {"vars": variables}}).encode()
    return [
        {
            "key": "HOMELAB_ANSIBLE_INVENTORY",
            "value": base64.b64encode(gzip.compress(inventory)).decode(),
        }
    ]


def test_default_locator_is_workstation_owned() -> None:
    assert MODULE.DEFAULT_SETTINGS == ROOT / "config/bws/settings.local.json"


@pytest.mark.parametrize("value", ["https://forgejo.example.invalid", True, 22])
def test_one_request_prints_only_the_selected_scalar(tmp_path, monkeypatch, capsys, value) -> None:
    settings = locator(tmp_path)
    monkeypatch.setenv("BITWARDEN_ACCESS_KEY", "fixture-bootstrap")
    monkeypatch.setenv("BWS_ACCESS_TOKEN", "prior-token")
    monkeypatch.setenv("BWS_SERVER_URL", "prior-server")
    calls = []

    def runner(command, environment):
        calls.append(command)
        assert command == ("bws", "secret", "list", "fixture-project", "--output", "json")
        assert "fixture-bootstrap" not in command
        assert environment["BWS_ACCESS_TOKEN"] == "fixture-bootstrap"
        assert environment["BWS_SERVER_URL"] == "https://vault.example.invalid"
        body = records({"selected": value, "other": "never-print-this-family-value"})
        return subprocess.CompletedProcess(command, 0, json.dumps(body), "")

    assert MODULE.main(["--settings", str(settings), "selected"], runner) == 0
    result = capsys.readouterr()
    assert result.out == (value if isinstance(value, str) else json.dumps(value)) + "\n"
    assert result.err == ""
    assert len(calls) == 1
    assert os.environ["BWS_ACCESS_TOKEN"] == "prior-token"
    assert os.environ["BWS_SERVER_URL"] == "prior-server"


@pytest.mark.parametrize("kind", ["duplicate", "section", "encoding", "command"])
def test_failures_never_print_response_or_credential_bodies(
    tmp_path, monkeypatch, capsys, kind
) -> None:
    settings = locator(tmp_path)
    monkeypatch.setenv("BITWARDEN_ACCESS_KEY", "fixture-bootstrap")

    def runner(command, environment):
        body = records({"selected": {"private": "never-print-this-family-value"}})
        if kind == "duplicate":
            body.append(body[0])
        elif kind == "encoding":
            body[0]["value"] = "never-print-this-family-value"
        return subprocess.CompletedProcess(
            command, 1 if kind == "command" else 0, json.dumps(body), "never-print-this-cli-error"
        )

    assert MODULE.main(["--settings", str(settings), "selected"], runner) == 1
    result = capsys.readouterr()
    assert result.out == ""
    assert "BWS lookup failed" in result.err
    assert "never-print" not in result.err
    assert "fixture-bootstrap" not in result.err
