# QA Engineer Review

## Finding 1 — High: Evidence artifacts are named but commands do not capture them

**Evidence:** The Automation Plan promises logs such as `.specs/pi-tasks-control-plane/evidence/preflight.log`, `task-tests.log`, `typecheck.log`, `pi-tests.log`, and `repo-validation.log`, but the listed commands are plain terminal commands with no `mkdir -p`, redirection, or `tee` usage. The validation contract says evidence logs should be stored under the evidence directory.

**Risk:** `/do-it` can run commands successfully and mark checklist items complete without durable evidence, making archive/resume decisions unverifiable.

**Required fix:** For each validation command, specify an exact evidence-capturing wrapper, e.g. `mkdir -p .specs/pi-tasks-control-plane/evidence && { command; } 2>&1 | tee .specs/pi-tasks-control-plane/evidence/<name>.log; test ${PIPESTATUS[0]} -eq 0`, or define the `/do-it` evidence mechanism explicitly enough to guarantee those files exist.

## Finding 2 — High: Redaction acceptance can pass without proving persistence/rendering safety

**Evidence:** T2 makes registry integration optional (`maybe registry integration`) and only requires `task-security.test.ts`. T4 renderer acceptance does not require secret-bearing fixtures. T5 checks tool redaction, but there is no explicit end-to-end test that representative secrets are absent from serialized registry JSON and `/tasks`/renderer output.

**Risk:** The helper can pass while raw secrets still persist or display through an unredacted call path, violating the objective and validation contract.

**Required fix:** Add required integration acceptance criteria and commands covering registry persistence, renderer output, and tool output with representative secret strings. Make failure mean raw sentinel strings are found in serialized task data or command/tool output.

## Finding 3 — Medium: Wave 1 dependency model allows T2 to race the schema it may need to protect

**Evidence:** Wave 1 runs T1 and T2 in parallel, but T2 says integration call sites depend on “T1 shape is known.” V1 only says run T1/T2 criteria and foundation tests; it does not require the redaction helper to be wired into the final T1 mutation/persistence paths.

**Risk:** Both tasks can independently pass, then later waves build on a registry that persists new metadata/output fields without mandatory sanitization.

**Required fix:** Either make T2 depend on T1, or add a V1 blocking check that verifies the final evolved registry shape calls the redaction/rejection path for all persisted sensitive fields.

## Finding 4 — Medium: Final gates lack exact evidence mapping and can become checklist theater

**Evidence:** F1–F5 are listed as final checklist items, but only F1/F2 map loosely to validation commands. F3/F4 are “not required,” and F5 “Archive preflight complete” has no command or artifact definition. The preflight command is in the Automation Plan but has no matching early checklist item despite the checklist claiming every executable task, validation gate, and final completion gate has exactly one checkbox.

**Risk:** `/do-it` may mark final gates complete based on interpretation rather than objective evidence, or skip preflight while still satisfying the visible checklist.

**Required fix:** Add explicit pass/evidence lines for F1–F5, including the exact log files each gate must reference, and add a dedicated preflight checklist item if preflight is required for archive.

## Finding 5 — Low: Repo wrapper handling is internally inconsistent with current repo state

**Evidence:** The plan says `make check-pi-extensions` is optional “if available locally” and can be skipped as unavailable/duplicative. In this repo, `Makefile` defines `check-pi-extensions`, and it runs the authoritative pnpm typecheck and full Vitest suite.

**Risk:** A reviewer/executor could incorrectly record the wrapper as unavailable or duplicative and skip a repo-owned integration gate that currently exists.

**Required fix:** Since the target repo has the target, make `make check-pi-extensions` required for this plan unless it fails for a documented unrelated infrastructure reason.