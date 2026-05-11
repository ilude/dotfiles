# T1 branch contract

- Item: T1
- Contract encoded: Windows Terminal (`wt`) is supported when `process.platform === "win32"` or `WT_SESSION` is present; unsupported terminals receive a safe manual `pi --session <id-or-file>` resume command.
- Ghostty status: not claimed as supported; fallback-only until syntax/tests are added.
- Files changed: `pi/tests/branch-command.test.ts`.
- Validation: covered by focused branch tests in T2 evidence.
