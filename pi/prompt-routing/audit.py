"""
audit.py — Daily batch audit of routing decisions.

Reads logs/routing_log.jsonl, finds entries not yet reviewed, sends them in
batches to `claude -p --model opus` (or --model sonnet for speed), compares
Opus labels against the router's predictions, and writes a dated report to
logs/audit_YYYY-MM-DD.json.

Divergences (router != Opus) are flagged. HIGH->LOW divergences are marked
CRITICAL — they are the primary signal that the model is mis-routing hard prompts.
Divergences are candidate examples for the training corpus.

Usage:
    python audit.py                        # audit all unreviewed, write report
    python audit.py --model sonnet         # faster / cheaper (less accurate)
    python audit.py --limit 200            # cap entries per run
    python audit.py --dry-run              # preview without API calls
    python audit.py --since 2026-03-31     # only entries from this date forward
    python audit.py --all                  # re-audit already-reviewed entries too

Output:
    logs/audit_YYYY-MM-DD.json   — full report with per-entry results
    logs/audit_YYYY-MM-DD.csv    — divergences only, ready for merge_labels.py
    Prints summary to stdout.
"""

import argparse
import csv
import json
import subprocess
import tempfile
import time
from collections import Counter
from datetime import date, datetime
from pathlib import Path

_DIR = Path(__file__).parent
_LOG_PATH = _DIR / "logs" / "routing_log.jsonl"
_LOG_DIR = _DIR / "logs"

BATCH_SIZE = 25
SLEEP_BETWEEN_BATCHES = 2  # seconds

LABEL_PROMPT = """\
You are auditing a prompt routing classifier. For each prompt below, give your
independent assessment of which model tier it should be routed to:

  low  = simple factual lookups, syntax questions, single-step tasks (Haiku)
  mid  = multi-step tasks, code with context, moderate analysis (Sonnet)
  high = architecture decisions, security, distributed systems, scale (Opus)
  skip = not a real prompt (fragment, noise, test input)

Return ONLY a JSON array with exactly {n} objects in the same order:
  {{"i": 0, "label": "low", "confidence": "high", "rationale": "one sentence"}}

Prompts:
{prompts_json}"""


# ---------------------------------------------------------------------------
# Log loading
# ---------------------------------------------------------------------------


def _parse_log_line(line: str) -> dict | None:
    line = line.strip()
    if not line:
        return None
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None


def _entry_passes_filters(entry: dict, since: date | None, include_reviewed: bool) -> bool:
    if not include_reviewed and entry.get("reviewed"):
        return False
    if since is None:
        return True
    ts = entry.get("ts", 0)
    entry_date = datetime.fromtimestamp(ts).date()
    return entry_date >= since


