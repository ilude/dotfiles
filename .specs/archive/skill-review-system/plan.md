---
created: 2026-07-08
status: completed
completed: 2026-07-09
---

# Plan: Skill Review System

## Context & Motivation

This work builds a Pi-native skill-review system for the local skill corpus. The trigger was a discussion about treating skills as living operational assets instead of one-shot generated files: review actual usage, find repeated correction patterns, remove no-op guidance, tighten triggers, prune stale skills, and compare model judgment only where judgment adds value.

Local investigation found that the repo already has useful pieces but not the complete review system:

- Skill discovery and loading exist in `pi/lib/skill-discovery.ts` and `pi/extensions/skill-loader.ts`.
- Skill usage mining exists in `pi/extensions/skill-stats.ts` and reads Pi session logs.
- Plan review infrastructure exists in `pi/skills/workflow/review-it.md` and reviewer artifacts, but it is plan-focused rather than `SKILL.md` lifecycle-focused.
- Current local scans found 57 unique skills mirrored under `pi/skills` and the user skill directory, with some long skills and several unused-in-log candidates.
- Web research on current skill guidance converged on the same themes: concise skill bodies, precise descriptions, progressive disclosure, eval-first iteration, negative trigger tests, deterministic graders before model judgment, and testing with every model family intended for use.
- Review of this plan found that the original draft did not fully specify exact model targeting, slash-command dogfood execution, pre-subagent secret scanning, durable evidence manifests, schema validation, or early type coverage for `pi/lib` helpers. Those fixes are now built into this plan.

The requested outcome is the full system to completion, not a partial first phase. The completed system must create deterministic full-corpus review artifacts, generate prompt/eval packets for model comparison, support GPT-5.5 plus Fable-5 comparison through Pi subagents, enforce the Fable cost/effort policy, and validate the user-facing `/skill-review` workflow.

## Constraints

