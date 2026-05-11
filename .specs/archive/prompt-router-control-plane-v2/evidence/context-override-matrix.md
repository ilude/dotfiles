# Wave 3 context/override matrix evidence

Timestamp: 2026-05-08
CWD: `C:/Users/mglenn/.dotfiles-prompt-router-control-plane`
Branch: `plan/prompt-router-control-plane`

## Sanitization

Evidence records only synthetic prompt labels and route metadata. No raw user prompts, endpoints, account IDs, tokens, credentials, private paths, or screenshots are included.

## Implemented matrix

| Case | Input signal | Expected behavior | Evidence |
|---|---|---|---|
| Bounded context capsule | Synthetic payload with 120 messages and high context usage | Capsule clamps `messageCount` to 99, stores prompt length only, emits `multi_turn` and `context_window_high`; no prompt text serialized | `prompt-router.test.ts`: `builds a bounded context capsule without prompt text` |
| One-turn anti-downgrade | Previous applied route `large`; classifier recommends `mini` | Applied route remains `large` for the turn; `anti_downgrade_hold` flag and sanitized fallback reason recorded | `prompt-router.test.ts`: `holds a one-turn downgrade from the previous applied route` |
| Override hierarchy | Session override `mini` plus route pin `large` | Route pin wins; `overrideScope=route-pin`, `rule=override:route-pin` | `prompt-router.test.ts`: `applies route pin before session override and records override scope` |
| Context-window safety | High context usage and low route recommendation | Applied route floors to `core`; `context_window_high` and `context_window_floor` flags recorded | `prompt-router.test.ts`: `raises low routes when context-window safety is high` |
| Same-turn decision trace | Wave 2 `RouteDecision.decisionTrace` remains source of status/explain fields | New policy metadata is carried on immutable decision trace; no raw prompt text added | Typecheck and targeted test pass |

## Validation commands

### Typecheck

Command:

```bash
cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck
```

Result: PASS (exit 0). `pnpm install` reported lockfile up to date; `tsc --noEmit` completed successfully.

### Prompt-router tests

Command requested:

```bash
cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts
```

Result: PASS (exit 0). The local Vitest script interpreted the forwarded args broadly and ran the Pi test suite; `tests/prompt-router.test.ts` passed with 68 tests, and the full invoked run passed with 71 files / 941 tests.
