# T5 live acceptance: blocked, not passed

The parent stopped implementation of the model-backed acceptance dependency after Nora's isolated inert Herdr investigation established two API blockers:

- The initial exact pane swap required to put children above the unchanged caller focuses the child. The installed Herdr API has no `--no-focus` variant. This independently blocks the three-child no-focus contract.
- A second full-width child row cannot be established with the tested API: same-tab move reports `changed=false`, and a down split under one column produces the wrong geometry. This affects five or more children, independently of three-child acceptance.

Refer to the layout owner's evidence and existing `pi/profiles/default/tests/subagent-ux-live.test.ts` for command/geometry evidence. These findings are not model-provider failures. Spending model calls cannot resolve them.

No T5 model-backed or attached-client run was performed by this acceptance owner. No helper, alternate harness, new skip flag, credential copy, production plugin relink, or live-test edit was made. The existing REAL case still represents the historical single-child runtime test, not the required actual-parent reload-to-three acceptance. T5 remains incomplete.

## Bounded future attached-client procedure

Prerequisites: resolve the initial-swap focus blocker; finish T2/T4 integration and relevant non-model checks; implement the actual-parent acceptance in the existing opt-in test after file-owner handoff. The five-plus-child row blocker remains a separate T3 requirement. Obtain explicit operator coordination before attaching or changing any visible panes.

1. Use only a uniquely named isolated Herdr server with scratch config/plugin registry. Explicitly load `C:/Users/mglenn/.dotfiles/.worktrees/subagent-reload-and-live-ux/pi/profiles/default` as `PI_CODING_AGENT_DIR`. Never relink the lasting checkout's production plugin. Confirm the exact test socket and owned caller/tab/workspace IDs before mutations.
2. Perform one bounded, secret-free authentication/catalog preflight for `openai-codex/gpt-5.6-luna`. Use the existing shared `~/.codex` authentication fallback, without copying credentials or printing tokens. Stop immediately on failure.
3. Attach the operator only to the announced isolated session. Start one actual Pi parent in the caller pane using the task profile. Record actual loaded extension/runtime/layout/presentation source paths and implementation hashes, profile path, owner ID, caller ID/process and initial rectangle. Capture the native transcript or production registered renderer output. A direct `new SubagentRuntime()` test is not a replacement for this parent.
4. Let existing children settle and prove their processes/panes closed before invoking exactly one `/reload`. Record the new owner ID and re-evaluated implementation marker/source after startup; assert no old owner serves launches and no prior completion replays. Do not require `/clear`, a second reload, or restart.
5. Through the parent's registered native tools, launch exactly three concurrent bounded read-marker children, visible with Codex Luna at low effort. A deterministic parent provider may drive native tool calls; children remain model-backed. Capture each human name, separate role/assignment, resolved defaults, readable rendered launch/activity/result rows, and matching pane title. Use one 100-second launch/completion deadline, with no retries or silent headless fallback.
6. Coordinate a user switch to a different surviving tab during asynchronous launch and again during process settlement/closure. Record timestamped focus and actual rectangles while all three children are present: aligned upper row, equal columns within rounding tolerance, full caller-region width, original caller ID/process below with unchanged width. Observe physical keyboard/tab focus in the attached client, not merely final server focus. Capture screenshots/transcript and before/after focus IDs. Stop and record failure on focus theft.
7. Verify all three marker results are captured, processes settle, and ordinary finished panes close immediately. Verify the caller and unrelated tab remain intact and focused as selected by the operator. In `finally`, close only exact owned test resources, unlink only isolated plugins, stop only the named isolated server, and remove scratch files after evidence capture. Report unresolved resources explicitly; do not hide cleanup failure.

Run only when integration and the operator direct it, using the existing flags from the task profile:

```sh
PI_SUBAGENT_UX_LIVE=1 PI_SUBAGENT_UX_LIVE_REAL=1 pnpm test subagent-ux-live.test.ts
```

The command alone is not attached-client acceptance. Until the required test replacement exists and the operator observes the coordinated run, record automation and physical UX acceptance separately as pending.


## Operator-approved layout revision, 2026-09-09

The operator accepted children below the unchanged orchestrator, four per tab, with child five starting an owned overflow tab. This supersedes the earlier upper two-row blocker. The updated isolated production-adapter test passed with 1/3/4 children aligned below the caller, equal columns within one cell, full caller width, unrelated focus preserved, and overflow at children 5/9/17. The model-backed case connected its visible child but timed out after 100 seconds in `phase: starting` before a first turn; cleanup completed. Attached-client acceptance has not run.