- Platform: Windows Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`, shell `/usr/bin/bash`).
- Primary implementation surface: Pi TypeScript extension work under `pi/`.
- Package manager: Pi TypeScript work is pnpm-only. Do not use Bun or npm for Pi validation.
- User-facing command: exactly `/skill-review`. No user-facing options or argument plumbing.
- Test-only configurability is allowed through exported helper function parameters. It must not leak into the slash command UX.
- Generated command output location: `.tmp/skill-review/{timestamp}/` under the git repo root only.
- The command must resolve the git repo root before writing. It must not write to a cwd-relative `.tmp` when invoked from a subdirectory.
- Every generated run directory must be created exclusively, must not follow symlinks outside the repo, and must include an atomic status/manifest file.
- MVP is read-only with respect to source skills. It may write generated evidence under `.tmp/skill-review/{timestamp}/` and sanitized archive manifests under `.specs/skill-review-system/evidence/`.
- The command must review the default discovered corpus without asking the user to provide a root path.
- Deterministic scripts/functions do inventory, linting, usage correlation, high-risk ranking, trigger eval generation, model packet construction, comparison validation, evidence manifests, and archive checks.
- Model judgment is reserved for evaluation and synthesis, not filesystem discovery, parsing, ranking primitives, source write decisions, or schema validation.
- GPT-5.5 and Fable-5 are both used for comparison where the generated complexity gate says model review is warranted.
- Exact model and effort targeting must be implemented through dedicated reviewer agent definitions with explicit `model:` frontmatter using Pi's model thinking shorthand and verified by harmless subagent dry runs before building the rest of the system.
- Fable-5 must never run above high effort. Skip Fable for low-complexity, easy, or simple items. Use the exact-model agent `skill-review-fable-medium` for moderate classification/disagreement and `skill-review-fable-high` for high-risk workflow, delete/split, or routing-conflict decisions. If T0 cannot prove medium/high effort selection through the child Pi model path, execution must stop before any paid Fable review.
- The extension itself must not directly spend paid model calls. It must generate subagent-ready artifacts that `/do-it` can run through Pi subagents.
- If exact Fable-5 targeting is unavailable during T0, execution must stop before implementation work proceeds. Do not substitute another model and do not archive.
- Reuse existing discovery and stats behavior. Do not introduce a second default-root discovery algorithm, frontmatter parser, or session-log miner unless a documented limitation requires a small adapter.
- `pi/lib/*` must not import from `pi/extensions/*`. Shared usage collection needed by both `skill-stats` and `skill-review` must live under `pi/lib`.
- File content must use LF and ASCII punctuation only.
- No source skill rewrites, deletions, or scope moves are allowed in this plan. The system may recommend those actions in generated artifacts.
- No hidden escape hatch: archive requires a full-corpus deterministic run plus a high-risk GPT/Fable comparison artifact, not just unit tests.

## Risk & Manual Gate Decision

Manual gates are exceptional. This plan changes local repo files and writes generated local evidence. The only external-cost concern is the Fable-5 comparison run, which the user explicitly requested with cost controls.

- **Risk level:** medium
- **Blast radius:** personal-local-repo plus bounded paid model usage for the high-risk comparison run
- **Rollback:** easy for source changes through git; generated `.tmp/skill-review/{timestamp}/` artifacts can be ignored or deleted; tracked implementation changes can be reviewed and reverted
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** Source mutations are local, reversible, and covered by automated Pi tests. The Fable run is bounded by T0 exact-targeting preflight, generated high-risk packets, a deterministic budget gate, skip/medium/high effort policy, and explicit no-above-high cap. If Fable targeting or credentials are missing, execution blocks before implementation work instead of proceeding with an unapproved substitute.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Prompt-only workflow skill | Fast to write and easy to change | Cannot reliably enforce deterministic artifact schemas, read-only source boundaries, output paths, or tests | Rejected: too weak for a repeatable review system |
| TypeScript extension with no user-facing options | Fits Pi command surface, can share pure helpers with tests, supports deterministic artifacts, keeps UX simple | Requires implementation and tests | **Selected** |
| Add user-selectable root/options to `/skill-review` | Useful for generic tooling and fixtures | Gold plating for a single-user system; conflicts with user direction | Rejected: helper-level root injection is enough for tests |
| Extension directly calls GPT/Fable APIs | Fully automated from one command | Embeds paid side effects, credential complexity, provider assumptions, and harder tests | Rejected: generated subagent artifacts give the same workflow with safer boundaries |
| Stop after deterministic lint report | Cheap and simple | Fails the requested GPT plus Fable comparison and full-system goal | Rejected: not the full system |
| Full-corpus model review with Fable | Strongest independent judgment | Expensive and unnecessary for simple skills | Rejected: Fable reviews compact high-risk/disagreement packets only |
| Apply generated recommendations to all skills in this plan | Produces immediate cleanup | Mixes system construction with content remediation and greatly expands blast radius | Rejected for this plan: the system must produce recommendations, not mutate skills |
| Defer model comparison to a later plan | Reduces implementation risk | Violates the user's explicit full-system requirement | Rejected: T0 makes model targeting executable before other work proceeds |

## Objective

Build and validate a complete Pi skill-review system that:

1. Adds exact-model reviewer agents for GPT-5.5 xhigh, Fable-5 medium, and Fable-5 high, then verifies they can be invoked through Pi subagents.
2. Adds a no-argument `/skill-review` slash command.
3. Runs deterministic full-corpus skill inventory, lint, usage correlation, high-risk ranking, trigger eval generation, packet construction, budget checks, secret/privacy scanning, and schema validation.
4. Writes generated command artifacts under `.tmp/skill-review/{timestamp}/` and writes only sanitized evidence manifests under `.specs/skill-review-system/evidence/`.
5. Produces model-ready packets and comparison templates for GPT-5.5 and Fable-5 review through Pi subagents.
6. Enforces the Fable skip/medium/high effort policy and never-above-high cap in generated instructions, agent definitions, budget gates, and validation.
7. Provides tests proving deterministic behavior, read-only source boundaries, artifact schemas, command registration, model packet rules, command smoke execution, and no user-facing options.
8. Dogfoods the completed command on the current corpus and records a full-corpus deterministic run plus high-risk GPT/Fable comparison artifacts before archive.

## MVP Boundary

The MVP boundary is the full requested build: exact model reviewer agents, a working no-argument `/skill-review` command, deterministic full-corpus artifacts, model-comparison packets, subagent-ready review prompts, comparison output schema, smoke runner, tests, and one dogfood run over the current corpus.

This is sufficient because the user-visible outcome is the reusable review system, not the subsequent cleanup of every skill. The plan is still bounded because it avoids source skill edits, direct provider API integration inside the extension, distribution packaging, and broad command surface expansion.

## Explicit Deferrals

Applying the generated recommendations to rewrite, split, scope, or delete skills is not part of building the review system and must not be required for archive. That is a separate content-remediation use of the completed system.

## Project Context

- **Language**: TypeScript for Pi extensions, Pi agents, scripts, and tests; Python/shell also exist elsewhere in the repo.
- **Detected markers**: `pyproject.toml`, `Makefile`, `.gitattributes`, `pi/package.json`, `pi/extensions/tsconfig.json`.
- **Test command**: `cd pi && pnpm test`.
- **Focused test command**: `cd pi && pnpm test skill-review.test.ts` after the new test exists.
- **Lint/type command**: `cd pi && pnpm run typecheck`.
- **Repo-wide validation command**: `make check-pi-extensions` for Pi extension work.
- **Existing related tests**: `pi/tests/skill-discovery.test.ts`, `pi/tests/skill-loader.test.ts`, `pi/tests/skill-prompt.test.ts`, `pi/tests/skill-stats.test.ts`, `pi/tests/review-artifact.test.ts`.
- **Subagent model behavior**: `pi/extensions/subagent/index.ts` passes `--model` from `agent.model` frontmatter when no dynamic `modelSize` override is supplied. Exact GPT/Fable review must use dedicated agent files with explicit `model:` values.
- **Pi extension conventions**: top-level files under `pi/extensions/*.ts` auto-load as extensions; shared helper modules belong under `pi/lib`.
- **Slug check**: `.specs/skill-review-system` was available when this plan was created.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && test -f pi/package.json && test -f pi/extensions/tsconfig.json && test -f pi/extensions/subagent/index.ts` | none | terminal output captured in `/do-it` notes |
| Exact model targeting preflight | Pi `subagent` tool dry runs with `skill-review-gpt`, `skill-review-fable-medium`, and `skill-review-fable-high` agents after T0 | existing Pi model configuration; Bedrock auth remains in local ignored Pi auth | dry-run outputs, model ids, and effective thinking levels recorded in `.specs/skill-review-system/evidence/model-targeting.json` |
| Implement model reviewer agents | edit `pi/agents/skill-review-gpt.md`, `pi/agents/skill-review-fable-medium.md`, and `pi/agents/skill-review-fable-high.md` | none | git diff for agent files plus dry-run outputs |
| Implement deterministic core | edit `pi/lib/skill-review.ts` and any small shared `pi/lib/*` adapter needed for skill stats reuse | none | git diff and focused tests |
| Implement command wrapper and scripts | edit `pi/extensions/skill-review.ts`, `pi/scripts/skill-review-smoke`, `pi/scripts/skill-review-validate-run`, `pi/scripts/skill-review-run-models` | none | command-handler tests, smoke runner output, validator output, and model-runner dry-run output |
| Implement tests/fixtures | edit `pi/tests/skill-review.test.ts` and `pi/tests/fixtures/skill-review/**` | none | focused Vitest output |
| Run focused tests | `cd pi && pnpm test skill-review.test.ts` | none | passing Vitest output |
| Run related Pi tests | `cd pi && pnpm test skill-discovery.test.ts skill-loader.test.ts skill-stats.test.ts review-artifact.test.ts skill-review.test.ts` | none | passing Vitest output |
| Typecheck | `cd pi && pnpm run typecheck` | none | exit 0 with no type errors |
| Full Pi validation | `make check-pi-extensions` | none | exit 0 with no errors |
| User-facing dogfood | `pi --mode json --no-session -p '/skill-review'` from repo root, plus `pi/scripts/skill-review-smoke` if prompt-mode slash execution is unsupported | none | latest `.tmp/skill-review/{timestamp}/summary.md`, manifest, and transcript/smoke output |
| Pre-subagent packet safety | `pi/scripts/skill-review-validate-run .tmp/skill-review/{timestamp}` | none | validation report proving schema, budget, source manifests, and secret scan passed before model review |
| GPT/Fable comparison | `pi/scripts/skill-review-run-models <run-dir>` reads `subagent-tasks.json`, invokes exact-model reviewer agents through Pi subagents, writes model outputs, builds `comparison.md`, and updates `decision-ledger.json` | existing Pi model configuration; no secrets in artifacts | `.tmp/skill-review/{timestamp}/gpt-review.json`, `fable-review.json`, `comparison.md`, `decision-ledger.json` |
| Archive evidence manifest | `pi/scripts/skill-review-validate-run .tmp/skill-review/{timestamp} --write-evidence-manifest` or equivalent positional subcommand | none | `.specs/skill-review-system/evidence/{timestamp}.json` with sanitized counts, model ids, hashes, statuses, and artifact names |
| Rollback | no automatic destructive rollback; leave changes uncommitted and report failing task | none | git status and failing validation output |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 0

- [ ] T0: Establish exact model and effort targeting execution contract
  - Status: pending
  - Evidence: --
- [ ] V0: Validate wave 0
  - Status: pending
  - Evidence: --

### Wave 1

- [ ] T1: Implement deterministic skill-review core
  - Status: pending
  - Evidence: --
- [ ] T2: Add minimal deterministic tests, fixture corpus, and expected schemas
  - Status: pending
  - Evidence: --
- [ ] V1: Validate wave 1
  - Status: pending
  - Evidence: --

### Wave 2

- [ ] T3: Implement artifact generation, safety gates, and model-comparison packet construction
  - Status: pending
  - Evidence: --
- [ ] V2: Validate wave 2
  - Status: pending
  - Evidence: --

### Wave 3

- [ ] T4: Implement no-argument `/skill-review` extension command and smoke/model runners
  - Status: pending
  - Evidence: --
- [ ] V3: Validate wave 3
  - Status: pending
  - Evidence: --

### Wave 4

- [ ] T5: Expand automated tests for command, artifacts, read-only behavior, and model packet rules
  - Status: pending
  - Evidence: --
- [ ] V4: Validate wave 4
  - Status: pending
  - Evidence: --

### Wave 5

- [ ] T6: Run full-corpus dogfood and GPT/Fable high-risk comparison
  - Status: pending
  - Evidence: --
- [ ] V5: Validate wave 5
  - Status: pending
  - Evidence: --

### Final Gates

- [ ] F1: Task-specific verification complete
  - Status: pending
  - Evidence: --
- [ ] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: --
- [ ] F3: Manual validation not required or completed
  - Status: pending
  - Evidence: --
- [ ] F4: Deployment validation complete or not required
  - Status: pending
  - Evidence: --
- [ ] F5: Archive preflight complete
  - Status: pending
  - Evidence: --

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Establish exact model and effort targeting execution contract | 3-5 files: `pi/agents/skill-review-gpt.md`, `pi/agents/skill-review-fable-medium.md`, `pi/agents/skill-review-fable-high.md`, possible evidence helper | feature | medium | typescript-pro | -- |
| V0 | Validate wave 0 | -- | validation | medium | qa-engineer | T0 |
| T1 | Implement deterministic skill-review core | 1-3 files: `pi/lib/skill-review.ts`, possible shared `pi/lib/*` adapter | feature | medium | typescript-pro | V0 |
| T2 | Add minimal deterministic tests, fixture corpus, and expected schemas | 3-6 files: `pi/tests/skill-review.test.ts`, `pi/tests/fixtures/skill-review/**` | feature | medium | qa-engineer | V0 |
| V1 | Validate wave 1 | -- | validation | medium | qa-engineer | T1, T2 |
| T3 | Implement artifact generation, safety gates, and model-comparison packet construction | 1-3 files: `pi/lib/skill-review.ts`, fixture golden updates if needed | feature | medium | typescript-pro | V1 |
| V2 | Validate wave 2 | -- | validation | medium | qa-engineer | T3 |
| T4 | Implement no-argument `/skill-review` extension command and smoke/model runners | 3-4 files: `pi/extensions/skill-review.ts`, `pi/scripts/skill-review-smoke`, `pi/scripts/skill-review-validate-run`, `pi/scripts/skill-review-run-models` | feature | medium | typescript-pro | V2 |
| V3 | Validate wave 3 | -- | validation | medium | qa-engineer | T4 |
| T5 | Expand automated tests for command, artifacts, read-only behavior, and model packet rules | 2-5 files: `pi/tests/skill-review.test.ts`, `pi/tests/fixtures/skill-review/**` | feature | medium | qa-engineer | V3 |
| V4 | Validate wave 4 | -- | validation | medium | qa-engineer | T5 |
| T6 | Run full-corpus dogfood and GPT/Fable high-risk comparison | generated `.tmp/skill-review/{timestamp}/**`, `.specs/skill-review-system/evidence/{timestamp}.json` | validation | medium | planner | V4 |
| V5 | Validate wave 5 | -- | validation | medium | qa-engineer | T6 |
| F1 | Task-specific verification complete | -- | final-gate | small | qa-engineer | V5 |
| F2 | Repo-wide validation complete | -- | final-gate | medium | qa-engineer | F1 |
| F3 | Manual validation not required or completed | -- | final-gate | small | reviewer | F2 |
| F4 | Deployment validation complete or not required | -- | final-gate | small | reviewer | F3 |
| F5 | Archive preflight complete | -- | final-gate | small | reviewer | F4 |

## Execution Waves

### Wave 0

**T0: Establish exact model and effort targeting execution contract** [medium] -- typescript-pro
- Description: Add or update exact-model skill-review reviewer agents and verify Pi subagent execution can target GPT-5.5 xhigh, Fable-5 medium, and Fable-5 high before implementation proceeds. The agents must be narrow review workers for generated skill-review packets, not broad general-purpose agents.
- Files: `pi/agents/skill-review-gpt.md`, `pi/agents/skill-review-fable-medium.md`, `pi/agents/skill-review-fable-high.md`, possible small helper/evidence fixture if needed.
- Required behavior:
  - `skill-review-gpt` frontmatter uses `model: openai-codex/gpt-5.5:xhigh`.
  - `skill-review-fable-medium` frontmatter uses `model: amazon-bedrock/us.anthropic.claude-fable-5:medium`.
  - `skill-review-fable-high` frontmatter uses `model: amazon-bedrock/us.anthropic.claude-fable-5:high`.
  - All agents state that they must write normalized JSON only to assigned output paths and must not edit source skills.
  - The Fable agent instructions forbid above-high effort and require skip/medium/high policy compliance.
  - `/do-it` must run harmless subagent dry runs for all three exact-model agents before T1/T2.
- Acceptance Criteria:
  1. [ ] Exact model agent files exist and contain the required model and effort ids.
     - Verify: `rg -n "model: openai-codex/gpt-5.5:xhigh|model: amazon-bedrock/us.anthropic.claude-fable-5:medium|model: amazon-bedrock/us.anthropic.claude-fable-5:high" pi/agents/skill-review-gpt.md pi/agents/skill-review-fable-medium.md pi/agents/skill-review-fable-high.md`
     - Pass: all required model ids and thinking levels are present in the expected files.
     - Fail: any model id or thinking level is missing or present in the wrong agent.
  2. [ ] The subagent runtime path supports agent-frontmatter model selection.
     - Verify: `rg -n "else if \(agent\.model\) args\.push\(\"--model\", agent\.model\)" pi/extensions/subagent/index.ts`
     - Pass: the runtime still passes `agent.model` to the child Pi invocation.
     - Fail: exact model binding is not supported by the current subagent path; stop and update this plan before proceeding.
  3. [ ] Harmless exact-model and effort dry runs succeed before implementation work.
     - Verify: use the Pi `subagent` tool three times: `{ "agent": "skill-review-gpt", "task": "Return exactly MODEL-CHECK-GPT.", "agentScope": "both", "confirmProjectAgents": false }`, `{ "agent": "skill-review-fable-medium", "task": "Return exactly MODEL-CHECK-FABLE-MEDIUM.", "agentScope": "both", "confirmProjectAgents": false }`, and `{ "agent": "skill-review-fable-high", "task": "Return exactly MODEL-CHECK-FABLE-HIGH.", "agentScope": "both", "confirmProjectAgents": false }`.
     - Pass: outputs contain the exact requested strings and subagent details show the expected model ids with xhigh, medium, and high thinking levels.
     - Fail: model or effort targeting is unavailable, credentials are missing, a different model is used, or thinking level cannot be verified; stop before T1.

### Wave 0 -- Validation Gate

**V0: Validate wave 0** [medium] -- qa-engineer
- Blocked by: T0
- Checks:
  1. Run all T0 acceptance criteria.
  2. Record dry-run outputs, model ids, and effective thinking levels in `.specs/skill-review-system/evidence/model-targeting.json` without secrets.
  3. Confirm no generated or reviewed packet is sent to Fable during this gate beyond the harmless dry-run prompt.
- On failure: stop the plan. Do not proceed to implementation or archive until exact model targeting is fixed and revalidated.

### Wave 1 (parallel)

**T1: Implement deterministic skill-review core** [medium] -- typescript-pro
- Blocked by: V0
- Description: Create a testable core module for skill review. The core must adapt existing skill discovery and skill stats behavior where possible, accept injected roots/session paths for tests only, and expose pure helpers for inventory, lint findings, high-risk ranking, trigger eval generation, artifact rendering, JSON serialization, source manifests, packet safety validation, comparison validation, and evidence manifest data. It must not write files.
- Files: `pi/lib/skill-review.ts` and any small shared `pi/lib/*` adapter needed to reuse skill stats. Do not import from `pi/extensions/*`.
- Required core data shapes:
  - `SkillReviewInventoryItem`: skill name, description, source, normalized path, word count, line count, frontmatter fields, body headings, auto-activate text, boundary signal, reference links, usage counts when available.
  - `SkillReviewFinding`: stable id, skill, path, rule id, severity, message, evidence, recommendation, deterministic boolean, finding class.
  - `HighRiskSkill`: skill, score, reasons, recommended packet type, Fable policy decision, packet byte estimate.
  - `TriggerEval`: skill, prompt id, prompt, expected trigger boolean, reason.
  - `SkillReviewRunManifest`: run id, repo root, source manifests, artifact hashes, status, started/completed timestamps, validation statuses.
- Required deterministic rules:
  1. Agent Skills spec baseline: name present, lowercase letters/numbers/hyphens only, max 64, no leading/trailing/consecutive hyphen, description present and max 1024.
  2. Local skill body expectations: `# Title`, `Auto-activate when:`, boundary or `Not for` signal for overlapping skills.
  3. Progressive disclosure: flag body over 500 lines, missing referenced local files, and one-level-deep reference violations. Treat long-body thresholds as configurable finding metadata.
  4. Trigger quality: broad/no-op phrases, vague descriptions, duplicate trigger terms, and overlap findings are advisory candidates until calibrated by dogfood output. They must not directly become delete/split decisions.
  5. Repo local safety: ASCII punctuation in generated source/test fixtures, no source skill mutation, no command option behavior.
  6. Usage correlation: include used/unused/manual-read/candidate signals when available, but never treat zero usage as a delete decision by itself.
- Acceptance Criteria:
  1. [ ] Core helpers compile through an actual test import before the extension imports them.
     - Verify: `cd pi && pnpm test skill-review.test.ts`
     - Pass: minimal Wave 1 tests import `../lib/skill-review.ts` and pass.
     - Fail: tests cannot import the core module, or helper signatures are unstable.
  2. [ ] Core module has no filesystem writes and no extension imports.
     - Verify: `rg -n "writeFile|mkdir|rm\(|unlink|rename|\.\./extensions|from \"../extensions|from '../extensions" pi/lib/skill-review.ts`
     - Pass: no matches for write/mutation APIs or extension imports in the pure core module.
     - Fail: mutation APIs or extension imports appear in the core module.

**T2: Add minimal deterministic tests, fixture corpus, and expected schemas** [medium] -- qa-engineer
- Blocked by: V0
- Description: Add a compact fixture corpus and an initial `skill-review.test.ts` in Wave 1, not later. The initial tests must import the core module, exercise valid skills, malformed frontmatter, missing boundary, broad trigger overlap, long body signal, missing reference, model-output schema fixtures, and usage-correlation placeholders.
- Files: `pi/tests/skill-review.test.ts`, `pi/tests/fixtures/skill-review/**`.
- Acceptance Criteria:
  1. [ ] Fixtures cover at least one pass case and at least five distinct finding rules.
     - Verify: `find pi/tests/fixtures/skill-review -type f | sort`
     - Pass: output includes fixture skills for clean, frontmatter problem, boundary problem, trigger overlap, missing reference, and long-body cases.
     - Fail: fewer than the required cases exist.
  2. [ ] Fixture content does not depend on absolute paths or local usernames.
     - Verify: `rg -n "C:/Users|/home/|mglenn|\\\\" pi/tests/fixtures/skill-review`
     - Pass: no matches.
     - Fail: fixture embeds local absolute paths or Windows-style path separators.
  3. [ ] Minimal core-import tests exist and pass in Wave 1.
     - Verify: `cd pi && pnpm test skill-review.test.ts`
     - Pass: exits 0 and covers at least inventory extraction plus one finding rule.
     - Fail: test file is missing or relies on later command-wrapper work.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- qa-engineer
- Blocked by: T1, T2
- Checks:
  1. Run T1 and T2 acceptance criteria.
  2. `cd pi && pnpm test skill-review.test.ts` -- minimal core tests pass.
  3. `cd pi && pnpm run typecheck` -- typecheck passes for currently imported code.
  4. Confirm no shared helper under `pi/lib` imports from `pi/extensions`.
- On failure: create a targeted fix task, rerun affected acceptance criteria, then rerun V1.

### Wave 2

**T3: Implement artifact generation, safety gates, and model-comparison packet construction** [medium] -- typescript-pro
- Blocked by: V1
- Description: Extend the core module with deterministic renderers and validators for all required output artifacts. The artifact set must support full-corpus review and high-risk model comparison without calling models from the extension.
- Files: `pi/lib/skill-review.ts`; fixture golden files if tests require them.
- Required artifacts:
  - `summary.md`: human-readable full-corpus summary, top findings, high-risk list, run status, and next actions.
  - `inventory.json`: all discovered skills with normalized metadata.
  - `findings.json`: stable sorted deterministic findings.
  - `high-risk-skills.json`: deterministic ranking, packet byte estimate, and Fable policy decision per high-risk skill.
  - `trigger-evals.json`: explicit, implicit, and negative-control prompts for high-risk skills.
  - `model-packet.md`: compact packet for GPT/Fable reviewers.
  - `subagent-tasks.json`: subagent-ready task prompts for exact-model agents.
  - `comparison-template.json`: required normalized output schema for model review comparison.
  - `decision-ledger.json`: initialized ledger structure for keep/tighten/rewrite/split/scope-local/delete/needs-human-review decisions.
  - `run-manifest.json`: run status, artifact hashes, source manifests, validation status, and completion markers.
- Required validators:
  - Packet safety validator: fail closed on secret/token/private-key patterns, `.env` content, local absolute paths that are not needed, oversized packets, and references outside allowed skill roots.
  - Budget validator: count selected items, packet bytes, estimated token size, Fable item count, and skip reasons. The default caps are 25 GPT-reviewed skills, 10 Fable-reviewed skills, 80 KB total model packet text, and 35 KB Fable packet text. If raw candidates exceed these caps, deterministically select the highest-risk items within cap, mark omitted items as `not-run-budget-capped`, and record the reason in `decision-ledger.json`. Do not create an interactive approval path.
  - Model output validator: parse `gpt-review.json`, `fable-review.json`, and `decision-ledger.json`; validate required fields/enums; record invalid output as invalid/not-comparable rather than accepting it.
  - Source manifest validator: compare before/after manifests for repo skill roots, user skill roots, session log directory, and Pi settings paths touched by the run.
- Model policy requirements in generated artifacts:
  - GPT-5.5 reviews the full high-risk packet produced from deterministic ranking.
  - Fable-5 reviews only compact high-risk/disagreement packets unless a skill is workflow/runtime/safety critical.
  - Fable skip/medium/high decision is present for every high-risk item.
  - Fable above-high effort is forbidden in artifact text and schemas.
  - Generated prompts require actionable findings and label deterministic false positives rather than treating every flag as a bug.
- Acceptance Criteria:
  1. [ ] Artifact renderers produce stable sorted JSON and Markdown for fixtures.
     - Verify: `cd pi && pnpm test skill-review.test.ts`
     - Pass: tests for artifact rendering pass with stable output.
     - Fail: output order changes across runs or generated JSON omits required artifact sections.
  2. [ ] Generated model packet includes both GPT and Fable comparison paths with Fable effort cap.
     - Verify: `rg -n "GPT-5.5|Fable-5|above high|skip|medium|high" pi/lib/skill-review.ts pi/tests/fixtures/skill-review pi/tests/skill-review.test.ts`
     - Pass: generated template coverage exists and forbids above-high Fable effort.
     - Fail: packet supports only one model or lacks cost/effort controls.
  3. [ ] Safety, budget, and model-output validators have malformed fixtures.
     - Verify: `cd pi && pnpm test skill-review.test.ts`
     - Pass: tests prove secret-like packets fail before subagent tasks, budget caps are enforced, and malformed model outputs become invalid/not-comparable.
     - Fail: invalid data is accepted, crashes comparison, or can reach subagent task generation.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- qa-engineer
- Blocked by: T3
- Checks:
  1. Run T3 acceptance criteria.
  2. `cd pi && pnpm test skill-review.test.ts` -- artifact and validator tests pass.
  3. `cd pi && pnpm run typecheck` -- typecheck passes.
  4. Inspect generated artifact schema snapshots in tests or fixture outputs for all required files.
- On failure: fix artifact rendering or validators and rerun V2.

### Wave 3

**T4: Implement no-argument `/skill-review` extension command and smoke/model runners** [medium] -- typescript-pro
- Blocked by: V2
- Description: Add the Pi extension command wrapper plus scriptable smoke, validation, and model-runner scripts. The command must accept no meaningful user options, discover the default skill corpus, collect best-effort usage stats, create `.tmp/skill-review/{timestamp}/` under the repo root, write the full artifact set, and display the summary plus output path. It must fail explicitly on write errors, schema errors, secret-scan failures, budget failures, or source-manifest failures.
- Files: `pi/extensions/skill-review.ts`, `pi/scripts/skill-review-smoke`, `pi/scripts/skill-review-validate-run`, `pi/scripts/skill-review-run-models`.
- Required behavior:
  - Register command name `skill-review`.
  - Ignore blank args. If non-blank args are supplied, report usage error instead of interpreting options.
  - Use timestamp format safe for paths, for example `YYYYMMDDTHHMMSSmmmZ`.
  - Resolve the git repo root and write only under `.tmp/skill-review/{timestamp}/` there.
  - Use exclusive run-directory creation. If a timestamp collision occurs, fail clearly or append a deterministic monotonic suffix.
  - Reject `.tmp`, `.tmp/skill-review`, or the run directory when realpath containment would escape the repo or traverse a symlink.
  - Do not modify `pi/skills`, user skill directories, session logs, settings, or source files.
  - Write `run-manifest.json` states atomically: `started`, `deterministic-complete`, `packet-safety-complete`, `model-comparison-complete`, `validated`.
  - `pi/scripts/skill-review-smoke` must exercise the same command handler and print the run directory for `/do-it` capture.
  - `pi/scripts/skill-review-validate-run <run-dir>` must validate schemas, packet safety, budget, source manifests, model outputs when present, and sanitized evidence manifest generation.
  - `pi/scripts/skill-review-run-models <run-dir>` must read `subagent-tasks.json`, invoke the exact-model `skill-review-gpt`, `skill-review-fable-medium`, and `skill-review-fable-high` agents through the Pi `subagent` tool or the same child-Pi invocation semantics, write `gpt-review.json` and `fable-review.json`, build `comparison.md`, update `decision-ledger.json`, and fail closed if model outputs are missing or invalid. It must not accept arbitrary model ids from user input.
- Acceptance Criteria:
  1. [ ] Command registration is testable through the existing mock Pi helper.
     - Verify: `cd pi && pnpm test skill-review.test.ts`
     - Pass: test confirms `/skill-review` is registered and handler writes expected artifacts to a temp output root while resolving repo root behavior.
     - Fail: command missing, handler requires options, or handler cannot run under mock context.
  2. [ ] No user-facing option behavior exists.
     - Verify: `rg -n "process\.argv|args\.includes|startsWith\('--'" pi/extensions/skill-review.ts pi/lib/skill-review.ts`
     - Pass: no matches, except script files or test descriptions that assert rejection if option-style args are supplied.
     - Fail: slash command exposes option parsing behavior.
  3. [ ] Smoke runner exercises the command handler and validator runner validates a run directory.
     - Verify: `pi/scripts/skill-review-smoke && pi/scripts/skill-review-validate-run .tmp/skill-review/{timestamp}` using the run path printed by the smoke runner.
     - Pass: smoke prints a run path; validator exits 0 for a complete deterministic run.
     - Fail: smoke cannot call the command handler or validator accepts an incomplete run.
  4. [ ] Model runner has a safe dry-run mode and exact output contract.
     - Verify: `pi/scripts/skill-review-run-models --dry-run .tmp/skill-review/{timestamp}` using a fixture or smoke run directory.
     - Pass: dry run prints the exact planned GPT/Fable agent invocations and output paths without calling paid models.
     - Fail: runner requires arbitrary model flags, omits output paths, or cannot read `subagent-tasks.json`.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- qa-engineer
- Blocked by: T4
- Checks:
  1. Run T4 acceptance criteria.
  2. `cd pi && pnpm test skill-review.test.ts` -- command/smoke tests pass.
  3. `cd pi && pnpm run typecheck` -- typecheck passes.
  4. Confirm command writes only to injected temp output in tests and repo-root `.tmp/skill-review/{timestamp}/` in smoke execution.
- On failure: fix command wrapper or scripts and rerun V3.

### Wave 4

**T5: Expand automated tests for command, artifacts, read-only behavior, and model packet rules** [medium] -- qa-engineer
- Blocked by: V3
- Description: Expand Vitest coverage for the completed system. Tests must cover deterministic helpers, fixture outputs, command registration, command handler execution, smoke path, read-only source root behavior, no user-facing options, output artifact set, high-risk ranking, trigger eval generation, packet safety, budget gates, and model comparison schemas.
- Files: `pi/tests/skill-review.test.ts`, `pi/tests/fixtures/skill-review/**`.
- Required test coverage:
  - Inventory extracts expected metadata from clean and malformed fixtures.
  - Deterministic findings include rule ids, severity, evidence, recommendation, and finding class.
  - Findings and inventory are stable sorted.
  - Read-only source roots are unchanged after a run, using before/after manifests or hashes.
  - Output writes only to the configured temp output directory in tests.
  - Repo-root resolution works when `ctx.cwd` is a subdirectory.
  - Symlink/path escape tests fail closed for output directory realpath containment.
  - Run-directory collision behavior is explicit and tested.
  - `/skill-review` registration and handler behavior are covered by mock Pi.
  - Non-empty args are rejected or reported as unsupported, with no option behavior.
  - Trigger evals include positive explicit, positive implicit, and negative-control prompts for high-risk skills.
  - Model packet contains GPT and Fable instructions and Fable skip/medium/high policy with no above-high option.
  - Malformed model comparison output is represented as invalid in schema tests rather than crashing comparison logic.
  - Packet safety validator fails before subagent tasks on secret-like patterns and oversized packets.
- Acceptance Criteria:
  1. [ ] Focused test suite passes.
     - Verify: `cd pi && pnpm test skill-review.test.ts`
     - Pass: exits 0 with all skill-review tests passing.
     - Fail: any skill-review test fails, snapshots drift unexpectedly, or source-root hashes change.
  2. [ ] Related skill infrastructure tests still pass.
     - Verify: `cd pi && pnpm test skill-discovery.test.ts skill-loader.test.ts skill-stats.test.ts review-artifact.test.ts skill-review.test.ts`
     - Pass: exits 0.
     - Fail: regression in existing skill discovery, loader, stats, or artifact behavior.

### Wave 4 -- Validation Gate

**V4: Validate wave 4** [medium] -- qa-engineer
- Blocked by: T5
- Checks:
  1. Run T5 acceptance criteria.
  2. `cd pi && pnpm run typecheck` -- typecheck passes.
  3. Confirm no source skill files changed unless tests intentionally add fixture files under `pi/tests/fixtures/skill-review/**`.
- On failure: fix tests or implementation and rerun V4.

### Wave 5

**T6: Run full-corpus dogfood and GPT/Fable high-risk comparison** [medium] -- planner
- Blocked by: V4
- Description: Run the completed system against the current default skill corpus and execute the high-risk model-comparison workflow. This validates the full requested system, not just the implementation units.
- Files: generated `.tmp/skill-review/{timestamp}/**` and sanitized `.specs/skill-review-system/evidence/{timestamp}.json` only.
- Required procedure:
  1. Run `pi --mode json --no-session -p '/skill-review'` from repo root. If prompt-mode slash execution is unsupported, record that result and run `pi/scripts/skill-review-smoke`; the smoke runner must exercise the same command handler.
  2. Parse the generated run directory from the Pi transcript or smoke runner output. Do not use a generic `latest` directory when validating archive readiness.
  3. Confirm the artifact set exists: `summary.md`, `inventory.json`, `findings.json`, `high-risk-skills.json`, `trigger-evals.json`, `model-packet.md`, `subagent-tasks.json`, `comparison-template.json`, `decision-ledger.json`, `run-manifest.json`.
  4. Run `pi/scripts/skill-review-validate-run <run-dir>` before any model subagent task. This must validate schemas, packet safety, budget caps, source manifests, run status, and absence of secret-like content in packets.
  5. Run `pi/scripts/skill-review-run-models <run-dir>` to execute the GPT-5.5 xhigh task with agent `skill-review-gpt`, Fable medium tasks with `skill-review-fable-medium`, and Fable high tasks with `skill-review-fable-high`. The runner must skip low-complexity Fable items, write `gpt-review.json`, `fable-review.json`, `comparison.md`, and updated `decision-ledger.json` in the same run directory.
  6. Run `pi/scripts/skill-review-validate-run <run-dir>` again to parse and validate `gpt-review.json`, `fable-review.json`, `comparison.md`, and `decision-ledger.json` against generated schemas.
  7. Confirm `decision-ledger.json` records agreement, disagreement, deterministic false positives, invalid outputs, skipped low-complexity Fable items, budget-capped items, and follow-up recommendations.
  8. Write `.specs/skill-review-system/evidence/{timestamp}.json` with sanitized counts, artifact filenames, SHA-256 hashes, model ids, dry-run evidence references, validation commands, statuses, and archive readiness. Do not copy full model packets or source skill bodies into this manifest.
  9. If exact Fable-5 targeting is unavailable, stop and document the blocked targeting issue in the plan execution status. Do not substitute a different model and do not archive.
- Acceptance Criteria:
  1. [ ] Full-corpus deterministic artifacts exist and account for every independently discovered skill.
     - Verify: `pi/scripts/skill-review-validate-run <run-dir>`
     - Pass: validator compares `inventory.json` against an independent default discovery pass and fails on missing, extra, or duplicate skill paths/names.
     - Fail: missing artifacts, mismatch between independent discovery and inventory, or summary count drift.
  2. [ ] Generated trigger evals include negative controls.
     - Verify: `rg -n '"expectedTrigger": false|"expected_trigger": false' <run-dir>/trigger-evals.json`
     - Pass: at least one negative-control eval exists for each high-risk skill that has an overlap/broad-trigger finding.
     - Fail: trigger evals contain only positive examples.
  3. [ ] Packet safety and budget gates pass before subagents run.
     - Verify: `pi/scripts/skill-review-validate-run <run-dir>` before model execution.
     - Pass: validator reports packet safety passed, budget within caps, and no secret-like or disallowed absolute-path content in model packets.
     - Fail: unsafe packet, over-budget packet, or missing validation state.
  4. [ ] GPT and Fable comparison artifacts exist and follow the comparison template.
     - Verify: `pi/scripts/skill-review-validate-run <run-dir>` after model execution.
     - Pass: validator parses and validates `gpt-review.json`, `fable-review.json`, `comparison.md`, and `decision-ledger.json`; comparison lists agreement/disagreement plus next recommended content-remediation actions.
     - Fail: either model output missing, malformed, invalid, or comparison does not distinguish agreement from disagreement.
  5. [ ] Fable effort policy was respected.
     - Verify: `rg -n "xhigh|max|above high|ultra" <run-dir>/fable-review.json <run-dir>/comparison.md <run-dir>/decision-ledger.json`
     - Pass: no matches; execution notes identify skipped low-complexity items and medium/high reviewed items.
     - Fail: any above-high wording appears or low-complexity items were sent to Fable without justification.
  6. [ ] Durable sanitized evidence exists outside ignored scratch output.
     - Verify: `test -f .specs/skill-review-system/evidence/{timestamp}.json && rg -n '"archive_status": "ready"|"archive_status":"ready"' .specs/skill-review-system/evidence/{timestamp}.json`
     - Pass: evidence manifest exists, contains hashes/counts/statuses/model ids, and does not contain full packet text or skill bodies.
     - Fail: only `.tmp` artifacts exist or the evidence manifest contains sensitive/full packet content.

### Wave 5 -- Validation Gate

**V5: Validate wave 5** [medium] -- qa-engineer
- Blocked by: T6
- Checks:
  1. Run T6 acceptance criteria.
  2. `git status --short` -- source changes are limited to planned implementation/test/agent/script files and evidence manifest; `.tmp/skill-review/**` may be untracked and remains generated evidence.
  3. Run source before/after manifest validation for `pi/skills/**/SKILL.md`, user skill roots, session log directory, and Pi settings paths touched by the run.
  4. Confirm generated packets and evidence manifest contain no secrets, API keys, `.env` values, private keys, or credential material before and after model comparison.
  5. Confirm model comparison output is advisory only and no source skills were edited.
- On failure: fix implementation or rerun the dogfood workflow; do not archive until V5 passes.

## Dependency Graph

```text
Wave 0: T0 -> V0
Wave 1: T1, T2 (parallel after V0) -> V1
Wave 2: T3 -> V2
Wave 3: T4 -> V3
Wave 4: T5 -> V4
Wave 5: T6 -> V5
Final: V5 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

