# Independent Plan Review: typescript-pro

## Finding 1 — HIGH — Helper placement plus auto-discovery rule is under-specified

**Evidence:** The plan correctly says not to create helper `.ts` files at top level of `pi/extensions/`, and existing `pi/extensions/*.ts` files are extension entrypoints with default exports (for example `pi/extensions/tasks.ts`, `pi/extensions/commit.ts`, `pi/extensions/web-tools.ts`). However T5 only says `pi/extensions/task-tools.ts` is the only new top-level extension entrypoint, while T4/T5 also ask implementers to create/import shared schemas and helpers. The plan does not explicitly require any schema/helper code for Task tools to live under `pi/lib/` or inside `task-tools.ts` rather than `pi/extensions/task-tool-schemas.ts` / similar.

**Required fix:** Add an explicit acceptance criterion to T5/V3: `find pi/extensions -maxdepth 1 -type f -name '*task*.ts'` must show only intended extension entrypoints, and all reusable schemas/helpers must be in `pi/lib/` or nested under a non-auto-discovered directory such as `pi/extensions/task-tools/` only if the loader ignores subdirectories.

## Finding 2 — HIGH — ESM import style conflicts with existing `pi/lib` pattern

**Evidence:** Existing extension code imports lib modules with runtime-style `.js` specifiers, e.g. `pi/extensions/tasks.ts` imports `../lib/task-registry.js`. Existing `pi/lib` internals import sibling modules with `.ts` specifiers, e.g. `pi/lib/task-registry.ts` imports `./operator-state.ts`, and tests commonly import source files with `.ts`. The plan only says “Import helpers with existing ESM `.js` import style where applicable,” which is ambiguous for new `pi/lib/task-dependencies.ts`, `task-renderer.ts`, `task-settings.ts`, and `task-security.ts`.

**Required fix:** Add module-boundary rules: extension-to-lib imports must use `../lib/*.js`; lib-to-lib and test-to-source imports should follow the current repo pattern (`.ts`) unless changed repo-wide. Add a focused typecheck/test acceptance item that imports every new helper from both `pi/extensions/task-tools.ts` and `pi/extensions/tasks.ts`.

## Finding 3 — MEDIUM — New helpers may not be typechecked until late integration

**Evidence:** `pi/extensions/tsconfig.json` includes only `pi/extensions/**/*.ts`; `pi/lib` files are typechecked there only if reachable through extension imports. The plan creates new pure helpers in Wave 1/2 (`task-security.ts`, `task-dependencies.ts`, `task-renderer.ts`, `task-settings.ts`) and runs Vitest tests, but there is no separate `tsc` coverage for all `pi/lib/**/*.ts`. A helper can compile under Vitest transforms or be only partially exercised, then fail when imported by an extension in Wave 3.

**Required fix:** Add a Wave 1/2 validation command that forces TypeScript compilation of all new `pi/lib` helpers, either by importing them from an existing extension-facing barrel/entrypoint before V1/V2 or by adding a pnpm test-side typecheck script covering `pi/lib/**/*.ts` and `pi/tests/**/*.ts`.

## Finding 4 — MEDIUM — Tool schema expectations are too vague for TypeBox/Pi API compatibility

**Evidence:** T5 requires “explicit schemas/result shapes” and “schema essentials,” but existing Pi tool registration uses `pi.registerTool({ ... })` and the extension package depends on `@sinclair/typebox`. Without naming the expected schema object shape, implementers can write Zod-like or ad hoc JSON schema objects that tests mock successfully but Pi runtime rejects or infers poorly.

**Required fix:** Add T5 acceptance criteria requiring TypeBox-compatible schemas using the same `@sinclair/typebox` patterns as existing extensions, and assert the captured `registerTool` definitions contain concrete `parameters`/input schemas and typed result contracts for every MVP tool.

## Finding 5 — MEDIUM — Cross-package test harness dependency is not encoded in commands

**Evidence:** `pi/tests/vitest.config.ts` throws unless `pi/extensions/node_modules/@earendil-works/pi-coding-agent` exists, while `pi/tests/package.json` does not declare Pi runtime dependencies. Some task-specific commands in the plan run only `cd pi/tests && pnpm run test ...`; these fail on a clean checkout unless `cd pi/extensions && pnpm install --frozen-lockfile` has already run.

**Required fix:** Update every task-specific test command or wave validation prerequisite to run/require `cd pi/extensions && pnpm install --frozen-lockfile` before `pi/tests` Vitest commands, or add a documented wrapper target so isolated acceptance checks are feasible from clean state.
