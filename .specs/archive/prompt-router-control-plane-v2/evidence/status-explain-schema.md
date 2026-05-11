# Wave 2 status/explain schema evidence

Timestamp: 2026-05-08
CWD: `C:/Users/mglenn/.dotfiles-prompt-router-control-plane`
Branch: `plan/prompt-router-control-plane`

## Sanitization

This evidence records only sanitized command metadata and test outcomes. No raw prompts, prompt excerpts, endpoints, account IDs, tokens, credentials, private paths, or screenshots are included.

## Validation 1: Typecheck

Command:

```bash
cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck
```

CWD: `C:/Users/mglenn/.dotfiles-prompt-router-control-plane`

Summary: `pnpm install` reported the lockfile was already up to date, then `tsc --noEmit` completed successfully with no errors.

Exit status: `0`

## Validation 2: Targeted prompt-router Vitest

Command:

```bash
cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts
```

CWD: `C:/Users/mglenn/.dotfiles-prompt-router-control-plane`

Summary: the Vitest wrapper forwarded the filter broadly and ran the Pi test suite; `tests/prompt-router.test.ts` passed, and the full invoked run completed successfully.

Exit status: `0`

## Wave 2 coverage summary

Wave 2 validation covered resolver, status/explain, and privacy schema behavior tied to the immutable `RouteDecision`/`decisionTrace` path. The passing prompt-router suite includes the status/explain command tests and same-turn decision application coverage without raw prompt exposure by default.
