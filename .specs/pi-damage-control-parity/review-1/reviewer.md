---
reviewer: completeness-explicitness-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "untestable-scope"
  confidence: high
  evidence: "Objective says Pi should recognize the same dangerous operations and produce same allow/ask/block outcomes, but T5 only requires representative cases and pattern compilation. Advanced Claude-only features may be deferred in T6 while success criteria still include 'major' sections, not full behavioral parity."
  required_fix: "Define exact MVP parity boundary as a checklist of supported Claude sections/features and required fixture coverage. Rename claims to supported-surface parity, or add explicit tasks/tests for AST, semantic git, sequence/taint, and post-tool behaviors."
- severity: high
  category: "ambiguous-canonical-source"
  confidence: high
  evidence: "T2 says load Claude patterns as canonical when present and keep pi/damage-control-rules.yaml as fallback/overrides, but does not define precedence, merge behavior, conflict resolution, or how Pi-specific protected SSH metadata interacts with Claude policy."
  required_fix: "Specify deterministic policy loading order and merge semantics: canonical path, fallback condition, override precedence, duplicate handling, action conflict resolution, and documented Pi-only rule treatment."
- severity: medium
  category: "hidden-dependency"
  confidence: medium
  evidence: "Inventory command imports yaml in plain python, while repo guidance says Python tooling uses uv. No dependency check ensures PyYAML is available outside uv, so /do-it may fail before generating required evidence."
  required_fix: "Use `uv run python` for YAML inventory or provide a dependency-free parser approach. Add a preflight pass criterion that the inventory command runs in the repo-supported Python environment."
- severity: medium
  category: "ambiguous-execution"
  confidence: high
  evidence: "T2/T3/T4 may be worked in parallel, but all modify shared rule/engine/handler interfaces. The plan says implementers must coordinate interfaces without defining the interface contract or sequencing, which /do-it cannot infer safely in isolated task execution."
  required_fix: "Add an explicit normalized policy interface/types contract before parallel work, or make T3/T4 depend on T2 with concrete exported functions and data shapes named in the plan."
- severity: medium
  category: "incomplete-acceptance"
  confidence: high
  evidence: "Pass criteria allow failures if 'clearly unrelated and documented' and archive preflight says evidence files must exist/no secrets, but no required filenames, log commands, or criteria for unrelated failures are defined."
  required_fix: "List required evidence filenames and exact commands producing them. Define what qualifies as unrelated failure and require preserving full exit status, command, timestamp, and rationale in evidence logs."
