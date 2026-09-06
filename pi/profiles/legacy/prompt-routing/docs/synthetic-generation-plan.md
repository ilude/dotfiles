# Synthetic Generation Plan

## Overview

This document defines the end-to-end workflow for generating synthetic prompt/route-label pairs
to expand the v3 training corpus. Generation is parallelized by complexity band, with each band
assigned to an appropriately sized model family. A separate adjudicator model family validates
every label before it is written to the corpus.

The goal is **cheapest-acceptable-route** labels -- not legacy `low/mid/high` complexity tiers.
A route label is the cheapest `(model_tier, effort_level)` combination that reliably solves the
prompt without producing catastrophic under-routing or wasteful over-routing.

---

## 1. Prompt Families

Prompt families group semantically similar prompt patterns. Each family has a fixed `family_id`
used to enforce train/dev/eval split discipline (no family spans multiple splits).

| Family ID | Name | Complexity Band | Canonical Task Pattern |
|-----------|------|-----------------|------------------------|
| F01 | greetings-and-trivia | small | Mechanical, factual lookup, one-liner answers |
| F02 | text-formatting | small | Mechanical reformatting, capitalization, sort/filter |
| F03 | simple-arithmetic | small | Numeric calculation, unit conversion, basic algebra |
| F04 | short-qa | small | Simple factual questions with deterministic answers |
| F05 | code-snippet-debug | medium | Debugging short functions (<50 LOC), error messages |
| F06 | code-generation | medium | Generating small to medium code from spec |
| F07 | integration-patterns | medium | Connecting services, API wiring, config generation |
| F08 | data-transformation | medium | ETL logic, data reshaping, format conversion |
| F09 | architecture-design | large | System design, component trade-offs, ADRs |
| F10 | security-review | large | Threat modeling, secret scanning, auth design |
| F11 | hard-ambiguity | large | Prompts with missing context, conflicting requirements |
| F12 | multi-step-reasoning | large | Long-horizon reasoning chains, research synthesis |

---

## 2. Generation Recipes by Complexity Band

### 2.1 Small band (families F01-F04)

**Assigned generator model family:** `gpt-5-mini` (or equivalent lightweight instruction model)

**Purpose:** Produce high-volume mechanical variants efficiently. These prompts have deterministic
or near-deterministic cheapest routes and do not require deep reasoning to generate or label.

**Recipe:**
1. Seed each family with 5-10 manually written examples.
2. Prompt the generator to produce N variants per seed that differ in domain, numeric values,
   or phrasing while preserving the same mechanical structure.
3. Limit each variant to <=80 tokens to prevent complexity drift.
4. Target volume: 100-150 prompts per family, 400-600 total for the small band.

**Anti-collapse safeguards:**
- Require domain rotation: at least 6 distinct topic domains across each family batch
  (e.g., cooking, finance, geography, sports, science, pop-culture).
- Reject variants with cosine similarity >0.85 to any prior variant in the same family.
- Cap same-seed variants at 20 to prevent a single seed dominating the family distribution.

### 2.2 Medium band (families F05-F08)

**Assigned generator model family:** `claude-haiku-4-5`

**Purpose:** Produce coding, debugging, and integration prompts that require modest reasoning
to construct realistically but still have resolvable cheapest-acceptable routes.

**Recipe:**
1. Seed each family with 8-12 manually written examples covering at least 3 programming
   languages and 3 distinct error or design patterns.
2. Prompt the generator to introduce controlled variation: change language, swap framework,
   modify error type, or adjust constraint (e.g., performance vs readability).
3. Limit each variant to <=300 tokens.
4. Target volume: 80-120 prompts per family, 320-480 total for the medium band.

**Anti-collapse safeguards:**
- Enforce language/framework diversity: no single language may represent >40% of variants
  in a family.
- Require structural variation: at least 3 of the following per batch of 10 -- bug type,
  input type, constraint, output format, error handling.
- Reject semantically near-duplicate variants via embedding cosine >0.85 filter.
- Prohibit the generator from referencing its own prior output (no self-affirming loops);
  each generation call receives only the seed plus the diversity constraints, not prior outputs.

### 2.3 Large band (families F09-F12)

**Assigned generator model family:** `claude-sonnet-4-6`

**Purpose:** Produce architecture, security, and hard-ambiguity prompts where route adjudication
requires strong judgment about when a cheaper route is genuinely insufficient.

**Recipe:**
1. Seed each family with 5-8 manually written examples drawn from real design reviews,
   incident post-mortems, or known ambiguous request patterns.
2. Prompt the generator to construct prompts that plausibly need a specific route tier but
   where a well-reasoned cheaper route might still be acceptable.
3. No token limit, but flag outputs >800 tokens for manual review before including in corpus.
4. Target volume: 40-70 prompts per family, 160-280 total for the large band.

