"""Relabel mid-tier "needs relabel" rows from migration_candidates.csv into v3
route-labeled rows targeting Sonnet as the default tier.

Reads:
  pi/prompt-routing/data/migration_candidates.csv
  pi/prompt-routing/data/training_corpus.json
  pi/prompt-routing/labeled_history.csv

Writes:
  pi/prompt-routing/data/relabeled_mid_tier_route_labels.jsonl

Rubric (see seed-labeling-summary.md, section "Mid-tier relabel rubric"):
  Default mid-tier prompt -> (Sonnet, medium)
  Short mechanical prompts (<30 tokens AND mechanical_edit signals) -> (Sonnet, low)
  Architecture / security / migration keywords -> (Sonnet, high)
  Genuinely complex DevOps (kubernetes / helm / multi-cluster) -> (Opus, medium)

Rows from "high ambiguity" or missing prompt text are skipped. These are
curated-historical labels, not synthetic, so no provenance block is emitted.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
PROMPT_ROUTING = SCRIPT_DIR.parent
DATA_DIR = PROMPT_ROUTING / "data"

MIGRATION_CANDIDATES = DATA_DIR / "migration_candidates.csv"
TRAINING_CORPUS = DATA_DIR / "training_corpus.json"
LABELED_HISTORY = PROMPT_ROUTING / "labeled_history.csv"
OUT_PATH = DATA_DIR / "relabeled_mid_tier_route_labels.jsonl"


# Domain inference -- mirrors build_seed_labels._DOMAIN_PATTERNS so the
# relabel set is consistent with the seed set.

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
        r"node group|ingress|terraform|ansible|cloudwatch|gcp|azure|infra)\b",
        re.I,
    ), "devops"),
    (re.compile(
        r"\b(sql|postgres|mysql|database|schema|query|index|join|"
        r"transaction|orm)\b",
        re.I,
    ), "sql"),
    (re.compile(
        r"\b(react|vue|angular|typescript|javascript|\bts\b|\bjs\b|css|html|frontend|"
        r"component|hook|redux|next\.?js)\b",
        re.I,
    ), "typescript"),
    (re.compile(
        r"\b(python|django|flask|fastapi|pandas|numpy|scipy|sklearn|pytorch|"
        r"tensorflow)\b",
        re.I,
    ), "python"),
    (re.compile(
        r"\b(data science|machine learning|\bml\b|embedding|vector|"
        r"classification|regression|nlp)\b",
        re.I,
    ), "data_science"),
    (re.compile(
        r"\b(bash|shell|\bcli\b|terminal|\bgrep\b|\bawk\b|\bsed\b|\bgit\b|\bssh\b|"
        r"\btar\b|\bzip\b|\bcurl\b|wget)\b",
        re.I,
    ), "devops"),
    (re.compile(
        r"\b(go|golang|rust|java|c\+\+|ruby|swift|kotlin|scala)\b",
        re.I,
    ), "general"),
    (re.compile(
        r"\b(write|rewrite|explain|summariz|describe|document|"
        r"\bcomment\b|\breadme\b)\b",
        re.I,
    ), "writing"),
]


def infer_domain(prompt: str) -> str:
    for pattern, domain in _DOMAIN_PATTERNS:
        if pattern.search(prompt):
            return domain
    return "general"


_TASK_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(
        r"\b(audit|review for|check for|find (bugs|vulnerabilities|issues)|"
        r"security review)\b",
        re.I,
    ), "code_review"),
    (re.compile(
        r"\b(debug|fix|why (is|does|isn|doesn)|not (working|rendering|running)|"
        r"exception|fails)\b",
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
        r"\b(edit|rename|\bmove\b|delete|update.*line|change.*line|add.*to.*file)\b",
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


# Rubric keyword sets

_ARCH_SEC_MIGRATION = re.compile(
    r"\b(architect|architecture|microservice|distributed|migration|migrate|"
    r"security|auth(entication|oriz)|encrypt|threat model|vulnerab|oauth|jwt|"
    r"scal(ab|ing)|high.availab|multi.tenant|saas)\b",
    re.I,
)

_MECHANICAL_SIGNALS = re.compile(
    r"\b(rename|\bmove\b|format(ting)?|reorder|sort|remove|rewrite "
    r"(this|that)|convert|change.*to|replace|\bedit\b|tidy|clean up|"
    r"capitaliz|lowercase|uppercase)\b",
    re.I,
)

_COMPLEX_DEVOPS = re.compile(
    r"\b(kubernetes|k8s|helm|gitlab|multi.cluster|cilium|istio|coredns|"
    r"cluster autoscaler|ebpf|service mesh)\b",
    re.I,
)


def _token_count(prompt: str) -> int:
    return len(re.findall(r"\S+", prompt))


def assign_mid_route(prompt: str, domain: str) -> tuple[dict[str, str], str]:
    """Apply the mid-tier relabel rubric. Return (route, ambiguity)."""
    tokens = _token_count(prompt)

    # Override 3: complex DevOps bumps to Opus/medium
    if domain == "devops" and _COMPLEX_DEVOPS.search(prompt):
        return {"model_tier": "Opus", "effort": "medium"}, "borderline"

    # Override 2: architecture / security / migration keywords -> Sonnet/high
    if _ARCH_SEC_MIGRATION.search(prompt):
        return {"model_tier": "Sonnet", "effort": "high"}, "borderline"

    # Override 1: short mechanical edits -> Sonnet/low
    if tokens < 30 and _MECHANICAL_SIGNALS.search(prompt):
        return {"model_tier": "Sonnet", "effort": "low"}, "clear"

    # Default mid-tier -> Sonnet/medium
    return {"model_tier": "Sonnet", "effort": "medium"}, "clear"


def _family_id(prompt: str, domain: str) -> str:
    normalized = re.sub(r"\s+", " ", prompt.strip().lower())[:120]
    digest = hashlib.sha256(f"RELABEL:{domain}:{normalized}".encode()).hexdigest()[:12]
    return f"RELABEL-mid-{domain}-{digest}"


def load_migration_candidates(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_training_corpus_index(path: Path) -> dict[str, str]:
    with path.open(encoding="utf-8") as f:
        tc = json.load(f)
    idx: dict[str, str] = {}
    for tier in ("low", "mid", "high"):
        for i, text in enumerate(tc.get(tier, [])):
            idx[f"tc-{tier}-{i:04d}"] = text
    return idx


def load_history_index(path: Path) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return {f"lh-{i:04d}": r for i, r in enumerate(rows)}


def main() -> int:
    candidates = load_migration_candidates(MIGRATION_CANDIDATES)
    tc_index = load_training_corpus_index(TRAINING_CORPUS)
    lh_index = load_history_index(LABELED_HISTORY)

    # Keep only "needs relabel" mid-tier rows
    needs_relabel = [
        c for c in candidates
        if c["bucket"] == "needs relabel" and c["current_label"] == "mid"
    ]

    out_rows: list[dict[str, Any]] = []
    seen_prompts: set[str] = set()
    skipped_no_text = 0
    skipped_dup = 0
    route_dist: dict[str, int] = {}

    for cand in needs_relabel:
        pid = cand["prompt_id"]
        if pid.startswith("tc-"):
            prompt = tc_index.get(pid, "")
        elif pid.startswith("lh-"):
            lh = lh_index.get(pid)
            prompt = lh["prompt"] if lh else ""
        else:
            prompt = ""

        prompt = prompt.strip()
        if not prompt:
            skipped_no_text += 1
            continue

        # De-dup identical prompt text
        key = re.sub(r"\s+", " ", prompt.lower())
        if key in seen_prompts:
            skipped_dup += 1
            continue
        seen_prompts.add(key)

        domain = infer_domain(prompt)
        task_type = infer_task_type(prompt)
        route, ambiguity = assign_mid_route(prompt, domain)

        row: dict[str, Any] = {
            "prompt_id": f"rml-{pid}",
            "family_id": _family_id(prompt, domain),
            "prompt": prompt,
            "source": "history_curated",
            "domain": domain,
            "task_type": task_type,
            "ambiguity": ambiguity,
            "cheapest_acceptable_route": route,
            "labels": {
                "cheapest_acceptable_route": route,
                "complexity_tier": "mid",
            },
            "complexity_tier": "mid",
        }
        out_rows.append(row)

        key2 = f"{route['model_tier']}/{route['effort']}"
        route_dist[key2] = route_dist.get(key2, 0) + 1

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        for r in out_rows:
            f.write(json.dumps(r, ensure_ascii=False))
            f.write("\n")

    print(f"Wrote {len(out_rows)} rows to {OUT_PATH}")
    print(f"  skipped_no_text = {skipped_no_text}")
    print(f"  skipped_duplicates = {skipped_dup}")
    print("Route distribution:")
    for k in sorted(route_dist):
        print(f"  {k}: {route_dist[k]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
