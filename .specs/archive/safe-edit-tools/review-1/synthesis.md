---
date: 2026-05-06
status: synthesis-complete
---

# Review: Safe edit tools for Pi

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer (recovered with coding-light due write-tool failure) | Completeness & explicitness reviewer | Mandatory standard reviewer for standalone plan readiness | Assume `/do-it` has no conversation context and grep checks can lie | `.specs/safe-edit-tools/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Red-team safety reviewer | Mandatory standard reviewer for file mutation safety and rollback risk | Assume edit tools can touch secrets, ignored files, or unsafe paths | `.specs/safe-edit-tools/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard reviewer for overbuild and smaller alternatives | Assume new tools may be disproportionate unless automated guardrails prove value | `.specs/safe-edit-tools/review-1/product-manager.md` |
| typescript-pro-toolchain | typescript-pro | Pi TypeScript toolchain and extension-registration reviewer | Plan adds TypeScript Pi extensions and tests | Assume files typecheck but are not auto-loaded or registered | `.specs/safe-edit-tools/review-1/typescript-pro-toolchain.md` |
| qa-engineer-verification | qa-engineer | False-positive validation and regression coverage reviewer | Plan depends on tests proving safety semantics | Assume implementers satisfy grep checks while behavior remains broken | `.specs/safe-edit-tools/review-1/qa-engineer-verification.md` |
| devops-pro-operational | devops-pro | Repo automation and operational safety reviewer | Plan must be `/do-it` executable with rollback/evidence gates | Assume failed validation leaves workspace in confusing partial state | `.specs/safe-edit-tools/review-1/devops-pro-operational.md` |

## Standard Reviewer Findings
### reviewer
- High: helper target `pi/extensions/safe-edit.ts` conflicts with `pi/extensions/README.md` auto-discovery rules; helpers must live under `pi/lib/`.
- High: grep-only registration checks can pass for comments/dead code; need runtime registration tests.
- High: path safety contract is underspecified; need canonicalization, repo containment, symlink, ignored/untracked, glob, and secret rules.
- Medium: `structured_edit` path syntax is undefined; implementers would invent incompatible semantics.
- Medium: final evidence/checklist rules are too vague for durable resume.

### security-reviewer
- High: secret/ignored/glob safety constraints are not reflected in acceptance tests.
- High: JSON selector syntax lacks prototype-pollution guards for `__proto__`, `constructor`, and `prototype`.
- Medium: regex replacement lacks binary/size/ReDoS controls.
- Medium: dry-run needs bounded diff/preview and no-write proof.
- Medium: rollback omits untracked files.

### product-manager
- High: tool-building may be oversized without a lighter guardrail/detection phase.
- High: guidance alone does not enforce reduced Python heredoc usage.
- Medium: safety scope is vague and risks false confidence.
- Medium: `structured_edit` selector semantics are underspecified.
- Low: validation may be heavy before resolving product questions.

## Additional Expert Findings
### typescript-pro-toolchain
- High: top-level helper under `pi/extensions` violates extension auto-discovery convention confirmed in `pi/extensions/README.md`.
- High: success criteria must prove default-exported extension registration, not grep strings.
- Medium: tool schemas should use TypeBox as nearby tools do.
- Medium: JSON selector format must be defined.
- Medium: ignored/glob/path policy needs exact tests.

### qa-engineer-verification
- High: grep acceptance criteria can pass with dead code or comments.
- High: dry-run tests must compare pre/post file bytes.
- High: unsafe path matrix must include `.env`, directories, ignored files, traversal, outside absolute paths, symlinks, and globs.
- Medium: match-count tests must prove mismatch/no-op behavior.
- Medium: JSON tests need nested/array/delete/error/unsupported-format coverage.

### devops-pro-operational
- High: rollback omits untracked artifacts and possible registration files outside named paths.
- High: preflight lacks dirty-worktree policy and could mix user work with implementation.
- Medium: ignored/tracked/path traversal safety is not validated.
- Medium: dependency installs should be followed by lockfile/manifest status checks.
- Medium: evidence should be durable, not only in chat transcript.

## Suggested Additional Reviewers
- `typescript-pro` -- relevant because Pi tools are TypeScript extension modules requiring default export and TypeBox schemas.
- `qa-engineer` -- relevant because the original plan relied heavily on grep checks that could falsely pass.
- `devops-pro` -- relevant because `/do-it` execution needs clean preflight, rollback, validation evidence, and archive gates.

