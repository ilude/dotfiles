# V4 docs and end-to-end acceptance mapping

Date: 2026-05-11

## Result

PASS for Wave 4 validation. T8 docs/evidence exists, maps AC1-AC8, and focused prompt-router tests pass after docs updates.

## Commands run

| Command | CWD | Exit | Notes |
|---|---:|---:|---|
| `grep -RIn --exclude-dir=node_modules --exclude-dir=.venv "context-continuation-hold\|policy-only\|manual pin\|router.classifier.mode\|router purge\|provider trust" pi/prompt-routing/docs pi/README.md .specs/prompt-router-v1/evidence/T8-docs.md .specs/prompt-router-roadmap/PRD.md` | repo root | 0 | Operator docs contain required terms and explanations. |
| `test -f .specs/prompt-router-v1/evidence/T8-docs.md && grep -n "AC1\|AC2\|AC3\|AC4\|AC5\|AC6\|AC7\|AC8" .specs/prompt-router-v1/evidence/T8-docs.md` | repo root | 0 | AC1-AC8 mapping present. |
| `cd pi/tests && pnpm test prompt-router.test.ts` | `pi/tests` | 0 | Vitest: 1 file, 75 tests passed. |
| `grep -RIn --exclude-dir=node_modules --exclude-dir=.venv -E "(BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY|AWS_SECRET_ACCESS_KEY|AKIA[0-9A-Z]{16}|api[_-]?key[=:]|secret[_-]?key[=:]|token=)" pi/prompt-routing/docs/operator-handoff.md .specs/prompt-router-v1/evidence/T8-docs.md` | repo root | 0 | Refined secret scan passed; no matches. |

## Acceptance mapping check

`T8-docs.md` maps AC1 through AC8 to docs, implementation evidence, focused tests, and eval artifacts. No deferrals were needed for Wave 4 docs.

## Notes

An initial broad grep over all `pi` directories timed out or matched runtime history; validation was rerun against scoped documentation/evidence paths with `node_modules`, `.venv`, and history excluded.
