---
created: 2026-05-02
status: draft
completed:
---

# Plan: Pi GPT Direct Personality for OpenAI GPT-5+

## Context & Motivation

The user wants Pi to get the practical benefit of Codex's personality controls for OpenAI GPT-5+ models, especially a direct/concise style. Web research found Codex exposes personality as a client-side config/UI feature (`features.personality`, app choices Friendly/Pragmatic/None), not as a documented OpenAI API parameter. OpenAI GPT-5+ APIs expose `text.verbosity`, and GPT-5.5 docs recommend `text.verbosity: "low"` for concise responses. Prompt caching research found OpenAI caching is automatic for eligible prompts, Pi already documents `PI_CACHE_RETENTION=long` for extended retention, and OpenRouter OpenAI-model caching is automatic while Anthropic/Gemini-style routes may need `cache_control` markers.

This plan implements the first three chosen actions from the research: do not model Codex personality as a raw API parameter, add/verify a Pi-side direct personality setting, and map that direct setting to OpenAI GPT-5+ `text.verbosity: "low"` only if Pi exposes a stable, repo-controlled provider option hook.

## Constraints

- Platform: Windows working tree (`C:/Users/mglenn/.dotfiles`) with Git Bash/Pi harness; use forward-slash paths in repo docs.
- Shell: Bash available for repo scans/tests; PowerShell only when Windows-native tasks require it.
- Do not edit secrets or `.env` files.
- Do not edit installed `node_modules` or generated package code. Installed Pi package docs/source may be read for evidence only.
- Do not assume Codex `personality = "direct"` is an OpenAI API field; treat it as client prompt/config behavior unless source code proves otherwise.
- Direct personality must be **per-user opt-in** via `~/.pi/agent/settings.json` (or an existing per-user Pi settings loader) unless T1 proves Pi already has another user-runtime settings surface. Do not make repo-tracked `pi/settings.json` enable direct mode by default.
- Default behavior must remain unchanged when the setting is absent or set to default/disabled.
- Gate verbosity mapping by actual provider/model capability metadata if available; use provider/model-name checks only as a fallback and test no-op behavior for unsupported providers.
- Preserve Pi's existing prompt caching behavior; this plan may document/verify caching but should not implement broad caching changes unless a concrete missing path is found.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Add a per-user Pi `personality: "direct"` setting plus prompt/style injection and GPT-5+ verbosity mapping when supported | Matches research; user-visible directness; uses official OpenAI `text.verbosity` when available; opt-in preserves defaults | Requires finding real settings/prompt/request seams and tests | **Selected**, with T1 decision gate |
| Add prompt-layer direct mode first, defer `text.verbosity` mapping until a stable hook is proven | Smaller and avoids provider breakage | Does not use official GPT-5+ verbosity when Pi can support it | Selected fallback path if T1 finds no repo-controlled verbosity hook |
| Send a raw `personality: "direct"` request field to OpenAI/OpenRouter | Superficially matches Codex config wording | No official OpenAI API support found; likely ignored or rejected | Rejected: violates researched API contract |
| Only set `text.verbosity: "low"` globally for GPT-5+ | Small implementation and uses official API | Too blunt; bypasses user preference; may affect all GPT-5+ users | Rejected: unsafe default behavior |
| Reuse an existing Pi oververbosity/style setting if present | Avoids adding a new abstraction | May not exist or may target final-answer length rather than agent style | Preferred if T1 finds a suitable existing setting |
| Implement broad prompt caching changes now | Could optimize costs for more providers | Research says direct OpenAI/OpenRouter OpenAI caching is already automatic and Pi has `PI_CACHE_RETENTION=long`; broad changes risk regressions | Rejected for this plan; document/verify only |

## Objective

Pi supports a user-configurable direct personality mode. When enabled, Pi injects concise/direct style guidance through its normal prompt/config path. If a stable repo-controlled hook exists for compatible OpenAI/OpenAI-Codex GPT-5+ Responses models, Pi also requests low verbosity. Unsupported providers continue working without unsupported request parameters. Documentation explains direct personality, rollback, and prompt caching status.

## Project Context

