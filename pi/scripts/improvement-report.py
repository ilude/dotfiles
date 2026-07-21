#!/usr/bin/env python
"""Generate the deterministic harness improvement report."""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import gzip
import json
import math
import re
import subprocess
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

FRICTION_SIGNALS = re.compile(
    r"\b(wtf|fuck\w*|shit|damn\w*|stop\b|no no|why did you|why are you|"
    r"i never asked|i did not ask|i didn'?t ask|churn|bullshit|useless|"
    r"what are you doing|not what i|i told you|you ignored|you keep|again\?|"
    r"do not do that|don't do that|undo that|revert that|wrong again|listen\b|"
    r"pay attention|frustrat\w*|annoy\w*|waste of|wasting)\b",
    re.IGNORECASE,
)
COMMAND_RE = re.compile(r"^/([a-z][a-z0-9-]*)\b")
REGISTER_COMMAND_RE = re.compile(r'registerCommand\(\s*["\']([a-z][a-z0-9-]*)["\']')
PLAN_LINT_VIOLATION_RE = re.compile(r"^[a-z][a-z0-9-]*:\d+: ")
MAX_METRICS_BYTES = 256 * 1024 * 1024
MIN_ROUTING_CONCLUSION_RUNS = 30


@dataclass(frozen=True)
class RoutingCell:
    arm: str
    runs: int
    successes: int
    p50_duration_ms: int | None
    p90_duration_ms: int | None
    median_processed_tokens: int | None
    known_cost_usd: float
    known_cost_runs: int


@dataclass(frozen=True)
class FrictionHit:
    session: str
    signals: tuple[str, ...]
    count: int


def parse_time(value: object) -> dt.datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)


def percentile(values: Iterable[int], quantile: float) -> int | None:
    ordered = sorted(values)
    if not ordered:
        return None
    index = max(0, math.ceil(quantile * len(ordered)) - 1)
    return ordered[index]


def jsonl_records(
    paths: Iterable[Path],
    max_bytes: int = MAX_METRICS_BYTES,
) -> Iterator[dict[str, object]]:
    consumed = 0
    for path in sorted(paths):
        size = path.stat().st_size
        if consumed + size > max_bytes:
            break
        consumed += size
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8", errors="replace") as stream:
            for line in stream:
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(value, dict):
                    yield value


def aggregate_routing(events: Iterable[dict[str, object]]) -> list[RoutingCell]:
    grouped: dict[str, list[dict[str, object]]] = collections.defaultdict(list)
    for event in events:
        if event.get("event") != "orchestration_run":
            continue
        data = event.get("data")
        if not isinstance(data, dict):
            continue
        workers = data.get("workers")
        if not isinstance(workers, list):
            continue
        for worker in workers:
            if not isinstance(worker, dict):
                continue
            arm = worker.get("experimentArm")
            if isinstance(arm, str):
                grouped[arm].append(worker)

    cells: list[RoutingCell] = []
    for arm, workers in sorted(grouped.items()):
        durations = [
            int(worker["durationMs"])
            for worker in workers
            if isinstance(worker.get("durationMs"), (int, float))
        ]
        tokens: list[int] = []
        known_cost = 0.0
        known_cost_runs = 0
        for worker in workers:
            usage = worker.get("usage")
            if not isinstance(usage, dict):
                continue
            processed = usage.get("processedTokens")
            if isinstance(processed, (int, float)):
                tokens.append(int(processed))
            cost = usage.get("costUsd")
            if isinstance(cost, (int, float)):
                known_cost += float(cost)
                known_cost_runs += 1
        cells.append(
            RoutingCell(
                arm=arm,
                runs=len(workers),
                successes=sum(worker.get("status") == "completed" for worker in workers),
                p50_duration_ms=percentile(durations, 0.5),
                p90_duration_ms=percentile(durations, 0.9),
                median_processed_tokens=percentile(tokens, 0.5),
                known_cost_usd=known_cost,
                known_cost_runs=known_cost_runs,
            )
        )
    return cells


def text_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    return " ".join(
        part.get("text", "")
        for part in content
        if isinstance(part, dict) and part.get("type") == "text"
    )


