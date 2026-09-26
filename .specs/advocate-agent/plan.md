---
created: 2026-09-26
status: draft
completed: null
---

# Add an on-demand Advocate and background feedback learning

## Goal and authorization

Give the orchestrator a distinct advisor that understands Mike's demonstrated reasoning, preferences, exceptions, and revisions. Improve the existing `agent-process` workflow so deeper feedback investigation and permitted knowledge maintenance happen in a background worker rather than displacing the active task.

**Authorized now:** planning only. No implementation, active instruction changes, commits, pushes, or runtime activation are authorized by the request to write this plan.

**Planning revisions:** Mike requested shared knowledge ownership under `agent-process`, generalized instruction diagnosis/evaluation under `prompting`, preservation of intent alongside observed outcomes, and evidence-informed routing lessons. Concurrent-writer machinery is explicitly deferred. The procedure, research, and limits are recorded in [evaluation-design.md](evaluation-design.md). Remaining role defaults/tools and implementation details below are recommendations for plan review, not execution authority. There are no remaining broad historical-research prerequisites.

### Settled requirements

- Advocate is a distinct, on-demand advisory responsibility. It compares whole approaches with current intent and relevant precedent, including architecture, sequencing, safeguards, validation, workflow cost, and completeness. Those are not separate review programs.
- It is not an approval gate, defect reviewer, staffing planner, or post-implementation Steward. It can identify underengineering and premature stopping as well as unnecessary complexity.
- Current instructions and explicit requests take precedence over historical inference. Precedent never grants permission to mutate, deploy, publish, or bypass applicable policy.
- Genuinely comparable precedents can resolve a consequential choice without asking Mike. When consequentially unsure, ask a focused question with a recommendation. Routine implementation details remain agent-owned.
- Advocate may challenge an established preference: explain the usual approach, what differs now, and why an alternative may better serve the goal, then ask Mike.
- Preserve current `agent-process` feedback triggers and timing. The orchestrator handles immediate correction; a writable background worker investigates and updates permitted knowledge before reporting back.
- That worker decides whether evidence would change advice on a comparable future problem. One clear correction can suffice. Repetition, scores, fixed thresholds, separate reviewers, periodic review, and an experiment for every update are not required.
- Knowledge maintenance may update precedents, reasons, applicability, exceptions, uncertainty, and related feedback records. Changing core instructions, authority, responsibilities, permissions, or consultation triggers requires specific approval.
- Existing adequate guidance misapplied need not be rewritten. A concise record-only or no-knowledge-change result is valid.
- `agent-process` owns feedback records and curated decision knowledge; Advocate consumes that same knowledge. Separate evidence of what happened, understanding useful for future decisions, and governing instructions. Use plain Markdown with linked references, not another skill, database, generated-summary layer, or wholesale log migration.
- `prompting` owns the general procedure for diagnosing instruction failures and evaluating improvements against user intent; writer applies it. Preserve the intent and its boundaries independently of prompt versions. Test useful changes through proportionate observations, not only wording checks.
- Evaluation can inform conditional model-routing rules of thumb for Strategist. Distinguish model fit from assignment quality, available inputs, tools, and environment. No automatic routing-policy changes or formal statistical machinery are required.
- Concurrent learning writers are a deferred, non-blocking concern for this personal experiment. Do not build coordination machinery without an evidenced need.

### Out of scope

No new service, database, background scanner, event hook, automatic transcript ingestion, scheduler, evaluation framework, approval ledger, custom command, or general-purpose memory system. No wholesale feedback-log migration or additional weekly research. No legacy-profile changes, submodule work, MPS/ICP task resumption, or unrelated instruction cleanup. The bounded `prompting` procedure and local learning-to-advice exercise below are in scope; a permanent evaluation platform, automatic bandit router, model benchmark sweep, and speculative writer locks/queues are not.

The notes' separate proposals to revise planning review and add general findings-before-delegation policy remain deferred. They are not dependencies or acceptance criteria here. Routing and discovery changes are limited to making Advocate available and giving Strategist access to relevant learned guidance, not rewriting every role's assignment policy.

## Fresh-context handoff

All implementation paths below are relative to `C:/Users/mglenn/.dotfiles` unless identified as proposed or absolute. Dotfiles owns all changes. Read current applicable `AGENTS.md` files before execution.

### Required evidence and owners

