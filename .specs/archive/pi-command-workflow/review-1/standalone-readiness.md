# Standalone Readiness Review

## BLOCKERS

1. **blocker — Required preflight snapshot is not represented in the executable checklist.**
   - Required fix: Add a distinct checklist/task item before T0/T1, e.g. `P0: Capture preflight state`, with the command `git status --short && git diff -- pi/settings.json > .specs/pi-command-workflow/settings-preflight.diff`, evidence expectations, and a dependency that all file-editing tasks depend on P0. This is necessary because the plan explicitly says preflight must preserve unrelated `pi/settings.json` changes, but `/do-it` executing from the checklist could otherwise start edits without capturing that safety evidence.

2. **blocker — `F5: Archive preflight complete` lacks concrete pass/fail criteria.**
   - Required fix: Define F5 with explicit checks before archive, such as: all implementation/validation/manual/deployment gates are checked or marked not required with evidence; `## Execution Status` records final validation outputs; `git status --short` and targeted `git diff` have been reviewed for unrelated changes; `.specs/pi-command-workflow/settings-preflight.diff` was used to preserve or explicitly resolve pre-existing `pi/settings.json` changes; and the plan is not in `implemented-awaiting-manual-validation` state.
