#!/usr/bin/env python
"""Deterministic noise/signal report for shared damage-control decisions."""

from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import yaml
from decision_log import sanitize_summary

MIN_NARROW_FIRES = 3
MIN_NARROW_APPROVAL_RATE = 0.95
MAX_PROPOSALS_PER_CLASS = 20
DENIAL_DECISIONS = {"denied", "denied_or_abandoned"}


@dataclass(frozen=True)
class RuleStats:
    rule_id: str
    fires: int
    approved: int
    denied: int
    decided: int
    approval_rate: float | None
    median_approval_ms: float | None


def parse_timestamp(value: object) -> datetime:
    if not isinstance(value, str):
        raise ValueError("decision timestamp must be a string")
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def load_decisions(log_dir: Path, start: datetime, end: datetime) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in sorted(log_dir.glob("decisions-????-??.jsonl")):
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
                timestamp = parse_timestamp(row.get("timestamp"))
            except (json.JSONDecodeError, TypeError, ValueError) as error:
                raise ValueError(f"{path}:{line_number}: {error}") from error
            if start <= timestamp < end:
                rows.append(row)
    return rows


def load_rule_inventory(policy_path: Path | None) -> list[str]:
    if policy_path is None:
        return []
    policy = yaml.safe_load(policy_path.read_text(encoding="utf-8")) or {}
    rules = []
    for entry in policy.get("bashToolPatterns", []):
        if isinstance(entry, dict) and isinstance(entry.get("pattern"), str):
            rules.append(entry["pattern"])
    for section in (
        "zeroAccessPaths",
        "readOnlyPaths",
        "noDeletePaths",
        "writeConfirmPaths",
        "readConfirmPaths",
    ):
        rules.extend(value for value in policy.get(section, []) if isinstance(value, str))
    return sorted(set(rules))


def summarize_rules(rows: Iterable[dict[str, Any]]) -> list[RuleStats]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get("ruleId") or "none")].append(row)
    result = []
    for rule_id, events in grouped.items():
        approved = sum(row.get("userDecision") == "approved" for row in events)
        denied = sum(row.get("userDecision") in DENIAL_DECISIONS for row in events)
        decided = approved + denied
        latencies = [
            float(row["latencyMs"])
            for row in events
            if row.get("userDecision") == "approved"
            and isinstance(row.get("latencyMs"), (int, float))
        ]
        result.append(
            RuleStats(
                rule_id=rule_id,
                fires=len(events),
                approved=approved,
                denied=denied,
                decided=decided,
                approval_rate=approved / decided if decided else None,
                median_approval_ms=statistics.median(latencies) if latencies else None,
            )
        )
    return sorted(result, key=lambda item: (-item.fires, item.rule_id))


def format_rate(rate: float | None) -> str:
    return "n/a" if rate is None else f"{rate * 100:.1f}%"


def format_latency(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.1f}"


def markdown_report(
    rows: list[dict[str, Any]],
    inventory: list[str],
    start: datetime,
    end: datetime,
) -> str:
    stats = summarize_rules(rows)
    fired = {item.rule_id for item in stats}
    narrow = [
        item
        for item in stats
        if item.fires >= MIN_NARROW_FIRES
        and item.decided > 0
        and item.approval_rate is not None
        and item.approval_rate >= MIN_NARROW_APPROVAL_RATE
        and item.denied == 0
    ][:MAX_PROPOSALS_PER_CLASS]
    strengthen = [item for item in stats if item.denied > 0 or item.rule_id == "none"][
        :MAX_PROPOSALS_PER_CLASS
    ]
    retire = [rule for rule in inventory if rule not in fired][:MAX_PROPOSALS_PER_CLASS]

    last_date = (end - timedelta(days=1)).date().isoformat()
    lines = [
        "# Damage-Control Noise/Signal Audit",
        "",
        f"Window: {start.date().isoformat()} through {last_date} (UTC)",
        f"Decision rows: {len(rows)}",
        f"Inventory rules: {len(inventory)}",
        "",
        "## Per-rule activity",
        "",
        "| Rule | Fires | Approved | Denial evidence | Approval rate | Median approval ms |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for item in stats:
        lines.append(
            f"| `{item.rule_id}` | {item.fires} | {item.approved} | {item.denied} | "
            f"{format_rate(item.approval_rate)} | {format_latency(item.median_approval_ms)} |"
        )
    if not stats:
        lines.append("| _none_ | 0 | 0 | 0 | n/a | n/a |")

    lines.extend(["", "## Narrow or allowlist candidates", ""])
    if narrow:
        for item in narrow:
            lines.append(
                f"- `{item.rule_id}` - {item.fires} fires, "
                f"{format_rate(item.approval_rate)} approved, median "
                f"{format_latency(item.median_approval_ms)} ms, no denial evidence"
            )
    else:
        lines.append("- None in this window.")

    lines.extend(["", "## Strengthen or add candidates", ""])
    if strengthen:
        for item in strengthen:
            summaries = sorted(
                {
                    sanitize_summary(str(row.get("actionSummary", "")))
                    for row in rows
                    if str(row.get("ruleId") or "none") == item.rule_id
                    and row.get("userDecision") in DENIAL_DECISIONS
                }
            )
            evidence = (
                f"; denial samples: {', '.join(f'`{value}`' for value in summaries[:3])}"
                if summaries
                else ""
            )
            lines.append(
                f"- `{item.rule_id}` - {item.denied} denial evidence row(s), "
                f"{item.fires} total fires{evidence}"
            )
    else:
        lines.append("- None in this window.")

    lines.extend(["", "## Retire candidates", ""])
    if retire:
        lines.extend(f"- `{rule}` - never fired in this window" for rule in retire)
    else:
        lines.append("- None in the supplied inventory.")

    lines.extend(
        [
            "",
            "## Coverage notes",
            "",
            f"- Window contains {len(rows)} decision row(s).",
            f"- Retire analysis covers {len(inventory)} supplied rule(s).",
            "- This report proposes changes only; it does not apply policy edits.",
            "",
        ]
    )
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--policy", type=Path)
    parser.add_argument("--end-date", required=True, help="exclusive UTC date, YYYY-MM-DD")
    parser.add_argument("--days", type=int, default=14)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    end = datetime.fromisoformat(args.end_date).replace(tzinfo=timezone.utc)
    if args.days < 1:
        raise ValueError("--days must be positive")
    start = end - timedelta(days=args.days)
    rows = load_decisions(args.log_dir, start, end)
    inventory = load_rule_inventory(args.policy)
    report = markdown_report(rows, inventory, start, end)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(report, encoding="utf-8", newline="\n")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
