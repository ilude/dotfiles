# TypeScript/JavaScript Testing

Read the shared [testing skill](../testing/SKILL.md) for test selection, fixture isolation, teardown, mocking boundaries, and residue checks. This reference owns TypeScript and JavaScript runner syntax and examples.

## Runner selection

Use the package scripts, lockfile, and existing imports to identify the runner. Do not switch runners or bypass the package script to make a test pass.

```bash
# Bun-owned package
bun test tests/unit.test.ts

# pnpm package with a Vitest test script
pnpm test tests/unit.test.ts

# Direct Vitest invocation only when the repository owns that workflow
pnpm exec vitest run tests/unit.test.ts
```

Pass filters exactly as the package script expects. Some scripts forward arguments directly and must not receive an extra `--`.

## Common APIs

| Purpose | Vitest | Bun |
| --- | --- | --- |
| Import | `from "vitest"` | `from "bun:test"` |
| Suite and test | `describe`, `it`, `test` | `describe`, `it`, `test` |
| Hooks | `beforeEach`, `afterEach`, `beforeAll`, `afterAll` | Same names |
| Assertions | `expect` | `expect` |
| Mock function | `vi.fn()` | `mock()` |
| Module mock | `vi.mock()` | `mock.module()` |

Use `it.skip`, `it.only`, and `it.todo` only as temporary or explicitly documented suite controls. Do not leave focused tests committed.

## Vitest filesystem and environment fixtures

Register temporary paths when they are created. Restore environment variables before deleting their sandbox.

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, vi } from "vitest";

const sandboxes = new Set<string>();

export function createTestHome(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-test-"));
  sandboxes.add(root);
  vi.stubEnv("HOME", root);
  vi.stubEnv("USERPROFILE", root);
  return root;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of sandboxes) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  sandboxes.clear();
  vi.restoreAllMocks();
});
```

When a module reads environment-based paths at import time:

1. Stub the environment first.
2. Call `vi.resetModules()` when a prior import may be cached.
3. Dynamically import the module under test.
4. Restore the environment in teardown.

For file-level shared state, create one root in `beforeAll` and remove it in `afterAll`. Do not use a shared root when tests mutate the same files concurrently.

In Bun tests, use the same ownership pattern with hooks from `bun:test`; capture and restore environment values explicitly because Vitest's `vi.stubEnv` is unavailable.

## Mocking

Mock at process, network, clock, randomness, or service boundaries. Preserve the real parser or serialization layer when that behavior is part of the contract.

```typescript
import { describe, expect, it, vi } from "vitest";

const fetchUser = vi.fn().mockResolvedValue({ id: "user-1" });

describe("user lookup", () => {
  it("returns the resolved user", async () => {
    await expect(fetchUser()).resolves.toEqual({ id: "user-1" });
  });
});
```

Use fake timers only for code driven by timers, and restore real timers in teardown.

## Type safety tests

```typescript
import { expectTypeOf, it } from "vitest";
import { processUser } from "./user-processor";

it("returns the public result shape", () => {
  const result = processUser({ name: "Taylor", age: 30 });
  expectTypeOf(result).toMatchTypeOf<{ success: boolean }>();
});
```

Use `@ts-expect-error` only when the test intentionally verifies a compiler rejection.

## Browser components

For component tests, prefer accessible queries in this order:

1. `getByRole`
2. `getByLabelText`
3. `getByText`
4. `getByTestId` as a last resort

Use [react.md](react.md) for React implementation patterns and `playwright-e2e` for browser end-to-end suites.

## Coverage

Use the repository-owned coverage command and configured thresholds.

```bash
bun test --coverage
pnpm test --coverage
```

Do not claim coverage for skipped or dependency-gated tests. Keep generated reports in the configured artifact directory and follow its retention policy.