def load_log(log_path: Path, since: date | None, include_reviewed: bool) -> list[dict]:
    if not log_path.exists():
        return []
    entries: list[dict] = []
    with open(log_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            entry = _parse_log_line(line)
            if entry is None:
                continue
            if _entry_passes_filters(entry, since, include_reviewed):
                entries.append(entry)
    return entries


# ---------------------------------------------------------------------------
# Opus interaction
# ---------------------------------------------------------------------------


def call_opus(prompt_text: str, model: str) -> str:
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".txt", delete=False) as f:
        f.write(prompt_text)
        tmp = f.name
    try:
        result = subprocess.run(
            f'claude -p --model {model} < "{tmp}"',
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            raise RuntimeError(f"claude exited {result.returncode}: {result.stderr[:200]}")
        return result.stdout.strip()
    finally:
        Path(tmp).unlink(missing_ok=True)


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    return text


def _build_result_row(item: dict, entry: dict) -> dict:
    router_tier = entry.get("tier", "?")
    opus_label = item.get("label", "skip")
    return {
        "ts": entry.get("ts"),
        "prompt": entry.get("prompt", ""),
        "router_tier": router_tier,
        "opus_label": opus_label,
        "confidence": item.get("confidence", "low"),
        "rationale": item.get("rationale", "")[:120],
        "match": router_tier == opus_label,
        "critical": router_tier == "low" and opus_label == "high",
        "scores": entry.get("scores", {}),
    }


def parse_labels(raw: str, batch: list[dict]) -> list[dict]:
    items = json.loads(_strip_code_fence(raw))
    results = []
    for item in items:
        idx = int(item["i"])
        if idx < len(batch):
            results.append(_build_result_row(item, batch[idx]))
    return results


def mark_reviewed(log_path: Path, reviewed_prompts: set[str]) -> None:
    """Update reviewed=True in-place for audited entries."""
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    updated: list[str] = []
    for line in lines:
        if not line.strip():
            continue
        updated.append(_update_review_flag(line, reviewed_prompts))
    log_path.write_text("\n".join(updated) + "\n", encoding="utf-8")


def _update_review_flag(line: str, reviewed_prompts: set[str]) -> str:
    try:
        entry = json.loads(line)
    except json.JSONDecodeError:
        return line
    if entry.get("prompt", "") in reviewed_prompts:
        entry["reviewed"] = True
    return json.dumps(entry, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------


def _build_batch_prompt(batch: list[dict]) -> str:
    prompts_json = json.dumps(
        [{"i": j, "prompt": e["prompt"]} for j, e in enumerate(batch)],
        indent=2,
        ensure_ascii=False,
    )
    return LABEL_PROMPT.format(n=len(batch), prompts_json=prompts_json)


def _process_batch(batch: list[dict], batch_num: int, total_batches: int, model: str) -> list[dict]:
    print(f"Batch {batch_num}/{total_batches} ({len(batch)})...", end=" ", flush=True)
    prompt_text = _build_batch_prompt(batch)
    try:
        raw = call_opus(prompt_text, model)
        results = parse_labels(raw, batch)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}")
        return []

    matches = sum(1 for r in results if r["match"])
    criticals = sum(1 for r in results if r["critical"])
    flag = " *** CRITICAL INVERSION ***" if criticals else ""
    print(f"ok  {matches}/{len(results)} match  {criticals} critical{flag}")
    return results


def _audit_entries(entries: list[dict], batch_size: int, model: str) -> tuple[list[dict], set[str]]:
    total_batches = (len(entries) + batch_size - 1) // batch_size
    all_results: list[dict] = []
    reviewed_prompts: set[str] = set()

    print(f"\nAuditing {len(entries)} entries via claude -p --model {model}...")
    print("-" * 60)

    for i in range(total_batches):
        batch = entries[i * batch_size : (i + 1) * batch_size]
        results = _process_batch(batch, i + 1, total_batches, model)
        all_results.extend(results)
        for e in batch:
            reviewed_prompts.add(e.get("prompt", ""))
        if i < total_batches - 1:
            time.sleep(SLEEP_BETWEEN_BATCHES)

    return all_results, reviewed_prompts


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _build_report(
    all_results: list[dict],
    divergences: list[dict],
    criticals: list[dict],
    model: str,
) -> dict:
    match_count = len(all_results) - len(divergences)
    accuracy = round(match_count / len(all_results), 4) if all_results else 0
    tier_dist = Counter(r["opus_label"] for r in all_results)
    return {
        "date": date.today().isoformat(),
        "model": model,
        "total": len(all_results),
        "matches": match_count,
        "divergences": len(divergences),
        "critical_inversions": len(criticals),
        "accuracy": accuracy,
        "opus_tier_distribution": dict(tier_dist),
        "results": all_results,
    }


def _write_divergences_csv(csv_path: Path, divergences: list[dict]) -> None:
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "prompt",
                "label",
                "confidence",
                "rationale",
                "usable",
                "project",
                "session_id",
                "router_tier",
                "critical",
            ],
        )
        writer.writeheader()
        for r in divergences:
            writer.writerow(_divergence_row(r))


