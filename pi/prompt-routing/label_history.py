"""
label_history.py — Label history.jsonl prompts using `claude -p --model opus`.

Uses your Claude subscription (no API key needed). Extracts usable standalone
prompts from ~/.dotfiles/claude/history.jsonl, sends them in batches to Opus
via the CLI, and writes results to prompt-routing/labeled_history.csv.

Usage:
    python label_history.py                  # label up to 500 candidates
    python label_history.py --limit 100      # label first N candidates
    python label_history.py --resume         # skip already-labeled prompts
    python label_history.py --dry-run        # show candidates, no API calls
    python label_history.py --batch-size 30  # prompts per claude call (default 25)
"""

import argparse
import csv
import json
import subprocess
import tempfile
import time
from collections import Counter
from pathlib import Path

HISTORY_PATH = Path.home() / ".dotfiles" / "claude" / "history.jsonl"
OUTPUT_CSV = Path(__file__).parent / "labeled_history.csv"

CSV_FIELDS = ["prompt", "label", "confidence", "rationale", "usable", "project", "session_id"]

# Keyword signals used by --signal filter
HIGH_SIGNALS = [
    "architect",
    "design the",
    "distributed",
    "consensus",
    "multi-tenant",
    "shard",
    "race condition",
    "zero-downtime",
    "zero downtime",
    "saga",
    "cqrs",
    "event sourcing",
    "compliance",
    "soc2",
    "gdpr",
    "threat model",
    "canary",
    "circuit breaker",
    "service mesh",
    "federation",
    "observability",
    "failover",
    "disaster recovery",
    "data pipeline",
    "streaming",
    "replication",
    "partitioning",
    "bottleneck",
    "security",
    "vulnerability",
    "authentication architecture",
    "authorization",
    "at scale",
    "per second",
    "concurrent user",
    "10k",
    "100k",
    "microservice",
    "tradeoff",
    "trade-off",
    "trade off",
    "adversar",
    "evaluate",
    "analyse",
    "analyze",
    "strategy for",
    "latency",
    "p99",
]
LOW_SIGNALS = [
    "what is ",
    "what does ",
    "what are ",
    "how do i ",
    "how does ",
    "can you explain",
    "why is ",
    "is it possible",
    "what would",
    "show me how",
    "give me a list",
    "list the",
    "what version",
    "which command",
    "what flag",
    "what option",
]


def _signal_score(text: str) -> tuple[int, int]:
    """Return (high_score, low_score) based on keyword presence."""
    t = text.lower()
    h = sum(1 for s in HIGH_SIGNALS if s in t)
    low = sum(1 for s in LOW_SIGNALS if t.startswith(s) or f" {s}" in t)
    return h, low


SYSTEM_PROMPT = (
    "You are labeling training data for a prompt routing classifier.\n"
    "Classify each user prompt into one of these tiers:\n"
    "\n"
    "  low  → Haiku:  Single-step, factual lookups, syntax questions, basic how-tos,\n"
    "                 definition requests, one-liner code.\n"
    '                 Examples: "What is a variable?", "How do I sort a list?",\n'
    '                 "what is cilium?"\n'
    "\n"
    "  mid  → Sonnet: Multi-step tasks, moderate analysis, code with context,\n"
    "                 debugging, integrations, config work, known algorithm impls.\n"
    '                 Examples: "Write a FastAPI endpoint", "Debug this SQL query",\n'
    '                 "Set up nginx reverse proxy"\n'
    "\n"
    "  high → Opus:   Architecture, security analysis, distributed systems, scale\n"
    "                 decisions, trade-off analysis, multi-system reasoning,\n"
    "                 compliance design.\n"
    '                 Examples: "Design auth for 1M users",\n'
    '                 "Analyze race conditions",\n'
    '                 "Architect zero-downtime migration"\n'
    "\n"
    "  skip → Not a labelable prompt: conversational fragment needing prior context\n"
    '         ("yes", "no", "that looks good", "ok"), branch name, version string,\n'
    "         file path, single word, or tool output noise.\n"
    "\n"
    "Rules:\n"
    "- Doubt between mid/high → prefer high. Over-routing is safer than under-routing.\n"
    "- Doubt between low/mid → prefer mid.\n"
    "- Operational/DevOps prompts follow the same tiers as software prompts.\n"
    "- usable=true for low/mid/high, usable=false for skip."
)

