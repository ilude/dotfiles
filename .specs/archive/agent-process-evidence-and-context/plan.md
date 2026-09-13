---
created: 2026-09-13
status: ready
completed: null
---

# Evolve agent-process with selective evidence and task-context preservation

## Goal and scope

Refine the existing default-profile `agent-process` skill into a concise, flexible first-draft procedure for evolving global/repository instructions and skills. Improve alignment with the operator's intent without replacing task context with lengthy instructions, exhaustive research, or process ceremony.

### User requirements and settled decisions

- Retain `agent-process` as the improvement entry point; reuse `skill-creation` for skill-writing guidance.
- Treat user frustration, swearing, and “wtf” directed at agent behavior as strong signals of a possible intent failure. Assess the context; profanity alone is not proof of a mismatch or permission to change instructions.
- Recording an established intent failure can be the entire appropriate response, especially for an unfamiliar first occurrence without a clear remedy. An incident does not automatically create instruction work. A first occurrence can also justify an obvious correction; do not impose a recurrence threshold.
- Use relevant prior incidents and current instructions, not mandatory full-history reads. Expand investigation when missing evidence could change the recommendation.
- Distinguish absent/unclear instructions from failure to follow existing instructions. Do not assume another paraphrase fixes adherence.
- Additions, replacements, consolidation, deletion, and relocation into conditional references are equally valid proposals. Instruction edits require operator approval.
- Balance checking with its value to the actual decision. Support consequential premises with relevant evidence, label hypotheses, and revise conclusions as evidence changes; do not demand citations or proof for every tentative thought.
- Offer context separation when process discussion starts displacing task work. No automatic branching, mandatory interruption, numerical trigger, or prescribed sequence. Keep command options discoverable and clearly distinguish tested behavior from ideas.
- Assess changes through later comparable work during relevant reviews, including recurrence, user correction burden, unintended work, and task completion. No automatic monitoring. Installing wording is not proof of behavioral effectiveness.

### Non-goals and authorization

Planning is authorized now; execution requires a subsequent instruction. No new skill, extension, tool, state machine, monitoring service, scoring system, mandatory A/B suite, or general rewrite of global/repository `AGENTS.md` files. No runtime branching repair: another branch owns it. No legacy-profile work, module changes, push, deployment, or product rollback work.

When execution is authorized, use a dedicated task worktree, local task commits, and merge into the recorded originating checkout as described below, unless the operator explicitly requests no merge. A skill's future permission to propose instruction changes does not grant automatic edit authorization.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles` unless stated otherwise. Read current applicable instructions before acting.

- Owning repository: dotfiles. Starting branch `main`, inspected HEAD `8b47a7a4` on 2026-09-13. Recheck before execution; concurrent work is active.
- Verified planning profile: `default`, session `01a09c15-6dc4-725c-a6f2-975318c7cb9e`. Intended execution profile: default; no execution run is claimed.
- Existing owning files:
  - `pi/profiles/default/skills/agent-process/SKILL.md`
  - `pi/profiles/default/skills/agent-process/references/instruction-feedback.md`
  - `pi/profiles/default/skills/agent-process/references/failure-log.md`
  - `pi/profiles/default/skills/skill-creation/SKILL.md`
- Research and capability evidence:
  - `docs/research/obsidian-vault/agent-workflows/patterns/instruction-evolution-and-reasoning-budgets.md`
  - `docs/research/obsidian-vault/agent-workflows/patterns/pi-context-separation-options.md`
  - Relevant history: AIF-003, AIF-013, AIF-031, AIF-041, AIF-054, AIF-055 and APR-035. These are evidence, not executable policy. Read targeted entries and follow references when needed, rather than copying the logs into the plan.
- Proposed new file: `pi/profiles/default/skills/agent-process/references/context-separation.md`.
- Relevant navigation: `pi/README.md`; existing `pi/profiles/default/docs/herdr.md` and `docs/commands.md` own runtime command behavior. Keep operational claims consistent without duplicating full setup documentation.

