## Finding 1

**Severity:** high
**Evidence:** Plan T1 centralizes `RouterSize`, but T3/T4 still say resolver/status/log are built “on top of `RouteDecision`” without requiring a single exported `RouteDecision` contract module. Current code defines `RouteDecision` inside `pi/extensions/prompt-router.ts`, which makes library resolver/status code either import an extension module or duplicate the interface.
**Required_fix:** Add an explicit shared module, e.g. `pi/lib/prompt-router/route-decision.ts`, exporting `RouterSize`, `RouteDecision`, schemas/guards, and adapters. Require all extension, resolver, telemetry, and tests to import it.

## Finding 2

**Severity:** high
**Evidence:** T4 requires status/explain/log fields such as candidates, rule, context flags, override scope, and operator summary to “derive from the dispatch `RouteDecision`,” but T3’s resolver fields omit candidates, rule, confidence details beyond route, and context/override fields. Implementers can satisfy schemas from mutable last-classification state instead of the immutable dispatched decision.
**Required_fix:** Expand `RouteDecision` acceptance criteria to include the complete sanitized classifier/policy snapshot needed by status/explain/log, or define a nested immutable `decisionTrace` carried through dispatch and consumed by those outputs.

## Finding 3

**Severity:** high
**Evidence:** T1 says extension, classifier adapter, resolver, telemetry, eval, and tests must import the canonical route module. Python classifier/eval code cannot import a TypeScript module, while the plan also changes Python CLI/eval behavior. This creates a guaranteed duplicate-union pressure across TS/Python for `nano|mini|core|large|max` and classifier modes.
**Required_fix:** Specify a language-neutral contract artifact, such as JSON Schema plus generated TS/Python constants or parity tests reading the same fixture, and make both TS and Python validation fail on drift.

## Finding 4

**Severity:** medium
**Evidence:** The adversarial risk is stale global route state. Plan T5/T6 adds context capsule and overrides, but no acceptance criterion requires per-turn state to be keyed by `route_decision_id`/provider request or cleared after dispatch. Current router already has status/explain global state patterns, so new override/context state can bleed into a later request.
**Required_fix:** Require state containers to be request-scoped or keyed by immutable decision ID, with tests for concurrent/overlapping provider requests proving the second dispatch cannot use the first decision, context hold, or fallback metadata.

## Finding 5

**Severity:** medium
**Evidence:** Validation uses `pnpm run test -- prompt-router.test.ts`, but the plan’s claims span imports/module placement in `pi/extensions`, shared `pi/lib`, Python parity, and runtime dispatch. A filename-filtered Vitest run can pass while tests outside `prompt-router.test.ts` break or while moved shared modules are not exercised by integration tests.
**Required_fix:** Keep the targeted command for quick gates, but add named full Pi test gates immediately after shared contract/module moves and final dispatch changes: `cd pi/tests && pnpm run test`, plus at least one integration test asserting dispatch payload uses the same immutable decision ID shown by status/explain.
