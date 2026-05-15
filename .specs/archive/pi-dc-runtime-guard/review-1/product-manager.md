# Product Manager Review

## Finding 1
severity: high
evidence: The plan’s objective is to explain why `functions.bash` bypassed protection, but Wave 1–3 mostly test the existing Pi `tool_call` handler. `pi/extensions/damage-control.ts` already registers `pi.on("tool_call")` for `bash`, and `pi/tests/damage-control.test.ts` already has extensive evaluator coverage. If the bypass is outside Pi, these tests cannot close the user-visible gap.
required_fix: Reframe success around the actual exposed surface: either identify the owner of `functions.bash` and file/patch that layer, or explicitly reduce scope to a documentation-only boundary note. Do not present Pi hook tests as fixing API-tool bypass reliability.

## Finding 2
severity: medium
evidence: The task breakdown uses six handoffs across three waves plus five final gates for a likely 1–2 file outcome. The selected path even says “If Pi `tool_call` regression passes…do not patch,” which could make most of Wave 2/3 process overhead for a doc note.
required_fix: Collapse to a smaller sequence: (1) inspect runtime ownership, (2) add/adjust one focused regression only if missing, (3) document or patch. Replace separate V1/V2/V3 gates with one validation block tied to changed files.

## Finding 3
severity: medium
evidence: The plan relies on repeated ad hoc `grep` commands and manual source-path summaries as durable evidence. This invites inconsistent execution and makes the “runtime boundary” check hard to rerun. The automation table names “Command/wrapper” but provides no wrapper.
required_fix: Add a small script or just target that runs the boundary evidence checks and test/typecheck commands, or remove the automation claim. A single wrapper would be simpler than copying multiple grep pipelines through tasks and validation gates.

## Finding 4
severity: medium
evidence: T2 asks for a “local minimal mock” proving a blocked tool does not execute. A mock can assert callback order but cannot prove Pi’s real lower-level agent loop blocks execution; meanwhile T1 already proposes source inspection of `agent-loop.ts` for that behavior.
required_fix: Either require a real Pi runtime/agent-loop integration test owned by the package that executes tools, or narrow T2 to extension-contract tests only. Do not claim pre-execution runtime proof from a local mock.

## Finding 5
severity: low
evidence: The plan permits upstream edits in `C:/Projects/Personal/pi-mono` but the rollback, validation, and artifact scope are dotfiles-centered. This expands blast radius beyond “personal-local-repo” without a concrete ownership decision or separate upstream contribution plan.
required_fix: Make upstream changes a stop condition requiring a new plan, or add explicit upstream validation/rollback/status steps. For this plan, prefer documenting the out-of-repo harness boundary unless a local dotfiles regression demonstrates a fixable defect.
