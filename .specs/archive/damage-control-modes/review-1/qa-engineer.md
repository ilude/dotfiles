# QA Review: Damage-Control Modes Plan

## Finding 1
- **severity:** high
- **evidence:** T2 acceptance criteria validate `evaluateShellMode(...)` directly, and T4 only requires “mode tests cover shell blocking.” The plan does not require a registered `bash`/`pwsh` tool-call handler test proving whitelist/noshell blocks occur through the real `tool_call` path after command-mode state is changed.
- **required_fix:** Add handler-level tests that register the extension, invoke `/dc mode whitelist` and `/dc mode noshell`, then dispatch real mocked `bash` and `pwsh` tool calls and assert the registered handlers block as expected.

## Finding 2
- **severity:** high
- **evidence:** T4 AC2 allows “a handler-level or pure evaluator test” for `pwsh` dangerous command rules. A pure evaluator test can pass while `pwsh` command registration/event wiring, tool name propagation, or handler ordering remains broken.
- **required_fix:** Require handler-level `pwsh` tests for `Invoke-Expression`/`iex` through the registered tool-call handler, including evidence that the block reason comes from dangerous-command rules and occurs before `no_delete_paths` checks.

## Finding 3
- **severity:** medium
- **evidence:** File-tool protection acceptance only says existing file zero-access/no-delete tests still pass and “file tool handler depends on mode” does not happen. It does not prove file protections remain active after switching to whitelist/noshell in the same extension instance.
- **required_fix:** Add integration tests that switch modes to `whitelist` and `noshell`, then invoke registered file tool handlers against zero-access and `no_delete_paths` paths and assert protections still block.

## Finding 4
- **severity:** medium
- **evidence:** T3 AC3 says a later bash handler prompt test “proves prior whitelist state did not leak.” That is indirect and order-sensitive; it may pass because tests create isolated mocks, skip command mutation, or never assert initial status.
- **required_fix:** Add an explicit no-leak test: register one extension instance, set whitelist, register a fresh extension instance/context, call `/damage-control status`, and assert mode is `default` before any shell handler tests run.

## Finding 5
- **severity:** medium
- **evidence:** Whitelist criteria check only `git status --short`, `Get-Location`, `echo hi`, and `Get-Location; Get-ChildItem`. The plan says compound shell operators are blocked, but does not require tests for bash `&&`, `||`, `|`, command substitution/backticks, redirection, or PowerShell pipeline/background/operator variants.
- **required_fix:** Define the operator set in the plan and require tests for representative bash and PowerShell compound/operator forms through the mode evaluator and at least one registered handler path.
