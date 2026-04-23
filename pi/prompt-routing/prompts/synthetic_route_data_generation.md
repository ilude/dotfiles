# Synthetic Route Data Generation Prompt

Use this prompt to generate batch route-labeled training data for the Pi prompt router v3 corpus.
Run two turns: (1) generate prompts at low cost, (2) adjudicate routes using the rubric below.

Replace the three placeholders before sending:

- `<<GENERATOR_MODEL>>` -- model used for prompt generation (e.g. `gpt-5`, `gemini-2.5-pro`, `haiku-4`)
- `<<ADJUDICATOR_MODEL>>` -- model used for route adjudication (e.g. `opus-4`, `claude-sonnet-4-6`, `sonnet-4.5`)
- `<<TARGET_COUNT>>` -- total rows to produce (300-1000 typical per batch)

---

## Turn 1: Generate Prompts

Generate `<<TARGET_COUNT>>` prompts across all 12 (tier, effort) cells.
Each prompt must read as something a working developer would ask a teammate.

**Output format**: JSONL, one object per line. No markdown fences. No prose.

```json
{"prompt_id":"SYN-<6-hex>","prompt":"<text>","family_id":"SYN-<family>-<tier>-<effort>","source":"synthetic","domain":"<one of 41 domains>","task_type":"<one of 15 types>","ambiguity":"<clear|borderline|ambiguous>"}
```

**Domains** (use 15+): web, api, cli, data, devops, testing, perf, docs, infra, ml, lib, refactor, auth, ui, db, config, logging, security, concurrency, caching, networking, observability, architecture, distributed_systems, crypto, scaling, migrations, data_modeling, cross_cutting, formal_reasoning, algorithms, compilers, kernel, database_internals, memory_models, consensus, scheduling, threat_modeling

**Task types** (use 8+): code_write, code_review, debug, explain, design, mechanical_edit, config, test_write, refactor, analysis, plan_migration, threat_model, proof_sketch, architecture_review, performance_analysis

**Hard rules**:
- ASCII only. No em-dashes, en-dashes, smart quotes, Unicode escapes.
- No AI/LLM/model names in prompt text.
- No real credentials, PII, or internal URLs. Use `example.com`, `service-foo`.
- Prompts must be self-contained. Include short code snippets inline -- do not reference files the reader cannot see.
- 30-500 characters typical. Harder tiers trend longer.
- No more than 3 rows share the same 30-character prefix.
- Opus-labeled prompts must not exceed 30 percent of the batch.

**Default distribution** (target, +/- 10 points per cell):

| Tier / Effort | none | low | medium | high |
|-------------|------|-----|--------|------|
| Haiku       |  15% | 15% |   10%  |   3% |
| Sonnet      |   2% | 10% |   15%  |  10% |
| Opus       |   1% |  4% |    8%  |   7% |

To fill thin cells, set `<<FOCUS_CELLS>>` with comma-separated `(tier/effort)` pairs, e.g.
`Sonnet/low, Sonnet/medium, Opus/high`. Weight 60 percent of the batch into those cells.

---

## Turn 2: Adjudicate Routes

Feed the Turn 1 output through `<<ADJUDICATOR_MODEL>>` with the rubric below.
Produce one JSONL line per input prompt. Merge adjudication into the original rows.

**Adjudication rubric**: For each prompt, find the cheapest acceptable `(model_tier, effort)`.

**Verdicts per candidate route**:
- **acceptable**: a competent model at this route produces a correct, useful answer with high reliability.
- **insufficient**: this route is likely to produce a wrong, incomplete, or brittle answer the developer would have to redo.
- **overkill**: a strictly cheaper route would also have worked.

The cheapest acceptable route is the cheapest `(tier, effort)` whose verdict is `acceptable`.

**Tier guidance**:
- **Haiku + none**: pure factual recall. "What port does HTTPS use?", "What HTTP status means 404?"
- **Haiku + low**: mechanical single-step edits. "Rename variable X to Y", "Format this JSON."
- **Haiku + medium**: short code with a light correctness check. "Add a null check here."
- **Sonnet + low**: multi-step but unambiguous. "Write a function that validates an email with two unit tests."
- **Sonnet + medium**: real judgment across one to three files. "Review this migration for safety."
- **Sonnet + high**: architecture-adjacent design. "Design a rate limiter with these constraints."
- **Opus + low**: complex reasoning but small scope. "Given three constraints, pick the best trade-off."
- **Opus + medium**: multi-step complex. "Walk me through debugging this memory leak given this flame graph."
- **Opus + high**: top-tier. Formal reasoning, distributed-systems subtleties, concurrency proofs.

**Borderline rule**: When genuinely ambiguous, bias up for safety. Set `ambiguity: "borderline"`.
Use `ambiguity: "ambiguous"` only when the prompt is missing critical context.

**Output format** (merge into Turn 1 rows):

```json
{
  "prompt_id": "SYN-<hex>",
  "family_id": "SYN-<family>-<tier>-<effort>",
  "prompt": "<text>",
  "source": "synthetic",
  "domain": "<domain>",
  "task_type": "<task_type>",
  "ambiguity": "<verdict>",
  "cheapest_acceptable_route": {"model_tier": "<tier>", "effort": "<effort>"},
  "labels": {"cheapest_acceptable_route": {"model_tier": "<tier>", "effort": "<effort>"}},
  "provenance": {
    "generator_model": "<<GENERATOR_MODEL>>",
    "adjudicator_model": "<<ADJUDICATOR_MODEL>>",
    "temperature": 0.0,
    "prompt_version_hash": "EXT-v1"
  }
}
```

**Critical**: `generator_model` and `adjudicator_model` must be different model families.
Adjudicator runs at `temperature: 0.0` with a recorded `prompt_version_hash` on every row.

---

## Anti-collapse safeguards

- Vary verb choice: use "help me", "write a", "debug this", "explain why", "design a", "how do I", "can you", "what's wrong with" -- not just one framing.
- Vary domain within the same tier: `Haiku/low` spans `cli`, `config`, `testing`, `data`, `docs`, `perf`.
- Include short developer-style prompts (under 60 characters) at `Opus/low` and `Opus/medium` to test that the classifier routes on complexity, not length.
- Include verbose `Haiku/none` and `Haiku/low` prompts (over 200 characters) to test that the classifier does not route on verbosity.
- Explicitly invent prompts for under-represented cells: if a cell has fewer than 5 examples, add 10 more.

---

## Self-check before emitting Turn 2

Before you return the final JSONL:

1. Exactly `<<TARGET_COUNT>>` rows.
2. Every row has all required fields.
3. `labels.cheapest_acceptable_route` matches the top-level field on every row.
4. `generator_model` != `adjudicator_model` on every row.
5. `temperature` is `0.0` and `prompt_version_hash` is set on every row.
6. No AI/model names in prompt text. ASCII-only.
7. At least 15 distinct domains. At least 8 distinct task types.
8. Distribution roughly matches the target table or the provided focus cells.
9. No prompt exceeds 500 characters.
10. Catastrophic under-routing: any row with ground-truth `model_tier >= Sonnet` labeled as `Haiku` must have `effort: high`. This is a hard constraint -- check it.

If any check fails, fix and re-emit. Emit JSONL only. No preamble, no explanation.