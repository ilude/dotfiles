# Workflow state audit notes

## Purpose

Preserve the current investigation before session compaction. This file records verified findings, rejected ideas, unresolved decisions, and the next investigation. It is not an implementation plan and does not approve any proposed mechanism.

The primary workflow problems under investigation are:

- overpromising behavior that the responsible component cannot enforce;
- overengineering and gold plating;
- repeated attempts that do not produce new evidence;
- workflow states whose labels do not match the actions they permit;
- changes that invalidate earlier validation or break existing behavior.

## Triggering incident

Execution of `.specs/herdr-visible-subagents/plan.md` exposed a process-launch assumption that had not been proved against real Herdr behavior. Real `pane process-info` output on Windows reported the pane shell rather than the Node launcher used by the adapter. Six live validation commands failed in the first inspected window. One short diagnostic was also unnecessarily detached to a background terminal. It settled in 12.8 seconds before the later mutation and foreground rerun, so the logs do not support the earlier claim that those test executions overlapped.

A later branch resumed the same T3 work and ran ten more enabled live tests between 22:53 and 23:28 UTC. Nine failed before one passed. Those failures exposed a sequence of harness and integration defects: incorrect CLI invocation, response normalization, nested Vitest worker context, outer timeout ownership, extension-generation mismatch, temporary agent-directory loading, stale broker-run lifetime, fixture path, and snapshot-field naming. Most retries followed a code or harness edit, so an unchanged-repository fingerprint would not have classified the dominant waste.

The existing repository instructions already required short checks to run synchronously, root validation of delegated claims, a prepared live gate, and incident recovery after a failed live mutation. The immediate churn was therefore a failure to isolate and prove the harness and runtime assumptions before retrying live, not evidence that a generic workflow incident state machine was missing.

A live mutation means an action that changes an active process, service, session, terminal resource, external system, or persistent runtime resource. A failed live mutation is one whose intended resulting state or cleanup cannot be verified.

## Current Herdr workflow state

These facts come from current Git state and session evidence and must be rechecked before further mutation:

- Owned branch: `workflow/herdr-visible-subagents`
- Owned worktree: `.worktrees/herdr-visible-subagents`
- T2 was reopened, implemented, validated, and marked complete.
- A later session branch completed the T3 live gate at 23:28 UTC after nine failed enabled attempts in that later window. The passing run returned `T3_LIVE_OK`, recorded completed logical and process state, released capacity, and was followed by removal of the remaining owned `w15` pane.
- The plan now marks T3 complete with live evidence and marks T4 complete from non-live focused evidence.
- Another Pi session continued the original `/do-it` in this owned worktree and began T5. Current liveness is not inferred from old session records. This audit did not mutate or validate that worktree concurrently.
- `pi/tests/herdr-surface.live.test.ts` remains an untracked live test in the owned worktree and is being extended for T5.
- The owned worktree remains intentionally dirty and uncommitted.
- The earlier instruction to keep T3 paused was stale relative to the later branch and concurrent `/do-it` session. It must not be used to overwrite or roll back current worktree state.

## Correct workflow review question

The review is not about whether to add another state machine. The correct question is:

> For every state the workflow system already represents, do its transitions, permitted actions, side effects, persistence, and recovery behavior match what the system claims?

The review covered:

- plan lifecycle and persisted plan routing;
- `/do-it` continuation, ownership, and closeout;
- durable tasks and dependency readiness;
- foreground and unattended goals;
- goal attempts, recovery phases, waits, and completion;
- subagent broker, run-manager, process, deliverable, cancellation, and continuation state;
- background-terminal lifecycle and completion acknowledgement;
- damage-control decisions that gate workflow actions;
- reload, interruption, and cleanup behavior.

For each state, the review considered authority, entry preconditions, enabled and rejected actions, side-effect ordering, persistence, exit evidence, recovery, concurrency, and executable tests.

## Review method

Candidate findings were generated from tracked source and tests. Four independent adversarial reviews then challenged them through these lenses:

1. disproof and hidden enforcement;
2. reachability and material impact;
3. ownership and lifecycle authority;
4. subtractive necessity and ceremony risk.

Off-target reviewer output was discarded rather than counted. Findings were not accepted by vote. They had to survive direct root inspection and show a concrete state or transition mismatch.