def scan_sessions(
    sessions_dir: Path,
    cutoff: dt.datetime | None,
) -> tuple[list[FrictionHit], collections.Counter[str]]:
    hits: list[FrictionHit] = []
    commands: collections.Counter[str] = collections.Counter()
    paths = list(sessions_dir.rglob("*.jsonl")) + list(sessions_dir.rglob("*.jsonl.gz"))
    for path in sorted(set(paths)):
        signal_counts: collections.Counter[str] = collections.Counter()
        for entry in jsonl_records([path]):
            timestamp = parse_time(entry.get("timestamp"))
            if cutoff and timestamp and timestamp < cutoff:
                continue
            if entry.get("type") == "custom_message" and entry.get("customType") == "slash-echo":
                slash_text = entry.get("content")
                if isinstance(slash_text, str) and len(slash_text) <= 3_000:
                    command = COMMAND_RE.match(slash_text.strip())
                    if command:
                        commands[command.group(1)] += 1
                continue
            if entry.get("type") != "message":
                continue
            message = entry.get("message")
            if not isinstance(message, dict) or message.get("role") != "user":
                continue
            text = text_content(message.get("content")).strip()
            if not text or len(text) > 3_000:
                continue
            command = COMMAND_RE.match(text)
            if command:
                commands[command.group(1)] += 1
            for match in FRICTION_SIGNALS.finditer(text):
                signal_counts[match.group(0).lower()] += 1
            if len(text) > 5 and text.upper() == text and re.search(r"[A-Z]{4,}", text):
                signal_counts["ALLCAPS"] += 1
        if signal_counts:
            hits.append(
                FrictionHit(
                    session=path.name,
                    signals=tuple(sorted(signal_counts)),
                    count=sum(signal_counts.values()),
                )
            )
    return sorted(hits, key=lambda hit: (-hit.count, hit.session)), commands


def discover_commands(repo: Path) -> set[str]:
    commands: set[str] = set()
    for path in sorted((repo / "pi" / "extensions").glob("*.ts")):
        commands.update(REGISTER_COMMAND_RE.findall(path.read_text(encoding="utf-8")))
    commands.update(path.stem for path in (repo / "pi" / "prompts").glob("*.md"))
    return commands


def usage_counts(
    events: Iterable[dict[str, object]],
) -> tuple[collections.Counter[str], collections.Counter[str]]:
    skills: collections.Counter[str] = collections.Counter()
    agents: collections.Counter[str] = collections.Counter()
    for event in events:
        data = event.get("data")
        if not isinstance(data, dict):
            continue
        if event.get("event") == "skill_invoked":
            name = data.get("skill") or data.get("name")
            if isinstance(name, str):
                skills[name] += 1
        if event.get("event") == "orchestration_run":
            workers = data.get("workers")
            if isinstance(workers, list):
                for worker in workers:
                    if isinstance(worker, dict) and isinstance(worker.get("agent"), str):
                        agents[str(worker["agent"])] += 1
    return skills, agents


def last_report_cutoff(report_dir: Path, report_date: dt.date) -> dt.datetime | None:
    dates: list[dt.date] = []
    for path in report_dir.glob("????-??-??.md"):
        try:
            value = dt.date.fromisoformat(path.stem)
        except ValueError:
            continue
        if value < report_date:
            dates.append(value)
    if not dates:
        return None
    return dt.datetime.combine(max(dates), dt.time.min, tzinfo=dt.timezone.utc)


def plan_lint_results(repo: Path) -> list[tuple[str, bool, list[str]]]:
    script = repo / "pi" / "scripts" / "plan-lint"
    results: list[tuple[str, bool, list[str]]] = []
    for plan in sorted(repo.glob(".specs/*/plan.md")):
        result = subprocess.run(
            ["python", str(script), str(plan), "--repo", str(repo)],
            cwd=repo,
            capture_output=True,
            check=False,
            text=True,
        )
        lines = [line for line in result.stdout.splitlines() if PLAN_LINT_VIOLATION_RE.match(line)][
            :5
        ]
        results.append((plan.relative_to(repo).as_posix(), result.returncode == 0, lines))
    return results


def git_last_touch(repo: Path, target: Path) -> dt.date | None:
    result = subprocess.run(
        ["git", "-C", str(repo), "log", "-1", "--format=%cs", "--", str(target)],
        capture_output=True,
        check=False,
        text=True,
    )
    value = result.stdout.strip()
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        return None


