# External Generator Prompt -- v3 Route-Level Training Data

Copy everything below the line into any capable LLM (GPT-5, Gemini, Claude,
Llama 3+, Mistral Large, etc.) to generate more v3 route-labeled training
rows. Replace the three placeholders at the top before sending:

- `<<GENERATOR_MODEL_NAME>>` -- the model receiving the prompt (e.g. `gpt-5`,
  `gemini-2.5-pro`, `claude-sonnet-4-6`, `llama-3.3-70b-instruct`)
- `<<GENERATOR_FAMILY_SIZE>>` -- `small` | `medium` | `large`
- `<<TARGET_COUNT>>` -- integer row count to produce (100-1000 typical)

Optional: replace `<<FOCUS_CELLS>>` with a comma-separated list of
`(tier, effort)` cells you want filled, e.g.
`Sonnet/medium, Sonnet/high, Opus/medium`. Default is balanced coverage.

--------------------------------------------------------------------------------

# Task: Generate route-labeled developer prompts for a prompt-router training corpus

You are a synthetic-data generator for a prompt-routing classifier. The
classifier predicts the cheapest acceptable pair of `(model_tier, effort)`
that would satisfy a developer-facing prompt. Your job is to produce
realistic, diverse prompts and label each with the cheapest acceptable route
per the rubric below.

## Output format

Emit exactly `<<TARGET_COUNT>>` rows. Each row is a single-line JSON object,
one per line. No prose before, between, or after. No markdown fences. No
commentary. Just JSONL.

Row schema (all fields required):

```
{
  "prompt_id": "EXT-<6-hex-random>",
  "family_id": "EXT-<domain>-<tier>-<effort>",
  "prompt": "<the prompt text>",
  "source": "synthetic_external",
  "domain": "<one of the domains below>",
  "task_type": "<one of the task types below>",
  "ambiguity": "<clear|borderline|ambiguous>",
  "cheapest_acceptable_route": {
    "model_tier": "Haiku|Sonnet|Opus",
    "effort": "none|low|medium|high"
  },
  "labels": {
    "cheapest_acceptable_route": {
      "model_tier": "Haiku|Sonnet|Opus",
      "effort": "none|low|medium|high"
    }
  },
  "provenance": {
    "generator_model": "<<GENERATOR_MODEL_NAME>>",
    "generator_model_size": "<<GENERATOR_FAMILY_SIZE>>",
    "adjudicator_model": "self",
    "adjudicator_model_size": "<<GENERATOR_FAMILY_SIZE>>",
    "temperature": 0.0,
    "prompt_version_hash": "EXT-v1",
    "mode": "live_external",
    "cross_family": true
  }
}
```

`labels.cheapest_acceptable_route` MUST equal the top-level
`cheapest_acceptable_route` on every row. Downstream validation enforces this.

## Action space

- **Model tiers** (cost-ordered, cheapest to priciest): `Haiku` < `Sonnet` < `Opus`.
- **Effort** (cost-ordered): `none` < `low` < `medium` < `high`.
- Total cost of a route is monotonically increasing in both axes. `(Haiku, none)`
  is the cheapest route; `(Opus, high)` is the priciest.

## The rubric (use this to label)

For each prompt, think: what is the LOWEST `(tier, effort)` at which a
competent model of that tier, given that effort, would produce an answer a
working developer would accept? Three verdicts per candidate route:

- **acceptable**: a competent model at this route produces a correct, useful
  answer with high reliability.
- **insufficient**: this route is likely to produce a wrong, incomplete, or
  brittle answer that the developer would have to redo.
- **overkill**: this route produces a correct answer but a strictly cheaper
  route would also have worked.

The **cheapest acceptable route** is the cheapest `(tier, effort)` whose
verdict is `acceptable`. Label it.

### Tier guidance

- **Haiku + none**: pure factual recall. "What port does HTTPS use?", "What
  HTTP status means Not Found?". No reasoning, no code.
- **Haiku + low**: mechanical single-step code edits. "Rename variable X to
  Y", "Format this JSON", "Fix the typo in this docstring".
- **Haiku + medium**: short code with a light correctness check. "Add a null
  check here", "Write a one-line regex that matches IPv4 addresses".
- **Sonnet + low**: multi-step but unambiguous coding. "Write a function that
  validates an email address with two unit tests".
- **Sonnet + medium**: real judgment across one to three files. "Review this
  migration for safety", "Suggest an index strategy for this query",
  "Explain why this test is flaky given these logs".
- **Sonnet + high**: architecture-adjacent design. "Design a rate limiter for
  X with constraints Y", "Plan a phased rollout for this breaking API
  change", "Review this system design doc for failure modes".
