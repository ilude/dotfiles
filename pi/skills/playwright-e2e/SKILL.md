---
name: playwright-e2e
description: "Playwright end-to-end test triage and validation. Use when working with Playwright specs, fixtures, traces, browsers, test projects, dependency-gated suites, or e2e Docker cleanup. Not for unit-test-only changes."
---

# Playwright E2E Workflow

**Auto-activate when:** editing Playwright tests, fixtures, config, browser traces, screenshots, dependency-gated suites, or Docker-backed end-to-end environments.

## Boundary

Use `playwright-e2e` for browser end-to-end behavior and suite triage. Use `typescript` for unit-level TypeScript implementation. Use `docker` when only container files are changing.

## Triage Rules

For requested multi-spec or suite triage:

- Work one spec file at a time so progress is resumable.
- Record each in-scope file as pass, fail, or skip with the reason and exact command.
- Respect dependency gates. Do not run suites that require unavailable services, credentials, seeded data, or prior jobs unless those dependencies are ready.
- Preserve traces, screenshots, videos, or logs needed to explain failures.
- Run repository-owned teardown after triage. Do not remove volumes unless the workflow requires it.

## Practical Steps

1. Identify the Playwright config, affected project, browser target, base URL, and required services.
2. Run the smallest affected spec first.
3. Fix or document the root cause before moving to another spec.
4. Run a broader suite only when shared impact, repository policy, or the requested triage scope requires it.

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
- Leaving test infrastructure running when the requested workflow owns teardown.
- Treating screenshots alone as proof without checking the assertion, trace, or browser console context.
