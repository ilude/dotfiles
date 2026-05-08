# TypeScript PRD Readiness Review

## Finding 1 — High — Tool extension module boundary is underspecified

**Evidence:** PRD requires 8 LLM-callable tools and says to keep helpers out of top-level `pi/extensions/`, but does not specify which top-level extension entrypoint owns tool registration or which helper modules belong under `pi/lib/`. `pi/extensions/README.md` states every top-level `pi/extensions/*.ts` is auto-discovered as an extension factory, and non-extension helpers there can crash startup or register accidental no-op extensions.

**Required fix:** Add an implementation boundary section naming the single extension entrypoint, e.g. `pi/extensions/task-tools.ts`, and helper locations, e.g. `pi/lib/task-tools.ts`, `pi/lib/task-dependencies.ts`, `pi/lib/task-settings.ts`. State that only the entrypoint exports `default function (pi: ExtensionAPI)` and all reusable code stays outside top-level `pi/extensions/`.

## Finding 2 — High — Tool schema compatibility is not verifiable enough

**Evidence:** Acceptance criterion 2 only verifies `cd pi/extensions && pnpm run typecheck`, but the PRD requires “Claude-compatible task tools” with “documented schemas.” Typechecking proves TypeScript compiles; it does not prove `TaskCreate`, `TaskUpdate`, `TaskExecute`, etc. have expected names, TypeBox schemas, enum values, required fields, or result shapes. Existing Pi extensions register tools through `pi.registerTool(...)`, so schema assertions need runtime/unit coverage, not only `tsc`.

**Required fix:** Add tests that import or exercise the registration module with a mocked `ExtensionAPI`, capture registered tools, and assert exact tool names plus input schema essentials for every tool. Include status enum coverage for new states such as `skipped`, dependency fields, batch dependency references, and output/stat fields.

## Finding 3 — High — Schema evolution plan conflicts with current `TaskRecordV1` contract

**Evidence:** PRD requires extending the canonical registry with descriptions, owners, active form, agent type, dependency edges, execution output, stats, metadata, and skipped state while preserving compatibility. Current `pi/lib/task-registry.ts` exports `TaskRecordV1` with `schemaVersion: 1` and imports `TaskState`, transition tables, and directory helpers from `pi/lib/operator-state.ts`. The PRD mentions “Version schema and test old record loading” only as a risk mitigation, not as concrete acceptance criteria.

**Required fix:** Add explicit migration acceptance criteria: legacy v1 JSON fixtures load successfully; new records use either a clearly defined backward-compatible v1 extension or `TaskRecordV2`; unknown fields are preserved or intentionally migrated; `operator-state.ts` transition tables include `skipped`; and all state changes go through `transitionTask()` or its replacement with tests for every new transition.

## Finding 4 — Medium — Validation commands are incomplete and partially ambiguous

**Evidence:** The repo policy requires Pi validation through both `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` and `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`. The PRD lists individual `pnpm run test -- task-registry` / `-- tasks` commands and one typecheck, but does not state the full final validation sequence or install prerequisites. Some acceptance criteria say only “unit test” or “mocked execution test” without exact command/path.

**Required fix:** Add a “Final verification” section with exact pnpm-only commands, including frozen installs for both packages and full test/typecheck runs. For each mocked test criterion, name the intended test file(s), e.g. `pi/tests/task-tools.test.ts`, `pi/tests/task-dependencies.test.ts`, and the exact Vitest filter command expected to pass.

## Finding 5 — Medium — Persistent widget/status requirement may exceed current API evidence

**Evidence:** PRD requires “persistent or compact task visualization if supported by Pi UI APIs” and display modes `hidden`, `compact`, `full`, but acceptance criterion 9 only says tests should render expected output shape. It does not define the API boundary between pure rendering and actual persistent UI/status injection, nor a fallback behavior if Pi lacks a persistent widget API.

**Required fix:** Split the requirement into a mandatory pure renderer/settings layer and an optional UI adapter. Define exact fallback behavior: `/tasks` and tool/status output must honor display mode even without persistent widget support; persistent widget registration is gated by a capability check and has separate tests/mocks only if the API exists.
