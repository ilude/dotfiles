---
created: 2026-04-28
status: draft
completed:
---

# Plan: Pi Setup Refactor

## Context & Motivation

The Pi setup in this dotfiles repo has grown into a powerful but increasingly flat system. A quick scan found large extension entrypoints (`pi/extensions/test-orchestrator.ts` ~1417 lines, `agent-chain.ts` ~936 lines, `workflow-commands.ts` ~889 lines, `prompt-router.ts` ~801 lines), mixed Python packaging/runtime artifacts under `pi/prompt-routing`, and a blurry boundary between source/config and generated runtime state (`pi/history`, `pi/sessions`, `pi/multi-team/expertise`, prompt-router logs/models/cache). The user asked whether refactoring should be considered, then requested a plan covering all three recommendations: split large extensions, normalize prompt-router packaging, and separate generated/local runtime state from curated config.

Recent related work changed `pi/extensions/prompt-router.ts` to call the classifier through `uv run --project ~/.dotfiles/pi/prompt-routing ... --classifier t2`, added `pi/prompt-routing/pyproject.toml`, lowered `pi/settings.json` `defaultThinkingLevel` to `low`, and made `probe-thinking-level.ts` non-mutating on session start. That means this refactor must preserve the current behavior and tests while making the setup easier to maintain.

## Constraints

- Platform: macOS Darwin arm64
- Shell: `/bin/zsh`
- Repository rules: use LF line endings, keep scripts idempotent, do not modify secrets or `.env` files, avoid destructive git operations without explicit confirmation.
- Pi extension convention: top-level `pi/extensions/*.ts` files are auto-discovered as extension entrypoints; pure helper modules should live under `pi/lib/` or subdirectories rather than as top-level extension files.
- Preserve behavior first: this is a refactor/policy cleanup, not a feature rewrite.
- Keep `pi/extensions/*` files as Pi API wiring and move pure logic to `pi/lib/*` where practical.
- Prompt-router classifier invocation must continue to use `uv run --project ~/.dotfiles/pi/prompt-routing` to avoid ambient Python dependency failures.
- Generated/local state must not be removed blindly; if tracking policy changes, document migration/cleanup separately and preserve user data unless explicitly approved.
- Current working tree may contain generated expertise snapshot changes; executors should check `git status` and avoid mixing unrelated state churn into implementation commits.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Split largest extensions into focused `pi/lib/*` modules while leaving entrypoints thin | Highest maintainability gain, easier unit tests, lower behavior risk if done incrementally | Requires careful import path updates and focused regression tests | **Selected** as first implementation wave |
| Normalize `pi/prompt-routing` as an explicit uv project with clear generated artifact boundaries | Avoids ambient Python breakage and makes classifier setup reproducible | May require deciding whether `uv.lock` and model artifacts are tracked | **Selected** after extension extraction baseline is validated |
| Separate generated/local runtime state from curated config via `.gitignore`, docs, and cleanup policy | Reduces accidental commits and clarifies what belongs in source control | Needs policy decisions for expertise/history/model artifacts; unsafe to delete data automatically | **Selected** as a policy/documentation + safe ignore cleanup wave |
| Do a broad architectural rewrite of the whole Pi setup | Could create a cleaner final shape | High risk, many files, hard to review, likely unnecessary | Rejected: violates KISS and behavior-preserving goal |

## Objective

Refactor the Pi setup so large extension entrypoints are thinner, prompt-router Python dependencies/artifacts have an explicit policy, and generated runtime state is clearly separated from curated source/config. The completed work should preserve existing behavior, pass Pi extension tests, and leave maintainers with documented boundaries for future changes.

## Project Context

- **Language**: TypeScript/Python/Shell; markers include root `pyproject.toml`, root `Makefile`, `pi/justfile`, `pi/tests/package.json`, `pi/extensions/tsconfig.json`, and `.gitattributes`.
- **Test command**: `make check-pi-extensions` for Pi extension type-check + Vitest; focused tests may use `cd pi/tests && bun vitest run <test-file>`.
- **Lint command**: `make lint` for repo lint; TypeScript validation for Pi extensions is covered by `python pi/extensions/tsc-check.py`.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Extract prompt-router pure logic | 4-6 | architecture | medium | typescript-pro | — |
| T2 | Extract workflow-command pure logic | 4-6 | architecture | medium | typescript-pro | — |
| V1 | Validate wave 1 | — | validation | medium | validation-lead | T1, T2 |
| T3 | Normalize prompt-router uv project and artifact policy | 3-5 | feature | medium | python-pro | V1 |
| T4 | Separate generated/local Pi runtime state from curated config | 3-5 | feature | medium | engineering-lead | V1 |
| V2 | Validate wave 2 | — | validation | medium | validation-lead | T3, T4 |

