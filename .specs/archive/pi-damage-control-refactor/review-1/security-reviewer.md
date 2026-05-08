---
reviewer: security-reviewer
status: complete
---

# Findings

- severity: high
  evidence: "Manual validation says run `cat .env >/dev/null` and `echo 'DROP TABLE sentinel'` in a restarted Pi session; Handoff says prior live test executed `bash: cat .env` and exposed secrets. The plan does not require creating a synthetic `.env` or disposable test repo before live probes."
  required_fix: "Require all live smoke tests to run in a disposable temp repo with a fake `.env` containing sentinel-only data, or explicitly verify the real repo has no secret-bearing `.env` before any probe. Never use production secret files as test targets."

- severity: high
  evidence: "Automation Plan and V1 require inspecting/removing `.pi/damage-control-debug.log` and `~/.pi/agent/damage-control-debug.log`, but there is no required preflight to capture prior log existence/permissions or prevent appending new redacted tests to old unredacted incident logs."
  required_fix: "Add a preflight gate to inventory existing debug logs without printing contents, move them to a timestamped ignored quarantine path, and create fresh logs with restrictive permissions for validation. Secret-scan any retained evidence before archiving or sharing."

- severity: medium
  evidence: "T3 accepts adding a real YAML parser dependency and validates with `pnpm install --frozen-lockfile`, but the plan has no supply-chain gate for the new package version, transitive dependencies, or lockfile diff review."
  required_fix: "Add a dependency review step before T3 completion: inspect `pi/extensions/pnpm-lock.yaml` diff, pin the minimal parser dependency, run `pnpm audit` or document why unavailable, and reject unexpected transitive dependency expansion."

- severity: medium
  evidence: "Rollback command is `git restore -- pi/extensions pi/tests pi/damage-control-rules.yaml pi/README.md`, while T4 may edit `pi/extensions/README.md` or `pi/tests/README.md`; T3 may alter lockfiles. This rollback can leave partial docs/lockfile state behind."
  required_fix: "Replace rollback with a generated changed-file manifest from `git status --short` and targeted restore of every changed source/test/doc/lockfile, explicitly including `pi/extensions/pnpm-lock.yaml`, `pi/extensions/README.md`, and optional test docs."

- severity: medium
  evidence: "Archive preflight only says `git status --short` and generated logs must not be committed. It does not require scanning diffs for leaked `.env` contents, tokens, private keys, or debug evidence before archive/commit."
  required_fix: "Add a mandatory secret/evidence redaction gate before F5: scan `git diff --cached` and unstaged diffs for token/key patterns and accidental `.env` content, verify no debug logs are tracked, and block archive until findings are removed."
