# DevOps Automation Readiness Review

## Finding 1
- severity: high
- evidence: All Automation Plan commands start with `cd ../.dotfiles-prompt-router-control-plane`. If `/do-it` starts outside `C:/Users/mglenn/.dotfiles`, commands can target a nonexistent or wrong sibling path; no `git rev-parse --show-toplevel` or expected remote/path guard proves this is the isolated worktree.
- required_fix: Add a mandatory preflight that resolves an absolute `WORKTREE_ROOT`, verifies `git rev-parse --show-toplevel`, branch, worktree path, and original checkout path before any mutation.

## Finding 2
- severity: high
- evidence: Archive rule says move `this plan` to `.specs/archive/prompt-router-control-plane-v2/plan.md`, but durable evidence is explicitly in the worktree while review artifact is in the original checkout. The plan does not state which checkout owns the archive move or how review artifacts are copied.
- required_fix: Define a single archive source tree and include commands that archive plan, evidence, and review artifacts together without mutating the original checkout.

## Finding 3
- severity: medium
- evidence: Evidence paths are listed, but most commands do not include `tee`, stdout/stderr capture, exit-code capture, or environment metadata. A fresh reviewer cannot reproduce whether `pnpm install`, `make check`, or `uv` commands actually produced the named markdown/json artifacts.
- required_fix: Specify exact evidence-capture wrappers for every gate, including command, cwd, timestamp, tool versions, stdout/stderr summary, and exit status.

## Finding 4
- severity: medium
- evidence: Archive preflight scans `.specs/.../evidence pi/extensions pi/lib pi/tests pi/prompt-routing` only. It excludes the plan, review artifacts, docs, settings, generated manifests, and any manual-validation files outside evidence; it also uses broad grep with `|| true`, making scanner failure indistinguishable from no findings.
- required_fix: Expand the scan to all artifacts intended for archive and fail closed on scanner errors while separately allowing zero-match results.

## Finding 5
- severity: medium
- evidence: T8 mentions rollback manifest, migration, purge, and archive controls, but the plan has no concrete rollback validation command before archive. If telemetry migration or purge corrupts state, the Final Gates can pass without proving restoration from manifest.
- required_fix: Add a rollback drill that snapshots synthetic state, runs migration/purge/archive controls, restores from rollback manifest, and records verified file checksums.