Fresh remedy reviews challenged accepted findings for deadlock, stale state, duplicate authority, recovery, and unnecessary complexity.

## Accepted findings

### Required skipped tasks have inconsistent goal-completion semantics

Foreground plan-backed goal completion accepts a required linked task whose durable state is either `completed` or `skipped`:

- `pi/extensions/goal.ts:2452-2468`

Unattended goal completion requires the equivalent required task to be exactly `completed`:

- `pi/extensions/goal.ts:1361-1375`

The shared contract says every required plan item and linked root task must be complete:

- `pi/skills/pi-extension/references/contracts/goal-and-loop.md:10`

Observable consequence: the same required task graph can complete in foreground mode and be rejected in unattended mode.

The smallest contract-preserving direction is to reject `skipped` required tasks during foreground completion. Accepting skipped required tasks would need an explicit policy defining who may waive the requirement and what evidence substitutes for completion.

### Goal Git closeout can finish before completed goal state is durable

Unattended goal completion currently performs successful Git closeout before persisting the goal as completed:

1. verify goal completion;
2. archive, commit, and merge;
3. remove the owned worktree and branch;
4. delete workflow ownership;
5. compute final artifacts and report;
6. persist the completed goal.

Relevant paths:

- `pi/extensions/goal.ts:2574-2664`
- `pi/lib/workflow-worktree.ts:520-589`
- `pi/extensions/loop.ts:152-163`

If the process stops or goal-state persistence fails after ownership deletion but before the completed goal update, Git contains the completed result while durable goal state remains active and points at removed recovery resources. Existing recovery handles archive, commit, merge, and cleanup failures while ownership still exists, but not this post-closeout acknowledgement window.

A broad operation journal is not required. The viable minimal direction is a bounded goal-side closeout intent or acknowledgement that is persisted before destructive closeout and reconciled from authoritative Git state on resume. It must contain enough stable identity to locate the primary repository and expected branch result after the owned worktree and branch are removed. It must not claim that Git operations succeeded before Git proves them.

## Reviewed behaviors not accepted as defects

### Goal item wait while the goal remains running

An item may enter `needs_operator` while the overall goal remains `running`. This allows independent ready items to continue. The item phase blocks retries, completion rejects unresolved waits, and the loop maps quiescent execution to `waiting_for_operator`. The transient `continues: true` response can be confusing when every item waits, but no unsafe action or lost recovery was established.

### Successful goal attempt while durable task remains assigned

`record_outcome: success` settles attempt and recovery state but does not complete the durable task. This is intentional separation: the task registry owns validated task completion and requires bounded outcome evidence. Goal completion correctly rejects the still-assigned task.

### Subagent cancellation response before process settlement

`subagent_control cancel` returns `cancelled` after cancellation is accepted while the broker may retain `cancellationPending` and the run manager may remain `running`. The contract explicitly separates cancellation, process settlement, and permit release. The result naming is potentially ambiguous, but no incorrect caller action or process leak was demonstrated.

### `bg_start` evaluated as Bash by damage control

`bg_start` correctly receives Bash command safety analysis before spawning. Some damage-control records identify the policy engine as `bash` rather than preserving the invoked tool name. This can reduce telemetry precision, but the authorization result and managed-process behavior remain correct.

### Generic durable background completion

Background subagent and terminal results are explicitly process-local, survive same-process session replacement, and retry failed follow-up delivery on a later settled turn. No contract promises durability across process exit.

### Per-Git-operation closeout journal

Existing worktree closeout stages reconcile archive, commit, merge, and cleanup against authoritative Git and filesystem state. A second per-operation journal would duplicate those authorities. The accepted gap occurs after successful ownership cleanup and before goal completion acknowledgement, not within the existing Git closeout stages.

## Rejected broad mechanisms

### Generic workflow incident state machine

A generic incident layer would need to infer resource identity, whether mutation occurred, which actions are cleanup, and when recovery is verified across arbitrary tools and shell commands. The workflow command does not reliably possess this information. Resource-specific managers should retain lifecycle authority.

### Global retry controller

Retry semantics differ across reads, process launches, migrations, provider calls, and uncertain external mutations. A global controller would flatten those differences and could retry unsafe operations or block required recovery. Existing owners already implement bounded retries where their operation semantics are known.

### Independent per-operation journal