1. [ ] Exact GPT/Fable reviewer agents can be invoked through Pi subagents before implementation proceeds.
   - Verify: T0 subagent dry-run payloads for `skill-review-gpt`, `skill-review-fable-medium`, and `skill-review-fable-high`.
   - Pass: outputs contain `MODEL-CHECK-GPT`, `MODEL-CHECK-FABLE-MEDIUM`, and `MODEL-CHECK-FABLE-HIGH`, and details show the expected model ids and thinking levels.

2. [ ] `/skill-review` exists as a Pi extension command with no user-facing options.
   - Verify: `cd pi && pnpm test skill-review.test.ts`
   - Pass: command registration and handler tests pass, including unsupported-args behavior.

3. [ ] The command produces the full artifact set under repo-root `.tmp/skill-review/{timestamp}/` and nowhere else.
   - Verify: `pi/scripts/skill-review-smoke` followed by `pi/scripts/skill-review-validate-run <run-dir>`.
   - Pass: run directory contains `summary.md`, `inventory.json`, `findings.json`, `high-risk-skills.json`, `trigger-evals.json`, `model-packet.md`, `subagent-tasks.json`, `comparison-template.json`, `decision-ledger.json`, and `run-manifest.json`.

4. [ ] Deterministic checks cover structure, trigger quality, progressive disclosure, usage correlation, high-risk ranking, packet safety, source read-only boundaries, budget caps, and model-output schema validation.
   - Verify: `cd pi && pnpm test skill-review.test.ts`
   - Pass: tests exercise each rule family, source-root manifest checks, invalid-output fixtures, safety failures, and budget failures.

