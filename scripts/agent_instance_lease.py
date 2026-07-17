#!/usr/bin/env python
"""Coordinate active agent sessions within one Git worktree."""

from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
DEFAULT_STALE_SECONDS = 120
MAX_LEASE_BYTES = 8192
LEASE_DIR_NAME = ".agent-instances"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def discover_worktree(start: Path) -> Path:
    current = start.resolve()
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists():
            return candidate
    raise ValueError(f"no Git worktree found from {start}")


def git_dir(worktree: Path) -> Path:
    marker = worktree / ".git"
    if marker.is_dir():
        return marker
    text = marker.read_text(encoding="utf-8").strip()
    prefix = "gitdir: "
    if not text.startswith(prefix):
        raise ValueError(f"invalid Git worktree marker: {marker}")
    target = Path(text[len(prefix) :])
    return target.resolve() if target.is_absolute() else (worktree / target).resolve()


def read_branch(worktree: Path) -> str:
    head = (git_dir(worktree) / "HEAD").read_text(encoding="utf-8").strip()
    prefix = "ref: refs/heads/"
    return head[len(prefix) :] if head.startswith(prefix) else head


def process_start_token(pid: int) -> str | None:
    stat_path = Path("/proc") / str(pid) / "stat"
    try:
        fields = stat_path.read_text(encoding="utf-8").split()
    except OSError:
        return None
    return fields[21] if len(fields) > 21 else None


