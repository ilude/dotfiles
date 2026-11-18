---
created: 2026-11-06
status: draft
completed: null
---

# Consolidated agent-stack integration

## Goal and authorization

User request: review recent research-vault commits and existing related research,
discuss how the components fit together, and create a consolidated plan.

The intended result is one coherent division of responsibility and a bounded first
useful integration, not implementation of every idea in the research vault.

Settled user direction:
- Retain the discussion and video references for future work.
- Establish usable remote Pi capability, with that investigation already split
  into its own Herdr tab.
- Use the existing homelab-infra project to discover infrastructure facts rather
  than asking the operator to reconstruct known inventory.

Planning permits this spec and research documentation only. No implementation,
installation, paid inference, deployment, infrastructure mutation, Git commit or
push is authorized by this request. Draft recommendations below are not approved
requirements. Do not invoke `/do-it` while this plan remains draft.

After scope is settled and the plan is marked ready, `/do-it` authorizes selected
implementation, dedicated task worktrees, local commits and integration unless
`--no-merge` or another restriction is explicit. Push and deployment remain
separately authorized. Do not turn live deployment into a second local-Git approval.

## Fresh-context handoff

Ownership note after the accepted Hatchery transition: this draft's dated
starting-state/ownership snapshots are historical. Use current root guidance,
Hatchery and private homelab-config for live site facts; homelab-infra is retired.
This reference repair does not authorize or revise this draft's proposed work.

Paths are relative to `C:/Users/mglenn/.dotfiles` unless another repository is named.
Read current applicable `AGENTS.md` files before acting.

