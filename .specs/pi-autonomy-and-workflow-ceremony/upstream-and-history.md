# Installed mechanisms and targeted history

## Installed Pi 0.84.4: controller identity defect

Inspected package through `pi/node_modules/@earendil-works/pi-coding-agent/`, linked to installed 0.84.4. Read full `docs/extensions.md` and relevant examples/source.

- `dist/core/extensions/loader.js:209-233` constructs a new `api` object in `createExtensionAPI`.
- `loader.js:459-464` calls that constructor for each `initializeExtension` and passes `load.api` to its factory.
- `loader.js:499-513` shares runtime/event bus, but initializes each extension separately.
- Local `pi/lib/workflow-commands/plan-lifecycle.ts:83-110` keys a WeakMap by the supplied host object.
- `pi/extensions/workflow-commands.ts:2606` registers with its `pi` argument; `pi/extensions/goal.ts:1871` looks up with its different `pi` argument.

Conclusion: the installed loader contract and local callers establish a deterministic identity mismatch, not merely a possible extension load-order issue. No executable reproduction was run. Replacing the key alone would repair this symptom while leaving unnecessary lifecycle gating intact.

## Existing callable and continuation mechanisms

Pi already has:
- `registerTool`, `registerCommand`, shared ordinary functions, and `pi.events` for inter-extension communication.
- `sendUserMessage` for queued follow-up work, with `expandPromptTemplates: true` opting into extension-command dispatch and template/skill expansion.
- Session persistence using custom entries and tool-result details, normal compaction/session continuation, and command contexts for session-changing operations.
- Abort signals/process utilities for lifecycle cleanup. The local integration also already supplies file mutation queues for concurrent-write protection; those are not an upstream Pi API.

Source: `docs/extensions.md` ExtensionCommandContext, sendUserMessage, pi.events, State Management, Custom Tools; `dist/core/agent-session.js:822-855,1159-1189`.

Do not replace these with a new general workflow engine. Prefer shared command/tool operations for retained functionality. Session-changing actions may genuinely need queued command execution to avoid deadlock; that technical restriction does not require the operator to type the command again.

## Maintained-example discrepancy

`examples/extensions/reload-runtime.ts` queues a slash command with only `deliverAs: followUp`. Its matching docs example does the same. However `agent-session.js:1184` defaults `expandPromptTemplates` to false, and `prompt` checks that option before dispatching extension commands. The detailed docs explicitly describe the true option. Local `pi/skills/pi-extension/SKILL.md` State And Session rule 4 says to queue a follow-up command, without the dispatch option.

Conclusion: even a maintained example must be reconciled with installed implementation. Future focused check must exercise actual queued dispatch, not just assert that a string was sent. No runtime change or smoke run in this investigation.

## Objective context loss

`pi/lib/slash-command-echo.ts:31-44` writes TUI acknowledgement as a custom entry, which Pi documents as absent from model context. `goal.ts:510-539` exposes previews/summaries/hashes, not full inline objective; the first startup error precedes the persisted goal state and successful planning prompt. The original full goal remains in the operator transcript but the model sees substantially less after failure. This creates pressure to reconstruct missing intent. It does not excuse reconstruction instead of retrieving or asking.

Follow-up source inspection: `goal.ts:774-813,857-865` writes a preview-based plan scaffold for an inline objective, not a verbatim objective file. Raw foreground startup does persist `objectiveText` before requesting materialization; the failing plan-backed/unattended startup sets it in memory but throws before its session-state append. This distinction supports the failed-transition finding without claiming every goal loses its objective.

## Targeted Git history

| Commit | Observed change | Interpretation |
| --- | --- | --- |
| `93004e8f8ad4a9a3592779ae6b97b0e2cb9e4fa4` (2026-08-15) | Adds reviewed goal/plan lifecycle, controller WeakMap, canonical plan/durable task gate, recovery waits and archive-aware completion | Introduces the observed controller/gate coupling. Subject and code are evidence; original operator rationale is not inferred. |
| `497fad73953f487220c989df2596f71a75b3ceb8` (2026-09-04) | Removes automatic quality repair machinery; says passing evidence remains valid until inputs change; adjusts planning checks | Real simplification already occurred. Do not claim current runtime still performs the removed automatic repair. |
| `65aedd542c6635a6c090ad7d5955e51e0f621a6f` (2026-09-05) | Changes prior early representative checks into implementation-first final validation, shared one-repair allowance; propagates policy through agents, skills, tests, quality config | Attempts to stop churn by enforcing scheduling/counters rather than selecting useful evidence. It changes previous guidance, so a new solution must explicitly replace it rather than add conflicting flexibility prose. |
| `1dbc1a954af7dd09e59248fb60fa0387982d1b50` (2026-09-05) | Removes commit tokens and substantial redundant ceremony, preserves goal validation/completion state | Deletion is already an accepted local approach; remaining coupling was not removed by this change. |
| `0097a0d3` (2026-09-05) | Prefers evidence-based complete solutions | General simplification guidance exists but does not remove stronger procedural mandates. |

The old `pi/docs/pi-research-report.md` is historical observational research at a different baseline, not a current gate. Its hypothesis experiments require broad preregistration, blinded calibration, statistical power and immutable mandatory policy. Those requirements answer a causal model-comparison question; they are not prerequisites for fixing a demonstrated API mismatch or simplifying this operator's explicitly rejected workflow. Its verified-case locators are useful sample discovery, but its aggregate counts and model attributions will not be reused as current evidence.
