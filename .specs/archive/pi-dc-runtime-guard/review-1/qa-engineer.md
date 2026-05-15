# QA Engineer Review

## Findings

1. **severity: high**  
   **evidence:** Objective #1 requires proving normal Pi agent-loop calls are blocked before execution, but T2 acceptance only requires invoking the registered `tool_call` handler and asserting `{ block: true }`. That still allows the exact false positive: helper/handler returns block while the runtime ignores it and executes anyway.  
   **required_fix:** Add a required integration-style test with a fake tool executor/sentinel side effect and assert the executor is not called when `beforeToolCall`/`tool_call` returns block.

2. **severity: high**  
   **evidence:** T2 says “If practical” for the only test that can prove non-execution. The plan’s core risk is destructive commands executing despite block decisions, so making non-execution optional undermines the acceptance criteria.  
   **required_fix:** Make non-execution evidence mandatory, or explicitly downgrade the plan goal to handler-only coverage and forbid claiming runtime enforcement is verified.

3. **severity: medium**  
   **evidence:** T2 AC1 requires `rm -rf`, `git reset --hard`, and `git clean -fd` be blocked “without executing shell commands,” but the verify command is just `pnpm test damage-control.test.ts`; there is no required spy/mock proving no shell/process execution occurred.  
   **required_fix:** Require tests to fail if `child_process`, tool executor, or shell adapter is invoked for dangerous cases; include a positive safe-command path that does invoke the fake executor.

4. **severity: medium**  
   **evidence:** T1/V1 rely on grep output from `C:/Projects/Personal/pi-mono` and “or equivalent current files,” which is not deterministic enough for `/do-it`; the pass condition can be satisfied by manual interpretation and may vary with local checkout state.  
   **required_fix:** Pin required source files/commit or add a small scripted assertion/test fixture that validates the hook ordering contract without depending on broad grep text.

5. **severity: medium**  
   **evidence:** The plan forbids destructive commands outside temp repos, but does not forbid live execution inside temp repos during automated tests. That leaves room for tests that actually run `rm -rf`/`git reset --hard` and later claim safety because the target was disposable.  
   **required_fix:** State that automated regression tests must treat destructive commands as inert input data; any live probe must be a separate manual/diagnostic step with disposable fixtures and explicit evidence boundaries.
