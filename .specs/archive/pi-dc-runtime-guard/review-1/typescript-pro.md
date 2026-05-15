## Finding 1
severity: high
evidence: The plan’s objective says to prove “normal Pi agent-loop tool calls are blocked before execution”, but T2 only targets `pi/tests/damage-control.test.ts` and allows “a local minimal mock”. The actual pre-execution boundary is in upstream `packages/agent/src/agent-loop.ts:571-582` and `packages/coding-agent/src/core/agent-session.ts:379-390`, not in dotfiles’ mocked `pi.on` registration.
required_fix: Require an integration test using upstream `AgentSession`/`AgentHarness` (or explicitly reclassify T2 as handler-only and stop claiming AgentSession/agent-loop coverage).

## Finding 2
severity: high
evidence: Upstream already has `packages/coding-agent/test/suite/agent-session-model-extension.test.ts:96` proving a generic extension `tool_call` block prevents tool execution. The plan still routes proof to dotfiles `pi/tests`, so a new test can pass while only proving `damage-control.ts` returns `{ block: true }`, not that Pi executes that decision before `bash`.
required_fix: Add a damage-control-specific upstream harness test with an executable sentinel tool that fails if called, or reuse the existing upstream test as evidence and narrow dotfiles tests to rule coverage.

## Finding 3
severity: medium
evidence: T3 permits patching `C:/Projects/Personal/pi-mono/packages/...`, but the validation contract only defines dotfiles commands (`pi/tests`, `pi/extensions`, `make check`). V2 says “run the narrow upstream test identified by T1/T3” without a package directory, package manager, script name, or expected test file.
required_fix: If upstream edits remain allowed, specify exact upstream install/test/typecheck commands and add them to final gates; otherwise prohibit upstream edits in this plan.

## Finding 4
severity: medium
evidence: T1’s `grep -R "functions.bash|developer tool|tool adapter"` is treated as ownership proof. Absence of those strings in `pi-mono` or dotfiles does not prove the API/developer tool surface is out-of-scope; it only proves those literal labels are absent.
required_fix: Replace the pass condition with evidence from Pi runtime entrypoints/tool registration, or document the limitation as “not found locally” rather than using it to select a no-code fix.

## Finding 5
severity: medium
evidence: The plan conflates package boundaries: `pi/tests` is a separate Vitest package with no dependency on upstream test helpers, while AgentSession/AgentHarness live in `C:/Projects/Personal/pi-mono/packages/...`. No task adds dependencies or explains how dotfiles tests can instantiate those upstream classes.
required_fix: Choose one boundary: keep dotfiles tests as pure extension tests, or create the runtime-boundary regression in upstream where `AgentSession`/`AgentHarness` and their fixtures are available.
