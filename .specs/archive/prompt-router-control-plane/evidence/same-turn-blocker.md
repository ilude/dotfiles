# Same-Turn Routing Blocker

- Date: 2026-05-07
- Classification: blocking feasibility failure
- Harness: `pi/tests/prompt-router.test.ts` / `T0: same-turn routing feasibility`
- Synthetic prompt: `synthetic prompt requiring broader reasoning`

## Evidence

The input hook in `pi/extensions/prompt-router.ts` starts `classifyAndRoute(...)` without awaiting it, then immediately returns `{ action: "continue" }`.

The T0 harness uses a mocked classifier subprocess and generation dispatch observer (`setModel` / `setThinkingLevel`). Observed order:

```text
classifier-start
hook-returned-continue
classifier-finish
setModel
setThinkingLevel
```

This proves the model/thinking change can occur only after the input hook has already continued. The plan requires same-turn generation provider/model/thinking to equal the applied route before generation dispatch; current architecture cannot prove that guarantee at this seam.

## Validation command

```bash
cd pi/extensions && pnpm install --frozen-lockfile
cd ../tests && pnpm install --frozen-lockfile
pnpm run test -- prompt-router.test.ts
```

Result: `prompt-router.test.ts` passed, including the T0 harness. Vitest also executed the broader suite due existing argument handling and exposed an unrelated pre-existing failure in `tests/workflow-dispatch.test.ts` (`/summarize` expected "3 bullets or fewer").

## Decision

Stop this V1 control-plane plan before Wave 1 behavior changes. Downstream route vocabulary/resolver/context/eval work remains unchecked and unstarted.
