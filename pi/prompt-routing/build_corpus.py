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
import random
import re
import subprocess
import tempfile
import time
from collections import Counter
from datetime import date
from pathlib import Path

ARTIFACT_DIR = Path(__file__).parent
DATA_DIR = ARTIFACT_DIR / "data"
CORPUS_PATH = DATA_DIR / "training_corpus.json"
CORPUS_V3_PATH = DATA_DIR / "training_corpus_v3.jsonl"
HISTORY_CSV = ARTIFACT_DIR / "labeled_history.csv"
LABEL_ORDER = ["low", "mid", "high"]

# v3 schema constants -- keep in sync with tools/validate_corpus.py
VALID_MODEL_TIERS = {"Haiku", "Sonnet", "Opus"}
VALID_EFFORT_TIERS = {"none", "low", "medium", "high"}

TIER_MAP = {
    "small": "low",
    "small_thinking": "low",
    "medium": "mid",
    "medium_thinking": "mid",
    "high": "high",
    "high_thinking": "high",
}

# ---------------------------------------------------------------------------
# Regex anonymization — pass 1
# ---------------------------------------------------------------------------

REPLACEMENTS = [
    # Windows/Unix file paths with extensions
    (r"[A-Za-z]:\\(?:[\w\-. ]+\\)*[\w\-.]+\.\w+", "[file-path]"),
    (r"(?:~|/home/\w+|/mnt/c/Users/\w+)/(?:[\w\-.]+/)*[\w\-.]+\.\w+", "[file-path]"),
    # Relative paths with extensions mentioned in prompts
    (
        r"\b(?:claude|tasks|specs|plans|docs|logs|hooks|skills|commands|worktrees?)"
        r"(?:/[\w\-.]+)+(?:\.\w+)?",
        "[project-path]",
    ),
    # Windows backslash paths
    (
        r"(?:claude|tasks|specs|plans|docs|logs|hooks|skills)(?:\\[\w\-.]+)+(?:\.\w+)?",
        "[project-path]",
    ),
    # Network addresses
    (r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b", "[ip-address]"),
    (r"localhost(?::\d+)?", "[localhost]"),
    (r":\d{4,5}(?:/\S*)?", ":[port]"),
    # GitHub/GitLab URLs (keep the path structure, remove specifics)
    (r"https?://(?:github|gitlab)\.com/[\w\-]+/[\w\-]+(?:/[^\s]*)?", "[repo-url]"),
    (r"https?://\S+", "[url]"),
    # Specific company/project names
    (r"\b(?:mps|eagletg|anomalyco|anomaly\.co|ilude|deltos|drift|eisa)\b", "[project]"),
    # MR/PR/ticket refs
    (r"\b(?:MR|PR|ticket|issue)\s*#?\s*\d+", "[ticket-ref]"),
    # Specific branch names with hashes
    (r"\b[0-9a-f]{7,40}\b", "[git-hash]"),
    # Registry/image paths (docker)
    (r"\b[\w.\-]+\.(?:io|com|net)/[\w/\-:]+", "[container-image]"),
]

COMPILED = [(re.compile(pattern, re.IGNORECASE), repl) for pattern, repl in REPLACEMENTS]


def anonymize_regex(text: str) -> str:
    for pattern, repl in COMPILED:
        text = pattern.sub(repl, text)
    return text.strip()


def needs_opus_pass(original: str, after_regex: str) -> bool:
    """Return True if the prompt still has identifiable specifics after regex."""
    specific_signals = [
        "gitlab",
        "github",
        "mps ",
        "eagletg",
        "anomaly",
        "ilude",
        "deltos",
        "worktree",
        "war-report",
        "damage-control",
        "skill-transcript",
        "cilium",
        "coredns",
        "nodelocal",
        "ironbank",
        "ses-smtp",
        ".ps1",
        ".sh",
        ".md",
        ".yaml",
        ".json",
        ".ts",
        ".py",
        "tasks/",
        "specs/",
        "plans/",
        "logs/",
        "hooks/",
        "skills/",
    ]
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
        [{"i": i, "prompt": p} for i, p in enumerate(batch)], indent=2, ensure_ascii=False
    )
    prompt_text = OPUS_ANONYMIZE_PROMPT.format(n=len(batch), prompts_json=prompts_json)

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
            raise RuntimeError(result.stderr[:200])
        return _parse_opus_output(result.stdout, len(batch))
    finally:
        Path(tmp).unlink(missing_ok=True)


