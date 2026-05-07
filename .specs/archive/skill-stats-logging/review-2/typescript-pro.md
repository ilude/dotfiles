# TypeScript / Pi Extension Loading Build Review

## Findings

1. **Severity: High — Current changed TypeScript does not implement the planned `/skill-stats` extension.**
   - **Evidence:** The plan requires `pi/extensions/skill-stats.ts` with a default extension factory and `registerCommand("skill-stats")` (T3 AC1). Current tracked TypeScript diff only changes `pi/extensions/extension-stats.ts`; `git diff --name-only` shows no `pi/extensions/skill-stats.ts`.
   - **Required fix:** Add the actual top-level `pi/extensions/skill-stats.ts` extension module, or update the plan/status to reflect that implementation has not started. Do not treat `/extension-stats` slash-echo enhancements as satisfying `/skill-stats` acceptance criteria.

2. **Severity: High — The plan permits forward logging only after a durable hook is proven, but no TypeScript build/load target is named for that hook.**
   - **Evidence:** T4 says to edit the “durable skill expansion/load source if present,” while constraints forbid editing `pi/extensions/node_modules`. The repo has a top-level `pi/extensions/skill-loader.ts`, but the plan does not require inspecting or typechecking the exact hook file before mutation.
   - **Required fix:** Make T1 identify the precise non-`node_modules` TypeScript file/function that runs during skill loading, then require T4 to modify only that named source. If no such file is named, T4 must remain blocked and no logging code should be added.

3. **Severity: Medium — Helper placement can break Pi startup if test/parser helpers are added as top-level extension files.**
   - **Evidence:** `pi/extensions/README.md` states every top-level `pi/extensions/*.ts` is auto-discovered and must export a default factory; the plan mentions shared helpers under non-autodiscovered paths, but T5 allows “a non-autodiscovered fixture/smoke script” without an explicit path guard.
   - **Required fix:** Require parser helpers/fixtures/tests to live under `pi/lib/`, `pi/tests/`, or `.specs/...`, never as top-level `pi/extensions/*.ts` unless they are real extensions with default factories.

4. **Severity: Medium — Typecheck validation does not prove runtime extension loading/import compatibility.**
   - **Evidence:** Required validation is `cd pi/extensions && pnpm run typecheck`; TypeScript may pass while Pi auto-loading fails due to missing default factory shape, wrong ESM `.js` import paths for shared helpers, or command registration errors at module initialization.
   - **Required fix:** Add a smoke validation that imports/loads `pi/extensions/skill-stats.ts` the same way existing extension smoke checks do, asserts the default export is callable, and verifies `registerCommand("skill-stats", ...)` is invoked without throwing.

5. **Severity: Low — Existing `pi/settings.json` diff violates newline hygiene and is unrelated to the feature.**
   - **Evidence:** `git diff -- pi/settings.json` shows only removal of the trailing newline (`\ No newline at end of file`). This file is outside the planned implementation paths for `/skill-stats`.
   - **Required fix:** Restore the trailing newline or revert the unrelated settings change before archive/preflight completion.