## Execution Waves

### Wave 1 (parallel)

**T1: Extract prompt-router pure logic** [medium] — typescript-pro
- Description: Refactor `pi/extensions/prompt-router.ts` so it remains the Pi extension entrypoint, while pure classifier invocation, config/path resolution, routing rules, model effort bias, and state helpers move into `pi/lib/prompt-router/*`. Preserve the current `uv run --project` classifier command and GPT-5.5 low-thinking startup behavior.
- Files: `pi/extensions/prompt-router.ts`, new `pi/lib/prompt-router/config.ts`, `pi/lib/prompt-router/classifier.ts`, `pi/lib/prompt-router/rules.ts`, optional `pi/lib/prompt-router/state.ts`, `pi/tests/prompt-router.test.ts`
- Acceptance Criteria:
  1. [ ] `prompt-router.ts` is primarily hook/command wiring and delegates pure logic to `pi/lib/prompt-router/*`.
     - Verify: `wc -l pi/extensions/prompt-router.ts && find pi/lib/prompt-router -type f -maxdepth 1 -print`
     - Pass: entrypoint line count is meaningfully reduced and new lib files exist.
     - Fail: entrypoint still contains most classifier/rule implementation; split a smaller pure helper first.
  2. [ ] Existing prompt-router behavior is preserved.
     - Verify: `cd pi/tests && bun vitest run prompt-router.test.ts`
     - Pass: all prompt-router tests pass.
     - Fail: inspect changed imports and mocked `pi.exec` expectations, then fix behavior rather than weakening tests.

**T2: Extract workflow-command pure logic** [medium] — typescript-pro
- Description: Refactor `pi/extensions/workflow-commands.ts` so slash-command registration remains in the extension entrypoint while pure helpers for commit review, prompt construction, command metadata, and git command orchestration move into `pi/lib/workflow-commands/*` or a similarly named library module. Preserve existing command behavior and confirmation boundaries.
- Files: `pi/extensions/workflow-commands.ts`, new `pi/lib/workflow-commands/*.ts`, `pi/tests/workflow-commands.test.ts`, possibly `pi/tests/commit-guard.test.ts`
- Acceptance Criteria:
  1. [ ] `workflow-commands.ts` has a thinner extension registration surface and no unrelated behavior changes.
     - Verify: `wc -l pi/extensions/workflow-commands.ts && find pi/lib/workflow-commands -type f -maxdepth 1 -print`
     - Pass: entrypoint line count is meaningfully reduced and helper modules contain pure logic.
     - Fail: if the split is too broad or behavior changes, revert to extracting one helper domain at a time.
  2. [ ] Workflow command tests still pass.
     - Verify: `cd pi/tests && bun vitest run workflow-commands.test.ts commit-guard.test.ts`
     - Pass: tests pass without reducing assertions.
     - Fail: restore expected command behavior or update tests only for intentional module boundary changes.

### Wave 1 — Validation Gate

**V1: Validate wave 1** [medium] — validation-lead
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2.
  2. `python pi/extensions/tsc-check.py` — TypeScript extension check succeeds with no diagnostics.
  3. `cd pi/tests && bun vitest run prompt-router.test.ts workflow-commands.test.ts commit-guard.test.ts` — all focused tests pass.
  4. Cross-task integration: verify no new top-level helper entrypoints were added under `pi/extensions/*.ts`; helpers should be under `pi/lib/` or extension subdirectories.
- On failure: create a fix task, re-validate after fix.

### Wave 2 (parallel)

**T3: Normalize prompt-router uv project and artifact policy** [medium] — python-pro
- Blocked by: V1
- Description: Make `pi/prompt-routing` an explicit, documented uv project. Decide and document whether `uv.lock` should be tracked. Align `requirements.txt`, `pyproject.toml`, README/AGENTS instructions, and `.gitignore` rules so dependencies, logs, cache, venv, and model artifacts have clear ownership. Do not delete tracked model files unless a separate migration decision is documented and approved.
- Files: `pi/prompt-routing/pyproject.toml`, `pi/prompt-routing/requirements.txt`, `pi/prompt-routing/AGENTS.md`, `pi/README.md`, `.gitignore` and/or `pi/.gitignore`
- Acceptance Criteria:
  1. [ ] Prompt-router dependency source of truth is clear and docs use uv commands consistently.
     - Verify: `grep -R "python .*classify.py\|uv run" -n pi/README.md pi/prompt-routing/AGENTS.md pi/prompt-routing/*.py | sed -n '1,120p'`
     - Pass: user-facing docs invoke classifier/training through `uv run` or explain any exception.
     - Fail: mixed bare `python` instructions remain without rationale.
  2. [ ] Generated prompt-router artifacts are categorized as tracked source, generated-but-tracked, or ignored local state.
     - Verify: `git status --ignored --short pi/prompt-routing | sed -n '1,120p'`
     - Pass: `.venv`, logs, caches are ignored; tracked model/lock decisions are documented.
     - Fail: generated local artifacts appear as untracked candidates without documented policy.