**Anti-collapse safeguards:**
- Require each generation batch to span at least 3 distinct system archetypes
  (e.g., web service, embedded system, data pipeline, ML training, infrastructure).
- Hard cap: no more than 15% of large-band examples may share the same ground-truth route.
  This prevents the large band from collapsing to a single "always use the biggest model" label.
- Manual spot-check required for any family batch before it is fed to adjudication; flag
  batches where >30% of examples share a template phrase.

---

## 3. Empirical Anchor Calibration

**Before trusting synthetic labels at scale, run the empirical anchor calibration step.**

This is required (H2) and must be completed before any large-scale adjudication batch runs.

### 3.1 Anchor set construction

Manually curate 20-40 prompts spanning all 12 families and all three complexity bands
(minimum 5 prompts per band). These prompts must have ground-truth cheapest-acceptable routes
established by human review, not by model adjudication.

Store the anchor set in: `pi/prompt-routing/data/adjudication_anchors.jsonl`

Each anchor record must include:
- `prompt`: the prompt text
- `family_id`: one of F01-F12
- `complexity_band`: `small`, `medium`, or `large`
- `ground_truth_route`: object with `model_tier` and `effort_level`
- `annotator`: initials or handle of the human reviewer
- `notes`: brief justification for the ground-truth label

### 3.2 Anchor calibration procedure

1. Run the full adjudication prompt (section 4) at `temperature=0` on every anchor.
2. Compute per-band agreement rate between adjudicator output and ground-truth labels.
3. **Pass threshold:** >=80% exact-match agreement on cheapest acceptable route per band.
4. If a band fails, inspect disagreements, revise the adjudicator prompt, and re-run.
5. Re-run until all bands pass or a manual override is documented with rationale.
6. Record calibration results in `pi/prompt-routing/docs/adjudication-calibration-log.md`
   before proceeding to batch adjudication.

Skipping or shortcutting the empirical anchor calibration step invalidates downstream labels.

---

## 4. Adjudication Workflow

### 4.1 Cheapest-acceptable-route adjudication

The adjudicator's task is to assign the **cheapest acceptable route** to each generated prompt.
A route is a `(model_tier, effort_level)` pair chosen from the production action space.

**All candidate routes are evaluated using the following language:**
- **acceptable**: the route is capable of solving the prompt correctly without unreasonable
  risk of failure
- **insufficient**: the route lacks the capability or capacity to solve the prompt reliably
  (would produce catastrophic under-routing)
- **overkill**: the route is capable but consumes more cost/capacity than necessary

The adjudicator assigns a single `cheapest_acceptable_route` -- the lowest-cost candidate route
that is not `insufficient`. Overkill routes are acceptable as fallbacks but must not be chosen
as primary when a cheaper route is adequate.

### 4.2 Determinism requirements

- Adjudicator runs at `temperature=0` on every row, no exceptions.
- Every adjudication batch records a `prompt-version` hash (field name `prompt_version_hash`)
  derived from the adjudicator prompt template text (SHA-256 of the template string, truncated
  to 12 hex chars). The prompt-version hash is the canonical identifier for the template in use.
- Changing the adjudicator prompt bumps the prompt-version hash; all rows labeled with the new
  template carry the new hash. This allows per-version quality audits and rollback.
- The candidate routes compared during each adjudication call are drawn from the production
  action space defined in the adjudicator prompt template.

### 4.3 Required model family separation (B5)

The adjudicator model family must differ from the generator model family on every synthetic row.
This prevents self-affirming loops where the model that generated a prompt also validates its
own label.

Default pairings (generator -> adjudicator):
- `gpt-5-mini` generated -> `claude-haiku-4-5` adjudicates
- `claude-haiku-4-5` generated -> `gpt-5-mini` adjudicates
- `claude-sonnet-4-6` generated -> `gpt-5-mini` adjudicates (or `gemini-2.5-flash`)

Any pairing where generator and adjudicator share the same provider/family is prohibited.
Record both `generator_model` and `adjudicator_model` on every provenance row.

### 4.4 Adjudicator prompt template (v1)

The following template is the canonical adjudicator prompt. Its SHA-256 hash must be recorded
with every row it labels. Compute the hash over the template text below (excluding this line).

