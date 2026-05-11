---
reviewer: reviewer
status: complete
---

# Findings

- severity: high
  evidence: "Automation Plan: Vitest uses `pnpm run test -- prompt-router.test.ts`; Validation Contract requires only `pnpm run test`; tasks repeatedly say `targeted Vitest` without naming exact specs."
  required_fix: "List the exact required test files/filters for each wave and final gate. Ensure final validation includes the same targeted prompt-router/provider seam tests, not just broad `pnpm run test` where regressions could be skipped by discovery/config changes."

- severity: high
  evidence: "T1 Acceptance: `no primary user-facing legacy labels outside adapter/tests/docs`; V1 says `duplicate vocabulary grep` but no grep command, allowlist, or failure rule is provided."
  required_fix: "Define an explicit legacy-label audit command with allowed paths/fields and fail criteria, e.g. grep for `Haiku|Sonnet|Opus` excluding only the named adapter, compatibility tests, and docs. Require evidence of zero unauthorized matches."

- severity: medium
  evidence: "T2 requires `artifact/hash-sidecar inventory for all supported modes`; V1 requires `artifact inventory/hash checks`; Automation Plan has no command for producing/verifying these inventories."
  required_fix: "Add concrete commands, expected artifact paths, and pass/fail semantics for classifier artifact inventory and hash-sidecar verification, including missing/mismatch fixtures."

- severity: medium
  evidence: "Manual validation step 1 references `.specs/prompt-router-control-plane-v2/evidence/manual-validation-template.md`, but no task creates it or specifies its contents."
  required_fix: "Add a task to create the manual-validation template with the exact synthetic prompts and expected sanitized fields before manual validation can run."

- severity: medium
  evidence: "Archive preflight command greps `.specs/.../evidence pi/extensions pi/lib pi/tests pi/prompt-routing` for `https?://|C:/Users|/home/...` and writes to archive-preflight evidence."
  required_fix: "Separate privacy evidence scanning from source scanning or add an explicit allowlist. As written, legitimate source/docs URLs or paths in code can cause noisy findings with no fail rule, while `|| true` guarantees the command exits successfully."
