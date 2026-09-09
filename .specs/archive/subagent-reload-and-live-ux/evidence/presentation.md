# T4 transcript implementation evidence

Date: 2026-09-08. Worktree: `C:/Users/mglenn/.dotfiles/.worktrees/subagent-reload-and-live-ux`. Test profile: this worktree's `pi/profiles/default`.

## Implementation

Recovered the prior partial edits in `lib/subagents/presentation.ts` and `status.ts`, preserving their resolved metadata and timing work. Removed the unsupported `context.lastResult` assumption and missing `ExtensionContext` reference. The call renderer retains its `Text` component and resolved record in shared `context.state`; result rendering updates that same component within the existing render pass. It does not call `context.invalidate()`, which could schedule a render loop; invalidation is only appropriate for asynchronous changes outside rendering. Result `lastComponent` is never mistaken for the call component.

- Active launch headers show allocated name, separate role/assignment, resolved model/effort/surface and start/elapsed timing. Control headers retain both action and allocated identity.
- Expanded assignment text has no presentation length cap. Output remains bounded to 24,000 characters and uses actual Pi Markdown components. Expanded errors retain bounded multiline detail.
- Finished duration uses the assignment finish timestamp, with `updatedAt` as the old-record fallback; missing terminal timing is unknown rather than an advancing clock.
- Background, detached, question, user-intervention, cleanup, and terminal views are distinct. Settled widget rows no longer claim the child continues merely because their historical wait state was background/detached.
- Root/coordinator automatic outcomes use the same record renderer and include timing, results and cleanup errors. `presentationDetails` carries the existing record fields needed by that renderer.
- Existing `child-surface.ts` and `extensions/subagent-child.ts` already consume these helpers; no net changes were necessary there. No runtime APIs or progress-triggered messages were added. Runtime and root extension edits remain owned by the runtime specialist.

## Checks and boundaries

Commands sanitized every inherited `PI_SUBAGENT_*` variable and removed `HERDR_ENV` / `HERDR_SOCKET_PATH`, then explicitly set `PI_CODING_AGENT_DIR` to the task profile. Dependency links were provided by the parent. No credentials were copied, models invoked, or production panes mutated.

```sh
for key in ${!PI_SUBAGENT_@}; do unset "$key"; done
unset HERDR_ENV HERDR_SOCKET_PATH
export PI_CODING_AGENT_DIR="$PWD/pi/profiles/default"
cd pi/profiles/default
pnpm test subagent-presentation.test.ts subagent-status.test.ts
pnpm run typecheck
```

- Presentation + status: **21/21 passed**. After the cleanup/intervention rendering assertions and the parent's render-invalidation correction, the affected presentation file was rerun: **17/17 passed**. The shared-state/header-reuse test asserts that rendering does not invoke `invalidate`. No further typecheck was run; integrated validation owns that check after layout fixes.
- The registered root extension tool executes real `SubagentRuntime` launches against the existing inert RPC process fixture. Tests render the registered call/result components at 36 and 120 columns, observe the retained header during live tool activity, detach without cancellation, inspect/cancel by allocated name, and render background, user-input, complete and provider-rejection results. Resolved model/effort/surface defaults and full assignment text beyond the old cap are asserted. Busy-parent progress sends no model messages.
- Coordinator registration is exercised through the real authenticated loopback transport with a bounded parent response fixture. Its registered tools and actual components render a factual question and name-based inspection. This fixture is not a model-backed coordinator acceptance claim.
- Component cases additionally cover all terminal outcomes, result plus cleanup error, bounded Markdown, old records, automatic outcome rendering, frozen duration and shared-state header reuse. `tests/pi-web-api.ts` now exposes Pi's real Markdown theme helper; presentation tests initialize the real theme rather than replacing Markdown components with stubs.
- Typecheck reached two errors outside T4 ownership: `lib/subagents/layout.ts:238` (`left` not assignable to `SplitDirection`) and `tests/commit-whitespace.test.ts:5` (missing declaration for `trim-trailing-whitespace.mjs`). No T4 diagnostic was reported. These were not edited by this leaf.
- `git diff --check` passed before evidence publication.

The origin parent supplied its complete installed extensions/TUI documentation findings, including the renderer context contract. This leaf did not bypass the denied installed-documentation path.

This is registered-tool/component evidence, not an attached-client reload, keyboard, focus or geometry acceptance result. T5 remains pending. No archive, commit, merge, push or deployment performed.
