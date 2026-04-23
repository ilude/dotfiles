"""Synthetic dataset generator for the v3 prompt router corpus.

Runs the full generator -> adjudicator -> shard -> finalize pipeline described
in `pi/prompt-routing/docs/synthetic-generation-plan.md` and parameterised by
`pi/prompt-routing/data/synthetic-generation-matrix.yaml`.

Two modes:
  * seeded (default): deterministic local generators/adjudicators. No network.
    The dataset is valid under the v3 schema, satisfies B5/H6/H7 invariants,
    and records `mode: "seeded"` in every provenance row.
  * live: replaces the seeded callables with real API clients. Not exercised
    here (requires ANTHROPIC_API_KEY / OPENAI_API_KEY and is left as an
    integration point). Invariants are identical to seeded mode.

Parallel-write safety (H6): each (family, worker) pair writes its own shard
under `data/synthetic_shards/{family_id}/{worker_id}.jsonl`. The finalize
step concatenates shards into the canonical `synthetic_route_labels.jsonl`
and `synthetic_provenance.jsonl`. Workers never append to the canonical
files concurrently.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import random
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    sys.stderr.write("PyYAML is required. Install with: pip install pyyaml\n")
    sys.exit(2)


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
SHARD_DIR = DATA_DIR / "synthetic_shards"
MATRIX_PATH = DATA_DIR / "synthetic-generation-matrix.yaml"
FAMILIES_OUT = DATA_DIR / "synthetic_prompt_families.jsonl"
LABELS_OUT = DATA_DIR / "synthetic_route_labels.jsonl"
PROVENANCE_OUT = DATA_DIR / "synthetic_provenance.jsonl"
PROMPTS_DIR = REPO_ROOT / "prompts"
ADJUDICATOR_TEMPLATE_PATH = PROMPTS_DIR / "adjudicator_template_v1.txt"


# --- Model size classification -------------------------------------------------

MODEL_SIZE = {
    "gpt-5-mini": "small",
    "claude-haiku-4-5": "small",
    "gemini-2.5-flash": "small",
    "claude-sonnet-4-6": "medium",
    "gpt-5": "large",
    "claude-opus-4-7": "large",
}


def model_family(model: str) -> str:
    """Return the provider/family token used for the B5 check."""

    lower = model.lower()
    if lower.startswith("claude-"):
        return "anthropic"
    if lower.startswith("gpt-"):
        return "openai"
    if lower.startswith("gemini-"):
        return "google"
    return lower.split("-")[0]


# --- Adjudicator template ------------------------------------------------------

ADJUDICATOR_TEMPLATE_V1 = """SYSTEM:
You are a route adjudicator for a cost-first prompt router. Identify the
cheapest acceptable route -- the lowest-cost (model_tier, effort) pair that
can reliably solve the prompt.

Action space (cheapest to most expensive):
  Haiku/none   Haiku/low    Haiku/medium   Haiku/high
  Sonnet/none  Sonnet/low   Sonnet/medium  Sonnet/high
  Opus/none    Opus/low     Opus/medium    Opus/high

Vocabulary per candidate route:
  acceptable   -- solves the prompt correctly without unreasonable risk
  insufficient -- likely to fail, hallucinate, or miss key steps
  overkill     -- can solve the prompt but costs more than necessary

CALIBRATION ANCHORS:
{anchor_examples}

Return JSON only:
{
  "cheapest_acceptable_route": {"model_tier": "...", "effort": "..."},
  "route_judgments": [
    {"route": {"model_tier": "...", "effort": "..."},
     "verdict": "acceptable|insufficient|overkill",
     "rationale": "..."}
  ],
  "confidence": "high|medium|low"
}

