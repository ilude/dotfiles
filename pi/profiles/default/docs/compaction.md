# Unified compaction summaries

`extensions/compaction.ts` replaces summary generation through Pi's public
`session_before_compact` hook. It applies to manual, threshold, and overflow
compaction in the default orchestrator and its subagents. Child launchers explicitly
load it because they disable automatic extension discovery.

## Behavior

The extension combines the prepared history and turn prefix chronologically and
passes them, the previous summary, and any custom compaction focus to the public
`compact()` helper as one non-split summarization request. Native serialization,
summary formatting, model output budgeting, usage reporting, and file-list formatting
remain in Pi. The hook preserves `firstKeptEntryId` and `tokensBefore`; it never
includes the retained suffix in the material being replaced.

Additional summarization guidance preserves current intent, authorization, settled
decisions, evidence, pending questions, and the next action. Superseded intent must
not be reported as current. Task artifacts supplement the current request. This
borrows the useful handoff principles from legacy without its task registry,
soft threshold, abort/settlement machinery, continuation messages, or failure circuit.

Native preparation ignores file metadata on extension-generated checkpoints. The
extension therefore unions the latest checkpoint's read/modified lists into a copy
of the prepared file operations, preserving cumulative tracking across compactions
without mutating session entries or replaying historical messages.

## Ownership and failures

Pi still owns compaction triggers, cut-point selection, persistence, cancellation,
and continuation. The extension uses the current model and thinking level, resolved
registry authentication/headers/endpoint/environment, and configured retry settings
from the active profile and trusted project. It does not switch models or add retry
policy. The native helper uses fresh routing and disables cache writes for its
one-off summary request. No standing orchestrator instruction is added; only the
compaction request and resulting checkpoint change. Live cache effects are unmeasured.

A hook exception would otherwise be logged and fall through to native generation.
The extension instead reports a failed summary and returns cancellation, retaining
the existing context rather than silently reverting to split summaries. User
cancellation produces no extra error notification. There is no extension-owned
retry loop, resume prompt, or persistent state. Subsequent attempts remain subject
to Pi's normal lifecycle.

## Validation and activation

From `pi/profiles/default/`:

```sh
pnpm test compaction.test.ts subagent-launch-prompt.test.ts
pnpm run typecheck
```

Tests exercise the installed native compactor with a stubbed model stream, covering
single-request input inclusion/order, prior-summary-only split histories, file
metadata carry-forward, original retention coordinates, output usage, truncated
response rejection, hook options, failure, and cancellation. They do not establish
live-model summary quality or end-to-end provider behavior.

Use a fresh session or settled-only `/reload`. New child launches load the extension;
already-running children are not migrated. Legacy is unchanged.
