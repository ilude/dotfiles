"""T3's mutable settings remain local; setup merges only the Pi integration."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node unavailable")


@pytest.fixture
def t3_setup(tmp_path):
    home = tmp_path / "T3 home with spaces"
    settings = home / "userdata/settings.json"
    settings.parent.mkdir(parents=True)
    binary = tmp_path / "Pi shim with spaces.cmd"
    binary.write_text("fixture, not executed")

    def run():
        return subprocess.run(
            [
                NODE,
                str(ROOT / "scripts/t3-code-setup.mjs"),
                "--base-dir",
                str(home),
                "--pi-binary",
                str(binary),
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )

    return settings, binary, run


def test_creates_native_default_pi_configuration_and_is_repeatable(t3_setup):
    settings, binary, run = t3_setup
    result = run()
    assert result.returncode == 0, result.stdout + result.stderr
    content = settings.read_text()
    parsed = json.loads(content)
    pi = parsed["providerInstances"]["pi"]
    assert pi["enabled"] is True
    assert pi["config"]["binaryPath"] == str(binary)
    environment = {entry["name"]: entry["value"] for entry in pi["environment"]}
    assert Path(environment["PI_CODING_AGENT_DIR"]) == ROOT / "pi/profiles/default"
    assert environment["HERDR_ENV"] == "0"
    assert parsed["defaultModelSelection"] == {"instanceId": "pi", "model": "default"}
    assert "defaultRuntimeMode" not in parsed
    assert "authentication" in result.stdout.lower()
    before = settings.stat().st_mtime_ns
    assert run().returncode == 0
    assert settings.read_text() == content
    assert settings.stat().st_mtime_ns == before


def test_preserves_user_settings_other_providers_and_secret_references(t3_setup):
    settings, _, run = t3_setup
    original = {
        "idleCompaction": "off",
        "defaultRuntimeMode": "approval-required",
        "defaultModelSelection": {"instanceId": "claudeAgent", "model": "user-model"},
        "providerInstances": {
            "claudeAgent": {"driver": "claudeAgent", "enabled": False},
            "pi": {
                "driver": "pi",
                "displayName": "My Pi",
                "accentColor": "#123456",
                "config": {"launchArgs": "--thinking low", "binaryPath": "old"},
                "environment": [
                    {"name": "PI_CODING_AGENT_DIR", "value": "old", "sensitive": False},
                    {"name": "HERDR_ENV", "value": "1", "sensitive": False},
                    {"name": "API_KEY", "value": "", "sensitive": True, "secret": {"id": "keep"}},
                ],
            },
        },
    }
    settings.write_text(json.dumps(original))
    result = run()
    assert result.returncode == 0, result.stdout + result.stderr
    parsed = json.loads(settings.read_text())
    for key in ("idleCompaction", "defaultRuntimeMode", "defaultModelSelection"):
        assert parsed[key] == original[key]
    assert (
        parsed["providerInstances"]["claudeAgent"] == original["providerInstances"]["claudeAgent"]
    )
    pi = parsed["providerInstances"]["pi"]
    assert pi["displayName"] == "My Pi"
    assert pi["accentColor"] == "#123456"
    assert pi["config"]["launchArgs"] == "--thinking low"
    assert pi["environment"][0] == original["providerInstances"]["pi"]["environment"][2]
    assert len(pi["environment"]) == 3


@pytest.mark.parametrize(
    "content",
    [
        "not JSON",
        "[]",
        '{"providerInstances": []}',
        '{"providerInstances": {"pi": {"driver": "codex"}}}',
        '{"providerInstances": {"pi": {"environment": "invalid"}}}',
    ],
)
def test_invalid_settings_are_not_overwritten(t3_setup, content):
    settings, _, run = t3_setup
    settings.write_text(content)
    assert run().returncode != 0
    assert settings.read_text() == content
