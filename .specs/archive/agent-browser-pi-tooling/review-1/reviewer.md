---
reviewer: reviewer
status: complete
---

# Findings

- severity: high
  evidence: "T2: Add idempotent agent-browser install support" says Windows should use "existing global Node package convention (likely pnpm where appropriate)" and macOS should use "Homebrew if preferred... and/or document npm/pnpm fallback."
  required_fix: Replace tentative install choices with exact per-platform commands/files after T1, or make T1 explicitly update the plan before implementation. `/do-it` cannot safely choose package-manager policy from "likely" and "and/or" without hidden judgment.

- severity: high
  evidence: Automation Plan: "./install.ps1 -NoElevate or targeted new helper command documented by implementation"; T2 files include optional `install`, `wsl/packages`, README notes.
  required_fix: Specify the exact install entrypoint to change and the exact verification command before T2 starts, or add a blocking plan-rewrite step after T1. Avoid leaving the implementation to invent a helper and validation path.

- severity: medium
  evidence: T3 verification uses `scripts/agent-browser-brave --profile pi --open https://example.com && agent-browser get title`, but the wrapper is allowed to use npx/fallback install paths and may not put `agent-browser` on PATH.
  required_fix: Define one canonical invocation contract: either the wrapper proxies all `agent-browser` operations, or install guarantees `agent-browser` on PATH. Update every verify command to use that same contract.

- severity: medium
  evidence: Validation Contract says manual validation is required for authenticated real-profile workflows and "must not archive" if not confirmed, while Success Criteria #3 says real profile verification is "optional manual test with user approval."
  required_fix: Resolve the contradiction. State whether real-profile validation is required for this plan. If optional, archive can proceed without it; if required, add exact approval prompt text, command, expected evidence, and status handling.

- severity: medium
  evidence: T3 requires cleanup of "owned PID/session state" but no state-file path, format, stale-state behavior, or cross-platform process identity check is specified.
  required_fix: Define the local state location, recorded fields, cleanup algorithm, and stale PID safety check. Require tests or smoke checks proving cleanup does not target unrelated Brave processes.