5. [ ] GPT/Fable comparison path is usable and bounded.
   - Verify: inspect and validate `<run-dir>/subagent-tasks.json`, `comparison-template.json`, `gpt-review.json`, `fable-review.json`, `comparison.md`, and `decision-ledger.json` through `pi/scripts/skill-review-validate-run <run-dir>` after T6.
   - Pass: both model outputs are normalized, parsed, compared, and recorded; Fable reviewed only medium/high policy items and never above high effort.

6. [ ] Existing Pi skill infrastructure does not regress.
   - Verify: `cd pi && pnpm test skill-discovery.test.ts skill-loader.test.ts skill-stats.test.ts review-artifact.test.ts skill-review.test.ts && cd pi && pnpm run typecheck`
   - Pass: all commands exit 0.

7. [ ] Full Pi extension validation passes.
   - Verify: `make check-pi-extensions`
   - Pass: pnpm install, typecheck, and Vitest suite exit 0.

8. [ ] Archive evidence survives scratch cleanup.
   - Verify: `test -f .specs/skill-review-system/evidence/{timestamp}.json`
   - Pass: sanitized manifest records run path, artifact hashes, counts, model ids, validation commands, statuses, and `archive_status: ready` without full packet text or skill bodies.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes.
- `/do-it` must be able to run all agent-runnable validation steps through documented commands, Pi slash command invocation, smoke scripts, validation scripts, or Pi subagent tool calls.
- Credentials: source/test validation needs none. Model comparison uses existing local Pi model configuration. If Fable-5 access is missing, execution is blocked at V0 and the plan must not be archived.
- Manual-only steps: none.

