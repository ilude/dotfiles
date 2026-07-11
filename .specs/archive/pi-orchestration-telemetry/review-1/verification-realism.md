# Verification realism review

## Finding 1
- Category: automation-readiness
- Severity: high
- Severity rationale: The strongest success criterion cannot be reproduced by the documented automation, so the plan can pass without proving a real Pi delegation or report workflow.
- Exact evidence: The Automation Plan says `run one `subagent` single invocation + `/orchestration-stats 1` in a Pi session`, but gives no executable Pi startup command, input protocol, session fixture, or report-capture procedure. It also declares `Credentials: none`, while Success Criterion 1 requires `non-zero worker tokens` from a real subagent invocation. The only automated subagent tests use `vi.mock("node:child_process")` and `spawnMock` (`pi/tests/subagent.test.ts`), so they do not exercise a real child process or model response.
- Required fix: Define a runnable smoke harness with exact environment setup, Pi entrypoint, deterministic invocation, completion/settlement wait, slash-command invocation, and saved stdout/metrics evidence. Either provide an offline Pi-compatible child fixture that exercises production boundaries, or explicitly classify a credentialed live-model run as manual and add its evidence gate; do not claim credentials-free live validation.
- Confidence: high

## Finding 2
- Category: test-isolation
- Severity: high
- Severity rationale: The focused tests named in the plan can emit telemetry into the developer's real metrics stream, invalidating event counts and potentially leaking test data outside the test fixture.
- Exact evidence: The plan requires both `PI_METRICS_DIR` and `PI_OPERATOR_DIR` redirection (`Constraints`), but `pi/tests/subagent.test.ts` sets only `PI_OPERATOR_DIR` in `beforeEach` (lines 75-76), and `pi/tests/task-execution.test.ts` likewise sets only `PI_OPERATOR_DIR` (lines 53-54). Both files are explicitly used by T3/T4 validation. The metrics implementation uses `PI_METRICS_DIR` or the real agent logs directory (`pi/lib/metrics.ts:getMetricsDir`).
- Required fix: Add a shared fixture or per-file before/after hooks that set and restore both variables before exercising/importing production modules, and assert the scratch stream contains the expected events while the default metrics location is unchanged. Apply it to every focused test file that can emit telemetry, not only the newly added telemetry test.
- Confidence: high

## Finding 3
- Category: false-positive coverage
- Severity: medium
- Severity rationale: An acceptance criterion claims a structural invariant is tested, but the named test does not check that invariant; an invalid implementation could therefore pass the stated gate.
- Exact evidence: T2 Acceptance Criterion 3 says `lib has no default-export extension factory` and directs verification to `runtime-smoke.test.ts`. That test checks helper basename collisions and that every top-level file in `pi/extensions/` exports a default function; it never scans `pi/lib/` for default extension factories (`pi/tests/runtime-smoke.test.ts`, all tests in `describe("Pi runtime smoke: helper module placement")`).
- Required fix: Add an explicit assertion that top-level `pi/lib/*.ts` modules cannot contain the extension-factory default export shape, or change the acceptance criterion to the collision invariant that the test actually verifies. Keep the test tied to the exact production discovery rule rather than a filename-only proxy.
- Confidence: high

## Finding 4
- Category: archive-evidence
- Severity: high
- Severity rationale: The archive gate has no machine-checkable completion evidence and can be marked complete without demonstrating the required validations or smoke artifact.
- Exact evidence: Every Execution Checklist item, including F1-F5, starts with `Evidence: --`. F5 is only `Archive preflight complete` with no command or evidence path. The Validation Contract requires machine-readable per-phase fields and a scratch metrics path, but neither the Automation Plan nor the checklist defines who writes those records or an archive-preflight command that rejects missing evidence. The Archive Rule only says `/do-it` may archive after validations pass.
- Required fix: Specify an exact evidence writer and paths for command output, test summaries, repo status, and live scratch metrics/report. Define an executable archive-preflight check that verifies every acceptance criterion, required command result, and required evidence record, and require F1-F5 to reference those artifacts instead of `--`.
- Confidence: high

## Finding 5
- Category: production-path coverage
- Severity: medium
- Severity rationale: The reporting acceptance can be satisfied by testing aggregation/render helpers while never proving the registered slash command, metrics configuration, or Pi message delivery path.
- Exact evidence: T6 says the extension must render with `pi.sendMessage(..., {triggerTurn: false})`, but its only verification is `pnpm test orchestration-stats.test.ts`; the description does not require invoking the registered `/orchestration-stats` command through a Pi instance. The separate tool-search/runtime-smoke check only proves no model-callable tool was registered, not that the slash command is registered and dispatches the rendered report.
- Required fix: Add an acceptance test that loads `extensions/orchestration-stats.ts` into the existing mock Pi, invokes the registered `orchestration-stats` command with `1`, and asserts the exact `sendMessage` call plus the fixture-derived report. Retain the pure aggregation fixture tests as unit coverage, but do not use them as command-path evidence.
- Confidence: medium