A new journal would compete with Git, SQLite task state, goal jobs, process managers, the tree broker, and worktree ownership. Any disagreement would require another precedence and reconciliation system.

## Rejected general execution evidence journal

A conventional recovery journal does not determine whether code is necessary. A non-authoritative execution evidence journal was explored as a way to correlate planned work, repository state, failures, retries, and validation. The telemetry investigation and subtractive review reject the general journal: session entries already preserve execution evidence, Git owns final state, and plan/task/goal/process systems own their lifecycles. The schema below is retained only as the discarded design that was tested; do not implement it.

Potential benefits:

- identify repeated commands that produce the same failure against an unchanged repository fingerprint;
- bind passing validation to the exact tracked repository state it exercised;
- invalidate stale validation after later tracked mutations;
- expose changed files, dependencies, schemas, public interfaces, and other scope expansion;
- trigger a focused subtractive review only when consequential expansion occurs;
- provide evidence for later workflow-friction analysis without becoming lifecycle authority.

Potential bounded event fields:

```ts
type WorkflowEvidenceEvent = {
  workflowId: string;
  planPath?: string;
  taskKey?: string;
  operationId: string;
  kind:
    | "mutation"
    | "validation"
    | "failure"
    | "scope_expansion"
    | "task_completion"
    | "closeout";
  startedAt: string;
  settledAt?: string;
  repositoryFingerprint?: string;
  commandFingerprint?: string;
  resultFingerprint?: string;
  changedPaths?: string[];
  outcome: "started" | "passed" | "failed" | "uncertain";
};
```

This shape is exploratory. Commands and results would need bounded, redacted fingerprints rather than raw secret-bearing content.

The journal should not own workflow state. Existing authorities remain:

- canonical plan for plan execution progress;
- task registry for task state and dependencies;
- goal job for attempts and recovery;
- run manager and broker for process state;
- Git for repository state;
- worktree ownership for Git closeout.

Only consequential checkpoints should be recorded. Reads, searches, thoughts, and routine UI activity should not create journal entries.

The investigation rejected task-mutation timestamps, repeated-failure gates, and scope-expansion events as separate mechanisms. One narrower question survives: whether workflow completion should consume a bounded validation receipt tied to the relevant repository state. That is a completion invariant, not a journal feature, and remains deferred because validator scope and repository-state semantics are unresolved.

## Investigation before adding a journal

The investigation inspected existing Pi telemetry before considering storage or schemas. It determined whether current workflow, trace, friction, subagent, background-terminal, damage-control, and usage events already contain:

- workflow and task correlation;
- command and result fingerprints;
- repository HEAD and dirty-diff identity;
- changed paths;
- validation timing and observed exit result;
- retry and repeated-failure sequences;
- closeout start and settlement boundaries.

The investigation produced:

1. an event-source and field matrix;
2. example reconstruction of the Herdr T3 attempt sequence;
3. explicit missing fields that prevent churn, freshness, or scope-drift analysis;
4. a minimal derived analysis or projection using existing events where possible;
5. new event fields only where a demonstrated query cannot be answered;
6. independent adversarial reviews of both findings and proposed additions.

Do not implement journal storage, enforcement gates, or workflow changes during this investigation.

## Telemetry investigation findings

This section records the source inspection and reconstruction that the later independent reviews challenged. It remains diagnostic, not an implementation plan.

### Sources and usable fields

