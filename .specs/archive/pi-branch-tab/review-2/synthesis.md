---
date: 2026-05-03
status: synthesis-complete
---

# Review: Add terminal-aware Pi `/branch` command

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| reviewer | reviewer | Completeness and explicitness reviewer | Mandatory standard reviewer | Assume gaps and weak acceptance criteria will let execution drift |
| security-reviewer | security-reviewer | Red-team command/process safety reviewer | Mandatory standard reviewer | Assume unsafe quoting/session cloning can corrupt state or run the wrong command |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard reviewer | Assume abstractions and parallel waves are overbuilt until justified |
| typescript-pro | typescript-pro | Pi TypeScript extension API and build/toolchain reviewer | Plan changes Pi extension command registration and TS helpers/tests | Assume nonexistent ctx APIs or brittle any-casts will compile or test poorly |
| devops-pro | devops-pro | Cross-terminal process-launch and OS integration reviewer | Plan launches OS terminal processes across Windows Terminal and Ghostty | Assume terminal CLIs differ by OS/version and naive spawn works only locally |
| qa-engineer | qa-engineer | Verification realism and regression coverage reviewer | Plan depends on branch/session, terminal detection, fallback, and title tests | Assume grep checks pass dead code and manual validation misses branch correctness |

## Standard Reviewer Findings
### reviewer
- High: T1's acceptance only requires grep-visible branch code, not a proven branch/resume mechanism or executable manual command.
- High: T1 and T2 are parallel even though launcher command shape depends on branch/resume discovery.
- Medium: Manual validation does not define how to prove the new tab is attached to a distinct branched session, not a fresh/new session.

### security-reviewer
- High: Session cloning has no safety constraints around what state may be copied, persisted, or exposed in a manual command.
- High: Tab-name and cwd/title quoting is underspecified; arbitrary title text could be interpolated unsafely if implemented through shell strings.
- Medium: No rollback/cleanup expectation if a branch is created but terminal launch fails.

### product-manager
- High: The plan uses an internal launcher abstraction before proving the Pi branch primitive exists; sequence should de-risk the core session operation first.
- Medium: Supporting Ghostty tabs on two OSes in the first increment may be broader than needed unless the plan requires adapter conformance tests.

## Additional Expert Findings
### typescript-pro
- High: The plan does not require discovering and documenting the exact ExtensionAPI/session API or adding a typed helper boundary before command wiring.
- Medium: Tests are not tied to existing Pi extension test conventions or mock interfaces, so implementers may add unintegrated tests.

### devops-pro
- High: Terminal command semantics are underspecified: `wt` path conversion, Ghostty CLI syntax, executable discovery, working directory behavior, and failure reporting need concrete acceptance criteria.
- Medium: Fallback manual command is required but the plan never verifies it can be copy-pasted successfully on each OS.

### qa-engineer
- High: Multiple acceptance criteria use `grep` as proof; this can pass with dead code, comments, or tests that never execute.
- Medium: Manual validation lacks a transcript/state-marker check proving branch divergence and independence.

## Suggested Additional Reviewers
- typescript-pro -- relevant for Pi TypeScript extension APIs, typed launcher helpers, command registration, and pnpm validation.
- devops-pro -- relevant for cross-terminal process launching, OS detection, path conversion, executable discovery, and quoting behavior.
- qa-engineer -- relevant for replacing grep checks with executable tests and defining realistic manual validation.

## Bugs (must fix before execution)
1. **Wave dependency is wrong: T2 depends on T1's branch/resume command shape.** T2 cannot correctly build terminal launch commands until T1 identifies how to attach Pi to a branched session. Move session API discovery into Wave 1 alone, then implement launcher/command wiring after V1, or split T2 so only pure terminal detection independent of Pi command shape runs in parallel.
2. **Acceptance criteria can pass without proving behavior.** Replace grep-only checks with executable tests or explicit code-level assertions: typed branch helper exists, mocked launcher receives exact argv/env/cwd/title, fallback manual command includes the branch identifier, and tests execute through the registered `/branch` handler.
3. **The plan does not define safe branch-state semantics.** Add requirements for what is copied, what must not be copied into a shell-visible command, what identifier is passed to the child Pi process, and cleanup/reporting behavior if branch creation succeeds but terminal launch fails.
4. **Terminal launch quoting/path requirements are underspecified.** Require argv-array spawning rather than shell interpolation where possible, tests with spaces/special characters in cwd and title, Windows Git Bash to Windows path conversion, and confirmed Ghostty CLI syntax before implementation.

## Hardening
1. Replace lead agents in the task table with worker/domain agents (`planner` for discovery, `typescript-pro`/`coding-medium` for implementation, `qa-engineer` for validation) to match Pi reviewer/task-routing guidance.
2. Add a manual validation step that sends one message in the branched tab and confirms the original tab does not receive it, proving branch independence.
3. Add an explicit fallback acceptance check: simulate unsupported terminal and verify the printed manual command is copy-pasteable and includes cwd/title guidance.

## Simpler Alternatives / Scope Reductions
1. Implement the branch primitive and fallback manual command first, then add terminal adapters. This reduces risk if Pi lacks a clean resume API.
2. Consider Windows Terminal as the first executable adapter and Ghostty as the same helper contract plus tests only until exact CLI syntax is confirmed.

## Contested or Dismissed Findings
1. No targeted rebuttal was run: reviewers converged on dependency ordering, weak verification, and command-launch ambiguity; there was no outcome-changing disagreement.
2. Preview truncation occurred in the subagent display, but panel status was `Parallel: 6/6 succeeded` and each preview contained usable severity/evidence/fix structure, so no recovery was invoked for this run.

## Verification Notes
1. Dependency bug confirmed by plan lines showing T1 and T2 both in Wave 1 with no dependency, while T2 must build branch launch commands and T1 discovers the branch/resume mechanism.
2. Weak verification bug confirmed by acceptance criteria using `grep -R` as the primary proof for T1, T2, and T3.
3. State/quoting bugs confirmed by plan text requiring cloning current conversation/session state and building properly quoted commands without defining copy boundaries, argv requirements, cleanup, or command syntax verification.

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6 reviewers, `Parallel: 6/6 succeeded`; per-reviewer timing unavailable |
| Recovery calls | not run | Preview truncation only; usable findings available |
| Verification | unknown | Used `read` and targeted `grep` against `.specs/pi-branch-tab/plan.md` |
| Synthesis | unknown | Artifact path `.specs/pi-branch-tab/review-2/synthesis.md` |

## Review Artifact
Wrote full synthesis to: `.specs/pi-branch-tab/review-2/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply bug fixes to the plan before `/do-it`.
- Then execute via `/do-it .specs/pi-branch-tab/plan.md`.
