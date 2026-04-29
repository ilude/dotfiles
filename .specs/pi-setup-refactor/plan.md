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
- Prompt-router classifier invocation must continue to use the same absolute path shape as runtime: `uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/classify.py --classifier t2 ...` to avoid ambient Python dependency failures.
- Prompt-router dependency policy is decided up front: `pi/prompt-routing/pyproject.toml` plus tracked `pi/prompt-routing/uv.lock` are the authoritative dependency inputs for local execution. `requirements.txt` must either be removed or clearly documented as generated/export-only, not a second source of truth.
- Generated/local state must not be removed blindly; if tracking policy changes, document migration/cleanup separately and preserve user data unless explicitly approved. `.gitignore` changes alone are not enough for already tracked files; use `git ls-files` audits before proposing any `git rm --cached` migration.
- Current working tree may contain generated expertise snapshot changes; executors should check `git status` and avoid mixing unrelated state churn into implementation commits.
- Baseline validation must run before refactoring so later failures are attributable to the change wave.

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
| T0 | Baseline current Pi health | — | validation | small | validation-lead | — |
| T1 | Extract prompt-router classifier/config logic | 3-4 | feature | medium | typescript-pro | T0 |
| V1 | Validate wave 1 | — | validation | medium | validation-lead | T1 |
| T2 | Extract workflow-command pure logic | 3-5 | feature | medium | typescript-pro | V1 |
| V2 | Validate wave 2 | — | validation | medium | validation-lead | T2 |
| T3 | Normalize prompt-router uv project and artifact policy | 3-5 | feature | medium | python-pro | V2 |
| V3 | Validate wave 3 | — | validation | medium | validation-lead | T3 |
| T4 | Separate generated/local Pi runtime state from curated config | 3-5 | feature | medium | engineering-lead | V3 |
| V4 | Validate wave 4 | — | validation | medium | validation-lead | T4 |

## Execution Waves

### Wave 0

**T0: Baseline current Pi health** [small] — validation-lead
- Description: Establish the pre-refactor health baseline and document any pre-existing failures before code is moved. Do not start extraction until this gate is recorded in the plan notes or implementation log.
- Files: none
- Acceptance Criteria:
  1. [ ] Current focused Pi tests pass, or failures are explicitly recorded as pre-existing with exact output.
     - Verify: `cd pi/tests && bun vitest run prompt-router.test.ts workflow-commands.test.ts commit-guard.test.ts probe-thinking-level.test.ts`
     - Pass: all listed tests pass.
     - Fail: stop and either fix the baseline or document the exact pre-existing failure before proceeding.
  2. [ ] Current TypeScript validation status is known.
     - Verify: `python pi/extensions/tsc-check.py`
     - Pass: exits 0, or known pre-existing diagnostics are recorded and not attributed to this refactor.
     - Fail: do not proceed until diagnostics are classified; new extraction tasks must not add diagnostics.
  3. [ ] Working tree state is clean enough to isolate refactor changes.
     - Verify: `git status --short --branch`
     - Pass: only intentional plan/refactor files are modified, or unrelated generated files are explicitly excluded from implementation commits.
     - Fail: pause and ask for cleanup/commit direction.

### Wave 0 — Validation Gate

**T0 is the validation gate for baseline health.**
- Blocked by: —
- Checks: all T0 acceptance criteria.
- On failure: create a fix/baseline-classification task before Wave 1.

### Wave 1