| Source | Observed useful evidence | Demonstrated limit |
| --- | --- | --- |
| `session_entries` | Exact tool-call IDs, tool names, arguments, results, timestamps, errors, and parent-linked session entries | The current typed `session_id`, `turn_id`, and `trace_id` fields were null. A session file contains branch history: logical conversation reconstruction must follow raw `id` and `parentId`, while live-state forensics must also retain executed tool calls from later-abandoned branches because their side effects survive. Raw arguments and results are sensitive and unsuitable as a routine workflow ledger. No repository fingerprint or plan/task identity is attached. |
| `friction_interactions` | Per-interaction duration, tool, failure, validation, subagent, and file-mutation counts plus selection reasons | Metadata contains counts, not operation identities, paths, outcomes, repository fingerprints, or validation-to-mutation ordering. Its durable metadata omits `repoRoot` even though the in-memory packet has it. |
| `friction_reviews` | Selected interaction, repository root, classification, short evidence, and suggested change | Completed records store the review result but not the bounded tool traces used to produce it. Failed records can show reviewer transport or context failures but not an operation timeline. |
| `orchestration_events` | Subagent execution kind, outcome, status, interaction ID, orchestration ID, duration, and bounded usage data | None of 1,832 observed run or interaction records carried a task ID through the projected data. These events do not record repository mutations or validation state. |
| `background_terminal_events` | Operation ID, running or settled state, duration, and byte count | The observed T3 records lacked command, cwd, session, tool-call, workflow, task, and repository identity. They can prove lifecycle settlement but cannot independently identify what was run. |
| `damage_control_events` | Rule-triggered decision, policy tool name, cwd, tool-call ID when available, and bounded labels | This is a decision log, not a complete command log. T3 validation attempts did not produce matching damage-control records. The repeated-tool guard records fingerprints only when it blocks. |
| `workflow_events` | Contractually intended to record `/plan-it` and `/do-it` dispatch | The registered source contained zero records. Direct source inspection found `startWorkflowEpisode()` and `noteWorkflowSubmission()` only in the `plan-it` handler; neither the initial nor post-session-replacement `doItHandler` path calls them. Observed interactions from both inspected `/do-it` sessions were consequently classified as `explore`, not `engineer`, and had no workflow episode correlation. The owning contract also limits these events to dispatch facts and explicitly excludes implementation, validation, review, and archive completion. |
| `trace_events` | Potential generic trace projection | The registered source contained zero records for the inspected store. |
| Task registry | Current task state, dependency graph, bounded terminal outcome while retained | It is not an audit history. Standalone completed tasks and completed graphs are intentionally removed by startup pruning. No registered task-transition event source preserves who pruned them. |
| Git and worktree ownership | Authoritative current files, diff, commits, branches, worktrees, and staged closeout state | Current Git state cannot prove which repository state a past validation command exercised unless that identity was recorded at validation time. |

A correlation-coverage snapshot reinforced those limits. Of 7,262 friction-interaction records, none carried a workflow episode ID or repository root, 30 carried a task ID, none carried a goal ID, and 1,277 carried a correlation session ID. All 38 background-terminal records carried an operation ID, while none carried a session, tool-call, workflow-episode, or task ID. Of 3,596 damage-control records, 2,611 carried a tool-call ID and none carried a workflow episode ID. These counts describe the inspected local store, not a universal schema guarantee.

### Existing mechanisms that already overlap the journal idea

`pi/lib/workflow-friction.ts` already assigns a process-local mutation generation to tool traces. It detects repeated failed commands and repeated validation commands when the normalized command repeats within one interaction without an intervening recognized mutation tool.

`pi/extensions/damage-control.ts` already fingerprints repeated tool calls and results. Its guard resets on ordinary input and `agent_settled`, so it intentionally prevents loops within one agent run rather than detecting repetition across workflow interactions.

`pi/extensions/quality-gates.ts` already hashes target content, validator input, and relevant configuration. It suppresses duplicate model-initiated validation when the same evidence already passed or failed. That evidence is process-local and applies to configured per-file quality validators rather than arbitrary project validation commands, but the hashing mechanism is a working example to reuse.

Unattended `/goal` already has a durable chronological freshness proxy. A passing `goal_progress validation` must match a successful Bash or PowerShell result observed by the current Pi process. Completion rejects validation recorded before the latest required task completion and also requires a clean final worktree. It does not bind the validation to repository content, and foreground `/do-it` has no equivalent completion check, but a new design must reuse or narrow this behavior rather than duplicate it.

These mechanisms make a new general-purpose operation journal less justified. The remaining questions are about correlation lifetime and validation scope, not absence of all supporting machinery.

### Herdr T3 reconstruction

The query followed the parent-linked ancestry of the current session leaf rather than treating every entry in the session file as active history. The inspected active-lineage window was 2026-09-02 20:05 through 20:40 UTC and contained 115 records.

Within that window:

- six commands invoked `herdr-surface.live.test.ts`;
- five used the same core one-file command, four through foreground Bash and one through `bg_start`;
- one combined the unit and live test;
- the first live failure exposed a distinct malformed Herdr tab response and redundant cleanup close;
- the remaining five live failures reported the same foreground-process-group assumption;
- seven recognized `edit` or `write` calls occurred during the wider window, including the temporary live test and later focused probe;
- the background invocation settled as failed after 12.8 seconds;
- a direct Pi pane probe showed Pi visibly complete while `pane process-info` remained insufficient for the adapter's process-identity assumption;
- the final focused Node probe established that the Herdr response could report only the pane shell while the launched Node process was visibly running.

A later branch performed a second live sequence in owned workspace `w15`:

- ten commands enabled `PI_HERDR_T3_LIVE=1` between 22:53 and 23:28 UTC;
- nine failed and the tenth passed;
- failure modes progressed through immediate exit, nested Vitest worker misuse, malformed response, a 30-second outer timeout, repeated process-exited-before-completion results, a 180-second outer timeout with a visibly completed but no-longer-active broker run, and a final snapshot assertion mismatch;
- direct pane execution proved the resolved Pi command independently of the broker before the later end-to-end attempts;
- implementation or harness edits preceded most retries, including CLI base arguments, process visibility and lifetime, response normalization, temporary extension loading, fixture path, and snapshot-field correction;
- the final run passed in 18.93 seconds, and the remaining owned `w15` pane was closed afterward.

Across both windows, sixteen live test executions produced fifteen failures before one pass. Not every failed attempt was identical or valueless. The sequence found real defects, and most reruns exercised changed state. The churn was entering end-to-end live validation with an unstable harness and continuing to use live execution to isolate harness, timeout, generation, and fixture problems. A rule limited to repeated commands against an unchanged repository would have missed most of it. The existing stop-and-isolate discipline was the relevant control.

The reconstruction required querying content-bearing session records, flattening assistant tool-call arrays, joining exact tool-call IDs to results, distinguishing conversational branch ancestry from physical tool executions, and manually comparing mutations with failure signatures. Active lineage alone is insufficient for live-state forensics because a tool call on a later-abandoned conversation branch can still mutate files or external resources. None of the metadata-only sources can reproduce that conclusion alone.

### Demonstrated limits and gaps

#### Validation freshness

No existing durable source binds an arbitrary project validation result to:

- repository root and owned worktree;
- HEAD;
- tracked diff or tree fingerprint before and after execution;
- command fingerprint;
- exit outcome;
- plan, task, or goal identity.

Consequently, current telemetry cannot determine whether cited final validation still matches the final tracked implementation after later edits. Quality-gate evidence proves the mechanism for configured per-file checks, but it does not cover commands such as focused Vitest suites, typecheck, or `git diff --check` used by `/do-it`.

#### Cross-interaction churn analysis

Existing friction detection resets mutation generation with each interaction, and the damage-control loop guard resets at `agent_settled`. Metadata can flag a long interaction with repeated failures, but it cannot automatically compare the same failure across interaction, compaction, session replacement, foreground/background tool, or workflow continuation boundaries. Canonical content-bearing session entries retain enough evidence for a manual retrospective, so this is an automation limit rather than a demonstrated storage gap.

The T3 reconstruction required treating foreground Bash and background-terminal invocations as semantically related even though their tool and argument envelopes differed. It also required distinguishing active conversational lineage from tool executions whose filesystem or Herdr effects survived later branch changes. Existing metadata cannot make either comparison.

More importantly, the full sequence disproves unchanged-state repetition as a sufficient churn detector. Most later failures followed a mutation and exposed a different boundary, yet the aggregate sequence was still avoidable because the live harness was not proved before use. Repository and result fingerprints can support a retrospective, but they cannot replace boundary-specific stop discipline or reliably gate this class of debugging.

Existing friction telemetry did detect `duration_over_10m` and `repeated_tool_failure` for the later T3 interaction. Its metadata recorded a 5,593,598 ms interaction with 188 tool calls, 24 tool failures, 32 validation commands, and 31 recognized file mutations. Its automatic review nevertheless classified the interaction `productive`, reasoning that each retry followed failure isolation and produced actionable evidence. Preserve that disagreement: each individual retry may have advanced diagnosis, while the aggregate still used live runs to expose several harness, fixture, timeout, and field-name defects that could have been proved non-live. The detection signal existed; the disputed part is contextual judgment, which a deterministic same-command gate would make worse rather than settle.

#### Scope correlation

