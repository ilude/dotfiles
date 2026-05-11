# V2 Runtime Policy Evidence

Date: 2026-05-11

## Scope

Wave 2 only: T4 deterministic continuation capsule / one-turn context-continuation-hold with cheap/brief bypass, and T5 override hierarchy / provider trust reporting.

## Files changed

- `pi/extensions/prompt-router.ts`
- `pi/lib/prompt-router/route-decision.ts`
- `pi/tests/prompt-router.test.ts`
- `.specs/prompt-router-v1/plan.md` (checkbox/status update only)
- `.specs/prompt-router-v1/evidence/V2-runtime-policy.md`

## Commands

| Command | CWD | Exit | Result |
|---|---|---:|---|
| `cd pi/tests && pnpm test prompt-router.test.ts` | repo root | 0 | 74/74 focused prompt-router tests passed |
| `cd pi/extensions && pnpm run typecheck` | repo root | 0 | TypeScript typecheck passed |
| `git diff --name-only -- .specs/prompt-router-v1/plan.md pi/extensions/prompt-router.ts pi/lib/prompt-router/route-decision.ts pi/tests/prompt-router.test.ts && grep -RIn "context-continuation-hold\\|downgrade_intent_detected\\|explicitModelPreserved\\|providerTrust\\|fallbackAllowed" pi/extensions/prompt-router.ts pi/lib/prompt-router/route-decision.ts pi/tests/prompt-router.test.ts \| head -80` | repo root | 0 | Confirmed targeted changed files and coverage symbols |

## Validation coverage

- Continuation capsule includes `isContinuation`, `dependencyOnPriorContext`, `lastEffectiveSize`, `unresolvedTask`, bounded metadata, and no raw prompt text.
- `context-continuation-hold` applies only for continuation downgrades, while unrelated lower-route prompts can downgrade.
- Cheap/brief downgrade intent bypass logs `downgrade_intent_detected` and `context-continuation-hold-bypassed`.
- Override trace reports scope/lifetime; route pin precedence over session override is covered.
- Explicit model selection is preserved in provider payload when marked explicit and recorded in trace metadata.
- Provider trust/fallback denial reports `cross-provider-denied`, `fallbackAllowed=false`, and denial reason without raw prompt text.

## Secret/raw-prompt hygiene

Evidence contains only synthetic prompt descriptions and field names. No `.env`, credentials, API keys, tokens, PEM/private keys, or real prompts were read or recorded.

## Blockers

None for Wave 2.