def _parse_opus_output(raw: str, batch_len: int) -> list[str | None]:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    items = json.loads(text)
    out: list[str | None] = [None] * batch_len
    for item in items:
        idx = int(item["i"])
        if idx < batch_len:
            out[idx] = item.get("rewritten")
    return out


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def _infer_label_from_filename(name: str) -> str | None:
    name = name.lower()
    if "high" in name:
        return "high"
    if "medium" in name or "mid" in name:
        return "mid"
    if "small" in name or "low" in name:
        return "low"
    return None


def _load_flat_list(raw: list, fname: str) -> list[tuple[str, str, str]]:
    label = _infer_label_from_filename(Path(fname).stem)
    if label is None:
        print(f"  WARNING: cannot infer tier from filename '{fname}', skipping")
        return []
    return [(" ".join(p.split()), label, fname) for p in raw if isinstance(p, str) and p.strip()]


def _load_dict_corpus(raw: dict, fname: str) -> list[tuple[str, str, str]]:
    out: list[tuple[str, str, str]] = []
    for key, val in raw.items():
        if key == "metadata" or not isinstance(val, list):
            continue
        label = TIER_MAP.get(key)
        if not label:
            continue
        for p in val:
            if isinstance(p, str) and p.strip():
                out.append((" ".join(p.split()), label, fname))
    return out


# ---------------------------------------------------------------------------
# v3 row-based corpus support
# ---------------------------------------------------------------------------


def load_v3_jsonl(path: Path) -> list[dict]:
    """Load a JSONL file of v3 row objects. Returns an empty list if the file does not exist."""
    if not path.exists():
        return []
    rows: list[dict] = []
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"  WARNING: {path.name} line {lineno}: {e} -- skipping")
    return rows


def v3_row_to_legacy(row: dict) -> tuple[str, str, str] | None:
    """Convert a v3 row object to a legacy (prompt, label, source) tuple.

    Uses complexity_tier if present; otherwise maps cheapest_acceptable_route
    model_tier to the legacy label. Returns None if the row cannot be mapped.
    """
    prompt = row.get("prompt", "").strip()
    if not prompt:
        return None

    source = row.get("source", "v3")

    # Prefer preserved legacy label
    ct = row.get("complexity_tier")
    if ct in ("low", "mid", "high"):
        return (" ".join(prompt.split()), ct, source)

    # Derive from cheapest_acceptable_route model_tier
    car = row.get("cheapest_acceptable_route") or {}
    model_tier = car.get("model_tier", "")
    legacy_label = {"Haiku": "low", "Sonnet": "mid", "Opus": "high"}.get(model_tier)
    if legacy_label:
        return (" ".join(prompt.split()), legacy_label, source)

    return None


def load_v3_as_legacy(data_dir: Path) -> list[tuple[str, str, str]]:
    """Load all v3 JSONL files and convert to legacy (prompt, label, source) triples.

    Scans data_dir for files matching *_v3*.jsonl (excluding example fixtures).
    Preserves complexity_tier as the label when available so v3 rows can
    participate in legacy classifier training without losing the tier signal.
    """
    examples: list[tuple[str, str, str]] = []
    skip_patterns = {"example"}

    for path in sorted(data_dir.glob("*_v3*.jsonl")):
        if any(pat in path.name for pat in skip_patterns):
            continue
        rows = load_v3_jsonl(path)
        converted = 0
        for row in rows:
            entry = v3_row_to_legacy(row)
            if entry:
                examples.append(entry)
                converted += 1
        if rows:
            print(f"  {path.name}: {converted}/{len(rows)} v3 rows converted to legacy format")

    return examples


def write_v3_corpus(rows: list[dict], path: Path) -> None:
    """Write a list of v3 row dicts as JSONL. Skips rows missing required v3 fields."""
    required = {
        "prompt_id",
        "family_id",
        "prompt",
        "source",
        "domain",
        "task_type",
        "ambiguity",
        "cheapest_acceptable_route",
    }
    written = 0
    skipped = 0
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            car = row.get("cheapest_acceptable_route") or {}
            if (
                not required.issubset(row.keys())
                or car.get("model_tier") not in VALID_MODEL_TIERS
                or car.get("effort") not in VALID_EFFORT_TIERS
            ):
                skipped += 1
                continue
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            written += 1
    if skipped:
        print(f"  WARNING: skipped {skipped} rows with incomplete v3 fields")
    print(f"  Written {written} v3 rows to {path}")