Current Git identifies final changed paths, and the canonical plan identifies intended scope, so no additional correlation is required for final closeout review. Aggregate friction metadata and background-terminal events cannot independently reconstruct historical path expansion, but no concrete scope question requiring that history was demonstrated.

### Candidate minimal directions for review

1. Do not add a general operation journal.
2. Reconcile the documented `/do-it` dispatch event with the actual handler before adding later workflow events. Record it once on the post-session-replacement execution path, not once before clearing and again after continuation.
3. Derive churn retrospectives from session entries and existing friction data before persisting more operation detail. Preserve both conversation lineage and physical tool-execution history in the analysis. Do not use an unchanged-repository rule as a hard gate; it would have missed most of the demonstrated T3 churn.
4. Reuse quality-gate evidence hashing only if a narrow workflow validation receipt is selected for explicit project-level validation. Bind it to the owned repository state and invalidate it after a later relevant mutation.
5. Use current Git diff plus the canonical plan at closeout for scope review. Add historical changed-path events only if a concrete question cannot be answered from final Git state.
6. Repair only source-proved correlation failures before defining another event authority. The admitted case is missing `/do-it` dispatch telemetry; null fields in the local corpus do not justify broad propagation work.
7. Do not store raw commands or outputs when bounded fingerprints and selected redacted fields answer the query.

If exact validation freshness is selected as a completion invariant, final completion evidence should not cite a validation receipt whose declared relevant repository state differs from the final implementation state. For unattended `/goal`, the existing rule that validation must follow the latest required task completion should remain the chronological first line rather than being replaced by a second task-timestamp policy. Foreground `/do-it` lacks either check.

Repository fingerprint enforcement still requires explicit semantics for plan-status edits after validation, untracked in-scope files, generated-file noise, commands that intentionally mutate tracked state, multi-repository work, submodule state, and validations whose proper input is narrower than the entire repository.

## Independent review outcomes and final judgments

Five independent reviews challenged the telemetry draft. Four reviewed the initial reconstruction through disproof, impact, ownership, and subtractive lenses. A fifth reviewed the expanded sixteen-run T3 sequence. Their terminal outputs are preserved in local subagent artifacts and sessions; no review was rerun after compaction.

### Admitted

1. **`/do-it` dispatch telemetry violates its existing contract.** The tracked contract says `/plan-it` and `/do-it` dispatch each create one workflow episode and event. `startWorkflowEpisode()` and `noteWorkflowSubmission()` are called only by the `plan-it` handler. Neither the initial clear path nor post-clear `doItHandler` execution records `/do-it`. The inspected store had no workflow events, and interactions from both inspected `/do-it` sessions were classified as `explore`. This is a source-proved owner-local defect with missing handler-level coverage.
2. **Exact project-validation freshness is not durably provable.** Existing quality gates hash one target plus selected configuration for configured validators, and unattended goals require observed successful commands after required task completion. No existing receipt ties arbitrary project checks to the exact relevant repository state consumed at completion. This is a demonstrated observability deficiency and a reachable general stale-validation path, but no incorrect T3 completion from stale validation was demonstrated.
3. **Metadata-only churn analysis is insufficient, but canonical session evidence is sufficient.** The full T3 sequence was reconstructed from existing session entries. Therefore there is no demonstrated need for new journal storage. The supported limitation is that the reconstruction is manual and requires tool-call/result joins, branch-aware analysis, and contextual judgment.
4. **The T3 sequence demonstrates delayed failure isolation, not sixteen equivalent retries.** Sixteen live test executions produced fifteen failures before one pass. Most later attempts followed mutations and exposed different boundaries. A same-command/unchanged-repository gate would have missed the dominant pattern. The smallest supported response is a read-only retrospective projection plus existing boundary-specific incident discipline, not a retry controller.

### Rejected or deferred

- Reject a general execution journal, durable changed-path history, copied operation outcomes, and cross-session raw command/result hashes.
- Reject historical scope events. The canonical plan plus final Git diff is authoritative for closeout scope review.
- Reject broad correlation-field expansion based only on null local records. Repair exact propagation only where a source-proved consumer path fails, beginning with the admitted `/do-it` dispatch defect.
- Defer a hard validation-fingerprint gate. Whole-worktree fingerprints can reject valid completion because of plan edits, generated files, unrelated changes, mutating validators, submodules, or multi-repository work, while an overly narrow fingerprint can accept invalid evidence.
- If validation freshness is selected, reuse only the quality-gate hashing technique. The `/do-it` or goal completion owner must own the receipt and define validator-declared scope; telemetry and quality-gate process state must not become competing completion authorities.
- Persisted fingerprints must not hash raw predictable commands, paths, URLs, or output into durable metrics because unsalted hashes remain dictionary-matchable and linkable.

