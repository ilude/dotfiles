---
reviewer: completeness-explicitness-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "ambiguous_configuration"
  confidence: high
  evidence: "T2 requires `dangerCtrl.claudePolicyPath` from \"env var or settings.json key\", but `grep dangerCtrl pi` finds no existing setting, and env vars cannot portably use dotted names. The plan does not specify the exact env var name, settings file path/schema, precedence, or how Pi extension code reads it."
  required_fix: "Define one exact configuration contract: env var name (e.g. `DANGER_CTRL_CLAUDE_POLICY_PATH`), settings key/file/API, precedence, default unset behavior, and tests for each source. Avoid dotted env var naming or explicitly state it is settings-only."
- severity: high
  category: "scope_contradiction"
  confidence: high
  evidence: "Objective says Phase B is required unless explicitly blocked. T3 says Phase B path policy support applies \"if implemented in this pass\". Success Criteria says Phase B sections match Claude oracle for covered fixtures. /do-it cannot know whether omitting Phase B is allowed or a failure."
  required_fix: "Make Phase B unambiguous: either required with concrete pass/fail tests for every listed section, or explicitly deferred with ledger requirements. If conditional, define the blocking conditions and required artifact proving the block."
- severity: medium
  category: "untestable_acceptance_criteria"
  confidence: high
  evidence: "T5 requires per-pattern outcome equivalence for every Claude `bashToolPatterns` entry and says patterns with no matching input go to coverage debt, but gives no deterministic method for generating a representative matching command from arbitrary regexes or deciding coverage-debt acceptability."
  required_fix: "Specify a deterministic fixture mapping format and minimum coverage threshold. Require each pattern to have an explicit fixture, or define which patterns may enter coverage debt and whether any coverage debt fails the gate."
- severity: medium
  category: "incomplete_safety_gate"
  confidence: medium
  evidence: "G2/G3 no-real-shell gates grep only `pi/tests/damage-control.test.ts`, while T5 allows parity oracle subprocess helpers in separate fixture/helper files. This leaves helper files free to import `child_process` and potentially execute non-oracle commands without being caught by the stated gate."
  required_fix: "Expand the gate to scan all relevant `pi/tests` helper files, with an explicit allowlist for the Claude oracle subprocess wrapper. Add assertions that the oracle subprocess receives synthetic JSON only and never executes shell commands."
- severity: medium
  category: "missing_existing_api_contract"
  confidence: medium
  evidence: "T4 mandates `ctx.ui.confirm` behavior and UI notification for Pi-only mode, but the plan does not identify the existing Pi tool-call registration or notification API. Existing grep shows `ctx.ui.confirm` in `damage-control-engine.ts`, but no `dangerCtrl` config and no notification contract is specified."
  required_fix: "Name the exact existing extension files/functions/APIs to use for confirmation, denial/no-UI handling, one-time startup warning, and UI notification. Add tests for no-UI behavior and one-time warning emission."
