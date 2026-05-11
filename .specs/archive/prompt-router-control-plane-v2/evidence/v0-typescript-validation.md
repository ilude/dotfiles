# V0 TypeScript validation evidence

Date: 2026-05-07
Worktree: `C:/Users/mglenn/.dotfiles-prompt-router-control-plane`
Scope: V0 only; pnpm-only validation per plan.

## Commands and results

```bash
cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck
```

Result: PASS.

- `pnpm install --frozen-lockfile`: lockfile up to date, already up to date.
- `pnpm run typecheck`: `tsc --noEmit` completed with exit code 0.
- pnpm warning: dependency build scripts were ignored for `@google/genai`, `koffi`, and `protobufjs`; no approval action taken.

```bash
cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts
```

Result: PASS.

- `pnpm install --frozen-lockfile`: lockfile up to date, already up to date.
- Vitest completed with exit code 0.
- Summary: `71 passed` test files, `934 passed` tests, duration `41.21s`.
- `tests/prompt-router.test.ts`: `61` tests passed.

Note: the command was run exactly as requested. The current `test` script invocation caused Vitest to run the full suite while including `tests/prompt-router.test.ts`; no repair was needed.

## Same-turn provider seam evidence

The passing `prompt-router.test.ts` includes the provider spike seam tests under `Provider architecture spike: awaited provider seam`.

Sanitized assertions covered:

- Awaited route resolution occurs before provider dispatch using ordered trace markers: `classify-start`, `classify-done`, `route-resolved`, `dispatch-called`, `first-token-or-provider-invoked`.
- One immutable route decision correlation is carried into the provider payload via `route_decision_id`.
- Same-turn dispatch consumes the resolved `model_label`, `thinking_level`, and `same_turn_applied: true` before provider invocation.
- Cross-provider routing remains denied by policy.
- Concurrent routing decisions keep distinct `route_decision_id` and `prompt_hash` values.

## Blockers

None.
