# QA Engineer PRD Readiness Review

## Finding 1: Acceptance criteria use non-executable verification placeholders

- **Severity:** High
- **Evidence:** Several criteria specify non-command verification such as “unit test creates a 3-task dependency graph”, “mocked execution test”, “mock subagent returns result and token usage”, and “simulate corrupt task file and deleted task directory” without naming test files, test commands, fixtures, or expected assertion boundaries. AC 3 and AC 10 also duplicate batch dependency coverage with slightly different wording.
- **Required fix:** Convert each criterion to an exact command and target test file/name, e.g. `cd pi/tests && pnpm run test -- task-tools.test.ts -t "TaskCreateMany wires bidirectional dependencies"`, and consolidate duplicated `TaskCreateMany` dependency criteria into one authoritative criterion.

## Finding 2: Tool registration criterion can pass without proving runtime usability

- **Severity:** High
- **Evidence:** AC 2 says `cd pi/extensions && pnpm run typecheck` proves “tools are registered and usable.” Typechecking only proves static types; it does not prove tools are exported to Pi, discoverable by the runtime, schema-validated at call time, or callable through the tool interface.
- **Required fix:** Add a runtime/integration verification that enumerates registered tools and invokes each tool with valid and invalid inputs using a controlled temporary registry, asserting schema errors and successful outputs.

## Finding 3: Widget and subagent behavior is underspecified and may be untestable

- **Severity:** Medium
- **Evidence:** Functional requirements say “Add persistent or compact task visualization if supported by Pi UI APIs,” while AC 9 requires hidden/compact/full rendering. AC 5 requires “mocked subagent returns result and token usage,” but the PRD does not define the subagent mock contract, cancellation semantics, output truncation/summary rules, or token usage shape.
- **Required fix:** Define capability-gated widget behavior with a fallback renderer and exact expected output shapes for each mode. Define a mock subagent adapter interface/fixture, token stats schema, output retention/truncation rules, and what `TaskStop` must do when cancellation is unsupported.

## Finding 4: Persistence failure criteria lack durable evidence requirements

- **Severity:** High
- **Evidence:** AC 6 and AC 11 require warnings for write failure, corrupt files, and deleted directories, but do not specify where warnings are emitted, how tests capture them, whether in-memory mutations roll back, or what persisted state must look like after reload. This allows tests to pass by checking a warning string while data remains inconsistent.
- **Required fix:** Require assertions against both user-visible diagnostics and durable state: capture warning channel/tool result, reload registry from disk, assert no success result on failed persistence, assert directory recreation before successful write, and assert corrupt-file recovery preserves or quarantines state according to a specified policy.

## Finding 5: Resume/orphan and auto-clear reminders have no session fixtures or one-time proof

- **Severity:** Medium
- **Evidence:** AC 13 requires “simulated new session” and a “one-time notification,” while PR #15 requirements mention auto-clear cleared IDs and reminders. The PRD does not define session identity, staleness thresholds, reminder storage, or how to prove the same notification is not repeated.
- **Required fix:** Define session fixture fields, orphan detection threshold/condition, reminder persistence location, and tests that load the same stale registry twice: first load emits the notification/reminder, second load suppresses it until state changes.
