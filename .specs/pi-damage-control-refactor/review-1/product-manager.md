---
reviewer: product-manager
status: complete
---

# Findings

- severity: high
  evidence: "Task Breakdown: T1/T2/T3/T4 plus validation gates; Alternatives says 'Small cleanup only' is 'insufficient alone' without showing failures remaining after parser fix + real-rules tests."
  required_fix: "Collapse execution to a minimum viable hardening path: keep the parser fix, add real-rules regression tests, make debug opt-in/redacted, and defer modularization/schema replacement until a failing test or maintenance pain justifies it. If keeping waves, add explicit go/no-go criteria after T1."

- severity: high
  evidence: "Wave 2 extracts rule loading/parsing into modules, then Wave 3 says 'Replace the hand-rolled YAML parser'; this creates planned throwaway parser architecture before the parser decision is final."
  required_fix: "Reorder or merge T2/T3: decide the policy loader first, then extract modules once. Do not spend a separate wave stabilizing module boundaries around code the next wave intentionally removes."

- severity: medium
  evidence: "T3: 'Prefer the `yaml` npm package'; existing repo file `pi/lib/yaml-mini.ts` already provides a TS-native YAML loader used by `pi/extensions/agent-team.ts`."
  required_fix: "Add an explicit reuse decision: test whether `parseYamlMini` plus schema/type guards covers `pi/damage-control-rules.yaml`. Only add `yaml` if a documented required YAML feature is unsupported; otherwise avoid a new dependency and lockfile churn."

- severity: medium
  evidence: "Acceptance for T2 uses subjective checks: '`damage-control.ts` contains Pi runtime wiring only', 'adapter remains readable', and `wc -l` without thresholds."
  required_fix: "Replace subjective modularization gates with concrete boundaries: named exported functions, import direction constraints, and maximum duplicated logic checks. Remove `wc -l` as a pass/fail signal unless exact thresholds are defined."

- severity: low
  evidence: "Manual live smoke requires restarting Pi and running several probes, while task scope is parser/debug/test refactor and automated Vitest covers the same deny rules."
  required_fix: "Make manual smoke a final optional confidence check unless runtime path/symlink detection shows repo changes are not what Pi loads. Add a small wrapper/test command for safe probes instead of embedding manual process in the critical completion path."
