# Prompt Routing Synthetic Data Generation Prompt

Use this prompt with Claude Code to generate one synthetic prompt-routing shard.

```text
You are generating synthetic training data for a local prompt-routing classifier.

Repository context:
- Target schema examples live at: pi/prompt-routing/data/training_corpus_v3.example.json
- Existing corpus files live in: pi/prompt-routing/data/
- Validate rows with:
  cd pi/prompt-routing && uv run python tools/validate_corpus.py <output-file>

Task:
Generate ONE shard of 250 new high-quality synthetic prompt-routing rows as JSONL.

Before generating:
1. Pick exactly one shard from this plan:
   - genE: 250 Sonnet/low practical repo edits
   - genF: 250 Sonnet/high bounded complex implementation/debugging
   - genG: 250 Opus/medium architecture/security/reliability tradeoffs
   - genH: 250 mixed Haiku/none + code_review/mechanical_edit/docs rewrite gaps
2. Use the selected shard ID consistently in output path, prompt IDs, and source.
3. Do not generate more than one shard in a single run.

Output file:
- genE -> pi/prompt-routing/data/synthetic_shards/genE/chunk.jsonl
- genF -> pi/prompt-routing/data/synthetic_shards/genF/chunk.jsonl
- genG -> pi/prompt-routing/data/synthetic_shards/genG/chunk.jsonl
- genH -> pi/prompt-routing/data/synthetic_shards/genH/chunk.jsonl

Requirements:
1. Follow the v3 row schema exactly.
2. One JSON object per line.
3. Do not include markdown fences in the output file.
4. Every row must include:
   - prompt_id
   - family_id
   - prompt
   - source
   - domain
   - task_type
   - ambiguity
   - cheapest_acceptable_route
   - complexity_tier
   - route_judgments
   - provenance
   - notes
5. Use source:
   - genE: "synthetic_claude_code_genE"
   - genF: "synthetic_claude_code_genF"
   - genG: "synthetic_claude_code_genG"
   - genH: "synthetic_claude_code_genH"
6. Use prompt_id prefixes:
   - genE: "synth-genE-"
   - genF: "synth-genF-"
   - genG: "synth-genG-"
   - genH: "synth-genH-"
7. Use family_id values that group related prompts, but avoid near-duplicates.
8. Do not copy existing prompts. First scan existing corpus files for style and duplicates.
9. Avoid real company names, secrets, URLs, credentials, private paths, or personal data.
10. Prompts should sound like realistic coding-agent/user requests, not benchmark questions.
11. Route labels should represent the cheapest acceptable route, not the best possible route.
12. Include both clear and borderline cases, but keep ambiguous cases below 15%.
13. Keep wording varied. Avoid repetitive templates like “Implement X for Y” across many rows.
14. Prefer realistic repository maintenance, debugging, review, and docs tasks over abstract puzzles.

Shard-specific guidance:

genE — Sonnet/low practical repo edits:
- Target route distribution:
  - 200 Sonnet/low
  - 25 Haiku/low
  - 25 Sonnet/medium
- Focus domains:
  auth, logging, testing, frontend, backend, database, cli, api, docs, infra
- Focus task types:
  mechanical_edit, code_review, explain, rewrite, code_debug, code_write
- Examples of desired complexity:
  small repo edits, adding a validation check, updating a CLI flag, simple test fix, minor API response adjustment.

genF — Sonnet/high bounded complex implementation/debugging:
- Target route distribution:
  - 200 Sonnet/high
  - 30 Sonnet/medium
  - 20 Opus/medium
- Focus domains:
  backend, database, auth, testing, devops, performance, distributed_systems, api
- Focus task types:
  code_debug, code_write, code_review, analysis, plan
- Examples of desired complexity:
  multi-file bug investigation, bounded migration, concurrency bug, flaky test root cause, nontrivial refactor with clear constraints.

genG — Opus/medium architecture/security/reliability tradeoffs:
- Target route distribution:
  - 200 Opus/medium
  - 30 Sonnet/high
  - 20 Opus/high
- Focus domains:
  security, auth, architecture, infra, database, distributed_systems, reliability, compliance
- Focus task types:
  design, analysis, plan, code_review
- Examples of desired complexity:
  threat model, rollback strategy, multi-service migration plan, incident prevention, data retention/security tradeoff, reliability architecture.

genH — mixed Haiku/none + review/edit/docs gaps:
- Target route distribution:
  - 100 Haiku/none
  - 50 Haiku/low
  - 50 Sonnet/low
  - 30 Sonnet/medium
  - 20 Sonnet/high
- Focus domains:
  docs, testing, cli, frontend, logging, refactor, config, api, database
- Focus task types:
  code_review, mechanical_edit, explain, rewrite, factual
- Examples of desired complexity:
  answer-only clarifications, tiny documentation rewrites, simple code review comments, mechanical rename/update tasks, small config explanations.

Route guidance:
- Haiku/none: answer-only, trivial classification, direct recall, no real reasoning.
- Haiku/low: simple factual, syntax, small isolated transformations.
- Sonnet/low: practical but small repo-aware edits or reviews.
- Sonnet/medium: multi-step debugging, implementation, migration, schema/API work.
- Sonnet/high: complex implementation or analysis, but bounded enough that top-tier strategic reasoning is unnecessary.
- Opus/medium: architecture/security/reliability tradeoffs where mistakes are costly.
- Opus/high: multi-system design, threat modeling, distributed systems, irreversible migrations, high ambiguity.

For route_judgments:
- Include at least three judgments per row:
  1. One cheaper route marked "insufficient" when applicable.
  2. The cheapest acceptable route marked "acceptable".
  3. One more expensive route marked "overkill" when applicable.
- Rationales should be specific and explain why the route succeeds or fails.
- Do not use generic rationales like “too simple” or “better reasoning”.

For provenance:
- Include:
  - generator_model: "claude-code"
  - generator_model_size: the model size used for generation if known, otherwise "unknown"
  - adjudicator_model: "claude-code"
  - adjudicator_model_size: the model size used for review if known, otherwise "unknown"
  - prompt_version_hash: stable placeholder hash for this generation prompt, e.g. "sha256:genE-v1"
  - temperature: 0.0
  - generated_at: current ISO-8601 timestamp

After writing the file:
1. Run validation:
   cd pi/prompt-routing && uv run python tools/validate_corpus.py data/synthetic_shards/<SHARD>/chunk.jsonl
2. Check for duplicate prompt text against existing JSONL corpus files.
3. Produce a short report with:
   - selected shard
   - output path
   - row count
   - route distribution
   - domain distribution
   - task_type distribution
   - validation result
   - duplicate check result
   - any rows dropped or corrected

Do not merge the shard into synthetic_route_labels.jsonl and do not rebuild train/dev/eval splits unless explicitly asked.
```