def _divergence_row(r: dict) -> dict:
    return {
        "prompt": r["prompt"],
        "label": r["opus_label"],
        "confidence": r["confidence"],
        "rationale": r["rationale"],
        "usable": r["opus_label"] in ("low", "mid", "high"),
        "project": "audit",
        "session_id": "",
        "router_tier": r["router_tier"],
        "critical": r["critical"],
    }


def _print_summary(report: dict, divergences: list[dict], criticals: list[dict]) -> None:
    print("-" * 60)
    print(
        f"Audited: {report['total']}  |  Match: {report['matches']}  |  "
        f"Accuracy: {report['accuracy']:.1%}"
    )
    print(f"Divergences: {len(divergences)}  |  CRITICAL (HIGH routed to LOW): {len(criticals)}")
    print(f"Opus distribution: {report['opus_tier_distribution']}")
    if criticals:
        print(
            f"\n*** {len(criticals)} CRITICAL INVERSION(S) — "
            f"router sent HIGH prompt to LOW tier ***"
        )
        for r in criticals:
            print(f"  {r['prompt'][:100]}")


def _write_report_files(
    all_results: list[dict], model: str
) -> tuple[Path, Path | None, list[dict], list[dict]]:
    today = date.today().isoformat()
    _LOG_DIR.mkdir(exist_ok=True)
    report_path = _LOG_DIR / f"audit_{today}.json"
    csv_path = _LOG_DIR / f"audit_{today}_divergences.csv"

    divergences = [r for r in all_results if not r["match"]]
    criticals = [r for r in all_results if r["critical"]]
    report = _build_report(all_results, divergences, criticals, model)

    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    written_csv: Path | None = None
    if divergences:
        _write_divergences_csv(csv_path, divergences)
        written_csv = csv_path

    _print_summary(report, divergences, criticals)
    print(f"\nReport:      {report_path}")
    if written_csv:
        print(f"Divergences: {written_csv}")
        print("\nTo add divergences to corpus:")
        print(f"  Review {written_csv.name}, then run:")
        print(f"  python merge_labels.py --source {written_csv.name}")
    return report_path, written_csv, divergences, criticals


def _print_dry_run(entries: list[dict], batch_size: int, model: str) -> None:
    print("\nDry run — first 10 entries:")
    for e in entries[:10]:
        ts = datetime.fromtimestamp(e.get("ts", 0)).strftime("%Y-%m-%d %H:%M")
        print(f"  [{e.get('tier', '?'):4}] {ts}  {e.get('prompt', '')[:80]}")
    print(
        f"\n{len(entries)} entries would be sent to {model} in "
        f"{(len(entries) + batch_size - 1) // batch_size} batches."
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Daily audit of routing decisions vs Opus")
    parser.add_argument("--model", default="opus", help="Model for audit labels (default: opus)")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--since", type=str, default=None, help="YYYY-MM-DD")
    parser.add_argument(
        "--all",
        dest="include_reviewed",
        action="store_true",
        help="Re-audit already-reviewed entries",
    )
    return parser.parse_args()


def run(args: argparse.Namespace) -> None:
    since = date.fromisoformat(args.since) if args.since else None
    entries = load_log(_LOG_PATH, since=since, include_reviewed=args.include_reviewed)
    entries = entries[: args.limit]

    print(f"Routing log: {_LOG_PATH}")
    print(f"Unreviewed entries: {len(entries)}" + (f" (since {since})" if since else ""))

    if not entries:
        print("Nothing to audit.")
        return

    if args.dry_run:
        _print_dry_run(entries, args.batch_size, args.model)
        return

    all_results, reviewed_prompts = _audit_entries(entries, args.batch_size, args.model)
    mark_reviewed(_LOG_PATH, reviewed_prompts)
    _write_report_files(all_results, args.model)


def main() -> None:
    run(parse_args())


if __name__ == "__main__":
    main()