- **Language**: TypeScript-heavy Pi extensions/config plus Markdown docs; repo also contains Python/dotfiles.
- **Test command**: `cd pi/tests && bun test`
- **Lint command**: `make lint` for repo-wide lint; for modified Pi TS files also run `bunx tsc -p pi/extensions/tsconfig.json --noEmit` if available.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Locate Pi request/prompt/config surfaces and write implementation note | 0-1 | research | small | typescript-pro | -- |
| D1 | Decide implementation path from T1 | -- | validation/decision | small | qa-engineer | T1 |
| T2A | Add direct personality setting and prompt injection | 2-4 | feature | medium | typescript-pro | D1 |
| T2B | Upstream-limited fallback docs/status path | 1-2 | mechanical | small | technical-writer | D1 |
| V2 | Validate wave 2 selected path | -- | validation | medium | qa-engineer | T2A or T2B |
| T3 | Map direct personality to GPT-5+ low verbosity if hook exists | 2-4 | feature | medium | typescript-pro | V2 |
| V3 | Validate verbosity mapping or documented no-op | -- | validation | medium | qa-engineer | T3 |
| T4 | Document prompt caching, direct mode, and rollback | 1-3 | mechanical | small | technical-writer | V3 |
| V4 | Validate docs and final behavior | -- | validation | small | qa-engineer | T4 |

## Execution Waves

### Wave 1

**T1: Locate Pi request/prompt/config surfaces and write implementation note** [small] -- typescript-pro
- Description: Inspect tracked repo files and installed Pi package docs/source to identify settings loading, system/developer prompt assembly, and OpenAI/OpenRouter request option construction. Produce a short implementation note in `## Execution Status` or a temporary executor note before any code changes. The note must name exact files/functions and classify each as repo-editable or upstream-only.
- Files: read-only scan of `pi/settings.json`, `pi/README.md`, `pi/docs/`, `pi/extensions/`, `pi/lib/`, `pi/tests/`, and installed `@mariozechner/pi-coding-agent` docs/source for evidence only.
- Acceptance Criteria:
  1. [ ] Exact files/functions are identified before implementation.
     - Verify: `grep -R "verbosity\|completeSimple\|systemPrompt\|settings\|readMergedSettings" -n pi C:/Users/mglenn/AppData/Roaming/npm/node_modules/@mariozechner 2>/dev/null | head -100`
     - Pass: Executor records a concise map of files/functions and whether each is repo-editable or upstream-only.
     - Fail: No clear insertion point; choose T2B fallback rather than patching installed package code.
  2. [ ] Settings precedence is identified.
     - Verify: inspect settings loader references and `pi/README.md` settings sections.
     - Pass: Note states whether direct mode belongs in `~/.pi/agent/settings.json`, repo `pi/settings.json`, or an existing merged settings surface, and why.
     - Fail: Settings source remains ambiguous; stop and revise plan.

### Wave 1 -- Validation/Decision Gate

**D1: Decide implementation path from T1** [small] -- qa-engineer
- Blocked by: T1
- Checks:
  1. If T1 finds repo-controlled prompt/settings seams, proceed to T2A.
  2. If T1 finds prompt/settings or verbosity seams are upstream-only, proceed to T2B for docs/status and record an upstream enhancement; do not edit installed `node_modules`.
  3. If T1 finds prompt injection possible but verbosity mapping upstream-only, proceed to T2A and later make T3 a documented no-op/upstream follow-up.
- On failure: create a fix task to repeat T1 with narrower paths.

### Wave 2A (selected only if D1 finds repo-controlled prompt/settings seams)

