from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path
from types import ModuleType

DOTFILES = Path(__file__).parent.parent
HOOK = DOTFILES / "claude" / "hooks" / "agent_instances.py"
STATUS = DOTFILES / "claude" / "claude-status"


def load_hook() -> ModuleType:
    spec = importlib.util.spec_from_file_location("claude_agent_instances", HOOK)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_worktree(path: Path) -> Path:
    git_dir = path / ".git"
    git_dir.mkdir(parents=True)
    (git_dir / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
    return path


def payload(event: str, root: Path, session_id: str = "claude-session") -> dict:
    return {
        "hook_event_name": event,
        "session_id": session_id,
        "cwd": str(root),
        "workspace": {"current_dir": str(root)},
        "model": {"display_name": "Claude"},
    }


def test_claude_lifecycle_warns_refreshes_status_and_releases(tmp_path, monkeypatch):
    hook = load_hook()
    helper = hook.load_helper()
    root = make_worktree(tmp_path / "repo")
    monkeypatch.setenv("CLAUDE_AGENT_PARENT_PID", str(os.getpid()))
    helper.register_lease(root, "pi", "pi-session", os.getpid())

    started = hook.hook_output(payload("SessionStart", root))
    context = started["hookSpecificOutput"]["additionalContext"]
    assert "1 other active agent session occupies" in context
    assert "separate Git worktree" in context

    refreshed = hook.hook_output(payload("UserPromptSubmit", root))
    assert refreshed["hookSpecificOutput"]["hookEventName"] == "UserPromptSubmit"
    label, warning = hook.status_occupancy(payload("Status", root))
    assert label == "instances 2 !"
    assert warning == context

    assert hook.hook_output(payload("SessionEnd", root)) == {}
    active = helper.scan_leases(root)["active"]
    assert [(record["client"], record["sessionId"]) for record in active] == [("pi", "pi-session")]


def test_claude_separate_worktree_has_no_warning(tmp_path, monkeypatch):
    hook = load_hook()
    helper = hook.load_helper()
    first = make_worktree(tmp_path / "first")
    second = make_worktree(tmp_path / "second")
    monkeypatch.setenv("CLAUDE_AGENT_PARENT_PID", str(os.getpid()))
    helper.register_lease(first, "pi", "pi-session", os.getpid())

    assert hook.hook_output(payload("SessionStart", second)) == {}
    label, warning = hook.status_occupancy(payload("Status", second))
    assert label == "instances 1"
    assert warning is None


def test_claude_settings_wire_all_lease_lifecycle_hooks():
    settings = json.loads((DOTFILES / "claude" / "settings.json").read_text(encoding="utf-8"))
    expected = "CLAUDE_AGENT_PARENT_PID=$PPID python $HOME/.claude/hooks/agent_instances.py"

    for event in ("SessionStart", "UserPromptSubmit", "SessionEnd"):
        commands = [
            hook["command"] for group in settings["hooks"][event] for hook in group["hooks"]
        ]
        assert expected in commands


def test_claude_status_line_displays_occupancy(tmp_path, monkeypatch):
    hook = load_hook()
    root = make_worktree(tmp_path / "repo")
    monkeypatch.setenv("CLAUDE_AGENT_PARENT_PID", str(os.getpid()))
    hook.hook_output(payload("SessionStart", root))

    result = subprocess.run(
        [sys.executable, str(STATUS)],
        input=json.dumps(payload("Status", root)),
        capture_output=True,
        text=True,
        timeout=20,
        check=True,
    )

    assert "instances 1" in result.stdout
