from __future__ import annotations

import importlib.util
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import ModuleType

DOTFILES = Path(__file__).parent.parent
SCRIPT = DOTFILES / "scripts" / "agent_instance_lease.py"


def load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("agent_instance_lease", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_worktree(path: Path, branch: str = "main") -> Path:
    git_dir = path / ".git"
    git_dir.mkdir(parents=True)
    (git_dir / "HEAD").write_text(f"ref: refs/heads/{branch}\n", encoding="utf-8")
    return path


def test_register_is_atomic_idempotent_and_rescans_concurrent_clients(tmp_path):
    lease = load_script()
    root = make_worktree(tmp_path / "repo", "feature/leases")
    now = datetime(2026, 7, 17, tzinfo=timezone.utc)

    def register(client: str, session_id: str):
        return lease.register_lease(root, client, session_id, os.getpid(), now=now)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(lambda item: register(*item), [("pi", "pi-1"), ("claude", "claude-1")])
        )

    final = lease.scan_leases(root, now=now)
    assert {record["client"] for record in final["active"]} == {"pi", "claude"}
    assert any(len(result["active"]) == 2 for result in results)
    assert all(result["lease"]["branch"] == "feature/leases" for result in results)
    assert len(list((root / ".agent-instances").glob("*.json"))) == 2

    repeated = register("pi", "pi-1")
    assert repeated["lease"]["startedAt"] == results[0]["lease"]["startedAt"]
    assert len(list((root / ".agent-instances").glob("*.json"))) == 2


def test_separate_worktrees_never_share_occupants(tmp_path):
    lease = load_script()
    first = make_worktree(tmp_path / "first")
    second = make_worktree(tmp_path / "second")
    now = datetime(2026, 7, 17, tzinfo=timezone.utc)

    lease.register_lease(first, "pi", "first-session", os.getpid(), now=now)
    lease.register_lease(second, "claude", "second-session", os.getpid(), now=now)

    assert [item["sessionId"] for item in lease.scan_leases(first, now=now)["active"]] == [
        "first-session"
    ]
    assert [item["sessionId"] for item in lease.scan_leases(second, now=now)["active"]] == [
        "second-session"
    ]


def test_stale_cleanup_requires_expiry_and_absent_or_replaced_identity(tmp_path, monkeypatch):
    lease = load_script()
    root = make_worktree(tmp_path / "repo")
    old = datetime(2026, 7, 17, tzinfo=timezone.utc)
    current = old + timedelta(minutes=3)

    monkeypatch.setattr(lease, "process_start_token", lambda _pid: "start-a")
    result = lease.register_lease(root, "pi", "replaced", os.getpid(), now=old)
    replaced_path = Path(result["path"])
    live = lease.scan_leases(root, now=current, stale_seconds=120)
    assert [item["sessionId"] for item in live["active"]] == ["replaced"]

    monkeypatch.setattr(lease, "process_start_token", lambda _pid: "start-b")
    replaced = lease.scan_leases(root, now=current, stale_seconds=120)
    assert replaced["removed"] == [str(replaced_path)]

    monkeypatch.setattr(lease, "process_start_token", lambda _pid: None)
    result = lease.register_lease(root, "pi", "crashed", os.getpid(), now=old)
    crashed_path = Path(result["path"])
    monkeypatch.setattr(lease, "process_exists", lambda _pid: False)
    crashed = lease.scan_leases(root, now=current, stale_seconds=120)
    assert crashed["active"] == []
    assert crashed["removed"] == [str(crashed_path)]


def test_invalid_process_identifier_is_absent():
    lease = load_script()

    assert lease.process_exists(2147483647) is False


def test_malformed_records_are_reported_and_never_removed(tmp_path):
    lease = load_script()
    root = make_worktree(tmp_path / "repo")
    lease_dir = root / ".agent-instances"
    lease_dir.mkdir()
    malformed = lease_dir / "broken.json"
    malformed.write_text("not-json\n", encoding="utf-8")

    result = lease.scan_leases(root)

    assert result["active"] == []
    assert result["removed"] == []
    assert result["malformed"][0]["path"] == str(malformed)
    assert malformed.exists()


def test_heartbeat_release_and_cli_status(tmp_path, capsys):
    lease = load_script()
    root = make_worktree(tmp_path / "repo")
    started = datetime(2026, 7, 17, tzinfo=timezone.utc)
    later = started + timedelta(seconds=30)
    registered = lease.register_lease(root, "pi", "session", os.getpid(), now=started)

    heartbeat = lease.heartbeat_lease(root, "pi", "session", os.getpid(), now=later)
    assert heartbeat["startedAt"] == registered["lease"]["startedAt"]
    assert heartbeat["lastHeartbeat"] == lease.iso_timestamp(later)

    assert lease.main(["status", "--worktree", str(root)]) == 0
    output = json.loads(capsys.readouterr().out)
    assert output["active"][0]["sessionId"] == "session"

    assert lease.release_lease(root, "pi", "session", os.getpid()) is True
    assert lease.release_lease(root, "pi", "session", os.getpid()) is False
