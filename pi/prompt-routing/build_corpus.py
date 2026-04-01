"""
build_corpus.py — Consolidate all training data into data/training_corpus.json.

Sources:
  1. data/*.json files (multiple schemas, auto-detected)
  2. labeled_history.csv (chat log prompts, anonymized via Opus)

Anonymization (chat log prompts only):
  Pass 1: regex substitution for known patterns (paths, hostnames, company refs)
  Pass 2: claude -p --model opus to generalize remaining specific prompts
  Pass 3: filter prompts that couldn't be generalized meaningfully

Output: data/training_corpus.json — single canonical source
  {
    "metadata": { "version", "created", "sources", "total", "tier_definitions" },
    "low":  [ "prompt text", ... ],
    "mid":  [ ... ],
    "high": [ ... ]
  }

Usage:
    python build_corpus.py --dry-run     # counts only, no API calls
    python build_corpus.py               # full build with Opus anonymization
    python build_corpus.py --skip-anon   # skip Opus pass (regex only)
"""

import argparse
import csv
import json
import re
import subprocess
import sys
import tempfile
import time
from collections import Counter
from datetime import date
from pathlib import Path

ARTIFACT_DIR = Path(__file__).parent
DATA_DIR = ARTIFACT_DIR / "data"
CORPUS_PATH = DATA_DIR / "training_corpus.json"
HISTORY_CSV = ARTIFACT_DIR / "labeled_history.csv"
LABEL_ORDER = ["low", "mid", "high"]

TIER_MAP = {
    "small": "low", "small_thinking": "low",
    "medium": "mid", "medium_thinking": "mid",
    "high": "high", "high_thinking": "high",
}

# ---------------------------------------------------------------------------
# Regex anonymization — pass 1
# ---------------------------------------------------------------------------

REPLACEMENTS = [
    # Windows/Unix file paths with extensions
    (r'[A-Za-z]:\\(?:[\w\-. ]+\\)*[\w\-.]+\.\w+', '[file-path]'),
    (r'(?:~|/home/\w+|/mnt/c/Users/\w+)/(?:[\w\-.]+/)*[\w\-.]+\.\w+', '[file-path]'),
    # Relative paths with extensions mentioned in prompts
    (r'\b(?:claude|tasks|specs|plans|docs|logs|hooks|skills|commands|worktrees?)'
     r'(?:/[\w\-.]+)+(?:\.\w+)?', '[project-path]'),
    # Windows backslash paths
    (r'(?:claude|tasks|specs|plans|docs|logs|hooks|skills)(?:\\[\w\-.]+)+(?:\.\w+)?', '[project-path]'),
    # Network addresses
    (r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b', '[ip-address]'),
    (r'localhost(?::\d+)?', '[localhost]'),
    (r':\d{4,5}(?:/\S*)?', ':[port]'),
    # GitHub/GitLab URLs (keep the path structure, remove specifics)
    (r'https?://(?:github|gitlab)\.com/[\w\-]+/[\w\-]+(?:/[^\s]*)?', '[repo-url]'),
    (r'https?://\S+', '[url]'),
    # Specific company/project names
    (r'\b(?:mps|eagletg|anomalyco|anomaly\.co|ilude|deltos|drift|eisa)\b', '[project]'),
    # MR/PR/ticket refs
    (r'\b(?:MR|PR|ticket|issue)\s*#?\s*\d+', '[ticket-ref]'),
    # Specific branch names with hashes
    (r'\b[0-9a-f]{7,40}\b', '[git-hash]'),
    # Registry/image paths (docker)
    (r'\b[\w.\-]+\.(?:io|com|net)/[\w/\-:]+', '[container-image]'),
]

COMPILED = [(re.compile(pattern, re.IGNORECASE), repl) for pattern, repl in REPLACEMENTS]


def anonymize_regex(text: str) -> str:
    for pattern, repl in COMPILED:
        text = pattern.sub(repl, text)
    return text.strip()


def needs_opus_pass(original: str, after_regex: str) -> bool:
    """Return True if the prompt still has identifiable specifics after regex."""
    combined = original.lower()
    specific_signals = [
        'gitlab', 'github', 'mps ', 'eagletg', 'anomaly', 'ilude', 'deltos',
        'worktree', 'war-report', 'damage-control', 'skill-transcript',
        'cilium', 'coredns', 'nodelocal', 'ironbank', 'ses-smtp',
        '.ps1', '.sh', '.md', '.yaml', '.json', '.ts', '.py',
        'tasks/', 'specs/', 'plans/', 'logs/', 'hooks/', 'skills/',
    ]
    # Only flag if still present after regex
    after = after_regex.lower()
    return any(sig in after for sig in specific_signals)


# ---------------------------------------------------------------------------
# Opus anonymization — pass 2
# ---------------------------------------------------------------------------

OPUS_ANONYMIZE_PROMPT = """\
You are anonymizing chat-log prompts for a training dataset. Each prompt is a \
real instruction given to an AI assistant. Your job is to rewrite them so they \
contain no identifying information (no company names, specific project names, \
file paths, hostnames, ticket IDs) while preserving the original intent and \
complexity tier.

Rules:
- Replace specific names with generic equivalents: "gitlab" -> "git server", \
"cilium" -> "the CNI plugin", "damage-control" -> "the safety hook system", \
specific file paths -> "the config file", specific branch names -> "the branch", etc.
- Keep the verb and the core task — this is what determines the complexity tier.
- If a prompt is a pure conversational fragment with no recoverable task \
("yes", "no", "ok", "are you confused") return null.
- If the prompt references something so specific that generalizing it would \
make it meaningless, return null.

Return ONLY a JSON array of {n} objects (same order as input):
  {{"i": 0, "rewritten": "generalized prompt text" | null}}

Prompts to anonymize:
{prompts_json}"""


def opus_anonymize_batch(batch: list[str], model: str) -> list[str | None]:
    prompts_json = json.dumps(
        [{"i": i, "prompt": p} for i, p in enumerate(batch)],
        indent=2, ensure_ascii=False
    )
    prompt_text = OPUS_ANONYMIZE_PROMPT.format(n=len(batch), prompts_json=prompts_json)

    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".txt", delete=False) as f:
        f.write(prompt_text)
        tmp = f.name
    try:
        result = subprocess.run(
            f'claude -p --model {model} < "{tmp}"',
            shell=True, capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr[:200])
        raw = result.stdout.strip()
        if raw.startswith("```"):
            lines = raw.splitlines()
            raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
        items = json.loads(raw)
        out: list[str | None] = [None] * len(batch)
        for item in items:
            idx = int(item["i"])
            if idx < len(batch):
                out[idx] = item.get("rewritten")
        return out
    finally:
        Path(tmp).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_json_files(data_dir: Path) -> list[tuple[str, str, str]]:
    """Returns list of (prompt, label, source)."""
    examples = []
    skip = {"training_corpus.json"}  # don't re-read the output file

    for f in sorted(data_dir.glob("*.json")):
        if f.name in skip:
            continue
        raw = json.loads(f.read_text(encoding="utf-8"))

        if isinstance(raw, list):
            # Flat list — infer label from filename
            label = None
            name = f.stem.lower()
            if "high" in name:
                label = "high"
            elif "medium" in name or "mid" in name:
                label = "mid"
            elif "small" in name or "low" in name:
                label = "low"
            if label is None:
                print(f"  WARNING: cannot infer tier from filename '{f.name}', skipping")
                continue
            for p in raw:
                if isinstance(p, str) and p.strip():
                    examples.append((" ".join(p.split()), label, f.name))

        elif isinstance(raw, dict):
            for key, val in raw.items():
                if key == "metadata" or not isinstance(val, list):
                    continue
                label = TIER_MAP.get(key)
                if not label:
                    continue
                for p in val:
                    if isinstance(p, str) and p.strip():
                        examples.append((" ".join(p.split()), label, f.name))

    return examples


