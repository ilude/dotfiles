from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import duckdb
import pytest

import tool_failure_triage as triage
from tool_failure_triage import append_decision, build_report, load_ledger, scan_connection


def messages(filename: str = "/home/person/session.jsonl", timestamp: str = "2026-08-20T10:00:00Z"):
    cases = [
        ("c1", "bash", "Validation failed: 'command' is a required property"),
        ("c2", "read", "Selected skill path is outside the governed boundary"),
        ("c3", "subagent_write", "Unknown agent; available agents are stale"),
        ("c4", "bash", "tests failed with exit code 1"),
        ("c5", "bash", "blocked by policy damage control"),
    ]
    rows = []
    for index, (call_id, tool, error) in enumerate(cases):
        rows.extend(
            [
                (
                    filename,
                    f"call-{index}",
                    timestamp,
                    json.dumps(
                        {
                            "role": "assistant",
                            "content": [
                                {
                                    "type": "toolCall",
                                    "id": call_id,
                                    "name": tool,
                                    "arguments": {"private": "raw"},
                                }
                            ],
                        }
                    ),
                ),
                (
                    filename,
                    f"result-{index}",
                    timestamp,
                    json.dumps(
                        {
                            "role": "toolResult",
                            "toolCallId": call_id,
                            "isError": True,
                            "content": [{"type": "text", "text": error}],
                        }
                    ),
                ),
            ]
        )
    return rows


def connection_for(rows):
    connection = duckdb.connect(":memory:")
    connection.execute(
        "CREATE TABLE session_entries(filename VARCHAR, id VARCHAR, timestamp VARCHAR, message JSON, type VARCHAR)"
    )
    connection.executemany("INSERT INTO session_entries VALUES (?, ?, ?, ?, 'message')", rows)
    return connection


def test_tool_failure_scan_is_deterministic_private_and_diagnoses_joins():
    rows = messages()
    rows.append((rows[0][0], "duplicate", rows[0][2], rows[0][3]))
    rows.append(
        (
            rows[0][0],
            "unmatched",
            rows[0][2],
            json.dumps(
                {"role": "toolResult", "toolCallId": "missing", "isError": True, "content": []}
            ),
        )
    )
    first = scan_connection(connection_for(rows))
    changed = scan_connection(
        connection_for(
            list(reversed(messages("C:\\Users\\other\\renamed.jsonl", "2030-01-01T00:00:00Z")))
        )
    )

    assert {item["errorClass"] for item in first["candidates"]} >= {
        "missing-required-parameter",
        "governed-path-rejection",
        "stale-manager-contract",
        "nonzero-test",
        "safety-block",
    }
    assert sum(item["classification"] == "candidate" for item in first["candidates"]) == 3
    assert first["duplicateCalls"] == 1
    assert first["unmatchedResults"] == 1
    assert [item["candidateId"] for item in first["candidates"]] == [
        item["candidateId"] for item in changed["candidates"]
    ]
    rendered = json.dumps(first)
    assert "private" not in rendered
    assert "/home/person" not in rendered
    assert "C:\\Users" not in rendered


@pytest.mark.parametrize(
    ("tool", "text", "expected_class", "expected_contract", "classification"),
    [
        (
            "edit",
            "Loaded 2 AGENTS context file(s). Retry this edit call.",
            "instruction-deferred",
            "mutation:instruction-discovery",
            "expected",
        ),
        (
            "edit",
            "Could not find edits[0]. The oldText must match exactly.",
            "exact-match-miss",
            "mutation:exact-match",
            "expected",
        ),
        (
            "edit",
            "Found 3 occurrences of edits[0]. Each oldText must be unique.",
            "nonunique-match",
            "mutation:unique-match",
            "expected",
        ),
        (
            "read",
            "ENOENT: no such file or directory, access '/home/person/missing'",
            "path-not-found",
            "filesystem:path-missing",
            "expected",
        ),
        (
            "read",
            "Offset 20 is beyond end of file (10 lines total)",
            "invalid-offset",
            "read:offset-range",
            "expected",
        ),
        (
            "pwsh",
            "pwsh exited with code 2",
            "command-nonzero",
            "command:nonzero",
            "expected",
        ),
        (
            "commit_create",
            "Secret scan blocked the commit: private-key.",
            "secret-scan-block",
            "commit:secret-scan",
            "expected",
        ),
        (
            "task",
            "Validation failed for tool task: summary is required",
            "invalid-caller-contract",
            "caller:validation",
            "expected",
        ),
        (
            "subagent_control",
            "this.broker.reconcile is not a function",
            "internal-missing-method",
            "runtime:missing-method",
            "candidate",
        ),
        (
            "web_search",
            "fetch failed",
            "external-service-failure",
            "web-search:request",
            "candidate",
        ),
        (
            "subagent",
            "Cannot launch subagent: Pi CLI entrypoint is unavailable (missing)",
            "required-runtime-unavailable",
            "runtime:availability",
            "candidate",
        ),
        (
            "bash",
            "Command timed out after 30 seconds",
            "unclassified-error",
            "manual-review",
            "unclassified",
        ),
        (
            "subagent",
            "Subagent was aborted",
            "unclassified-error",
            "manual-review",
            "unclassified",
        ),
        (
            "task",
            "Valid runtime entered an impossible lifecycle state",
            "unclassified-error",
            "manual-review",
            "unclassified",
        ),
    ],
)
def test_classifies_only_exact_structural_contracts(
    tool, text, expected_class, expected_contract, classification
):
    assert triage._classify(tool, text) == (
        expected_class,
        expected_contract,
        classification,
    )