### Required automated validation

1. [ ] Run exact model and effort targeting preflight.
   - Command/tool: T0 subagent dry-run payloads for `skill-review-gpt`, `skill-review-fable-medium`, and `skill-review-fable-high`.
   - Pass: all exact model/effort dry runs succeed and evidence is recorded in `.specs/skill-review-system/evidence/model-targeting.json`.
   - Fail: do not proceed to T1/T2.

2. [ ] Run focused skill-review tests.
   - Command: `cd pi && pnpm test skill-review.test.ts`
   - Pass: exits 0 with all new tests passing.
   - Fail: do not archive; fix implementation/tests and rerun.

3. [ ] Run related skill infrastructure tests.
   - Command: `cd pi && pnpm test skill-discovery.test.ts skill-loader.test.ts skill-stats.test.ts review-artifact.test.ts skill-review.test.ts`
   - Pass: exits 0.
   - Fail: do not archive; fix regression and rerun.

4. [ ] Run Pi typecheck.
   - Command: `cd pi && pnpm run typecheck`
   - Pass: exits 0 with no errors.
   - Fail: do not archive; fix types and rerun.

5. [ ] Run full Pi extension validation.
   - Command: `make check-pi-extensions`
   - Pass: exits 0.
   - Fail: do not archive; capture failing command and fix.