- **Opus + low**: complex reasoning but small scope. "Given three constraints,
  pick the best of two trade-offs and justify", "Is this lock-free queue
  correct in the weak memory model?".
- **Opus + medium**: multi-step complex. "Walk me through debugging a memory
  leak given this flame graph", "Analyze this SQL plan and propose a faster
  rewrite with correctness reasoning".
- **Opus + high**: top-tier. Formal reasoning, distributed-systems
  subtleties, concurrency proofs, algorithmic complexity analysis, threat
  modeling with multiple constraints.

### Default rule for borderline cases

When the right label is genuinely ambiguous, **bias up for safety** (prefer
the costlier tier/effort). Set `ambiguity: "borderline"` so the downstream
pipeline can flag the row. Only use `ambiguity: "ambiguous"` when the
prompt is missing critical context; prefer to rewrite the prompt instead.

### Overkill guard (critical)

Do NOT force easy prompts into expensive tiers. A one-line factual prompt is
`Haiku/none`, not `Sonnet/high`. Over-labeling skews the training
distribution and is a rule violation. If you find yourself tempted to make
more than 30 percent of rows `Opus`, you are over-labeling -- pull back.

## Domains (pick freely; spread widely)

`web`, `api`, `cli`, `data`, `devops`, `testing`, `perf`, `docs`, `infra`,
`ml`, `lib`, `refactor`, `auth`, `ui`, `db`, `config`, `logging`, `security`,
`concurrency`, `caching`, `networking`, `observability`, `architecture`,
`distributed_systems`, `crypto`, `scaling`, `migrations`, `data_modeling`,
`cross_cutting`, `formal_reasoning`, `algorithms`, `compilers`, `kernel`,
`database_internals`, `memory_models`, `consensus`, `scheduling`,
`threat_modeling`.

Use at least **15 distinct domains** across the full batch. If a custom
`<<FOCUS_CELLS>>` was provided, weight domain choice toward those cells'
natural habitat (e.g. `concurrency` / `algorithms` for `Opus/high`).

## Task types (pick freely; spread widely)

`code_write`, `code_review`, `debug`, `explain`, `design`, `mechanical_edit`,
`config`, `test_write`, `refactor`, `analysis`, `plan_migration`,
`threat_model`, `proof_sketch`, `architecture_review`, `performance_analysis`.

Use at least **8 distinct task types** across the full batch.

## Diversity requirements

- No more than 3 rows share the same 30-character prefix.
- Vary phrasing, verb choice, length (30-500 chars typical; the harder the
  tier the longer the prompt tends to be).
- Do NOT copy-paste templates. Real developer asks are irregular.

## Hard rules on prompt content

- ASCII only. No em-dashes (`--` allowed), no en-dashes, no smart quotes, no
  Unicode escapes.
- No references to AI, LLMs, Claude, GPT, Gemini, Llama, or model names in
  the prompt text. The prompt should read as something a working developer
  would ask a teammate or paste into a coding tool.
- No real credentials, no real PII, no real internal URLs. Fabricate
  plausible placeholders (`example.com`, `api.internal.example`,
  `service-foo`).
- Prompts must be self-contained. If the prompt references code, include the
  code inline (short snippets are fine; do NOT reference files the reader
  cannot see).

## Focus cells (optional)

If the user filled in `<<FOCUS_CELLS>>`, weight the batch so at least 60
percent of rows fall in those cells. Still include some rows outside the
focus cells to preserve diversity -- a collapsed distribution is bad
training data.

If `<<FOCUS_CELLS>>` is blank, use this rough default distribution (you may
deviate up to +/- 10 points per cell):

| Tier / Effort | none | low | medium | high |
|--------------|------|-----|--------|------|
| Haiku        |  15% | 15% |   10%  |   3% |
| Sonnet       |   2% | 10% |   15%  |  10% |
| Opus         |   1% |  4% |    8%  |   7% |

## Self-check before emitting

Before you return your JSONL, internally verify:

1. Exactly `<<TARGET_COUNT>>` rows, one JSON object per line.
2. Every row has all required fields; `labels.cheapest_acceptable_route`
   matches the top-level.
3. No em-dashes, no en-dashes, ASCII-only in prompt text.
4. No AI / model mentions in prompt text.
5. At least 15 distinct domains, at least 8 distinct task types.
6. Distribution roughly matches the focus cells or the default table.
7. No prompt is longer than 1000 characters.

If any check fails, fix and re-emit.

## Output now

Emit the JSONL. Nothing else. No preamble, no postscript, no explanation.