BATCH_PROMPT_TEMPLATE = """{system}

Classify the following {n} prompts. Return ONLY a JSON array with exactly {n} objects in order.
Each object must have exactly these fields:
  "i": integer index (0-based, matching prompt order)
  "label": "low" | "mid" | "high" | "skip"
  "confidence": "high" | "medium" | "low"
  "rationale": one short sentence (max 80 chars)
  "usable": true | false

Prompts to classify:
{prompts_json}

Return only the JSON array. No markdown fences, no explanation."""


# ---------------------------------------------------------------------------
# Candidate extraction
# ---------------------------------------------------------------------------


def _parse_history_records(history_path: Path) -> list[dict]:
    records: list[dict] = []
    for line in history_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records


def _is_usable_text(text: str) -> bool:
    if not text or len(text) < 10:
        return False
    if text.startswith("/"):
        return False
    if "[Pasted text" in text:
        return False
    # Leaked Claude tool output
    if "\n\n\u25cf" in text or text.startswith("\u25cf"):
        return False
    return True


def _matches_signal(text: str, signal: str) -> bool:
    if signal == "all":
        return True
    h, low = _signal_score(text)
    want = set(signal.split(","))
    return ("high" in want and h >= 1) or ("low" in want and low >= 1 and h == 0)


def extract_candidates(history_path: Path, signal: str = "all") -> list[dict]:
    """Extract usable standalone prompt candidates from history.jsonl."""
    records = _parse_history_records(history_path)
    seen: set[str] = set()
    candidates: list[dict] = []

    for r in records:
        text = r.get("display", "").strip()
        if not _is_usable_text(text):
            continue
        key = " ".join(text.lower().split())
        if key in seen:
            continue
        seen.add(key)
        if not _matches_signal(text, signal):
            continue
        candidates.append(
            {
                "prompt": text,
                "project": r.get("project", ""),
                "session_id": r.get("sessionId", ""),
            }
        )

    if signal != "all":

        def sort_key(c):
            h, low = _signal_score(c["prompt"])
            return -(h * 10 + low)

        candidates.sort(key=sort_key)

    return candidates


# ---------------------------------------------------------------------------
# Opus interaction
# ---------------------------------------------------------------------------


def call_opus(prompt_text: str) -> str:
    """Write prompt to a temp file and pipe it to `claude -p --model opus`."""
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".txt", delete=False) as f:
        f.write(prompt_text)
        tmp_path = f.name

    try:
        result = subprocess.run(
            f'claude -p --model opus < "{tmp_path}"',
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            raise RuntimeError(f"claude exited {result.returncode}: {result.stderr[:200]}")
        return result.stdout.strip()
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    return text


def _build_row(item: dict, src: dict) -> dict:
    label = item.get("label", "skip")
    return {
        "prompt": src["prompt"],
        "label": label,
        "confidence": item.get("confidence", "low"),
        "rationale": item.get("rationale", "")[:120],
        "usable": label in ("low", "mid", "high"),
        "project": src["project"],
        "session_id": src["session_id"],
    }


def parse_response(raw: str, batch: list[dict]) -> list[dict]:
    """Parse Opus JSON response back into labeled rows."""
    items = json.loads(_strip_code_fence(raw))
    results = []
    for item in items:
        idx = int(item["i"])
        if idx < len(batch):
            results.append(_build_row(item, batch[idx]))
    return results


def load_already_labeled(csv_path: Path) -> set[str]:
    if not csv_path.exists():
        return set()
    labeled: set[str] = set()
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            labeled.add(" ".join(row["prompt"].strip().lower().split()))
    return labeled


# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------


def _build_batch_prompt(batch: list[dict]) -> str:
    prompts_json = json.dumps(
        [{"i": i, "prompt": c["prompt"]} for i, c in enumerate(batch)],
        indent=2,
        ensure_ascii=False,
    )
    return BATCH_PROMPT_TEMPLATE.format(
        system=SYSTEM_PROMPT,
        n=len(batch),
        prompts_json=prompts_json,
    )


def _write_error_rows(writer: csv.DictWriter, batch: list[dict], exc: Exception) -> None:
    for c in batch:
        writer.writerow(
            {
                "prompt": c["prompt"],
                "label": "error",
                "confidence": "low",
                "rationale": str(exc)[:80],
                "usable": False,
                "project": c["project"],
                "session_id": c["session_id"],
            }
        )


def _write_rows_and_count(writer: csv.DictWriter, rows: list[dict]) -> tuple[int, int]:
    labeled = skipped = 0
    for row in rows:
        writer.writerow(row)
        if row["usable"]:
            labeled += 1
        else:
            skipped += 1
    return labeled, skipped


def _print_batch_distribution(rows: list[dict]) -> None:
    dist: dict[str, int] = {}
    for r in rows:
        dist[r["label"]] = dist.get(r["label"], 0) + 1
    dist_str = " ".join(f"{k}={v}" for k, v in sorted(dist.items()))
    print(f"ok  [{dist_str}]")


def _process_batch(
    writer: csv.DictWriter,
    csv_file,
    batch: list[dict],
    batch_num: str,
) -> tuple[int, int, int]:
    """Returns (labeled_delta, skipped_delta, error_delta)."""
    print(f"Batch {batch_num} ({len(batch)} prompts)...", end=" ", flush=True)
    prompt_text = _build_batch_prompt(batch)
    try:
        raw = call_opus(prompt_text)
        rows = parse_response(raw, batch)
        labeled, skipped = _write_rows_and_count(writer, rows)
        csv_file.flush()
        _print_batch_distribution(rows)
        return labeled, skipped, 0
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}")
        _write_error_rows(writer, batch, exc)
        csv_file.flush()
        return 0, 0, 1