**T1: Extract prompt-router classifier/config logic** [medium] — typescript-pro
- Blocked by: T0
- Description: Refactor only classifier invocation and config/path resolution out of `pi/extensions/prompt-router.ts` into `pi/lib/prompt-router/*`. Do not move routing rules, effort bias, or state helpers in this slice unless classifier/config extraction is already validated and still leaves a small, obvious follow-up. Preserve the current absolute `uv run --project ~/.dotfiles/pi/prompt-routing` classifier command and GPT-5.5 low-thinking startup behavior.
- Files: `pi/extensions/prompt-router.ts`, new `pi/lib/prompt-router/config.ts`, `pi/lib/prompt-router/classifier.ts`, `pi/tests/prompt-router.test.ts`
- Acceptance Criteria:
  1. [ ] Classifier/config implementation is no longer embedded in the extension entrypoint.
     - Verify: `grep -n "PROMPT_ROUTING_DIR\|CLASSIFY_SCRIPT\|classifyWithV3" pi/extensions/prompt-router.ts pi/lib/prompt-router/*.ts`
     - Pass: path constants and classifier execution live under `pi/lib/prompt-router/*`; `prompt-router.ts` imports and calls them.
     - Fail: classifier/path code still lives in the entrypoint; extract only that domain before broadening scope.
  2. [ ] Runtime classifier command shape is preserved exactly.
     - Verify: `cd pi/tests && bun vitest run prompt-router.test.ts`
     - Pass: tests assert the absolute `~/.dotfiles/pi/prompt-routing` `uv run --project` command shape and all prompt-router tests pass.
     - Fail: restore the absolute runtime command shape or update implementation/tests only with an explicit documented runtime path decision.
  3. [ ] New TypeScript library files are type-checked.
     - Verify: `cd pi/extensions && bun x tsc --noEmit --ignoreConfig --target ES2022 --module ES2022 --moduleResolution bundler --strict --skipLibCheck --esModuleInterop --allowImportingTsExtensions prompt-router.ts --pretty false`
     - Pass: exits 0.
     - Fail: fix imports/types; do not rely on Vitest alone.
  4. [ ] GPT-5.5 low-thinking startup regression remains covered.
     - Verify: `cd pi/tests && bun vitest run prompt-router.test.ts probe-thinking-level.test.ts`
     - Pass: tests covering non-mutating probe and session-start low reset pass.
     - Fail: restore behavior before continuing.

### Wave 1 — Validation Gate

**V1: Validate wave 1** [medium] — validation-lead
- Blocked by: T1
- Checks:
  1. Run all T1 acceptance criteria.
  2. `find pi/extensions -maxdepth 1 -type f -name '*.ts' -print | sort` — no new top-level helper entrypoints were added under `pi/extensions/*.ts`.
  3. Compare T0 TypeScript validation output to current output; no new diagnostics are allowed.
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T2: Extract workflow-command pure logic** [medium] — typescript-pro
- Blocked by: V1
- Description: Refactor `pi/extensions/workflow-commands.ts` so slash-command registration remains in the extension entrypoint while one cohesive pure helper domain moves into `pi/lib/workflow-commands/*`. Prefer prompt/template construction first; move git orchestration or commit review only if already covered by tests. Preserve existing command behavior and confirmation boundaries.
- Files: `pi/extensions/workflow-commands.ts`, new `pi/lib/workflow-commands/*.ts`, `pi/tests/workflow-commands.test.ts`, `pi/tests/commit-guard.test.ts`, any existing workflow prompt/pure tests if present.
- Acceptance Criteria:
  1. [ ] Exactly one cohesive helper domain is extracted with no unrelated behavior changes.
     - Verify: `find pi/lib/workflow-commands -maxdepth 1 -type f -print && grep -n "registerCommand" pi/extensions/workflow-commands.ts`
     - Pass: helper module(s) exist under `pi/lib/workflow-commands/`; `workflow-commands.ts` still owns command registration and delegates the extracted domain.
     - Fail: if multiple domains moved at once or command registration semantics changed, narrow the extraction.
  2. [ ] Workflow command regression tests still pass.
     - Verify: `cd pi/tests && bun vitest run workflow-commands.test.ts commit-guard.test.ts workflow-commands-pure.test.ts workflow-prompts.test.ts`
     - Pass: all existing named tests that exist pass; if a listed file does not exist, record that and run the available workflow/commit tests without weakening assertions.
     - Fail: restore expected command behavior or add focused tests for intentional module-boundary changes.
  3. [ ] Extracted workflow library files are type-checked through the extension entrypoint.
     - Verify: `cd pi/extensions && bun x tsc --noEmit --ignoreConfig --target ES2022 --module ES2022 --moduleResolution bundler --strict --skipLibCheck --esModuleInterop --allowImportingTsExtensions workflow-commands.ts --pretty false`
     - Pass: exits 0.
     - Fail: fix imports/types before continuing.

### Wave 2 — Validation Gate

