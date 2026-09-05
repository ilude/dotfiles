# Runtime, instruction, and test dispositions

This is an investigation map, not a replacement runtime specification. Read [findings](findings.md) for the causal evidence and qualifications.

## Execution paths

| Path | Current behavior and state | Simplification disposition | Preserve |
| --- | --- | --- | --- |
| Ordinary conversational work | Native turn and tools; no plan lifecycle required unless active goal state intervenes | Keep as the normal execution path; commands must not be exclusive capabilities | Current request, local instructions, damage control, file mutation queues |
| Raw foreground `/goal` | Creates/adopts worktree, persists objective, requests 1-8 conditions, materializes root task, then separate task/goal judgments | Remove obligatory acceptance restatement and task scaffolding when unnecessary; keep durable tracking when requested or needed for continuation | Exact objective, observable completion, intentional workspace policy |
| Plan-backed foreground goal | Plan attachment/readiness plus durable task mapping gates modifying-capable tools | Remove review lifecycle as execution authority; avoid a second checklist mirroring a usable plan | Real dependencies, unfinished work, evidence contradictions |
| `/goal --unattended` | Worktree/plan setup, lifecycle, root tasks, detached loop, current-session shutdown; attempt ownership and job state | Reuse retained callable start/control operations; do not require operator command repetition | Detached continuation, exact target/session, owner identity, cancellation, no unsafe replay |
| `/plan-it` | Writes a plan and tracks mandatory review/readiness transitions; quick mode still requires lifecycle | Prefer a planning prompt plus an artifact; review only where useful or requested | User requirements, useful dependency/ownership checks at actual dispatch |
| `/do-it` raw | Prepares owned worktree and fresh session by default; direct implementation; optional durable raw task | Reuse its direct-work path and existing preparation/dispatch seam | Preserve current defaults until explicitly changed; preparation before context replacement |
| `/do-it` plan | Parses ready plan, selects dependency-ready work, transfers prepared bytes, uses plan as ledger | Retain plan as an artifact/continuation aid, not a prerequisite for all work | No overwriting divergent copies, no replay of completed work, exact prepared target |
| Stop/resume/reload | Session entries, loop job, plan, tasks, ownership, Git, and merge receipts participate | Consolidate duplicated decisions; expose retained control capabilities to tools | Reconstruct state, identify actual unfinished step, report ambiguity rather than guess |
| Closeout | Goal and workflow paths verify different combinations of evidence, archive, commit, merge, and cleanup | Separate requested-outcome completion from any intentionally retained Git closeout policy; remove duplicate declarations | Never delete unrelated resources or mark unobserved work verified |

Primary sources: `pi/extensions/{goal,loop,workflow-commands}.ts`, `pi/lib/{goal-state,plan-state,workflow-worktree}.ts`, `pi/skills/workflow/{goal,plan-it,do-it,loop-prompt}.md`, `pi/scripts/run-loop.ps1`. Goal resume is directly inspected at `goal.ts:1238-1338`; goal foreground completion at `2490-2612` and unattended closeout follows it.

## What the state actually protects

| State or gate | Useful purpose | Unnecessary coupling to remove |
| --- | --- | --- |
| Original objective/file hash | Detect changed input; recover intent | Preview treated as a substitute for the source |
| Plan and task dependencies | Resume real unfinished work; order actual prerequisites | Mirroring every plan task in another store solely to enable tools |
| PID plus process-instance identity | Prevent stale or competing attempts from mutating | Requiring a review lifecycle to establish that ownership |
| Worktree ownership and Git inspection | Avoid wrong-target edits and loss of concurrent work | Assuming every dirty worktree requires a new user authorization; known in-scope partial edits can be inspected |
| Merge/archive receipts | Recover after partial closeout without replay | Treating all completion as mandatory merging unless that is the selected workflow policy |
| Tool discoverability | Bound schemas; avoid irrelevant tools | Hiding a recovery/start capability behind the failed state it must repair |
| Runtime notifications | Deliver actionable failures to the parent/operator | TUI-only status treated as delivery into model context |
| Attempt evidence | Explain what ran and what remains safe | Generic counters and placeholder rows used as execution authority |

The actual goal resume path blocks dirty work outside its archive exception. Preserving data and refusing blind replay is necessary; automatically classifying every such case as operator-owned is a separate policy choice. A cleanup shortcut is not an acceptable simplification.

## Instruction changes to consider together

