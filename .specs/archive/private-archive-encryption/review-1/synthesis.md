---
date: 2026-05-11
status: synthesis-complete
---

# Review: Generalized Private Archive Encryption

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness & automation-readiness reviewer | Mandatory standard reviewer | Assume fresh `/do-it` session has no hidden context | `.specs/private-archive-encryption/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Archive/secret red-team reviewer | Mandatory standard reviewer | Assume helper mistakes leak or destroy private data | `.specs/private-archive-encryption/review-1/security-reviewer.md` |
| product-manager | product-manager | Scope/simplicity reviewer | Mandatory standard reviewer | Assume bespoke conflict resolver overbuilds v1 | `.specs/private-archive-encryption/review-1/product-manager.md` |
| python-pro | python-pro | Python CLI/archive correctness reviewer | Python helper scripts, tar/age subprocesses, tests | Assume brittle subprocess/temp-dir code leaks or corrupts data | `.specs/private-archive-encryption/review-1/python-pro.md` |
| qa-engineer | qa-engineer | Verification realism and fixture-safety reviewer | Plan relies on pytest fixtures and Git conflict simulation | Assume tests mock the risky parts or skip silently | `.specs/private-archive-encryption/review-1/qa-engineer.md` |
| devops-pro | devops-pro | Git/hook/operational safety reviewer | Git attributes, hooks, conflict stages, MSYS2 path behavior | Assume hooks are missing and Git state is messy | `.specs/private-archive-encryption/review-1/devops-pro.md` |

## Standard Reviewer Findings
### reviewer
- Missing `## Execution Status` section required by the plan integrity contract.
- Uses lead/pseudo agents that a fresh `/do-it` run cannot route reliably.
- Scanner verification is not an exact command.
- Conflict resolver wording implies hidden manual/user-resolved directory despite manual validation being not required.

### security-reviewer
- `private.tar.age` lacks explicit `.gitattributes` binary/no-diff/no-filter validation.
- Forced decrypt can destroy newer `private/` content without backup.
- Temp plaintext and `--keep-temp` could leak under the repo.
- Scanner ignores common private archive/temp variants.
- `age` skips could falsely pass completion.

### product-manager
- Automated conflict resolver may be overbuilt for v1, but user explicitly requested conflict resolution.
- No inventory/taxonomy task defines what data moves under `private/`.
- Existing x-private scripts may become conflicting parallel workflows.
- Missing status/preflight command for operator confidence.
- Plan must explicitly decide whether `private.tar.age` is tracked.

## Additional Expert Findings
### python-pro
- Unsafe tar extraction is not addressed: absolute paths, `..`, symlinks, hardlinks.
- Subprocess/partial-output failure handling and atomic replacement are not specified.
- External `tar` semantics are underspecified for Windows Git Bash/MSYS2.
- Cleanup requirements do not cover all failure paths.
- `py_compile` should use `uv run python`.

### qa-engineer
- `age` availability must be hard-required for completion; skips cannot pass.
- Conflict resolver needs a real temp Git repo merge conflict, not mocked parsing.
- Fixture isolation must control `cwd`, `HOME`, and `XDG_CONFIG_HOME`.
- Malicious tar tests are required.
- Hook/scanner validation should use actual staged Git output.

### devops-pro
- `git check-ignore` with multiple paths can pass when only one path is ignored.
- Hook installation/executability is not verified.
- Conflict stage parsing must be NUL-safe/path-safe.
- Attributes must preserve conflict stages for resolver.
- Rollback/atomicity for archive replacement is underspecified.

## Suggested Additional Reviewers
- python-pro -- relevant because helpers are Python CLIs manipulating tar archives and subprocesses.
- qa-engineer -- relevant because the plan's safety claims depend on fixture tests proving no real secrets are touched.
- devops-pro -- relevant because Git hooks, attributes, merge stages, and MSYS2 behavior are central risks.

