from __future__ import annotations

import collections
import importlib.util
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "pi" / "scripts" / "improvement-report.py"


def load_report() -> ModuleType:
    spec = importlib.util.spec_from_file_location("improvement_report", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def report() -> ModuleType:
    return load_report()


def sampled_event(arm: str, status: str, duration: int, tokens: int, cost: float | None) -> dict:
    return {
        "event": "orchestration_run",
        "data": {
            "workers": [
                {
                    "experimentArm": arm,
                    "status": status,
                    "durationMs": duration,
                    "usage": {
                        "processedTokens": tokens,
                        "costUsd": cost,
                    },
                }
            ]
        },
    }


def test_percentile_uses_nearest_rank(report: ModuleType) -> None:
    assert report.percentile([40, 10, 30, 20], 0.5) == 20
    assert report.percentile([40, 10, 30, 20], 0.9) == 40
    assert report.percentile([], 0.5) is None


def test_routing_aggregation_computes_quality_speed_tokens_and_known_cost(
    report: ModuleType,
) -> None:
    events = [
        sampled_event("luna-high", "completed", 100, 1_000, 0.2),
        sampled_event("luna-high", "failed", 300, 3_000, None),
        sampled_event("luna-high", "completed", 200, 2_000, 0.4),
    ]

    cell = report.aggregate_routing(events)[0]

    assert cell.arm == "luna-high"
    assert cell.runs == 3
    assert cell.successes == 2
    assert cell.p50_duration_ms == 200
    assert cell.p90_duration_ms == 300
    assert cell.median_processed_tokens == 2_000
    assert cell.known_cost_usd == pytest.approx(0.6)
    assert cell.known_cost_runs == 2


def test_render_is_deletions_first_and_refuses_small_cell_conclusions(report: ModuleType) -> None:
    cell = report.RoutingCell("sol-low", 2, 2, 100, 120, 500, 0.1, 2)
    markdown = report.render_report(
        report_date=report.dt.date(2026, 7, 17),
        cutoff=None,
        routing=[cell],
        friction=[report.FrictionHit("session.jsonl", ("you keep",), 2)],
        command_counts=collections.Counter({"do-it": 2}),
        known_commands={"do-it", "unused-command"},
        skill_counts=collections.Counter({"planning": 1}),
        agent_counts=collections.Counter({"validator": 3}),
        lint=[(".specs/plan/plan.md", True, [])],
        hygiene=[(".specs/old", report.dt.date(2026, 4, 1), 107)],
        coverage=["Missing session corpus"],
        audit_present=True,
    )

    headings = [
        "## Proposed deletions and consolidations",
        "## Routing outcomes",
        "## Friction patterns",
        "## Noise and signal candidates",
        "## `.specs/` hygiene",
        "## Data coverage notes",
    ]
    assert [markdown.index(heading) for heading in headings] == sorted(
        markdown.index(heading) for heading in headings
    )
    assert "insufficient n<30" in markdown
    assert "Consolidate or retire unused command `/unused-command`" in markdown
    assert "Workflow mechanics and handoff ambiguity: **resolved**" in markdown


def test_session_scan_counts_slash_echo_custom_messages(
    report: ModuleType,
    tmp_path: Path,
) -> None:
    session = tmp_path / "session.jsonl"
    rows = [
        {
            "type": "custom_message",
            "customType": "slash-echo",
            "content": "/do-it .specs/example/plan.md",
            "timestamp": "2026-07-17T12:00:00Z",
        },
        {
            "type": "message",
            "message": {"role": "user", "content": "/context"},
            "timestamp": "2026-07-17T12:01:00Z",
        },
        {
            "type": "custom_message",
            "customType": "other",
            "content": "/ignored",
            "timestamp": "2026-07-17T12:02:00Z",
        },
    ]
    session.write_text(
        "".join(f"{report.json.dumps(row)}\n" for row in rows),
        encoding="utf-8",
    )

    friction, commands = report.scan_sessions(tmp_path, None)

    assert friction == []
    assert commands == collections.Counter({"do-it": 1, "context": 1})


def test_repository_wrapper_generates_report_end_to_end(tmp_path: Path) -> None:
    (tmp_path / ".specs").mkdir()
    for name in ["metrics", "sessions", "friction"]:
        (tmp_path / name).mkdir()
    output = tmp_path / "report.md"

    result = subprocess.run(
        [
            "python",
            str(ROOT / "scripts" / "improvement-report"),
            "--repo",
            str(tmp_path),
            "--metrics-dir",
            str(tmp_path / "metrics"),
            "--sessions-dir",
            str(tmp_path / "sessions"),
            "--friction-dir",
            str(tmp_path / "friction"),
            "--output",
            str(output),
            "--date",
            "2026-07-17",
        ],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str(output.resolve())
    assert output.read_text(encoding="utf-8").startswith(
        "# Harness Improvement Report - 2026-07-17"
    )


def test_absent_sources_are_coverage_notes_not_errors(report: ModuleType, tmp_path: Path) -> None:
    coverage = [
        f"Missing orchestration and usage metrics at `{tmp_path / 'metrics'}`",
        f"Missing session corpus at `{tmp_path / 'sessions'}`",
    ]

    markdown = report.render_report(
        report_date=report.dt.date(2026, 7, 17),
        cutoff=None,
        routing=[],
        friction=[],
        command_counts=collections.Counter(),
        known_commands=set(),
        skill_counts=collections.Counter(),
        agent_counts=collections.Counter(),
        lint=[],
        hygiene=[],
        coverage=coverage,
        audit_present=False,
    )

    assert "no sampled cells" in markdown
    assert "No friction signals observed" in markdown
    assert all(note in markdown for note in coverage)
