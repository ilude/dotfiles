---
reviewer: workflow-validation-reviewer
persona: behavioral concurrency and regression-test reviewer
status: complete
---

# Findings

- severity: high
  evidence: T5 AC1 says the exact workflow completes "without polling," but its only proof is that the test performs the narrative sequence and observes final states. No assertion spies on task `list`, `get`, or `output` calls, registry reads, timers, or coordinator polling. A test can pass while the implementation polls internally or while the test performs extra reads not described by the sequence.
  required_fix: Make the T5 test instrument the public tool and relevant read boundaries, assert the exact action sequence `batch`, manual completion, one `ready`, `execute_many`, one `await`, one `ready`, and final manual completion, and assert zero `list`, `get`, and `output` calls and no polling timers during the workflow.

- severity: high
  evidence: T3 AC3 and V2 require that aborting `wait` does not cancel workers, but they do not require the workers to be demonstrably active when the abort occurs or to settle successfully afterward. A fake runner that resolves immediately, or an abort issued before active promises are registered, could satisfy the no-controller/no-state-change assertions while never testing wait ownership. The plan also does not require a post-abort settlement assertion.
  required_fix: Define a controlled runner with unresolved per-task gates and abort spies. Start at least two tasks, begin `wait`, abort while both runner promises remain pending, assert wait returns/rejects promptly without runner aborts or state changes, then resolve both gates and assert each task reaches its normal terminal state exactly once with its artifact and telemetry intact.

- severity: high
  evidence: T3 says `startMany` starts tasks "synchronously" and that tests prove concurrent start, but no fake-runner barrier or exact assertion is specified. Merely using promise-controlled runners is insufficient if the test awaits each start result or uses already-resolved promises; a sequential implementation can then pass while the claimed bounded fan-out is absent.
  required_fix: Specify a runner test double that records entry and blocks each invocation on independent gates. Assert both runner-entry records exist before either gate resolves, assert the supplied tasks are started through the existing single-task eligibility gate, and assert each ID has one outcome and one terminal settlement. Include the same barrier in T5 rather than relying only on the coordinator unit test.

- severity: medium
  evidence: The plan requires classification of externally owned running tasks in `wait` (T3 description) and says `execute_many` returns actionable errors, but no acceptance criterion defines the result for a running task absent from the coordinator or tests that case. "Non-waitable" is untestable without specifying whether the result is pending, external, rejected, or another stable status, and the public layer could silently report completion or hang.
  required_fix: Define the per-task result contract for externally owned active executions and add a registry/tool test that creates an active record not present in the coordinator, calls `await` once, asserts immediate bounded output with that classification, and confirms no file polling or state mutation.

- severity: medium
  evidence: T4 AC1/T5 AC2 say compact results are bounded and artifact-backed, but provide no explicit size bound or complete field-level schema for `batch`, `execute_many`, and `await`. Existing tests elsewhere use concrete limits, yet these criteria could pass by checking only that output is not a transcript, while full records or large error strings still enter one new action's model-visible content.
  required_fix: State one measurable maximum for every new action's `content[0].text`, assert the exact allowed summary fields and absence of prompts, notes, timestamps, execution metadata, and worker output, and separately assert `details` plus the persisted artifact contains the complete record/output for every worker, including failure and mixed manual classifications.