6. [ ] Run user-facing dogfood or exact command-handler smoke fallback.
   - Command: `pi --mode json --no-session -p '/skill-review'` from repo root; if prompt-mode slash execution is unsupported, `pi/scripts/skill-review-smoke` must exercise the same command handler and record why prompt-mode was unsupported.
   - Pass: latest parsed run directory contains all required deterministic artifacts and full-corpus counts are consistent.
   - Fail: do not archive; fix command/artifact generation and rerun.

7. [ ] Run pre-subagent safety validation.
   - Command: `pi/scripts/skill-review-validate-run <run-dir>` before GPT/Fable subagents.
   - Pass: schemas, packet safety, source manifests, budget caps, and run status pass.
   - Fail: do not call model subagents; fix generator or packet safety and rerun.

8. [ ] Run model-comparison validation.
   - Command: `pi/scripts/skill-review-run-models <run-dir>` followed by `pi/scripts/skill-review-validate-run <run-dir>`.
   - Pass: `gpt-review.json`, `fable-review.json`, `comparison.md`, and updated `decision-ledger.json` parse and validate; Fable effort policy and budget caps are respected.
   - Fail: do not archive; invalid output must be recorded as invalid/not-comparable and fixed or rerun.

9. [ ] Write durable sanitized evidence manifest.
   - Command: `pi/scripts/skill-review-validate-run <run-dir> --write-evidence-manifest`.
   - Pass: `.specs/skill-review-system/evidence/{timestamp}.json` exists and records hashes/counts/statuses/model ids without secrets or full packet text.
   - Fail: do not archive; scratch `.tmp` artifacts alone are insufficient evidence.

