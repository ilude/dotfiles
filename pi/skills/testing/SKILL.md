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
- Follow the feasibility-slice rules in `pi/AGENTS.md`. Tests can support a slice but cannot replace proof of an external boundary.
- Use the repository runner. Start with the focused test that can falsify the changed contract.
- Keep tests deterministic and independent of execution order.
- Follow repository coverage requirements. Do not invent a percentage target or use coverage as a substitute for behavior.

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

- Record the expected successful outcome before editing.
- Run the focused test through its supported command.
- When residue is part of the regression, compare relevant external state before and after the test.
- Reproduce a broader-suite failure directly before calling it unrelated. Never report a failing suite as green.
