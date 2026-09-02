from __future__ import annotations

import argparse
import importlib.machinery
import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

DOTFILES = Path(__file__).parent.parent
SCRIPT = DOTFILES / "scripts" / "agent-browser-brave"


def load_wrapper() -> ModuleType:
    loader = importlib.machinery.SourceFileLoader("agent_browser_brave", str(SCRIPT))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def test_real_profile_is_an_alias_resolved_against_local_state(tmp_path, monkeypatch):
    wrapper = load_wrapper()
    (tmp_path / "Default").mkdir()
    (tmp_path / "Local State").write_text(
        '{"profile":{"info_cache":{"Default":{"name":"Work"}}}}', encoding="utf-8"
    )
    config = {"version": 1, "profiles": {"work": {"profileDirectory": "Default"}}}
    monkeypatch.setattr(wrapper, "load_config", lambda: config)
    assert wrapper.resolve_profile("work", tmp_path) == {
        "alias": "work", "profileDirectory": "Default", "displayName": "Work", "extensionsExpected": False
    }
    with pytest.raises(ValueError):
        wrapper.resolve_profile("Default", tmp_path)
    invalid_fixture = DOTFILES / "pi" / "tests" / "fixtures" / "browser-profiles" / "invalid-unknown-field.json"
    with pytest.raises(ValueError, match="unsupported fields"):
        wrapper.validate_config(json.loads(invalid_fixture.read_text(encoding="utf-8")))


def test_windows_command_line_keeps_spaced_identity_argument_together():
    wrapper = load_wrapper()
    command = r'"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --user-data-dir="C:\Users\A User\Brave Data" --profile-directory="Profile 1" --remote-debugging-port=9222 --pi-launch-marker=marker'
    argv = wrapper.windows_argv(command)
    fields = wrapper._argv_fields(argv)
    assert argv[0].endswith("brave.exe")
    assert fields["userDataDir"] == r"C:\Users\A User\Brave Data"
    assert fields["profileDirectory"] == "Profile 1"
    assert fields["port"] == "9222"
    assert wrapper.windows_argv(None) == []


def test_exact_new_target_uses_ids_not_duplicate_urls():
    wrapper = load_wrapper()
    before = [{"id": "old", "type": "page", "url": "https://same"}]
    after = before + [
        {"id": "new", "type": "page", "url": "https://same"},
        {"id": "other", "type": "page", "url": "https://other"},
    ]
    assert wrapper.new_target_id(before, after, "https://same") == "new"
    assert wrapper.target_exists(after, "new")
    assert not wrapper.target_exists(after, "closed")
    with pytest.raises(ValueError):
        wrapper.new_target_id(before, before + [{"id": "a", "url": "https://same"}, {"id": "b", "url": "https://same"}], "https://same")


def test_target_selection_scales_past_fifty_targets():
    wrapper = load_wrapper()
    targets = [{"id": f"tab-{index}", "type": "page", "url": f"https://example/{index}"} for index in range(60)]
    assert wrapper.target_exists(targets, "tab-59")


def test_agent_browser_pins_new_tab_and_rejects_a_closed_bound_target(monkeypatch):
    wrapper = load_wrapper()
    calls = []
    monkeypatch.setattr(wrapper, "resolve_agent_browser", lambda: (["agent-browser"], "test"))
    monkeypatch.setattr(wrapper, "cdp_targets", lambda _: [])
    monkeypatch.setattr(wrapper.subprocess, "run", lambda command, **_: calls.append(command) or argparse.Namespace(returncode=0))
    state = {"cdpPort": 9222, "sessionId": "session", "targetId": None}
    assert wrapper.agent_cmd(state, ["open", "https://example"], pin_target=True) == 0
    assert calls == [["agent-browser", "--cdp", "9222", "--session", "session", "--pin-tab", "open", "https://example"]]
    state["targetId"] = "closed"
    assert wrapper.agent_cmd(state, ["snapshot"]) == 1
    assert len(calls) == 1
    state["targetId"] = None
    monkeypatch.setattr(wrapper.subprocess, "run", lambda *_args, **_kwargs: (_ for _ in ()).throw(wrapper.subprocess.TimeoutExpired("agent-browser", 30)))
    assert wrapper.agent_cmd(state, ["snapshot"]) == 124


def test_extension_runtime_semantics_include_workers_and_zero_installed_profiles():
    wrapper = load_wrapper()
    worker = [{"id": "w", "type": "service_worker", "url": "chrome-extension://abc/background.js"}]
    ordinary_worker = [{"id": "w", "type": "service_worker", "url": "https://site/worker.js"}]
    assert wrapper.verify_extension_mode("enabled", ["brave"], worker, expected=True)
    assert not wrapper.verify_extension_mode("enabled", ["brave"], ordinary_worker, expected=True)
    assert wrapper.verify_extension_mode("enabled", ["brave"], [], expected=False)
    assert wrapper.verify_extension_mode("disabled", ["brave", "--disable-extensions"], [])
    assert not wrapper.verify_extension_mode("disabled", ["brave", "--disable-extensions"], worker)


def test_stale_state_is_reconciled_for_isolated_launch(tmp_path, monkeypatch):
    wrapper = load_wrapper()
    wrapper.STATE_PATH = tmp_path / "session.json"
    wrapper.STATE_PATH.write_text('{"pid": 99}', encoding="utf-8")
    monkeypatch.setattr(wrapper, "process_matches", lambda _: False)
    monkeypatch.setattr(wrapper, "find_brave", lambda: None)
    args = argparse.Namespace(port=None, real_brave_profile=None, open=None, extensions="enabled")
    with pytest.raises(SystemExit, match="executable not found"):
        wrapper.launch(args, "test")
    assert not wrapper.STATE_PATH.exists()


def test_close_detaches_stale_state_without_terminating(tmp_path, monkeypatch, capsys):
    wrapper = load_wrapper()
    wrapper.STATE_PATH = tmp_path / "session.json"
    wrapper.STATE_PATH.write_text('{"pid": 77}', encoding="utf-8")
    monkeypatch.setattr(wrapper, "process_matches", lambda _: False)
    run = monkeypatch.setattr(wrapper.subprocess, "run", lambda *_args, **_kwargs: pytest.fail("must not terminate an unowned process"))
    assert wrapper.close_owned() == 0
    assert not wrapper.STATE_PATH.exists()
    assert "close-owned: detached" in capsys.readouterr().out


def test_process_identity_is_the_full_tuple(monkeypatch):
    wrapper = load_wrapper()
    state = {"pid": 7, "creationTime": 12, "executablePath": "/brave", "userDataDir": "/data", "profileDirectory": "Default", "launchMarker": "m", "cdpPort": 9222}
    monkeypatch.setattr(wrapper, "inspect_process", lambda _: {"creationTime": 12, "executablePath": "/brave", "userDataDir": "/data", "profileDirectory": "Default", "marker": "m", "port": "9222"})
    assert wrapper.process_matches(state)
    state["creationTime"] = 13
    assert not wrapper.process_matches(state)