### Verified starting behavior and limits

`agent-process` currently demands reading both logs completely, then proposing the smallest change. Its description does not mention frustration; its body does not clearly establish record-only as a finished outcome. `skill-creation` already covers Pareto-inspired selection, pruning, consolidation, conditional references, and representative comparisons for uncertain or consequential effects. Do not duplicate that guidance.

Pi 0.85.1 exposes skill descriptions initially; models choose when to read full skills. `/skill:agent-process` explicitly invokes the skill. This is not a deterministic skill-firing hook.

Disposable real SessionManager and native CLI RPC experiments established that `/fork` switches to a new session ending before the selected user message and returns that prompt for editing. `/clone` retains current context; `/tree` without a summary can exclude a digression from active context while preserving history. Forking does not restore filesystem state. TUI picker/editor behavior was source-inspected, not clicked live; live new-tab startup was not tested in this investigation. Existing launch/resume checks passed: 3 files, 27 tests. The first RPC fixture incorrectly compared pre-startup bytes; startup appended thinking metadata. With the baseline after startup, fork source-preservation checks passed.

At investigation time, custom `/branch` mutated the current session manager before launching the child with the same new file. Another branch is addressing that defect. Recheck its current documented status before writing the reference; do not repair it, wait for it unnecessarily, or claim it fixed without evidence. Native fork and fresh-instance options are sufficient for this skill draft.

### Preservation and worktree

Originating integration target: `C:/Users/mglenn/.dotfiles`, branch `main`.
Proposed task branch: `task/agent-process-evidence-and-context`.
Proposed worktree: `C:/Users/mglenn/.dotfiles-worktrees/agent-process-evidence-and-context`.
Record actual values at execution start; equivalent collision-free names are fine.

Known uncommitted process-research work at planning time: the two research notes above (context-separation note newly created), their topic index link, and AIF-055 in `instruction-feedback.md`. Carry this task's plan and process-research changes into the worktree without deleting the originating copies or overwriting concurrent edits. Include the verified task-owned research in delivery if it has not already been committed. `pi/profiles/default/extensions/session-launch.ts` has a separate branch's uncommitted change: preserve and exclude it. Recheck status/diffs rather than assuming this inventory remains current.

## Procedure contract

This describes the intended behavior, not mandatory headings, phases, forms, or a runtime state machine:

1. Recognize possible intent mismatch from explicit feedback or frustration directed at agent behavior. Identify intended versus observed behavior using relevant instructions and evidence. Offer separation early if a substantive process discussion would displace the task, without launching anything automatically.
2. Compare relevant history and establish whether the cause or remedy is known. Stop at a concise record when that is the useful outcome; otherwise investigate only uncertainties that could change the remedy. Recording must not silently commit to later work.
3. If warranted, propose a small change at the owning scope. Briefly explain the expected behavioral effect, evidence versus assumptions, and what would make us reconsider it. Consider removal and consolidation, not just added prohibitions. This explanation can fit in ordinary discussion or the existing log record.
4. Apply approved changes using existing skill-writing guidance where applicable. Preserve unrelated work and existing authorization boundaries.
5. In later relevant reviews, compare actual outcomes with expectations and revise beliefs about usefulness. Keep, revise, or retire wording with approval as appropriate. One success or failure does not by itself establish causality; no scheduled review or new tracking system is implied.

Keep academic explanations and citations in the vault. Link research conditionally when it would inform a disputed choice; do not require reading it on every invocation. Existing logs remain the record of feedback, decisions, and observed outcomes, not sources of instructions that override active policy.

## Execution guidance

Create/resume the dedicated worktree and record its target before editing. Continue independent work around blockers. Ask only when a new choice would change settled behavior, scope, or acceptance. Do not add a supervisor/reviewer sequence or broaden the work into a general instruction audit. Keep task evidence and any genuine blocker/next-action/owner current. Stop after the agreed checks pass and demonstrated task-related defects are resolved.

## Tasks