def test_materially_distinct_contracts_have_distinct_private_ids():
    exact = triage._candidate_id("edit", "exact-match-miss", "mutation:exact-match")
    nonunique = triage._candidate_id("edit", "nonunique-match", "mutation:unique-match")
    assert exact != nonunique


def test_material_fingerprint_version_change_creates_new_ids(monkeypatch):
    first = scan_connection(connection_for(messages()))
    monkeypatch.setattr(triage, "FINGERPRINT_VERSION", 2)
    second = scan_connection(connection_for(messages()))
    assert {item["candidateId"] for item in first["candidates"]}.isdisjoint(
        item["candidateId"] for item in second["candidates"]
    )


def candidate_scan(last: str = "2026-08-20T00:00:00Z", version: int = 1):
    return {
        "candidates": [
            {
                "candidateId": "tf-one",
                "fingerprintVersion": version,
                "lastObserved": last,
                "classification": "candidate",
            },
            {
                "candidateId": "tf-two",
                "fingerprintVersion": 1,
                "lastObserved": last,
                "classification": "candidate",
            },
        ]
    }


def test_append_only_decisions_latest_physical_order_and_actionable_states(tmp_path: Path):
    ledger = tmp_path / "decisions.jsonl"
    scan = candidate_scan()
    append_decision(
        ledger,
        scan,
        "tf-one",
        "skipped",
        "Known transient case",
        revisit_after="2026-09-01",
        decided_at="2030-01-01T00:00:00Z",
    )
    append_decision(
        ledger,
        scan,
        "tf-one",
        "skipped",
        "Reviewed again",
        revisit_after="2026-08-01",
        decided_at="2020-01-01T00:00:00Z",
    )
    append_decision(
        ledger,
        scan,
        "tf-two",
        "addressed",
        "Fixed parser contract",
        ["commit:abc123"],
        "2026-08-19",
    )
    records, diagnostics = load_ledger(ledger)
    report = build_report(scan, records, today=date(2026, 8, 24))
    assert diagnostics == []
    assert [item["status"] for item in report["actionable"]] == ["revisit-due", "regression"]
    assert len(records) == 3

    unchanged = candidate_scan(last="2026-08-19T00:00:00Z")
    suppressed = build_report(unchanged, records, today=date(2026, 7, 24))
    assert suppressed["actionable"] == []
    assert suppressed["summary"] == {
        "unchangedSkipped": 1,
        "resolved": 1,
        "expectedSuppressed": 0,
    }
    changed = build_report(candidate_scan(version=2), records, today=date(2026, 7, 24))
    assert changed["actionable"][0]["status"] == "changed"


def test_expected_candidates_are_suppressed_but_diagnosable():
    scan = {
        "candidates": [
            {
                "candidateId": "expected",
                "fingerprintVersion": 1,
                "lastObserved": "2026-08-20T00:00:00Z",
                "classification": "expected",
            },
            {
                "candidateId": "internal",
                "fingerprintVersion": 1,
                "lastObserved": "2026-08-20T00:00:00Z",
                "classification": "candidate",
            },
        ]
    }
    default = build_report(scan, [])
    assert [item["candidateId"] for item in default["actionable"]] == ["internal"]
    assert default["summary"] == {
        "unchangedSkipped": 0,
        "resolved": 0,
        "expectedSuppressed": 1,
    }

    diagnostic = build_report(scan, [], include_expected=True)
    assert [(item["candidateId"], item["status"]) for item in diagnostic["actionable"]] == [
        ("expected", "expected"),
        ("internal", "undecided"),
    ]
    assert diagnostic["summary"]["expectedSuppressed"] == 0


def test_regression_precedes_expected_suppression():
    scan = {
        "candidates": [
            {
                "candidateId": "expected",
                "fingerprintVersion": 1,
                "lastObserved": "2026-08-21T00:00:00Z",
                "classification": "expected",
            }
        ]
    }
    decision = {
        "candidateId": "expected",
        "fingerprintVersion": 1,
        "disposition": "addressed",
        "effectiveAfter": "2026-08-20",
    }
    report = build_report(scan, [decision])
    assert report["actionable"][0]["status"] == "regression"
    assert report["summary"]["expectedSuppressed"] == 0


def test_ledger_concurrent_writers_preserve_records_and_diagnose_bad_rows(tmp_path: Path):
    ledger = tmp_path / "decisions.jsonl"
    scan = candidate_scan()

    def write(index: int):
        append_decision(ledger, scan, "tf-one", "skipped", f"Reviewed case {index}")

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(write, range(20)))
    with ledger.open("a", encoding="utf-8") as handle:
        handle.write("not-json\n")
        handle.write('{"schemaVersion":99}\n')
    records, diagnostics = load_ledger(ledger)
    assert len(records) == 20
    assert diagnostics == [
        {"line": 21, "error": "malformed"},
        {"line": 22, "error": "unsupported-schema"},
    ]


def test_decisions_reject_unknown_invalid_and_sensitive_content(tmp_path: Path):
    ledger = tmp_path / "decisions.jsonl"
    scan = candidate_scan()
    with pytest.raises(ValueError, match="unknown candidate"):
        append_decision(ledger, scan, "missing", "skipped", "reason")
    with pytest.raises(ValueError, match="require typed evidence"):
        append_decision(ledger, scan, "tf-one", "addressed", "fixed")
    for unsafe in (
        "password=mine",
        "/home/person/private",
        "C:\\Users\\person\\private",
        "raw\noutput",
    ):
        with pytest.raises(ValueError, match="prohibited"):
            append_decision(ledger, scan, "tf-one", "skipped", unsafe)
    assert not ledger.exists()