**T2A: Add direct personality setting and prompt injection** [medium] -- typescript-pro
- Blocked by: D1
- Description: Add a per-user opt-in direct personality setting, preferably compatible with future values (`direct`, `default`, `none`). Reuse an existing Pi style/oververbosity setting if T1 finds one that cleanly fits; otherwise add a new setting under the per-user runtime settings surface. Implement prompt-layer style guidance only when enabled: direct, action-oriented, avoid filler/praise, but preserve safety, verification, and required detail.
- Files: exact paths from T1; likely tracked `pi/lib/*`, `pi/extensions/*`, `pi/tests/*`, and docs. Do not rely on comments in JSON.
- Acceptance Criteria:
  1. [ ] Setting is per-user opt-in and defaults safely when absent.
     - Verify: targeted unit test against settings load/default behavior.
     - Pass: absent setting preserves previous prompt/request behavior; enabled setting is read from the chosen per-user settings surface.
     - Fail: direct mode is hardcoded globally, added as a repo default, or breaks non-OpenAI providers.
  2. [ ] Direct mode injects style guidance through a prompt/config layer, not a raw provider request field.
     - Verify: unit test against prompt assembly or mocked extension context.
     - Pass: test asserts direct guidance appears only when enabled and appears once.
     - Fail: guidance always appears, duplicates every turn, or is sent as unsupported request JSON.
  3. [ ] Rollback works.
     - Verify: unit test or manual mocked setting removal/default.
     - Pass: removing/setting direct mode to default restores previous behavior.
     - Fail: stale direct guidance persists after disabling.

### Wave 2B (fallback if D1 finds implementation is upstream-limited)

**T2B: Upstream-limited fallback docs/status path** [small] -- technical-writer
- Blocked by: D1
- Description: If implementation cannot be done safely in tracked dotfiles, do not patch installed package code. Update the plan `## Execution Status` and docs with the limitation, exact upstream files/functions discovered, and a copy/paste upstream enhancement request. Keep prompt caching as documentation-only.
- Files: `.specs/pi-gpt-direct-personality/plan.md`, possibly `pi/README.md` or `pi/docs/*.md` if useful.
- Acceptance Criteria:
  1. [ ] Upstream limitation is documented rather than hidden.
     - Verify: read `## Execution Status` or changed docs.
     - Pass: limitation, evidence, and upstream follow-up are explicit.
     - Fail: executor attempts speculative repo changes or edits installed package files.

### Wave 2 -- Validation Gate

**V2: Validate wave 2 selected path** [medium] -- qa-engineer
- Blocked by: T2A or T2B
- Checks:
  1. If T2A ran: run its targeted tests, `cd pi/tests && bun test`, and `bunx tsc -p pi/extensions/tsconfig.json --noEmit` if TS extension files changed and the command is available.
  2. If T2B ran: confirm no installed package files were modified and docs/status clearly state the limitation.
  3. Confirm default/no-setting behavior is unchanged or explicitly documented as not implemented.
- On failure: create a fix task, re-run V2 after correction.

### Wave 3

**T3: Map direct personality to GPT-5+ low verbosity if hook exists** [medium] -- typescript-pro
- Blocked by: V2
- Description: If T1 found a stable repo-controlled provider/model option hook, map enabled direct personality to OpenAI GPT-5+ Responses `text.verbosity: "low"` or the equivalent Pi abstraction. Gate this by provider/model capability metadata if available; provider/model-name checks are fallback only. If no hook exists, do not patch installed packages: record a documented no-op/upstream follow-up.
- Files: exact request option/model adapter files from T1, tests under `pi/tests/`, or docs/status only if upstream-limited.
- Acceptance Criteria:
  1. [ ] Direct mode sets low verbosity only for compatible OpenAI GPT-5+ models when hook exists.
     - Verify: unit test/mocked model request generation for `openai-codex/gpt-5.5` or equivalent Pi model object.
     - Pass: request/options include low verbosity or documented Pi abstraction.
     - Fail: no verbosity option is applied despite an available hook.
  2. [ ] Non-compatible providers/models do not receive unsupported verbosity params.
     - Verify: unit test/mocked request generation for at least one non-OpenAI provider or non-GPT-5 model.
     - Pass: no unsupported `text.verbosity`/verbosity field is present.
     - Fail: tests show param leakage to unsupported providers.
  3. [ ] Upstream-limited no-op path is explicit if no hook exists.
     - Verify: read execution status/docs.
     - Pass: no installed package edits; follow-up states exact upstream hook needed.
     - Fail: silent omission of verbosity mapping.

### Wave 3 -- Validation Gate