**V2: Validate wave 2** [medium] — validation-lead
- Blocked by: T2
- Checks:
  1. Run all T2 acceptance criteria.
  2. `find pi/extensions -maxdepth 1 -type f -name '*.ts' -print | sort` — no new top-level helper entrypoints were added under `pi/extensions/*.ts`.
  3. Compare T0 TypeScript validation output to current output; no new diagnostics are allowed.
- On failure: create a fix task, re-validate after fix.

### Wave 3

**T3: Normalize prompt-router uv project and artifact policy** [medium] — python-pro
- Blocked by: V2
- Description: Make `pi/prompt-routing` an explicit, documented uv project using `pyproject.toml` plus tracked `uv.lock` as the authoritative dependency inputs. Align or remove `requirements.txt` so it is not a competing source of truth. Update README/AGENTS instructions and `.gitignore` rules so dependencies, logs, cache, venv, and model artifacts have clear ownership. Do not delete tracked model files unless a separate migration decision is documented and approved.
- Files: `pi/prompt-routing/pyproject.toml`, `pi/prompt-routing/requirements.txt`, `pi/prompt-routing/AGENTS.md`, `pi/README.md`, `.gitignore` and/or `pi/.gitignore`
- Acceptance Criteria:
  1. [ ] Prompt-router dependency source of truth is clear and docs use uv commands consistently.
     - Verify: `grep -R "python .*classify.py\|uv run" -n pi/README.md pi/prompt-routing/AGENTS.md pi/prompt-routing/*.py | sed -n '1,120p'`
     - Pass: user-facing docs invoke classifier/training through `uv run` or explain any exception; `requirements.txt` is removed or documented as generated/export-only.
     - Fail: mixed bare `python` instructions or competing dependency sources remain without rationale.
  2. [ ] uv project metadata and lockfile are reproducible.
     - Verify: `uv sync --project pi/prompt-routing --locked`
     - Pass: exits 0 using the tracked `pi/prompt-routing/uv.lock`.
     - Fail: update `pyproject.toml`/`uv.lock` together or document why lock mode is impossible.
  3. [ ] Runtime classifier command works with the absolute path shape used by Pi.
     - Verify: `uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/classify.py --classifier t2 "test prompt"`
     - Pass: exits 0 and emits the documented classifier JSON/result format.
     - Fail: fix packaging or runtime command before continuing.
  4. [ ] Generated prompt-router artifacts are categorized as tracked source, generated-but-tracked, or ignored local state.
     - Verify: `git status --ignored --short pi/prompt-routing | sed -n '1,120p' && git ls-files pi/prompt-routing | sed -n '1,160p'`
     - Pass: `.venv`, logs, caches are ignored; tracked model/lock decisions are documented; no unexpected tracked generated files appear.
     - Fail: generated local artifacts appear as untracked candidates or tracked artifacts lack policy.

### Wave 3 — Validation Gate

**V3: Validate wave 3** [medium] — validation-lead
- Blocked by: T3
- Checks:
  1. Run all T3 acceptance criteria.
  2. `make lint-python` — Python lint passes, or any unrelated pre-existing lint failures are documented from T0/baseline.
  3. Cross-check `pi/README.md` and `pi/prompt-routing/AGENTS.md` for one dependency policy: `pyproject.toml` + tracked `uv.lock` authoritative.
- On failure: create a fix task, re-validate after fix.

### Wave 4