## Bugs (must fix before execution)
1. Helper module path was invalid: top-level `pi/extensions/*.ts` files are auto-discovered as extensions, so a helper there could crash startup or register incorrectly. Fixed by changing helper target to `pi/lib/safe-edit.ts` and adding ESM import guidance.
2. Registration verification was grep-only and could pass without runtime-visible tools. Fixed by requiring Vitest registration tests that import default extension exports and assert `registerTool` receives executable `text_edit`/`structured_edit` handlers.
3. Safety requirements were underspecified relative to file-mutation risk. Fixed by adding a v1 path safety contract and required negative tests for repo containment, ignored files, symlink escapes, secret-like names, directories, and glob-like inputs.
4. `structured_edit` path semantics were undefined and lacked prototype-pollution guards. Fixed by specifying typed array paths, existing-parent behavior, delete-missing errors, and rejection of `__proto__`, `prototype`, and `constructor`.
5. Dirty-worktree/rollback evidence was insufficient. Fixed by adding preflight dirty-path handling, tracked/untracked rollback rules, execution-log evidence, and final workspace checks.

## Hardening
1. Added TypeBox schema requirements for both tools to match existing Pi extension patterns.
2. Added regex/binary/size safety requirements for `text_edit`.
3. Added dry-run bounded diff/preview and byte-for-byte no-write tests.
4. Added an automated heredoc/shell mutation guardrail or detector so guidance is not the only behavior-change mechanism.
5. Added lockfile/manifest status checks after pnpm install validation.

## Simpler Alternatives / Scope Reductions
1. Product review argued for a smaller Phase 0 guardrail before tool-building. Instead of splitting the plan into a separate phase, the plan now includes a guardrail/detector in T5 while preserving the selected two-tool scope because the observed edits already map directly to missing tool capabilities.
2. AST/code rewrite remains deferred; the plan explicitly keeps `structured_edit` JSON-first and `text_edit` non-transform-callback to avoid rebuilding Python heredocs as a tool.

## Automation Readiness
- Agent-runnable operational steps: improved; commands remain explicit, and implementation paths now match Pi extension conventions.
- Credential/auth flow clarity: no credentials required.
- Evidence and archive gates: improved; `.specs/safe-edit-tools/execution-log.md`, final `git diff --stat`, and `git status --short` are now required.
- Manual-only steps and justification: none required.
- Resume ledger: checklist IDs remain consistent; no items were marked complete by review.

## Contested or Dismissed Findings
1. No targeted rebuttal was run. Reviewers largely converged on the same concrete issues: helper location, grep-only verification, path safety, JSON path semantics, and rollback/evidence gaps.
2. Product-manager's recommendation to split into a Phase 0-only plan was treated as hardening rather than a must-fix redesign because the user explicitly requested creation of the two recommended tools; the plan now adds guardrail/detection to reduce reliance on guidance alone.

## Verification Notes
1. Confirmed helper-location bug by reading `pi/extensions/README.md`, which states every top-level `*.ts` in `pi/extensions` is auto-discovered and explicitly says: “Do not put helpers, libraries, or scaffolds at the top level of `pi/extensions/`.”
2. Confirmed grep-only issue from plan acceptance criteria that used `grep -R "name: ..."` as proof of tool registration; this does not prove default export loading or `registerTool` execution.
3. Confirmed safety mismatch from plan Constraints requiring ignored/secret/glob safety while original T1 only mentioned `.env` and directories.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/safe-edit-tools/review-1/reviewer.md` | read | initial reviewer lacked file-writing tool; recovered with `coding-light` acting as mandatory reviewer persona |
| security-reviewer | `.specs/safe-edit-tools/review-1/security-reviewer.md` | read | artifact usable |
| product-manager | `.specs/safe-edit-tools/review-1/product-manager.md` | read | artifact usable |
| typescript-pro-toolchain | `.specs/safe-edit-tools/review-1/typescript-pro-toolchain.md` | read | artifact usable |
| qa-engineer-verification | `.specs/safe-edit-tools/review-1/qa-engineer-verification.md` | read | artifact usable |
| devops-pro-operational | `.specs/safe-edit-tools/review-1/devops-pro-operational.md` | read | artifact usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6 reviewers launched; 5 wrote artifacts, 1 reported no write tool |
| Artifact reads | unknown | all expected reviewer artifacts read after targeted recovery |
| Recovery calls | unknown | one targeted recovery for mandatory reviewer |
| Verification | unknown | read `pi/extensions/README.md` to verify high-severity helper-location claim |
| Synthesis | unknown | wrote `.specs/safe-edit-tools/review-1/synthesis.md` |
| Final standalone-readiness review | unknown | initial missing items were applied iteratively; final result: `STANDALONE READY` |

Per-reviewer timing unavailable.

## Review Artifact
Wrote full synthesis to: `.specs/safe-edit-tools/review-1/synthesis.md`

## Overall Verdict
**Ready to execute** after auto-applied plan fixes. Final standalone-readiness reviewer returned `STANDALONE READY`.

## Recommended Next Step
- Execute via `/do-it .specs/safe-edit-tools/plan.md`.
