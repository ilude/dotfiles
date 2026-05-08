## Finding 1: Registered handler coverage starts too late

**severity:** high
**evidence:** T2/T3 and V1 can pass via `damage-control.test.ts` helper assertions while the real `pi.on("tool_call")` path remains broken. Registered extension smoke tests are deferred to T7 after health, regex, doctor, and permissions work.
**required_fix:** Move minimum registered-handler smoke coverage into Wave 1/V1: instantiate the extension with fake `pi.on`, run `session_start`, then replay real-shaped `bash` `tool_call` events for active status, fail-closed load failure, regex block, substring ask, and safe allow.

## Finding 2: `/doctor` acceptance can pass without registered command behavior

**severity:** medium
**evidence:** T4 allows “format/builds the doctor report” tests. That verifies formatter output, not that `/doctor --verbose` invokes damage-control health in the live `operator-status.ts` handler.
**required_fix:** Require a registered-command/handler smoke test for `/doctor --verbose` that loads `operator-status` as Pi does, invokes the real command path, and asserts active and failed damage-control sections. Keep formatter tests only as supporting coverage.

## Finding 3: Validation commands are ambiguous for new test files

**severity:** medium
**evidence:** T7 permits `pi/tests/damage-control-extension.test.ts`, but V3/V4 say `pnpm test damage-control.test.ts plus any new test file`, which is not an exact runnable command. A runner can accidentally execute only the original helper test file and miss extension smoke tests.
**required_fix:** Specify exact commands after choosing file layout. If a new file is added, use an explicit command such as `cd pi/tests && pnpm test damage-control.test.ts damage-control-extension.test.ts`, and require final evidence listing both files executed.

## Finding 4: Negative/near-miss matrix is under-specified

**severity:** high
**evidence:** T3/T6 require dangerous examples but only a few safe cases: Docker platform gating, wrapped safe command, and normal grep/list. Regex and secret/exfil rules can overmatch common harmless commands while still passing.
**required_fix:** Add an explicit negative matrix for each rule family: destructive near-misses, quoted strings/comments, filenames containing dangerous substrings, safe `git push` without force, safe reads outside secret paths, and local-only pipelines. Acceptance must assert allow/undefined for every negative case.

## Finding 5: Manual validation evidence is subjective and risky

**severity:** medium
**evidence:** Manual validation asks the user to try `docker compose down` “only if it will not affect running services” and accepts “user confirms” as evidence. That is hard to reproduce and may be skipped while automated helper tests pass.
**required_fix:** Replace with an objective scratch-project procedure: create temporary `.pi/damage-control-rules.yaml` with a harmless ask command like `echo DAMAGE_CONTROL_SMOKE`, restart Pi, capture status text, deny/confirm prompt behavior, and `/permissions` output. Require transcript or screenshots in execution evidence.
