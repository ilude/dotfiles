"""Deterministic, privacy-bounded tool failure screening and decisions."""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterator, Optional, Sequence

FINGERPRINT_VERSION = 1
LEDGER_SCHEMA_VERSION = 1
LOCK_TIMEOUT_SECONDS = 5.0
MAX_REASON_CHARS = 240
MAX_COORDINATES = 3

_SECRET = re.compile(r"(?i)(?:password|passwd|token|secret|api[_-]?key|authorization)\s*[:=]")
_HOME = re.compile(r"(?i)(?:[a-z]:\\users\\[^\\\s]+|/(?:home|users)/[^/\s]+)")
_ABSOLUTE = re.compile(r"(?i)(?:[a-z]:\\|/(?:home|users|tmp|var|etc|opt)/)")
_RAW = re.compile(r"[\r\n\x00-\x1f]")


@dataclass(frozen=True)
class Observation:
    tool: str
    error_class: str
    contract: str
    classification: str
    occurred_at: Optional[str]
    session_key: str
    coordinate: str


def _message(value: object) -> Optional[dict[str, object]]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def _content_items(message: dict[str, object]) -> list[dict[str, object]]:
    content = message.get("content")
    if isinstance(content, dict):
        return [content]
    if isinstance(content, list):
        return [item for item in content if isinstance(item, dict)]
    return []


def _classify(tool: str, text: str) -> tuple[str, str, str]:
    normalized_tool = tool.lower()
    lowered = text.lower()
    if normalized_tool in {"bash", "functions.bash"} and (
        "required properties command" in lowered or "'command' is a required property" in lowered
    ):
        return "missing-required-parameter", "required:command", "candidate"
    if normalized_tool in {"read", "functions.read"} and any(
        phrase in lowered
        for phrase in ("outside", "path escape", "boundary", "not within", "governed")
    ):
        return "governed-path-rejection", "selected-skill-read:path-boundary", "candidate"
    if "subagent" in normalized_tool and any(
        phrase in lowered for phrase in ("unknown agent", "available agents", "abi", "manager")
    ):
        return "stale-manager-contract", "subagent-manager:availability", "candidate"
    if " is not a function" in lowered:
        return "internal-missing-method", "runtime:missing-method", "candidate"
    if normalized_tool == "web_search" and (
        lowered.strip() == "fetch failed" or "operation was aborted due to timeout" in lowered
    ):
        return "external-service-failure", "web-search:request", "candidate"
    if "pi cli entrypoint is unavailable" in lowered or "available agents: none" in lowered:
        return "required-runtime-unavailable", "runtime:availability", "candidate"
    if any(phrase in lowered for phrase in ("damage control", "blocked by policy")):
        return "safety-block", "policy:block", "expected"
    if any(phrase in lowered for phrase in ("tests failed", "test failed", "exit code 1")):
        return "nonzero-test", "command:test-nonzero", "expected"
    if (
        re.search(r"loaded \d+ (?:target-specific )?agents context file", lowered)
        or "loaded path-specific instructions" in lowered
        or "deferred while loading path-specific instructions" in lowered
        or "successfully before modifying it" in lowered
    ):
        return "instruction-deferred", "mutation:instruction-discovery", "expected"
    if "could not find edits[" in lowered or "oldtext must match exactly" in lowered:
        return "exact-match-miss", "mutation:exact-match", "expected"
    if "found " in lowered and " occurrences of edits[" in lowered:
        return "nonunique-match", "mutation:unique-match", "expected"
    if (
        "enoent: no such file or directory" in lowered
        or lowered.startswith("path not found:")
        or "no valid search paths given" in lowered
        or "system cannot find the file specified" in lowered
        or "system cannot find the path specified" in lowered
    ):
        return "path-not-found", "filesystem:path-missing", "expected"
    if "offset " in lowered and " is beyond end of file" in lowered:
        return "invalid-offset", "read:offset-range", "expected"
    if normalized_tool in {"bash", "functions.bash", "pwsh", "functions.pwsh"} and (
        "command exited with code " in lowered
        or lowered.startswith("pwsh exited with code ")
        or "command failed with exit code " in lowered
    ):
        return "command-nonzero", "command:nonzero", "expected"
    if "secret scan blocked the commit" in lowered:
        return "secret-scan-block", "commit:secret-scan", "expected"
    if (
        lowered.startswith("validation failed for tool")
        or "no active plan lifecycle exists" in lowered
        or "plan contract validation failed:" in lowered
        or "scope entries must be worktree-relative" in lowered
    ):
        return "invalid-caller-contract", "caller:validation", "expected"
    return "unclassified-error", "manual-review", "unclassified"


