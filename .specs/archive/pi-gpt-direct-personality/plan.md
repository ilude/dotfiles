---
created: 2026-05-02
status: completed
completed: 2026-05-03
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
- Description: Inspect tracked repo files and installed Pi package docs/source to identify settings loading, system/developer prompt assembly, and OpenAI/OpenRouter request option construction. Produce a short implementation note in `## Execution Status

Completed and archived on 2026-05-03.

Completion classification: `completed-and-archived`.

Last completed wave/gate: all implementation waves, targeted validation, TypeScript validation, Pi Vitest suite, and repo-wide `make check` completion gate passed.

Implemented:
- Added `pi/extensions/direct-personality.ts` with per-user opt-in direct personality support.
- Added `pi/tests/direct-personality.test.ts` covering default-off behavior, prompt injection, GPT-5-family verbosity mapping, unsupported-provider no-op, and rollback/default behavior.
- Updated `pi/README.md` with direct personality enable/disable instructions and prompt caching/OpenRouter caveats.
- Repaired Pi validation infrastructure so extension type-checking uses pnpm-managed `pi/extensions` dependencies and the Pi suite runs through Vitest.

Validation passed:
- `cd pi/tests && bun test direct-personality.test.ts` -- passed.
- `grep -R "personality.*API\|PI_CACHE_RETENTION\|verbosity\|direct" -n pi/README.md pi/docs` -- passed.
- `cd pi/extensions && pnpm run typecheck` -- passed.
- `cd pi/tests && bun run test` -- passed (`63 passed`, `880 passed`).
- `make check` -- passed.

No manual/live validation or deployment procedure was required.

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