## Bugs (must fix before execution)
1. Add `## Execution Status`; otherwise `/do-it` has no required place to record blocked/failed validation.
2. Replace lead/pseudo agent names with actual worker agents and persona notes.
3. Make `age` availability a hard prerequisite and disallow skipped age-dependent tests for completion.
4. Replace multi-path `git check-ignore` assertions with per-path checks.
5. Require `.gitattributes` validation: `private.tar.age binary -diff -merge`, no filter/textconv.
6. Require safe tar extraction validation and malicious archive tests.
7. Require atomic writes/backups/refusal semantics for archive and plaintext overwrite paths.
8. Require real Git conflict fixture with stages 1/2/3 and path-safe stage extraction.
9. Require hook installer validation in a temp repo.
10. Clarify conflict resolver has fixture-only automation in this plan; real private-data conflict resolution requires explicit future invocation.

## Hardening
1. Add an inventory/taxonomy task for candidate private paths and explicit in/out rules.
2. Add `scripts/private-archive-status` or equivalent `--check` mode.
3. Make x-private compatibility/deprecation non-optional.
4. Require temp plaintext outside repo with restrictive permissions and no content-bearing manifests.
5. Expand scanner blocklist for common archive/temp variants.
6. State that `private.tar.age` is intentionally tracked by default and document retention tradeoff.
7. Use `uv run python -m py_compile` for helper syntax validation.

## Simpler Alternatives / Scope Reductions
1. Product review recommended deferring automated conflict resolution to a manual conflict playbook. Dismissed as a full replacement because the user explicitly requested a conflict resolution system; applied as hardening by requiring fixture automation and real-data explicit invocation boundaries.
2. Per-file encryption remains simpler for frequent collaborative edits, but user selected archive mode.

## Automation Readiness
- Agent-runnable operational steps: not ready until exact scanner/check-ignore/hook/status/test commands are added.
- Credential/auth flow clarity: generated test age identities are clear, but `age` must be hard-required instead of skippable.
- Evidence and archive gates: need `## Execution Status`, no-skip test gate, no-plaintext status gate, and attr/hook evidence.
- Manual-only steps and justification: implementation has no manual validation; real private-data helper runs are outside this plan and must require explicit future user invocation.

## Contested or Dismissed Findings
1. Product-manager high finding to remove automated conflict resolver: dismissed as execution-scope replacement because user specifically asked for conflict resolution; retained safety requirements and fixture-realism fixes.
2. Concern that tracking `private.tar.age` is inherently wrong: not treated as a blocker because the stated objective is repo storage of encrypted artifacts; plan must document retention tradeoff and selected default.

## Verification Notes
1. Missing `## Execution Status` confirmed by reading `.specs/private-archive-encryption/plan.md`; section absent.
2. Lead/pseudo agent issue confirmed in Task Breakdown: `validation-lead`, `shell-security-builder`, `python-cli-builder`, `test-engineer`, `docs-planner`.
3. Multi-path `git check-ignore` issue confirmed in T1 and Success Criteria command text.
4. `age --version || true` and skip wording confirmed in Automation Plan and Handoff Notes.
5. Safe tar, hook install, and real Git conflict fixture requirements are absent from Execution Waves.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/private-archive-encryption/review-1/reviewer.md` | read | initial reviewer lacked write tools; recovered with constrained artifact write |
| security-reviewer | `.specs/private-archive-encryption/review-1/security-reviewer.md` | read | usable |
| product-manager | `.specs/private-archive-encryption/review-1/product-manager.md` | read | usable |
| python-pro | `.specs/private-archive-encryption/review-1/python-pro.md` | read | usable |
| qa-engineer | `.specs/private-archive-encryption/review-1/qa-engineer.md` | read | usable |
| devops-pro | `.specs/private-archive-encryption/review-1/devops-pro.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6 reviewers; per-reviewer timing unavailable |
| Artifact reads | unknown | all expected reviewer artifacts read after one recovery artifact |
| Recovery calls | unknown | reviewer retry failed; constrained artifact written by coordinator from same persona findings |
| Verification | unknown | static plan/artifact inspection |
| Synthesis | unknown | `.specs/private-archive-encryption/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/private-archive-encryption/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed (`grep -n '^## '`, checklist/task row inspection)
- Standalone-readiness result: `STANDALONE READY`
- Repair passes used: 0

## Review Artifact
Wrote full synthesis to: `.specs/private-archive-encryption/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply review fixes to the plan before `/do-it`.
- Then execute via `/do-it .specs/private-archive-encryption/plan.md`.