- [Research and agreed direction](notes.md): start with **Combined research synthesis**, **Operator clarification**, **Recommended Advocate shape**, and **Agreed learning loop**. Read weekly evidence as needed when seeding knowledge; do not repeat the broad historical review.
- [Intent-led evaluation design and sources](evaluation-design.md): current operator direction, flexible comparison procedure, evidence/routing interpretation, and concurrency deferral. This supersedes the earlier offline-only validation proposal.
- `pi/profiles/default/skills/agent-process/SKILL.md` and its `references/instruction-feedback.md`, `failure-log.md`, and `context-separation.md`.
- `pi/profiles/default/skills/prompting/SKILL.md`, `skills/skill-creation/SKILL.md`, and `skills/pi-extension/references/instruction-composition.md`.
- `pi/profiles/default/docs/subagents.md`; implementation owners `agents/*.md`, `lib/subagents/{definitions,guidance,options,launch}.ts`, and `extensions/{subagents,subagent-child}.ts`.
- Installed Pi `docs/skills.md` for native discovery. Resolve the installed package at execution time, not from a historical package-store hash.

### Verified starting behavior, September 26

Inspected default profile at dotfiles `main`, revision `2947630a`. `PI_CODING_AGENT_DIR` resolves to `C:/Users/mglenn/.dotfiles/pi/profiles/default`. Source inspection, not a runtime experiment, established:

- Roles are Markdown definitions. The catalog and tool/delegate ceilings are already generated and enforced. No new role-specific transport is needed.
- Advisor defaults to Sol low. Writer already has read, search, shell, edit/write, analytics, and parent-question tools; its generic prose role permits investigation and synthesis when assigned. No worker-specific tool expansion is necessary.
- Team Lead delegates are explicit. Adding Advocate to its list is a permission change, proposed below. Council and other leaf permissions need not change.
- Ordinary children do not inherit the parent's conversation or automatic skill discovery. Explicit role/assignment skills resolve to files; native discovery advertises descriptions and paths, not full skill bodies. A role must read the relevant skill and references.
- `childLaunch` already loads `log-analytics-tool.ts` when `log_analytics` is permitted. A child `tool_search` cannot broaden its frozen tools.
- `agent-process` currently performs its investigation and logging in the invoking context, offers context separation when useful, and requires approval for instruction changes. It has no background learning dispatch or Advocate knowledge home.
- References beneath a skill are not all injected or watched as independent reloadable resources. Fresh file reads can see updated knowledge; edits cannot replace already-loaded conversation text. New role definitions and routing use the existing settled-only reload/fresh-session boundary.
- Existing guidance tests include exact prose expectations and composed-size ceilings. They are not authority to preserve wording that this approved change supersedes.

**Preserve:** `.specs/advocate-agent/notes.md` has task-owned uncommitted research changes. Recheck status before editing; other sessions may change the checkout. Carry this entire spec into the task worktree without discarding its source. Do not edit historical sessions or copy transcript corpora into the repository.

**Execution location, proposed:** branch `plan/advocate-agent`, dedicated sibling worktree `C:/Users/mglenn/.dotfiles-worktrees/advocate-agent`. Record the actual path/branch before implementation. Integration target: `C:/Users/mglenn/.dotfiles`, branch `main`. These are local implementation/closeout targets after execution authorization, not permission to create them now.

**Profiles:** verified planning profile and intended implementation profile are both default. Legacy remains excluded from implementation/testing. Native historical references already recorded from both profiles may be consulted read-only if a specific source ambiguity matters. No temporary inventory/renderer is a runtime dependency.

## Implementation design and remaining recommendations

### 1. Advocate role and consultation

Add proposed `pi/profiles/default/agents/advocate.md`:

- Default `model: sol`, `effort: low`, matching the existing advisory role's starting point. This is a product-role default proposal, not staffing prescribed for plan tasks or a claim of measured superiority. Use existing model override behavior; add no special floor, fallback, or retry policy.
- Tools: `read`, `grep`, `find`, `ls`, `tool_search`, `log_analytics`, `subagent_parent`. No edit/write, shell, web, or delegation tools. This supports reading current project facts and targeted local history without giving the advisor implementation ownership.
- Skills: existing `agent-process` and `pi-log-analytics`; `delegates: []`.
- Use the resolved `agent-process` skill location to find `references/knowledge/index.md`, then read relevant topic references. The role is a knowledge reader, not an invocation of feedback investigation or maintenance. Give the skill an explicit reader path so loading it for advice does not trigger worker dispatch or logging. Use current task facts supplied by the parent and inspect local evidence when needed. Retrieve exact historical context only when it could change advice; do not restart corpus research.
- Return a recommendation, relevant reasoning and contextual limits, and any consequential unresolved question. No required response schema, score, approval status, or exhaustive concern classification.