### Manual validation

Manual validation is exceptional. It should be required only for destructive operations, data-loss risk, irreversible external side effects, shared/work production impact, paid/billing/data-costing resources without prior approval, secret exposure risk, hardware/physical checks, or genuinely subjective user judgment that cannot be replaced by safe automation.

- Required: no
- Justification: Automated tests, exact-model dry runs, smoke execution, slash-command dogfood attempt, generated artifacts, validation scripts, and model-comparison evidence are sufficient. The only paid-resource element was explicitly requested and is bounded by the generated Fable effort policy and deterministic budget gate.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None. This is local Pi extension and test work only.

If deployment is skipped, no archive block applies because deployment is not part of this plan.

### Archive rule

`/do-it` may archive this plan only after:

1. T0 exact-model and effort dry runs pass and `.specs/skill-review-system/evidence/model-targeting.json` exists.
2. All task acceptance criteria pass.
3. `cd pi && pnpm test skill-review.test.ts` passes.
4. `cd pi && pnpm test skill-discovery.test.ts skill-loader.test.ts skill-stats.test.ts review-artifact.test.ts skill-review.test.ts` passes.
5. `cd pi && pnpm run typecheck` passes.
6. `make check-pi-extensions` passes.
7. `/skill-review` prompt-mode dogfood or command-handler smoke fallback has run against the full default corpus and generated the required `.tmp/skill-review/{timestamp}/` artifact set.
8. `pi/scripts/skill-review-validate-run <run-dir>` passes before model subagents and again after model subagents.
9. GPT/Fable high-risk comparison artifacts exist, parse, validate, and respect the Fable effort policy.
10. No source skills, session logs, Pi settings, or user skill files were edited by the review command or dogfood run.
11. `.specs/skill-review-system/evidence/{timestamp}.json` exists with sanitized hashes/counts/statuses/model ids and `archive_status: ready`.

