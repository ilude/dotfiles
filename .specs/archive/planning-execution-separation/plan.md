---
created: 2026-09-09
status: completed
completed: 2026-09-09
---

# Separate intent refinement from plan execution

## Intent and scope

The user supplies intent, priorities, and consequential judgment. The agent supplies technical reasoning and implementation. Refactor the default planning skill to produce standalone plans that Sol at low reasoning can execute without reconstructing user intent, inventing requirements, or loading planning instructions.

Planning resolves consequential uncertainty before calling a plan executable. `/do-it` then authorizes execution through the agreed checks and authorized closeout, not another planning or review phase. Keep the system low ceremony: sufficient detail for the task, flexible implementation choices, no mandatory document sections or approval machinery.

Change only these existing repository-root-relative files:

- `pi/profiles/default/skills/planning/SKILL.md`
- `pi/profiles/default/skills/planning/references/plan-template.md`
- `pi/profiles/default/prompts/do-it.md`
- `pi/README.md`
- `CHANGELOG.md`
- `pi/profiles/default/skills/agent-process/references/instruction-feedback.md` (update this discussion's AIF-023 only)

This plan and its eventual archive are also task-owned. No runtime changes, new skills, prompt commands, dependencies, global instructions, automatic context resets, execution controllers, mandatory reviewers, or bulk edits to existing plans. Legacy and submodules remain unchanged. Do not add rollback work.

**Authorization:** The current request authorizes writing this plan only. A later `/do-it` authorizes implementation, local task commits, and local merge unless restricted or invoked with `--no-merge`. Push and deployment require separate authorization.

## Starting context

Repository: `C:/Users/mglenn/.dotfiles`, inspected on `main` at `fb3ad567` on 2026-09-09. All source paths in this document are repository-root-relative unless explicitly absolute.

- The skill currently advertises create, review, resume, and closeout. Its `Maintain and finish` section directly instructs execution.
- `/do-it` explicitly loads the planning skill before acting. The plan template already contains substantial execution and closeout guidance.
- Pi makes skill descriptions available for model selection; changing only the command reference leaves the skill's execution-oriented description as another activation route.
- `/do-it` is a native Markdown prompt template. Preserve its frontmatter and `$ARGUMENTS` expansion. No default `plan-it.md` prompt exists or is needed.
- `pi/README.md` currently describes `/skill:planning` as a way to resume and close plans; its planning and command sections need alignment.
- Current unrelated untracked `.specs/` work must be preserved. In particular, the separate `default-plans-command` plan does not authorize changes to this workflow and remains untouched.
- AIF-023 is an uncommitted, task-owned feedback entry created during this discussion. Preserve all other log entries and concurrent edits; carry only this entry into the task worktree if still uncommitted.

**Required reading:** Applicable `AGENTS.md` files; the six scoped files above (only the relevant dated section of the root changelog is needed); `pi/profiles/default/skills/agent-process/SKILL.md` and its linked feedback/failure logs as required for instruction refinement. The planning skill is source being edited in this task, not an instruction to replan this task. Relevant prior evidence is AIF-002, AIF-004, AIF-016, AIF-021, AIF-023 and APR-002, APR-005, APR-006. Existing rules already prohibited churn and premature stopping; mixed instruction ownership is verified, but its causal role and the effectiveness of this refactor are not established.

For native format details, read the installed Pi `docs/skills.md` and `docs/prompt-templates.md`, resolved under the installed documentation root supplied by the active Pi instructions. Both were inspected during planning. No extension or TUI API changes are involved.

**Profiles:** Planning ran in `default`, verified from `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default` and `scripts/pp` / `scripts/pp.ps1`. Intended execution is the default profile, with source edits in the task worktree. Sol at low reasoning is the plan-authoring usability target, not a new model-switch command or mandatory live model test. Record the actual execution profile and checks here at implementation time.

**Worktree:** Created at `C:/Users/mglenn/.dotfiles/.worktrees/planning-execution-separation` on branch `feature/planning-execution-separation`, originating from checkout `C:/Users/mglenn/.dotfiles` on branch `main` at `2ed4f49b`. The recorded integration target is that originating checkout and branch.

## Settled behavior

1. **Planning owns intent refinement.** Investigate discoverable facts, present consequential choices with reasons and a recommendation, and ask focused questions when user judgment is needed. Do not make the user resolve routine technical details. Unapproved recommendations are not requirements. Questions about an existing plan do not authorize rewriting it.
2. **Plans contain the execution contract.** Capture outcomes, exclusions, preserved behavior, settled decisions, concrete ordered tasks, relevant paths/contracts, dependencies, finite checks, and authorized closeout. Reference source documentation where useful instead of copying it. Repository rules and subsequent user instructions still apply.
3. **Detail is proportional.** Combine or omit template sections and task fields when they add no useful information. No exhaustive contingencies, mandatory decision tables, per-tool instructions, fixed reviewer sequence, or formal readiness gate. Review once while authoring: can Sol at low reasoning start each task and recognize its finish without guessing intent? If a consequential question remains, record the plan as draft rather than implying it is executable.
4. **Execution adapts mechanisms, not intent.** Resolve routine implementation problems and demonstrated task-relevant failures independently. An evidence-backed implementation adjustment is allowed when it preserves intended behavior, settled decisions, scope, and acceptance. Update progress, evidence, and necessary factual implementation notes without silently redefining the plan.
5. **Execution continues to a bounded finish.** Work through dependencies, agreed checks, and closeout. Do not stop at a phase boundary or substitute a promise for actionable work. If an unforeseen issue cannot be resolved within existing intent and authority, continue independent tasks and ask for the specific missing input. An unavailable external prerequisite can be reported as a concrete blocker, not disguised as unfinished planning. Do not invent new audits or requirements once agreed checks pass.
6. **No planning-skill dependency during execution.** Remove its execution/resume activation cues and all positive instructions in `/do-it` to load or consult it, including fallback consultation for lifecycle gaps. Do not instruct execution to read the plan template either. Already-loaded conversation content cannot be erased by this change; clarify applicability instead of resetting context.
7. **Preserve `/do-it` compatibility.** Keep optional `--no-merge` before or after a plan path/spec name, cwd-relative path resolution before worktree changes, current-conversation plan selection when omitted, and focused questions for missing/ambiguous plans or invalid arguments. Preserve dedicated worktrees, preservation of unrelated changes, recorded integration targets, local commits, whole-spec dated archival, default local merge and verification, and clean worktree removal only after integration. `--no-merge` retains the committed worktree and records integration as intentionally pending. No automatic push or deployment.

8. **Completion follows integration.** After implementation and agreed agent-owned checks, archive the plan and commit the implementation and archived plan on the task branch, merge into the recorded target (`main` for this task), then declare the plan complete. Archival or a task-branch commit alone is not completion. If merge is blocked, report pending integration, not a completed plan. Preserve explicit `--no-merge` as an exception: report the committed worktree and intentionally omitted integration without claiming a merge.

9. **Operator manual testing is post-completion feedback, not a gate.** Generated plans must not require user/manual acceptance before completing, archiving, committing, or performing authorized integration. The user will test the feature or system through normal use after the plan is complete and address issues found then. Do not create a blocking `Remaining manual acceptance` section, unchecked manual-acceptance task, or wait for operator sign-off. Run the agreed agent-owned checks and fix demonstrated task-relevant failures; this does not excuse unfinished implementation or failed required checks. State any unverified live/manual behavior briefly as a non-blocking verification limit without claiming it passed. Do not turn the user's later testing into a new checklist or scheduled follow-up.

## Execution guidance for this task

After `/do-it` authorization, create/resume the task worktree and carry this uncommitted plan and AIF-023 into it without deleting their originating copies. Work and validate there. Do not import unrelated uncommitted changes.

Use the settled behavior above as the finish line. Wording and organization are flexible; scope, authority, preserved command behavior, and agreed checks are not. When an assumption fails, use repository evidence to find an in-scope solution. Ask only for a consequential decision or prerequisite that cannot be resolved within the authorization, and continue independent work first.

Before adding work, identify which existing requirement requires it. At the T3-to-T4 boundary, check once for scope drift; remove only unnecessary additions introduced by this task, preserve required behavior and concurrent work, then continue. Do not turn this checkpoint into another review project.

## Tasks

- [x] **T1: Make the skill authoring-only**
  - Depends on: execution authorization and task worktree setup.
  - File: `pi/profiles/default/skills/planning/SKILL.md`.
  - Change the description and opening to cover creating, reviewing, and explicitly revising plans, not executing, resuming implementation, or closing it out. State the user/agent division of responsibility and the Sol-low fresh-context quality target.
  - Replace executor-directed `Maintain and finish` guidance with concise authoring guidance for including the necessary execution and closeout contract in each plan. Preserve useful intent clarification, evidence, authorization, preservation, and proportionality rules. Remove duplicate instructions rather than appending another policy layer.
  - Teach authors to keep operator manual testing outside plan completion criteria, as specified in settled behavior 9. Teach the archive/commit, merge, then declare-complete order in settled behavior 8.
  - Verify: read the complete revised skill against settled behaviors 1-6 and 8-9. It tells the planner what to resolve and write, not the executor to run a planning workflow. Lifecycle safeguards remain represented in T2/T3 rather than silently disappearing.
  - Evidence: Rewrote the description and body as an authoring-only, proportional fresh-context workflow. Full-file review preserved settled intent, authority, evidence, manual-testing, and closeout boundaries.

- [x] **T2: Make the template a sufficient, flexible execution handoff**
  - Depends on: T1.
  - File: `pi/profiles/default/skills/planning/references/plan-template.md`.
  - Preserve the `.specs/<stub>/plan.md` convention, frontmatter status/dates, checkbox progress, useful context, bounded validation, and whole-directory archival. Simplify sections and field instructions so they may be omitted/combined when irrelevant.
  - Clearly distinguish fixed user requirements and decisions from adaptable technical approaches. Ensure the generated plan carries continuation, evidence, blocker handling, preservation, scope recovery, and applicable closeout instructions without relying on the planning skill or template at execution time.
  - Replace authoring prompts that would leave consequential intent unresolved in a supposedly ready plan with instructions to settle it during authoring. Keep routine technical discretion; do not require every implementation detail to be predetermined.
  - Make the finish and closeout guidance follow archive/commit on the task branch, merge, then declare completion. Archival metadata must not imply successful integration before it occurs. Make closeout explicitly independent of operator manual acceptance. Keep agent-owned checks in the tasks; describe unperformed manual/live testing only as a non-blocking evidence limit, not remaining work or a reason to keep the plan active.
  - Verify: read the complete template as both an author and a fresh executor. All settled execution behavior has a place in the generated plan; no new mandatory ceremony or planning-skill dependency is introduced.
  - Evidence: Simplified the template while retaining fixed-versus-adaptable decisions, worktree preservation, blocker continuation, bounded checks, and archive/commit/merge/final-metadata ordering without a planning-skill dependency.

- [x] **T3: Make `/do-it` execution-only without changing its interface**
  - Depends on: T1, T2.
  - File: `pi/profiles/default/prompts/do-it.md`.
  - Replace the skill-loading opening with direct instruction to execute the selected plan through authorized closeout, without another planning/review phase. State that technical adaptation within settled intent is expected, while changing intent, scope, decisions, or acceptance requires user approval.
  - Keep the command concise. State the archive/commit, merge, then declare-complete order, and that pending operator manual testing does not block authorized closeout. Preserve honest verification reporting and required agent-owned checks. Preserve the argument and authorization behavior and operational safeguards listed in settled behavior 7. Retain generic command defaults needed to run existing plans without adding a planning/template fallback or requiring old plans to be reformatted.
  - Verify: manually trace omitted selector, explicit path, spec name, both flag positions, ambiguous selection, and `--no-merge` against the existing prose. Inspect frontmatter and the literal `$ARGUMENTS` placeholder. The result asks no fresh planning questions for already-settled decisions.
  - Evidence: Replaced the planning-skill opening with direct execution instructions. A deterministic prose trace passed for omitted selector, cwd-relative path, spec name, either flag position, ambiguity handling, `--no-merge`, frontmatter, and literal `$ARGUMENTS`.

- [x] **T4: Align documentation and finish the bounded checks**
  - Depends on: T1-T3.
  - Files: `pi/README.md`, `CHANGELOG.md`, and AIF-023 in `pi/profiles/default/skills/agent-process/references/instruction-feedback.md`.
  - Update only directly affected planning and `/do-it` documentation. Record why ownership changed, the standalone-plan expectation, low-ceremony technical flexibility, and preserved Git/authorization behavior. Update AIF-023 with actual implementation/check evidence without claiming adherence is proven. Keep historical entries intact.
  - Verify from the task repository root: inspect `git diff --stat`, `git diff --check`, and the scoped diff; search `planning` and `do-it` references in the three instruction files and `pi/README.md` to confirm no remaining positive execution-time dependency. Read the resulting three instruction files together once for contradictory authority, missing lifecycle safeguards, or new requirements. Trace the case where implementation and agreed agent-owned checks are finished but operator manual testing has not occurred: the agent archives and commits on the task branch, merges into the recorded target, then declares completion, reporting that testing as unverified rather than blocked. A blocked merge must not produce a completed-plan claim.
  - Done when: T1-T3's manual checks and the scoped consistency/whitespace checks pass, documentation agrees, and the diff contains only task-owned changes. No full test suite, TypeScript build, live model trial, runtime changes, or generated fixture-plan project is required for this prose-only refactor.
  - Evidence: Updated README, changelog, and only AIF-023. Scoped diff/stat review, `git diff --check`, reference search, complete three-instruction-file review, and manual-testing/blocked-merge traces passed. Scope checkpoint found only the six authorized source files plus this spec.

- [x] **T5: Archive, commit, and integrate the authorized work**
  - Depends on: T4.
  - Follow the closeout instructions below. Update actual profile/check evidence before archival; do not declare plan completion before successful integration. Include only task-owned implementation, documentation, feedback, and this spec.
  - Done when: the archived plan and changes are committed and verified in the recorded integration target, or committed in the retained task worktree when `--no-merge` applies. Report an actual integration blocker separately rather than claiming delivery.
  - Evidence: Archived the whole spec and committed task changes as `0f5ba07f`, merged branch `feature/planning-execution-separation` into the recorded `main` checkout, verified the archive and source changes, then committed final completion metadata.

## Current handoff and evidence

- Status: completed and integrated into the recorded `main` checkout.
- Completed: T1-T5. The skill is authoring-only, plans carry a standalone execution contract, `/do-it` is execution-only, affected documentation and AIF-023 agree, and the archived task commit was merged locally.
- Actual runs: planning and execution on 2026-09-09 in the default profile at `C:/Users/mglenn/.dotfiles/pi/profiles/default`; scoped prose and Git checks passed. No runtime or live model trial was required.
- Next: none.
- Open decisions/blockers: none.
- Limitation: prose consistency checks establish instruction separation, not guaranteed future model compliance. Sol-low execution effectiveness remains unverified.

## Closeout

Once the implementation and T4 checks pass, summarize the checks and actual profile, record integration as pending rather than marking the plan completed, and move this entire spec directory to `.specs/archive/planning-execution-separation/` in the task worktree. Confirm that destination does not already exist; never overwrite another archive. Repair affected references. Leave unfinished implementation active.

Commit the task changes and archived spec together. Unless `--no-merge` or an explicit user restriction applies, merge the task branch into the recorded originating checkout's branch. Preserve unrelated target changes without stashing, discarding, or committing them. Reconcile only the task-owned originating plan and AIF-023 copies, preserving concurrent edits. If integration is blocked, retain the worktree and report that implementation/checks are finished but the plan remains pending integration. Do not declare the plan complete.

After merging, verify that the target contains the changes and archived spec and that no active task-plan copy remains. Then mark T5 done, set `status: completed` and the actual `completed: YYYY-MM-DD` in the archived plan, and commit that final metadata update. Only then declare the plan complete. Rerun affected checks only if merge resolution changed the checked content. Remove the task worktree only after successful integration with no uncommitted or unmerged work. With `--no-merge`, keep the committed worktree and report its path/branch and intentional pending integration. Do not push or deploy.