Make Advocate available to the orchestrator and Team Leads through the existing role catalog and a short shared routing paragraph in `lib/subagents/guidance.ts`. Add it to `agents/teamlead.md` delegates. Leave Council membership and other leaf authority unchanged.

Consultation is discretionary and on demand, including when the parent wants help comparing materially different approaches, interpreting a discovered conflict, or deciding whether a proposed workflow fits Mike's intent. No required call on every task, plan, review finding, or commit. It does not replace required Strategist or Steward consultations. A standalone consultation can use the existing context-conservation delegation exception; it needs no new Strategist exception or dispatch mechanism. Preserve current background/foreground justification, visibility, retention, and cleanup behavior.

Assignments carry the current goal, relevant settled decisions, proposed approach or alternatives, consequential uncertainty, and enough evidence/source pointers to reason without the parent's hidden conversation. These are useful contents, not mandatory fields or another assignment template.

**Why this package:** Sol low is an established advisory default; a read-only leaf keeps advice separate from maintenance. Existing catalogs, analytics loading, and child isolation already supply the needed mechanics.

### 2. One knowledge home with three distinct layers

`agent-process` owns learning and its data. Advocate reads the resulting knowledge without starting a learning cycle or approving worker updates. Keep the existing logs and add curated references beneath the same skill:

```text
pi/profiles/default/skills/agent-process/
  SKILL.md                           # existing governing procedure, revised
  references/
    instruction-feedback.md          # existing feedback evidence
    failure-log.md                   # existing workflow-failure evidence
    context-separation.md            # existing optional discussion guidance
    learning-worker.md               # proposed worker procedure
    knowledge/                       # proposed curated decision knowledge
      index.md
      decisions-and-scope.md
      validation-and-delivery.md
      safeguards-and-state.md
      architecture-and-workflow.md
```

**Evidence: what happened.** The two existing logs retain corrections, context, attempted remedies, known outcomes, and source references. Preserve their existing IDs and records. Link relevant entries to the knowledge they change where useful; do not backfill links throughout the historical logs or reproduce all researched incidents there. Feedback and failure records remain evidence, not executable instructions.