def load_json_files(data_dir: Path) -> list[tuple[str, str, str]]:
    """Returns list of (prompt, label, source)."""
    examples: list[tuple[str, str, str]] = []
    # skip output files and v3 example fixtures (v3 JSONL handled separately)
    skip = {"training_corpus.json", "training_corpus_v3.example.json"}

    for f in sorted(data_dir.glob("*.json")):
        if f.name in skip:
            continue
        raw = json.loads(f.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            examples.extend(_load_flat_list(raw, f.name))
        elif isinstance(raw, dict):
            examples.extend(_load_dict_corpus(raw, f.name))

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
    for p, lb, s in examples:
        key = " ".join(p.lower().split())
        if key not in seen:
            seen.add(key)
            out.append((p, lb, s))
    return out


# ---------------------------------------------------------------------------
# Anonymization pipeline
# ---------------------------------------------------------------------------


def _split_regex_results(
    chat_examples: list[tuple[str, str, str]],
    regex_results: list[tuple[str, str, str]],
) -> tuple[list[tuple[str, str, str]], list[tuple[int, str, str, str, str]]]:
    """Return (regex_clean, still_specific) split."""
    regex_clean: list[tuple[str, str, str]] = []
    still_specific: list[tuple[int, str, str, str, str]] = []
    for i, ((p_orig, _, _), (p_anon, lb, s)) in enumerate(zip(chat_examples, regex_results)):
        if needs_opus_pass(p_orig, p_anon):
            still_specific.append((i, p_orig, p_anon, lb, s))
        else:
            regex_clean.append((p_anon, lb, s))
    return regex_clean, still_specific


def _run_opus_batches(specific_prompts: list[str], batch_size: int, model: str) -> list[str | None]:
    opus_results: list[str | None] = []
    total_batches = (len(specific_prompts) + batch_size - 1) // batch_size
    print(f"  Pass 2 (Opus): {len(specific_prompts)} prompts in {total_batches} batches...")

    for i in range(total_batches):
        batch = specific_prompts[i * batch_size : (i + 1) * batch_size]
        print(f"    Batch {i + 1}/{total_batches}...", end=" ", flush=True)
        try:
            results = opus_anonymize_batch(batch, model)
            opus_results.extend(results)
            kept = sum(1 for r in results if r)
            print(f"ok ({kept}/{len(batch)} kept)")
        except Exception as e:  # noqa: BLE001
            print(f"ERROR: {e} — keeping regex-only versions")
            opus_results.extend(batch)
        if i < total_batches - 1:
            time.sleep(2)
    return opus_results


def _merge_opus_results(
    still_specific: list[tuple[int, str, str, str, str]],
    opus_results: list[str | None],
) -> tuple[list[tuple[str, str, str]], int]:
    anon_examples: list[tuple[str, str, str]] = []
    skipped = 0
    for (_, _, p_anon, lb, s), opus_result in zip(still_specific, opus_results):
        if opus_result and opus_result.strip():
            anon_examples.append((" ".join(opus_result.split()), lb, s))
        elif p_anon and p_anon.strip():
            anon_examples.append((p_anon, lb, s))  # fallback to regex
        else:
            skipped += 1
    return anon_examples, skipped


def anonymize_chat_logs(
    chat_examples: list[tuple[str, str, str]],
    args: argparse.Namespace,
) -> tuple[list[tuple[str, str, str]], list[tuple[str, str, str]], int]:
    """Returns (regex_clean, anon_examples, skipped_count)."""
    regex_results = [(anonymize_regex(p), lb, s) for p, lb, s in chat_examples]
    regex_clean, still_specific = _split_regex_results(chat_examples, regex_results)
    print(f"  Pass 1 (regex): {len(regex_clean)} clean, {len(still_specific)} need Opus pass")

    if not still_specific:
        return regex_clean, [], 0

    if args.skip_anon or args.dry_run:
        anon_examples = [(p_anon, lb, s) for _, _, p_anon, lb, s in still_specific]
        return regex_clean, anon_examples, 0

    specific_prompts = [p_anon for _, _, p_anon, _, _ in still_specific]
    opus_results = _run_opus_batches(specific_prompts, args.batch_size, args.model)
    anon_examples, skipped = _merge_opus_results(still_specific, opus_results)
    return regex_clean, anon_examples, skipped


# ---------------------------------------------------------------------------
# Reporting / output
# ---------------------------------------------------------------------------


def _print_dry_run_samples(
    chat_examples: list[tuple[str, str, str]],
) -> None:
    print("\nDry run — not writing output.")
    print("\nSample anonymized chat prompts (before/after):")
    random.seed(1)
    regex_results = [(anonymize_regex(p), lb, s) for p, lb, s in chat_examples[:200]]
    diffs = [
        (p_orig, p_anon, lb, s)
        for (p_orig, _, _), (p_anon, lb, s) in zip(chat_examples[:200], regex_results)
        if p_orig != p_anon
    ]
    for p_orig, p_anon, lb, _s in random.sample(diffs, min(8, len(diffs))):
        print(f"  [{lb}] BEFORE: {p_orig[:80]}")
        print(f"        AFTER:  {p_anon[:80]}")


def _build_corpus_dict(all_examples: list[tuple[str, str, str]]) -> dict:
    by_label: dict[str, list[str]] = {lb: [] for lb in LABEL_ORDER}
    for p, lb, _ in all_examples:
        by_label[lb].append(p)

    return {
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
                "low": (
                    "Simple factual lookups, syntax questions, single-step tasks, short snippets"
                ),
                "mid": (
                    "Multi-step tasks, moderate analysis, "
                    "code with context, debugging, integrations"
                ),
                "high": (
                    "Architecture decisions, security analysis, "
                    "distributed systems, complex algorithms, scale"
                ),
            },
            "sources": sorted({s for _, _, s in all_examples}),
            "counts": {lb: len(by_label[lb]) for lb in LABEL_ORDER},
            "total": len(all_examples),
        },
        "low": by_label["low"],
        "mid": by_label["mid"],
        "high": by_label["high"],
    }


