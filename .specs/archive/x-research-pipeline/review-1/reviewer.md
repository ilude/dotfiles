---
reviewer: reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "automation-readiness"
  confidence: high
  evidence: "T3 says hook rejects staged plaintext via 'hook smoke test with a temporary staged file list', but no input contract is specified for scripts/git-hooks/pre-commit-x-private."
  required_fix: "Define exact hook interface, invocation command, expected exit codes, sample staged-path input, and how /do-it can test it without mutating real staged files."
- severity: high
  category: "completeness"
  confidence: high
  evidence: "T5 requires 'Use existing browser-tools/agent-browser patterns' and 'browser-agent transport', but no concrete API, module, CLI, fixture format, or dependency boundary is named."
  required_fix: "Specify the exact browser-agent integration surface or explicitly constrain MVP to a pure parser/adapter with mocked snapshots until a real transport contract exists."
- severity: medium
  category: "provider-contract"
  confidence: medium
  evidence: "T4 selects twitterapi.io, but endpoints, response shapes, pagination cursor semantics, rate-limit headers, and auth config schema are absent."
  required_fix: "Add minimal provider contract examples: config.local.json keys, endpoint/operation mapping, representative mocked responses, pagination fields, and typed error mapping rules."
- severity: medium
  category: "python-packaging"
  confidence: medium
  evidence: "T1/T2 place a Python package under pi/x_research, but the plan does not state packaging/import assumptions, pyproject changes, dependency additions, or whether pi/ is importable as a package."
  required_fix: "Specify required packaging changes and dependency policy, including pydantic version, CLI entrypoint registration, test discovery path, and import path expectations."
- severity: medium
  category: "validation"
  confidence: high
  evidence: "Success/V gates include live credential/browser smoke tests, but acceptance does not define skip behavior when credentials or authenticated browser state are unavailable."
  required_fix: "Define deterministic /do-it behavior: mocked tests are required; live smoke is optional with named env/config preconditions, skip message, and non-blocking/blocking status."
