"""merge_wave4_shards.py -- Merge the 4 wave-4 generator shards into
the canonical synthetic_route_labels.jsonl.

Steps:
  1. Validate each shard independently via tools.validate_corpus.validate_row.
     Rows that fail validation are dropped (not silently fixed) per the
     coordinator instructions. Failing row ids and reasons are recorded.
  2. Load the existing canonical synthetic_route_labels.jsonl (kept intact).
  3. Normalize prompts (lowercase + strip whitespace) and dedupe:
     a. New-shard rows whose normalized prompt matches any existing canonical
        row are dropped.
     b. Duplicates across the four new shards are dropped, preferring the
        shard that appears first in shard order (genA, genB, genC, genD).
  4. Backup canonical to synthetic_route_labels.pre_wave4.jsonl (idempotent:
     only written if the backup does not yet exist).
  5. Append the surviving new rows to the canonical file in place.
  6. Emit a provenance summary markdown to
     docs/wave4-generation-report.md.

This script is idempotent: re-running after a successful merge finds that
all new-shard rows already exist in the canonical file and appends nothing.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "data"
DOCS = REPO / "docs"

SHARDS: list[tuple[str, Path]] = [
    ("genA", DATA / "synthetic_shards" / "genA" / "chunk.jsonl"),
    ("genB", DATA / "synthetic_shards" / "genB" / "chunk.jsonl"),
    ("genC", DATA / "synthetic_shards" / "genC" / "chunk.jsonl"),
    ("genD", DATA / "synthetic_shards" / "genD" / "chunk.jsonl"),
]

CANONICAL = DATA / "synthetic_route_labels.jsonl"
BACKUP = DATA / "synthetic_route_labels.pre_wave4.jsonl"
REPORT = DOCS / "wave4-generation-report.md"

sys.path.insert(0, str(REPO / "tools"))
from validate_corpus import validate_row  # noqa: E402


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def normalize_prompt(p: str) -> str:
    return " ".join(p.lower().split())


def tier_key(row: dict) -> tuple[str, str]:
    car = row["cheapest_acceptable_route"]
    return (car["model_tier"], car["effort"])


def main() -> int:
    canonical = load_jsonl(CANONICAL)
    canonical_norms = {normalize_prompt(r["prompt"]) for r in canonical}
    canonical_count = len(canonical)

    shard_reports: list[dict[str, Any]] = []
    surviving: list[dict] = []
    seen_new: set[str] = set()

    total_scanned = 0
    total_invalid = 0
    total_dup_canonical = 0
    total_dup_cross_shard = 0
    total_kept = 0

    for name, path in SHARDS:
        rows = load_jsonl(path)
        invalid_rows: list[tuple[str, list[str]]] = []
        valid_rows: list[dict] = []
        for i, r in enumerate(rows):
            rid = r.get("prompt_id", f"{name}-{i}") if isinstance(r, dict) else f"{name}-{i}"
            errs = validate_row(r, str(rid))
            if errs:
                invalid_rows.append((str(rid), errs))
            else:
                valid_rows.append(r)

        kept_rows: list[dict] = []
        dup_canonical = 0
        dup_cross_shard = 0
        for r in valid_rows:
            norm = normalize_prompt(r["prompt"])
            if norm in canonical_norms:
                dup_canonical += 1
                continue
            if norm in seen_new:
                dup_cross_shard += 1
                continue
            seen_new.add(norm)
            kept_rows.append(r)

        surviving.extend(kept_rows)

        total_scanned += len(rows)
        total_invalid += len(invalid_rows)
        total_dup_canonical += dup_canonical
        total_dup_cross_shard += dup_cross_shard
        total_kept += len(kept_rows)

        tier_dist = Counter(tier_key(r) for r in kept_rows)
        source_dist = Counter(r["source"] for r in kept_rows)

        shard_reports.append(
            {
                "name": name,
                "path": str(path),
                "scanned": len(rows),
                "invalid": len(invalid_rows),
                "invalid_sample": invalid_rows[:5],
                "dup_canonical": dup_canonical,
                "dup_cross_shard": dup_cross_shard,
                "kept": len(kept_rows),
                "tier_dist": dict(tier_dist),
                "source_dist": dict(source_dist),
            }
        )

        print(
            f"[{name}] scanned={len(rows)} invalid={len(invalid_rows)} "
            f"dup_canonical={dup_canonical} dup_cross_shard={dup_cross_shard} "
            f"kept={len(kept_rows)}"
        )

    if not BACKUP.exists():
        BACKUP.write_text(CANONICAL.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Wrote backup {BACKUP}")
    else:
        print(f"Backup already exists, not overwriting: {BACKUP}")

    with CANONICAL.open("a", encoding="utf-8") as f:
        for r in surviving:
            f.write(json.dumps(r, ensure_ascii=False))
            f.write("\n")

    final_count = canonical_count + len(surviving)
    print(
        f"Canonical: before={canonical_count} appended={len(surviving)} "
        f"after={final_count}"
    )

    lines: list[str] = []
    lines.append("# Wave-4 Synthetic Expansion -- Generation Report")
    lines.append("")
    lines.append(
        "Four generator agents produced 2000 input rows (500 per shard) under "
        "cross_family=false (Anthropic-only generation). This report documents "
        "the merge into the canonical synthetic_route_labels.jsonl."
    )
    lines.append("")
    lines.append("## Inputs")
    lines.append("")
    lines.append("| Shard | Path | Focus |")
    lines.append("|-------|------|-------|")
    lines.append("| genA  | data/synthetic_shards/genA/chunk.jsonl | Haiku + Sonnet-low |")
    lines.append("| genB  | data/synthetic_shards/genB/chunk.jsonl | Sonnet-medium |")
    lines.append("| genC  | data/synthetic_shards/genC/chunk.jsonl | Sonnet-high + Opus-low |")
    lines.append("| genD  | data/synthetic_shards/genD/chunk.jsonl | Opus-medium/high |")
    lines.append("")
    lines.append("## Per-shard merge summary")
    lines.append("")
    lines.append(
        "| Shard | Scanned | Invalid (dropped) | Dup vs canonical | "
        "Dup cross-shard | Kept |"
    )
    lines.append(
        "|-------|---------|-------------------|------------------|"
        "-----------------|------|"
    )
    for sr in shard_reports:
        lines.append(
            f"| {sr['name']} | {sr['scanned']} | {sr['invalid']} | "
            f"{sr['dup_canonical']} | {sr['dup_cross_shard']} | {sr['kept']} |"
        )
    lines.append(
        f"| **total** | {total_scanned} | {total_invalid} | {total_dup_canonical} | "
        f"{total_dup_cross_shard} | {total_kept} |"
    )
    lines.append("")
    lines.append("## Dropped (invalid) rows")
    lines.append("")
    any_invalid = False
    for sr in shard_reports:
        if sr["invalid"] == 0:
            continue
        any_invalid = True
        lines.append(f"### {sr['name']}: {sr['invalid']} row(s) dropped")
        lines.append("")
        lines.append(
            "Validation failures against the v3 schema (tools/validate_corpus.py). "
            "Per coordinator policy, malformed rows are skipped rather than "
            "silently normalized."
        )
        lines.append("")
        lines.append("Sample of failing rows (up to 5):")
        lines.append("")
        for rid, errs in sr["invalid_sample"]:
            lines.append(f"- `{rid}`")
            for e in errs:
                lines.append(f"  - {e}")
        lines.append("")
    if not any_invalid:
        lines.append("No invalid rows detected across the four shards.")
        lines.append("")
    lines.append("## Kept-row route distribution (by shard)")
    lines.append("")
    for sr in shard_reports:
        if sr["kept"] == 0:
            lines.append(f"- {sr['name']}: 0 rows kept")
            continue
        parts = ", ".join(
            f"{m}/{e}={n}" for (m, e), n in sorted(sr["tier_dist"].items())
        )
        src_parts = ", ".join(f"{k}={v}" for k, v in sorted(sr["source_dist"].items()))
        lines.append(f"- {sr['name']}: {parts} ({src_parts})")
    lines.append("")
    lines.append("## Canonical file")
    lines.append("")
    lines.append(f"- Before merge: {canonical_count} rows")
    lines.append(f"- Appended: {len(surviving)} rows")
    lines.append(f"- After merge: {final_count} rows")
    lines.append("- Backup: `data/synthetic_route_labels.pre_wave4.jsonl`")
    lines.append("")
    lines.append("## Dedup method")
    lines.append("")
    lines.append(
        "Prompts are normalized by lowercasing and collapsing whitespace, then "
        "compared as exact strings. A new-shard row matching the normalized "
        "prompt of any canonical row is dropped (`dup_canonical`). Remaining "
        "new-shard rows are deduped against each other in shard order genA, "
        "genB, genC, genD; subsequent duplicates are dropped (`dup_cross_shard`)."
    )
    lines.append("")

    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {REPORT}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