- [x] **T1: Revise the improvement skill without adding ceremony**
  - Depends on: none.
  - Update `agent-process/SKILL.md` description and body to implement the procedure contract. Preserve the existing feedback/refinement trigger and explicit `/skill:agent-process` use; add contextual frustration/swearing/“wtf” signals.
  - Replace full-log reading with relevant-entry retrieval and expansion when needed. Explicitly permit record-only completion and no instruction change. Put any separation offer before deep investigation.
  - Reuse/link `skill-creation` where skill edits are involved; change its text only if a specific overlap/conflict must be resolved. No general rewrite.
  - Verify: read the resulting instructions as a fresh executor and compare with settled requirements and existing owning guidance. Compare word counts and justify additions by behavior, without an arbitrary token cap.
  - Done when: the main skill gives clear actions and stopping choices without requiring theory, whole logs, fixed thresholds, or mandatory experiments.
  - Evidence: Revised `SKILL.md` now uses contextual behavior-frustration signals, targeted evidence retrieval, record-only completion, adherence-versus-policy diagnosis, operator-approved edit boundaries, and later comparable observation. The skill grew from 282 to 430 words because these settled behaviors replaced the single full-log rule; conditional command detail remains outside the main skill.

- [x] **T2: Make context-separation options available on demand**
  - Depends on: T1's offer boundary; source lookup may proceed independently.
  - Add proposed `references/context-separation.md`, linked only when separation would help. Use the verified research note and current owning runtime docs.
  - Describe fresh-instance handoff versus pre-digression fork, native fork/clone/tree distinctions, and existing-session resume. Explain that `/fork` restores the selected prompt to the editor and excludes it from history, while summaries can retain unwanted discussion. Filesystem/current instructions do not rewind.
  - Keep handoff guidance short: source identity/evidence references, concrete issue, established facts versus hypotheses, and authorization. No mandatory artifact schema or automatic message delivery.
  - Represent custom `/branch` status from current evidence; if its repair is not verified, retain the limitation and use other options. This task does not depend on that repair.
  - Verify: compare every documented command with current installed/owning docs. Reuse prior experiments for unchanged behavior; do not relaunch interactive sessions merely to repeat them. Any unresolved option stays clearly labeled rather than advertised as working.
  - Done when: the model can offer practical choices without a prescribed sequence or new tools.
  - Evidence: Added `references/context-separation.md` covering fresh instances, repaired independent `/branch`, pre-digression `/fork`, `/tree`, `/clone`, CLI resume, and Herdr resume. It states the operator choice, filesystem limits, and live-testing limits without prescribing a sequence.

- [x] **T3: Record the draft and keep navigation consistent**
  - Depends on: T1 and T2.
  - Update AIF-055 with the approved first-draft changes, including frustration signals and record-only outcomes. Where needed, extend that existing entry with concise expectation/later-observation language; do not migrate historical records or require new fields everywhere.
  - Preserve the research notes as research, distinguish implemented draft behavior from still-proposed ideas, and link the on-demand reference appropriately. Update `pi/README.md` only where its description would otherwise be stale.
  - Add a root `CHANGELOG.md` entry describing selective evidence, optional context separation, preserved approval, and non-automatic behavior. Do not imply proven effectiveness or claim the separate `/branch` repair.
  - Done when: navigation, research status, and feedback records agree with the actual draft and carry no new process obligations.
  - Evidence: Updated AIF-055, `pi/README.md`, and root `CHANGELOG.md`; research notes remain labeled research and `/branch` effectiveness is not overstated.

