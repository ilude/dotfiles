# product-manager review

```yaml
findings:
  - severity: high
    evidence: "Plan objective bundles two products: a reporting command plus forward instrumentation. Checklist adds T1/T2/G1/T4/manual validation around before_agent_start + appendEntry even though the user request could be satisfied by a command that reports available evidence and clearly labels limitations."
    required_fix: "Split scope: make `/skill-stats` historical/best-effort reporting the MVP; treat forward skill-load logging as a separate follow-up unless the user explicitly confirms it is required for this iteration."

  - severity: high
    evidence: "Execution flow has 6 waves/gates, 18+ checklist items, evidence manifests, archive preflight, redaction scan, optional manual session, and repo-wide `make check` for one local extension command. This creates process risk larger than implementation risk."
    required_fix: "Collapse to a minimal plan: inspect `/extension-stats`, implement command, add focused fixture/smoke test, run `pi/extensions` typecheck and relevant tests. Keep repo-wide validation optional or only if files outside Pi extension/test areas change."

  - severity: medium
    evidence: "Plan requires schema design artifact, strict precedence rules, multiple rolling windows, candidate/manual read tables, source/evidence tables, malformed-shape fixtures, path label policy, and Markdown escaping before any user-visible command exists."
    required_fix: "Reduce output contract for v1 to: skill name, count, evidence type, window. Add advanced tables/dedup heuristics only after real session examples prove they are needed."

  - severity: medium
    evidence: "G1 says proceed to Wave 2 after recording APIs, while earlier T1 says pause if no durable hook exists; the plan also states research already proved feasibility before discovery.txt is updated. This makes the manual gate ambiguous and easy to rubber-stamp."
    required_fix: "Replace G1 with a binary implementation condition: if a typed, repo-owned hook compiles in `pi/extensions`, implement logging; otherwise stop and report best-effort-only. Do not require a separate manual decision gate when the user already asked for the feature."

  - severity: low
    evidence: "The plan stores many generated evidence files under `.specs/.../evidence` and then adds redaction/archive machinery to manage risks created by that storage."
    required_fix: "Do not persist discovery output from private session logs by default. Use synthetic fixtures and summarize any local discovery in the final notes; only write redacted evidence for failed validations or decisions that must be resumed."
```