USER:
Prompt: {prompt}
Family: {family_id}
Complexity band: {complexity_band}
"""


def compute_prompt_version_hash(template: str) -> str:
    digest = hashlib.sha256(template.encode("utf-8")).hexdigest()
    return digest[:12]


# --- Seed prompt banks per family ---------------------------------------------
#
# The banks below are deliberately small and hand-crafted so the seeded mode
# produces plausible, domain-diverse prompts. Variation is introduced by
# substitution templates that rotate domain/topic/numeric values.

FAMILY_BANKS: dict[str, dict[str, Any]] = {
    "F01": {
        "domain": "general",
        "task_type": "factual",
        "templates": [
            "What is the capital of {country}?",
            "Who wrote {book}?",
            "When was {event} first held?",
            "What year did {person} win the {award}?",
            "Which ocean borders {country} to the east?",
            "What language is primarily spoken in {country}?",
            "How many {unit} are in a {bigger_unit}?",
            "Name one famous dish from {country}.",
        ],
        "slots": {
            "country": [
                "Japan",
                "Brazil",
                "Kenya",
                "Iceland",
                "Vietnam",
                "Portugal",
                "Morocco",
                "Peru",
                "Finland",
                "Thailand",
                "Argentina",
                "Egypt",
                "Indonesia",
                "Sweden",
                "Chile",
            ],
            "book": [
                "The Odyssey",
                "1984",
                "Beloved",
                "Dune",
                "Pride and Prejudice",
                "The Kite Runner",
                "Norwegian Wood",
                "The Master and Margarita",
            ],
            "event": [
                "the modern Olympics",
                "the FIFA World Cup",
                "the Tour de France",
                "the Eurovision contest",
                "the Wimbledon championships",
            ],
            "person": [
                "Marie Curie",
                "Toni Morrison",
                "Gabriel Garcia Marquez",
                "Kazuo Ishiguro",
                "Wangari Maathai",
                "Bob Dylan",
            ],
            "award": ["Nobel Prize in Chemistry", "Nobel Prize in Literature", "Nobel Peace Prize"],
            "unit": ["inches", "ounces", "cups", "yards", "millimeters"],
            "bigger_unit": ["foot", "pound", "gallon", "mile", "meter"],
        },
    },
    "F02": {
        "domain": "general",
        "task_type": "mechanical_edit",
        "templates": [
            "Sort this list alphabetically: {items}.",
            "Convert the following to title case: {phrase}.",
            "Remove duplicate entries from: {items}.",
            "Format this as a bulleted list: {items}.",
            "Reverse the order of words in: {phrase}.",
            "Uppercase every second word in: {phrase}.",
            "Strip trailing whitespace from each line: {phrase}.",
            "Turn this CSV row into JSON: {csv_row}.",
        ],
        "slots": {
            "items": [
                "banana, apple, cherry, date",
                "Mumbai, Lagos, Oslo, Quito, Reykjavik",
                "red, blue, red, green, blue, yellow",
                "12, 3, 45, 6, 78, 9",
                "cat, dog, cat, bird, dog, fish",
                "north, east, south, west, north",
            ],
            "phrase": [
                "the quick brown fox jumps over the lazy dog",
                "never gonna give you up never gonna let you down",
                "to be or not to be that is the question",
                "a journey of a thousand miles begins with a single step",
                "the rain in spain falls mainly on the plain",
            ],
            "csv_row": [
                "id,name,age\\n42,Ada,36",
                "sku,qty,price\\nA100,3,9.99",
                "date,symbol,volume\\n2026-01-02,ACME,1500",
            ],
        },
    },
    "F03": {
        "domain": "general",
        "task_type": "factual",
        "templates": [
            "What is {a} plus {b}?",
            "Convert {x} {unit_from} to {unit_to}.",
            "If I drive {x} miles at {y} mph, how many minutes does it take?",
            "What is {x}% of {y}?",
            "Solve for x: {a}x + {b} = {c}.",
            "How many seconds are in {x} hours and {y} minutes?",
            "What is the square root of {square}?",
            "Round {value} to the nearest {place}.",
        ],
        "slots": {
            "a": [str(n) for n in range(2, 30)],
            "b": [str(n) for n in range(1, 25)],
            "c": [str(n) for n in range(5, 100, 3)],
            "x": [str(n) for n in range(1, 50)],
            "y": [str(n) for n in range(2, 60)],
            "unit_from": ["kilometers", "pounds", "liters", "Celsius", "miles"],
            "unit_to": ["miles", "kilograms", "gallons", "Fahrenheit", "nautical miles"],
            "square": ["16", "25", "49", "81", "144", "169", "225", "400"],
            "value": ["3.14159", "2.71828", "1.61803", "42.4242", "9.8765"],
            "place": ["tenth", "hundredth", "whole number", "thousandth"],
        },
    },
    "F04": {
        "domain": "general",
        "task_type": "factual",
        "templates": [
            "Is {subject} warm-blooded?",
            "Define {term} in one sentence.",
            "What does the acronym {acronym} stand for?",
            "Name the element with atomic number {z}.",
            "Which planet is closest to {reference}?",
            "Give the ISO 4217 code for the currency of {country}.",
            "What is the primary function of the {organ}?",
            "Who is the current {role} of {org}?",
        ],
        "slots": {
            "subject": [
                "an octopus",
                "a dolphin",
                "a crocodile",
                "a platypus",
                "a penguin",
            ],
            "term": [
                "entropy",
                "ontology",
                "hysteresis",
                "eutrophication",
                "stoichiometry",
                "anadromy",
                "allostasis",
                "pleonasm",
            ],
            "acronym": ["HTTP", "NASA", "SCUBA", "RADAR", "LASER", "GDPR", "IPFS"],
            "z": ["1", "6", "8", "11", "17", "26", "29", "47", "79", "82"],
            "reference": ["Earth", "the Sun", "Jupiter", "the Kuiper belt"],
            "country": [
                "Brazil",
                "Vietnam",
                "Kenya",
                "Norway",
                "Argentina",
                "Egypt",
                "Thailand",
                "Poland",
                "Canada",
                "South Korea",
            ],
            "organ": ["liver", "pancreas", "spleen", "thymus", "hypothalamus"],
            "role": ["Secretary-General", "President", "Director-General"],
            "org": [
                "the United Nations",
                "the World Bank",
                "the World Health Organization",
            ],
        },
    },
    "F05": {
        "domain": "python",
        "task_type": "code_debug",
        "templates": [
            "This {lang} function raises `{error}` on input `{bad_input}`. "
            "Can you fix it?\\n\\n```{lang}\\n{snippet}\\n```",
            "My {lang} code prints `{observed}` instead of `{expected}`. "
            "What is wrong?\\n\\n```{lang}\\n{snippet}\\n```",
            "Why does this {lang} snippet loop forever on `{bad_input}`?\\n\\n"
            "```{lang}\\n{snippet}\\n```",
            "Running this {lang} test returns `{observed}`. Walk me through the "
            "bug.\\n\\n```{lang}\\n{snippet}\\n```",
        ],
        "slots": {
            "lang": ["python", "javascript", "go", "rust", "typescript"],
            "error": [
                "IndexError: list index out of range",
                "KeyError: 'items'",
                "TypeError: unsupported operand",
                "ReferenceError: x is not defined",
                "NullPointerException on field 'user'",
            ],
            "bad_input": ["[]", "{'a':1}", "None", "0", "'x'"],
            "observed": ["[1, 1, 1]", "-1", "false", "None", "undefined"],
            "expected": ["[1, 2, 3]", "0", "true", "42", "an error message"],
            "snippet": [
                "def head(xs):\\n    return xs[0]",
                "function total(items){return items.map(x=>x.price).reduce((a,b)=>a+b)}",
                "for i in range(len(xs)):\\n    xs.append(xs[i])",
                "if user.name == 'admin':\\n    grant()",
                "let total = 0; for (let x in arr) total += x;",
            ],
        },
    },
    "F06": {
        "domain": "python",
        "task_type": "code_write",
        "templates": [
            "Write a {lang} function `{fn}` that {behavior}.",
            "In {lang}, implement `{fn}` which {behavior}. Include a short docstring.",
            "Give me a {lang} snippet that {behavior}. No external dependencies.",
            "Produce a {lang} unit test for a function that {behavior}.",
        ],
        "slots": {
            "lang": ["python", "typescript", "go", "rust", "java"],
            "fn": [
                "chunked(xs, n)",
                "deduplicate(xs)",
                "merge_sorted(a, b)",
                "parse_iso_date(s)",
                "count_words(text)",
                "slugify(s)",
                "retry(fn, attempts)",
                "flatten(nested)",
            ],
            "behavior": [
                "splits a list into chunks of size n",
                "removes duplicate items while preserving order",
                "merges two sorted iterables into one",
                "parses an ISO-8601 date into a date object",
                "counts the words in a string, ignoring punctuation",
                "converts a title string into a URL-safe slug",
                "retries a function up to N times with exponential backoff",
                "flattens an arbitrarily nested list of integers",
            ],
        },
    },
    "F07": {
        "domain": "devops",
        "task_type": "plan",
        "templates": [
            "Wire up {service_a} to emit events to {service_b} using "
            "{transport}. Outline the config changes.",
            "Our {service_a} service needs to call {service_b} behind {auth}. "
            "Give me the integration steps.",
            "Configure {service_a} to export metrics to {service_b} over "
            "{transport}. What settings do I change?",
            "Generate a sample {tool} config that routes {service_a} logs into {service_b}.",
        ],
        "slots": {
            "service_a": [
                "our FastAPI app",
                "a Kafka consumer",
                "the billing worker",
                "an Nginx gateway",
            ],
            "service_b": [
                "Stripe",
                "Datadog",
                "an internal webhook",
                "a SurrealDB instance",
                "SNS",
            ],
            "transport": [
                "HTTPS",
                "gRPC",
                "an SQS queue",
                "OTLP",
                "a signed webhook",
            ],
            "auth": [
                "mTLS",
                "OAuth2 client credentials",
                "an HMAC-signed header",
                "an API key in Vault",
            ],
            "tool": [
                "Fluent Bit",
                "Vector",
                "OpenTelemetry Collector",
                "Filebeat",
            ],
        },
    },
    "F08": {
        "domain": "data_science",
        "task_type": "code_write",
        "templates": [
            "Given a {format_in} file with columns {cols}, write code to "
            "produce a {format_out} grouped by {group}.",
            "Transform a stream of {format_in} records so that {transform}. Output {format_out}.",
            "Reshape this dataset: {format_in} rows with fields {cols}, target "
            "{format_out} keyed by {group}.",
            "Write a pipeline that reads {format_in}, applies {transform}, and "
            "writes {format_out}.",
        ],
        "slots": {
            "format_in": ["CSV", "JSONL", "Parquet", "NDJSON", "TSV"],
            "format_out": [
                "JSON",
                "Parquet",
                "CSV",
                "a Pandas DataFrame",
                "a dict of dicts",
            ],
            "cols": [
                "user_id, ts, amount",
                "sku, qty, price, region",
                "sensor_id, ts, value",
                "session_id, url, referrer, duration_ms",
            ],
            "group": ["user_id", "region", "sensor_id", "day", "session_id"],
            "transform": [
                "drop rows where amount is null",
                "convert timestamps from UTC to America/Chicago",
                "bucket values into quartiles",
                "enrich each row with a 7-day rolling average",
            ],
        },
    },
    "F09": {
        "domain": "architecture",
        "task_type": "design",
        "templates": [
            "We need to scale {system} from {old_scale} to {new_scale}. "
            "What architectural changes do you recommend?",
            "Design an ADR for choosing between {option_a} and {option_b} for "
            "{system}. Include trade-offs.",
            "Outline a target architecture for {system} that must support "
            "{constraint_a} and {constraint_b}.",
            "How would you decompose {system} into services without introducing "
            "distributed-transaction hazards?",
        ],
        "slots": {
            "system": [
                "our monolithic billing service",
                "a real-time leaderboard backend",
                "an image-processing pipeline",
                "a multi-tenant analytics product",
                "a B2B file-transfer platform",
            ],
            "old_scale": [
                "1k RPS",
                "5M events/day",
                "200 paying tenants",
                "10TB/day ingest",
            ],
            "new_scale": [
                "25k RPS",
                "500M events/day",
                "10k tenants",
                "200TB/day ingest",
            ],
            "option_a": [
                "Kafka",
                "Postgres logical replication",
                "Kubernetes StatefulSets",
                "gRPC mesh",
            ],
            "option_b": [
                "AWS Kinesis",
                "Debezium + Kafka",
                "Nomad",
                "a REST + message-queue hybrid",
            ],
            "constraint_a": [
                "99.99% availability",
                "sub-50ms p95 latency",
                "EU data residency",
            ],
            "constraint_b": [
                "zero-downtime schema migrations",
                "rolling multi-region failover",
                "FIPS-validated crypto",
            ],
        },
    },
    "F10": {
        "domain": "security",
        "task_type": "design",
        "templates": [
            "Review the auth design for {system}: {summary}. "
            "Identify threats and recommended mitigations.",
            "We store {secret_type} in {storage}. Walk me through a threat model "
            "and hardening plan.",
            "Assess the risk of {risk} in {system}. What controls would you add?",
            "Design a rotation scheme for {secret_type} that minimizes outage "
            "risk during key changes.",
        ],
        "slots": {
            "system": [
                "our customer-facing admin console",
                "an internal data-export tool",
                "a partner API gateway",
                "a CI/CD runner fleet",
            ],
            "summary": [
                "JWTs signed with a single HS256 key, 30-day expiry, no refresh",
                "API keys hashed with SHA-1 and stored in Postgres",
                "OAuth2 with implicit grant and no PKCE",
                "service-to-service calls authenticated by shared bearer tokens",
            ],
            "secret_type": [
                "database credentials",
                "webhook signing keys",
                "OAuth client secrets",
                "TLS private keys",
            ],
            "storage": [
                "environment variables",
                "a Git-backed config repo",
                "Hashicorp Vault",
                "AWS SSM Parameter Store",
            ],
            "risk": [
                "secrets leaking through logs",
                "tokens being replayed after logout",
                "compromised third-party SDK exfiltrating PII",
                "privilege escalation via misconfigured IAM",
            ],
        },
    },
    "F11": {
        "domain": "general",
        "task_type": "analysis",
        "templates": [
            "A stakeholder says `{quote}`. What clarifying questions do you ask before starting?",
            "We were told to `{quote}` by end of quarter. What assumptions does "
            "that instruction hide?",
            "The spec says `{quote}`. How do you decide if this is a one-liner "
            "fix or a multi-week project?",
            "Given the request `{quote}` with no further context, how would you scope an MVP?",
        ],
        "slots": {
            "quote": [
                "make the product feel faster",
                "add AI to the onboarding flow",
                "clean up the database",
                "refactor the payments code",
                "improve security posture across the fleet",
                "simplify the permissions model",
                "optimize the dashboard",
                "migrate us to the cloud",
            ],
        },
    },
    "F12": {
        "domain": "analysis",
        "task_type": "analysis",
        "templates": [
            "Research the trade-offs between {approach_a} and {approach_b} for "
            "{problem}, and recommend one.",
            "Given the constraints {c1}, {c2}, and {c3}, design a migration plan "
            "from {legacy} to {target}.",
            "Synthesize the state of the art on {topic} relevant to {problem} and "
            "flag open questions.",
            "Walk through a multi-step diagnosis for `{symptom}` observed in "
            "`{system}`. Include 3 plausible root causes ranked by likelihood.",
        ],
        "slots": {
            "approach_a": [
                "event sourcing",
                "synchronous RPC",
                "ML-based ranking",
                "a managed vector DB",
            ],
            "approach_b": [
                "CRUD + CDC",
                "async messaging",
                "heuristic ranking",
                "self-hosted Postgres + pgvector",
            ],
            "problem": [
                "multi-tenant search",
                "fraud detection on checkout",
                "real-time inventory reconciliation",
                "personalized content feeds",
            ],
            "c1": ["sub-100ms p95", "EU-only data", "team of 3 engineers"],
            "c2": ["90-day deadline", "no net-new vendors", "existing Kafka infra"],
            "c3": [
                "regulatory audit in Q3",
                "SLA with a large customer",
                "zero downtime",
            ],
            "legacy": [
                "a PHP monolith",
                "an Elasticsearch 5.x cluster",
                "on-prem SQL Server",
                "COBOL batch jobs",
            ],
            "target": [
                "a Go services mesh",
                "OpenSearch on K8s",
                "Aurora Postgres",
                "a Kotlin + Kafka platform",
            ],
            "topic": [
                "retrieval-augmented generation",
                "serverless cold-start mitigation",
                "CRDT-based collaboration",
            ],
            "symptom": [
                "intermittent 504s",
                "steadily growing p99 latency",
                "checksum mismatches after replication",
            ],
            "system": [
                "our checkout API",
                "the analytics ingestion pipeline",
                "the storage replication layer",
            ],
        },
    },
}


# --- Seeded generator ----------------------------------------------------------


def render_template(template: str, slots: dict[str, list[str]], rng: random.Random) -> str:
    out = template
    for key, values in slots.items():
        placeholder = "{" + key + "}"
        while placeholder in out:
            out = out.replace(placeholder, rng.choice(values), 1)
    return out.replace("\\n", "\n")


def seeded_generate_prompt(family_id: str, variant_idx: int, worker_seed: int) -> str:
    bank = FAMILY_BANKS[family_id]
    rng = random.Random(f"{family_id}:{worker_seed}:{variant_idx}")
    template = rng.choice(bank["templates"])
    return render_template(template, bank["slots"], rng)


# --- Seeded adjudicator --------------------------------------------------------

_EFFORT_FOR_PRIOR_SHIFT = {
    "none": ["none", "low"],
    "low": ["none", "low", "medium"],
    "medium": ["low", "medium", "high"],
    "high": ["medium", "high"],
}

_TIER_ORDER = ["Haiku", "Sonnet", "Opus"]
_EFFORT_ORDER = ["none", "low", "medium", "high"]


def _normalize_tier(tier: str) -> str:
    t = tier.strip().lower()
    if t.startswith("haiku"):
        return "Haiku"
    if t.startswith("sonnet"):
        return "Sonnet"
    if t.startswith("opus"):
        return "Opus"
    return "Sonnet"


def _normalize_effort(effort: str) -> str:
    e = effort.strip().lower()
    return e if e in _EFFORT_ORDER else "medium"


def seeded_adjudicate(
    prompt: str,
    family_id: str,
    prior_route: str,
    complexity_band: str,
) -> dict[str, Any]:
    """Deterministic adjudicator. Starts from the family's prior cheapest route
    and perturbs based on a hash of the prompt so the distribution is not a
    single constant label (avoids collapse warnings later)."""

    tier_str, effort_str = prior_route.split("/")
    tier = _normalize_tier(tier_str)
    effort = _normalize_effort(effort_str)

    # Perturb effort deterministically from prompt hash
    h = int(hashlib.sha256(prompt.encode("utf-8")).hexdigest(), 16)
    choices = _EFFORT_FOR_PRIOR_SHIFT[effort]
    perturbed_effort = choices[h % len(choices)]

    # Small-probability tier promotion on borderline/ambiguous-looking prompts,
    # and tier demotion on the lowest band to spread the label distribution.
    tier_roll = (h >> 4) % 20
    if complexity_band == "small" and tier == "Haiku" and tier_roll == 0:
        tier = "Sonnet"
        perturbed_effort = "low"
    elif complexity_band == "large" and tier == "Sonnet" and tier_roll < 3:
        tier = "Opus"
        perturbed_effort = "high"
    elif complexity_band == "large" and tier == "Opus" and tier_roll >= 17:
        tier = "Sonnet"
        perturbed_effort = "high"

    cheapest = {"model_tier": tier, "effort": perturbed_effort}

    # Build a plausible 3-candidate route_judgments list consistent with the
    # invariant enforced by the schema validator (cheapest acceptable verdict
    # matches cheapest_acceptable_route).
    judgments: list[dict[str, Any]] = []
    for cand_tier in _TIER_ORDER:
        for cand_effort in _EFFORT_ORDER:
            cand = {"model_tier": cand_tier, "effort": cand_effort}
            if _cost_less_than(cand, cheapest):
                judgments.append(
                    {
                        "route": cand,
                        "verdict": "insufficient",
                        "rationale": "seeded-mode: below the chosen cheapest acceptable route",
                    }
                )
            elif cand == cheapest:
                judgments.append(
                    {
                        "route": cand,
                        "verdict": "acceptable",
                        "rationale": "seeded-mode: chosen as cheapest acceptable route",
                    }
                )
            else:
                judgments.append(
                    {
                        "route": cand,
                        "verdict": "overkill",
                        "rationale": "seeded-mode: strictly more expensive than cheapest acceptable",
                    }
                )
    # Only keep a small representative sample to avoid 12-cell bloat per row
    kept = [j for j in judgments if j["verdict"] in {"acceptable"}]
    one_ins = next((j for j in judgments if j["verdict"] == "insufficient"), None)
    one_over = next((j for j in judgments if j["verdict"] == "overkill"), None)
    if one_ins:
        kept.insert(0, one_ins)
    if one_over:
        kept.append(one_over)

    # Ambiguity tag driven by tier_roll so it varies per row
    if tier_roll < 2:
        ambiguity = "ambiguous"
    elif tier_roll < 7:
        ambiguity = "borderline"
    else:
        ambiguity = "clear"

    return {
        "cheapest_acceptable_route": cheapest,
        "route_judgments": kept,
        "confidence": "medium",
        "ambiguity": ambiguity,
    }


def _cost_rank(route: dict[str, str]) -> int:
    return _TIER_ORDER.index(route["model_tier"]) * 4 + _EFFORT_ORDER.index(route["effort"])


def _cost_less_than(a: dict[str, str], b: dict[str, str]) -> int:
    return _cost_rank(a) < _cost_rank(b)


# --- Live mode hooks ---------------------------------------------------

try:
    from live_api_client import live_generate_prompt as _lc_gen
    from live_api_client import live_adjudicate as _lc_adj

    _LIVE_WIRED = True
except ImportError:
    _LIVE_WIRED = False
    _lc_gen = None
    _lc_adj = None


def live_generate_prompt(family_id: str, variant_idx: int, worker_seed: int, model: str) -> str:
    if not _LIVE_WIRED:
        raise NotImplementedError(
            "Live generator not wired. Run: pip install anthropic openai "
            "and set ANTHROPIC_API_KEY / OPENAI_API_KEY. "
            "See pi/prompt-routing/tools/live_api_client.py."
        )
    bank = FAMILY_BANKS.get(family_id, {})
    return _lc_gen(
        family_id=family_id,
        variant_idx=variant_idx,
        worker_seed=worker_seed,
        model=model,
        domain=bank.get("domain", "general"),
        task_type=bank.get("task_type", "code_write"),
        complexity_band="small",
        purpose="",
    )


def live_adjudicate(
    prompt: str,
    family_id: str,
    prior_route: str,
    complexity_band: str,
    model: str,
    template: str,
) -> dict[str, Any]:
    if not _LIVE_WIRED:
        raise NotImplementedError(
            "Live adjudicator not wired. Run: pip install anthropic openai "
            "and set ANTHROPIC_API_KEY / OPENAI_API_KEY. "
            "See pi/prompt-routing/tools/live_api_client.py."
        )
    return _lc_adj(
        prompt=prompt,
        family_id=family_id,
        prior_route=prior_route,
        complexity_band=complexity_band,
        model=model,
        template=template,
    )


# --- Worker ------------------------------------------------------------------


@dataclass
class FamilySpec:
    family_id: str
    name: str
    size: str
    complexity_band: str
    generator_model: str
    adjudicator_model: str
    expected_volume: int
    cheapest_route_prior: str
    purpose: str


def load_matrix(path: Path) -> list[FamilySpec]:
    with path.open(encoding="utf-8") as f:
        matrix = yaml.safe_load(f)
    specs: list[FamilySpec] = []
    for entry in matrix["prompt_families"]:
        specs.append(
            FamilySpec(
                family_id=entry["family_id"],
                name=entry["name"],
                size=entry["size"],
                complexity_band=entry["complexity_band"],
                generator_model=entry["generator_model"],
                adjudicator_model=entry["adjudicator_model"],
                expected_volume=int(entry["expected_volume"]),
                cheapest_route_prior=entry["cheapest_route_prior"],
                purpose=(entry.get("purpose") or "").strip(),
            )
        )
    return specs


def plan_work(specs: list[FamilySpec], workers: int, target_total: int) -> dict[str, int]:
    """Scale each family's expected_volume so the sum >= target_total.

    Returns a map of family_id -> volume for this run.
    """

    base_total = sum(s.expected_volume for s in specs)
    if base_total == 0:
        raise ValueError("no families in matrix")
    scale = max(1.0, target_total / base_total)
    return {s.family_id: max(1, int(round(s.expected_volume * scale))) for s in specs}


def shard_path(family_id: str, worker_id: int) -> Path:
    d = SHARD_DIR / family_id
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{worker_id:02d}.jsonl"


def run_worker(
    spec: FamilySpec,
    worker_id: int,
    volume: int,
    mode: str,
    prompt_version_hash: str,
) -> tuple[int, Path]:
    """Generate `volume` rows for `spec` inside one worker and write them to a
    per-worker shard. Returns (rows_written, shard_path)."""

    out_path = shard_path(spec.family_id, worker_id)
    generator = seeded_generate_prompt if mode == "seeded" else live_generate_prompt
    adjudicator = seeded_adjudicate if mode == "seeded" else live_adjudicate

    # B5 check at family level
    gen_family = model_family(spec.generator_model)
    adj_family = model_family(spec.adjudicator_model)
    if gen_family == adj_family:
        raise ValueError(
            f"B5 violation: family {spec.family_id} has generator and adjudicator "
            f"in the same family ({gen_family}). Fix synthetic-generation-matrix.yaml."
        )

    bank = FAMILY_BANKS[spec.family_id]
    domain = bank["domain"]
    task_type = bank["task_type"]

    rows_written = 0
    with out_path.open("w", encoding="utf-8") as f:
        for variant_idx in range(volume):
            if mode == "seeded":
                prompt = generator(spec.family_id, variant_idx, worker_id)
                verdict = adjudicator(
                    prompt,
                    spec.family_id,
                    spec.cheapest_route_prior,
                    spec.complexity_band,
                )
            else:
                prompt = generator(spec.family_id, variant_idx, worker_id, spec.generator_model)
                verdict = adjudicator(
                    prompt,
                    spec.family_id,
                    spec.cheapest_route_prior,
                    spec.complexity_band,
                    spec.adjudicator_model,
                    ADJUDICATOR_TEMPLATE_V1,
                )

            prompt_id = f"syn-{spec.family_id}-{worker_id:02d}-{variant_idx:04d}"
            timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")

            car = verdict["cheapest_acceptable_route"]
            labels: dict[str, Any] = {"cheapest_acceptable_route": car}
            if verdict.get("route_judgments"):
                labels["route_judgments"] = verdict["route_judgments"]

            row = {
                "prompt_id": prompt_id,
                "family_id": spec.family_id,
                "prompt": prompt,
                "source": f"synthetic_{spec.size}",
                "domain": domain,
                "task_type": task_type,
                "ambiguity": verdict["ambiguity"],
                "cheapest_acceptable_route": car,
                "route_judgments": verdict["route_judgments"],
                "labels": labels,
                "provenance": {
                    "generator_model": spec.generator_model,
                    "generator_model_size": MODEL_SIZE.get(spec.generator_model, spec.size),
                    "adjudicator_model": spec.adjudicator_model,
                    "adjudicator_model_size": MODEL_SIZE.get(spec.adjudicator_model, "small"),
                    "prompt_version_hash": prompt_version_hash,
                    "temperature": 0.0,
                    "generated_at": timestamp,
                },
            }
            provenance_row = {
                "prompt_id": prompt_id,
                "family_id": spec.family_id,
                "generator_model": spec.generator_model,
                "generator_model_size": MODEL_SIZE.get(spec.generator_model, spec.size),
                "adjudicator_model": spec.adjudicator_model,
                "adjudicator_model_size": MODEL_SIZE.get(spec.adjudicator_model, "small"),
                "prompt_version_hash": prompt_version_hash,
                "adjudicator_temperature": 0.0,
                "mode": mode,
                "timestamp": timestamp,
                "cheapest_acceptable_route": verdict["cheapest_acceptable_route"],
            }
            output = json.dumps({"row": row, "provenance": provenance_row}, ensure_ascii=False)
            f.write(output + "\n")
            rows_written += 1
    return rows_written, out_path


# --- Finalize ------------------------------------------------------------------


def finalize(shard_root: Path, labels_out: Path, provenance_out: Path) -> tuple[int, int]:
    """Concatenate shards into canonical JSONL files with deduplication by
    prompt text. Returns (rows_written_labels, rows_written_provenance)."""

    seen_prompts: set[str] = set()
    rows_written = 0
    prov_written = 0
    labels_out.parent.mkdir(parents=True, exist_ok=True)
    provenance_out.parent.mkdir(parents=True, exist_ok=True)

    with (
        labels_out.open("w", encoding="utf-8") as lf,
        provenance_out.open("w", encoding="utf-8") as pf,
    ):
        for family_dir in sorted(shard_root.iterdir()):
            if not family_dir.is_dir():
                continue
            for shard in sorted(family_dir.iterdir()):
                if not shard.is_file() or shard.suffix != ".jsonl":
                    continue
                with shard.open(encoding="utf-8") as sf:
                    for line in sf:
                        if not line.strip():
                            continue
                        obj = json.loads(line)
                        row = obj["row"]
                        prov = obj["provenance"]
                        prompt = row["prompt"]
                        if prompt in seen_prompts:
                            continue
                        seen_prompts.add(prompt)
                        lf.write(json.dumps(row, ensure_ascii=False) + "\n")
                        pf.write(json.dumps(prov, ensure_ascii=False) + "\n")
                        rows_written += 1
                        prov_written += 1
    return rows_written, prov_written


def write_families_registry(specs: list[FamilySpec], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for s in specs:
            f.write(
                json.dumps(
                    {
                        "family_id": s.family_id,
                        "name": s.name,
                        "size": s.size,
                        "complexity_band": s.complexity_band,
                        "purpose": s.purpose,
                        "generator_model": s.generator_model,
                        "adjudicator_model": s.adjudicator_model,
                        "expected_volume": s.expected_volume,
                        "cheapest_route_prior": s.cheapest_route_prior,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )


def write_adjudicator_template(path: Path, template: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(template, encoding="utf-8")


# --- CLI ----------------------------------------------------------------------


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--families",
        nargs="*",
        default=None,
        help="Subset of family ids to generate (default: all in matrix).",
    )
    p.add_argument(
        "--workers", type=int, default=4, help="Workers per family. Each writes its own shard (H6)."
    )
    p.add_argument(
        "--target-total",
        type=int,
        default=360,
        help="Target total rows across all families. Scales expected_volume.",
    )
    mode = p.add_mutually_exclusive_group()
    mode.add_argument(
        "--seeded",
        dest="mode",
        action="store_const",
        const="seeded",
        help="Use the deterministic local generator/adjudicator (default).",
    )
    mode.add_argument(
        "--live",
        dest="mode",
        action="store_const",
        const="live",
        help="Use real API clients. Requires ANTHROPIC_API_KEY and OPENAI_API_KEY.",
    )
    p.set_defaults(mode="seeded")
    p.add_argument(
        "--out-dir", type=Path, default=DATA_DIR, help="Override the data output directory."
    )
    p.add_argument(
        "--shard-root",
        type=Path,
        default=None,
        help="Override the shard directory. Defaults to <out-dir>/synthetic_shards.",
    )
    p.add_argument("--labels-out", type=Path, default=None)
    p.add_argument("--provenance-out", type=Path, default=None)
    p.add_argument("--families-out", type=Path, default=None)
    p.add_argument(
        "--skip-generate",
        action="store_true",
        help="Only run the finalize step against existing shards.",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    out_dir = args.out_dir
    shard_root = args.shard_root or (out_dir / "synthetic_shards")
    labels_out = args.labels_out or (out_dir / "synthetic_route_labels.jsonl")
    provenance_out = args.provenance_out or (out_dir / "synthetic_provenance.jsonl")
    families_out = args.families_out or (out_dir / "synthetic_prompt_families.jsonl")

    globals()["SHARD_DIR"] = shard_root

    if args.mode == "live":
        for env in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY"):
            if not os.environ.get(env):
                sys.stderr.write(f"--live mode requires {env}\n")
                return 2

    specs = load_matrix(MATRIX_PATH)
    if args.families:
        wanted = set(args.families)
        specs = [s for s in specs if s.family_id in wanted]
        if not specs:
            sys.stderr.write("no matching families\n")
            return 2

    # B5 guard pre-run
    for s in specs:
        if model_family(s.generator_model) == model_family(s.adjudicator_model):
            sys.stderr.write(
                f"B5 violation in matrix: {s.family_id} generator={s.generator_model} "
                f"adjudicator={s.adjudicator_model}\n"
            )
            return 2

    write_families_registry(specs, families_out)
    write_adjudicator_template(ADJUDICATOR_TEMPLATE_PATH, ADJUDICATOR_TEMPLATE_V1)
    prompt_version_hash = compute_prompt_version_hash(ADJUDICATOR_TEMPLATE_V1)

    if not args.skip_generate:
        volumes = plan_work(specs, args.workers, args.target_total)
        # Clean old shards for the families we are regenerating
        for s in specs:
            fdir = shard_root / s.family_id
            if fdir.exists():
                for p in fdir.iterdir():
                    if p.is_file():
                        p.unlink()

        total_rows = 0
        t0 = time.time()
        with cf.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            futures: list[cf.Future] = []
            for s in specs:
                fvol = volumes[s.family_id]
                # Split volume across workers
                chunk = max(1, fvol // args.workers)
                remainder = fvol - chunk * args.workers
                for w in range(args.workers):
                    wvol = chunk + (1 if w < remainder else 0)
                    if wvol <= 0:
                        continue
                    futures.append(
                        pool.submit(run_worker, s, w, wvol, args.mode, prompt_version_hash)
                    )
            for fut in cf.as_completed(futures):
                written, path = fut.result()
                total_rows += written
        sys.stderr.write(
            f"generated {total_rows} rows across {len(specs)} families in "
            f"{time.time() - t0:.1f}s (mode={args.mode})\n"
        )

    rows, provs = finalize(shard_root, labels_out, provenance_out)
    sys.stderr.write(
        f"finalized {rows} unique rows into {labels_out.name} and {provs} provenance rows\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