def _candidate_id(tool: str, error_class: str, contract: str) -> str:
    material = f"v{FINGERPRINT_VERSION}\0{tool.lower()}\0{error_class}\0{contract}"
    return f"tf-v{FINGERPRINT_VERSION}-{hashlib.sha256(material.encode()).hexdigest()[:20]}"


def scan_connection(connection: object, malformed_omissions: int = 0) -> dict[str, object]:
    rows = connection.execute(
        "SELECT filename, id, timestamp, message FROM session_entries WHERE type = 'message'"
    ).fetchall()
    calls: dict[tuple[str, str], tuple[str, str]] = {}
    results: list[tuple[str, str, Optional[str], dict[str, object]]] = []
    duplicate_calls = 0
    scanned_results = 0
    for filename, entry_id, timestamp, raw_message in rows:
        message = _message(raw_message)
        if message is None:
            continue
        role = message.get("role")
        for item in _content_items(message):
            kind = item.get("type")
            call_id = item.get("id") or item.get("toolCallId")
            if kind in {"toolCall", "tool_call"} and isinstance(call_id, str):
                key = (filename, call_id)
                tool = item.get("name") or item.get("toolName")
                if key in calls:
                    duplicate_calls += 1
                elif isinstance(tool, str):
                    calls[key] = (tool, str(entry_id or ""))
        if role == "toolResult" or message.get("isError") is True:
            call_id = message.get("toolCallId")
            if isinstance(call_id, str):
                results.append((filename, call_id, timestamp, message))
                scanned_results += 1
    unmatched = 0
    observations: list[Observation] = []
    for filename, call_id, timestamp, result in results:
        if result.get("isError") is not True:
            continue
        call = calls.get((filename, call_id))
        if call is None:
            unmatched += 1
            continue
        tool, call_entry = call
        text = " ".join(
            str(item.get("text", ""))
            for item in _content_items(result)
            if item.get("type") == "text"
        )
        error_class, contract, classification = _classify(tool, text)
        session_key = hashlib.sha256(str(filename).encode()).hexdigest()[:12]
        coordinate = hashlib.sha256(f"{call_entry}\0{call_id}".encode()).hexdigest()[:12]
        observations.append(
            Observation(
                tool, error_class, contract, classification, timestamp, session_key, coordinate
            )
        )
    grouped: dict[str, list[Observation]] = {}
    for observation in observations:
        grouped.setdefault(
            _candidate_id(observation.tool, observation.error_class, observation.contract), []
        ).append(observation)
    candidates = []
    for candidate_id in sorted(grouped):
        group = grouped[candidate_id]
        timestamps = sorted(item.occurred_at for item in group if item.occurred_at)
        candidates.append(
            {
                "candidateId": candidate_id,
                "fingerprintVersion": FINGERPRINT_VERSION,
                "tool": group[0].tool.lower(),
                "errorClass": group[0].error_class,
                "contract": group[0].contract,
                "classification": group[0].classification,
                "occurrences": len(group),
                "sessions": len({item.session_key for item in group}),
                "firstObserved": timestamps[0] if timestamps else None,
                "lastObserved": timestamps[-1] if timestamps else None,
                "coordinates": sorted({item.coordinate for item in group})[:MAX_COORDINATES],
            }
        )
    digest_material = [
        (item["candidateId"], item["occurrences"], item["sessions"]) for item in candidates
    ]
    return {
        "schemaVersion": 1,
        "manifestDigest": hashlib.sha256(
            json.dumps(digest_material, separators=(",", ":")).encode()
        ).hexdigest(),
        "sourceWindow": {
            "first": min(
                (item["firstObserved"] for item in candidates if item["firstObserved"]),
                default=None,
            ),
            "last": max(
                (item["lastObserved"] for item in candidates if item["lastObserved"]), default=None
            ),
        },
        "scannedResults": scanned_results,
        "unmatchedResults": unmatched,
        "duplicateCalls": duplicate_calls,
        "malformedOmissions": malformed_omissions,
        "candidates": candidates,
    }


def _safe_text(value: str, field: str) -> str:
    if not value or len(value) > MAX_REASON_CHARS:
        raise ValueError(f"{field} must contain 1-{MAX_REASON_CHARS} characters")
    if (
        _SECRET.search(value)
        or _HOME.search(value)
        or _ABSOLUTE.search(value)
        or _RAW.search(value)
    ):
        raise ValueError(f"{field} contains prohibited sensitive, path, or raw content")
    return value


def _parse_date(value: Optional[str], field: str) -> Optional[str]:
    if value is None:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise ValueError(f"{field} must be an ISO date") from exc


