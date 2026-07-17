# product-manager-review

```yaml
findings:
  - severity: high
    evidence: "Plan objective says Pi should match Claude for supported tool surfaces, but T2-T6 mix YAML command/path support with semantic git, AST bash, taint/sequence, and post-tool secret detection ledger. The checklist has 15 tasks/gates before closing the original rm -f regression."
    required_fix: "Split into staged MVP: first fix rm/rm -f ask plus catastrophic rm block and targeted tests; second load Claude bashToolPatterns; third handle path/write/read policies; leave AST/semantic/taint as explicit future work."
  - severity: high
    evidence: "T2 recommends loading claude/hooks/damage-control/patterns.yaml directly, but current Pi loader only searches .pi and pi/damage-control-rules.yaml and validates dangerous_commands/zero_access_paths/no_delete_paths. Claude file uses bashToolPatterns and extra fields such as ask/exfil."
    required_fix: "Do not make direct canonical loading the MVP unless a small normalization contract is specified. Define exact mapping for bashToolPatterns only, with fallback behavior and tests, before adding other Claude sections."
  - severity: medium
    evidence: "Plan says avoid duplicate-rule drift, yet also keeps pi/damage-control-rules.yaml as fallback/overrides without defining precedence, merge order, conflict handling, or how stale Pi rules interact with Claude rules."
    required_fix: "Pick one simple rule source for MVP. Prefer Claude bashToolPatterns when present, otherwise Pi fallback; do not merge overrides until a concrete precedence and conflict test matrix exists."
  - severity: medium
    evidence: "The plan proposes policy inventory tooling, evidence archives, three validation waves, unsupported ledgers, and broad Claude pytest runs before proving the smaller Pi engine can evaluate representative regex outcomes."
    required_fix: "Replace process-heavy gates with one minimal acceptance suite: load normalized Claude bash rules, assert rm -f asks, rm -rf / blocks, git push --force blocks, force-with-lease asks, and no dangerous command is executed."
  - severity: medium
    evidence: "T3/T4 include read-only, write-confirm, zero-access exclusions, no-delete, bash, pwsh, file tools, truncating operations, and SSH metadata behavior. Current DamageControlRules interface only models dangerous_commands, zero_access_paths, and no_delete_paths."
    required_fix: "Constrain first delivery to bash command parity and existing no-delete/zero-access behavior. Add new path-policy sections only after each has a single consumer, fixture, and user-visible outcome defined."
```
