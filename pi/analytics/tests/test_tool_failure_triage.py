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
            "task",
            "scope entries must be worktree-relative",
            "task-boundary-rejected",
            "task:boundary-path",
            "expected",
        ),
        (
            "task",
            "Validation failed for tool task: instructions: must not have more than 500 characters",
            "task-instructions-too-long",
            "task:instructions-length",
            "expected",
        ),
        (
            "plan_progress",
            "Plan contract validation failed: Missing Validation",
            "plan-not-ready",
            "plan:readiness",
            "expected",
        ),
        (
            "subagent",
            "Validation failed for tool subagent: agent: must be equal to one of the allowed values",
            "requested-agent-unavailable",
            "subagent:agent-availability",
            "expected",
        ),
        (
            "subagent",
            "Subagent was aborted",
            "operation-aborted",
            "subagent:aborted",
            "expected",
        ),
        (
            "subagent",
            "Agent failed: Error: Failed to load extension x: ParseError",
            "extension-load-failure",
            "subagent:extension-load",
            "candidate",
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
            "command-timeout",
            "command:timeout",
            "expected",
        ),
        (
            "pwsh",
            "Command timed out after 30s",
            "command-timeout",
            "command:timeout",
            "expected",
        ),
        (
            "bash",
            "Blocked unsafe shell edit (matched unsafe_shell_edit)",
            "safety-block",
            "policy:block",
            "expected",
        ),
        (
            "bash",
            '{"outcome":"needs_approval","message":"Operator approval is required"}',
            "approval-required",
            "policy:approval",
            "expected",
        ),
        (
            "bash",
            "partial command output\nCommand aborted",
            "command-aborted",
            "command:aborted",
            "expected",
        ),
        (
            "bash",
            "Working directory does not exist: C:/missing. Cannot execute bash commands.",
            "path-not-found",
            "filesystem:path-missing",
            "expected",
        ),
        (
            "bash",
            "Tool bash not found",
            "required-runtime-unavailable",
            "runtime:availability",
            "candidate",
        ),
        (
            "bash",
            "TypeError: ctx.sessionManager.getSessionId is not a function\nCommand exited with code 1",
            "command-nonzero",
            "command:nonzero",
            "expected",
        ),
        (
            "pwsh",
            "pwsh exited with code 1: getSessionFile is not a function",
            "command-nonzero",
            "command:nonzero",
            "expected",
        ),
        (
            "bash",
            "ctx.sessionManager.getSessionId is not a function",
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


def _failure_rows(timestamps: list[str], text: str = "this.broker.reconcile is not a function"):
    rows = []
    for index, timestamp in enumerate(timestamps):
        call_id = f"call-{index}"
        rows.extend(
            [
                (
                    "/session.jsonl",
                    f"call-entry-{index}",
                    timestamp,
                    json.dumps(
                        {
                            "role": "assistant",
                            "content": [
                                {"type": "toolCall", "id": call_id, "name": "subagent_control"}
                            ],
                        }
                    ),
                ),
                (
                    "/session.jsonl",
                    f"result-entry-{index}",
                    timestamp,
                    json.dumps(
                        {
                            "role": "toolResult",
                            "toolCallId": call_id,
                            "isError": True,
                            "content": [{"type": "text", "text": text}],
                        }
                    ),
                ),
            ]
        )
    return rows


def test_scan_uses_inclusive_utc_windows_and_rejects_untrusted_timestamps():
    rows = _failure_rows(
        [
            "2026-08-24T00:00:00-04:00",  # exactly asOf
            "2026-08-17T04:00:00Z",  # exactly seven days
            "2026-08-16T23:59:59Z",  # outside seven days
            "not-a-timestamp",
            "2026-08-25T00:00:00Z",
        ]
    )
    scan = scan_connection(connection_for(rows), as_of="2026-08-24T04:00:00Z")
    candidate = scan["candidates"][0]
    assert candidate["occurrences7d"] == 2
    assert candidate["sessions7d"] == 1
    assert candidate["occurrences14d"] == 3
    assert candidate["occurrences30d"] == 3
    assert candidate["firstObserved"] == "2026-08-16T23:59:59Z"
    assert candidate["lastObserved"] == "2026-08-24T04:00:00Z"
    assert scan["timestampDiagnostics"] == {"missing": 0, "malformed": 1, "future": 1}
    assert scan["timestampOmissions"] == 2


def test_recent_gate_thresholds_and_staleness_do_not_use_lifetime_volume():
    scan = {
        "candidates": [
            {
                "candidateId": "internal",
                "fingerprintVersion": 1,
                "errorClass": "internal-missing-method",
                "classification": "candidate",
                "occurrences": 99,
                "occurrences14d": 0,
                "sessions14d": 0,
                "occurrences30d": 1,
                "lastObserved": "2026-08-24T00:00:00Z",
            },
            {
                "candidateId": "unknown",
                "fingerprintVersion": 1,
                "errorClass": "unclassified-error",
                "classification": "unclassified",
                "occurrences14d": 0,
                "sessions14d": 0,
                "occurrences30d": 1,
                "lastObserved": "2026-08-24T00:00:00Z",
            },
            {
                "candidateId": "stale",
                "fingerprintVersion": 1,
                "errorClass": "external-service-failure",
                "classification": "candidate",
                "occurrences": 99,
                "occurrences30d": 0,
                "lastObserved": None,
            },
        ]
    }
    report = build_report(scan, [])
    assert [item["candidateId"] for item in report["actionable"]] == ["unknown"]
    assert report["actionable"][0]["gate"] == "unclassified-review"


@pytest.mark.parametrize(
    ("error_class", "classification", "counts", "expected_gate"),
    [
        (
            "internal-missing-method",
            "candidate",
            {"occurrences14d": 0, "occurrences30d": 1},
            "below-threshold",
        ),
        (
            "internal-missing-method",
            "candidate",
            {"occurrences14d": 1, "occurrences30d": 1},
            "internal-contract-defect",
        ),
        (
            "required-runtime-unavailable",
            "candidate",
            {"sessions14d": 1, "occurrences30d": 1},
            "below-threshold",
        ),
        (
            "required-runtime-unavailable",
            "candidate",
            {"sessions14d": 2, "occurrences30d": 2},
            "runtime-unavailable",
        ),
        (
            "external-service-failure",
            "candidate",
            {"sessions7d": 3, "occurrences30d": 3},
            "external-failure",
        ),
        (
            "external-service-failure",
            "candidate",
            {"sessions7d": 2, "sessions30d": 9, "occurrences30d": 9},
            "below-threshold",
        ),
        (
            "external-service-failure",
            "candidate",
            {"sessions7d": 2, "sessions30d": 10, "occurrences30d": 10},
            "external-failure",
        ),
        (
            "other-classified",
            "candidate",
            {"occurrences14d": 3, "sessions14d": 1, "occurrences30d": 3},
            "below-threshold",
        ),
        (
            "other-classified",
            "candidate",
            {"occurrences14d": 3, "sessions14d": 2, "occurrences30d": 3},
            "classified-recurrence",
        ),
        ("unclassified-error", "unclassified", {"occurrences30d": 1}, "unclassified-review"),
    ],
)
def test_recent_gate_edges(error_class, classification, counts, expected_gate):
    candidate = {
        "candidateId": "edge",
        "errorClass": error_class,
        "classification": classification,
        "occurrences7d": 0,
        "sessions7d": 0,
        "occurrences14d": 0,
        "sessions14d": 0,
        "occurrences30d": 0,
        "sessions30d": 0,
        **counts,
    }
    assert triage._gate_reason(candidate, "undecided") == expected_gate


def test_investigation_pool_has_allowlisted_bounded_cards_and_reserved_tiers():
    candidates = []
    for index in range(12):
        candidates.append(
            {
                "candidateId": f"candidate-{index:02d}",
                "fingerprintVersion": 1,
                "tool": "subagent_control",
                "errorClass": "internal-missing-method",
                "classification": "candidate",
                "status": "undecided",
                "lastObserved": "2026-08-24T00:00:00Z",
                "occurrences14d": 2,
                "sessions14d": 2,
                "occurrences30d": 2,
            }
        )
    report = {"actionable": candidates, "summary": {}, "timestampOmissions": 0}
    pool = triage.build_investigation_pool(report, include_overflow=True)
    assert len(pool["cards"]) == 10
    assert len(pool["overflow"]) == 2
    assert set(pool["cards"][0]) == {
        "candidateId",
        "tool",
        "structuralLabel",
        "reasonCode",
        "lastObserved",
        "gateWindow",
        "occurrences",
        "sessions",
        "explanation",
    }
    assert all(len(card["explanation"]) <= 160 for card in pool["cards"])


def test_investigation_pool_reserves_capacity_across_all_tiers():
    candidates = []
    cases = [
        ("ledger", "internal-missing-method", "changed", 0, 1, 1),
        ("internal", "internal-missing-method", "undecided", 0, 1, 1),
        ("friction", "missing-required-parameter", "undecided", 0, 3, 3),
        ("external", "external-service-failure", "undecided", 3, 3, 3),
    ]
    for prefix, error_class, status, sessions7d, sessions14d, occurrences14d in cases:
        for index in range(5):
            candidates.append(
                {
                    "candidateId": f"{prefix}-{index}",
                    "tool": "tool",
                    "errorClass": error_class,
                    "classification": "candidate",
                    "status": status,
                    "lastObserved": "2026-08-24T00:00:00Z",
                    "occurrences7d": sessions7d,
                    "sessions7d": sessions7d,
                    "occurrences14d": occurrences14d,
                    "sessions14d": sessions14d,
                    "occurrences30d": max(occurrences14d, 1),
                    "sessions30d": max(sessions14d, 1),
                }
            )
    pool = triage.build_investigation_pool({"actionable": candidates, "summary": {}})
    prefixes = [card["candidateId"].split("-")[0] for card in pool["cards"]]
    assert prefixes.count("ledger") == 3
    assert prefixes.count("internal") == 3
    assert prefixes.count("friction") == 2
    assert prefixes.count("external") == 2
    assert prefixes == sorted(prefixes, key=["ledger", "internal", "friction", "external"].index)
    assert pool["summary"]["omittedByCardLimit"] == 10


def test_expected_recurring_friction_enters_pool_without_include_expected():
    candidate = {
        "candidateId": "friction",
        "fingerprintVersion": 1,
        "tool": "edit",
        "errorClass": "exact-match-miss",
        "classification": "expected",
        "lastObserved": "2026-08-24T00:00:00Z",
        "occurrences14d": 4,
        "sessions14d": 3,
        "occurrences30d": 4,
        "sessions30d": 3,
    }
    report = build_report({"candidates": [candidate]}, [])

    assert report["actionable"] == []
    assert report["summary"]["expectedSuppressed"] == 1
    pool = triage.build_investigation_pool(report)
    assert [(card["candidateId"], card["reasonCode"]) for card in pool["cards"]] == [
        ("friction", "retry-ceremony")
    ]


def test_instruction_discovery_does_not_enter_default_pool():
    candidate = {
        "candidateId": "instruction-discovery",
        "fingerprintVersion": 1,
        "tool": "text_edit",
        "errorClass": "instruction-deferred",
        "classification": "expected",
        "lastObserved": "2026-08-24T00:00:00Z",
        "occurrences14d": 12,
        "sessions14d": 8,
        "occurrences30d": 12,
        "sessions30d": 8,
    }
    report = build_report({"candidates": [candidate]}, [])

    assert triage.build_investigation_pool(report)["cards"] == []


def test_expected_normal_shell_outcomes_do_not_enter_default_pool():
    candidates = []
    for index, error_class in enumerate(
        (
            "command-nonzero",
            "nonzero-test",
            "command-timeout",
            "command-aborted",
            "approval-required",
            "safety-block",
            "path-not-found",
        )
    ):
        candidates.append(
            {
                "candidateId": f"normal-{index}",
                "tool": "bash",
                "errorClass": error_class,
                "classification": "expected",
                "lastObserved": "2026-08-24T00:00:00Z",
                "occurrences14d": 100,
                "sessions14d": 50,
                "occurrences30d": 100,
                "sessions30d": 50,
            }
        )
    report = build_report({"candidates": candidates}, [])

    assert triage.build_investigation_pool(report)["cards"] == []
    assert len(triage.build_investigation_pool(report, include_expected=True)["cards"]) == 7


def test_tool_filter_excludes_builtins_before_ranking_and_summary():
    scan = {
        "candidates": [
            {
                "candidateId": "builtin-edit",
                "tool": "edit",
                "fingerprintVersion": 1,
                "errorClass": "exact-match-miss",
                "classification": "expected",
                "lastObserved": "2026-08-24T00:00:00Z",
                "occurrences14d": 500,
                "sessions14d": 200,
                "occurrences30d": 500,
                "sessions30d": 200,
            },
            {
                "candidateId": "custom-control",
                "tool": "subagent_control",
                "fingerprintVersion": 1,
                "errorClass": "internal-missing-method",
                "classification": "candidate",
                "lastObserved": "2026-08-24T00:00:00Z",
                "occurrences14d": 1,
                "sessions14d": 1,
                "occurrences30d": 1,
                "sessions30d": 1,
            },
        ]
    }
    report = build_report(scan, [], tool_names={"subagent_control"})
    pool = triage.build_investigation_pool(report)

    assert report["toolFilter"] == ["subagent_control"]
    assert report["summary"]["expectedSuppressed"] == 0
    assert [card["candidateId"] for card in pool["cards"]] == ["custom-control"]


def test_observed_recovery_is_neutral_and_excludes_coordinates():
    candidate = {
        "candidateId": "stale",
        "fingerprintVersion": 1,
        "tool": "bash",
        "errorClass": "external-service-failure",
        "classification": "candidate",
        "lastObserved": "2026-01-01T00:00:00Z",
        "occurrences30d": 0,
        "sessions30d": 0,
        "coordinates": ["private-coordinate"],
    }
    report = build_report({"candidates": [candidate]}, [])
    pool = triage.build_investigation_pool(report, include_observed=True)

    assert pool["cards"] == []
    assert pool["observed"] == [
        {
            "candidateId": "stale",
            "tool": "bash",
            "structuralLabel": "external-service-failure",
            "lastObserved": "2026-01-01T00:00:00Z",
            "observationReason": "stale",
            "occurrences30d": 0,
            "sessions30d": 0,
        }
    ]
