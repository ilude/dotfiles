# Product Manager Review

## Finding 1
- category: substantive defect
- severity: high
- severity rationale: The plan can fail after most implementation work because it makes exact GPT-5.5/Fable-5 execution and artifact creation an archive blocker without proving the command surface can target those models or write normalized outputs.
- evidence: The plan says the extension must not spend paid calls and only generates subagent-ready artifacts, but T6 requires running GPT-5.5 and Fable-5 subagent tasks and writing `gpt-review.json`, `fable-review.json`, `comparison.md`, and `decision-ledger.json`. It also says if exact Fable-5 targeting is unavailable, `/do-it` must stop and implement/configure targeting before archive. The plan does not identify the existing subagent API, exact model selector syntax, credential check, or writer path for those model result files.
- required_fix: Split this into two deliverables: first deliver `/skill-review` deterministic artifacts plus subagent packet generation; second deliver model-targeting execution after verifying the Pi subagent interface. If the full comparison remains in scope, add a preflight task before T1 that proves exact GPT-5.5/Fable-5 targeting and a non-secret way to persist model outputs, or blocks before implementation starts.
- confidence: high

## Finding 2
- category: low-value/theater
- severity: high
- severity rationale: The proposed MVP is not an MVP; it bundles analyzer, linter, usage mining, evaluator generation, packet schema, command wrapper, fixtures, full dogfood, and paid model comparison into one archive gate despite the user's no-gold-plating direction.
- evidence: The plan calls the MVP "the full requested build" and has "Explicit Deferrals: None" while also requiring nine generated artifacts, high-risk ranking, trigger eval generation, comparison templates, decision ledger, GPT/Fable review outputs, and schema tests. This is larger than the stated problem of reviewing skills as living assets and finding repeated corrections/no-op guidance/stale skills.
- required_fix: Redefine MVP as one no-argument command that reuses discovery and stats to emit `summary.md`, `inventory.json`, `findings.json`, and `high-risk-skills.json`. Defer `trigger-evals.json`, `subagent-tasks.json`, model comparison outputs, and `decision-ledger.json` until the deterministic report has been dogfooded and the high-risk rules prove useful.
- confidence: high

## Finding 3
- category: duplicate
- severity: medium
- severity rationale: The plan asks for new discovery, metadata, and usage-correlation shapes that risk reimplementing existing Pi behavior instead of composing it.
- evidence: `pi/lib/skill-discovery.ts` already discovers default roots, parses frontmatter with `splitFrontmatter`, supports subdir and flat skill layouts, and returns `SkillRecord` with name, description, body, filePath, source, paths, args, and metadata. `pi/extensions/skill-stats.ts` already mines session logs and emits usage, sources, candidates, diagnostics, metadata, and unused skills. The plan still defines a new `SkillReviewInventoryItem` with overlapping fields and says to implement inventory/usage correlation in a new core module.
- required_fix: Make the plan explicitly adapter-first: `skill-review.ts` must consume `discoverSkills()` records and an exported/read-only stats result, adding only derived review fields. Add an acceptance criterion that no second default-root discovery, frontmatter parser, or session-log miner is introduced.
- confidence: high

## Finding 4
- category: process defect
- severity: medium
- severity rationale: Several validation gates are not runnable at the point they are scheduled, so `/do-it` cannot execute the checklist linearly.
- evidence: T3 acceptance criterion 1 says `cd pi && pnpm test skill-review.test.ts -- --runInBand` is the verification but also admits the tests do not exist until T5. V2 then requires inspecting generated artifact schema snapshots before the test task that creates them. This turns Wave 2 into either a temporary assertion that is not specified or a blocked gate.
- required_fix: Move `skill-review.test.ts` creation and minimal fixture tests into Wave 1, then extend tests in later waves. Remove the temporary assertion language. Every acceptance criterion should reference a command or inspection that exists when the task is reached.
- confidence: high

## Finding 5
- category: substantive defect
- severity: medium
- severity rationale: The plan over-specifies fragile heuristic rules without grounding them in existing skill failures, which can produce noisy findings and make the review system less useful than the simpler inventory/stats report.
- evidence: Required deterministic rules include "duplicate trigger terms across neighboring skills", "broad/no-op phrases", "very long body", "nested references", and "one-level-deep reference violations". The plan does not define neighbor selection, phrase lists, thresholds beyond 500 lines, or how false positives are calibrated against the current 57-skill corpus before becoming findings.
- required_fix: Limit first-pass rules to objective checks: frontmatter schema, required sections, missing local references, line/word counts, and usage signals. Emit trigger-overlap candidates as advisory metrics only until dogfood results establish specific noisy phrase lists and thresholds.
- confidence: medium