```
SYSTEM:
You are a route adjudicator for a cost-first prompt router. Your task is to identify the
cheapest acceptable route -- the lowest-cost (model_tier, effort_level) combination that can
reliably solve the following prompt.

Route action space (cheapest to most expensive):
  haiku/low     haiku/medium    haiku/high
  sonnet/low    sonnet/medium   sonnet/high
  opus/low      opus/medium     opus/high

Evaluate each candidate route using exactly this vocabulary:
  - acceptable: the route can solve the prompt correctly without unreasonable risk of failure
  - insufficient: the route will likely fail, hallucinate critical details, or miss key steps
  - overkill: the route can solve the prompt but consumes more cost than necessary

Select the cheapest acceptable route. A route that is "overkill" is a valid fallback but must
not be chosen as primary if a cheaper route is acceptable.

CALIBRATION ANCHORS:
{anchor_examples}

Return JSON only:
{
  "cheapest_acceptable_route": {"model_tier": "...", "effort_level": "..."},
  "route_judgments": {
    "haiku/low":    {"verdict": "acceptable|insufficient|overkill", "reason": "..."},
    "sonnet/medium":{"verdict": "acceptable|insufficient|overkill", "reason": "..."}
  },
  "confidence": "high|medium|low",
  "notes": "..."
}

USER:
Prompt: {prompt}
Family: {family_id}
Complexity band: {complexity_band}
```

### 4.5 Adjudication pipeline steps

1. For each generated prompt, load the adjudicator prompt template.
2. Compute `prompt_version_hash = sha256(template_text)[:12]`.
3. Inject the 20-40 empirical anchor examples from `adjudication_anchors.jsonl` as
   few-shot examples in the `{anchor_examples}` slot.
4. Call the adjudicator at `temperature=0`.
5. Parse and validate the JSON response; reject rows with missing required fields.
6. Write to a per-worker shard file (never append directly to canonical JSONL).
7. After all workers finish, concatenate shards and run deduplication.

---

## 5. Anti-Collapse Safeguards Summary

| Safeguard | Mechanism |
|-----------|-----------|
| Domain rotation | Require >=6 distinct topic domains per small-band family batch |
| Language diversity | No single language >40% in medium-band coding families |
| Near-duplicate filter | Reject if cosine similarity >0.85 to any prior variant in family |
| Seed cap | Max 20 variants per seed to prevent seed dominance |
| Route distribution cap | Max 15% of large-band examples with the same ground-truth route |
| No self-affirming loops | Generator and adjudicator must be different model families (B5) |
| Temperature lock | Adjudicator always runs at temperature=0 |
| Anchor calibration gate | Empirical anchor calibration must pass before batch adjudication |
| Prompt version tracking | SHA-256 hash of adjudicator template recorded on every row |

---

## 6. Provenance Record Schema

Every synthetic row must carry provenance in `synthetic_provenance.jsonl`:

```json
{
  "row_id": "uuid",
  "prompt_hash": "sha256[:16]",
  "family_id": "F05",
  "complexity_band": "medium",
  "generator_model": "claude-haiku-4-5",
  "generator_model_size": "small",
  "adjudicator_model": "gpt-5-mini",
  "adjudicator_model_size": "small",
  "prompt_version_hash": "a3f9c12b8d01",
  "generation_timestamp": "2026-04-22T00:00:00Z",
  "adjudication_timestamp": "2026-04-22T00:00:00Z",
  "cheapest_acceptable_route": {"model_tier": "haiku", "effort_level": "medium"},
  "confidence": "high"
}
```

`generator_model_size` and `adjudicator_model_size` use the values `small`, `medium`, or
`large` drawn from the complexity band definitions in section 2.

---

## 7. Volume Targets

| Band | Families | Target prompts | Generator family | Adjudicator family |
|------|----------|---------------|------------------|--------------------|
| small | F01-F04 | 400-600 | gpt-5-mini | claude-haiku-4-5 |
| medium | F05-F08 | 320-480 | claude-haiku-4-5 | gpt-5-mini |
| large | F09-F12 | 160-280 | claude-sonnet-4-6 | gpt-5-mini |
| **Total** | F01-F12 | **880-1360** | | |

Minimum corpus contribution from synthetic generation: **300 adjudicated rows** before
wave 2 closes (acceptance gate for T6).

---

## 8. Parallel Execution Model

Generation and adjudication run in three parallel worker pools -- one per complexity band.
Workers within each pool are assigned non-overlapping family IDs.

```
small-band workers:  F01  F02  F03  F04   (4 workers, generator: gpt-5-mini)
medium-band workers: F05  F06  F07  F08   (4 workers, generator: claude-haiku-4-5)
large-band workers:  F09  F10  F11  F12   (4 workers, generator: claude-sonnet-4-6)
```

Each worker writes to its own shard:
`pi/prompt-routing/data/synthetic_shards/shard_{worker_id}.jsonl`

A finalize step concatenates shards, deduplicates, and writes:
- `pi/prompt-routing/data/synthetic_route_labels.jsonl`
- `pi/prompt-routing/data/synthetic_provenance.jsonl`

Workers must NOT write directly to the canonical JSONL files (parallel-write safety H6).