def process_exists(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError as error:
        if error.errno == errno.ESRCH or getattr(error, "winerror", None) == 87:
            return False
        raise
    return True


def validate_identity(client: str, session_id: str, pid: int) -> None:
    if not client or len(client) > 64:
        raise ValueError("client must contain 1-64 characters")
    if not session_id or len(session_id) > 128:
        raise ValueError("session id must contain 1-128 characters")
    if pid <= 0:
        raise ValueError("pid must be positive")


def lease_path(worktree: Path, client: str, session_id: str) -> Path:
    digest = hashlib.sha256(f"{client}\0{session_id}".encode()).hexdigest()[:24]
    safe_client = "".join(char for char in client.lower() if char.isalnum() or char == "-")
    return worktree / LEASE_DIR_NAME / f"{safe_client or 'client'}-{digest}.json"


def validate_record(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("record must be an object")
    required = {
        "schemaVersion": int,
        "client": str,
        "sessionId": str,
        "worktreeRoot": str,
        "branch": str,
        "startedAt": str,
        "lastHeartbeat": str,
        "pid": int,
    }
    for field, expected_type in required.items():
        if not isinstance(value.get(field), expected_type):
            raise ValueError(f"{field} must be {expected_type.__name__}")
    if value["schemaVersion"] != SCHEMA_VERSION:
        raise ValueError(f"unsupported schema version: {value['schemaVersion']}")
    validate_identity(value["client"], value["sessionId"], value["pid"])
    parse_timestamp(value["startedAt"])
    parse_timestamp(value["lastHeartbeat"])
    token = value.get("processStartToken")
    if token is not None and not isinstance(token, str):
        raise ValueError("processStartToken must be a string")
    return value


def read_record(path: Path) -> dict[str, Any]:
    if path.stat().st_size > MAX_LEASE_BYTES:
        raise ValueError(f"record exceeds {MAX_LEASE_BYTES} bytes")
    return validate_record(json.loads(path.read_text(encoding="utf-8")))


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"
    if len(payload.encode("utf-8")) > MAX_LEASE_BYTES:
        raise ValueError(f"record exceeds {MAX_LEASE_BYTES} bytes")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def identity_is_active(record: dict[str, Any]) -> bool:
    token = record.get("processStartToken")
    if token is not None:
        return process_start_token(record["pid"]) == token
    return process_exists(record["pid"])


def scan_leases(
    worktree: Path,
    *,
    now: datetime | None = None,
    stale_seconds: int = DEFAULT_STALE_SECONDS,
    cleanup: bool = True,
) -> dict[str, Any]:
    root = worktree.resolve()
    current = now or utc_now()
    active = []
    malformed = []
    removed = []
    lease_dir = root / LEASE_DIR_NAME
    if not lease_dir.exists():
        return {"active": active, "malformed": malformed, "removed": removed}
    for path in sorted(lease_dir.glob("*.json")):
        try:
            record = read_record(path)
        except (OSError, ValueError, json.JSONDecodeError) as error:
            malformed.append({"path": str(path), "error": str(error)})
            continue
        age = (current - parse_timestamp(record["lastHeartbeat"])).total_seconds()
        if age > stale_seconds and not identity_is_active(record):
            if cleanup:
                try:
                    path.unlink()
                except OSError as error:
                    malformed.append({"path": str(path), "error": str(error)})
                    continue
                removed.append(str(path))
            continue
        active.append(record)
    return {"active": active, "malformed": malformed, "removed": removed}


def register_lease(
    worktree: Path,
    client: str,
    session_id: str,
    pid: int,
    *,
    now: datetime | None = None,
    stale_seconds: int = DEFAULT_STALE_SECONDS,
) -> dict[str, Any]:
    validate_identity(client, session_id, pid)
    root = worktree.resolve()
    current = now or utc_now()
    path = lease_path(root, client, session_id)
    started_at = iso_timestamp(current)
    if path.exists():
        existing = read_record(path)
        if (
            existing["client"] != client
            or existing["sessionId"] != session_id
            or existing["pid"] != pid
        ):
            raise ValueError(f"lease identity mismatch: {path}")
        started_at = existing["startedAt"]
    record = {
        "schemaVersion": SCHEMA_VERSION,
        "client": client,
        "sessionId": session_id,
        "worktreeRoot": str(root),
        "branch": read_branch(root),
        "startedAt": started_at,
        "lastHeartbeat": iso_timestamp(current),
        "pid": pid,
    }
    token = process_start_token(pid)
    if token is not None:
        record["processStartToken"] = token
    atomic_write(path, record)
    result = scan_leases(root, now=current, stale_seconds=stale_seconds)
    result.update({"lease": record, "path": str(path)})
    return result


def heartbeat_lease(
    worktree: Path,
    client: str,
    session_id: str,
    pid: int,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    root = worktree.resolve()
    path = lease_path(root, client, session_id)
    record = read_record(path)
    if record["client"] != client or record["sessionId"] != session_id:
        raise ValueError(f"lease identity mismatch: {path}")
    if record["pid"] != pid:
        raise ValueError(f"lease pid mismatch: {path}")
    record["lastHeartbeat"] = iso_timestamp(now or utc_now())
    record["branch"] = read_branch(root)
    atomic_write(path, record)
    return record


def release_lease(worktree: Path, client: str, session_id: str, pid: int) -> bool:
    root = worktree.resolve()
    path = lease_path(root, client, session_id)
    if not path.exists():
        return False
    record = read_record(path)
    if record["client"] != client or record["sessionId"] != session_id or record["pid"] != pid:
        raise ValueError(f"lease identity mismatch: {path}")
    path.unlink()
    return True


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("register", "heartbeat", "release", "status"))
    parser.add_argument("--worktree", type=Path, default=Path.cwd())
    parser.add_argument("--client")
    parser.add_argument("--session-id")
    parser.add_argument("--pid", type=int)
    parser.add_argument("--stale-seconds", type=int, default=DEFAULT_STALE_SECONDS)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    worktree = discover_worktree(args.worktree)
    if args.action == "status":
        result = scan_leases(worktree, stale_seconds=args.stale_seconds)
    else:
        if args.client is None or args.session_id is None or args.pid is None:
            raise ValueError("client, session-id, and pid are required")
        if args.action == "register":
            result = register_lease(
                worktree,
                args.client,
                args.session_id,
                args.pid,
                stale_seconds=args.stale_seconds,
            )
        elif args.action == "heartbeat":
            result = heartbeat_lease(worktree, args.client, args.session_id, args.pid)
        else:
            result = {"released": release_lease(worktree, args.client, args.session_id, args.pid)}
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
