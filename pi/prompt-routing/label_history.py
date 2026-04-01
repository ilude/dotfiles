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
import sys
import tempfile
import time
from pathlib import Path

HISTORY_PATH = Path.home() / ".dotfiles" / "claude" / "history.jsonl"
OUTPUT_CSV = Path(__file__).parent / "labeled_history.csv"

CSV_FIELDS = ["prompt", "label", "confidence", "rationale", "usable", "project", "session_id"]

# Keyword signals used by --signal filter
HIGH_SIGNALS = [
    "architect", "design the", "distributed", "consensus", "multi-tenant", "shard",
    "race condition", "zero-downtime", "zero downtime", "saga", "cqrs", "event sourcing",
    "compliance", "soc2", "gdpr", "threat model", "canary", "circuit breaker",
    "service mesh", "federation", "observability", "failover", "disaster recovery",
    "data pipeline", "streaming", "replication", "partitioning", "bottleneck",
    "security", "vulnerability", "authentication architecture", "authorization",
    "at scale", "per second", "concurrent user", "10k", "100k", "microservice",
    "tradeoff", "trade-off", "trade off", "adversar", "evaluate", "analyse",
    "analyze", "strategy for", "latency", "p99",
]
LOW_SIGNALS = [
    "what is ", "what does ", "what are ", "how do i ", "how does ",
    "can you explain", "why is ", "is it possible", "what would",
    "show me how", "give me a list", "list the", "what version",
    "which command", "what flag", "what option",
]


def _signal_score(text: str) -> tuple[int, int]:
    """Return (high_score, low_score) based on keyword presence."""
    t = text.lower()
    h = sum(1 for s in HIGH_SIGNALS if s in t)
    l = sum(1 for s in LOW_SIGNALS if t.startswith(s) or f" {s}" in t)
    return h, l

SYSTEM_PROMPT = """You are labeling training data for a prompt routing classifier.
Classify each user prompt into one of these tiers:

  low  → Haiku:  Single-step, factual lookups, syntax questions, basic how-tos,
                 definition requests, one-liner code.
                 Examples: "What is a variable?", "How do I sort a list?", "what is cilium?"

  mid  → Sonnet: Multi-step tasks, moderate analysis, code with context, debugging,
                 integrations, config work, known algorithm implementations.
                 Examples: "Write a FastAPI endpoint", "Debug this SQL query", "Set up nginx reverse proxy"

  high → Opus:   Architecture, security analysis, distributed systems, scale decisions,
                 trade-off analysis, multi-system reasoning, compliance design.
                 Examples: "Design auth for 1M users", "Analyze race conditions", "Architect zero-downtime migration"

  skip → Not a labelable prompt: conversational fragment needing prior context
         ("yes", "no", "that looks good", "ok"), branch name, version string,
         file path, single word, or tool output noise.

Rules:
- Doubt between mid/high → prefer high. Over-routing is safer than under-routing.
- Doubt between low/mid → prefer mid.
- Operational/DevOps prompts follow the same tiers as software prompts.
- usable=true for low/mid/high, usable=false for skip."""

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


def extract_candidates(history_path: Path, signal: str = "all") -> list[dict]:
    """Extract usable standalone prompt candidates from history.jsonl."""
    records = []
    for line in history_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    seen: set[str] = set()
    candidates: list[dict] = []

    for r in records:
        text = r.get("display", "").strip()
        if not text or len(text) < 10:
            continue
        if text.startswith("/"):
            continue
        if "[Pasted text" in text:
            continue
        # Leaked Claude tool output
        if "\n\n\u25cf" in text or text.startswith("\u25cf"):
            continue
        # Deduplicate (case-insensitive)
        key = " ".join(text.lower().split())
        if key in seen:
            continue
        seen.add(key)

        # Apply signal filter
        if signal != "all":
            h, l = _signal_score(text)
            want = set(signal.split(","))
            match = (
                ("high" in want and h >= 1) or
                ("low"  in want and l >= 1 and h == 0)
            )
            if not match:
                continue

        candidates.append({
            "prompt": text,
            "project": r.get("project", ""),
            "session_id": r.get("sessionId", ""),
        })

    # When targeting specific signals, sort so strongest signals come first
    if signal != "all":
        def sort_key(c):
            h, l = _signal_score(c["prompt"])
            return -(h * 10 + l)
        candidates.sort(key=sort_key)

    return candidates


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