**T4: Separate generated/local Pi runtime state from curated config** [medium] — engineering-lead
- Blocked by: V3
- Description: Define a conservative source-vs-runtime policy for Pi state, then make only the minimal ignore/doc changes that follow from that policy. Document which directories are curated config (`pi/agents`, `pi/skills`, `pi/extensions`, `pi/lib`, `pi/tests`, `pi/settings.json`) and which are runtime/generated (`pi/history`, `pi/sessions`, local expertise snapshots, logs/cache). Avoid deleting user history or expertise.
- Files: `pi/README.md`, `pi/AGENTS.md`, `.gitignore` and/or `pi/.gitignore`, possibly `pi/multi-team/README.md` if added only when necessary
- Acceptance Criteria:
  1. [ ] Pi source-vs-runtime state policy is documented in one primary location and linked from any secondary location.
     - Verify: `grep -R "runtime state\|generated\|history\|sessions\|expertise" -n pi/README.md pi/AGENTS.md pi/multi-team/README.md 2>/dev/null | sed -n '1,120p'`
     - Pass: docs clearly tell future agents what to commit and what to leave local.
     - Fail: policy is implicit or scattered; consolidate in one primary doc and link from others.
  2. [ ] Ignore rules prevent accidental runtime artifact commits without hiding curated source.
     - Verify: `git status --ignored --short pi/history pi/sessions pi/multi-team pi/prompt-routing pi/extensions/web-fetch | sed -n '1,160p' && git ls-files pi/history pi/sessions pi/multi-team pi/prompt-routing pi/extensions/web-fetch | sed -n '1,200p'`
     - Pass: local caches/logs/node_modules are ignored; curated files remain trackable; already tracked runtime/generated files are explicitly listed and classified.
     - Fail: important source files become ignored, runtime artifacts remain unclassified, or tracked generated files are silently left without policy.
  3. [ ] No destructive migration is performed without explicit approval.
     - Verify: `git diff --name-status -- . ':!*.env' | sed -n '1,160p'`
     - Pass: no `D`/`R` entries for history, sessions, expertise, models, or prompt-router data unless user explicitly approved the migration.
     - Fail: revert unintended removals and document the needed migration as a separate decision.

### Wave 4 — Validation Gate

**V4: Validate wave 4** [medium] — validation-lead
- Blocked by: T4
- Checks:
  1. Run all T4 acceptance criteria.
  2. `make check-pi-extensions` — Pi extension type-check and Vitest suite pass, or any unrelated known baseline diagnostics match T0 with no new diagnostics.
  3. `make lint-python` — Python lint passes, or any unrelated pre-existing lint failures match T0.
  4. Cross-task integration: `pi/README.md`, `pi/AGENTS.md`, prompt-router docs, and ignore rules agree on source-vs-runtime and uv usage.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```
Wave 0: T0 baseline validation
Wave 1: T1 → V1
Wave 2: T2 → V2
Wave 3: T3 → V3
Wave 4: T4 → V4
```

## Success Criteria

1. [ ] Pi extension behavior remains intact after refactoring.
   - Verify: `make check-pi-extensions`
   - Pass: `python pi/extensions/tsc-check.py` and the full Pi Vitest suite pass.
2. [ ] Prompt-router Python setup is reproducible and documented.
   - Verify: `uv sync --project pi/prompt-routing --locked && uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/classify.py --classifier t2 "test prompt"`
   - Pass: lockfile sync succeeds and classifier command emits a classifier result or documented classifier output format.
3. [ ] Runtime/generated state boundaries are clear and do not pollute commits.
   - Verify: `git status --short --ignored pi/history pi/sessions pi/multi-team pi/prompt-routing pi/extensions/web-fetch | sed -n '1,160p' && git ls-files pi/history pi/sessions pi/multi-team pi/prompt-routing pi/extensions/web-fetch | sed -n '1,200p'`
   - Pass: only intentional source/config changes are staged or unstaged; generated local artifacts are ignored or documented; already tracked runtime/generated files are explicitly classified.
4. [ ] Refactor is understandable for future maintainers.
   - Verify: `find pi/lib/prompt-router pi/lib/workflow-commands -type f -maxdepth 2 -print && sed -n '1,120p' pi/README.md`
   - Pass: new modules are discoverable and docs describe uv/runtime-state policy.

## Handoff Notes

- This plan is behavior-preserving. Avoid adding new router or workflow-command features while extracting modules.
- Run `git status --short --branch` before starting; current sessions may produce generated expertise snapshot changes that should not be mixed into refactor commits unless intentionally part of T4.
- Top-level `pi/extensions/*.ts` files are auto-discovered by Pi. Do not place pure helper `.ts` files directly in `pi/extensions/`; use `pi/lib/` or a subdirectory.
- Do not delete `pi/history`, `pi/sessions`, expertise logs, trained models, or prompt-router data without explicit user approval. This plan only documents and classifies those artifacts unless a later task requests cleanup.