**Intent and evaluation evidence.** Preserve the desired behavior, its reason and boundary, and relevant operator/source decision alongside the owning knowledge or feedback record. Link comparative observations to that intent and the actual instruction/knowledge/model configuration. Keep short results in existing feedback records and longer task-specific comparisons with their owning experiment. No new registry or mandatory per-instruction schema. A prompt revision records what changed; outcome evidence establishes what, if anything, improved. See [the evaluation design](evaluation-design.md#what-needs-to-persist).

**Curated knowledge: what it means for future decisions.** The small index helps Advocate and the learning worker find relevant topic passages without reading all logs or the research document. A useful passage explains the preference or reasoning, its purpose, applicability, important exceptions or counterexamples, and unresolved uncertainty, with links or native source pointers to supporting decisions. These are useful contents, not mandatory fields or a record schema. Group by actual decision areas; the four topic filenames are adaptable organization, not a fixed taxonomy.

Keep the current understanding clear while retaining meaningful revision history through evidence links. A later reversal should revise or replace the misleading advice, not leave both versions as equally current rules. Preserve the contextual reason when two apparently opposing decisions both remain useful. Do not flatten informed revisions into blanket preferences or erase evidence of an earlier decision.

**Governing instructions: who may do what.** `SKILL.md`, worker procedure, role definitions, and routing own responsibilities and permission boundaries. They link to knowledge but are not maintained under the worker's standing knowledge-write authority. Advisory knowledge can evolve without silently changing those instructions.

The existing skill supplies location discovery and distinct reader/invoker/worker guidance. Its reader path points to the index; its learning path explains investigation and maintenance. The Advocate role explicitly selects the reader path. No additional knowledge skill, mirrored copy, generated summary, synchronization registry, or always-loaded preference body is needed.

Seed references from the completed notes, not from another full retrieval. Preserve the supported distinctions, positive choices, reasons, exceptions, and revisions. Prefer concise representative evidence over an exhaustive incident catalog. Keep source profile/session/message pointers with important precedents and mark inference or unresolved outcomes where relevant. Preserve parent-checked versus Lead-checked evidence limits when they affect confidence; recheck only disputed or insufficient anchors before strengthening a claim.

Current direct clarifications must survive distillation: interruption costs; functionality/regressions versus superseded assertions; newly discovered conflicts returned to the parent; uncertainty resolved from genuinely comparable precedent or asked about; and permission to challenge established preferences. The current request must not be subordinated to historical examples.

The seed must retain contrasts such as disposable prototypes versus valuable single-user state, complete delivery versus extra machinery, useful protection versus ineffective proxies, conventional defaults versus explicit consequential targets, and informed revisions versus blanket prohibitions. The result is decision knowledge, not new executable policy, an incident count, or a biography.

The research notes remain an archival evidence source, not a file every consultation must load. Keep runtime references independent of `.specs` location and temporary files. Do not copy secrets, raw transcripts, incidental live inventory, or private operational detail into the new references.

### 3. Background learning through the existing writer

Revise `skills/agent-process/SKILL.md` around its existing feedback triggers, with longer worker guidance in proposed `references/learning-worker.md` only where needed for concision. Link to `references/knowledge/index.md` and the existing two logs. Distinguish knowledge reading from a triggered learning investigation: reading for Advocate advice alone requires neither a feedback record nor worker dispatch.

The invoking orchestrator:

1. Handles the immediate correction and keeps the task moving where possible.
2. Launches one background `writer` for the triggered investigation and permitted maintenance, using existing tools. Pass `agent-process`, `prompting`, and `pi-log-analytics` as explicit skills and identify the assignment as learning-worker work. Reuse writer's Sol-low default rather than adding another role or model policy.
3. Supplies the feedback, current intent and authority, relevant source/session pointers, known resolution or uncertainty, and the actual writable paths. Resolve these from the active skill locations, not a guessed HOME or the task's cwd. Use the existing context-conservation exception, not a preliminary staffing consultation for this single worker.
4. Continues independent work, then incorporates the concise automatic result or asks Mike the remaining consequential question. Do not poll or retain a completed worker for hypothetical follow-up.

The writer is already the worker: it performs investigation, learning judgment, and allowed edits itself. The worker section must not recursively tell it to dispatch another worker. It may request a missing factual input through `subagent_parent`. It does not take over implementation of the original task.

**Standing learning write boundary proposed for installation:** within `skills/agent-process/references/`, the existing `instruction-feedback.md` and `failure-log.md`, plus `knowledge/` including its navigation index. Maintain the current records; do not delete unrelated feedback or rewrite history to hide earlier decisions. Read current file contents and use precise edits that preserve concurrent unrelated changes.

**Not in that boundary:** `agent-process/SKILL.md`, `learning-worker.md`, `context-separation.md`, other skills, role definitions, `AGENTS.md`, routing/tool guidance, executable code, settings, or any other repository. Changes to these remain proposals requiring approval. Ordinary knowledge edits do not authorize a Git commit or push. This is a role/assignment policy boundary using existing writer authority, not a claimed filesystem sandbox or a new enforcement subsystem.

The learning decision is whether this evidence would change advice on a comparable future problem. Find relevant existing knowledge and feedback before adding another passage. Read the proposal/correction/remedy chain and relevant contrasts; separate direct testimony, generated assignments, approval, reported recovery, and demonstrated effectiveness. One clear correction can justify an update. If guidance was adequate but misapplied, or existing knowledge already covers the case, report that without manufacturing another rule.

When learning changes the understanding, revise or consolidate the relevant passage and retain its reasons, limits, and useful opposing examples. Link the knowledge to supporting feedback/source evidence rather than copying the incident narrative. A new or updated feedback record can link to the passage it changed. Keep these ordinary Markdown links and native source pointers, not a second registry or mandatory bidirectional-link protocol. No-change outcomes do not require creating another knowledge entry.

Return only the task-relevant correction, what knowledge/records changed or why none changed, and any consequential question or core-instruction proposal. Do not return raw history or a research diary. Update the optional context-separation reference so ordinary background learning does not require offering a branch first; retain user-directed separation options for a substantial process discussion.

A subsequent Advocate consultation reads the relevant current reference files. A retained Advocate needs to reread affected files after an update rather than assume its old context changed. No watcher, cache invalidation protocol, or history injection is needed.

### 4. Generalized intent-led evaluation and routing lessons

Extend existing `skills/prompting/SKILL.md` with a concise entry to proposed `references/intent-evaluation.md`, following [evaluation-design.md](evaluation-design.md). General diagnosis belongs there, not in duplicated Advocate-specific instructions or a new writer subtype. `agent-process` directs its writer to use the general procedure when an instruction or model-fit question warrants comparison.

The procedure preserves intent, chooses revealing cases and relevant contrasts, diagnoses the actual failure, compares a targeted candidate with the current approach, and records the result and its limits. It allows no change, inconclusive results, and direct correction of obvious defects. It does not require an experiment before every knowledge update, prescribe a universal sample count, or turn favorable evaluation into permission to change core instructions.

Keep routing observations conditional on the job, available inputs, actual model/effort, and instruction state. Record useful conclusions in the existing curated knowledge and make its reader path available to Strategist through explicit `agent-process` skill selection and a concise role-level pointer. Do not embed every finding in the always-loaded catalog or change model defaults automatically. Start with evidence-backed heuristics and uncertainty; numerical Bayesian estimates remain a possible later analysis when comparable outcomes support them, not an implementation task.

Run the bounded local feedback-to-advice comparison in T4a. It demonstrates the integrated learning path and yields initial outcome evidence, not proof of general improvement. No concurrency subsystem is required: address a real collision through ordinary current-file inspection and reconciliation if one occurs. This does not change the normal implementation worktree contract.

## Execution guidance after approval

Create or resume the dedicated task worktree, record its actual coordinates and target, and preserve unrelated work. Planning alone authorizes none of these mutations.

Before delegating implementation-plan work, consult Strategist unless Mike explicitly requests a single-agent handoff, including a Team Lead. A Team Lead still follows its own Strategist-first workflow. Assign at most one named plan task per subagent and split further when needed. Use only the active role catalog; the proposed Advocate is not available for dispatch until installed and loaded. Strategist owns execution staffing, not this plan.

After approval fixes the package contract, T0, T1, T2, and T3 may proceed concurrently with disjoint ownership. They consume the paths and behavior above, not one another's completed implementation. T4 integrates their results and validates actual discovery/assembly; T4a then exercises the learning-to-advice path. Transfer ownership explicitly if a task-related fix touches another worker's files.

Continue independent work around blockers. Adapt routine mechanisms within settled intent; ask before changing scope, consequential behavior, permissions, or acceptance. Do not expand the specified evaluation procedure and exercise into a review pipeline, broad audit, optional safeguards, or permanent evaluation platform. Fix demonstrated task-related defects and stop when the agreed finite checks pass. Keep task evidence and blocked/pending states accurate.

## Tasks

These tasks describe the recommended package. They are not executable until the draft decisions and execution authorization are resolved.

- [ ] **T0: Add generalized intent-led evaluation guidance to prompting**
  - Depends on: plan approval and execution authorization; no implementation-task dependency.
  - Parallel with: T1, T2, and T3. Those tasks consume the contract in this plan rather than waiting for unrelated authoring.
  - Write ownership: `skills/prompting/SKILL.md` and proposed `skills/prompting/references/intent-evaluation.md` under the default profile.
  - Change: distill the general procedure from `evaluation-design.md`, preserving intent separately from wording, diagnosis before intervention, revealing contrasting cases, observable outcome comparison, and honest causal/uncertainty limits. Keep routing inference applicable to prompt writers without making prompting a dispatcher. Link rather than duplicate agent-process feedback handling or Pi composition guidance. Do not create a new role or automatic evaluator.
  - Verify: inspect the full revised prompting skill and reference against the existing composition procedure; confirm obvious corrections and no-change outcomes do not require an experiment. Check reference links. T4 owns integrated discovery tests.
  - Done when: writer can use one discoverable general procedure for instruction improvement without another framework, mandatory score, or approval gate.
  - Evidence: Not started.

- [ ] **T1: Seed shared decision knowledge under agent-process**
  - Depends on: plan approval and execution authorization; no implementation-task dependency.
  - Parallel with: T2 and T3, using the shared paths above.
  - Write ownership: new `skills/agent-process/references/knowledge/` under the default profile only. T3 owns the existing skill entry point.
  - Change: write the small index and concise topic references from `notes.md`. Preserve current clarifications, instruction intent, important opposing precedents, chronology, source pointers, and evidence limits. Include supported conditional routing lessons where the existing evidence warrants them, without inventing measured model comparisons. Distinguish current understanding from superseded advice and link evidence without duplicating incident narratives or migrating the existing logs. Keep the archived research out of ordinary prompt loading.
  - Verify: inspect index/topic/evidence navigation and the seeded advice against the named current clarifications and representative contrasts. Confirm reference paths resolve from the owning skill independently of the task cwd. No broad history rescan or exact-prose snapshot tests.
  - Done when: relevant knowledge is findable without loading the research document; its content preserves the agreed distinctions and contains no new authority claims or runtime dependency on temporary paths.
  - Evidence: Not started.

- [ ] **T2: Register the advisory role and on-demand routing**
  - Depends on: approval of the role, tools/default, and Team Lead availability; consumes the `agent-process` reader/index contract, not T1's finished contents or T3's completed procedure.
  - Parallel with: T1 and T3.
  - Write ownership: new `agents/advocate.md`, existing `agents/teamlead.md`, `agents/strategist.md`, and `lib/subagents/guidance.ts` under the default profile.
  - Change: implement the proposed role, explicit skills, delegate permission, and concise shared routing. Give Strategist explicit `agent-process` skill discovery and a pointer to relevant routing knowledge through the reader path, without changing its tool/delegate authority or model defaults. Reuse generic loader/launch behavior. Keep Reviewer, Strategist, Steward, Council, and ordinary child responsibilities unchanged.
  - Verify: load bundled definitions and render caller, Team Lead, and Advocate compositions. Inspect effective tools/delegates and confirm no knowledge body is injected by the generated catalog. Do not alter general transport/lifecycle behavior absent a demonstrated required correction.
  - Done when: the definition resolves, authorized callers can discover it, and complete affected instructions express advisory rather than approval authority. Full skill-backed integration is verified in T4.
  - Evidence: Not started.

- [ ] **T3: Move feedback investigation and learning into the background writer**
  - Depends on: approval of the writer workflow and write boundary; consumes the agreed reference locations, not T1's finished seed or T2's role.
  - Parallel with: T1 and T2.
  - Write ownership: `skills/agent-process/SKILL.md`, proposed `references/learning-worker.md`, and existing `references/context-separation.md`. Do not rewrite historical logs merely to install the workflow.
  - Change: distinguish knowledge-reader, invoking-orchestrator, and learning-worker responsibilities within the existing skill. Link the reader to the shared index without triggering maintenance. Link general diagnosis/evaluation to prompting's proposed `references/intent-evaluation.md`, rather than duplicating that procedure. Preserve user intent and useful outcome evidence in the existing records/references. Preserve feedback triggers, immediate correction, selective retrieval, valid no-change outcomes, and specific approval for core changes. State concrete allowed maintenance paths and teach updating/consolidating existing knowledge with evidence links rather than accumulating duplicate lessons. Keep feedback-record authoring with the worker. Preserve explicit process-discussion separation options without making them a dispatch prerequisite.
  - Verify: read the complete Advocate-facing reader path, orchestrator-facing skill, and writer-facing instructions together. Walk through an existing-guidance/non-adherence case, a clear correction revising an existing passage, and a consequential core-policy proposal. Check for accidental learning during consultation, recursive delegation, blanket permission to edit instructions, unnecessary operator prompts, or a requirement to wait for background research before continuing independent work.
  - Done when: one writer can investigate, decide, and perform permitted maintenance with no second review stage, while the parent keeps current-task authority and receives a concise result.
  - Evidence: Not started.

- [ ] **T4: Verify resource wiring and finish owning documentation**
  - Depends on: T0's generalized procedure, T1's installed knowledge, T2's role/routing, and T3's learning workflow.
  - Write ownership: focused tests listed below, `pi/README.md`, `pi/profiles/default/docs/subagents.md`, root `CHANGELOG.md`, and task evidence in this plan. Coordinate any source corrections with the previous file owners.
  - Change: document the role, normal consultation, background maintenance boundary, and reload/read freshness behavior. Record the rationale and preserved responsibilities in the changelog without reproducing the full knowledge. Add bounded tests of actual definition/skill loading, launch composition, and catalog/tool authority using current helpers.
  - Test design: extend `subagent-definitions.test.ts`, `subagent-guidance.test.ts`, `subagent-skills.test.ts`, and `subagent-launch-prompt.test.ts` where the behavior belongs; add proposed `agent-process-knowledge.test.ts` for existing-skill discovery and shared reference resolution if useful. Preserve `prompting-skill.test.ts` integration. Assert contracts and visibility, not sentences, historical opinions, or exact prompt snapshots. Update superseded wording expectations directly and explain; do not restore stale prose to appease a test.
  - Verify: the finite checks and composition review below. Record actual date, profile/path, source revision, result, and limitations. A smoke check cannot establish sustained advisory quality.
  - Done when: agreed checks pass, task-related defects are resolved, knowledge is selectively discoverable, and docs accurately distinguish installation from behavioral effectiveness.
  - Evidence: Not started.

- [ ] **T4a: Exercise feedback-to-knowledge-to-advice behavior**
  - Depends on: T4's verified resource wiring and passing source checks.
  - Write ownership: task-local disposable knowledge/case artifacts and a concise results note in this spec; no live knowledge changes or production actions during the exercise.
  - Change: follow the initial exercise in `evaluation-design.md`. Select a recorded correction and meaningful contrasting case. Run the learning worker against a disposable prior-knowledge copy, verify the saved change, and compare fresh Advocate consultations with before/after knowledge on equivalent inputs. Use the actual updated role/skill composition and existing child-launch mechanisms, not a bare-model simulation claimed as equivalent. Do not relink production profile resources to the disposable worktree. Ensure each trial is reading its assigned copy rather than the canonical live store.
  - Verify: record actual profile/resource paths, model/provider/effort, candidate state, native run pointers, observed edits/advice, and limits. Keep expected answers out of the acting agent's input. Confirm the contrast survives rather than judging only whether fewer questions or fewer words were produced. No model sweep or new permanent harness.
  - Done when: the integrated path has been exercised, task-related wiring defects are fixed, and the comparison's supported conclusion is recorded. No improvement or inconclusive quality evidence is a valid result, not a reason for endless candidate generation. If runtime prerequisites prevent a run, record the concrete blocker instead of claiming offline checks proved the behavior.
  - Evidence: Not started.

- [ ] **T5: Archive and commit the authorized implementation**
  - Depends on: T4's passing agreed checks, T4a's completed bounded exercise, and completed implementation; later execution authorization.
  - Change: update evidence, confirm no archive collision, move the entire spec including `notes.md` to `.specs/archive/advocate-agent/` in the task worktree, repair affected links, and commit the implementation plus archive. Keep integration pending until actually delivered.
  - Verify: the task commit contains only intended changes and the complete archived spec; source research and unrelated work are preserved.
  - Done when: task branch committed and the closeout manifest names its exact commit, archived plan, target checkout/branch, and task worktree.
  - Evidence: Not started.

- [ ] **T6: Integrate locally and clean up**
  - Depends on: T5's committed task and closeout manifest; authorized execution without `--no-merge`.
  - Change: orchestrator dispatches Integrator from the recorded target checkout. Integrator owns local merge, completion metadata, and clean task-worktree removal under its existing skill. No push or deployment.
  - Done when: changes are integrated on the recorded target, actual completion metadata committed, and cleanup verified. Under `--no-merge`, leave this unchecked and report intentional retained-worktree state instead.
  - Evidence: Not started.

## Validation and current handoff

### Recommended finite agent-owned checks

Once approved, run from `pi/profiles/default/` in the task worktree:

```sh
pnpm test subagent-definitions.test.ts subagent-guidance.test.ts subagent-skills.test.ts subagent-launch-prompt.test.ts prompting-skill.test.ts agent-process-knowledge.test.ts
pnpm run typecheck
pnpm run check:runtime
```

If the new discovery tests are placed in an existing file instead, remove the unused filter; do not create a file solely to satisfy a command. Run the selected existing tests before changes to identify the relevant baseline. Run completion checks after their inputs are integrated; rerun only affected checks after corrections. No dependency installation is planned unless required; use the documented frozen pnpm/default-profile link setup if missing links prevent execution.

Additionally, review the complete affected compositions once using real loaded definitions and native skill discovery, not just edited excerpts:

- Orchestrator: existing inherited prompt plus generated guidance/catalog and the existing `agent-process` skill's discovery description. No second knowledge skill or historical knowledge body added to always-loaded instructions.
- Advocate: native/context instructions, frozen tool ceiling, role text, explicitly selected skill catalog, then the `agent-process` reader path and relevant shared references. Loading these does not initiate feedback maintenance. Current goal and evidence remain assignment-specific.
- Writer: unchanged generic role and tools, explicit skill selection, worker instructions and permitted paths, and feedback-specific assignment. It must not be told to launch another worker.
- Team Lead: existing workflow plus Advocate availability and concise guidance, without duplicated knowledge or a new mandatory review stage.

Record dynamic sections that were not captured, compare before/after composed byte counts, and retain deterministic ordering. Adjust existing size ceilings only to accommodate the justified new routing/catalog content, rather than deleting their protection or inventing a quota on useful knowledge. Do not claim provider cache improvements from static size comparisons.

Use the three T3 walkthroughs to check the decision boundaries and a paired T1 precedent to inspect that Advocate's instructions permit contextual rather than slogan-based advice. These are source/composition checks, not claims that a model followed them. T4a adds one bounded agent-owned behavioral exercise with recorded before/after evidence. It is not a benchmark pass-rate target or a requirement to prove universal improvement.

**Verification limits:** the T4a result covers only its actual cases and configuration. Future reduction in interruption burden, sustained learning effectiveness, optimal model routing, and attached-client behavior remain unestablished. Later operator use is useful feedback, not an acceptance gate or reason to delay archival/integration after agreed agent-owned work is complete. No new permanent live evaluation harness or required operator testing is part of this package.

### Current state

- Status: draft; shared knowledge, generalized intent-led evaluation, routing evidence, and concurrency deferral are documented. Remaining implementation recommendations await plan approval. Implementation is not authorized.
- Completed: historical research, targeted external research, source-grounded plan authoring, and requested design documentation in `evaluation-design.md`. No active skill or role changes.
- Planning inspection: September 26, default profile at the path above; read owning code, skills, current feedback, installed skill/configuration docs, and relevant existing tests. No implementation tests or new role/model runs performed while planning.
- Settled revision: preserve existing feedback logs as evidence; add curated Markdown knowledge under `agent-process/references/knowledge/`; keep governing instructions outside standing maintenance authority. Advocate consumes this source without launching a learning cycle. No separate knowledge skill or wholesale log migration.
- Remaining recommendations for Mike's plan review: Sol-low read-only Advocate, orchestrator/Team Lead on-demand availability, and the existing writer for background maintenance. These were not changed by the knowledge-structure revision.
- Latest direction: prompting owns general instruction evaluation; preserve intent and outcome evidence beyond prompt versions; use supported results for conditional routing guidance. Concurrent learning-writer coordination is deferred and does not block implementation. The bounded agent-owned exercise replaces the earlier offline-only validation proposal.
- Next: review the revised plan. After approval and execution authorization, record worktree/branch and begin T0–T3 with Strategist-guided staffing.
- No research worker, schedule, external service, or historical retrieval is blocking this plan.

## Closeout contract

After authorized implementation and the agreed checks, archive the entire spec and commit it with task changes as T5 describes. Do not archive unfinished implementation. Preserve the source checkout's uncommitted task content while carrying it into the worktree; reconcile it during authorized integration rather than discarding it prematurely.

For authorized `/do-it`, dispatch Integrator from the recorded target after the task commit. Supply repository root, target checkout/branch, task worktree/branch/commit, archived plan path, spec stub, completed-check evidence, and `noMerge` state through the existing closeout handoff. The Integrator records actual completion metadata and cleans up; the orchestrator owns user questions and final reporting. With `--no-merge`, skip mutating Integrator dispatch and retain the committed worktree intentionally. Push and deployment require separate explicit permission.

If integration or cleanup is incomplete, leave its checkbox unchecked and record the specific blocker, next action, and action owner. Routine merge conflicts remain agent-owned. Pending operator manual testing does not block closeout.

Final execution response begins with one explicit outcome:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED** or **NOT COMPLETE: USER INPUT REQUIRED**: give the reason and exact action needed first, naming who must act.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: committed implementation and intentional retained worktree under `--no-merge`.
- 🟡 **CLEANUP PENDING**: integrated with completion metadata, but cleanup remains; name the remnant and next action.

Then report concise checks, spec location, branch/commits, merge result, and remaining worktree state. Do not present passing checks as completed delivery when integration remains blocked.