**T4: Separate generated/local Pi runtime state from curated config** [medium] — engineering-lead
- Blocked by: V1
- Description: Define and implement a conservative source-vs-runtime policy for Pi state. Document which directories are curated config (`pi/agents`, `pi/skills`, `pi/extensions`, `pi/lib`, `pi/tests`, `pi/settings.json`) and which are runtime/generated (`pi/history`, `pi/sessions`, local expertise snapshots, logs/cache). Update ignore rules only for artifacts that should not be committed, and avoid deleting user history or expertise.
- Files: `pi/README.md`, `pi/AGENTS.md`, `.gitignore` and/or `pi/.gitignore`, possibly `pi/multi-team/README.md` if added only when necessary
- Acceptance Criteria:
  1. [ ] Pi source-vs-runtime state policy is documented.
     - Verify: `grep -R "runtime state\|generated\|history\|sessions\|expertise" -n pi/README.md pi/AGENTS.md pi/multi-team/README.md 2>/dev/null | sed -n '1,120p'`
     - Pass: docs clearly tell future agents what to commit and what to leave local.
     - Fail: policy is implicit or scattered; consolidate in one primary doc and link from others.
  2. [ ] Ignore rules prevent accidental runtime artifact commits without hiding curated source.
     - Verify: `git status --ignored --short pi/history pi/sessions pi/multi-team pi/prompt-routing pi/extensions/web-fetch | sed -n '1,160p'`
     - Pass: local caches/logs/node_modules are ignored; curated files remain trackable.
     - Fail: important source files become ignored or runtime artifacts remain unclassified.

### Wave 2 — Validation Gate

**V2: Validate wave 2** [medium] — validation-lead
- Blocked by: T3, T4
- Checks:
  1. Run acceptance criteria for T3 and T4.
  2. `make check-pi-extensions` — Pi extension type-check and Vitest suite pass.
  3. `make lint-python` — Python lint passes for repo Python files.
  4. Cross-task integration: `pi/README.md`, `pi/AGENTS.md`, prompt-router docs, and ignore rules agree on source-vs-runtime and uv usage.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3, T4 (parallel, blocked by V1) → V2
```

## Success Criteria

1. [ ] Pi extension behavior remains intact after refactoring.
   - Verify: `make check-pi-extensions`
   - Pass: `python pi/extensions/tsc-check.py` and the full Pi Vitest suite pass.
2. [ ] Prompt-router Python setup is reproducible and documented.
   - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier t2 "test prompt"`
   - Pass: command exits successfully and emits a classifier result or documented classifier output format.
3. [ ] Runtime/generated state boundaries are clear and do not pollute commits.
   - Verify: `git status --short --ignored pi/history pi/sessions pi/multi-team pi/prompt-routing pi/extensions/web-fetch | sed -n '1,160p'`
   - Pass: only intentional source/config changes are staged or unstaged; generated local artifacts are ignored or documented.
4. [ ] Refactor is understandable for future maintainers.
   - Verify: `find pi/lib/prompt-router pi/lib/workflow-commands -type f -maxdepth 2 -print && sed -n '1,120p' pi/README.md`
   - Pass: new modules are discoverable and docs describe uv/runtime-state policy.

## Handoff Notes

- This plan is behavior-preserving. Avoid adding new router or workflow-command features while extracting modules.
- Run `git status --short --branch` before starting; current sessions may produce generated expertise snapshot changes that should not be mixed into refactor commits unless intentionally part of T4.
- Top-level `pi/extensions/*.ts` files are auto-discovered by Pi. Do not place pure helper `.ts` files directly in `pi/extensions/`; use `pi/lib/` or a subdirectory.
- Do not delete `pi/history`, `pi/sessions`, expertise logs, trained models, or prompt-router data without explicit user approval. This plan only documents and classifies those artifacts unless a later task requests cleanup.