def load_chat_logs(csv_path: Path) -> list[tuple[str, str, str]]:
    """Returns list of (prompt, label, source) for usable chat log entries."""
    if not csv_path.exists():
        return []
    examples = []
    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("usable", "").lower() != "true":
                continue
            if row.get("label") not in LABEL_ORDER:
                continue
            prompt = " ".join(row["prompt"].strip().split())
            if prompt:
                examples.append((prompt, row["label"], "labeled_history.csv"))
    return examples


def dedup(examples: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    seen: set[str] = set()
    out = []
    for p, l, s in examples:
        key = " ".join(p.lower().split())
        if key not in seen:
            seen.add(key)
            out.append((p, l, s))
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Build consolidated training_corpus.json")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-anon", action="store_true", help="Skip Opus anonymization pass")
    parser.add_argument("--model", default="opus", help="Model for anonymization (default: opus)")
    parser.add_argument("--batch-size", type=int, default=20)
    args = parser.parse_args()

    DATA_DIR.mkdir(exist_ok=True)

    # --- Load sources ---
    print("Loading data/*.json files...")
    json_examples = load_json_files(DATA_DIR)
    json_counts = Counter(s for _, _, s in json_examples)
    for fname, count in sorted(json_counts.items()):
        print(f"  {fname}: {count}")
    print(f"  Subtotal: {len(json_examples)}")

    print("\nLoading chat log prompts (labeled_history.csv)...")
    chat_examples = load_chat_logs(HISTORY_CSV)
    chat_dist = Counter(l for _, l, _ in chat_examples)
    print(f"  Usable: {len(chat_examples)} — {dict(chat_dist)}")

    # --- Anonymize chat logs ---
    print("\nAnonymizing chat log prompts...")
    anon_examples: list[tuple[str, str, str]] = []
    skipped_anon = 0

    # Pass 1: regex
    regex_results = [(anonymize_regex(p), l, s) for p, l, s in chat_examples]
    still_specific = [(i, p_orig, p_anon, l, s)
                      for i, ((p_orig, _, _), (p_anon, l, s))
                      in enumerate(zip(chat_examples, regex_results))
                      if needs_opus_pass(p_orig, p_anon)]
    regex_clean = [(p_anon, l, s)
                   for (p_orig, _, _), (p_anon, l, s)
                   in zip(chat_examples, regex_results)
                   if not needs_opus_pass(p_orig, p_anon)]

    print(f"  Pass 1 (regex): {len(regex_clean)} clean, {len(still_specific)} need Opus pass")

    if still_specific and not args.skip_anon and not args.dry_run:
        # Pass 2: Opus
        specific_prompts = [p_anon for _, _, p_anon, _, _ in still_specific]
        opus_results: list[str | None] = []
        total_batches = (len(specific_prompts) + args.batch_size - 1) // args.batch_size
        print(f"  Pass 2 (Opus): {len(specific_prompts)} prompts in {total_batches} batches...")

        for i in range(total_batches):
            batch = specific_prompts[i * args.batch_size:(i + 1) * args.batch_size]
            print(f"    Batch {i+1}/{total_batches}...", end=" ", flush=True)
            try:
                results = opus_anonymize_batch(batch, args.model)
                opus_results.extend(results)
                kept = sum(1 for r in results if r)
                print(f"ok ({kept}/{len(batch)} kept)")
            except Exception as e:
                print(f"ERROR: {e} — keeping regex-only versions")
                opus_results.extend(specific_prompts[i * args.batch_size:(i + 1) * args.batch_size])
            if i < total_batches - 1:
                time.sleep(2)

        for (_, p_orig, p_anon, l, s), opus_result in zip(still_specific, opus_results):
            if opus_result and opus_result.strip():
                anon_examples.append((" ".join(opus_result.split()), l, s))
            elif p_anon and p_anon.strip():
                anon_examples.append((p_anon, l, s))  # fallback to regex
            else:
                skipped_anon += 1
    elif still_specific and (args.skip_anon or args.dry_run):
        # Keep regex-only versions for remaining
        for _, p_orig, p_anon, l, s in still_specific:
            anon_examples.append((p_anon, l, s))

    all_chat_anon = regex_clean + anon_examples
    print(f"  After anonymization: {len(all_chat_anon)} kept, {skipped_anon} dropped (too specific)")

    # --- Combine and dedup ---
    all_examples = dedup(json_examples + all_chat_anon)
    final_dist = Counter(l for _, l, _ in all_examples)
    print(f"\nFinal corpus: {len(all_examples)} examples — {dict(final_dist)}")

    if args.dry_run:
        print("\nDry run — not writing output.")
        print("\nSample anonymized chat prompts (before/after):")
        import random; random.seed(1)
        for p_orig, p_anon, l, s in random.sample(
            [(p_orig, p_anon, l, s) for (p_orig, _, _), (p_anon, l, s)
             in zip(chat_examples[:200], regex_results[:200])
             if p_orig != p_anon], min(8, len(chat_examples))
        ):
            print(f"  [{l}] BEFORE: {p_orig[:80]}")
            print(f"        AFTER:  {p_anon[:80]}")
        return

    # --- Write corpus ---
    by_label: dict[str, list[str]] = {lb: [] for lb in LABEL_ORDER}
    for p, l, _ in all_examples:
        by_label[l].append(p)

    corpus = {
        "metadata": {
            "version": "2.0",
            "created": date.today().isoformat(),
            "description": (
                "Consolidated prompt routing training corpus. "
                "Labels: low=Haiku, mid=Sonnet, high=Opus. "
                "Sources: handcrafted coding prompts (3 models), "
                "user chat logs (anonymized, labeled by Opus)."
            ),
            "tier_definitions": {
                "low": "Simple factual lookups, syntax questions, single-step tasks, short snippets",
                "mid": "Multi-step tasks, moderate analysis, code with context, debugging, integrations",
                "high": "Architecture decisions, security analysis, distributed systems, complex algorithms, scale",
            },
            "sources": sorted(set(s for _, _, s in all_examples)),
            "counts": {lb: len(by_label[lb]) for lb in LABEL_ORDER},
            "total": len(all_examples),
        },
        "low": by_label["low"],
        "mid": by_label["mid"],
        "high": by_label["high"],
    }

    CORPUS_PATH.write_text(json.dumps(corpus, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWritten: {CORPUS_PATH}")
    print(f"  low:  {len(by_label['low'])}")
    print(f"  mid:  {len(by_label['mid'])}")
    print(f"  high: {len(by_label['high'])}")
    print(f"  total: {len(all_examples)}")
    print(f"\nNext: python rebuild_data_py.py")


if __name__ == "__main__":
    main()