- [x] **T4: Validate the first draft with finite checks**
  - Depends on: T1–T3.
  - Run `git diff --check` and resolve local Markdown links for changed files.
  - Use installed Pi skill discovery on the changed skill directory and confirm its name/description are discovered without related diagnostics. A disposable loader check using the installed package's documented skill-loading API is sufficient; no credentials, model calls, or permanent test harness are needed. Follow current Pi docs for the exact API before invoking it.
  - Review once against these representative situations, recording concise results here:
    1. First unfamiliar frustration incident: establish and record the mismatch; no forced instruction change or investigation loop.
    2. Repeated invented gate despite existing scope rules (AIF-031/AIF-054): distinguish adherence from absent policy; check the real premise and preserve user approval.
    3. Frustration or swearing unrelated to agent behavior: no automatic process intervention.
    4. A successful baseline with one exception (AIF-013): preserve working behavior rather than replacing the workflow wholesale.
    5. Process discussion displacing task work: optional separation offer, correct commands, no automatic branch or filesystem rollback implication.
  - Compare instruction size and remove duplicated meaning. Word counts are descriptive, not a pass/fail ratio.
  - Done when: discovery/links/whitespace checks pass and the single walkthrough reveals no unresolved conflict with agreed intent. Fix established local defects and rerun only affected checks.
  - Limits: these are loading/consistency checks and scenario walkthroughs, not model-behavior experiments or proof of effectiveness. Later ordinary use does not block completion. No full TypeScript/test suite is required for prose-only changes.
  - Evidence: `git diff --check` passed; all relative Markdown links in the five changed Markdown files resolved; installed Pi 0.85.1 `loadSkillsFromDir` discovered `agent-process` with its revised description and no diagnostics. One walkthrough passed: (1) first unfamiliar frustration can stop at a record, (2) AIF-031/AIF-054 maps to adherence and premise rechecking without automatic edits, (3) unrelated swearing does not trigger process work, (4) AIF-013 preserves the successful baseline, and (5) displaced task context leads only to an optional, command-accurate separation offer with no filesystem rollback claim. Main-skill size changed from 282 to 430 words; added meaning implements settled stopping, evidence, approval, and observation behavior while command details are conditional.

- [ ] **T5: Archive and integrate the first draft**
  - Depends on: T4; execution authorization must have been given.
  - Record actual checks and remaining non-blocking limits. Archive the entire spec directory to `.specs/archive/agent-process-evidence-and-context/`, provided that destination is not another plan, and commit the task changes plus archive locally.
  - Merge into recorded originating `main` without stashing, discarding, or committing unrelated work. Resolve routine conflicts within scope; preserve independently edited launcher code. If blocked, retain the worktree and record the blocker, exact next action, and owner.
  - After integration, confirm target contains implementation and archive with no active plan copy. Set archived status/completion date and commit completion metadata on target. Remove the task worktree only after it has no uncommitted or unmerged work.
  - Done when: integration, metadata, and cleanup are verified, or an explicit no-merge request is reported with the committed worktree retained. Leave unfinished integration/cleanup unchecked. No push or deployment.
  - Evidence: Not started.

## Validation and current handoff

- Status: Implementation and agreed checks complete in the dedicated task worktree; archival, task commit, integration, completion metadata, and cleanup remain.
- Completed: T1–T4, including the first-draft skill/reference/navigation changes and finite loading, link, whitespace, size, and scenario checks. Earlier capability experiments remain prerequisite evidence rather than repeated live tests.
- Next: archive and commit the spec on the task branch, merge it into recorded target `C:/Users/mglenn/.dotfiles` branch `main`, then record completion metadata and clean up the worktree.
- Open decisions: none for the first draft. The other branch's `/branch` repair is independent, not a blocker.
- Verification limits: no measured improvement from draft wording; no live interactive branching/new-tab experiment required for delivery.
- Fresh-executor review: checked once against settled intent, finite checks, task/repository boundaries, record-only completion, and closeout. No additional review sequence is imposed.

## Closeout response

After execution, start with one explicit overall outcome: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED**, 🔴 **NOT COMPLETE: USER INPUT REQUIRED**, 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**, or 🟡 **CLEANUP PENDING**. For blocked/pending outcomes, lead with the reason and precise action/owner, not passed checks. Then give concise checks, archived plan path, commits/merge result, and retained worktree if any. Do not claim completion while authorized integration or cleanup is unfinished. Operator follow-up observations are non-blocking evidence for future refinement.