| Owner | Retain | Remove or narrow |
| --- | --- | --- |
| `pi/AGENTS.md` | Scope/intent, evidence, preservation, consequential questions, live incident boundary | Universal late-only validation and shared one-repair permission gate; do not add a replacement universal schedule |
| Root `AGENTS.md` | Cross-client repository invariants and focused contract-directed validation | Change only if needed for consistency; do not copy Pi-specific policy here |
| `pi-extension/SKILL.md` | Registration/hot-path discipline, signals, cleanup, bounded output, mutation queue, installed API inspection | Distinguish consequential invariants from workflow preferences; state that useful command actions should share agent-callable operations; correct queued dispatch guidance |
| `skills-engineer/SKILL.md` | Progressive disclosure, single owner, subtractive maintenance | Exhaustive evidence for every instructional step; prefer enough specificity for the real decision |
| `analysis-workflow` | Cause/caller comprehension, decisive evidence, material reassessment | Approval solely because a useful development probe would occur before the final batch, if the new validation policy removes that restriction |
| `planning` and `plan-it.md` | Preserve acceptance strength and real ambiguity; concise plan when needed | Mandatory reviewer roles/counts/order, artificial live metadata for ordinary checks, required alternative generation |
| `do-it.md` | Closed contract, advisory reviewers, direct execution, plan-only ledger, recoverable closeout | Repeated validation counters and schedule translation for legacy plans |
| `testing`, `orchestration`, agent definitions | Correct seams, identity, cleanup, role authority, root integration | Repeated fixed-phase/repair-budget prose; no mandatory delegation for an independently describable task |
| Owning workflow/goal contracts and README | Accepted current public semantics | Retired stages and descriptions that contradict behavior; update together when implementing |

A question can belong to the user even if neither answer is dangerous. Material differences in behavior, scope, tradeoffs, or acceptance are enough. Conversely, facts discoverable from source/configuration and ordinary implementation choices do not require repeated permission.

## Test disposition

Retain outcome tests for:
- Setup failure and cancelled session replacement preserving the original context and prepared files.
- Divergent primary/worktree edits and changed prepared bytes preventing wrong execution.
- Process ownership, cancellation, isolation, exact cleanup, and no replay after an unknown partial mutation.
- Session/workspace/task authority and actual dependency validity.
- Real output/evidence and protection against false completion.
- Archive/merge recovery preserving the remaining work rather than recreating implementation.

Remove or rewrite with the corresponding mechanism:
- Fixed reviewer count/order and compulsory subtractive review assertions in `plan-lifecycle.test.ts`.
- Exact generic recovery-count assertions in `goal-state.test.ts`.
- Tests requiring a duplicate task/condition representation as an end in itself.
- Tests treating every startup-hidden tool name as policy rather than testing discoverability plus authority at execution.
- Prompt-spelling assertions presented as proof that real host dispatch or safety behavior works.

Improve the relevant seam, not the test count:
- Distinct real extension API objects, shared underlying host facilities.
- Actual queued command dispatch, including `expandPromptTemplates: true` where needed.
- Concurrent workers correlated by run identity, not launch position.
- A complete prepare/fail/recover/dispatch/complete scenario exercising the user's original entrypoint.

An ordinary handwritten report remains legitimate evidence. Do not invent an attestation service to replace Markdown bookkeeping or expect unit tests to prove that all future agent judgments are correct.

## Integration of three read-only inspections

Orchestration `c8410b5f-b863-4c90-bea1-e7a1e650e208` completed all three processes; records label deliverables partial. Root filled the important gaps using source and session evidence. Results were recovered from their saved artifacts because the expected pushed result was not present in the retained parent transcript. This is an observed delivery gap here, not a diagnosed new cause.

- Runtime: `bff459a2-eaf1-4f54-b94b-f720dcac4170`; artifact `C:/Users/mglenn/AppData/Local/Temp/pi-subagent-artifacts/1788624046217_39112_1_explorer_output.md`.
- Instructions: `02c5e8f9-b34a-4acd-8a3b-cd6a07898a3f`; artifact `.../1788624039461_39112_2_explorer_output.md` in the same directory.
- Tests: `02f3e4bf-3f72-4fe6-9091-152142904162`; artifact `.../1788624047518_39112_3_explorer_output.md` in the same directory.

Important corrections, not accepted worker conclusions:
1. Identically named `pi` parameters do not establish identical API objects. Installed loader source establishes the mismatch.
2. Raw foreground goals are not universally blocked from ordinary tools; the gate returns early without plans.
3. A TUI/RPC restriction is not automatically pointless: unattended startup calls session shutdown. Confirm supported host modes before changing it.
4. The root repository `AGENTS.md` does not duplicate the full current Pi final-phase policy. Do not propagate that inaccurate attribution.
5. Do not narrow all user questions to safety. Consequential product/design decisions also belong to the user.
6. A test expecting distinct extension APIs to fail would cement the bug. The retained shared capability must work with the host's actual identities.
7. A generic startup failure should not block all tools. Fail-closed damage-control loading is a different boundary from a failed optional planning controller.
8. Tests for placeholder ledgers do not justify a new mandatory runtime attestation system.
9. The instruction worker's extra command-acknowledgement guidance is not the main omission identified by the user. Shared agent access and preference-versus-invariant guidance in `pi-extension` are the relevant omissions.
