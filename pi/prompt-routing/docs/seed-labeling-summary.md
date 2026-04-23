---
created: 2026-04-22
task: T5
status: complete
---

# Seed Labeling Summary

## Overview

This document reports the route-labeled seed dataset produced by T5 curation
for the v3 cost-first prompt router. The seed set draws from two sources:
`training_corpus.json` (safe low-cost seed bucket) and `labeled_history.csv`
(curated safe-seed rows). Route labels were assigned via the migration priors
in corpus-v3-schema.md section 4, with task_type and domain inference applied
to override defaults for security and factual cases.

## Total Count

| File | Rows |
|------|------|
| `seed_route_labels.jsonl` | 958 |
| `curated_history_route_labels.jsonl` | 140 |
| **Combined** | **1098** |

B1 shortfall threshold (>=200): **MET**.

---

## Route Distribution

### Model tier (cheapest_acceptable_route.model_tier)

| Tier | Count | Fraction |
|------|-------|----------|
| Haiku | 608 | 55.4% |
| Sonnet | 0 | 0.0% |
| Opus | 490 | 44.6% |

Note: Sonnet coverage is **zero** in the seed set. This is an expected
structural gap -- the safe-seed bucket from the v2 corpus contains only
"low" and "high" tier examples. Mid-tier prompts (which map to Sonnet routes)
are all in the "needs relabel" bucket and require route-level adjudication.
T6 synthetic generation must backfill Sonnet-tier coverage.

### Effort tier (cheapest_acceptable_route.effort)

| Effort | Count | Fraction |
|--------|-------|----------|
| none | 83 | 7.6% |
| low | 525 | 47.8% |
| medium | 245 | 22.3% |
| high | 245 | 22.3% |

---

## Domain Coverage

| Domain | Count | Notes |
|--------|-------|-------|
| architecture | 411 | Strong -- drawn from 450 architectural high-tier TC rows |
| general | 242 | Broad catch-all for non-domain-specific prompts |
| writing | 225 | Explain/describe/rewrite tasks; all Haiku-routed |
| python | 62 | Low-tier Python tasks |
| security | 37 | Opus-routed; many route to (Opus, high) due to rubric 3.5 bias |
| typescript | 50 | JS/TS frontend tasks |
| devops | 34 | Shell/git/CLI tasks; Haiku-routed |
| sql | 34 | SQL query tasks; Haiku-routed |
| data_science | 3 | Thin coverage -- needs synthetic backfill |

---

## Ambiguity Distribution

| Ambiguity | Count |
|-----------|-------|
| clear | 913 |
| borderline | 185 |
| ambiguous | 0 |

Ambiguous rows (43 DevOps/Kubernetes context-dependent prompts) were routed
to `annotation_queue.csv` rather than included in the seed set.

---

## Known Gaps

### Gap 1: Zero Sonnet coverage

The entire seed set is Haiku or Opus. The v2 corpus had no "mid-tier" prompts
in the safe-seed bucket -- all 462 mid-tier TC prompts are in "needs relabel"
and the 275 labeled-history mid rows are context-dependent or low-confidence.
The domain gap for Sonnet-routed prompts includes: multi-step code_write,
code_debug with context, moderate analysis, and plan tasks.

**T6 synthetic must generate**: at minimum 200-300 Sonnet-tier examples
covering code_write, code_debug, analysis, and plan task types to make
the corpus usable for training a route classifier.

### Gap 2: data_science domain thin (3 rows)

Only 3 examples in data_science domain. Synthetic generation should add
ML/data pipeline prompts spanning both Haiku (simple sklearn call) and
Sonnet (model debugging, pipeline design) routes.

### Gap 3: No mid-tier DevOps prompts

The 43 high-ambiguity DevOps prompts were excluded (annotation queue).
The domain will have only shell/CLI Haiku prompts. T6 should generate
DevOps prompts with explicit operational context clues so the route
signal is reliable without session history.

### Gap 4: annotation_queue.csv (43 rows)

43 DevOps/Kubernetes prompts with context-dependent routing are queued for
human annotation. These cannot be safely bulk-labeled from text alone --
a human reviewer with domain context must determine whether the cheapest
route is (Haiku, medium) for a single-step operation or (Sonnet/Opus, high)
for a multi-constraint remediation. Until annotated, these rows are excluded
from all training splits.

---

## T6 Synthetic Backfill Priority

The following gaps in coverage should be filled by T6 synthetic generation,
ordered by urgency:

1. **Sonnet-tier, all domains** -- highest priority; without these rows
   the classifier cannot learn the mid-range route boundary at all
2. **data_science domain** -- Haiku and Sonnet rows for data pipeline tasks
3. **DevOps with explicit context** -- replace ambiguous gitlab-helm rows
   with prompts that carry enough context for unambiguous route assignment
4. **borderline ambiguity examples** -- contrastive pairs that test
   (Haiku, high) vs (Sonnet, low) boundary for mechanical-but-complex tasks

---

## Labeling Script

`pi/prompt-routing/tools/build_seed_labels.py` -- reads
`migration_candidates.csv`, `training_corpus.json`, and `labeled_history.csv`
and emits the two JSONL files deterministically. Re-run to regenerate.

---

## Mid-tier relabel rubric (2026-04-22 backfill)

The 1016 "needs relabel" mid-tier rows in `migration_candidates.csv` were
processed by `pi/prompt-routing/tools/relabel_mid_tier.py` to produce
`pi/prompt-routing/data/relabeled_mid_tier_route_labels.jsonl` (741 rows
after text lookup and dedup). The rubric assigns a v3
`cheapest_acceptable_route` from the prompt text alone:

1. **Complex DevOps override**: if the inferred domain is `devops` and the
   prompt mentions kubernetes, k8s, helm, gitlab, multi-cluster, cilium,
   istio, coredns, cluster autoscaler, ebpf, or service mesh, route to
   `(Opus, medium)` with `ambiguity = borderline`. These prompts usually
   require cross-cutting operational reasoning that a Sonnet-tier response
   would not cover reliably.
2. **Architecture / security / migration uplift**: if the prompt contains
   `architect*`, `microservice`, `distributed`, `migration`, `security`,
   `auth*`, `encrypt`, `threat model`, `vulnerab*`, `oauth`, `jwt`,
   `scal*`, `high.availab*`, `multi.tenant`, or `saas`, route to
   `(Sonnet, high)` with `ambiguity = borderline`.
3. **Short mechanical edits**: if the prompt has fewer than 30 whitespace
   tokens and mentions rename, move, format, reorder, sort, remove,
   rewrite, convert, replace, edit, tidy, or clean-up signals, route to
   `(Sonnet, low)` with `ambiguity = clear`. These are multi-step enough to
   warrant Sonnet but small enough to run at low effort.
4. **Default mid-tier**: everything else routes to `(Sonnet, medium)` with
   `ambiguity = clear`.

Source-wise the relabel set comes from both `training_corpus.json` mid array
(`tc-mid-NNNN` rows) and `labeled_history.csv` mid rows (`lh-NNNN`),
indexed by row position matching `build_seed_labels.py`. Rows with empty
prompt text or duplicates against the set seen so far are skipped. family_id
uses the `RELABEL-mid-{domain}-{hash}` pattern so the split builder treats
each row as its own family (same per-row family-id policy as seed and
curated history).

Resulting route distribution in the 741 relabel rows: Sonnet/medium 683,
Sonnet/high 29, Sonnet/low 22, Opus/medium 7. Domain coverage: general 399,
writing 90, python 64, devops 64, typescript 56, sql 36, security 22,
architecture 10.
