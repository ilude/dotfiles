from __future__ import annotations

import argparse
import importlib.machinery
import importlib.util
from pathlib import Path
from types import ModuleType

DOTFILES = Path(__file__).parent.parent
SCRIPT = DOTFILES / "scripts" / "agent-browser-brave"


def load_wrapper() -> ModuleType:
    loader = importlib.machinery.SourceFileLoader("agent_browser_brave", str(SCRIPT))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def launch_args(**overrides: object) -> argparse.Namespace:
    values = {
        "port": None,
        "real_brave_default": False,
        "real_brave_profile": None,
        "open": None,
    }
    values.update(overrides)
    return argparse.Namespace(**values)


def test_launch_uses_owned_profile_loopback_and_ephemeral_port(tmp_path, monkeypatch):
    wrapper = load_wrapper()
    commands = []

    class Process:
        pid = 1234

    monkeypatch.setattr(wrapper, "PI_PROFILE_DIR", tmp_path / "owned profile")
    monkeypatch.setattr(wrapper, "find_brave", lambda: "brave")
    monkeypatch.setattr(wrapper, "free_port", lambda: 9222)
    monkeypatch.setattr(wrapper, "wait_cdp", lambda port: port == 9222)
    monkeypatch.setattr(wrapper, "brave_identity", lambda *_args: True)
    monkeypatch.setattr(wrapper, "save_state", lambda _state: None)
    monkeypatch.setattr(
        wrapper.subprocess,
        "Popen",
        lambda command, **_kwargs: commands.append(command) or Process(),
    )

    state = wrapper.launch(launch_args(open="https://example.com"), "installed:test")

    assert commands == [
        [
            "brave",
            "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=9222",
            f"--user-data-dir={(tmp_path / 'owned profile').resolve()}",
            "--profile-directory=Pi",
            "--no-first-run",
            "--no-default-browser-check",
            "https://example.com",
        ]
    ]
    assert state["profileMode"] == "pi"
    assert state["pid"] == 1234


def test_real_profile_launch_warns_and_uses_default_directory(tmp_path, monkeypatch, capsys):
    wrapper = load_wrapper()
    commands = []

    class Process:
        pid = 5678

    monkeypatch.setattr(wrapper, "find_brave", lambda: "brave")
    monkeypatch.setattr(wrapper, "free_port", lambda: 9333)
    monkeypatch.setattr(wrapper, "default_brave_user_data_dir", lambda: tmp_path)
    monkeypatch.setattr(wrapper, "wait_cdp", lambda _port: True)
    monkeypatch.setattr(wrapper, "brave_identity", lambda *_args: True)
    monkeypatch.setattr(wrapper, "save_state", lambda _state: None)
    monkeypatch.setattr(
        wrapper.subprocess,
        "Popen",
        lambda command, **_kwargs: commands.append(command) or Process(),
    )

    state = wrapper.launch(launch_args(real_brave_default=True), "installed:test")

    assert "real Brave profile mode can control logged-in sites" in capsys.readouterr().err
    assert f"--user-data-dir={tmp_path}" in commands[0]
    assert "--profile-directory=Default" in commands[0]
    assert state["profileMode"] == "real"


def test_close_owned_requires_identity_and_terminates_only_recorded_pid(tmp_path, monkeypatch):
    wrapper = load_wrapper()
    wrapper.STATE_PATH = tmp_path / "state.json"
    wrapper.STATE_PATH.write_text("{}", encoding="utf-8")
    state = {
        "pid": 2468,
        "cdpPort": 9444,
        "executablePath": "brave",
        "userDataDir": "BraveSoftware/User Data",
    }
    killed = []

    monkeypatch.setattr(wrapper, "load_state", lambda: state)
    monkeypatch.setattr(wrapper, "cdp_json", lambda _port: None)
    monkeypatch.setattr(wrapper.os, "kill", lambda pid, signal: killed.append((pid, signal)))
    monkeypatch.setattr(wrapper, "is_windows", lambda: False)

    assert wrapper.close_owned() == 1
    assert killed == []
    assert wrapper.STATE_PATH.exists()

    monkeypatch.setattr(wrapper, "cdp_json", lambda _port: {"Browser": "Brave/1"})
    assert wrapper.close_owned() == 0
    assert killed == [(2468, 15)]
    assert not wrapper.STATE_PATH.exists()
