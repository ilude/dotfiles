# Product Manager Review: Simplicity / Scope

## Findings

### 1. Severity: High
**Evidence:** The plan calls itself "small Option 1" but adds three semantic surfaces at once: readiness helpers, renderer grouping/labels, and two new slash commands, plus start enforcement. The task breakdown includes 10 executable/validation tasks and repo-wide `make check`.

**Required fix:** Re-scope Option 1 to the minimum user-visible dependency enforcement path: implement readiness helper + `/tasks start` rejection + tests first. Make `/tasks ready`, `/tasks blocked`, and renderer grouping either explicit stretch goals or a second small follow-up plan unless existing code already makes them near-zero-cost.

### 2. Severity: Medium
**Evidence:** T5 requires documenting Option 2 and Option 3 architecture in `pi/README.md` or evidence, with terms like dependency tree, topological ordering, ready queue, workflow engine, auto-unblock, cascade, and deferred execution. This invites future-scope design during an Option 1 implementation.

**Required fix:** Remove T5 from the implementation path or replace it with a 3-5 line "Out of scope" note in the plan/evidence only. Do not modify product docs for rejected options unless a separate roadmap/spec is requested.

### 3. Severity: Medium
**Evidence:** Renderer acceptance criteria require compact grouping labels and detail output redaction/security checks (`task-security.test.ts`). Option 1's core user problem is dependency visibility and start enforcement; redaction and renderer-mode compatibility broaden the validation matrix.

**Required fix:** Limit renderer changes to the smallest existing display hook needed to show unmet blockers. Keep redaction/security tests only if the edited renderer path already processes task content that can contain secrets; otherwise rely on existing security coverage and avoid expanding this plan.

### 4. Severity: Low
**Evidence:** Manual gate section is proportionate, but the final checklist includes separate F3/F4 gates for "manual validation not required" and "deployment validation not required" plus archive preflight. For a low-risk local TypeScript change, this adds process overhead without product value.

**Required fix:** Collapse F3/F4 into a single final evidence note or remove them from the executable checklist. Keep the risk decision in the plan header; do not make non-required gates first-class work items.

### 5. Severity: Low
**Evidence:** The plan requires both focused validation, full Pi validation, repo-wide `make check`, and every individual acceptance verify command. Many commands overlap and may repeat the same test files multiple times.

**Required fix:** Define one focused command for changed task tests, one typecheck, and one final repo-wide check. Individual task acceptance criteria can cite the focused command without requiring separate reruns unless failures are being isolated.
