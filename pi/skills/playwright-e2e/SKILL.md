---
name: playwright-e2e
description: "Playwright end-to-end test triage and validation. Use when working with Playwright specs, fixtures, traces, browsers, test projects, dependency-gated suites, or e2e Docker cleanup. Not for unit-test-only changes."
---

# Playwright E2E Workflow

**Auto-activate when:** editing Playwright tests, fixtures, config, browser traces, screenshots, dependency-gated suites, or Docker-backed end-to-end environments.

## Boundary

Use `playwright-e2e` for browser end-to-end behavior and suite triage. Use `typescript` for unit-level TypeScript implementation. Use `docker` when only container files are changing.

## Triage Rules

- Work one spec file at a time so progress is resumable.
- Record each file as pass, fail, or skip with the reason and the exact command used.
- Respect dependency gates. Do not run suites that require unavailable services, credentials, seeded data, or prior jobs unless those dependencies are ready.
- Preserve traces, screenshots, videos, or logs needed to explain failures.
- Clean up Docker-backed test stacks, volumes, and orphan containers according to the repo workflow after triage.

## Practical Steps

1. Identify the Playwright config, projects, browser targets, base URL, and required services.
2. Run the smallest affected spec first.
3. Fix or document the root cause before moving to the next spec file.
4. After targeted specs pass or are explicitly skipped with reasons, run the full relevant Playwright suite.
5. Record final pass, fail, or skip status for every in-scope file.

## Quick Commands

| Purpose | Commands |
|---|---|
| One file | `<package-manager> playwright test path/to/spec.ts` |
| One project | `<package-manager> playwright test --project=<project>` |
| Trace viewer | `<package-manager> playwright show-trace <trace.zip>` |
| Report | `<package-manager> playwright show-report` |
| Docker cleanup | `docker compose down --remove-orphans` |

## Anti-patterns

- Jumping between many failing files without recording status.
- Calling a suite green when dependency-gated tests were skipped without reasons.
- Leaving Docker stacks running after failed e2e attempts.
- Treating screenshots alone as proof without checking the assertion, trace, or browser console context.
