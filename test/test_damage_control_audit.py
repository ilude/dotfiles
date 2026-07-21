from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "shared" / "damage-control" / "audit.py"


def decision(
    timestamp: str,
    rule_id: str,
    user_decision: str,
    latency_ms: float,
    action_summary: str = "fixture",
) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "timestamp": timestamp,
        "client": "pi",
        "sessionId": "session",
        "tool": "bash",
        "ruleId": rule_id,
        "actionSummary": action_summary,
        "engineAction": "ask",
        "userDecision": user_decision,
        "latencyMs": latency_ms,
        "latencyKind": "exact",
    }


def test_cli_reports_all_three_proposal_classes_and_scrubs_samples(tmp_path: Path) -> None:
    log_dir = tmp_path / "logs"
    log_dir.mkdir()
    secret = "x" * 40
    rows = [
        decision(f"2026-07-{day:02d}T12:00:00Z", "noisy-rule", "approved", day * 10)
        for day in range(10, 14)
    ]
    rows.extend(
        [
            decision(
                "2026-07-14T12:00:00Z",
                "denied-rule",
                "denied",
                50,
                f"token={secret}",
            ),
            decision(
                "2026-07-15T12:00:00Z",
                "none",
                "denied_or_abandoned",
                75,
                "dangerous fixture",
            ),
        ]
    )
    (log_dir / "decisions-2026-07.jsonl").write_text(
        "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
    )
    policy = tmp_path / "policy.yaml"
    policy.write_text(
        """bashToolPatterns:
  - pattern: noisy-rule
    reason: noisy
  - pattern: denied-rule
    reason: denied
  - pattern: retired-rule
    reason: retired
""",
        encoding="utf-8",
    )
    output = tmp_path / "report.md"

    result = subprocess.run(
        [
            "python",
            str(SCRIPT),
            "--log-dir",
            str(log_dir),
            "--output",
            str(output),
            "--policy",
            str(policy),
            "--end-date",
            "2026-07-18",
            "--days",
            "14",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str(output)
    report = output.read_text(encoding="utf-8")
    assert "`noisy-rule` - 4 fires, 100.0% approved" in report
    assert "`denied-rule` - 1 denial evidence row(s)" in report
    assert "`none` - 1 denial evidence row(s)" in report
    assert "`retired-rule` - never fired in this window" in report
    assert "[REDACTED]" in report
    assert secret not in report
    assert "This report proposes changes only" in report


def test_claude_command_invokes_shared_proposer_only() -> None:
    command = (ROOT / "claude" / "commands" / "dc-audit.md").read_text(encoding="utf-8")

    assert "python ~/.dotfiles/shared/damage-control/audit.py" in command
    assert "Do not edit policy or apply any" in command
    assert "--apply" not in command


def test_cli_rejects_malformed_decision_rows(tmp_path: Path) -> None:
    log_dir = tmp_path / "logs"
    log_dir.mkdir()
    (log_dir / "decisions-2026-07.jsonl").write_text("{invalid}\n", encoding="utf-8")

    result = subprocess.run(
        [
            "python",
            str(SCRIPT),
            "--log-dir",
            str(log_dir),
            "--output",
            str(tmp_path / "report.md"),
            "--end-date",
            "2026-07-18",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "decisions-2026-07.jsonl:1" in result.stderr
