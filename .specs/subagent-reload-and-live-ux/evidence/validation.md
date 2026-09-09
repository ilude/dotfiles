# Final bounded validation

Date: 2026-09-08
Profile: task worktree default profile, with sanitized task environment. No credential copies were made. Shared `.codex` catalog fallback was present; authentication was not a blocker.

## Integrated command

```sh
for key in ${!PI_SUBAGENT_@} ${!HERDR_@}; do unset "$key"; done
export PI_CODING_AGENT_DIR="$PWD/pi/profiles/default"
cd pi/profiles/default
pnpm test subagent herdr-launch.test.ts herdr-background-focus.test.ts session-launch.test.ts tool-visibility.test.ts herdr-ui-prompt-state.test.ts usage-context-tps.test.ts profile-reload-integration.test.ts
```

Result: **118 passed, 6 skipped, 0 failed; 19 files passed and 4 files skipped.**

## Other checks

```sh
pnpm run typecheck
```

Failed on the existing baseline error only: `tests/commit-whitespace.test.ts:5:40`, TS7016, missing declaration for `commands/commit/trim-trailing-whitespace.mjs`. The concurrent task-layout type error is separate task work, not this baseline error.

```sh
pnpm run check:runtime
```

Passed: **335 rules, 8 schemas**.

```sh
git diff --check
```

Passed.

## Acceptance boundary

No model-backed or attached-client T5 run occurred. T3/T5 remain blocked and unfinished: the initial swap focuses the child, and the required 5+ child second row has incorrect physical geometry. the isolated diagnostic probe intentionally EXPECTS the initial focus theft and is diagnostic evidence, not acceptance. The integrated checks do not upgrade an already-running operator session; the first transition from the earlier lifecycle was not live-tested. No unsupported active-child migration was built. No task-owned test resource remains.


## Operator-approved layout revision, 2026-09-09

The operator accepted children below the unchanged orchestrator, four per tab, with child five starting an owned overflow tab. This supersedes the earlier upper two-row blocker. The updated isolated production-adapter test passed with 1/3/4 children aligned below the caller, equal columns within one cell, full caller width, unrelated focus preserved, and overflow at children 5/9/17. The model-backed case connected its visible child but timed out after 100 seconds in `phase: starting` before a first turn; cleanup completed. Attached-client acceptance has not run.


## Herdr 0.9.0 verification, 2026-09-09

The installed binary was verified as `herdr 0.9.0`. The revised isolated production-layout acceptance passed again: the caller remained unchanged above one full-width child region; 1/3/4 child columns were equal; child five used an owned overflow tab; and unrelated focus remained unchanged. The model-backed visible-child check was repeated because the external runtime changed, but again timed out after 100 seconds with transport connected, `readyCount: 1`, `phase: starting`, and zero turns. Herdr 0.9.0 therefore validates the layout workaround but does not resolve the separate child-startup blocker. Cleanup completed.