def _write_corpus(corpus: dict) -> None:
    CORPUS_PATH.write_text(json.dumps(corpus, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWritten: {CORPUS_PATH}")
    print(f"  low:  {len(corpus['low'])}")
    print(f"  mid:  {len(corpus['mid'])}")
    print(f"  high: {len(corpus['high'])}")
    print(f"  total: {corpus['metadata']['total']}")
    print("\nNext: python rebuild_data_py.py")


def _print_source_summary(json_examples: list[tuple[str, str, str]]) -> None:
    json_counts = Counter(s for _, _, s in json_examples)
    for fname, count in sorted(json_counts.items()):
        print(f"  {fname}: {count}")
    print(f"  Subtotal: {len(json_examples)}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build consolidated training_corpus.json")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-anon", action="store_true", help="Skip Opus anonymization pass")
    parser.add_argument("--model", default="opus", help="Model for anonymization (default: opus)")
    parser.add_argument("--batch-size", type=int, default=20)
    return parser.parse_args()


def run(args: argparse.Namespace) -> None:
    DATA_DIR.mkdir(exist_ok=True)

    print("Loading data/*.json files...")
    json_examples = load_json_files(DATA_DIR)
    _print_source_summary(json_examples)

    print("\nLoading v3 row-based examples (training_corpus_v3|cheapest_acceptable_route)...")
    v3_examples = load_v3_as_legacy(DATA_DIR)
    if v3_examples:
        v3_dist = Counter(lb for _, lb, _ in v3_examples)
        print(f"  v3 examples: {len(v3_examples)} -- {dict(v3_dist)}")
    else:
        print("  No v3 JSONL files found (expected after T5/T6 populate data/)")
    json_examples = json_examples + v3_examples

    print("\nLoading chat log prompts (labeled_history.csv)...")
    chat_examples = load_chat_logs(HISTORY_CSV)
    chat_dist = Counter(lb for _, lb, _ in chat_examples)
    print(f"  Usable: {len(chat_examples)} — {dict(chat_dist)}")

    print("\nAnonymizing chat log prompts...")
    regex_clean, anon_examples, skipped_anon = anonymize_chat_logs(chat_examples, args)

    all_chat_anon = regex_clean + anon_examples
    print(
        f"  After anonymization: {len(all_chat_anon)} kept, {skipped_anon} dropped (too specific)"
    )

    all_examples = dedup(json_examples + all_chat_anon)
    final_dist = Counter(lb for _, lb, _ in all_examples)
    print(f"\nFinal corpus: {len(all_examples)} examples — {dict(final_dist)}")

    if args.dry_run:
        _print_dry_run_samples(chat_examples)
        return

    corpus = _build_corpus_dict(all_examples)
    _write_corpus(corpus)


def main() -> None:
    run(parse_args())


if __name__ == "__main__":
    main()
