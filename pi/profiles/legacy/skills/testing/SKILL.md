---
name: testing
description: "Cross-language unit and integration testing: fixtures, isolation, teardown, mocks, determinism, coverage, and test artifact cleanup. Use with a language skill for runner-specific syntax. Not for browser E2E; use playwright-e2e."
---

# Testing

## Boundary

| Work | Use |
| --- | --- |
| Unit and integration test design | `testing` |
| Runner syntax and language conventions | The owning language skill |
| Browser end-to-end tests | `playwright-e2e` |
| Diagnosing an unexplained failure | `analysis-workflow` |

Runner references:

- [TypeScript and JavaScript](../typescript/testing.md)
- [Python](../python/testing.md)

## Test design

- Test observable behavior, parsed contracts, schemas, and failure handling rather than private implementation details or policy prose.
- Name the seam: the public interface where the behavior is observed. Ask the user only when competing seams would create materially different contracts.
- Derive expected values from an independent source such as a specification, worked example, known-good result, or distinct implementation. Do not recompute the expectation with the logic under test.
- Use the repository runner at the observable seam selected by the repository's contract-directed validation rule.
- Keep tests deterministic and independent of execution order.
- Follow repository coverage requirements. Do not invent a percentage target or use coverage as a substitute for behavior.

Follow `pi/AGENTS.md` Validation cadence: implementation workers may author the smallest tests that express the changed contract, but leave development validation to the root-owned final phase by default. Preserve required immediate safety checks, read-only inspection, and live incident stops. An explicit user request for TDD or early checks overrides this default.

## Explicit test-first loop

Only use a red-green loop when the user explicitly requests test-first development or early checks:

1. Define one behavior and its seam.
2. Write the smallest test that expresses that behavior, then run it and confirm it fails for the expected reason.
3. Implement only enough to make that test pass.
4. Repeat in vertical slices, letting each cycle inform the next.
5. Refactor only from green, then rerun the focused checks.

If no correct seam can reproduce the contract, report that gap and use an appropriate executable slice instead of adding a shallow test that gives false confidence.

## Final-batch validation

After implementation, test authoring, and integration settle, apply the root-owned final phase from `pi/AGENTS.md`: run each necessary focused check once, classify failures before repair, and use the single shared repair batch and targeted rerun allowed there. Persistent failures stop patching; reassess the mechanism, assumptions, and harness and report the unresolved boundary.

## Isolation and cleanup

1. Isolate files, application state, caches, sessions, databases, and sockets.
2. Do not use live home directories, user sessions, application state, or worktree state unless that live boundary is the contract.
3. Set path-related environment variables before importing modules that cache them, then restore the variables.
4. Register cleanup when each resource is created. Use teardown hooks or `finally` so failed assertions cannot skip cleanup.
5. Stop child processes and close handles before deleting the sandbox.
6. Keep logs, traces, screenshots, or generated output only when the workflow requires them.

## Mocks and integration boundaries

- Mock external services, clocks, randomness, and expensive boundaries when their real behavior is not under test.
- Do not mock internal collaborators so heavily that the test only verifies its stubs.
- Use the real parser, filesystem, database engine, subprocess protocol, or service when that boundary determines behavior.
- Make required credentials, services, and seeded data explicit. Use only the repository's documented skip gate.

## Failure handling

- Author tests for observed contracts, not imagined behavior; defer their execution to the final phase unless the user chose test-first development.
- When residue is part of the regression, compare relevant external state before and after the test.
- Do not call a broader-suite failure unrelated without direct evidence or report a failing suite as green. Any executable reproduction uses the remaining validation allowance.