**V3: Validate verbosity mapping or documented no-op** [medium] -- qa-engineer
- Blocked by: T3
- Checks:
  1. Run T3 acceptance checks.
  2. `cd pi/tests && bun test` if code changed.
  3. `bunx tsc -p pi/extensions/tsconfig.json --noEmit` if TS extension files changed and the command is available.
  4. Confirm installed `node_modules` is not modified.
- On failure: create a fix task, re-run V3 after correction.

### Wave 4

**T4: Document prompt caching, direct mode, and rollback** [small] -- technical-writer
- Blocked by: V3
- Description: Update tracked Pi-facing docs to explain direct personality as Pi-side style/prompt behavior plus GPT-5+ low verbosity where supported. Also document prompt caching findings without duplicating/conflicting with existing `pi/README.md` `PI_CACHE_RETENTION=long` language: OpenAI/OpenRouter OpenAI prompt caching is automatic for eligible prompts; `PI_CACHE_RETENTION=long` prefers extended retention where Pi supports it; provider-specific `cacheControlFormat: "anthropic"` applies only for providers/models that require Anthropic-style markers.
- Files: tracked docs only, likely `pi/README.md` and/or a relevant `pi/docs/*.md`. Installed package docs/changelog are citations only. `pi/settings.json` is JSON and must not be used for comments.
- Acceptance Criteria:
  1. [ ] Docs state direct personality is not a raw OpenAI `personality` API parameter.
     - Verify: `grep -R "personality.*API\|PI_CACHE_RETENTION\|verbosity\|direct" -n pi/README.md pi/docs`
     - Pass: tracked docs contain the distinction and user configuration/rollback instructions.
     - Fail: docs imply unsupported raw API fields, omit how to enable/disable direct mode, or edit installed docs only.
  2. [ ] Docs state prompt caching expectations without promising unavailable OpenRouter behavior.
     - Verify: compare changed text with existing `pi/README.md` `PI_CACHE_RETENTION=long` section and manually read changed docs.
     - Pass: docs mention OpenAI automatic caching, `PI_CACHE_RETENTION=long`, OpenRouter caveat, and no broad new caching implementation.
     - Fail: docs instruct unnecessary OpenAI cache markers or overgeneralize OpenRouter caching.

### Wave 4 -- Validation Gate

**V4: Validate docs and final behavior** [small] -- qa-engineer
- Blocked by: T4
- Checks:
  1. Run T4 acceptance checks.
  2. `cd pi/tests && bun test` if any code changed in Wave 4; otherwise documentation grep/manual read is sufficient.
  3. Final consistency check: user can identify exactly how to enable direct mode, disable it, and enable long cache retention.
- On failure: create a fix task, re-run V4 after correction.

## Dependency Graph

```
Wave 1: T1 → D1
Wave 2 path A: D1 → T2A → V2
Wave 2 path B: D1 → T2B → V2
Wave 3: V2 → T3 → V3
Wave 4: V3 → T4 → V4
```

## Execution Status

Partial execution completed on 2026-05-02.

Completion classification: `blocked-by-failure`.

Last completed wave/gate: implementation through Wave 4 completed; targeted direct-personality validation passed. Archive preflight did not pass because repo-wide Pi test and TypeScript validation commands fail in the current environment with pre-existing/unrelated failures.

Implementation note from T1:
- Repo-editable settings seam: `pi/lib/settings-loader.ts` exposes `readMergedSettings({ skipProject: true, skipLocal: true })`, which reads per-user `~/.pi/agent/settings.json` via `getAgentDir()`.
- Repo-editable prompt seam: Pi extension event `before_agent_start` can return a modified `systemPrompt` (verified in installed Pi docs `docs/extensions.md`). Implemented in `pi/extensions/direct-personality.ts`.
- Repo-editable provider payload seam: Pi extension event `before_provider_request` can return a modified provider payload (verified in installed Pi docs `docs/extensions.md`). Implemented opportunistic GPT-5-family `text.verbosity: "low"` mapping in `pi/extensions/direct-personality.ts`.
- Durable docs seam: tracked `pi/README.md`; installed package docs/changelog used only as evidence.

Implemented:
- Added `pi/extensions/direct-personality.ts` with per-user opt-in direct personality support.
- Added `pi/tests/direct-personality.test.ts` covering default-off behavior, prompt injection, GPT-5-family verbosity mapping, unsupported-provider no-op, and rollback/default behavior.
- Updated `pi/README.md` with direct personality enable/disable instructions and prompt caching/OpenRouter caveats.

