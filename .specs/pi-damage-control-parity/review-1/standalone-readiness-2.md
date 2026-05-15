---
reviewer: standalone-readiness-2
status: complete
finding_count: 2
---

# Findings

- severity: critical
  category: "blocker: exit-code capture commands"
  confidence: high
  evidence: "Validation Contract 'Final validation with captured exit codes' uses brace groups with `cd pi/tests && ...`, then later `cd pi/extensions` and `cd claude/hooks/damage-control` in the same shell. Successful `cd` persists across groups, so subsequent relative paths resolve from `pi/tests` and can fail in a fresh /do-it run."
  required_fix: "Change each captured validation block to run in a subshell, e.g. `(cd pi/tests && pnpm install --frozen-lockfile && pnpm test damage-control.test.ts)`, `(cd pi/extensions && ...)`, `(cd claude/hooks/damage-control && ...)`, so cwd does not leak between commands."
- severity: critical
  category: "blocker: F5 manifest fail criteria"
  confidence: high
  evidence: "Evidence manifest template records missing `parity-diff.md`/unknown counts but only exits nonzero for failed exit-code files. The line `if failed or not parity.exists() or 'unknown' in text[:0]: pass` is a no-op and `text[:0]` is always empty, conflicting with F5 criteria that missing parity or unknown fixture/mismatch counts must fail."
  required_fix: "Make the manifest script set `failed = True` when `parity-diff.md` is missing, `fixture_count` is unknown, or `mismatch_count` is unknown/nonzero for implemented phases, and exit 1 when any F5-required manifest field is missing or invalid."