Required evidence:
- [Research synthesis and source map](../../docs/research/obsidian-vault/agent-workflows/projects/agent-stack-integration.md).
- [Onclave product](../../modules/onclave/README.md) and
  [current deployment ownership](../../modules/onclave/deploy/app/onclave/README.md#production-ownership).
- Historical `homelab-infra/docs/hermes-operator-pilot-prd.md` in the retired
  repository: requirements evidence, not an active module dependency or proof
  of implemented operator actions.
- [Existing Jev spec](../jev-workflow-experiments/plan.md): T1/T2 delivered;
  T3 and live experiments explicitly deferred.
- [Existing remote-platform PRD](../remote-agent-platform/PRD.md): draft with
  proposed ownership that predates current Hatchery boundaries.
- Onboard `AGENTS.md`, README, `app/models/feed.py`, `feed_article.py`,
  `feed_cache.py` in `C:/Projects/Personal/onboard` if curation is selected.

### Verified starting state, 2026-11-06 UTC

- Planning profile: default, session `01a16436-7d63-73dd-8d73-acae2f6f5c85`.
  Linked Pi runtime package is `1.5.0`. Earlier chat observations of 1.2.0 are stale.
- Dotfiles baseline: `main`, `ac12dbe1`. Intended Pi execution profile is default;
  legacy is excluded. No runtime behavior was tested by reading package metadata.
- Onclave checkout is attached to/tracking `origin/feature/v2-broker-core`.
  Do not switch that checkout to another branch.
- Onclave implements protocol-v3 communication, vault jobs and recovery, and Pi
  service callbacks. Hermes adapter and webhook ingress are not implemented.
- Existing Onclave jobs persist in PostgreSQL and vault objects in object storage.
  Neither a new generic worker product nor a Pi Durable integration was established.
- Hatchery checkout is empty. Its product APIs cannot be assumed from the separate
  one-VM Alchemy experiment. Do not initialize it as incidental planning work.
- Onboard is at `4a73fe1` with substantial existing uncommitted application/test
  work, including feed/cache/model/factory changes. Preserve it. Processor hooks
  run on cached as well as newly downloaded articles.
- No live infrastructure, Hermes job, Jev request or remote continuity check was
  performed in this planning pass.

### Work to preserve and integration target

- Existing modified vault `agent-workflows/README.md` and `index.md`, and untracked
  `workflow-ideas/herdr-agent-sidebar-layout.md`, belong to pre-existing work.
  This planning pass adds only its own links to the two entry files.
- Preserve Onboard's existing changes; do not treat them as implementation of this
  plan. Reinspect the diff before assigning overlapping files.
- Existing remote-readiness work belongs to the independent tab. Its live outcome
  is unknown here and is not a blocking dependency of unrelated curation work.
- Proposed originating target: `C:/Users/mglenn/.dotfiles`, branch `main`.
  No task worktree or execution branch has been created. Record actual coordinates
  at execution; identify each selected module/application target independently.

## Consolidated responsibility map (2026-11-06 snapshot)

| Surface | Owner / purpose | Boundary to preserve |
| --- | --- | --- |
| Interactive coding | Pi + Herdr, dotfiles integration | Native owned subagents; same-server independent sessions via Herdr. Remote disconnect persistence is not automatic crash recovery. |
| Assistant routines | Hermes, deployed by homelab-infra | Memory, scheduling and messaging where supported by the actual deployed version. Do not grant infrastructure mutation merely through conversation. |
| Communication and research | Onclave product | Existing signed APIs, vault and callbacks. Do not use peer messaging as autonomous worker distribution or invent a delivered Hermes adapter. |
| Advisory classification | Jev | Typed answers/probabilities, not factual guarantees, explanations or action permission. Reuse the existing client where its owning runtime fits. |
| Information display | Onboard | Cached presentation, ordinary feeds remain usable without classification. No paid inference from page rendering or repeated cache reads. |
| Optional durable agent app | Pi Durable | A specific application's checkpoints/state, not replacement of Herdr, Hermes or existing vault-job recovery. |
| Disposable compute | Hatchery product | Product/configuration/provider contracts must be read before integration. Scratch Alchemy ownership does not transfer existing resources. |
| Site and deployment | homelab-infra, BWS, native infrastructure tooling | Live inventory/secrets stay in BWS; existing resources retain their current owners. Onclave publishes images; infrastructure owns production deployment. |

This map combines current ownership rules with proposed uses. Proposed behavior
must be selected below before it becomes implementation scope.

## Recommended sequence and consequential decision

### Decision 1: first delivery, awaiting operator selection

**Recommendation: public-news relevance and a curated shortlist displayed in
Onboard.** It gives Jev and proactive automation a concrete useful outcome without
first building a remote platform, changing the host OS, or adopting a second
workflow engine. Continue remote readiness independently.

Alternative: first implement a Hermes-to-Onclave integration so the assistant can
use existing research/analysis services; defer Onboard curation until that seam is
useful. This establishes reusable access first but adds no news-facing result by
itself.

Broader platform-first work would require choosing environment/configuration
ownership and recovering Hatchery source before an executable design. It is not
required to make either application workflow useful.

**Exact question:** Should the first executable delivery be the recommended
Onboard news-curation workflow, or the reusable Hermes-to-Onclave integration?
A different first outcome is valid; do not silently select one.

After that answer, investigate routine implementation details and resolve only
remaining behavior-changing choices, including the data/model-call scope if live
classification is wanted. Keep status draft until the selected scope is executable.

### Recommended first-delivery contract, not yet approved

If curation is selected:
- Use a bounded set of public feeds and an explicit operator-interest rubric.
- Rank relevance and categorize; keep source links and uncertain/unclassified items.
  Do not delete news or label generated judgments as verified facts.
- Prefer a standard RSS/Atom shortlist that Onboard already understands if it meets
  the requested experience. Per-article badges require a separate projection.
- Generate results outside request rendering/cache-read processors. Store enough
  article identity/content and rubric/model version to reuse unchanged results.
- Jev provides no generated rationale. Use deterministic rubric/evidence text or
  an explicitly selected separate generation step for explanations.
- Prefer the existing Hermes scheduler if the installed version and supported
  tools fit. A small application worker is an alternative, not an automatic
  requirement to deploy Pi Durable.
- Use Onclave analysis/retrieval only where needed. Do not force all feed entries
  through vault ingestion just to include Onclave in the diagram.
- Keep execution status with the producer and display/retrieval with consumers.
  Do not build a universal shared task database or treat message receipts as success.

If Hermes-to-Onclave is selected, replace the curation candidates below with
bounded product adapter, exposure, deployment and read/analysis-flow tasks, using
current protocol-v3 and service contracts. Do not implement both alternatives by
assuming agreement.

## Proposed task decomposition for the curation option

These checkboxes describe a candidate delivery, not permission to execute. Exact
file ownership, selected scheduler, interchange format and finite commands must
be completed during planning after Decision 1. The next action is discussion,
not T1 implementation.

- [ ] **T1: Establish the curation input and output contract**
  - Depends on: selection of curation scope and requested display behavior.
  - Inputs: Onboard feed models; actual Hermes scheduling interfaces; existing Jev
    client. Relevant product source, not sample-video command syntax, determines APIs.
  - Change: define the selected public inputs/rubric, item identity, classification
    result/provenance and the smallest output format. Locate producer code in its
    application owner; infrastructure owns deployment only.
  - Verify: one representative source item maps to the proposed output and can be
    rendered by the selected existing Onboard path without inference.
  - Done when: producer and consumer have a concrete agreed interface and write
    ownership. Do not create a generic schema registry or runtime framework.
  - Evidence: Not started; scope unselected.

- [ ] **T2: Produce and retain advisory curation results**
  - Depends on: T1's interface and selected data/model-call boundaries.
  - Change: implement one producer using current supported clients, preserve source
    identity and uncertainty, and reuse unchanged classifications. Keep external
    service failures distinct from valid low-confidence results.
  - Verify: focused tests for mapping typed answers, unchanged-input reuse and
    unavailable-service behavior through the producer's actual boundary. Use
    synthetic/public fixtures; live paid requests only if selected explicitly.
  - Done when: a finite batch produces the chosen output with inspectable source
    and model/rubric provenance, without fabricated explanations.
  - Evidence: Not started.

- [ ] **T3: Display the shortlist in Onboard**
  - Depends on: T1's output contract; may proceed alongside T2 against fixtures.
  - Change: consume the chosen feed/projection using existing widget patterns;
    add application code only if ordinary feed support is insufficient.
  - Verify: focused existing Onboard feed/template tests where behavior changes;
    confirm no inference occurs while rendering or reading the cache. Preserve
    unrelated dirty Onboard changes and do not commit runtime feed configuration.
  - Done when: fixture results appear in the requested view and normal feeds still
    work when curation is absent.
  - Evidence: Not started.

- [ ] **T4: Schedule the producer and expose its result through selected interfaces**
  - Depends on: T2's producer and the scheduler/interface choice settled in planning.
  - Change: connect the producer to one existing scheduling mechanism. Add an
    Onclave adapter only if the selected workflow actually consumes its services.
    Put app code in its owner, BWS/deployment integration in homelab-infra.
  - Verify: bounded execution and result handoff through the selected boundary;
    assert an accepted request is not reported as completed. Do not introduce
    general webhook ingress, infrastructure remediation or a second scheduler.
  - Done when: source supports the selected recurring workflow and outcome reporting.
    Production deployment remains separately authorized; do not claim a live run
    from fixture-only evidence.
  - Evidence: Not started.

- [ ] **T5: Deliver the selected scope and close out**
  - Depends on: T2-T4 selected implementation and finite checks.
  - Change: update only affected operator docs/changelogs and task evidence;
    archive and integrate as specified below. Module commits precede parent gitlinks.
  - Done when: selected implementation, checks and authorized local integration
    are complete, with exact deployment/verification limits reported.
  - Evidence: Not started.

## Independent and deferred proposals

Not dependencies or acceptance criteria of the recommended first delivery:
- Remote Herdr/Pi readiness, already in its own tab.
- Native Herdr sidebar hierarchy and its independent blocked draft.
- Read-only on-call triage, followed only by separately chosen remediation scope.
- A Pi Durable application if a concrete selected workflow needs checkpointed
  execution, persisted waits or multi-client application state.
- Hatchery/Alchemy or homelab-OS experiments. No OS/runtime has been selected.
- CLIProxyAPI subscription/auth pooling, terms evaluation and routing experiments.
- Windmill, a generic durable DAG engine, cross-session memory compilation or a
  replacement configuration/control plane.

The old remote-platform PRD's Onclave-owned environment/private-configuration
proposal overlaps current Hatchery/BWS boundaries. Resolve it explicitly if that
track is selected; do not rewrite the old PRD or migrate live configuration as a
side effect of this plan.

## Execution guidance and closeout

When ready, use the recorded task worktree and originating integration target;
consume matching runtime-prepared coordinates without making another worktree.
Consult Strategist before delegation unless the user explicitly requests a
single-agent handoff, including a Team Lead. Team Leads retain Strategist-first
coordination. Assign at most one named task per subagent and preserve disjoint
write ownership. Integrate an interface prerequisite before dependent work.

Continue independent tasks around blockers. Adapt equivalent mechanisms within
settled intent; ask before changing scope, behavior, data sharing, safeguards or
acceptance. Do not revive deferred work or add extra audit/test phases.

After selected implementation and finite agent-owned checks pass, archive the
whole spec to `.specs/archive/agent-stack-integration/` after checking for an
existing destination; commit implementation and archive together. Keep integration
pending until delivered. For authorized `/do-it`, dispatch Integrator from the
recorded target after task commits. Prepared Herdr runs use the same-tab successor:
establish readiness, finish authorized orchestrator-only work, release the exact
origin for graceful retirement, then successor performs cleanup and final reporting.
Ordinary direct/run-here execution retains parent-owned communication. Preserve an
explicit `--no-merge`, retaining the committed worktree without mutating integration.

Integrator records completion metadata, commits it and removes only the clean task
worktree. Routine conflicts are agent-owned; blocked integration retains work and
states the specific issue, next action and owner. Keep unfinished integration and
cleanup unchecked. Operator manual/live testing is a non-blocking verification
limit, not an extra closeout gate. Deployment and push still require authorization.

Final execution report starts with explicit overall outcome: 🟢 COMPLETED;
🔴 NOT COMPLETE: MERGE BLOCKED or USER INPUT REQUIRED; 🔵 IMPLEMENTED: MERGE SKIPPED
AS REQUESTED; or 🟡 CLEANUP PENDING. For blocked outcomes foreground reason, owner
and next action before passed checks; include checks, commits, integration and
retained paths. Never claim whole-plan completion from passing tests alone.

## Current handoff

- Status: **draft, first-delivery selection required**.
- Completed planning: recent Git-vault change review, related research synthesis,
  current component-contract map, video/source references and evidence limits.
- Next action/owner: operator selects the first outcome; orchestrator then finishes
  its executable design and finite checks. No implementation has started.
- Open decision: Decision 1 above. Later behavior choices are conditional on it,
  not a request for the operator to research discoverable APIs or inventory.
- Verification limits: no live integrations tested; Hatchery source unavailable;
  current deployed Hermes features not established; remote-readiness results remain
  with their independent owner.
- [ ] Selected implementation and agreed checks complete.
- [ ] Whole spec archived and task changes committed.
- [ ] Authorized integration and completion metadata committed.
- [ ] Task worktree cleanup verified, or intentional no-merge retention recorded.