Commands already run:
- `cd pi/tests && bun test direct-personality.test.ts` -- passed (`8 pass`, `0 fail`).
- `grep -R "personality.*API\|PI_CACHE_RETENTION\|verbosity\|direct" -n pi/README.md pi/docs` -- passed for updated tracked docs.
- `python pi/extensions/tsc-check.py` -- failed because the checker could not locate the pnpm-installed `@mariozechner/pi-coding-agent`; it only checked npm/Bun/default pnpm paths.
- `cd pi/tests && bunx tsc -p ../extensions/tsconfig.json --noEmit` -- failed with many pre-existing module/type resolution errors across unrelated extensions.
- `cd pi/tests && bun test` -- failed with many pre-existing/unrelated failures (missing modules, Bun/Vitest mock API incompatibilities, existing test failures), while the new `direct-personality.test.ts` suite passed.

Remaining validation before archive:
1. Fix or account for the existing Pi-wide test environment failures, then run:
   ```bash
   cd pi/tests && bun test
   ```
   Expected success signal: all Pi tests pass, including `direct-personality.test.ts`.
2. Fix or account for the TypeScript checker environment so it can resolve Pi's pnpm-installed package dependencies, then run one of:
   ```bash
   python pi/extensions/tsc-check.py
   # or, if using the tests package toolchain:
   cd pi/tests && bunx tsc -p ../extensions/tsconfig.json --noEmit
   ```
   Expected success signal: no new TypeScript errors.
3. Rerun `/do-it .specs/pi-gpt-direct-personality/plan.md` after those validation issues are resolved so archive preflight can complete.

No manual/live validation is required for this plan.

## Success Criteria

1. [ ] Pi has a user-facing direct personality setting with safe default behavior, or the plan explicitly documents why this is upstream-limited.
   - Verify: targeted tests for settings behavior, or read `## Execution Status` upstream-limited note.
   - Pass: enabled direct mode is opt-in; absent/default setting preserves old behavior; upstream limitation is explicit if implementation is not possible.
2. [ ] Direct mode affects prompt style and, where supported, GPT-5+ verbosity without leaking unsupported params.
   - Verify: `cd pi/tests && bun test` plus targeted mocked request/prompt tests when code changes.
   - Pass: tests cover enabled direct mode, absent/default mode, GPT-5+ verbosity mapping or documented no-op, and non-compatible provider no-op behavior.
3. [ ] TypeScript remains valid for modified Pi extension/lib files.
   - Verify: `bunx tsc -p pi/extensions/tsconfig.json --noEmit` when TS extension files change and command is available.
   - Pass: no new type errors.
4. [ ] Documentation tells users how to enable/disable direct mode and how prompt cache retention works.
   - Verify: `grep -R "PI_CACHE_RETENTION\|verbosity\|direct" -n pi/README.md pi/docs`
   - Pass: tracked docs mention `PI_CACHE_RETENTION=long`, automatic OpenAI/OpenRouter OpenAI caching, direct/personality distinction, and rollback/disable instructions.

## Handoff Notes

- Research citations used for this plan:
  - Codex config reference: https://developers.openai.com/codex/config-reference
  - Codex app settings: https://developers.openai.com/codex/app/settings
  - GPT-5.5 guide: https://developers.openai.com/api/docs/guides/latest-model
  - OpenAI prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching
  - OpenRouter prompt caching: https://openrouter.ai/docs/guides/best-practices/prompt-caching
- Installed Pi changelog/docs already mention `PI_CACHE_RETENTION=long`, `prompt_cache_key`, and OpenAI 24h retention. Use installed docs as evidence only; make durable documentation changes in tracked repo docs.
- Do not patch installed `node_modules`. If T1 finds request construction or prompt injection is upstream-only, use T2B/T3 no-op documentation and record a follow-up enhancement instead.
- Prefer a minimal prompt-layer direct mode first. Treat GPT-5+ verbosity mapping as opportunistic: implement only when a stable repo-controlled hook and tests exist.
