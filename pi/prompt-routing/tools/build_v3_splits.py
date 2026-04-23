"""Build train/dev/eval v3 splits with family-disjoint assignment.

Reads:
  data/seed_route_labels.jsonl
  data/curated_history_route_labels.jsonl
  data/synthetic_route_labels.jsonl

Writes:
  data/train_v3.jsonl
  data/dev_v3.jsonl
  data/eval_v3.jsonl

Policy:
  - Splits are assigned by family_id. No family_id may appear in >1 split.
  - Seed and history rows carry fine-grained unique family_ids (one row per
    family). They are shuffled deterministically (seeded) and distributed
    70/15/15.
  - Synthetic rows share coarse family_ids (F01..F12). Whole families are
    assigned to a split atomically; target ~70/15/15 by row count, with
    family-boundary adjustments.
  - Near-duplicate check on eval rows vs train+dev using a 64-bit shingle
    hash (Hamming distance <= 3 out of 64 bits, approx cosine > 0.9 on 4-gram
    token bag).
"""

from __future__ import annotations

import hashlib
import json
import random
import re
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "data"

SEED_PATH = DATA / "seed_route_labels.jsonl"
HIST_PATH = DATA / "curated_history_route_labels.jsonl"
SYN_PATH = DATA / "synthetic_route_labels.jsonl"
RELABEL_PATH = DATA / "relabeled_mid_tier_route_labels.jsonl"

TRAIN_PATH = DATA / "train_v3.jsonl"
DEV_PATH = DATA / "dev_v3.jsonl"
EVAL_PATH = DATA / "eval_v3.jsonl"

RANDOM_SEED = 20260422
TARGET = {"train": 0.70, "dev": 0.15, "eval": 0.15}


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False))
            f.write("\n")


_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


def _tokens(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text)]


def _shingle_hash(text: str, k: int = 4) -> int:
    """64-bit simhash over k-gram token shingles."""
    toks = _tokens(text)
    if len(toks) < k:
        shingles = [" ".join(toks)] if toks else [""]
    else:
        shingles = [" ".join(toks[i : i + k]) for i in range(len(toks) - k + 1)]
    v = [0] * 64
    for s in shingles:
        h = int.from_bytes(hashlib.blake2b(s.encode("utf-8"), digest_size=8).digest(), "big")
        for b in range(64):
            if (h >> b) & 1:
                v[b] += 1
            else:
                v[b] -= 1
    out = 0
    for b in range(64):
        if v[b] >= 0:
            out |= 1 << b
    return out


def _hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def assign_seed_families(rows: list[dict]) -> list[dict]:
    """Seed rows already have per-row unique family_ids. We keep them.

    Policy note: each seed row is treated as its own family. This guarantees
    family-disjoint splits trivially, preserves the per-row provenance
    embedded in the original fam-*-<hash> identifiers from build_seed_labels,
    and avoids collapsing 958 rows into a handful of mega-families which
    would make clean 70/15/15 proportions impossible.
    """
    return rows


def assign_history_families(rows: list[dict]) -> list[dict]:
    """History rows already have per-row unique family_ids. Same policy as seed."""
    return rows


def split_by_family(
    rows: list[dict],
    rng: random.Random,
) -> tuple[list[dict], list[dict], list[dict]]:
    """Assign whole families to a split. Rows within a family stay together."""
    by_family: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_family[r["family_id"]].append(r)

    families = sorted(by_family.keys())
    rng.shuffle(families)

    total = sum(len(v) for v in by_family.values())
    target_train = int(round(total * TARGET["train"]))
    target_dev = int(round(total * TARGET["dev"]))

    train: list[dict] = []
    dev: list[dict] = []
    evl: list[dict] = []

    for fid in families:
        group = by_family[fid]
        if len(train) < target_train:
            train.extend(group)
        elif len(dev) < target_dev:
            dev.extend(group)
        else:
            evl.extend(group)

    return train, dev, evl


def dedup_eval(
    eval_rows: list[dict],
    reference_rows: list[dict],
    hamming_threshold: int = 6,
) -> tuple[list[dict], int]:
    """Drop eval rows whose prompt is a near-dup of any train+dev prompt.

    Uses 64-bit shingle hash with Hamming distance <= threshold as the
    collision criterion (roughly cosine > 0.9 on 4-gram token bags).
    """
    ref_hashes = [_shingle_hash(r["prompt"]) for r in reference_rows]
    kept: list[dict] = []
    dropped = 0
    for r in eval_rows:
        h = _shingle_hash(r["prompt"])
        collision = any(_hamming(h, rh) <= hamming_threshold for rh in ref_hashes)
        if collision:
            dropped += 1
        else:
            kept.append(r)
    return kept, dropped


def main() -> int:
    rng = random.Random(RANDOM_SEED)

    seed_rows = assign_seed_families(load_jsonl(SEED_PATH))
    hist_rows = assign_history_families(load_jsonl(HIST_PATH))
    syn_rows = load_jsonl(SYN_PATH)
    relabel_rows = load_jsonl(RELABEL_PATH) if RELABEL_PATH.exists() else []

    all_rows = seed_rows + hist_rows + syn_rows + relabel_rows
    print(
        f"Loaded: seed={len(seed_rows)} history={len(hist_rows)} "
        f"synthetic={len(syn_rows)} relabel={len(relabel_rows)} "
        f"total={len(all_rows)}"
    )

    train, dev, evl = split_by_family(all_rows, rng)
    print(f"Pre-dedup splits: train={len(train)} dev={len(dev)} eval={len(evl)}")

    evl, dropped = dedup_eval(evl, train + dev)
    print(f"Near-dup drops in eval: {dropped}")
    print(f"Final splits: train={len(train)} dev={len(dev)} eval={len(evl)}")

    # B6: confirm family disjoint
    train_fids = {r["family_id"] for r in train}
    dev_fids = {r["family_id"] for r in dev}
    eval_fids = {r["family_id"] for r in evl}
    assert train_fids.isdisjoint(eval_fids), "B6: train/eval family leak"
    assert dev_fids.isdisjoint(eval_fids), "B6: dev/eval family leak"
    assert train_fids.isdisjoint(dev_fids), "B6: train/dev family leak"
    print("B6 OK: family ids disjoint across all three splits")

    write_jsonl(TRAIN_PATH, train)
    write_jsonl(DEV_PATH, dev)
    write_jsonl(EVAL_PATH, evl)
    print(f"Wrote {TRAIN_PATH}")
    print(f"Wrote {DEV_PATH}")
    print(f"Wrote {EVAL_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