def _label_candidates(candidates: list[dict], batch_size: int, mode: str) -> tuple[int, int, int]:
    total_batches = (len(candidates) + batch_size - 1) // batch_size
    labeled = skip = errors = 0

    with open(OUTPUT_CSV, mode, newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        if mode == "w":
            writer.writeheader()

        for batch_idx in range(total_batches):
            start = batch_idx * batch_size
            batch = candidates[start : start + batch_size]
            batch_num = f"{batch_idx + 1}/{total_batches}"
            d_labeled, d_skip, d_errors = _process_batch(writer, csv_file, batch, batch_num)
            labeled += d_labeled
            skip += d_skip
            errors += d_errors

            if batch_idx < total_batches - 1:
                time.sleep(2)

    return labeled, skip, errors


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _print_summary(labeled: int, skip: int, errors: int) -> None:
    print("-" * 60)
    print(f"Done: {labeled} usable, {skip} skipped, {errors} batch errors")
    print(f"Output: {OUTPUT_CSV}")

    if not OUTPUT_CSV.exists():
        return

    with open(OUTPUT_CSV, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    counts = Counter(r["label"] for r in rows if r["label"] not in ("error", "skip"))
    total_usable = sum(counts.values())
    print(f"\nLabel distribution (usable={total_usable}):")
    for lbl in ("low", "mid", "high"):
        print(f"  {lbl}: {counts.get(lbl, 0)}")
    print(f"\nNext: review {OUTPUT_CSV.name}, then run:")
    print("  python merge_labels.py --min-confidence medium")


def _filter_resume(candidates: list[dict]) -> list[dict]:
    already = load_already_labeled(OUTPUT_CSV)
    before = len(candidates)
    filtered = [c for c in candidates if " ".join(c["prompt"].lower().split()) not in already]
    print(f"  Resume: {before - len(filtered)} already labeled, {len(filtered)} remaining")
    return filtered


def _print_dry_run(candidates: list[dict]) -> None:
    print("\nDry run — first 20 candidates:")
    for c in candidates[:20]:
        print(f"  [{len(c['prompt']):3d}] {c['prompt'][:100]}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Label history.jsonl with claude -p --model opus")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--batch-size", type=int, default=25)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--signal",
        default="all",
        help="Pre-filter by signal: 'high', 'low', 'high,low', or 'all' (default: all)",
    )
    return parser.parse_args()


def run(args: argparse.Namespace) -> None:
    print(f"Extracting candidates from {HISTORY_PATH}...")
    candidates = extract_candidates(HISTORY_PATH, signal=args.signal)
    noun = f"'{args.signal}'-signal" if args.signal != "all" else "standalone"
    print(f"  {len(candidates)} usable {noun} prompts found")

    if args.resume:
        candidates = _filter_resume(candidates)

    candidates = candidates[: args.limit]
    print(f"  Processing {len(candidates)} prompts (limit={args.limit}, batch={args.batch_size})")

    if args.dry_run:
        _print_dry_run(candidates)
        return

    mode = "a" if args.resume and OUTPUT_CSV.exists() else "w"
    labeled, skip, errors = _label_candidates(candidates, args.batch_size, mode)
    _print_summary(labeled, skip, errors)


def main() -> None:
    run(parse_args())


if __name__ == "__main__":
    main()