def specs_hygiene(repo: Path, report_date: dt.date) -> list[tuple[str, dt.date, int]]:
    specs = repo / ".specs"
    rows: list[tuple[str, dt.date, int]] = []
    for target in sorted(path for path in specs.iterdir() if path.is_dir()):
        if target.name in {"archive", "improvement-reports"}:
            continue
        touched = git_last_touch(repo, target)
        if touched is None:
            continue
        age = (report_date - touched).days
        if age >= 60:
            rows.append((target.relative_to(repo).as_posix(), touched, age))
    return rows


def fmt_number(value: int | None) -> str:
    return "unknown" if value is None else str(value)


def render_report(
    report_date: dt.date,
    cutoff: dt.datetime | None,
    routing: list[RoutingCell],
    friction: list[FrictionHit],
    command_counts: collections.Counter[str],
    known_commands: set[str],
    skill_counts: collections.Counter[str],
    agent_counts: collections.Counter[str],
    lint: list[tuple[str, bool, list[str]]],
    hygiene: list[tuple[str, dt.date, int]],
    coverage: list[str],
    audit_present: bool,
) -> str:
    unused_commands = sorted(command for command in known_commands if command_counts[command] == 0)
    deletion_candidates = [
        f"Consolidate or retire unused command `/{name}`" for name in unused_commands[:5]
    ]
    deletion_candidates.extend(
        f"Archive or revive dormant spec `{path}` ({age} days since {touched})"
        for path, touched, age in hygiene[:5]
    )
    addition_candidates = [note for note in coverage if note.startswith("Missing")][:3]
    if len(deletion_candidates) < len(addition_candidates):
        addition_candidates = addition_candidates[: len(deletion_candidates)]

    lines = [
        f"# Harness Improvement Report - {report_date.isoformat()}",
        "",
        (
            "All counts below are computed from local files. Proposals require "
            "a separate user-approved slice."
        ),
        "",
        "## Proposed deletions and consolidations",
        "",
    ]
    if deletion_candidates:
        lines.extend(
            f"- {item}. Evidence: usage counts or `.specs/` hygiene below."
            for item in deletion_candidates
        )
    else:
        lines.append("- No evidence-backed deletion or consolidation candidate in this window.")
    lines.extend(["", "### Addition candidates", ""])
    if addition_candidates:
        lines.extend(f"- {item}." for item in addition_candidates)
    else:
        lines.append("- None. Collection gaps remain coverage notes, not automatic build requests.")

    lines.extend(
        [
            "",
            "### Usage counts",
            "",
            f"Window start: `{cutoff.isoformat() if cutoff else 'all available local history'}`.",
            "",
            "Commands: "
            + (
                ", ".join(f"/{name}={count}" for name, count in command_counts.most_common(20))
                or "no invocations observed"
            ),
            "",
            "Skills: "
            + (
                ", ".join(f"{name}={count}" for name, count in skill_counts.most_common(20))
                or "no `skill_invoked` metrics observed"
            ),
            "",
            "Agents: "
            + (
                ", ".join(f"{name}={count}" for name, count in agent_counts.most_common(20))
                or "no sampled orchestration workers observed"
            ),
            "",
            "## Routing outcomes",
            "",
            (
                "| Arm | n | Success | p50 ms | p90 ms | Median processed "
                "tokens | Known cost | Conclusion |"
            ),
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
        ]
    )
    if routing:
        for cell in routing:
            conclusion = (
                "insufficient n<30"
                if cell.runs < MIN_ROUTING_CONCLUSION_RUNS
                else "eligible for comparison"
            )
            lines.append(
                f"| {cell.arm} | {cell.runs} | {cell.successes / cell.runs:.1%} | "
                f"{fmt_number(cell.p50_duration_ms)} | {fmt_number(cell.p90_duration_ms)} | "
                f"{fmt_number(cell.median_processed_tokens)} | ${cell.known_cost_usd:.6f} "
                f"({cell.known_cost_runs}/{cell.runs}) | {conclusion} |"
            )
    else:
        lines.append(
            "| no sampled cells | 0 | unknown | unknown | unknown | unknown | "
            "unknown | insufficient n<30 |"
        )

    lines.extend(["", "## Friction patterns", ""])
    if friction:
        totals: collections.Counter[str] = collections.Counter()
        for hit in friction:
            totals.update({signal: 1 for signal in hit.signals})
        lines.append(
            "Pattern sessions: "
            + ", ".join(f"{signal}={count}" for signal, count in totals.most_common(15))
        )
        lines.append("")
        lines.extend(
            f"- `{hit.session}` - {hit.count} signal matches ({', '.join(hit.signals)})."
            for hit in friction[:20]
        )
    else:
        lines.append("No friction signals observed in the report window.")
    lines.extend(["", "### May 2026 audit comparison", ""])
    if audit_present:
        lines.extend(
            [
                (
                    "- Workflow mechanics and handoff ambiguity: **resolved** by "
                    "durable task graphs and `pi/scripts/plan-lint`."
                ),
                (
                    "- Planning and acceptance-criteria gaps: **transformed** "
                    "into mechanically checked state/report consistency; "
                    "criterion quality remains a review concern."
                ),
                (
                    "- Review process noise risk: **persisted** as a measurement "
                    "question; current evidence does not establish a lower "
                    "duplicate rate."
                ),
            ]
        )
    else:
        lines.append("- Baseline audit unavailable; comparison not computed.")

    lines.extend(["", "## Noise and signal candidates", ""])
    lines.append(
        "- Signal: failed or blocked plan-lint rows listed below require repair before execution."
    )
    lines.append(
        "- Noise candidate: zero-use commands are proposals only; absence of "
        "telemetry is not proof of no value."
    )
    lines.extend(["", "## `.specs/` hygiene", ""])
    if hygiene:
        lines.extend(
            f"- `{path}` - last touch {touched}; {age} days." for path, touched, age in hygiene
        )
    else:
        lines.append("No active `.specs/` directory is at least 60 days dormant.")

    lines.extend(["", "## Plan lint", ""])
    for path, passed, violations in lint:
        lines.append(f"- `{path}` - {'pass' if passed else 'fail'}.")
        lines.extend(f"  - `{violation}`" for violation in violations)
    if not lint:
        lines.append("- No active plan files found.")

    lines.extend(["", "## Data coverage notes", ""])
    lines.extend(f"- {note}." for note in coverage)
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--metrics-dir", type=Path)
    parser.add_argument("--sessions-dir", type=Path)
    parser.add_argument("--friction-dir", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--date", type=dt.date.fromisoformat, default=dt.date.today())
    args = parser.parse_args()

    repo = args.repo.resolve()
    agent_dir = Path.home() / ".pi" / "agent"
    metrics_dir = args.metrics_dir or agent_dir / "logs"
    sessions_dir = args.sessions_dir or agent_dir / "sessions"
    friction_dir = args.friction_dir or agent_dir / "workflow-friction"
    report_dir = repo / ".specs" / "improvement-reports"
    output = args.output or report_dir / f"{args.date.isoformat()}.md"
    cutoff = last_report_cutoff(report_dir, args.date)

    metric_paths = list(metrics_dir.glob("metrics*.jsonl")) + list(
        metrics_dir.glob("metrics*.jsonl.gz")
    )
    events = list(jsonl_records(metric_paths))
    routing = aggregate_routing(events)
    skill_counts, agent_counts = usage_counts(events)
    friction, command_counts = scan_sessions(sessions_dir, cutoff)
    lint = plan_lint_results(repo)
    hygiene = specs_hygiene(repo, args.date)

    coverage: list[str] = []
    if not metric_paths:
        coverage.append(f"Missing orchestration and usage metrics at `{metrics_dir}`")
    if not sessions_dir.exists():
        coverage.append(f"Missing session corpus at `{sessions_dir}`")
    if not friction_dir.exists():
        coverage.append(f"Missing workflow-friction records at `{friction_dir}`")
    else:
        coverage.append(
            f"Workflow-friction metadata present at `{friction_dir}`; session "
            "signal scan supplies pattern citations"
        )
    if not routing:
        coverage.append("Routing experiment has no sampled worker cells yet")
    if not skill_counts:
        coverage.append(
            "Skill invocation metrics are absent; zero counts are unknown, not evidence of non-use"
        )

    report = render_report(
        args.date,
        cutoff,
        routing,
        friction,
        command_counts,
        discover_commands(repo),
        skill_counts,
        agent_counts,
        lint,
        hygiene,
        coverage,
        (repo / ".specs" / "archive" / "pi-workflow-audit" / "report.md").is_file(),
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(report, encoding="utf-8", newline="\n")
    print(output.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