### Preserved disagreement

Existing friction telemetry selected the later T3 interaction for duration and repeated failures, then classified it `productive` because each retry advanced diagnosis. The expanded review classified the aggregate as a failure-isolation problem because many harness and fixture defects could have been proved at cheaper non-live seams. Both observations stand: individual attempts produced evidence, while the sequence still incurred avoidable live-debugging cost. Deterministic repeat blocking cannot resolve that contextual judgment.

### Evidence locations

- Disproof: `C:/Users/mglenn/AppData/Local/Temp/pi-subagent-artifacts/1788396131425_45524_1_code-reviewer_output.md`
- Impact: `C:/Users/mglenn/AppData/Local/Temp/pi-subagent-artifacts/1788396091241_45524_2_reviewer_output.md`
- Ownership/lifecycle: `C:/Users/mglenn/AppData/Local/Temp/pi-subagent-artifacts/1788396104254_45524_3_security-reviewer_output.md`
- Subtractive: `C:/Users/mglenn/AppData/Local/Temp/pi-subagent-artifacts/1788396122744_45524_4_reviewer_output.md`
- Expanded T3 review session: `C:/Users/mglenn/.pi/agent/sessions/subagents/2026-09-03T01-09-10-268Z_7eb8803b-32a7-4e54-920e-ec8a6105a3e6.jsonl`
- T3 execution source: `C:/Users/mglenn/.dotfiles/pi/sessions/--C--Users-mglenn-.dotfiles--/2026-09-02T21-44-47-350Z_01a06414-e9f6-7d05-a63e-a8a56a65e500.jsonl`

These local runtime paths are supporting evidence, not tracked artifacts, and may be pruned under their existing retention policies. The bounded facts needed for the durable audit are recorded in this file.

## Open decisions

### Required skipped-task policy

Decide whether a required task may ever satisfy goal completion in state `skipped`.

- Contract-preserving default: no; foreground behavior should match unattended behavior.
- Policy change: yes, but define waiver authority and substitute evidence.

### Meaning of goal completion

Decide whether `completed` means:

- objective, merge, cleanup, and durable completion report all succeeded; or
- objective and merge succeeded while cleanup may remain in a separately recoverable phase.

The current contract uses the first meaning. A goal-side closeout intent can preserve that meaning without marking completion early.

### Validation freshness policy

Decide whether exact project-validation freshness warrants a completion-owned receipt.

- No change: rely on final validation discipline and the existing unattended goal timestamp check.
- Diagnostic first: report repository-state mismatch without blocking completion.
- Hard gate: requires validator-declared scope and explicit before/after semantics; a universal whole-worktree fingerprint is rejected.

## Task registry handoff correction

The audit used durable task records for inventory, adversarial review, and synthesis. Later `task get` calls returned `not_found` for completed audit records. Source and executable tests show that `pruneTaskRegistry()` intentionally deletes standalone completed tasks and completed dependency graphs during Pi session startup. A read subagent process started after the audit tasks completed, so the disappearance is consistent with that lifecycle.

No registered task-transition or pruning event proves which process performed the deletion. The earlier notes incorrectly called the disappearance an anomaly. It is not admitted as a defect. Task records are durable todo and dependency state, not durable completion history. This notes file and the cited repository evidence remain the handoff.

## Next actions

1. Do not mutate or validate the Herdr worktree from this audit session. Its current plan marks T3 and T4 complete and contains in-progress T5 changes from the separate `/do-it` continuation.
2. Select whether to repair the admitted `/do-it` dispatch telemetry defect as a narrow existing-contract fix.
3. Select no change, diagnostic-first, or completion-owned enforcement for exact validation freshness before any design or implementation work.
4. Return separately to the required-skipped-task and goal-closeout-persistence findings. They remain accepted but unimplemented.
5. Add no journal storage, historical path events, or cross-session retry controller.