@contextmanager
def _exclusive_lock(path: Path) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    lock = path.with_name(f".{path.name}.lock")
    deadline = time.monotonic() + LOCK_TIMEOUT_SECONDS
    while True:
        try:
            descriptor = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except (FileExistsError, PermissionError):
            if time.monotonic() >= deadline:
                raise TimeoutError(f"timed out waiting for ledger lock: {lock}")
            time.sleep(0.05)
        else:
            os.close(descriptor)
            break
    try:
        yield
    finally:
        lock.unlink()


def load_ledger(path: Path) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    records: list[dict[str, object]] = []
    diagnostics: list[dict[str, object]] = []
    if not path.exists():
        return records, diagnostics
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            diagnostics.append({"line": line_number, "error": "malformed"})
            continue
        if not isinstance(record, dict) or record.get("schemaVersion") != LEDGER_SCHEMA_VERSION:
            diagnostics.append({"line": line_number, "error": "unsupported-schema"})
            continue
        records.append(record)
    return records, diagnostics


def append_decision(
    path: Path,
    scan: dict[str, object],
    candidate_id: str,
    disposition: str,
    reason: str,
    evidence: Sequence[str] = (),
    effective_after: Optional[str] = None,
    revisit_after: Optional[str] = None,
    decided_at: Optional[str] = None,
) -> dict[str, object]:
    candidates = {item["candidateId"]: item for item in scan.get("candidates", [])}
    if candidate_id not in candidates:
        raise ValueError(f"unknown candidate ID: {candidate_id}")
    if disposition not in {"addressed", "skipped"}:
        raise ValueError("disposition must be addressed or skipped")
    safe_reason = _safe_text(reason, "reason")
    safe_evidence = []
    for reference in evidence:
        if ":" not in reference or reference.split(":", 1)[0] not in {
            "commit",
            "test",
            "issue",
            "note",
        }:
            raise ValueError("evidence must be typed as commit:, test:, issue:, or note:")
        safe_evidence.append(_safe_text(reference, "evidence"))
    effective = _parse_date(effective_after, "effective-after")
    revisit = _parse_date(revisit_after, "revisit-after")
    if disposition == "addressed" and (not safe_evidence or effective is None):
        raise ValueError("addressed decisions require typed evidence and effective-after")
    if disposition == "skipped" and effective is not None:
        raise ValueError("skipped decisions cannot set effective-after")
    candidate = candidates[candidate_id]
    record: dict[str, object] = {
        "schemaVersion": LEDGER_SCHEMA_VERSION,
        "recordId": str(uuid.uuid4()),
        "candidateId": candidate_id,
        "fingerprintVersion": candidate["fingerprintVersion"],
        "decidedAt": decided_at or datetime.now(timezone.utc).isoformat(),
        "disposition": disposition,
        "reason": safe_reason,
        "evidence": safe_evidence,
    }
    if effective is not None:
        record["effectiveAfter"] = effective
    if revisit is not None:
        record["revisitAfter"] = revisit
    encoded = json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n"
    with _exclusive_lock(path):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
    return record


def build_report(
    scan: dict[str, object],
    records: Sequence[dict[str, object]],
    today: Optional[date] = None,
    include_expected: bool = False,
) -> dict[str, object]:
    today = today or date.today()
    latest: dict[str, dict[str, object]] = {}
    for record in records:
        latest[str(record.get("candidateId"))] = record
    actionable = []
    summary = {"unchangedSkipped": 0, "resolved": 0, "expectedSuppressed": 0}
    for candidate in scan.get("candidates", []):
        candidate_id = str(candidate["candidateId"])
        decision = latest.get(candidate_id)
        status = "undecided"
        if decision:
            if decision.get("fingerprintVersion") != candidate.get("fingerprintVersion"):
                status = "changed"
            elif decision.get("disposition") == "skipped":
                revisit = decision.get("revisitAfter")
                if isinstance(revisit, str) and date.fromisoformat(revisit) <= today:
                    status = "revisit-due"
                else:
                    summary["unchangedSkipped"] += 1
                    continue
            elif decision.get("disposition") == "addressed":
                effective = decision.get("effectiveAfter")
                last = candidate.get("lastObserved")
                if isinstance(effective, str) and isinstance(last, str) and last[:10] > effective:
                    status = "regression"
                else:
                    summary["resolved"] += 1
                    continue
        if status == "undecided" and candidate.get("classification") == "expected":
            if not include_expected:
                summary["expectedSuppressed"] += 1
                continue
            status = "expected"
        actionable.append({**candidate, "status": status})
    return {"schemaVersion": 1, "actionable": actionable, "summary": summary}
