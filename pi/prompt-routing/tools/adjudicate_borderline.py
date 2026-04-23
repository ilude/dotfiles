"""Adjudicate catastrophic-under-routing candidates against the v3 rubric.

Workflow:
  1. Train the TF-IDF + LogisticRegression baseline on the current train_v3
     split and apply it to every row in all four source JSONL files (seed,
     curated history, mid-tier relabel, synthetic). We score source rows
     rather than train/dev/eval splits so decisions can be written back to
     the underlying files without split-specific bookkeeping.
  2. Flag rows whose ground-truth model_tier is in {Sonnet, Opus} but for
     which the classifier's predicted Haiku probability > 0.50 and the
     predicted effort is in {none, low, medium}. That's the full
     "catastrophic candidate" pool.
  3. Emit data/adjudication_queue.jsonl with prompt text, current label,
     top-3 predicted (tier, effort) with probabilities, and the row's
     ambiguity / domain / task_type fields.

Then a second subcommand (`decide`) applies a rule-based adjudicator that
implements the v3 rubric heuristics:

  - KEEP when the prompt has architecture / security / migration / cross-
    cutting signals, or when ambiguity is already `ambiguous` (bias up).
  - DOWNGRADE_TO_HAIKU when the prompt is short (<30 tokens), has a
    mechanical / rename / format signal, and has no architecture signals.
  - CLARIFY when the prompt is borderline on length/signals but has
    ambiguous phrasing -- keep the label, tag ambiguity=borderline.
  - REMOVE only when the prompt is degenerate (<3 tokens, or empty).

The default bias is "up for safety" per the rubric: when in doubt, KEEP.

Outputs:
  - data/adjudication_queue.jsonl       (queue subcommand)
  - data/adjudication_decisions.jsonl   (decide subcommand)
  - data/adjudication_summary.json      (decide subcommand, distribution)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "data"

TRAIN = DATA / "train_v3.jsonl"

SOURCE_FILES = {
    "seed": DATA / "seed_route_labels.jsonl",
    "history": DATA / "curated_history_route_labels.jsonl",
    "relabel": DATA / "relabeled_mid_tier_route_labels.jsonl",
    "synthetic": DATA / "synthetic_route_labels.jsonl",
}

QUEUE_PATH = DATA / "adjudication_queue.jsonl"
DECISIONS_PATH = DATA / "adjudication_decisions.jsonl"
SUMMARY_PATH = DATA / "adjudication_summary.json"

MODEL_ORDER = ["Haiku", "Sonnet", "Opus"]
EFFORT_ORDER = ["none", "low", "medium", "high"]

HAIKU_PROB_THRESHOLD = 0.50

ARCH_KEYWORDS = [
    "architect", "architecture", "design pattern", "distributed",
    "microservice", "microservices", "scalab", "consistency",
    "consensus", "event sourcing", "cqrs", "saga",
    "security", "threat model", "vulnerab", "authentic", "authoriz",
    "oauth", "jwt", "bcrypt", "crypt", "tls", "mtls", "sso",
    "migration", "migrate", "migrating", "rollout", "rollback",
    "schema change", "backfill", "cutover", "zero-downtime",
    "kubernetes", "k8s", "helm chart", "terraform module",
    "refactor", "redesign", "rearchitect", "cross-cutting",
    "trade-off", "tradeoff", "trade off",
    "concurren", "race condition", "deadlock", "lock-free",
    "performance optimization", "optimize", "profiling",
    "incident", "post-mortem", "postmortem", "rca",
    "compliance", "gdpr", "pci", "hipaa", "audit",
    "observability", "telemetry", "instrument",
    "api contract", "backward compat", "breaking change",
]

MECHANICAL_KEYWORDS = [
    "rename ", " rename", "pretty print", "pretty-print",
    "convert to json", "convert to yaml",
    "lowercase", "uppercase", "title case",
    "strip whitespace",
    "reverse the string", "reverse a string",
    "sort this list", "sort the list",
    "list files", "list the files",
]

TOKEN_RE = re.compile(r"\S+")


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


def token_count(text: str) -> int:
    return len(TOKEN_RE.findall(text))


def contains_any(text: str, keywords: list[str]) -> list[str]:
    lo = text.lower()
    return [k for k in keywords if k in lo]


def train_classifier(train_rows: list[dict]):
    vec = TfidfVectorizer(
        ngram_range=(1, 3),
        min_df=2,
        max_df=0.95,
        sublinear_tf=True,
        strip_accents="unicode",
        lowercase=True,
        max_features=20000,
    )
    X = [r["prompt"] for r in train_rows]
    y_tier = [r["cheapest_acceptable_route"]["model_tier"] for r in train_rows]
    y_effort = [r["cheapest_acceptable_route"]["effort"] for r in train_rows]

    Xv = vec.fit_transform(X)

    clf_tier = LogisticRegression(
        C=4.0,
        class_weight="balanced",
        max_iter=4000,
        solver="lbfgs",
        random_state=20260422,
    )
    clf_tier.fit(Xv, y_tier)

    clf_effort = LogisticRegression(
        C=4.0,
        class_weight="balanced",
        max_iter=4000,
        solver="lbfgs",
        random_state=20260422,
    )
    clf_effort.fit(Xv, y_effort)

    return vec, clf_tier, clf_effort


def queue_cmd(_args: argparse.Namespace) -> int:
    train_rows = load_jsonl(TRAIN)
    print(f"Training TF-IDF + LR on {len(train_rows)} train rows")
    vec, clf_tier, clf_effort = train_classifier(train_rows)

    tier_classes = list(clf_tier.classes_)
    effort_classes = list(clf_effort.classes_)
    haiku_idx = tier_classes.index("Haiku") if "Haiku" in tier_classes else -1

    queue: list[dict] = []
    scanned = 0
    for source_key, path in SOURCE_FILES.items():
        if not path.exists():
            print(f"WARNING: {path} missing, skipping")
            continue
        rows = load_jsonl(path)
        scanned += len(rows)
        prompts = [r["prompt"] for r in rows]
        if not prompts:
            continue
        Xq = vec.transform(prompts)
        tier_probs_all = clf_tier.predict_proba(Xq)
        effort_probs_all = clf_effort.predict_proba(Xq)

        for r, tp, ep in zip(rows, tier_probs_all, effort_probs_all):
            gt_tier = r["cheapest_acceptable_route"]["model_tier"]
            if gt_tier not in ("Sonnet", "Opus"):
                continue
            haiku_p = float(tp[haiku_idx]) if haiku_idx >= 0 else 0.0
            if haiku_p <= HAIKU_PROB_THRESHOLD:
                continue
            # Predicted effort (argmax) must be in {none, low, medium}
            pred_effort_idx = int(ep.argmax())
            pred_effort = effort_classes[pred_effort_idx]
            if pred_effort not in ("none", "low", "medium"):
                continue

            top3_tier = sorted(
                zip(tier_classes, tp.tolist()), key=lambda x: -x[1]
            )[:3]
            top3_effort = sorted(
                zip(effort_classes, ep.tolist()), key=lambda x: -x[1]
            )[:3]

            queue.append({
                "prompt_id": r["prompt_id"],
                "family_id": r.get("family_id"),
                "source_file": source_key,
                "source": r["source"],
                "domain": r.get("domain"),
                "task_type": r.get("task_type"),
                "ambiguity": r.get("ambiguity"),
                "prompt": r["prompt"],
                "token_count": token_count(r["prompt"]),
                "current_cheapest_acceptable_route": r["cheapest_acceptable_route"],
                "classifier_top3_tier": [
                    {"model_tier": t, "prob": round(p, 4)} for t, p in top3_tier
                ],
                "classifier_top3_effort": [
                    {"effort": t, "prob": round(p, 4)} for t, p in top3_effort
                ],
                "arch_signals": contains_any(r["prompt"], ARCH_KEYWORDS),
                "mech_signals": contains_any(r["prompt"], MECHANICAL_KEYWORDS),
            })

    print(f"Scanned {scanned} source rows, flagged {len(queue)} candidates")
    write_jsonl(QUEUE_PATH, queue)
    print(f"Wrote {QUEUE_PATH}")
    return 0


def choose_haiku_effort(prompt: str) -> str:
    """Pick an effort tier for a DOWNGRADE_TO_HAIKU verdict.

    Short mechanical prompts get `low`; longer ones get `medium` to match the
    rubric's "raise effort before promoting model tier" guidance.
    """
    tc = token_count(prompt)
    if tc < 20:
        return "low"
    return "medium"


def adjudicate_row(row: dict) -> dict:
    """Apply rubric heuristics to a single queue row. Returns a decision dict."""
    prompt = row["prompt"]
    tc = row["token_count"]
    arch = row["arch_signals"]
    mech = row["mech_signals"]
    ambiguity = row.get("ambiguity", "clear")
    task_type = row.get("task_type", "")
    current = row["current_cheapest_acceptable_route"]

    if tc < 3:
        return {
            "prompt_id": row["prompt_id"],
            "source_file": row["source_file"],
            "decision": "REMOVE",
            "rationale": f"Degenerate prompt ({tc} tokens)",
        }

    if arch:
        return {
            "prompt_id": row["prompt_id"],
            "source_file": row["source_file"],
            "decision": "KEEP",
            "rationale": (
                f"Architecture/security/migration signals present: "
                f"{arch[:3]}; rubric biases up for safety"
            ),
        }

    # Trivial factual / mechanical_edit rows are clear Haiku territory per
    # rubric 3.3 regardless of the source row's ambiguity tag. Several
    # synthetic rows labeled `ambiguous` are not actually ambiguous
    # ("Which planet is closest to the Sun?"); the rubric applies to the
    # prompt itself, not the tag.
    trivial_task = (
        (task_type == "factual" and tc < 30)
        or (task_type == "mechanical_edit" and tc < 30)
    )
    if trivial_task:
        return {
            "prompt_id": row["prompt_id"],
            "source_file": row["source_file"],
            "decision": "DOWNGRADE_TO_HAIKU",
            "rationale": (
                f"Trivial {task_type} at {tc} tokens; rubric 3.3 puts this at Haiku"
            ),
            "new_cheapest_acceptable_route": {
                "model_tier": "Haiku",
                "effort": "none" if task_type == "factual" and tc < 15 else "low",
            },
        }

    # After the trivial check: reinstate the rubric 3.5 "ambiguous biases
    # up" rule for genuinely ambiguous rows that do not fall in the
    # factual/mechanical_edit carve-out above.
    if ambiguity == "ambiguous":
        return {
            "prompt_id": row["prompt_id"],
            "source_file": row["source_file"],
            "decision": "KEEP",
            "rationale": "ambiguity=ambiguous with non-trivial task_type; rubric biases up",
        }

    if task_type in ("design", "plan", "analysis") and current["model_tier"] == "Opus":
        return {
            "prompt_id": row["prompt_id"],
            "source_file": row["source_file"],
            "decision": "KEEP",
            "rationale": (
                f"task_type={task_type} with Opus label; rubric reserves "
                f"Opus for design/cross-cutting work"
            ),
        }

    # Short explicit mechanical-signal prompts: also DOWNGRADE candidates.
    if tc < 30 and mech and task_type != "code_write":
        new_effort = choose_haiku_effort(prompt)
        return {
            "prompt_id": row["prompt_id"],
            "source_file": row["source_file"],
            "decision": "DOWNGRADE_TO_HAIKU",
            "rationale": (
                f"Short ({tc} tokens), mechanical/factual/rewrite "
                f"(task_type={task_type}, mech={mech[:2] or None}); Haiku is "
                f"cheapest acceptable"
            ),
            "new_cheapest_acceptable_route": {
                "model_tier": "Haiku",
                "effort": new_effort,
            },
        }

    # Short but not clearly mechanical: CLARIFY -- keep label, mark borderline.
    if tc < 30 and ambiguity != "borderline":
        return {
            "prompt_id": row["prompt_id"],
            "source_file": row["source_file"],
            "decision": "CLARIFY",
            "rationale": (
                f"Short ({tc} tokens) with no clear mechanical signal and no "
                f"architecture signal; keep label, flag as borderline"
            ),
            "new_ambiguity": "borderline",
        }

    # Longer prompts with no architecture signals -- bias up, KEEP.
    return {
        "prompt_id": row["prompt_id"],
        "source_file": row["source_file"],
        "decision": "KEEP",
        "rationale": (
            f"No architecture signals but prompt length {tc} tokens and "
            f"task_type={task_type}; rubric biases up when ambiguous"
        ),
    }


def decide_cmd(_args: argparse.Namespace) -> int:
    if not QUEUE_PATH.exists():
        print(f"ERROR: {QUEUE_PATH} not found; run `queue` first", file=sys.stderr)
        return 2

    queue = load_jsonl(QUEUE_PATH)
    decisions = [adjudicate_row(r) for r in queue]

    counts: dict[str, int] = {}
    for d in decisions:
        counts[d["decision"]] = counts.get(d["decision"], 0) + 1

    write_jsonl(DECISIONS_PATH, decisions)
    summary = {
        "queue_size": len(queue),
        "decision_counts": counts,
        "downgrade_rate": round(
            counts.get("DOWNGRADE_TO_HAIKU", 0) / max(1, len(queue)), 4
        ),
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Queue size: {len(queue)}")
    for k, v in sorted(counts.items()):
        print(f"  {k}: {v}")
    print(f"Downgrade rate: {summary['downgrade_rate']}")
    print(f"Wrote {DECISIONS_PATH}")
    print(f"Wrote {SUMMARY_PATH}")

    if summary["downgrade_rate"] > 0.70:
        print(
            "WARNING: downgrade rate > 0.70 -- rubric says ambiguous biases "
            "up. Review heuristics.",
            file=sys.stderr,
        )
    return 0


def apply_cmd(_args: argparse.Namespace) -> int:
    if not DECISIONS_PATH.exists():
        print(f"ERROR: {DECISIONS_PATH} not found; run `decide` first", file=sys.stderr)
        return 2

    decisions = load_jsonl(DECISIONS_PATH)
    by_prompt_id: dict[str, dict] = {d["prompt_id"]: d for d in decisions}
    by_source: dict[str, list[dict]] = {}
    for d in decisions:
        by_source.setdefault(d["source_file"], []).append(d)

    totals_before: dict[str, int] = {}
    totals_after: dict[str, int] = {}

    for source_key, path in SOURCE_FILES.items():
        if not path.exists():
            continue
        rows = load_jsonl(path)
        totals_before[source_key] = len(rows)
        new_rows: list[dict] = []
        changed = 0
        removed = 0
        for r in rows:
            pid = r.get("prompt_id")
            dec = by_prompt_id.get(pid)
            if dec is None or dec["source_file"] != source_key:
                new_rows.append(r)
                continue
            verdict = dec["decision"]
            if verdict == "KEEP":
                new_rows.append(r)
                continue
            if verdict == "REMOVE":
                removed += 1
                continue
            if verdict == "DOWNGRADE_TO_HAIKU":
                new_route = dec["new_cheapest_acceptable_route"]
                r["cheapest_acceptable_route"] = new_route
                if "labels" in r and isinstance(r["labels"], dict):
                    if "cheapest_acceptable_route" in r["labels"]:
                        r["labels"]["cheapest_acceptable_route"] = new_route
                # Drop route_judgments; they reference the old route and
                # would fail schema validation (invariant 2.3).
                r.pop("route_judgments", None)
                if isinstance(r.get("labels"), dict):
                    r["labels"].pop("route_judgments", None)
                changed += 1
                new_rows.append(r)
                continue
            if verdict == "CLARIFY":
                new_amb = dec.get("new_ambiguity", "borderline")
                r["ambiguity"] = new_amb
                changed += 1
                new_rows.append(r)
                continue
            # Unknown verdict: keep row untouched.
            new_rows.append(r)

        write_jsonl(path, new_rows)
        totals_after[source_key] = len(new_rows)
        print(
            f"{source_key}: {len(rows)} -> {len(new_rows)} "
            f"(changed={changed}, removed={removed})"
        )

    report = {
        "totals_before": totals_before,
        "totals_after": totals_after,
    }
    (DATA / "adjudication_apply_report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(f"Wrote {DATA / 'adjudication_apply_report.json'}")
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("queue", help="Build adjudication_queue.jsonl from source files")
    sub.add_parser("decide", help="Apply rubric heuristics, write decisions")
    sub.add_parser("apply", help="Apply decisions to underlying JSONL files")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.cmd == "queue":
        return queue_cmd(args)
    if args.cmd == "decide":
        return decide_cmd(args)
    if args.cmd == "apply":
        return apply_cmd(args)
    return 1


if __name__ == "__main__":
    sys.exit(main())
