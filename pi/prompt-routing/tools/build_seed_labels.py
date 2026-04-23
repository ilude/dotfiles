"""
Build seed route-labeled JSONL files for the v3 cost-first router corpus.

Reads:
  pi/prompt-routing/data/migration_candidates.csv
  pi/prompt-routing/data/training_corpus.json
  pi/prompt-routing/labeled_history.csv

Writes:
  pi/prompt-routing/data/seed_route_labels.jsonl       (from training_corpus.json safe-seed)
  pi/prompt-routing/data/curated_history_route_labels.jsonl  (from labeled_history.csv safe-seed)
  pi/prompt-routing/data/annotation_queue.csv          (high-ambiguity rows)

Route assignment logic follows corpus-v3-schema.md section 4 migration priors,
with task_type and domain inference from prompt text for disambiguation.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Repo root resolution
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent  # tools/ -> prompt-routing/ -> pi/ -> root
PROMPT_ROUTING = REPO_ROOT / "pi" / "prompt-routing"
DATA_DIR = PROMPT_ROUTING / "data"

TRAINING_CORPUS = DATA_DIR / "training_corpus.json"
LABELED_HISTORY = PROMPT_ROUTING / "labeled_history.csv"
MIGRATION_CANDIDATES = DATA_DIR / "migration_candidates.csv"

OUT_SEED = DATA_DIR / "seed_route_labels.jsonl"
OUT_HISTORY = DATA_DIR / "curated_history_route_labels.jsonl"
OUT_QUEUE = DATA_DIR / "annotation_queue.csv"

# ---------------------------------------------------------------------------
# Domain / task_type inference helpers
# ---------------------------------------------------------------------------

_DOMAIN_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(
        r"\b(security|auth|authentication|authoriz|bcrypt|sha\-?256|hash|encrypt|"
        r"jwt|oauth|csrf|xss|sql injection|vuln|cve|pentest)\b",
        re.I,
    ), "security"),
    (re.compile(
        r"\b(architect|design|system design|distributed|microservice|saas|"
        r"multi.tenant|scalab|high.availab|consensus|raft|crdt|eventual)\b",
        re.I,
    ), "architecture"),
    (re.compile(
        r"\b(kubernetes|k8s|helm|eks|ecs|docker|container|cilium|coredns|pod|"
        r"node group|ingress|terraform|ansible|cloudwatch|aws|gcp|azure|infra)\b",
        re.I,
    ), "devops"),
    (re.compile(
        r"\b(sql|postgres|mysql|database|db|migration|schema|query|index|join|"
        r"transaction|orm)\b",
        re.I,
    ), "sql"),
    (re.compile(
        r"\b(react|vue|angular|typescript|javascript|ts|js|css|html|frontend|"
        r"component|hook|redux|next\.?js)\b",
        re.I,
    ), "typescript"),
    (re.compile(
        r"\b(python|django|flask|fastapi|pandas|numpy|scipy|sklearn|pytorch|"
        r"tensorflow)\b",
        re.I,
    ), "python"),
    (re.compile(
        r"\b(data science|machine learning|ml|model|training|embedding|vector|"
        r"classification|regression|nlp)\b",
        re.I,
    ), "data_science"),
    (re.compile(
        r"\b(write|rewrite|explain|summariz|describe|what is|how do|document|"
        r"comment|readme|doc)\b",
        re.I,
    ), "writing"),
    (re.compile(
        r"\b(bash|shell|cli|terminal|script|grep|awk|sed|git|ssh|tar|zip|curl|"
        r"wget)\b",
        re.I,
    ), "devops"),
    (re.compile(
        r"\b(go|golang|rust|java|c\+\+|ruby|swift|kotlin|scala)\b",
        re.I,
    ), "general"),
]


def infer_domain(prompt: str) -> str:
    for pattern, domain in _DOMAIN_PATTERNS:
        if pattern.search(prompt):
            return domain
    return "general"


_TASK_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(
        r"^(what is|how (do|does|can)|why (is|does)|when (should|do)|where "
        r"(is|are)|is there|does .+ (support|have))",
        re.I,
    ), "factual"),
    (re.compile(
        r"\b(audit|review for|check for|find (bugs|vulnerabilities|issues)|"
        r"security review)\b",
        re.I,
    ), "code_review"),
    (re.compile(
        r"\b(debug|fix|why (is|does|isn|doesn)|not (working|rendering|running)|"
        r"error|exception|fails)\b",
        re.I,
    ), "code_debug"),
    (re.compile(
        r"\b(design|architect|plan for|strategy|trade.?off|recommend approach|"
        r"how should we)\b",
        re.I,
    ), "design"),
    (re.compile(
        r"\b(analyze|analysis|compare|evaluate|assess|measure|profil)\b",
        re.I,
    ), "analysis"),
    (re.compile(
        r"\b(rewrite|refactor|convert|migrate|transform|change.*to use|replace)\b",
        re.I,
    ), "rewrite"),
    (re.compile(
        r"\b(explain|describe|what does|walk me through|tell me about|"
        r"summariz)\b",
        re.I,
    ), "explain"),
    (re.compile(
        r"\b(implement|write a|create a|build a|add a|generate|make a)\b",
        re.I,
    ), "code_write"),
    (re.compile(
        r"\b(edit|rename|move|delete|update.*line|change.*line|add.*to.*file)\b",
        re.I,
    ), "mechanical_edit"),
    (re.compile(
        r"\b(plan|outline|roadmap|breakdown|prioritiz|tasks for|steps to)\b",
        re.I,
    ), "plan"),
]


def infer_task_type(prompt: str) -> str:
    for pattern, task_type in _TASK_PATTERNS:
        if pattern.search(prompt):
            return task_type
    return "code_write"


# ---------------------------------------------------------------------------
# Route assignment
# ---------------------------------------------------------------------------

def _route(model_tier: str, effort: str) -> dict[str, str]:
    return {"model_tier": model_tier, "effort": effort}


def assign_route_from_legacy(
    legacy_label: str,
    prompt: str,
    source_tag: str,
) -> tuple[dict[str, str], str, str, str]:
    """
    Return (cheapest_acceptable_route, domain, task_type, ambiguity).

    Migration priors from corpus-v3-schema.md section 4:
      low  -> (Haiku, low)
      mid  -> (Sonnet, medium)   -- only used for relabel rows, not called here
      high -> (Opus, medium)     -- audit says architectural subset maps to Opus medium

    Overrides applied:
    - High-tier architectural prompts involving security: route (Opus, high) --
      security design has higher failure cost per rubric 3.5.
    - Low-tier factual/explain prompts: route (Haiku, none) for pure recall tasks.
    - Low-tier mechanical_edit: (Haiku, low).
    """
    domain = infer_domain(prompt)
    task_type = infer_task_type(prompt)
    ambiguity = "clear"

    if legacy_label == "low":
        if task_type == "factual" and domain not in ("architecture", "security"):
            route = _route("Haiku", "none")
        else:
            route = _route("Haiku", "low")

    elif legacy_label == "high":
        # Architectural subset: default (Opus, medium) per schema section 4
        # Security-sensitive design: (Opus, high) per rubric 3.5 ambiguity bias
        if domain == "security" or (
            task_type in ("design",) and domain in ("security", "architecture")
        ):
            route = _route("Opus", "high")
            ambiguity = "borderline"
        else:
            route = _route("Opus", "medium")

    else:
        # Should not be called for mid -- fallback
        route = _route("Sonnet", "medium")

    return route, domain, task_type, ambiguity


# ---------------------------------------------------------------------------
# Family ID generation
# ---------------------------------------------------------------------------

def make_family_id(prompt: str, domain: str, task_type: str) -> str:
    """
    Deterministic family_id from a normalized prompt fingerprint.
    Prompts that are paraphrases of the same underlying task will get different
    IDs here since we do not have explicit family grouping in the source data.
    In T7 the near-dup check will merge truly duplicate families.
    """
    normalized = re.sub(r"\s+", " ", prompt.strip().lower())[:120]
    digest = hashlib.sha256(f"{domain}:{task_type}:{normalized}".encode()).hexdigest()[:12]
    return f"fam-{domain[:8]}-{digest}"


# ---------------------------------------------------------------------------
# Build seed_route_labels.jsonl from training_corpus.json
# ---------------------------------------------------------------------------

def build_training_corpus_seed(
    candidates: list[dict[str, str]], tc_data: dict[str, Any]
) -> list[dict[str, Any]]:
    """
    Process training_corpus.json safe-seed rows (tc-low-NNNN and tc-high-NNNN).
    """
    # Build index: tc-low-NNNN -> prompt text
    tc_index: dict[str, str] = {}
    for tier_key in ("low", "mid", "high"):
        for idx, prompt_text in enumerate(tc_data[tier_key]):
            pid = f"tc-{tier_key}-{idx:04d}"
            tc_index[pid] = prompt_text

    # Filter to safe-seed candidates from training_corpus.json
    safe_seed_tc = [
        r for r in candidates
        if r["source"] == "training_corpus.json"
        and r["bucket"] == "safe low-cost seed"
        and r["current_label"] in ("low", "high")
    ]

    rows: list[dict[str, Any]] = []
    for cand in safe_seed_tc:
        pid = cand["prompt_id"]
        prompt_text = tc_index.get(pid, "")
        if not prompt_text:
            continue

        legacy_label = cand["current_label"]
        route, domain, task_type, ambiguity = assign_route_from_legacy(
            legacy_label, prompt_text, "seed_v2"
        )

        family_id = make_family_id(prompt_text, domain, task_type)

        row: dict[str, Any] = {
            "prompt_id": pid,
            "family_id": family_id,
            "prompt": prompt_text,
            "source": "seed_v2",
            "domain": domain,
            "task_type": task_type,
            "ambiguity": ambiguity,
            "cheapest_acceptable_route": route,
            "labels": {
                "cheapest_acceptable_route": route,
                "complexity_tier": legacy_label,
            },
            "complexity_tier": legacy_label,
        }
        rows.append(row)

    return rows


# ---------------------------------------------------------------------------
# Build curated_history_route_labels.jsonl from labeled_history.csv
# ---------------------------------------------------------------------------

def build_history_seed(
    candidates: list[dict[str, str]],
    lh_rows: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """
    Process labeled_history.csv safe-seed rows.

    Returns (curated_rows, annotation_queue_rows).
    annotation_queue collects the 43 high-ambiguity rows.
    """
    # Build history index by row position (lh-NNNN -> lh_rows[N])
    def lh_row_for(pid: str) -> dict[str, str] | None:
        idx = int(pid.split("-")[1])
        return lh_rows[idx] if idx < len(lh_rows) else None

    hist_safe_seed = [
        r for r in candidates
        if r["source"] == "labeled_history.csv"
        and r["bucket"] == "safe low-cost seed"
    ]

    hist_high_amb = [
        r for r in candidates
        if r["source"] == "labeled_history.csv"
        and r["bucket"] == "high ambiguity"
    ]

    curated: list[dict[str, Any]] = []
    for cand in hist_safe_seed:
        pid = cand["prompt_id"]
        lh = lh_row_for(pid)
        if lh is None:
            continue

        prompt_text = lh["prompt"].strip()
        if not prompt_text:
            continue

        # Strict curation: skip continuation fragments even in safe-seed bucket
        continuations = re.compile(
            r"^(also|and |yes,|actually |okay|ok |sure,|right,|got it|sounds "
            r"good)",
            re.I,
        )
        if continuations.match(prompt_text) or len(prompt_text.split()) < 3:
            continue

        legacy_label = cand["current_label"]
        if legacy_label not in ("low", "high"):
            continue

        route, domain, task_type, ambiguity = assign_route_from_legacy(
            legacy_label, prompt_text, "history_curated"
        )

        family_id = make_family_id(prompt_text, domain, task_type)

        row: dict[str, Any] = {
            "prompt_id": pid,
            "family_id": family_id,
            "prompt": prompt_text,
            "source": "history_curated",
            "domain": domain,
            "task_type": task_type,
            "ambiguity": ambiguity,
            "cheapest_acceptable_route": route,
            "labels": {
                "cheapest_acceptable_route": route,
                "complexity_tier": legacy_label,
            },
            "complexity_tier": legacy_label,
            "notes": lh.get("rationale", ""),
        }
        curated.append(row)

    # Build annotation queue from high-ambiguity rows
    queue: list[dict[str, str]] = []
    for cand in hist_high_amb:
        pid = cand["prompt_id"]
        lh = lh_row_for(pid)
        prompt_text = (lh["prompt"] if lh else cand["prompt_preview"]).strip()
        preview = prompt_text[:120].replace("\n", " ")
        queue.append({
            "prompt_id": pid,
            "source": cand["source"],
            "prompt_preview": preview,
            "ambiguity_reason": (
                "DevOps/Kubernetes context-dependent: cheapest route depends on "
                "implicit operational context not present in prompt text alone"
            ),
        })

    return curated, queue


# ---------------------------------------------------------------------------
# Write helpers
# ---------------------------------------------------------------------------

def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_annotation_queue(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        fieldnames = ["prompt_id", "source", "prompt_preview", "ambiguity_reason"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    # Load sources
    with TRAINING_CORPUS.open(encoding="utf-8") as f:
        tc_data: dict[str, Any] = json.load(f)

    with LABELED_HISTORY.open(encoding="utf-8") as f:
        lh_rows = list(csv.DictReader(f))

    with MIGRATION_CANDIDATES.open(encoding="utf-8") as f:
        candidates = list(csv.DictReader(f))

    # Build seed from training corpus
    tc_seed_rows = build_training_corpus_seed(candidates, tc_data)
    print(f"training_corpus.json safe-seed rows: {len(tc_seed_rows)}")

    # Build curated history seed + annotation queue
    hist_rows, queue_rows = build_history_seed(candidates, lh_rows)
    print(f"labeled_history.csv curated seed rows: {len(hist_rows)}")
    print(f"annotation_queue rows: {len(queue_rows)}")

    # Write outputs
    write_jsonl(OUT_SEED, tc_seed_rows)
    write_jsonl(OUT_HISTORY, hist_rows)
    write_annotation_queue(OUT_QUEUE, queue_rows)

    total = len(tc_seed_rows) + len(hist_rows)
    print(f"\nTotal seed route labels: {total}")
    if total < 200:
        msg = (
            f"SHORTFALL: {total} < 200 target (B1 fallback applies -- see "
            "seed-labeling-summary.md)"
        )
        print(msg)
    else:
        print("B1 threshold met (>=200)")

    # Per-tier distribution
    all_rows = tc_seed_rows + hist_rows
    from collections import Counter
    tier_dist = Counter(r["cheapest_acceptable_route"]["model_tier"] for r in all_rows)
    effort_dist = Counter(r["cheapest_acceptable_route"]["effort"] for r in all_rows)
    domain_dist = Counter(r["domain"] for r in all_rows)
    print("\nModel tier distribution:", dict(tier_dist))
    print("Effort distribution:", dict(effort_dist))
    print("Domain distribution:", dict(domain_dist))


if __name__ == "__main__":
    main()
