---
name: testing
description: "Cross-language unit and integration testing: fixtures, isolation, teardown, mocks, determinism, coverage, and test artifact cleanup. Use with a language skill for runner-specific syntax. Not for browser E2E; use playwright-e2e."
---

# Testing

## Boundary

| Work | Use |
| --- | --- |
| Cross-language unit and integration test design | `testing` |
| Runner commands, hooks, and language syntax | Owning language skill and testing reference |
| Browser end-to-end tests, traces, and browser infrastructure | `playwright-e2e` |
| Diagnosing an unexplained failure | `analysis-workflow` |

Runner references:

- [TypeScript and JavaScript](../typescript/testing.md)
- [Python](../python/testing.md)

## Core principles

- Test observable behavior, parsed contracts, schemas, and failure handling rather than private implementation details or policy prose.
- Keep tests deterministic and independent of execution order, live user state, and unrelated services.
- Use the repository-owned runner and package workflow. Do not switch runners or bypass the supported entrypoint to make a test pass.
- Start with the cheapest focused test that can falsify the changed contract. Run broader suites only for shared impact, repository policy, or an explicitly requested gate.
- Follow repository-defined coverage thresholds. Do not invent a percentage gate or treat line coverage as a substitute for behavior coverage.

## Fixture isolation and teardown

1. Create an isolated sandbox for files, application state, caches, sessions, databases, and sockets used by the test.
2. Never point fixtures at live HOME, USERPROFILE, XDG directories, user sessions, application state, or worktree state unless live integration is the explicit contract.
3. Change path-related environment variables before importing modules that cache their locations, and restore every variable afterward.
4. Register cleanup when each resource is created. Use framework teardown hooks, yielding fixtures, or `finally` so failed assertions do not skip cleanup.
5. Stop subprocesses and close file, database, server, and socket handles before removing the sandbox.
6. Retain logs, traces, screenshots, or generated outputs only when the workflow requires them, and use the repository-owned artifact location.

## Mocks and integration boundaries

- Mock external services, clocks, randomness, and expensive boundaries when their real behavior is not the contract under test.
- Do not mock the unit's internal collaborators so heavily that the test only verifies its own stubs.
- Use an integration test when behavior depends on a real parser, filesystem boundary, database engine, subprocess protocol, or service interaction.
- Make required credentials, services, and seeded data explicit. Skip only through the repository's documented dependency gate and report the reason.

## Validation and residue checks

For tests that create external state or fix a leak:

1. Record the expected successful outcome before editing.
2. Run the focused test through its supported command.
3. Assert generated paths remain inside the sandbox when practical.
4. Compare relevant external directories or process state before and after the test when residue is part of the regression.
5. If a broader suite fails elsewhere, reproduce that failure directly before classifying it as unrelated. Do not call the suite green when it was not.

## Anti-patterns

- Bare temporary-directory creation without registered teardown.
- Cleanup statements placed only after assertions.
- Fixtures that write to a developer's real home, cache, sessions, or repository.
- Leaving child processes, containers, handles, or test servers running.
- Preserving artifacts by default without a debugging or workflow contract.
- Running the full suite as a substitute for a focused regression check.
- Encoding prompt wording, comments, or policy prose as test assertions.
