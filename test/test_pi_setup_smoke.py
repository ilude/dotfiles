"""Offline acceptance uses the installed Pi CLI, not a fake Pi executable."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
RUNTIME = ROOT / "pi/profiles/default/node_modules"
MANIFEST = RUNTIME / "@earendil-works/pi-coding-agent/package.json"
pytestmark = pytest.mark.skipif(
    NODE is None or not MANIFEST.exists(), reason="installed default Pi runtime unavailable"
)


@pytest.fixture
def native_setup(tmp_path: Path):
    home = tmp_path / "home with spaces"
    repo = home / ".dotfiles"
    profile = repo / "pi/profiles/default"
    profile.mkdir(parents=True)
    scripts = repo / "scripts"
    scripts.mkdir()
    for name in (
        "pi-profile-launch", "pi-profile-launch.ps1", "pi-damage-control-preflight.mjs",
        "pi-damage-control-recovery.js",
    ):
        shutil.copy2(ROOT / "scripts" / name, scripts / name)
    settings = json.loads((ROOT / "pi/profiles/default/settings.json").read_text())
    (profile / "settings.json").write_text(json.dumps({
        "defaultProvider": settings["defaultProvider"], "defaultModel": settings["defaultModel"],
    }))
    # Link installed code only. Never copy credentials, sessions, or the user's configuration.
    if os.name == "nt":
        result = subprocess.run(
            ["pwsh", "-NoProfile", "-Command",
             "New-Item -ItemType Junction -Path $env:LINK -Target $env:TARGET | Out-Null"],
            env={**os.environ, "LINK": str(profile / "node_modules"), "TARGET": str(RUNTIME)},
            capture_output=True, text=True, timeout=10,
        )
        assert result.returncode == 0, result.stderr
    else:
        (profile / "node_modules").symlink_to(RUNTIME, target_is_directory=True)
    bootstrap = profile / "extensions/damage-control/index.js"
    bootstrap.parent.mkdir(parents=True)
    bootstrap.write_text("export default function fixture() {}\n")
    alias = home / ".pi/agent"
    alias.parent.mkdir()

    def link(target: Path):
        if os.name == "nt":
            result = subprocess.run(
                ["pwsh", "-NoProfile", "-Command",
                 "New-Item -ItemType Junction -Path $env:LINK -Target $env:TARGET | Out-Null"],
                env={**os.environ, "LINK": str(alias), "TARGET": str(target)},
                capture_output=True, text=True, timeout=10,
            )
            assert result.returncode == 0, result.stderr
        else:
            alias.symlink_to(target, target_is_directory=True)

    def run():
        return subprocess.run(
            [NODE, str(ROOT / "scripts/pi-setup-smoke.mjs"), "--root", str(repo)],
            cwd=tmp_path,
            env={**os.environ, "HOME": str(home), "USERPROFILE": str(home)},
            capture_output=True, text=True, timeout=80,
        )

    return profile, link, run


def test_real_native_and_wrapper_agree_without_authentication(native_setup):
    profile, link, run = native_setup
    link(profile)
    result = run()
    assert result.returncode == 0, result.stdout + result.stderr
    assert "native and wrapper load default" in result.stdout
    assert "Authentication unverified; no model request made" in result.stdout
    assert not (profile / "auth.json").exists() or json.loads(
        (profile / "auth.json").read_text()
    ) == {}


def test_rejects_a_configured_model_missing_from_the_real_runtime(native_setup):
    profile, link, run = native_setup
    link(profile)
    settings = json.loads((profile / "settings.json").read_text())
    settings["defaultModel"] = "missing-setup-regression-model"
    (profile / "settings.json").write_text(json.dumps(settings))
    result = run()
    assert result.returncode != 0
    assert "Configured default model is absent" in result.stderr


def test_rejects_wrong_native_alias_even_with_inherited_correct_override(native_setup, tmp_path):
    profile, link, run = native_setup
    other = tmp_path / "unrelated profile"
    other.mkdir()
    marker = other / "preserve.txt"
    marker.write_text("user data")
    link(other)
    previous = os.environ.get("PI_CODING_AGENT_DIR")
    os.environ["PI_CODING_AGENT_DIR"] = str(profile)
    try:
        result = run()
    finally:
        if previous is None:
            os.environ.pop("PI_CODING_AGENT_DIR", None)
        else:
            os.environ["PI_CODING_AGENT_DIR"] = previous
    assert result.returncode != 0
    assert "Native ~/.pi/agent must point to default" in result.stderr
    assert marker.read_text() == "user data"
