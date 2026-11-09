"""T3 runtime state stays local while setup merges portable preferences and Pi."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PREFERENCES = ROOT / "config/t3-code"
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
    portable = json.loads((PREFERENCES / "settings.json").read_text())
    assert parsed["defaultModelSelection"] == portable["defaultModelSelection"]
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
        "unknownFutureSetting": {"keep": True},
        "projectSettingsOverrides": {"local-project": {"defaultAutoPull": False}},
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
    for key in ("unknownFutureSetting", "projectSettingsOverrides", "defaultRuntimeMode"):
        assert parsed[key] == original[key]
    portable = json.loads((PREFERENCES / "settings.json").read_text())
    for key, value in portable.items():
        assert parsed[key] == value
    assert (
        parsed["providerInstances"]["claudeAgent"] == original["providerInstances"]["claudeAgent"]
    )
    pi = parsed["providerInstances"]["pi"]
    assert pi["displayName"] == "My Pi"
    assert pi["accentColor"] == "#123456"
    assert pi["config"]["launchArgs"] == "--thinking low"
    assert pi["environment"][0] == original["providerInstances"]["pi"]["environment"][2]
    assert len(pi["environment"]) == 3


@pytest.mark.parametrize("wrapped_client", [False, True])
def test_merges_client_preferences_and_keybindings_preserving_local_state(t3_setup, wrapped_client):
    settings, _, run = t3_setup
    client_path = settings.with_name("client-settings.json")
    bindings_path = settings.with_name("keybindings.json")
    local = {
        "chatWidth": "comfortable",
        "browserProfiles": [{"id": "local-browser", "name": "Keep"}],
        "browserDefaultProfileId": "local-browser",
        "voiceMicrophone": "local-device",
        "onboardingCompletedAt": "local-timestamp",
        "sidebarProjectGroupingOverrides": {"local-project": "none"},
        "unknownFutureSetting": True,
    }
    document = {"settings": local, "metadata": "keep"} if wrapped_client else local
    client_path.write_text(json.dumps(document))
    portable_bindings = json.loads((PREFERENCES / "keybindings.json").read_text())
    managed = portable_bindings[0]
    conflict = {**managed, "command": "local-old-command"}
    local_binding = {"key": "mod+alt+f12", "command": "chat.new"}
    different_context = {**managed, "when": "localContext", "command": "chat.new"}
    bindings_path.write_text(json.dumps([conflict, local_binding, different_context]))

    result = run()
    assert result.returncode == 0, result.stdout + result.stderr
    applied_document = json.loads(client_path.read_text())
    if wrapped_client:
        assert applied_document["metadata"] == "keep"
    client = applied_document["settings"] if wrapped_client else applied_document
    portable_client = json.loads((PREFERENCES / "client-settings.json").read_text())
    assert client == {**local, **portable_client}
    bindings = json.loads(bindings_path.read_text())
    assert bindings == [local_binding, different_context, *portable_bindings]
    paths = [settings, client_path, bindings_path]
    before = [(path.read_bytes(), path.stat().st_mtime_ns) for path in paths]
    assert run().returncode == 0
    assert [(path.read_bytes(), path.stat().st_mtime_ns) for path in paths] == before


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("client-settings.json", "not JSON"),
        ("client-settings.json", "[]"),
        ("client-settings.json", '{"settings": []}'),
        ("keybindings.json", "{}"),
        ("keybindings.json", '[{"key": "mod+x", "command": 42}]'),
    ],
)
def test_invalid_client_configuration_leaves_all_files_unchanged(t3_setup, name, content):
    settings, _, run = t3_setup
    settings.write_text('{"unknownFutureSetting": true}')
    invalid = settings.with_name(name)
    invalid.write_text(content)
    assert run().returncode != 0
    assert settings.read_text() == '{"unknownFutureSetting": true}'
    assert invalid.read_text() == content


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
