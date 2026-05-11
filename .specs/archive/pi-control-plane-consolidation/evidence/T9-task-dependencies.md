# T9 Task dependencies evidence

- Item: T9
- Changes: added `blockedBy`/`blocks`, reverse edge maintenance, direct cycle rejection, and retained tombstones via `deletedAt` with default-list filtering.
- Verification: `task-dependencies.test.ts` passed in focused pnpm run.