def parse_response(raw: str, batch: list[dict]) -> list[dict]:
    """Parse Opus JSON response back into labeled rows."""
    # Strip markdown code fences if present
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    items = json.loads(text)
    results = []
    for item in items:
        idx = int(item["i"])
        if idx >= len(batch):
            continue
        src = batch[idx]
        label = item.get("label", "skip")
        results.append({
            "prompt": src["prompt"],
            "label": label,
            "confidence": item.get("confidence", "low"),
            "rationale": item.get("rationale", "")[:120],
            "usable": label in ("low", "mid", "high"),
            "project": src["project"],
            "session_id": src["session_id"],
        })
    return results


def load_already_labeled(csv_path: Path) -> set[str]:
    if not csv_path.exists():
        return set()
    labeled: set[str] = set()
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            labeled.add(" ".join(row["prompt"].strip().lower().split()))
    return labeled


def main() -> None:
    parser = argparse.ArgumentParser(description="Label history.jsonl with claude -p --model opus")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--batch-size", type=int, default=25)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--signal", default="all",
        help="Pre-filter by signal: 'high', 'low', 'high,low', or 'all' (default: all)"
    )
    args = parser.parse_args()

    print(f"Extracting candidates from {HISTORY_PATH}...")
    candidates = extract_candidates(HISTORY_PATH, signal=args.signal)
    noun = f"'{args.signal}'-signal" if args.signal != "all" else "standalone"
    print(f"  {len(candidates)} usable {noun} prompts found")

    if args.resume:
        already = load_already_labeled(OUTPUT_CSV)
        before = len(candidates)
        candidates = [c for c in candidates if " ".join(c["prompt"].lower().split()) not in already]
        print(f"  Resume: {before - len(candidates)} already labeled, {len(candidates)} remaining")

    candidates = candidates[: args.limit]
    print(f"  Processing {len(candidates)} prompts (limit={args.limit}, batch={args.batch_size})")

    if args.dry_run:
        print("\nDry run — first 20 candidates:")
        for c in candidates[:20]:
            print(f"  [{len(c['prompt']):3d}] {c['prompt'][:100]}")
        return

    total_batches = (len(candidates) + args.batch_size - 1) // args.batch_size
    mode = "a" if args.resume and OUTPUT_CSV.exists() else "w"

    with open(OUTPUT_CSV, mode, newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        if mode == "w":
            writer.writeheader()

        labeled = skip = errors = 0

        for batch_idx in range(total_batches):
            start = batch_idx * args.batch_size
            batch = candidates[start : start + args.batch_size]
            batch_num = f"{batch_idx + 1}/{total_batches}"

            print(f"Batch {batch_num} ({len(batch)} prompts)...", end=" ", flush=True)

            prompts_json = json.dumps(
                [{"i": i, "prompt": c["prompt"]} for i, c in enumerate(batch)],
                indent=2,
                ensure_ascii=False,
            )
            prompt_text = BATCH_PROMPT_TEMPLATE.format(
                system=SYSTEM_PROMPT,
                n=len(batch),
                prompts_json=prompts_json,
            )

            try:
                raw = call_opus(prompt_text)
                rows = parse_response(raw, batch)
                for row in rows:
                    writer.writerow(row)
                    if row["usable"]:
                        labeled += 1
                    else:
                        skip += 1
                csv_file.flush()

                b_labeled = sum(1 for r in rows if r["usable"])
                b_skip = len(rows) - b_labeled
                dist = {}
                for r in rows:
                    dist[r["label"]] = dist.get(r["label"], 0) + 1
                dist_str = " ".join(f"{k}={v}" for k, v in sorted(dist.items()))
                print(f"ok  [{dist_str}]")

            except Exception as exc:
                errors += 1
                print(f"ERROR: {exc}")
                for c in batch:
                    writer.writerow({
                        "prompt": c["prompt"], "label": "error", "confidence": "low",
                        "rationale": str(exc)[:80], "usable": False,
                        "project": c["project"], "session_id": c["session_id"],
                    })
                csv_file.flush()

            # Brief pause between batches — avoid hammering the CLI
            if batch_idx < total_batches - 1:
                time.sleep(2)

    print("-" * 60)
    print(f"Done: {labeled} usable, {skip} skipped, {errors} batch errors")
    print(f"Output: {OUTPUT_CSV}")

    # Quick summary
    if OUTPUT_CSV.exists():
        from collections import Counter
        rows = list(csv.DictReader(open(OUTPUT_CSV, encoding="utf-8")))
        counts = Counter(r["label"] for r in rows if r["label"] not in ("error", "skip"))
        total_usable = sum(counts.values())
        print(f"\nLabel distribution (usable={total_usable}):")
        for lbl in ("low", "mid", "high"):
            print(f"  {lbl}: {counts.get(lbl, 0)}")
        print(f"\nNext: review {OUTPUT_CSV.name}, then run:")
        print(f"  python merge_labels.py --min-confidence medium")


if __name__ == "__main__":
    main()