Do not archive if Fable-5 was skipped because targeting was unavailable. That is a blocker for the requested full system, not an optional follow-up.

## Telemetry & Evidence Contract

The implementation does not need to add runtime telemetry beyond generated artifacts. `/do-it` must record evidence in the plan execution notes or archive summary using these machine-readable fields for each task and gate:

```json
{
  "episode_id": "skill-review-system",
  "phase_id": "wave-0|wave-1|wave-2|wave-3|wave-4|wave-5|final",
  "task_id": "T0|V0|T1|T2|V1|T3|V2|T4|V3|T5|V4|T6|V5|F1|F2|F3|F4|F5",
  "validation_command": "command, slash command, smoke script, validation script, or subagent tool action used",
  "status": "pending|running|passed|failed|blocked|not-required",
  "archive_status": "not-ready|ready|archived",
  "started_at": "ISO-8601 timestamp",
  "completed_at": "ISO-8601 timestamp or null",
  "evidence": ["non-secret terminal signal or artifact path"]
}
```

Generated `.tmp/skill-review/{timestamp}/decision-ledger.json` must use stable records for review decisions:

```json
{
  "skill": "skill-name",
  "decision": "keep|tighten|rewrite|split|scope-local|delete|needs-human-review",
  "deterministic_findings": ["rule-id"],
  "gpt_verdict": "pass|concern|invalid|not-run",
  "fable_verdict": "pass|concern|invalid|skipped|not-run",
  "agreement": "agree|disagree|not-comparable",
  "recommended_next_action": "short actionable recommendation",
  "evidence_paths": ["relative path under .tmp/skill-review/{timestamp}/"]
}
```

Sanitized `.specs/skill-review-system/evidence/{timestamp}.json` must use stable records that contain no full packet text, source skill bodies, secrets, or credential values:

```json
{
  "episode_id": "skill-review-system",
  "run_dir": ".tmp/skill-review/{timestamp}",
  "artifact_hashes": { "summary.md": "sha256:..." },
  "skill_count": 57,
  "finding_count": 0,
  "high_risk_count": 0,
  "model_ids": ["openai-codex/gpt-5.5:xhigh", "amazon-bedrock/us.anthropic.claude-fable-5:medium", "amazon-bedrock/us.anthropic.claude-fable-5:high"],
  "validation_commands": ["cd pi && pnpm test skill-review.test.ts"],
  "status": "passed",
  "archive_status": "ready"
}
```

Plan review data contract for future adaptive embedded review:

```json
{
  "plan_profile": {
    "slug": "skill-review-system",
    "complexity_score": 8,
    "risk_score": 6,
    "primary_domains": ["pi-extension", "typescript", "skills", "testing", "workflow", "subagent-model-targeting"],
    "mutation_scope": ["pi/agents/skill-review-gpt.md", "pi/agents/skill-review-fable-medium.md", "pi/agents/skill-review-fable-high.md", "pi/lib/skill-review.ts", "pi/extensions/skill-review.ts", "pi/scripts/skill-review-smoke", "pi/scripts/skill-review-validate-run", "pi/scripts/skill-review-run-models", "pi/tests/skill-review.test.ts", "pi/tests/fixtures/skill-review/**", ".tmp/skill-review/**", ".specs/skill-review-system/evidence/**"]
  },
  "review_panel_decision": {
    "expected_reviewer_count": 6,
    "selected_reviewer_personas": [
      "completeness and explicitness reviewer",
      "security and source-mutation boundary reviewer",
      "simplicity and no-gold-plating reviewer",
      "Pi extension TypeScript reviewer",
      "deterministic eval and fixture reviewer",
      "automation and CI execution reviewer"
    ],
    "selection_reasons": [
      "The plan touches Pi extension command behavior and exported TypeScript helpers.",
      "The command must be read-only over source skills and write only to approved output roots.",
      "The user explicitly rejected user-facing options and partial delivery.",
      "The system includes model-comparison artifacts with paid Fable cost controls.",
      "The test suite must prove deterministic behavior, exact model targeting, and no source mutation."
    ],
    "expected_high_risk_areas": [
      "Accidentally building a partial lint-only system",
      "Gold-plating command options",
      "Writing outside repo-root .tmp/skill-review",
      "Mutating source skills during review",
      "Skipping the Fable comparison because targeting is inconvenient",
      "Letting model output become authoritative instead of advisory",
      "Sending unsafe packet contents to subagents before validation"
    ]
  }
}
```

## Handoff Notes

- Use the existing Pi TypeScript validation policy: `cd pi && pnpm run typecheck` and `cd pi && pnpm test`; do not use Bun or npm for Pi tests.
- The slash command must stay no-argument for the user. Test helper injection is allowed and should be kept out of the command UX.
- Use dedicated exact-model agents for GPT/Fable comparison. Do not rely on `modelSize` to cross providers.
- Use `pi/scripts/skill-review-run-models <run-dir>` for model execution; `/do-it` should not hand-assemble ad hoc subagent payloads from memory.
- Keep the extension's provider behavior deterministic: it generates packets and tasks; it does not call providers directly.
- The dogfood run must validate the full corpus deterministically. Fable is only for high-risk/disagreement judgment according to the generated policy.
- If exact Fable-5 subagent routing is not available in T0, that is a blocker. Do not archive by calling the deterministic pieces good enough.
- Generated `.tmp/skill-review/**` artifacts are scratch evidence, not source deliverables. Do not commit them unless the user explicitly asks for a tracked sample.
- Commit only sanitized evidence manifests under `.specs/skill-review-system/evidence/**` if they contain no full packet text, source skill bodies, secrets, or credential material.
- Do not edit, rewrite, delete, move, or scope any existing `SKILL.md` as part of this plan. The completed system may recommend those actions for a later content-remediation pass.

## Execution Status

- Status: not started
- Last validated task: none
- Last validation command: none
- Current blocker: none
- Latest evidence: --
