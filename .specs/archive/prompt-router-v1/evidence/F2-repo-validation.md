# F2 repo-wide validation

Date: 2026-05-11

## Result

PASS

## Commands run

| Command | CWD | Exit | Notes |
|---|---:|---:|---|
| `cd pi/tests && pnpm test transcript-integration.test.ts transcript-fixtures.test.ts transcript-log.test.ts` | `pi/tests` | 0 | Affected transcript tests passed: 69/69. |
| `cd pi/tests && pnpm run test -- --test-timeout 60000` | `pi/tests` | 0 | Full Pi test suite passed: 78 files, 995 tests. |
| `make check` | repo root | 0 | Repo-wide validation passed. |

## Notes

- The legacy `mid:medium` vs canonical `core` expectation is no longer blocking F2.
- No archive/F5 step was run.
